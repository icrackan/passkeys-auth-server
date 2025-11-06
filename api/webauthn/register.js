const admin = require('firebase-admin');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');

const rpID = process.env.RP_ID || 'annv.auth';
const expectedOrigins = [
  `https://${rpID}`,
  "android:apk-key-hash:H8aaJx3lOZCaxVnsZU5__ALkVjXJALA11rtegEE0Ldc"
];

function initFirebase() {
  if (admin.apps.length) return;
  const svcBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcBase64) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  const svcJson = JSON.parse(Buffer.from(svcBase64, 'base64').toString('utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(svcJson),
    databaseURL: process.env.FIREBASE_DATABASE_URL
  });
}

// Helper to get user from database
async function getUserByUsername(username) {
  const snapshot = await admin.database().ref(`/users/${username}`).once('value');
  return snapshot.val();
}

// Helper to add user to database
async function addUser(username, data) {
  await admin.database().ref(`/users/${username}`).set(data);
}

// Helper to add user credential
async function addUserCredential(username, credential) {
  const userRef = admin.database().ref(`/users/${username}/credentials`);
  await userRef.push(credential);
}

module.exports = async (req, res) => {
  try {
    // Initialize Firebase
    initFirebase();

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', expectedOrigins);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }

    // Handle POST request for registration
    if (req.method === 'POST') {
      const { username, displayName } = req.body;

      if (!username || !displayName) {
        return res.status(400).json({ error: 'Missing username or displayName' });
      }

      // Check if user exists
      const existingUser = await getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Generate registration options
      const options = generateRegistrationOptions({
        rpName: 'WebAuthn Demo',
        rpID,
        userID: username,
        userName: username,
        userDisplayName: displayName,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        }
      });

      // Store challenge in database for verification
      await addUser(username, {
        id: username,
        username,
        displayName,
        currentChallenge: options.challenge,
        credentials: []
      });

      return res.json(options);
    }

    // Handle POST request for verification
    if (req.method === 'POST' && req.url.endsWith('/verify')) {
      const { username, credential } = req.body;

      if (!username || !credential) {
        return res.status(400).json({ error: 'Missing username or credential' });
      }

      // Get user and verify they exist
      const user = await getUserByUsername(username);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: credential,
          expectedChallenge: user.currentChallenge,
          expectedOrigin: expectedOrigins,
          expectedRPID: rpID,
        });
      } catch (error) {
        console.error(error);
        return res.status(400).json({ error: 'Invalid credential' });
      }

      const { verified, registrationInfo } = verification;

      if (verified && registrationInfo) {
        const { credentialPublicKey, credentialID, counter } = registrationInfo;

        // Save the credential
        const newCredential = {
          publicKey: credentialPublicKey.toString('base64'),
          credentialID: credentialID.toString('base64'),
          counter,
          transports: credential.transports || []
        };

        await addUserCredential(username, newCredential);

        return res.json({ verified: true });
      }
    }

    // If we get here, method not supported
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};