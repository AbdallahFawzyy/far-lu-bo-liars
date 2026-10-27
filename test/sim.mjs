import { newGame, dealRound, act, options, pullTrigger, botDecide, botObserve, makeRng } from '../src/game.js';
let wins = {}, rounds = 0, lies = 0, calls = 0;
for (let gnum = 0; gnum < 2000; gnum++) {
  const chars = ['bob', 'coin', 'wait', 'dog'].slice(0, 2 + (gnum % 3));
  const g = newGame(chars.map((c) => ({ name: c, char: c, bot: true })), gnum + 1);
  const mems = Object.fromEntries(chars.map((_, i) => [i, { played: '', claims: {} }]));
  const rng = makeRng(gnum + 99);
  let seen = 0, steps = 0;
  const sync = () => { for (const e of g.events) if (e.id > seen) { botObserve(mems, g, e); seen = e.id; if (e.t==='reveal'){calls++; if(e.lie) lies++;} } };
  dealRound(g); sync();
  while (g.phase !== 'over') {
    if (++steps > 5000) throw new Error('stuck ' + JSON.stringify(g));
    if (g.phase === 'deal') { dealRound(g, g.turn); rounds++; sync(); continue; }
    if (g.phase === 'roulette') { pullTrigger(g); sync(); continue; }
    const s = g.turn, o = options(g);
    if (!o.play && !o.call) throw new Error('no options ' + JSON.stringify(g));
    const d = botDecide(g, s, mems[s], rng);
    const cards = d.type === 'play' ? d.idx.map((i) => g.seats[s].hand[i]).join('') : '';
    if (!act(g, s, d)) throw new Error('rejected ' + JSON.stringify(d) + JSON.stringify(g));
    if (cards) mems[s].played += cards;
    sync();
  }
  wins[g.seats[g.winner].char] = (wins[g.seats[g.winner].char] || 0) + 1;
}
console.log('OK wins', wins, 'rounds', rounds, 'calls that caught a lie', (lies / calls * 100).toFixed(1) + '%');
