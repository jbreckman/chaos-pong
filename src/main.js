import * as THREE from 'three';
import {
  TABLE_TOP, PLAYER_Y_MIN, PLAYER_Y_MAX,
  CHARGE_TIME, SWING_TIME, HIT_COOLDOWN,
  CAM_FOV, DIFFICULTY, WIN_SCORE,
} from './constants.js';
import { world } from './world.js';
import { table } from './table.js';
import { createRenderer, createCamera, createScene, createPaddle, createRobot } from './scene.js';
import { Ball, predictAtPlane, solveShot } from './ball.js';
import { ObstacleManager } from './obstacles.js';
import { ui } from './ui.js';
import { initAudio, sfx, stopAllLoops, startMusic, toggleMusic } from './audio.js';

// ---------- Setup ----------
const container = document.getElementById('app');
const renderer = createRenderer(container);
const camera = createCamera();
const scene = createScene();
table.init(scene);
const ball = new Ball(scene);
const obstacles = new ObstacleManager(scene);

const playerPaddle = createPaddle(0xd1342f);
scene.add(playerPaddle);

const SEAT_META = {
  classic: {
    names: ['YOU', 'BOT'],
    colors: ['#4de1ff', '#ff9d4d'],
    labels: ['YOU', 'THE BOT'],
    paddle: [null, 0xff8833],
    accent: [null, 0xff6a2a],
    ring: [null, 0x1fb8e8],
  },
  hex: {
    names: ['YOU', 'RED', 'BLU'],
    colors: ['#4de1ff', '#ff5470', '#5b8dff'],
    labels: ['YOU', 'RED BOT', 'BLUE BOT'],
    paddle: [null, 0xe03050, 0x3b6ce0],
    accent: [null, 0xff5470, 0x5b8dff],
    ring: [null, 0xffb3c0, 0x9fc3ff],
  },
};

let baseFov = CAM_FOV;
function updateProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  baseFov = aspect >= 1 ? CAM_FOV : Math.min(
    THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(CAM_FOV) / 2) / aspect)),
    105
  );
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', updateProjection);
updateProjection();

// ---------- Game state ----------
const G = {
  state: 'menu',            // menu | serve | rally | point | gameover
  mode: 'classic',
  diff: DIFFICULTY.medium,
  scores: [0, 0],
  server: 0,
  lastHitter: -1,
  legalBounce: false,
  rallyClock: 0,
  slowClock: 0,
  pointPending: null,
  serveTimer: 0,
};

const P = {
  x: 0, y: 1.1,
  tx: 0, ty: 1.1,
  vx: 0,
  charging: false, chargeStart: 0, charge: 0,
  swing: 0, swingPower: 0,
  cooldown: 0,
  scale: 1,                 // giant-paddle visual scale (lerped)
};

let bots = [];              // seat entities for seats 1..N-1
const cam = { shake: 0, kick: 0 };

function meta() { return SEAT_META[G.mode]; }
function seatName(i) { return meta().labels[i]; }

function makeBots() {
  for (const b of bots) {
    scene.remove(b.paddle); scene.remove(b.avatar);
  }
  bots = [];
  const m = meta();
  for (let seat = 1; seat < world.seats; seat++) {
    const paddle = createPaddle(m.paddle[seat]);
    scene.add(paddle);
    const avatar = createRobot(m.accent[seat], m.ring[seat]);
    scene.add(avatar);
    bots.push({
      seat, paddle, avatar,
      along: 0, y: 1.08, targetAlong: 0, targetY: 1.08,
      avatarAlong: 0,
      reactClock: 0, errA: 0, errY: 0,
      cooldown: 0, swingAnim: 0, attempted: false,
    });
  }
  placeBots();
}

