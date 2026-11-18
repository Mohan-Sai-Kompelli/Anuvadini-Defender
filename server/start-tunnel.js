/**
 * Dev tunnel launcher — starts the Express server then opens an ngrok tunnel.
 * Run with:  node start-tunnel.js
 *
 * On startup it prints:
 *   ✅  Tunnel URL: https://xxxx.ngrok-free.app
 *   👉  Set this in app Settings → server host field
 *
 * The tunnel URL is also written to tunnel-url.txt so other tooling can read it.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 5001;

// --- 1. Start the Express server as a child process ---
const server = spawn('node', ['index.js'], {
  stdio: 'inherit',
  env: { ...process.env },
});

server.on('error', (err) => console.error('[server]', err.message));
server.on('exit', (code) => {
  console.log(`[server] exited with code ${code}`);
  process.exit(code ?? 1);
});

// --- 2. Wait for server to be ready, then start ngrok ---
function waitForServer(retries = 20, delayMs = 500) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(`http://localhost:${PORT}/api/health`, (res) => {
        resolve();
      });
      req.on('error', () => {
        if (retries-- > 0) setTimeout(attempt, delayMs);
        else reject(new Error('Server did not start in time'));
      });
      req.end();
    };
    setTimeout(attempt, delayMs);
  });
}

function startNgrok() {
  // Use ngrok HTTP API to get the tunnel URL after starting it
  const ngrok = spawn('ngrok', ['http', String(PORT), '--log=stdout', '--log-format=json'], {
    stdio: ['ignore', 'pipe', 'inherit'],
  });

  ngrok.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        // ngrok emits {"url":"https://..."} in its structured log when tunnel opens
        if (obj.url && obj.url.startsWith('https://')) {
          const url = obj.url;
          console.log('\n=========================================');
          console.log('  ✅  Tunnel URL:', url);
          console.log('  👉  Set this in app Settings → server host');
          console.log('=========================================\n');
          fs.writeFileSync(path.join(__dirname, 'tunnel-url.txt'), url);
        }
      } catch {
        // Not JSON — ngrok info line, ignore
      }
    }
  });

  ngrok.on('error', (err) => {
    console.error('[ngrok] Failed to start:', err.message);
    console.log('  → Install ngrok from https://ngrok.com/download');
    console.log('  → Or run manually: ngrok http', PORT);
  });

  ngrok.on('exit', (code) => {
    if (code !== 0) console.warn('[ngrok] exited with code', code);
  });
}

// Wait a bit for server to start, then launch ngrok
console.log(`[tunnel] Starting server on port ${PORT}...`);
setTimeout(startNgrok, 3000);

process.on('SIGINT', () => {
  server.kill();
  process.exit(0);
});
