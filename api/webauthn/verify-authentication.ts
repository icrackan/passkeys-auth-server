import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import { initFirebase } from './_firebase';
import { withSession } from './_middleware';

const db = require('../../functions/lib/simplewebauthn/database.js');
const session = require('../../functions/lib/simplewebauthn/session.js');

const RP_ID = process.env.RP_ID || 'passkey-auth-demo.vercel.app';
const expectedOrigin = [`https://${RP_ID}`];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body;

  try {
    await initFirebase();
    const sess = await session.getSession((req as any).session.id);
    if (!sess || !sess.expectedChallenge || !sess.signInUsername) {
      return res.status(400).json({ error: 'Call /generate-authentication-options' });
    }

    const user = await db.getUserByUsername(sess.signInUsername);
    if (!user) return res.status(400).json({ error: 'No such user' });

    let dbCredential: any | undefined;
    for (const cred of user.credentials || []) {
      if (cred.id === body.id) {
        dbCredential = cred;
        break;
      }
    }

    if (!dbCredential) {
      return res.status(400).json({ error: 'Authenticator is not registered with this site' });
    }

    const opts = {
      response: body,
      expectedChallenge: `${sess.expectedChallenge}`,
      expectedOrigin,
      expectedRPID: RP_ID,
      credential: dbCredential,
      requireUserVerification: false,
    } as any;

    let verification;
    try {
      verification = await verifyAuthenticationResponse(opts);
    } catch (error: any) {
      console.error('verifyAuthenticationResponse error:', error);
      return res.status(400).json({ error: error.message || String(error) });
    }

    const { verified, authenticationInfo } = verification as any;
    if (verified) {
      dbCredential.counter = authenticationInfo.newCounter;
      // persist updated counter
      await db.addUserCredential(user.id, dbCredential);
    }

    await session.updateSession((req as any).session.id, { expectedChallenge: null, signInUsername: null });

    return res.status(200).json({ verified });
  } catch (err: any) {
    console.error('verify-authentication error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}

// Wrap the handler with session middleware
export default withSession(handler);