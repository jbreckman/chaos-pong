# Chaos Pong 🏓

First-person 3D table tennis vs robots, with escalating per-point chaos.

**Two modes**: classic 1v1, and **Triangle** 1v1v1 — three players around a
triangular table, each hitting to the player on their right.

**15 chaos modifiers** roll in as the score climbs (stacking up to 3):
crosswind fan, floating block, black hole (it can swallow the ball), decoy
balls, bumpy table, giant/tiny table, volcanoes, meteor showers that punch
holes in the table (sink a shot in one — instant winner!), snow & ice, drunk
mode, giant paddle, earthquakes, a monster that bites a chunk out of the
table, and strobe rounds (off-switch + photosensitivity warning on the menu).

## Play

```sh
npm install
npm run dev        # open the printed localhost URL
```

- **Move mouse / finger** — move your paddle
- **Hold** — charge a harder hit; **release** — swing (a quick tap = soft touch)
- **M** — toggle the synthesized soundtrack
- First to 11, win by 2; serve alternates every 2 points (every point at deuce)
- Obstacles start appearing after 2 total points and stack up as the score climbs

## Build / ship

```sh
npm run build            # static site in dist/ — deployable anywhere
node build-artifact.mjs  # single-file artifact.html (everything inlined)
```

## Dev testing

Automated playtests drive the game in headless Chrome (`puppeteer-core`, uses
your installed Chrome). Start the dev server on port 5178 first (`npx vite --port 5178`):

```sh
SCRATCH=/tmp node test/playtest.mjs     # 75s auto-player: score log, FPS, errors
SCRATCH=/tmp node test/obshot.mjs       # deterministic obstacle screenshot
SCRATCH=/tmp node test/mobiletest.mjs   # portrait touch check
```

## Architecture

- `src/main.js` — game loop (240 Hz fixed-step physics), input, seat-based rules engine (2 or 3 players), bot AI
- `src/world.js` — mutable per-point world: table shape/size, seats/sectors, surface features (holes, bumps, ice)
- `src/table.js` — rect/triangle table builders, hole decals, snow overlays
- `src/ball.js` — ball physics, flight prediction (used by the AI), ballistic shot solver
- `src/obstacles.js` — all 15 chaos modifiers + escalation schedule
- `src/scene.js` — outdoor arena, paddles, robot avatars
- `src/audio.js` — all sound is synthesized WebAudio (sfx + 112 BPM soundtrack), zero assets
