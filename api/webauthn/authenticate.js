const admin = require('firebase-admin');
const { generateAuthenticationOptions, verifyAuthenticationResponse } = require('@simplewebauthn/server');

const rpID = process.env.RP_ID || 'auth.tomcolvin.co.uk';
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

// Helper to update user's authentication challenge
async function updateUserChallenge(username, challenge) {
  await admin.database().ref(`/users/${username}/currentChallenge`).set(challenge);
}

// Helper to update credential counter
async function updateCredentialCounter(username, credentialId, counter) {
  const userRef = admin.database().ref(`/users/${username}/credentials`);
  const snapshot = await userRef.once('value');
  const credentials = snapshot.val() || {};
  
  // Find and update the specific credential
  for (const [key, cred] of Object.entries(credentials)) {
    if (cred.credentialID === credentialId) {
      await userRef.child(key).update({ counter });
      break;
    }
  }
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

    // Handle POST request for authentication
    if (req.method === 'POST') {
      const { username } = req.body;

      if (!username) {
        return res.status(400).json({ error: 'Missing username' });
      }

      // Get user and verify they exist
      const user = await getUserByUsername(username);
      if (!user) {
        return res.status(400).json({ error: 'User not found' });
      }

      // Get user's credentials
      const userCredentials = user.credentials || [];

      // Generate authentication options
      const options = generateAuthenticationOptions({
        rpID,
        allowCredentials: Object.values(userCredentials).map(cred => ({
          id: Buffer.from(cred.credentialID, 'base64'),
          type: 'public-key',
          transports: cred.transports || [],
        })),
        userVerification: 'preferred',
      });

      // Store challenge
      await updateUserChallenge(username, options.challenge);

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

      // Find the matching credential from user's credentials
      const userCredential = Object.values(user.credentials)
        .find(cred => cred.credentialID === credential.id);

      if (!userCredential) {
        return res.status(400).json({ error: 'Credential not found' });
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response: credential,
          expectedChallenge: user.currentChallenge,
          expectedOrigin: expectedOrigins,
          expectedRPID: rpID,
          authenticator: {
            credentialPublicKey: Buffer.from(userCredential.publicKey, 'base64'),
            credentialID: Buffer.from(userCredential.credentialID, 'base64'),
            counter: userCredential.counter,
          },
        });
      } catch (error) {
        console.error(error);
        return res.status(400).json({ error: 'Invalid credential' });
      }

      const { verified, authenticationInfo } = verification;

      if (verified) {
        // Update the credential's counter
        await updateCredentialCounter(
          username,
          credential.id,
          authenticationInfo.newCounter
        );

        return res.json({ verified: true });
      }

      return res.status(400).json({ error: 'Verification failed' });
    }

    // If we get here, method not supported
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
};