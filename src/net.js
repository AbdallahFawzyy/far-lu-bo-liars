// Multiplayer over the claude.ai artifact `room` capability.
// Everything travels in presence (absolute state, handed to late joiners):
//   host  -> presence {role:'host', s: lobby-or-game state}
//   guest -> presence {role:'guest', name, char, act:{q, a}}
// The host is authoritative; guests only send their latest intended action.

let roomApi = null;
let roomReady = null;

export function getRoom() {
  if (!roomReady) {
    roomReady = (async () => {
      try {
        if (!window.claude?.use) return null;
        roomApi = await window.claude.use('room');
        return roomApi;
      } catch { return null; }
    })();
  }
  return roomReady;
}

export function randomCode() {
  const A = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}

export class Table {
  constructor(room, code, role) {
    this.room = room; this.code = code; this.role = role;
    this.named = null; this.unsub = []; this.peers = []; this.me = null;
    this.onChange = () => {};
  }

  async join() {
    this.named = await this.room.join('ld-' + this.code.toLowerCase().replace(/[^a-z0-9]/g, ''));
    this.unsub.push(this.named.onPeers((ch) => {
      this.peers = ch.peers;
      const mine = ch.peers.find((p) => p.isMe && p.sameTab);
      if (mine) this.me = mine.peer;
      this.onChange(ch);
    }, (e) => { this.error = e.code; this.onChange(null); }));
    return this;
  }

  set(patch) { return this.named?.presence(patch).catch(() => {}); }

  host() { return this.peers.find((p) => p.presence?.role === 'host' && !(p.isMe && p.sameTab)) || null; }
  guests() { return this.peers.filter((p) => p.presence?.role === 'guest'); }
  connected() { return this.named?.connected() ?? false; }

  async leave() {
    this.unsub.forEach((u) => u());
    try { await this.named?.leave(); } catch { /* already gone */ }
  }
}

/** Sanitize text that came from another viewer before it is shown. */
export function cleanName(s, fallback = 'Stranger') {
  const t = String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯]/g, '').trim().slice(0, 16);
  return t || fallback;
}

// ------------------------------------------------------------------ peer-to-peer fallback
// Outside claude.ai the same presence protocol runs over WebRTC data channels (PeerJS).
// The host's browser is the hub: guests connect to it, it keeps everyone's presence.

import { Peer } from 'peerjs';

const ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export class PeerTable {
  constructor(code, role) {
    this.code = code; this.role = role;
    this.presence = {}; this.remote = new Map(); this.conns = new Map();
    this.me = null; this.onChange = () => {};
  }

  hostId() { return 'liarsden-v1-' + this.code.toLowerCase(); }

  join() {
    return new Promise((resolve, reject) => {
      const fail = (code) => { try { this.peer?.destroy(); } catch { /* gone */ } reject(Object.assign(new Error(code), { code })); };
      const timer = setTimeout(() => fail('timeout'), 15000);
      this.peer = new Peer(this.role === 'host' ? this.hostId() : undefined, { config: { iceServers: ICE }, debug: 0, ...(window.__LD_PEER || {}) });
      this.peer.on('error', (e) => {
        if (this.me && e.type !== 'peer-unavailable') { this.onChange(null); return; }
        clearTimeout(timer);
        fail(e.type || 'error');
      });
      this.peer.on('open', (id) => {
        this.me = id;
        if (this.role === 'host') {
          this.peer.on('connection', (c) => this.wire(c));
          clearTimeout(timer);
          resolve(this);
          return;
        }
        const c = this.peer.connect(this.hostId(), { reliable: true });
        this.wire(c);
        c.on('open', () => { clearTimeout(timer); resolve(this); });
      });
    });
  }

  wire(c) {
    this.conns.set(c.peer, c);
    c.on('open', () => c.send({ p: this.presence }));
    c.on('data', (d) => {
      if (!d || typeof d !== 'object' || !d.p || typeof d.p !== 'object') return;
      this.remote.set(c.peer, { peer: c.peer, isMe: false, sameTab: false, presence: d.p });
      this.onChange({});
    });
    const drop = () => { this.conns.delete(c.peer); this.remote.delete(c.peer); this.onChange({}); };
    c.on('close', drop);
    c.on('error', drop);
  }

  set(patch) {
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete this.presence[k]; else this.presence[k] = v; }
    for (const c of this.conns.values()) if (c.open) { try { c.send({ p: this.presence }); } catch { /* closed */ } }
    return Promise.resolve();
  }

  host() { return this.role === 'guest' ? [...this.remote.values()].find((p) => p.presence.role === 'host') || null : null; }
  guests() { return this.role === 'host' ? [...this.remote.values()].filter((p) => p.presence.role === 'guest') : []; }
  connected() { return !!this.peer && !this.peer.disconnected; }
  async leave() { try { this.peer?.destroy(); } catch { /* gone */ } }
}

// ------------------------------------------------------------------ own server (WebSocket relay)
// When the game is served by server/server.js, players meet through its /ws relay.

export class WsTable {
  constructor(code, role) {
    this.code = code; this.role = role;
    this.presence = {}; this.list = []; this.me = null; this.onChange = () => {};
  }

  join() {
    return new Promise((resolve, reject) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      let done = false;
      const fail = (code) => { if (done) return; done = true; try { this.ws.close(); } catch { /* gone */ } reject(Object.assign(new Error(code), { code })); };
      const timer = setTimeout(() => fail('timeout'), 8000);
      this.ws = new WebSocket(url);
      this.ws.onopen = () => this.ws.send(JSON.stringify({ join: this.code, role: this.role }));
      this.ws.onerror = () => { clearTimeout(timer); fail('no-server'); };
      this.ws.onclose = () => { if (done) { this.list = []; this.onChange(null); } else { clearTimeout(timer); fail('no-server'); } };
      this.ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.error) { clearTimeout(timer); fail(m.error); return; }
        if (m.joined) { this.me = m.me; done = true; clearTimeout(timer); resolve(this); return; }
        if (Array.isArray(m.peers)) {
          this.list = m.peers
            .filter((p) => p && typeof p.peer === 'string' && p.presence && typeof p.presence === 'object')
            .map((p) => ({ peer: p.peer, isMe: p.peer === this.me, sameTab: p.peer === this.me, presence: p.presence }));
          this.onChange({});
        }
      };
    });
  }

  set(patch) {
    for (const [k, v] of Object.entries(patch)) { if (v === null) delete this.presence[k]; else this.presence[k] = v; }
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ p: this.presence }));
    return Promise.resolve();
  }

  host() { return this.list.find((p) => p.presence.role === 'host' && !p.isMe) || null; }
  guests() { return this.list.filter((p) => p.presence.role === 'guest'); }
  connected() { return this.ws?.readyState === 1; }
  async leave() { try { this.ws?.close(); } catch { /* gone */ } }
}

let hasServer = null;
async function ownServer() {
  if (hasServer !== null) return hasServer;
  hasServer = false;
  if (!/^https?:$/.test(location.protocol)) return false;
  try {
    const r = await fetch('/health', { cache: 'no-store' });
    hasServer = r.ok && (await r.text()).trim() === 'ok';
  } catch { /* static host */ }
  return hasServer;
}

/** Open a table on whichever transport this page can use. */
export async function openTable(code, role) {
  const room = await getRoom();
  let t;
  if (room) t = new Table(room, code, role);
  else if (await ownServer()) t = new WsTable(code, role);
  else t = new PeerTable(code, role);
  await t.join();
  return t;
}
