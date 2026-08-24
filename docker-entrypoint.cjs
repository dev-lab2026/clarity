'use strict';

const fs = require('node:fs');
const { spawn } = require('node:child_process');

const config = `window.CLARITY_CONFIG = ${JSON.stringify({
  entraClientId: process.env.ENTRA_CLIENT_ID || process.env.VITE_ENTRA_CLIENT_ID || '',
  entraTenantId: process.env.ENTRA_TENANT_ID || process.env.VITE_ENTRA_TENANT_ID || '',
  appUrl: process.env.APP_URL || process.env.VITE_APP_URL || ''
})};\n`;

fs.writeFileSync('/app/dist/config.js', config, 'utf8');

const child = spawn(process.execPath, ['dist/server.cjs'], {
  stdio: 'inherit',
  env: process.env
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});

child.on('error', (err) => {
  console.error('Failed to start CLARITY server:', err);
  process.exit(1);
});
