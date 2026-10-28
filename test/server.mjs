// Starts the server, connects a host and a guest over WebSocket, checks the relay.
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const srv = spawn('node', ['server/server.js'], { env: { ...process.env, PORT: '3917' } });
await new Promise((r) => srv.stdout.once('data', r));
const base = 'http://127.0.0.1:3917';
const ok = (c, m) => { if (!c) { console.error('FAIL', m); srv.kill(); process.exit(1); } console.log('ok  ', m); };

const page = await fetch(base + '/', { headers: {} }).then((r) => r.text());
ok(page.includes("<title>Liar's Den</title>"), 'serves the game page');
ok((await fetch(base + '/health').then((r) => r.text())) === 'ok', '/health answers ok');

const open = (role, code) => new Promise((res) => {
  const ws = new WebSocket('ws://127.0.0.1:3917/ws');
  const inbox = [];
  ws.on('message', (d) => inbox.push(JSON.parse(d)));
  ws.on('open', () => { ws.send(JSON.stringify({ join: code, role })); setTimeout(() => res({ ws, inbox }), 300); });
});
const last = (c) => [...c.inbox].reverse().find((m) => m.peers)?.peers || [];

const lost = await open('guest', 'zz99');
ok(lost.inbox[0]?.error === 'peer-unavailable', 'joining a code with no host is refused');

const host = await open('host', 'ab12');
ok(host.inbox[0]?.joined === 'ab12', 'host opens table ab12');
const dupe = await open('host', 'ab12');
ok(dupe.inbox[0]?.error === 'unavailable-id', 'a second host on the same code is refused');
host.ws.send(JSON.stringify({ p: { role: 'host', s: { kind: 'lobby' } } }));
const guest = await open('guest', 'ab12');
ok(guest.inbox[0]?.joined === 'ab12', 'guest joins with the code');
guest.ws.send(JSON.stringify({ p: { role: 'guest', name: 'Friend', char: 'wait' } }));
await new Promise((r) => setTimeout(r, 300));
ok(last(host).some((p) => p.presence.name === 'Friend'), 'host sees the guest');
ok(last(guest).some((p) => p.presence.role === 'host'), 'guest sees the host state');
guest.ws.send(JSON.stringify({ p: { role: 'guest', name: 'Friend', char: 'wait', act: { q: 1, a: { type: 'call' } } } }));
await new Promise((r) => setTimeout(r, 300));
ok(last(host).some((p) => p.presence.act?.q === 1), 'guest action reaches the host');
guest.ws.close();
await new Promise((r) => setTimeout(r, 300));
ok(!last(host).some((p) => p.presence.role === 'guest'), 'host sees the guest leave');
[host, dupe, lost].forEach((c) => c.ws.close());
srv.kill();
console.log('server tests passed');
