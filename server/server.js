// Liar's Den server: serves the built game and relays multiplayer presence over WebSockets.
// One process, no database. Each table is a room keyed by its 4-letter code; the host's
// browser still runs the game, the server only passes presence between the players.
//
//   PORT=3000 node server/server.js

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT) || 3000;
const page = readFileSync(fileURLToPath(new URL('../dist/standalone.html', import.meta.url)));
const MAX_PRESENCE = 8192;
const MAX_PER_ROOM = 8;

const server = http.createServer((req, res) => {
  const path = (req.url || '/').split('?')[0];
  if (path === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    res.end(page);
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

/** code -> Map(peerId -> {ws, presence}) */
const rooms = new Map();

function snapshot(room) {
  return [...room.entries()].map(([peer, m]) => ({ peer, presence: m.presence }));
}
function broadcast(room) {
  const msg = JSON.stringify({ peers: snapshot(room) });
  for (const m of room.values()) if (m.ws.readyState === 1) m.ws.send(msg);
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_PRESENCE * 2 });

wss.on('connection', (ws) => {
  const id = randomBytes(8).toString('hex');
  let code = null;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    if (msg.join && !code) {
      const c = String(msg.join).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
      if (!c) return;
      const room = rooms.get(c) || new Map();
      const hasHost = [...room.values()].some((m) => m.role === 'host');
      if (msg.role === 'host' && hasHost) { ws.send(JSON.stringify({ error: 'unavailable-id' })); return; }
      if (msg.role === 'guest' && !hasHost) { ws.send(JSON.stringify({ error: 'peer-unavailable' })); return; }
      if (room.size >= MAX_PER_ROOM) { ws.send(JSON.stringify({ error: 'full' })); return; }
      code = c;
      room.set(id, { ws, presence: {}, role: msg.role === 'host' ? 'host' : 'guest' });
      rooms.set(c, room);
      ws.send(JSON.stringify({ joined: c, me: id }));
      broadcast(room);
      return;
    }

    if (msg.p && code) {
      const room = rooms.get(code);
      const me = room?.get(id);
      if (!me || typeof msg.p !== 'object' || JSON.stringify(msg.p).length > MAX_PRESENCE) return;
      me.presence = msg.p;
      broadcast(room);
    }
  });

  ws.on('close', () => {
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    room.delete(id);
    if (room.size === 0) rooms.delete(code); else broadcast(room);
  });
});

// Drop connections that stopped answering (closed laptops, dead phones).
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Liar's Den on http://localhost:${PORT}`));
