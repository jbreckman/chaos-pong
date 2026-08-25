# Chaos Pong 🏓

First-person 3D table tennis vs a robot, with escalating per-point chaos:
crosswind fans, floating blocks, black holes, and yellow decoy balls.

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

- `src/main.js` — game loop (240 Hz fixed-step physics), input, robot AI, scoring rules
- `src/ball.js` — ball physics, flight prediction (used by the AI), ballistic shot solver
- `src/obstacles.js` — the four obstacle types + escalation schedule
- `src/scene.js` — outdoor arena, table, paddles, robot avatar
- `src/audio.js` — all sound is synthesized WebAudio (sfx + 112 BPM soundtrack), zero assets
