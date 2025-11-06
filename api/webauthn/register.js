const admin = require('firebase-admin');
const { generateRegistrationOptions, verifyRegistrationResponse } = require('@simplewebauthn/server');
const crypto = require('crypto');

const rpID = process.env.RP_ID || 'passkey-auth-demo.vercel.app';
const expectedOrigins = [
  `https://${rpID}`,
  "android:apk-key-hash:H8aaJx3lOZCaxVnsZU5__ALkVjXJALA11rtegEE0Ldc",
  "https://passkey-auth-demo.vercel.app"
];

function initFirebase() {
  if (admin.apps.length) {
    console.log('Firebase already initialized');
    return;
  }
  
  console.log('Starting Firebase initialization...');
  
  const svcBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svcBase64) {
    console.error('FIREBASE_SERVICE_ACCOUNT env var is missing');
    throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
  }
  console.log('Service account base64 found, length:', svcBase64.length);
  
  let svcJson;
  try {
    const decoded = Buffer.from(svcBase64, 'base64').toString('utf8');
    svcJson = JSON.parse(decoded);
    console.log('Service account decoded successfully. Project ID:', svcJson.project_id);
  } catch (error) {
    console.error('Failed to decode/parse service account:', error);
    throw error;
  }

  const dbUrl = process.env.FIREBASE_DATABASE_URL;
  console.log('Database URL:', dbUrl);
  
  try {
    admin.initializeApp({
      credential: admin.credential.cert(svcJson),
      databaseURL: dbUrl
    });
    console.log('Firebase initialized successfully');
  } catch (error) {
    console.error('Firebase initialization error:', error);
    throw error;
  }
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
    try {
      console.log('Initializing Firebase...');
      initFirebase();
      console.log('Firebase initialized successfully');
    } catch (error) {
      console.error('Firebase initialization error:', error);
      throw error;
    }

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
      console.log('Generating registration options...');
      console.log('rpID:', rpID);
      
      // Generate a random challenge as ArrayBuffer
      const challengeBuffer = new Uint8Array(32);
      crypto.randomFillSync(challengeBuffer);
      const challenge = challengeBuffer.buffer;
      
      const generationInput = {
        rpName: 'WebAuthn Demo',
        rpID,
        userID: username,
        userName: username,
        userDisplayName: displayName,
        attestationType: 'none',
        authenticatorSelection: {
          residentKey: 'required',
          userVerification: 'preferred',
        },
        timeout: 60000,
        excludeCredentials: [],
        challenge // Add our own challenge
      };
      
      console.log('Generation input:', JSON.stringify(generationInput, null, 2));
      
      try {
        const options = generateRegistrationOptions(generationInput);
        
        // Log raw options object
        console.log('Raw options:', JSON.stringify(options, null, 2));
        
        // Log specific fields
        console.log('Challenge present:', !!options.challenge);
        console.log('Challenge type:', typeof options.challenge);
        if (options.challenge) {
          console.log('Challenge length:', options.challenge.length);
          console.log('Challenge preview:', options.challenge.slice(0, 10));
        }
        
        if (!options.challenge) {
          throw new Error('Challenge not generated');
        }

        // Store user data
        await addUser(username, {
          username,
          displayName,
          currentChallenge: Buffer.from(challengeBuffer).toString('base64')
        });

        // Send options to client
        return res.json(options);
        
      } catch (error) {
        console.error('Error generating options:', error);
        return res.status(500).json({ error: error.message });
      }

      // Debug log options to help diagnose missing fields
      console.log('Registration options generated:', JSON.stringify(options, null, 2));
      console.log('Challenge present:', !!options.challenge);

      // Validate challenge before storing
      if (!options || !options.challenge) {
        console.error('Invalid options or missing challenge:', options);
        throw new Error('Registration options missing challenge');
      }

      const userToSave = {
        id: username,
        username,
        displayName,
        currentChallenge: options.challenge,
        credentials: []
      };
      
      console.log('Saving user data:', JSON.stringify(userToSave, null, 2));
      
      // Store challenge in database for verification
      await addUser(username, userToSave);

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