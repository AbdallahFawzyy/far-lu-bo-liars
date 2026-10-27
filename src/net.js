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