function placeBots() {
  for (const b of bots) {
    b.dir = world.seatDirs[b.seat];
    b.tan = world.seatTans[b.seat];
    b.faceY = Math.atan2(-b.dir.x, -b.dir.y);
    b.along = 0; b.y = 1.08;
    const bd = world.robotDist + 0.45;
    b.avatar.position.set(b.dir.x * bd, 0, b.dir.y * bd);
    b.avatar.rotation.y = b.faceY;
  }
}

// ---------- Input ----------
function pointerToTarget(e) {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  P.tx = THREE.MathUtils.clamp(nx * world.playerXRange * 1.15, -world.playerXRange, world.playerXRange);
  P.ty = THREE.MathUtils.clamp(
    PLAYER_Y_MIN + ((ny + 1) / 2) * (PLAYER_Y_MAX - PLAYER_Y_MIN) * 1.15,
    PLAYER_Y_MIN, PLAYER_Y_MAX
  );
}

window.addEventListener('pointermove', pointerToTarget, { passive: true });
window.addEventListener('pointerdown', (e) => {
  initAudio();
  if (e.target.closest('.overlay')) return;
  pointerToTarget(e);
  if (G.state === 'serve' || G.state === 'rally') {
    P.charging = true;
    P.chargeStart = performance.now();
  }
}, { passive: true });
window.addEventListener('pointerup', () => {
  if (!P.charging) return;
  P.charging = false;
  const held = (performance.now() - P.chargeStart) / 1000;
  const power = THREE.MathUtils.clamp(held / CHARGE_TIME, 0.08, 1);
  ui.charge(null);
  if (G.state === 'serve' && G.server === 0) {
    playerServe(power);
  } else if (G.state === 'rally') {
    P.swing = SWING_TIME;
    P.swingPower = power;
    sfx.swish();
  }
});
window.addEventListener('pointercancel', () => { P.charging = false; ui.charge(null); });
window.addEventListener('contextmenu', e => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    initAudio();
    const on = toggleMusic();
    ui.hint(on ? '♪ MUSIC ON' : 'MUSIC OFF', 900);
  }
});

// Menu
document.querySelectorAll('#menu .btn.mode').forEach(btn => {
  btn.addEventListener('click', () => {
    G.mode = btn.dataset.mode;
    document.querySelectorAll('#menu .btn.mode').forEach(b =>
      b.classList.toggle('selected', b === btn));
  });
});
document.querySelectorAll('#menu .btn[data-diff]').forEach(btn => {
  btn.addEventListener('click', () => {
    initAudio();
    G.diff = DIFFICULTY[btn.dataset.diff];
    startMatch();
  });
});
document.getElementById('btn-rematch').addEventListener('click', () => { ui.hideGameOver(); startMatch(); });
document.getElementById('btn-menu').addEventListener('click', () => {
  ui.hideGameOver();
  ui.showScoreboard(false);
  obstacles.clear();
  ball.hide();
  G.state = 'menu';
  ui.showMenu(true);
});

function strobeAllowed() {
  const cb = document.getElementById('strobe-ok');
  return !cb || cb.checked;
}

// ---------- Match / point flow ----------
function startMatch() {
  startMusic();
  ui.showMenu(false);
  ui.showScoreboard(true);
  world.configure({ mode: G.mode, scale: 1 });
  G.scores = new Array(world.seats).fill(0);
  ui.buildScoreboard(meta().names, meta().colors);
  ui.setScore(G.scores);
  makeBots();
  G.state = 'point';
  startPoint(600);
}

function currentServer() {
  const total = G.scores.reduce((a, b) => a + b, 0);
  if (world.seats === 2 && G.scores[0] >= 10 && G.scores[1] >= 10) return total % 2;
  return Math.floor(total / 2) % world.seats;
}

