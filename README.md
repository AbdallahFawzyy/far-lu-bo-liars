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
npm start            # game + multiplayer server on http://localhost:3000
npm test             # 2,000 simulated bot games to check the rules engine
node test/server.mjs # multiplayer relay test
```

Multiplayer picks its connection automatically: the claude.ai room when opened as an artifact, the server's `/ws` WebSocket relay when served by `npm start`, and browser-to-browser (PeerJS) on a plain static host.

## Deploy on DigitalOcean

**Droplet (about $4–6/month, gives you `https://<ip>.sslip.io`):**

1. Create a droplet: Ubuntu 24.04, the cheapest Basic plan is enough.
2. Open its console (Access → Launch Droplet Console) and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/AbdallahFawzyy/far-lu-bo-liars/main/deploy/setup.sh | sudo bash
   ```
3. It prints the link, e.g. `https://167.71.3.118.sslip.io`. Send it to your friends.

The droplet checks GitHub every minute and redeploys by itself when `main` changes. Watch deploys with `journalctl -u liars-den-update -f`.

**App Platform (no server to manage, about $5/month):** Create App → GitHub → this repo. It reads `.do/app.yaml` (build `npm ci --omit=dev`, run `npm start`, health check `/health`) and gives you an `ondigitalocean.app` link. It redeploys on every push to `main`.

## Layout

| File | What it does |
| --- | --- |
| `src/game.js` | Rules engine and bot AI. Pure JS, runs in Node and the browser. |
| `src/characters.js` | Procedural characters, rig, poses, expressions, voice lines. |
| `src/world.js` | Bar environment, lighting, particles, revolver and card models. |
| `src/textures.js` | Every texture, drawn on canvas at load time. |
| `src/audio.js` | Synthesized sound effects, voices, ambience and music. |
| `src/net.js` | Multiplayer transports: claude.ai room, own-server WebSocket, PeerJS. |
| `server/server.js` | Node server: serves the game and relays multiplayer presence over `/ws`. |
| `deploy/setup.sh` | One-command DigitalOcean droplet setup (Node, Caddy HTTPS, systemd). |
| `src/main.js` | Renderer, camera, presenter (turns events into animation), host director, UI. |
| `test/` | Simulation test, Playwright screenshot/autoplay test, two-player test with a mock room. |
