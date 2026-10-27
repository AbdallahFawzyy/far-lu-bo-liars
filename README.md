# Liar's Den

A 3D bluffing game in the style of Liar's Bar (Liar's Deck mode), built from scratch with Three.js. It runs in the browser on desktop and phones.

- **Rules:** a 20-card deck (6 Kings, 6 Queens, 6 Aces, 2 Jokers), 5 cards each, a table card every round, face-down claims, LIAR calls, and Russian roulette with one bullet in six chambers per player. If everyone else is out of cards, the last player holding cards is forced to call.
- **Characters:** Abu Bob (black bob wig, party hat, full beard, white tee), Madame Fringe (pink crochet cap with a coin fringe, gold hoops, cream puff-sleeve blouse, long highlighted hair), Estanna (grey coat, black scarf, middle-parted dark hair, mole, the "wait" hand gesture), plus Hamo the bouncer for a fourth seat. Each one is built procedurally and rigged with poses, eye tracking, blinking, expressions, lip flap and voice lines.
- **Revolver:** a modelled revolver with a rotating cylinder, a hammer that cocks, and a muzzle flash. Every sound (cylinder spin, hammer cock, dry fire, gunshot with room reverb, ear ringing, cards, heartbeat, the bar ambience and music) is synthesized live with WebAudio, so there are no audio files.
- **Bots:** each bot estimates how likely a claim is to be a lie (hypergeometric odds from the cards it can see), and has its own personality: reckless, calculating, paranoid or brute.
- **Pacing:** Slow, Normal (the default) or Fast.
- **Multiplayer:** host a table and share the 4-letter code. This uses the claude.ai artifact `room` capability. The host is authoritative, state travels as presence, late joiners catch up, and a player who disconnects is replaced by a bot.

## Run it

```bash
npm install
npm run build        # writes dist/index.html (artifact body) and dist/standalone.html
npm test             # 2,000 simulated bot games to check the rules engine
```

Open `dist/standalone.html` in a browser to play solo. Any static host works (GitHub Pages, Netlify, Cloudflare Pages): upload `dist/standalone.html` as `index.html`.

Multiplayer only works when the page is opened as a claude.ai artifact, because it relies on that platform's realtime room. Solo play works everywhere.

## Layout

| File | What it does |
| --- | --- |
| `src/game.js` | Rules engine and bot AI. Pure JS, runs in Node and the browser. |
| `src/characters.js` | Procedural characters, rig, poses, expressions, voice lines. |
| `src/world.js` | Bar environment, lighting, particles, revolver and card models. |
| `src/textures.js` | Every texture, drawn on canvas at load time. |
| `src/audio.js` | Synthesized sound effects, voices, ambience and music. |
| `src/net.js` | Multiplayer over the artifact room (presence-based). |
| `src/main.js` | Renderer, camera, presenter (turns events into animation), host director, UI. |
| `test/` | Simulation test, Playwright screenshot/autoplay test, two-player test with a mock room. |
