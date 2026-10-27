// Pure game rules + bot brains for Liar's Deck. No DOM, no Three.js:
// runs in the browser (host) and in Node (tests).

export const RANKS = ['K', 'Q', 'A'];
export const DECK = 'KKKKKKQQQQQQAAAAAAJJ'; // 6 kings, 6 queens, 6 aces, 2 jokers (wild)
export const HAND_SIZE = 5;
export const CHAMBERS = 6;

export const PERSONAS = {
  // callT: how sure (P(lie)) a bot must be before calling. bluff: chance to sneak a fake card in.
  bob: { callT: 0.52, bluff: 0.30, greed: 0.55, label: 'reckless' },
  coin: { callT: 0.62, bluff: 0.18, greed: 0.35, label: 'calculating' },
  wait: { callT: 0.44, bluff: 0.12, greed: 0.25, label: 'paranoid' },
  dog: { callT: 0.58, bluff: 0.40, greed: 0.70, label: 'brute' },
};

export function makeRng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export const isTruth = (card, table) => card === table || card === 'J';

/**
 * Game state is plain JSON so the host can broadcast it.
 * seats: [{name, char, bot, alive, hand:'KQJ..', shots, bullet}]
 */
export function newGame(seats, seed = (Math.random() * 2 ** 32) >>> 0) {
  const rng = makeRng(seed);
  const g = {
    seed: Math.floor(rng() * 2 ** 31),
    phase: 'deal',
    round: 0,
    table: 'K',
    turn: -1,
    last: null, // {s, cards} the most recent unchallenged play
    pile: 0,
    winner: -1,
    evId: 0,
    events: [],
    seats: seats.map((s) => ({
      name: s.name, char: s.char, bot: !!s.bot, peer: s.peer || null,
      alive: true, hand: '', shots: 0, bullet: Math.floor(rng() * CHAMBERS),
    })),
  };
  return g;
}

function rngOf(g) {
  const r = makeRng(g.seed + g.evId * 7919);
  g.seed = Math.floor(r() * 2 ** 31);
  return r;
}

function push(g, ev) {
  g.evId += 1;
  ev.id = g.evId;
  g.events.push(ev);
  if (g.events.length > 12) g.events.shift();
  return ev;
}

export const alive = (g) => g.seats.map((s, i) => (s.alive ? i : -1)).filter((i) => i >= 0);

function nextSeat(g, from, pred = (s) => s.alive) {
  const n = g.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(g.seats[i])) return i;
  }
  return -1;
}

/** Deal a new round. starter = seat that should open (if alive). */
export function dealRound(g, starter = -1) {
  const rng = rngOf(g);
  const deck = shuffle(DECK.split(''), rng);
  g.round += 1;
  g.table = RANKS[Math.floor(rng() * 3)];
  g.last = null;
  g.pile = 0;
  for (const s of g.seats) s.hand = s.alive ? deck.splice(0, HAND_SIZE).sort().join('') : '';
  const live = alive(g);
  if (starter < 0 || !g.seats[starter].alive) {
    starter = starter < 0 ? live[Math.floor(rng() * live.length)] : nextSeat(g, starter);
  }
  g.turn = starter;
  g.phase = 'turn';
  push(g, { t: 'deal', table: g.table, round: g.round, s: starter });
  return g;
}

/** What may the seat on turn do right now? */
export function options(g) {
  if (g.phase !== 'turn') return { play: false, call: false };
  const me = g.seats[g.turn];
  const canCall = !!g.last && g.last.s !== g.turn;
  const othersHaveCards = g.seats.some((s, i) => i !== g.turn && s.alive && s.hand.length > 0);
  const forced = canCall && !othersHaveCards;
  return { play: me.hand.length > 0 && !forced, call: canCall, forced };
}

/** Apply an action from the seat on turn. Returns true if accepted. */
export function act(g, seat, a) {
  if (g.phase !== 'turn' || seat !== g.turn) return false;
  const opt = options(g);
  const me = g.seats[seat];
  if (a.type === 'play') {
    if (!opt.play) return false;
    const idx = [...new Set(a.idx)].filter((i) => Number.isInteger(i) && i >= 0 && i < me.hand.length);
    if (idx.length < 1 || idx.length > 3) return false;
    const cards = idx.map((i) => me.hand[i]).join('');
    me.hand = me.hand.split('').filter((_, i) => !idx.includes(i)).join('');
    g.last = { s: seat, cards };
    g.pile += cards.length;
    push(g, { t: 'play', s: seat, n: cards.length, left: me.hand.length });
    advance(g);
    return true;
  }
  if (a.type === 'call') {
    if (!opt.call) return false;
    const target = g.last.s;
    const cards = g.last.cards;
    const lie = cards.split('').some((c) => !isTruth(c, g.table));
    const loser = lie ? target : seat;
    push(g, { t: 'call', s: seat, target, forced: !!opt.forced });
    push(g, { t: 'reveal', s: target, cards, lie, loser });
    g.phase = 'roulette';
    g.turn = loser;
    return true;
  }
  return false;
}

