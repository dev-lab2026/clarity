import crypto from 'node:crypto';
console.log(`CLARITY_API_KEY=${crypto.randomBytes(32).toString('hex')}`);
