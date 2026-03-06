import { WebSocketServer } from 'ws';
import { exec } from 'node:child_process';
import path from 'node:path';

const PORT = Number.parseInt(process.env.NYX_LINK_PORT || '4343', 10);
const ROOT = process.env.NYX_LINK_ROOT || path.resolve(process.cwd());
const TIMEOUT_MS = Number.parseInt(process.env.NYX_LINK_TIMEOUT_MS || '8000', 10);
const MAX_BUFFER = Number.parseInt(process.env.NYX_LINK_MAX_BUFFER || String(1024 * 200), 10);

const wss = new WebSocketServer({ port: PORT });

const send = (socket, payload) => {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

wss.on('connection', (socket) => {
  socket.on('message', (raw) => {
    let payload;
    try {
      payload = JSON.parse(raw.toString());
    } catch (error) {
      send(socket, { id: 'unknown', status: 'error', message: 'Invalid JSON payload.' });
      return;
    }

    const id = typeof payload?.id === 'string' ? payload.id : 'unknown';
    const command = typeof payload?.command === 'string' ? payload.command : '';
    if (!command.trim()) {
      send(socket, { id, status: 'error', message: 'Missing command.' });
      return;
    }

    send(socket, { id, status: 'queued' });

    exec(
      command,
      { cwd: ROOT, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, shell: true },
      (error, stdout, stderr) => {
        if (error) {
          send(socket, {
            id,
            status: 'error',
            exitCode: typeof error.code === 'number' ? error.code : 1,
            output: [stdout, stderr, error.message].filter(Boolean).join('\n')
          });
          return;
        }

        send(socket, {
          id,
          status: 'complete',
          exitCode: 0,
          output: [stdout, stderr].filter(Boolean).join('\n')
        });
      }
    );
  });
});

console.log(`[nyx-link] listening on ws://localhost:${PORT}`);
