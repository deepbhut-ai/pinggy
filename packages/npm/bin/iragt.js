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

function fetchConfig(t) {
  return new Promise((resolve, reject) => {
    const apiUrl = `${API_BASE}/api/v1/configs/cli/${encodeURIComponent(t)}`;
    https.get(apiUrl, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(rawData);
          if (res.statusCode !== 200 || data.status !== 'success') {
            return reject(new Error(data.detail || 'Invalid or inactive token'));
          }
          resolve(data);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function getPortsSig(ports) {
  return (ports || [])
    .map((p) => `${p.domain}:${p.local_port}`)
    .sort()
    .join('|');
}

let currentSsh = null;
let currentPorts = [];
let currentPortsSig = '';
let isReloading = false;
let isShuttingDown = false;
let pollTimer = null;

function printBanner(ports, isHotReload = false) {
  if (isHotReload) return;
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
}

function startSsh(config, isHotReload = false) {
  const ports = config.ports || [];
  const sshHost = config.ssh_host || 'ssh.iraglobaltech.com';
  const sshPort = config.ssh_port || 2222;

  if (isHotReload) {
    const oldDomains = new Set(currentPorts.map((p) => p.domain));
    const added = ports.filter((p) => !oldDomains.has(p.domain));
    const modified = ports.filter((p) => {
      const old = currentPorts.find((o) => o.domain === p.domain);
      return old && old.local_port !== p.local_port;
    });

    if (added.length > 0) {
      added.forEach((p) => {
        console.log(`\n  [dashboard] ➕ Added endpoint: https://${p.domain} -> :${p.local_port}`);
      });
    }
    if (modified.length > 0) {
      modified.forEach((p) => {
        console.log(`\n  [dashboard] 🔄 Updated endpoint: https://${p.domain} -> :${p.local_port}`);
      });
    }
  } else {
    printBanner(ports);
  }

  currentPorts = ports;
  currentPortsSig = getPortsSig(ports);

  const sshArgs = ['-p', sshPort.toString(), '-tt', '-o', 'StrictHostKeyChecking=no'];
  ports.forEach((p) => {
    sshArgs.push('-R', `0:127.0.0.1:${p.local_port}`);
  });
  const portsSuffix = ports.length > 0 ? `--${ports.map((p) => p.local_port).join(',')}` : '';
  sshArgs.push(`${token}${portsSuffix}@${sshHost}`);

  currentSsh = spawn('ssh', sshArgs, { stdio: 'inherit' });

  currentSsh.on('close', (code) => {
    if (isShuttingDown) {
      process.exit(0);
    }
    if (!isReloading) {
      console.log('\nTunnel disconnected.');
      process.exit(code || 0);
    }
  });
}

async function watchConfig() {
  if (isShuttingDown) return;
  try {
    const fresh = await fetchConfig(token);
    const freshSig = getPortsSig(fresh.ports);

    if (freshSig && freshSig !== currentPortsSig) {
      isReloading = true;
      if (currentSsh) {
        try { currentSsh.kill('SIGTERM'); } catch {}
      }
      // Allow brief moment for port release on server then respawn
      setTimeout(() => {
        startSsh(fresh, true);
        isReloading = false;
      }, 500);
    }
  } catch (e) {
    // Silent fail on transient poll errors
  }
}

function cleanup() {
  isShuttingDown = true;
  if (pollTimer) clearInterval(pollTimer);
  if (currentSsh) {
    try { currentSsh.kill('SIGTERM'); } catch {}
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(0);
});
process.on('SIGTERM', () => {
  cleanup();
  process.exit(0);
});

console.log(`\n🚀 Fetching tunnel configuration for token: ${tokenDisplay}`);

fetchConfig(token)
  .then((data) => {
    startSsh(data, false);
    // Start background watcher every 3 seconds for zero-restart subdomain & port syncing
    pollTimer = setInterval(watchConfig, 3000);
  })
  .catch((err) => {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  });