function startPoint(delay = 1700) {
  clearTimeout(G.pointPending);
  G.pointPending = setTimeout(() => {
    const total = G.scores.reduce((a, b) => a + b, 0);
    const roster = obstacles.roll(total, { allowStrobe: strobeAllowed() });
    const scale = roster.includes('giant') ? 1.55 : roster.includes('tiny') ? 0.55 : 1;
    world.configure({ mode: G.mode, scale });
    table.rebuild();
    obstacles.apply(roster);
    placeBots();
    ui.banner(obstacles.labels());
    G.server = currentServer();
    ui.setServer(G.server);
    G.lastHitter = -1;
    G.legalBounce = false;
    G.rallyClock = 0; G.slowClock = 0;
    P.cooldown = 0;
    for (const b of bots) { b.cooldown = 0; b.attempted = false; }
    ball.hide();
    renderer.toneMappingExposure = 1.05;
    G.state = 'serve';
    if (G.server === 0) {
      ui.hint('HOLD & RELEASE TO SERVE');
    } else {
      ui.hint(`${seatName(G.server)} SERVES…`, 1200);
      G.serveTimer = 1.3;
    }
  }, delay);
}

/** Landing target for a shot by `hitter` toward its receiver. */
function targetFor(hitter, { power = 0.5, latFrac = null, miss = false } = {}) {
  const r = (hitter + 1) % world.seats;
  if (miss) {
    // land beyond the receiver's edge or wide of it
    const d = world.seatDirs[r], tn = world.seatTans[r];
    const A = world.mode === 'classic' ? world.halfL : world.apothem;
    const over = Math.random() < 0.5;
    const depth = over ? A * (1.12 + Math.random() * 0.25) : A * (0.5 + Math.random() * 0.3);
    const lat = over ? (Math.random() * 2 - 1) * world.edgeHalf * 0.5
                     : (Math.random() < 0.5 ? -1 : 1) * world.edgeHalf * (1.1 + Math.random() * 0.3);
    return { x: d.x * depth + tn.x * lat, y: TABLE_TOP, z: d.y * depth + tn.y * lat };
  }
  const lf = latFrac === null ? (Math.random() * 2 - 1) * 0.8 : latFrac;
  return world.sectorTarget(r, power, lf);
}

function afterHit(seat, power) {
  G.lastHitter = seat;
  G.legalBounce = false;
  G.rallyClock = 0;
  G.slowClock = 0;
  if (seat === 0) { P.cooldown = HIT_COOLDOWN; P.swing = 0; }
  const receiver = (seat + 1) % world.seats;
  const rb = bots.find(b => b.seat === receiver);
  if (rb) {
    const d = G.diff;
    rb.errA = (Math.random() * 2 - 1) * d.botErr;
    rb.errY = (Math.random() * 2 - 1) * d.botErr * 0.6;
    rb.reactClock = d.botReact;
    rb.attempted = false;
  }
  const hb = bots.find(b => b.seat === seat);
  if (hb) hb.cooldown = HIT_COOLDOWN;
}

function playerServe(power) {
  ui.clearHint();
  _from.set(P.x, Math.max(P.y, TABLE_TOP + 0.25), world.playerZ - 0.1);
  const latFrac = THREE.MathUtils.clamp(-P.x * 0.5 + (Math.random() - 0.5) * 0.6, -0.85, 0.85);
  const target = targetFor(0, { power, latFrac });
  const vel = solveShot(_from, target, (3.0 + power * 3.4) * world.speedScale);
  ball.spawn(_from, vel);
  afterHit(0, power);
  sfx.paddleHit(power);
  cam.kick = 0.4 + power * 0.7;
  G.state = 'rally';
}

function botServe(b) {
  const d = G.diff;
  const pp = botPaddlePos(b, _pv);
  _from.set(pp.x, Math.max(pp.y, TABLE_TOP + 0.3), pp.z);
  _from.addScaledVector(_dir3.set(b.dir.x, 0, b.dir.y), -0.1);
  const target = targetFor(b.seat, { power: 0.45 + Math.random() * 0.2, miss: Math.random() < d.missProb * 0.5 });
  const speed = THREE.MathUtils.lerp(d.botPower[0], d.botPower[1], Math.random()) * 0.85 * world.speedScale;
  ball.spawn(_from, solveShot(_from, target, speed));
  afterHit(b.seat, 0.5);
  sfx.botHit(0.5);
  b.swingAnim = 1;
  G.state = 'rally';
}

