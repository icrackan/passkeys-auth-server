import { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import { initFirebase } from './_firebase';
import { withSession } from './_middleware';

const db = require('../../functions/lib/simplewebauthn/database.js');
const session = require('../../functions/lib/simplewebauthn/session.js');

const RP_ID = process.env.RP_ID || 'passkey-auth-demo.vercel.app';
const expectedOrigin = [`https://${RP_ID}`];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const body = req.body;
  console.log('verify-registration incoming body keys:', Object.keys(body || {}));
  console.log('verify-registration body.response keys:', body && body.response ? Object.keys(body.response) : body && body.response);

  try {
    await initFirebase();
    
    // Get data from session (req.session.id from express-session)
    const sess = await session.getSession((req as any).session.id);
    if (!sess || !sess.precreatedUserId || !sess.requestedUsername) {
      return res.status(400).json({ error: 'Failed to read session, did you call /generate-registration-options?' });
    }

    const opts = {
      response: body,
      expectedChallenge: `${sess.expectedChallenge}`,
      expectedOrigin,
      expectedRPID: RP_ID,
      requireUserVerification: false,
    } as any;

    let verification;
    try {
      verification = await verifyRegistrationResponse(opts);
    } catch (error: any) {
      console.error('verifyRegistrationResponse error:', error);
      return res.status(400).json({ error: error.message || String(error) });
    }

    const { verified, registrationInfo } = verification as any;
    if (verified && registrationInfo) {
      const { credential } = registrationInfo;
      const newCredential = {
        id: credential.id,
        publicKey: credential.publicKey,
        counter: credential.counter,
        transports: body.response.transports,
      };

      await db.addUser(sess.precreatedUserId, sess.requestedUsername);
      await db.addUserCredential(sess.precreatedUserId, newCredential);
    }

    await session.updateSession((req as any).session.id, { expectedChallenge: null, requestedUsername: null });

    return res.status(200).json({ verified });
  } catch (err: any) {
    console.error('verify-registration error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}

// Wrap the handler with session middleware
export default withSession(handler);