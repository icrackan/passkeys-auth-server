import * as admin from 'firebase-admin';

export async function initFirebase(): Promise<void> {
  try {
    if (admin.apps && admin.apps.length) {
      // already initialized
      return;
    }

    const svcBase64 = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!svcBase64) {
      throw new Error('Missing FIREBASE_SERVICE_ACCOUNT env var');
    }

    let svcJson: any;
    try {
      const decoded = Buffer.from(svcBase64, 'base64').toString('utf8');
      svcJson = JSON.parse(decoded);
    } catch (err) {
      console.error('Failed to decode/parse FIREBASE_SERVICE_ACCOUNT:', err);
      throw err;
    }

    const databaseURL = process.env.FIREBASE_DATABASE_URL;
    admin.initializeApp({
      credential: admin.credential.cert(svcJson),
      databaseURL,
    });
    console.log('Firebase initialized in api/webauthn');
  } catch (err) {
    console.error('initFirebase error:', err);
    throw err;
  }
}
