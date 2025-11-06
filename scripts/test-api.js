// Simple sanity check to ensure API modules export a function without invoking Firebase init.
const path = require('path');

const register = require(path.join('..', 'api', 'webauthn', 'register.js'));
const authenticate = require(path.join('..', 'api', 'webauthn', 'authenticate.js'));

console.log('register handler type:', typeof register);
console.log('authenticate handler type:', typeof authenticate);

if (typeof register === 'function' && typeof authenticate === 'function') {
  console.log('Basic sanity check passed: API handlers are functions.');
  process.exit(0);
} else {
  console.error('Sanity check failed: expected functions.');
  process.exit(1);
}
