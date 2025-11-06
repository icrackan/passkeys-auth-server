import { VercelRequest, VercelResponse } from '@vercel/node';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { initFirebase } from './_firebase';
import { withSession } from './_middleware';

const db = require('../../functions/lib/simplewebauthn/database.js');
const session = require('../../functions/lib/simplewebauthn/session.js');

const RP_ID = process.env.RP_ID || 'passkey-auth-demo.vercel.app';
const expectedOrigin = [`https://${RP_ID}`];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const username = (req.query.username as string) || undefined;
  if (!username) return res.status(400).json({ error: 'Please specify user name' });

  try {
    await initFirebase();
    const user = await db.getUserByUsername(username);
    if (!user) return res.status(400).json({ error: 'No such user' });

    const opts = {
      timeout: 60000,
      allowCredentials: (user.credentials || []).map((cred: any) => ({
        id: cred.id,
        type: 'public-key',
        transports: cred.transports,
      })),
      userVerification: 'preferred',
      rpID: RP_ID,
    };

    const options = await generateAuthenticationOptions(opts as any);

    // Use session.id from express-session
    await session.updateSession((req as any).session.id, { 
      expectedChallenge: options.challenge, 
      signInUsername: username 
    });

    return res.status(200).json(options);
  } catch (err: any) {
    console.error('generate-authentication-options error:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
}

// Wrap the handler with session middleware
export default withSession(handler);