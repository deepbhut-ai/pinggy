#!/usr/bin/env node

const https = require('https');
const { spawn } = require('child_process');
const pkg = require('../package.json');

const args = process.argv.slice(2);
const command = args[0];
let token = args[1];

if (command === '--version' || command === '-v') {
  console.log(`iragt v${pkg.version}`);
  process.exit(0);
}

if (command === '--help' || command === '-h') {
  console.log('\n╔═════════════════════════════════════════════════════════════╗');
  console.log('║                   IRAGT TUNNEL CLI                          ║');
  console.log('╚═════════════════════════════════════════════════════════════╝');
  console.log('\nUsage:');
  console.log('  iragt connect <YOUR_TOKEN>    Connect your multiport tunnel');
  console.log('  iragt <YOUR_TOKEN>            Shortcut connect');
  console.log('  iragt --version               Show CLI version');
  console.log('  iragt --help                  Show this help message\n');
  console.log('Dashboard: https://iraglobaltech.com/dashboard\n');
  process.exit(0);
}

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
  console.log('Dashboard: https://iraglobaltech.com/dashboard\n');
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

      console.log('\n  ╔══════════════════════════════════════════════════════════════════════════╗');
      console.log('  ║                     IRAGT MULTI-PORT TUNNEL                              ║');
      console.log('  ╠══════════════════════════════════════════════════════════════════════════╣');
      ports.forEach((p) => {
        const domainStr = `https://${p.domain}`;
        const pausedStr = p.enabled === false ? ' [PAUSED]' : '';
        const rowStr = `  🌐 ${domainStr} -> :${p.local_port}${pausedStr}`;
        console.log(`  ║ ${rowStr.padEnd(72)} ║`);
      });
      console.log('  ╚══════════════════════════════════════════════════════════════════════════╝');
      console.log('  💡 Manage & toggle ports live in your dashboard: https://iraglobaltech.com/dashboard\n');

      // Build -R arguments for SSH
      const sshArgs = ['-p', sshPort.toString(), '-tt', '-o', 'StrictHostKeyChecking=no'];
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
