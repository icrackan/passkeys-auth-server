import { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'crypto';
import {
  generateRegistrationOptions,
  GenerateRegistrationOptionsOpts,
} from '@simplewebauthn/server';

// Use compiled helpers from functions/lib
const db = require('../../functions/lib/simplewebauthn/database.js');
const { updateSession: setSession, getSession } = require('../../functions/lib/simplewebauthn/session.js');
import { initFirebase } from './_firebase';
import { withSession } from './_middleware';

const RP_ID = process.env.RP_ID || 'passkey-auth-demo.vercel.app';
const expectedOrigin = [`https://${RP_ID}`];

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');

  const username = (req.query.username as string) || undefined;
  if (!username) return res.status(400).json({ error: 'Please specify username as ?username=...' });

  try {
    await initFirebase();
    const user = await db.getUserByUsername(username);
    if (user) return res.status(400).json({ error: 'User with that username already exists' });

    // Generate a precreated user id and include it in the user object so options.user.id is defined
    const precreatedUserId = randomBytes(16).toString('hex');

    const opts: GenerateRegistrationOptionsOpts = {
      rpName: "Passkey Auth Demo",
      rpID: RP_ID,
      user: {
        id: precreatedUserId,
        name: username,
        displayName: username,
      } as any,
      timeout: 60000,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'preferred',
      },
      supportedAlgorithmIDs: [-7, -257],
    } as any;

    const options = await generateRegistrationOptions(opts);

    // Store challenge and other data in session (use same keys as original example)
    await setSession((req as any).session.id, {
      expectedChallenge: options.challenge,
      requestedUsername: username,
      precreatedUserId: options.user.id
    });

    console.log("updated sessionID="+req.session.id + " session=", await getSession(req.session.id));

    res.json(options);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
}

export default withSession(handler);