// ---------- Point resolution ----------
function resolvePoint(winner, reason) {
  if (G.state !== 'rally') return;
  G.state = 'point';
  ui.hideBanner();
  if (winner === 'replay') {
    ui.message(reason === 'swallowed' ? 'SWALLOWED!' : 'LET', 'replay the point', 1400);
    if (reason === 'swallowed') { sfx.swallowed(); ball.hide(); }
    startPoint(1500);
    return;
  }
  G.scores[winner]++;
  if (winner === 0) sfx.pointWin(); else sfx.pointLose();
  ui.setScore(G.scores);
  cam.shake = Math.max(cam.shake, 0.35);

  const sorted = [...G.scores].sort((a, b) => b - a);
  const over = sorted[0] >= WIN_SCORE && sorted[0] - sorted[1] >= 2;

  let sub = reason;
  if (!over) {
    if (world.seats === 2 && G.scores[0] >= 10 && G.scores[0] === G.scores[1]) sub = 'DEUCE';
    else {
      for (let s = 0; s < world.seats; s++) {
        const others = G.scores.filter((_, i) => i !== s);
        if (G.scores[s] >= WIN_SCORE - 1 && G.scores[s] - Math.max(...others) >= 1) {
          sub = `GAME POINT — ${seatName(s)}`;
          break;
        }
      }
    }
  }
  ui.message(winner === 0 ? 'YOU SCORE!' : `${seatName(winner)} SCORES`, sub, 1400);

  if (over) {
    G.state = 'gameover';
    obstacles.clear();
    stopAllLoops();
    renderer.toneMappingExposure = 1.05;
    const champ = G.scores.indexOf(Math.max(...G.scores));
    if (champ === 0) sfx.gameWin(); else sfx.gameLose();
    setTimeout(() => ui.showGameOver(
      champ === 0,
      champ === 0 ? 'YOU WIN!' : `${seatName(champ)} WINS`,
      G.scores.join(' — ')
    ), 1300);
  } else {
    startPoint(1700);
  }
}

const ballEvents = {
  onBounceTable(sector) {
    sfx.bounce();
    if (G.state !== 'rally' || G.lastHitter < 0) return;
    const h = G.lastHitter;
    const r = (h + 1) % world.seats;
    if (sector === r) {
      if (G.legalBounce) resolvePoint(h, `double bounce — ${seatName(r)} never touched it`);
      else G.legalBounce = true;
    } else {
      resolvePoint(r, h === 0 ? 'your shot landed in the wrong zone' : `${seatName(h)} hit the wrong zone`);
    }
  },
  onNet() { sfx.net(); },
  onHole(sector) {
    if (G.state !== 'rally') { ball.hide(); return; }
    sfx.sunk();
    const h = G.lastHitter;
    if (h < 0) { resolvePoint('replay', 'let'); ball.hide(); return; }
    const r = (h + 1) % world.seats;
    if (sector === r) resolvePoint(h, h === 0 ? 'SUNK IT! unreturnable' : `${seatName(h)} sank it in a hole`);
    else resolvePoint(r, h === 0 ? 'you sank your own shot' : `${seatName(h)} sank its own shot`);
    setTimeout(() => ball.hide(), 350);   // let it visibly drop through
  },
  onFloor() { floorOrOut(); },
  onOut() { floorOrOut(); },
};

function floorOrOut() {
  if (G.state !== 'rally') { ball.hide(); return; }
  const h = G.lastHitter;
  if (h < 0) { resolvePoint('replay', 'let'); return; }
  const r = (h + 1) % world.seats;
  if (G.legalBounce) resolvePoint(h, r === 0 ? 'you missed the return' : `${seatName(r)} missed the return`);
  else resolvePoint(r, h === 0 ? 'you missed the table' : `${seatName(h)} missed the table`);
  ball.hide();
}