function advance(g) {
  // Next alive seat that still holds cards. If nobody else does, the next alive
  // seat takes the turn anyway and can only call.
  let i = nextSeat(g, g.turn, (x) => x.alive && x.hand.length > 0);
  if (i < 0 || i === g.turn) i = nextSeat(g, g.turn);
  g.turn = i;
  push(g, { t: 'turn', s: i });
}

/** Resolve the pending roulette pull for the loser. */
export function pullTrigger(g) {
  if (g.phase !== 'roulette') return false;
  const s = g.seats[g.turn];
  const dies = s.shots === s.bullet;
  s.shots += 1;
  push(g, { t: 'shot', s: g.turn, dies, shots: s.shots });
  if (dies) s.alive = false;
  const live = alive(g);
  if (live.length <= 1) {
    g.phase = 'over';
    g.winner = live[0] ?? -1;
    push(g, { t: 'win', s: g.winner });
  } else {
    g.phase = 'deal';
  }
  return true;
}

// ---------------------------------------------------------------- bots

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(X >= need) for X ~ Hypergeometric(pool, good, draws). */
function atLeast(pool, good, draws, need) {
  if (good < need) return 0;
  const tot = choose(pool, draws);
  if (!tot) return 0;
  let p = 0;
  for (let x = need; x <= Math.min(good, draws); x++) p += (choose(good, x) * choose(pool - good, draws - x)) / tot;
  return Math.min(1, p);
}

/**
 * mem: per-bot memory for this round: {played: 'cards I played', claims: {seat: count}}
 * Returns {type:'play', idx} or {type:'call'}.
 */
export function botDecide(g, seat, mem, rng = Math.random) {
  const me = g.seats[seat];
  const P = PERSONAS[me.char] || PERSONAS.dog;
  const opt = options(g);
  const truthIdx = [];
  const fakeIdx = [];
  me.hand.split('').forEach((c, i) => (isTruth(c, g.table) ? truthIdx : fakeIdx).push(i));
  // Real table cards before jokers; keep jokers for later.
  truthIdx.sort((a, b) => (me.hand[a] === 'J') - (me.hand[b] === 'J'));

  if (opt.forced) return { type: 'call' };

  if (opt.call) {
    const last = g.last;
    const n = last.cards.length;
    const myTruth = truthIdx.length + [...(mem.played || '')].filter((c) => isTruth(c, g.table)).length;
    const avail = 8 - myTruth;
    const pool = DECK.length - me.hand.length - (mem.played || '').length;
    const otherClaims = Object.entries(mem.claims || {}).reduce((t, [s, c]) => t + (Number(s) === last.s ? 0 : c), 0);
    const priorOwn = (mem.claims || {})[last.s] || 0;
    const handBefore = g.seats[last.s].hand.length + n + priorOwn;
    // Assume ~60% of earlier claims by others were honest and used up truths.
    const availForThem = Math.max(0, avail - Math.round(otherClaims * 0.6));
    let pHonest = atLeast(Math.max(handBefore, pool - Math.round(otherClaims * 0.6)), availForThem, handBefore, n + priorOwn);
    if (availForThem < n) pHonest = 0;
    let pLie = 1 - pHonest * 0.92;
    if (n === 3) pLie += 0.1;
    if (g.seats[last.s].hand.length === 0) pLie += 0.08;
    const dangerMine = me.shots / CHAMBERS;
    let threshold = P.callT + dangerMine * 0.15 + (rng() - 0.5) * 0.18;
    if (truthIdx.length === 0) threshold -= 0.2; // I'd have to bluff anyway
    if (pLie > threshold || !opt.play) return { type: 'call' };
  }

  // Play.
  let idx;
  if (truthIdx.length > 0) {
    const want = Math.max(1, Math.min(truthIdx.length, 3, 1 + Math.floor(rng() * (1 + P.greed * 2.2))));
    idx = truthIdx.slice(0, want);
    if (fakeIdx.length && idx.length < 3 && rng() < P.bluff) idx.push(fakeIdx[Math.floor(rng() * fakeIdx.length)]);
  } else {
    const want = rng() < P.greed * 0.5 && fakeIdx.length > 1 ? 2 : 1;
    idx = shuffle(fakeIdx.slice(), rng).slice(0, want);
  }
  return { type: 'play', idx };
}

/** Keep each bot's per-round memory in sync with events. */
export function botObserve(mems, g, ev) {
  if (ev.t === 'deal') for (const k in mems) mems[k] = { played: '', claims: {} };
  if (ev.t === 'play') for (const k in mems) {
    const m = mems[k];
    m.claims[ev.s] = (m.claims[ev.s] || 0) + ev.n;
  }
}
