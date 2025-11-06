const fetch = require('node-fetch');

const BASE_URL = 'https://passkey-auth-demo.vercel.app/api/webauthn';
const TEST_USERNAME = 'testuser_' + Math.random().toString(36).substring(7);

async function testGenerateRegistrationOptions() {
    console.log('\n🔍 Testing generate-registration-options endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/generate-registration-options?username=${TEST_USERNAME}&displayName=Test User`);
        
        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (response.status === 200 && data.challenge) {
            console.log('✅ Registration options generated successfully');
            return data;
        } else {
            console.log('❌ Failed to generate registration options');
            return null;
        }
    } catch (error) {
        console.error('Error:', error);
        return null;
    }
}

// Mocking credential data since we can't create real credentials in Node.js
const mockCredentialData = {
    id: "mockCredentialId",
    rawId: "bW9ja0NyZWRlbnRpYWxJZA==", // base64 encoded "mockCredentialId"
    response: {
        clientDataJSON: "",
        attestationObject: "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVkBZ5YE6p3rJJD3Z8RWAHQwHc1XSFJ5fn8KhBZVh14oXqNqY2hhbGxlbmdlWCBjaGFsbGVuZ2U="
    },
    type: "public-key"
};

async function testVerifyRegistration(regOptions) {
    if (!regOptions || !regOptions.challenge) {
        console.log('❌ Cannot test verification without registration options');
        return;
    }

    console.log('\n🔍 Testing verify-registration endpoint...');
    try {
        // Create proper clientDataJSON with the actual challenge
        const clientData = {
            type: 'webauthn.create',
            challenge: Buffer.from(regOptions.challenge).toString('base64'),
            origin: 'https://passkey-auth-demo.vercel.app',
            crossOrigin: false
        };
        
        const mockResponse = {
            ...mockCredentialData,
            response: {
                ...mockCredentialData.response,
                clientDataJSON: Buffer.from(JSON.stringify(clientData)).toString('base64')
            },
            username: TEST_USERNAME
        };

        const response = await fetch(`${BASE_URL}/verify-registration`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify(mockResponse)
        });

        console.log('Status:', response.status);
        const data = await response.json();
        console.log('Response:', JSON.stringify(data, null, 2));

        if (response.status === 200) {
            console.log('✅ Registration verification completed');
        } else {
            console.log('❌ Registration verification failed');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

async function runTests() {
    console.log('🚀 Starting endpoint tests...');
    console.log(`Testing with username: ${TEST_USERNAME}`);
    
    // Test registration flow
    const regOptions = await testGenerateRegistrationOptions();
    if (regOptions) {
        await testVerifyRegistration(regOptions);
    }
}

runTests();
