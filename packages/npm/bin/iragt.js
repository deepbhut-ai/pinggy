#!/usr/bin/env node

const https = require('https');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const command = args[0];
let token = args[1];

// Allow running either `iragt connect <TOKEN>` or directly `iragt <TOKEN>`
if (command === 'connect' && token) {
  // ok
} else if (command && !token && !command.startsWith('-')) {
  token = command;
} else {
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║                   IRAGT TUNNEL CLI                          ║');
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('\nUsage:');
  console.log('  iragt connect <YOUR_TOKEN>');
  console.log('  iragt <YOUR_TOKEN>\n');
  process.exit(1);
}

const API_BASE = process.env.IRAGT_API_HOST || 'https://iraglobaltech.com';
const tokenDisplay = token.length > 8 ? `${token.substring(0, 8)}...` : token;

console.log(`\n🚀 Fetching tunnel configuration for token: ${tokenDisplay}`);

const apiUrl = `${API_BASE}/api/v1/configs/cli/${encodeURIComponent(token)}`;

https.get(apiUrl, (res) => {
  let rawData = '';
  res.on('data', (chunk) => { rawData += chunk; });
  res.on('end', () => {
    try {
      const data = JSON.parse(rawData);
      if (res.statusCode !== 200 || data.status !== 'success') {
        console.error(`\n❌ Error: ${data.detail || 'Invalid or inactive token'}\n`);
        process.exit(1);
      }

      const ports = data.ports || [];
      const sshHost = data.ssh_host || 'ssh.iraglobaltech.com';
      const sshPort = data.ssh_port || 2222;

      console.log('\n  ╔═════════════════════════════════════════════════════════════╗');
      console.log('  ║                     IRAGT TUNNEL ACTIVE                     ║');
      console.log('  ╠═════════════════════════════════════════════════════════════╣');
      ports.forEach((p) => {
        const domainStr = `https://${p.domain}`.padEnd(26);
        const portStr = p.local_port.toString().padEnd(6);
        console.log(`  ║  ${domainStr} --> localhost:${portStr}║`);
      });
      console.log('  ╚═════════════════════════════════════════════════════════════╝\n');

      // Build -R arguments for SSH
      const sshArgs = ['-p', sshPort.toString(), '-o', 'StrictHostKeyChecking=no'];
      ports.forEach((p) => {
        sshArgs.push('-R', `0:127.0.0.1:${p.local_port}`);
      });
      sshArgs.push(`${token}@${sshHost}`);

      // Launch SSH tunnel process
      const ssh = spawn('ssh', sshArgs, { stdio: 'inherit' });

      ssh.on('close', (code) => {
        console.log(`\nTunnel disconnected.`);
        process.exit(code || 0);
      });

    } catch (e) {
      console.error('❌ Failed to parse server response:', e.message);
      process.exit(1);
    }
  });
}).on('error', (e) => {
  console.error(`❌ Connection error: ${e.message}`);
  process.exit(1);
});
