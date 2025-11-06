const fetch = require('node-fetch');

const BASE_URL = 'https://passkey-auth-demo-dr0ene2xi-icrackans-projects.vercel.app/api/webauthn';

async function testRegisterEndpoint() {
    console.log('\n🔍 Testing /register endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'testuser',
                displayName: 'Test User'
            })
        });
        
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
        
        if (data.error && data.error.includes('FIREBASE_SERVICE_ACCOUNT')) {
            console.log('❌ Firebase configuration missing - check environment variables');
        } else if (response.status === 200 && data.challenge) {
            console.log('✅ Register endpoint working correctly');
        } else {
            console.log('❌ Unexpected response');
        }
    } catch (error) {
        console.error('❌ Error testing register endpoint:', error.message);
    }
}

async function testAuthenticateEndpoint() {
    console.log('\n🔍 Testing /authenticate endpoint...');
    try {
        const response = await fetch(`${BASE_URL}/authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: 'testuser'
            })
        });
        
        const data = await response.json();
        console.log('Status:', response.status);
        console.log('Response:', JSON.stringify(data, null, 2));
        
        if (data.error && data.error.includes('FIREBASE_SERVICE_ACCOUNT')) {
            console.log('❌ Firebase configuration missing - check environment variables');
        } else if (response.status === 200 && data.allowCredentials) {
            console.log('✅ Authenticate endpoint working correctly');
        } else {
            console.log('❌ Unexpected response');
        }
    } catch (error) {
        console.error('❌ Error testing authenticate endpoint:', error.message);
    }
}

// Thêm node-fetch vào dependencies
const addDependencies = async () => {
    const { execSync } = require('child_process');
    try {
        console.log('📦 Installing test dependencies...');
        execSync('npm install node-fetch --save-dev', { stdio: 'inherit' });
    } catch (error) {
        console.error('Error installing dependencies:', error);
    }
};

// Run tests
(async () => {
    await addDependencies();
    console.log('\n🚀 Starting API endpoint tests...');
    await testRegisterEndpoint();
    await testAuthenticateEndpoint();
})();