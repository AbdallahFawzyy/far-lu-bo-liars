// Test double for the claude.ai `room` capability, backed by BroadcastChannel.
(() => {
  const me = 'p' + Math.random().toString(36).slice(2, 10);
  function namedRoom(name) {
    const ch = new BroadcastChannel('mock-' + name);
    const peers = new Map();
    let mine = {};
    const subs = [];
    const snapshot = () => [...peers.values()];
    const emitPeers = () => { const ps = snapshot(); subs.forEach((f) => f({ peers: ps, joined: [], left: [], updated: ps })); };
    const self = () => ({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() });
    peers.set(me, self());
    ch.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'pres') { peers.set(m.peer, { peer: m.peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence), updatedAt: Date.now() }); emitPeers(); }
      if (m.type === 'hello') ch.postMessage({ type: 'pres', peer: me, presence: mine });
      if (m.type === 'bye') { peers.delete(m.peer); emitPeers(); }
    };
    ch.postMessage({ type: 'hello' });
    window.addEventListener('beforeunload', () => ch.postMessage({ type: 'bye', peer: me }));
    return {
      name,
      async presence(patch) {
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete mine[k]; else mine[k] = v; }
        const size = JSON.stringify(mine).length;
        if (size > 4096) throw Object.assign(new Error('too big ' + size), { code: 'invalid_argument' });
        peers.set(me, self());
        ch.postMessage({ type: 'pres', peer: me, presence: mine });
        emitPeers();
      },
      onPeers(f) { subs.push(f); setTimeout(() => f({ peers: snapshot(), joined: snapshot(), left: [], updated: [] }), 0); return () => {}; },
      peers: snapshot,
      connected: () => true,
      async leave() { ch.postMessage({ type: 'bye', peer: me }); ch.close(); },
      emit: async () => {}, on: () => () => {},
    };
  }
  const room = { join: async (n) => namedRoom(n), connected: () => true };
  window.claude = { use: async (n) => (n === 'room' ? room : null) };
})();