// ---------- Player hitting ----------
function hitRadiusMul() { return obstacles.flags.giantPaddle ? 1.8 : 1; }

function tryPlayerHit() {
  if (P.cooldown > 0 || !ball.active || G.state !== 'rally') return;
  if (ball.vel.z <= 0.2) return;
  const inZone = ball.pos.z > world.playerZ - 0.65 && ball.pos.z < world.playerZ + 0.42;
  if (!inZone) return;
  _pv.set(P.x, P.y, world.playerZ);
  const dist = ball.pos.distanceTo(_pv);

  if (P.swing > 0 && dist < G.diff.hitRadius * hitRadiusMul()) {
    executePlayerHit(P.swingPower);
  } else if (dist < 0.22 * hitRadiusMul()) {
    executePlayerHit(0.12, true);
  }
}

function executePlayerHit(power, passive = false) {
  const latFrac = THREE.MathUtils.clamp(
    P.vx * 0.22 - P.x * 0.4 + (Math.random() * 2 - 1) * (passive ? 0.5 : 0.2),
    -0.95, 0.95
  );
  const target = targetFor(0, { power: passive ? 0.25 : power, latFrac });
  const speed = (passive ? 2.6 : 3.1 + power * 4.1) * world.speedScale;
  const vel = solveShot(ball.pos, target, speed, passive ? 0.02 : 0.07);
  ball.vel.copy(vel);
  afterHit(0, power);
  sfx.paddleHit(power);
  cam.kick = 0.3 + power * 1.1;
  cam.shake = Math.max(cam.shake, 0.06 + power * 0.22);
}

// ---------- Bot AI ----------
function botPaddlePos(b, out) {
  const D = world.robotDist;
  out.set(b.dir.x * D + b.tan.x * b.along, b.y, b.dir.y * D + b.tan.y * b.along);
  return out;
}

function updateBot(b, dt) {
  const d = G.diff;
  b.cooldown = Math.max(0, b.cooldown - dt);

  if (G.state === 'serve' && G.server === b.seat) {
    G.serveTimer -= dt;
    b.targetAlong = 0; b.targetY = 1.08;
    if (G.serveTimer <= 0) botServe(b);
  }

  const receiver = (G.lastHitter + 1) % world.seats;
  const vproj = ball.vel.x * b.dir.x + ball.vel.z * b.dir.y;
  const incoming = G.state === 'rally' && ball.active && G.lastHitter >= 0 &&
                   G.lastHitter !== b.seat && receiver === b.seat && vproj > 0.1;

  if (incoming) {
    b.reactClock -= dt;
    if (b.reactClock <= 0) {
      const pred = predictAtPlane(ball.pos, ball.vel, b.dir, world.robotDist - 0.1, obstacles.forceFn);
      if (pred) {
        const along = pred.x * b.tan.x + pred.z * b.tan.y;
        b.targetAlong = THREE.MathUtils.clamp(along + b.errA, -(world.edgeHalf + 0.4), world.edgeHalf + 0.4);
        b.targetY = THREE.MathUtils.clamp(pred.y + b.errY, TABLE_TOP + 0.05, 1.9);
      }
      b.reactClock = Math.max(d.botReact * 0.6, 0.08);
    }
    const proj = ball.pos.x * b.dir.x + ball.pos.z * b.dir.y;
    if (b.cooldown <= 0 && !b.attempted && proj >= world.robotDist - 0.15 && proj <= world.robotDist + 0.28) {
      b.attempted = true;
      botPaddlePos(b, _pv);
      const reach = d.reach * Math.max(1, world.scale * 0.85);
      if (ball.pos.distanceTo(_pv) < reach) {
        const target = targetFor(b.seat, { power: 0.35 + Math.random() * 0.5, miss: Math.random() < d.missProb });
        const speed = THREE.MathUtils.lerp(d.botPower[0], d.botPower[1], Math.random()) * world.speedScale;
        ball.vel.copy(solveShot(ball.pos, target, speed, 0.07));
        afterHit(b.seat, 0.6);
        sfx.botHit(0.6);
        b.swingAnim = 1;
      } else {
        b.swingAnim = 1;          // visible whiff!
        sfx.swish();
      }
    }
  } else if (G.state === 'rally' || G.state === 'serve') {
    b.targetAlong = ball.active
      ? THREE.MathUtils.clamp((ball.pos.x * b.tan.x + ball.pos.z * b.tan.y) * 0.15, -0.5, 0.5)
      : 0;
    b.targetY = 1.08;
  }

  // hard speed cap — this is what lets good shots beat the bot
  const maxStep = G.diff.botSpeed * Math.max(1, world.scale * 0.8) * dt;
  const da = b.targetAlong - b.along, dy = b.targetY - b.y;
  const dist = Math.hypot(da, dy);
  if (dist > 1e-4) {
    const step = Math.min(dist, maxStep);
    b.along += (da / dist) * step;
    b.y += (dy / dist) * step;
  }
  b.swingAnim = Math.max(0, b.swingAnim - dt * 4);
}

// ---------- Frame update ----------
const clock = new THREE.Clock();
let acc = 0;
const FIXED_DT = 1 / 240;
const _pv = new THREE.Vector3();
const _from = new THREE.Vector3();
const _dir3 = new THREE.Vector3();

function physicsStep(dt) {
  for (const b of bots) updateBot(b, dt);
  P.cooldown = Math.max(0, P.cooldown - dt);
  P.swing = Math.max(0, P.swing - dt);

  if (ball.active) {
    ball.step(dt, obstacles.forceFn, ballEvents);
    obstacles.collideBall(ball);
    tryPlayerHit();

    if (G.state === 'rally') {
      if (obstacles.checkCapture(ball)) { resolvePoint('replay', 'swallowed'); return; }
      G.rallyClock += dt;
      if (G.rallyClock > 10) { resolvePoint('replay', 'let'); ball.hide(); return; }
      if (!ball.sunk && ball.vel.lengthSq() < 0.35 && ball.pos.y < TABLE_TOP + 0.12) {
        G.slowClock += dt;
        if (G.slowClock > 0.9) { floorOrOut(); return; }
      } else G.slowClock = 0;
    }
  }
}

function render(dt, t) {
  const flags = obstacles.flags;

  // --- player paddle smoothing (ice = slippery glide, drunk = wander + lag) ---
  let k = 26;
  if (flags.snowSlip) k = 9;
  if (flags.drunk) k = Math.min(k, 10);
  const kk = 1 - Math.exp(-k * dt);
  let tx = P.tx, ty = P.ty;
  if (flags.drunk) {
    tx += Math.sin(t * 1.1) * 0.3 + Math.sin(t * 2.3) * 0.12;
    ty += Math.cos(t * 1.4) * 0.15;
  }
  const px = P.x;
  P.x += (tx - P.x) * kk;
  P.y += (ty - P.y) * kk;
  P.vx = dt > 0 ? (P.x - px) / dt : 0;

  if (P.charging) {
    P.charge = THREE.MathUtils.clamp((performance.now() - P.chargeStart) / 1000 / CHARGE_TIME, 0, 1);
    ui.charge(P.charge);
  } else P.charge = 0;

  P.scale += ((flags.giantPaddle ? 2.1 : 1) - P.scale) * Math.min(1, dt * 6);
  playerPaddle.scale.setScalar(P.scale);

  const swingT = P.swing > 0 ? 1 - P.swing / SWING_TIME : 1;
  const lunge = P.swing > 0 ? Math.sin(swingT * Math.PI) * 0.34 : 0;
  const pull = P.charge * 0.14;
  playerPaddle.position.set(P.x, P.y, world.playerZ + pull - lunge);
  playerPaddle.rotation.set(
    -0.35 - P.charge * 0.55 + (P.swing > 0 ? Math.sin(swingT * Math.PI) * 0.9 : 0),
    P.x * -0.25 + P.vx * 0.02,
    P.vx * -0.03
  );
  playerPaddle.userData.rubberMat.emissiveIntensity = P.charge * 0.5;

  // --- bots ---
  for (const b of bots) {
    const bl = b.swingAnim > 0 ? Math.sin((1 - b.swingAnim) * Math.PI) * 0.3 : 0;
    botPaddlePos(b, _pv);
    _pv.addScaledVector(_dir3.set(b.dir.x, 0, b.dir.y), -0.02 - bl);
    b.paddle.position.copy(_pv);
    b.paddle.rotation.set(0.3 + bl * 1.4, b.faceY + Math.PI + b.along * 0.15, 0);
    b.avatarAlong += (b.along * 0.85 - b.avatarAlong) * (1 - Math.exp(-8 * dt));
    const bd = world.robotDist + 0.45;
    b.avatar.position.set(
      b.dir.x * bd + b.tan.x * b.avatarAlong,
      Math.sin(t * 1.7 + b.seat) * 0.025,
      b.dir.y * bd + b.tan.y * b.avatarAlong
    );
    b.avatar.userData.visorMat.color.setHex(G.state === 'rally' ? 0xff3322 : SEAT_META[G.mode].accent[b.seat]);
  }

  // --- serve: ball floats at paddle ---
  if (G.state === 'serve' && G.server === 0) {
    ball.mesh.visible = true;
    ball.mesh.position.set(P.x, Math.max(P.y, TABLE_TOP + 0.25) + 0.02, world.playerZ - 0.12);
  }

  // --- obstacles / world effects ---
  obstacles.update(dt);
  cam.shake = Math.max(cam.shake, obstacles.consumeShake());
  const q = obstacles.quake;
  if (q > 0) {
    cam.shake = Math.max(cam.shake, q * 0.3);
    table.group?.position.set((Math.random() - 0.5) * 0.03 * q, (Math.random() - 0.5) * 0.02 * q, 0);
  } else if (table.group) table.group.position.set(0, 0, 0);

  if (flags.strobe && (G.state === 'rally' || G.state === 'serve')) {
    renderer.toneMappingExposure = (t * 2.4) % 1 < 0.5 ? 1.05 : 0.45;   // ~2.4 flashes/sec
  } else renderer.toneMappingExposure = 1.05;

  renderer.domElement.style.filter = flags.drunk
    ? `blur(${(1.5 + Math.sin(t * 0.9)).toFixed(2)}px) saturate(1.35)`
    : '';

  // --- camera ---
  cam.kick = Math.max(0, cam.kick - dt * 4);
  cam.shake = Math.max(0, cam.shake - dt * 1.8);
  const sh = cam.shake * cam.shake;
  camera.position.set(
    P.x * 0.34 + (Math.random() - 0.5) * sh * 0.12,
    world.camY + (P.y - 1.15) * 0.28 + (Math.random() - 0.5) * sh * 0.10,
    world.camZ + cam.kick * 0.05
  );
  const lookZ = world.mode === 'classic' ? -world.halfL * 0.85 : -world.apothem * 0.6;
  camera.lookAt(P.x * 0.15, TABLE_TOP + 0.12, lookZ);
  if (flags.drunk) camera.rotation.z += Math.sin(t * 0.8) * 0.055;
  const targetFov = baseFov + cam.kick * 4;
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
  }

  renderer.render(scene, camera);
}

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  acc += dt;
  let n = 0;
  while (acc >= FIXED_DT && n < 20) {
    physicsStep(FIXED_DT);
    acc -= FIXED_DT;
    n++;
  }
  render(dt, clock.elapsedTime);
});

// initial table so the menu has a backdrop
table.rebuild();

// automation hook for tests
if (typeof window !== 'undefined') window.__game = { G, world, ball, get bots() { return bots; } };
