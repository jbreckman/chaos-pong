import * as THREE from 'three';
import {
  TABLE_TOP, HALF_W, GRAVITY,
  PLAYER_Z, PLAYER_X_RANGE, PLAYER_Y_MIN, PLAYER_Y_MAX,
  CHARGE_TIME, SWING_TIME, HIT_COOLDOWN, ROBOT_Z,
  CAM_BASE, CAM_FOV, DIFFICULTY, WIN_SCORE,
} from './constants.js';
import { createRenderer, createCamera, createScene, createPaddle, createRobot } from './scene.js';
import { Ball, predictAtZ, solveShot } from './ball.js';
import { ObstacleManager } from './obstacles.js';
import { ui } from './ui.js';
import { initAudio, sfx, stopAllLoops, startMusic, toggleMusic } from './audio.js';

// ---------- Setup ----------
const container = document.getElementById('app');
const renderer = createRenderer(container);
const camera = createCamera();
const scene = createScene();
const ball = new Ball(scene);
const obstacles = new ObstacleManager(scene);

const playerPaddle = createPaddle(0xd1342f);
scene.add(playerPaddle);
const botPaddle = createPaddle(0xff8833);
botPaddle.rotation.y = Math.PI;
scene.add(botPaddle);
const robot = createRobot();
scene.add(robot);

let baseFov = CAM_FOV;
function updateProjection() {
  const aspect = window.innerWidth / window.innerHeight;
  camera.aspect = aspect;
  // keep horizontal FOV constant on narrow (portrait) screens so the table stays in frame
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
  diff: DIFFICULTY.medium,
  score: { you: 0, bot: 0 },
  server: 'you',
  lastHitter: null,
  bouncedOpp: false,
  rallyClock: 0,            // time since last hit
  slowClock: 0,             // ball nearly stopped
  pointPending: null,       // timeout handle between points
  serveTimer: 0,            // bot serve delay
};

// Player paddle control
const P = {
  x: 0, y: 1.1,             // smoothed position
  tx: 0, ty: 1.1,           // target from pointer
  vx: 0, vy: 0,
  charging: false, chargeStart: 0, charge: 0,
  swing: 0,                 // >0 while swing window active
  swingPower: 0,
  cooldown: 0,
};

// Robot state
const B = {
  x: 0, y: 1.1,
  targetX: 0, targetY: 1.1,
  reactClock: 0,
  errX: 0, errY: 0,
  hasPrediction: false,
  cooldown: 0,
  swingAnim: 0,
};

// Camera juice
const cam = { shake: 0, kick: 0 };

// ---------- Input ----------
function pointerToTarget(e) {
  const nx = (e.clientX / window.innerWidth) * 2 - 1;
  const ny = -((e.clientY / window.innerHeight) * 2 - 1);
  P.tx = THREE.MathUtils.clamp(nx * PLAYER_X_RANGE * 1.15, -PLAYER_X_RANGE, PLAYER_X_RANGE);
  P.ty = THREE.MathUtils.clamp(
    PLAYER_Y_MIN + ((ny + 1) / 2) * (PLAYER_Y_MAX - PLAYER_Y_MIN) * 1.15,
    PLAYER_Y_MIN, PLAYER_Y_MAX
  );
}

window.addEventListener('pointermove', pointerToTarget, { passive: true });
window.addEventListener('pointerdown', (e) => {
  initAudio();
  if (e.target.closest('.overlay')) return;   // menu buttons
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
  if (G.state === 'serve' && G.server === 'you') {
    playerServe(power);
  } else if (G.state === 'rally') {
    P.swing = SWING_TIME;
    P.swingPower = power;
    sfx.swish();
  }
});
window.addEventListener('pointercancel', () => { P.charging = false; ui.charge(null); });
window.addEventListener('contextmenu', e => e.preventDefault());

// Menu buttons
document.querySelectorAll('#menu .btn').forEach(btn => {
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

// ---------- Match / point flow ----------
function startMatch() {
  startMusic();
  ui.showMenu(false);
  ui.showScoreboard(true);
  G.score.you = 0; G.score.bot = 0;
  ui.setScore(0, 0);
  G.state = 'point';
  startPoint(600);
}

function currentServer() {
  const total = G.score.you + G.score.bot;
  if (G.score.you >= 10 && G.score.bot >= 10) return total % 2 === 0 ? 'you' : 'bot';
  return Math.floor(total / 2) % 2 === 0 ? 'you' : 'bot';
}

function startPoint(delay = 1600) {
  clearTimeout(G.pointPending);
  G.pointPending = setTimeout(() => {
    const total = G.score.you + G.score.bot;
    const labels = obstacles.setupForPoint(total);
    ui.banner(labels);
    G.server = currentServer();
    ui.setServer(G.server);
    G.lastHitter = null;
    G.bouncedOpp = false;
    G.rallyClock = 0; G.slowClock = 0;
    P.cooldown = 0; B.cooldown = 0; B.hasPrediction = false;
    ball.hide();
    G.state = 'serve';
    if (G.server === 'you') {
      ui.hint('HOLD & RELEASE TO SERVE');
    } else {
      ui.hint('BOT SERVES…', 1200);
      G.serveTimer = 1.3;
    }
  }, delay);
}

function playerServe(power) {
  ui.clearHint();
  _from.set(P.x, Math.max(P.y, TABLE_TOP + 0.25), PLAYER_Z - 0.1);
  const target = {
    x: THREE.MathUtils.clamp(-P.x * 0.4 + (Math.random() - 0.5) * 0.5, -0.55, 0.55),
    y: TABLE_TOP,
    z: -(0.45 + power * 0.75),
  };
  const vel = solveShot(_from, target, 3.0 + power * 3.4);
  ball.spawn(_from, vel);
  afterHit('you', power);
  sfx.paddleHit(power);
  cam.kick = 0.4 + power * 0.7;
  G.state = 'rally';
}

function botServe() {
  const d = G.diff;
  _from.set(B.x, Math.max(B.y, TABLE_TOP + 0.3), ROBOT_Z + 0.1);
  const target = botPickTarget(d);
  const speed = THREE.MathUtils.lerp(d.botPower[0], d.botPower[1], Math.random()) * 0.85;
  ball.spawn(_from, solveShot(_from, target, speed));
  afterHit('bot', 0.5);
  sfx.botHit(0.5);
  B.swingAnim = 1;
  G.state = 'rally';
}

function afterHit(who, power) {
  G.lastHitter = who;
  G.bouncedOpp = false;
  G.rallyClock = 0;
  G.slowClock = 0;
  if (who === 'you') { P.cooldown = HIT_COOLDOWN; P.swing = 0; rollBotError(); }
  else B.cooldown = HIT_COOLDOWN;
}

function rollBotError() {
  const d = G.diff;
  B.errX = (Math.random() * 2 - 1) * d.botErr;
  B.errY = (Math.random() * 2 - 1) * d.botErr * 0.6;
  B.hasPrediction = false;
  B.reactClock = d.botReact;    // reaction delay before first prediction
}

function botPickTarget(d) {
  // Sometimes deliberately miss (difficulty-based)
  if (Math.random() < d.missProb) {
    if (Math.random() < 0.5) {
      return { x: (Math.random() < 0.5 ? -1 : 1) * (HALF_W + 0.15 + Math.random() * 0.3), y: TABLE_TOP, z: 0.5 + Math.random() * 0.6 };
    }
    return { x: (Math.random() * 2 - 1) * 0.5, y: TABLE_TOP, z: 1.75 + Math.random() * 0.5 }; // long
  }
  // Aim away from the player's paddle on harder settings
  const away = -Math.sign(P.x || (Math.random() - 0.5)) * (0.15 + Math.random() * 0.45);
  const mix = d === DIFFICULTY.hard ? 0.75 : d === DIFFICULTY.medium ? 0.4 : 0.1;
  const x = THREE.MathUtils.clamp(away * mix + (Math.random() * 2 - 1) * 0.4 * (1 - mix), -0.6, 0.6);
  return { x, y: TABLE_TOP, z: 0.45 + Math.random() * 0.75 };
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
  if (winner === 'you') { G.score.you++; sfx.pointWin(); }
  else { G.score.bot++; sfx.pointLose(); }
  ui.setScore(G.score.you, G.score.bot);
  cam.shake = Math.max(cam.shake, 0.35);

  const { you, bot } = G.score;
  const lead = Math.abs(you - bot);
  const over = (you >= WIN_SCORE || bot >= WIN_SCORE) && lead >= 2;

  let sub = reason;
  if (!over) {
    if (you >= 10 && bot >= 10 && you === bot) sub = 'DEUCE';
    else if (you >= WIN_SCORE - 1 && you > bot) sub = 'GAME POINT — YOU';
    else if (bot >= WIN_SCORE - 1 && bot > you) sub = 'GAME POINT — BOT';
  }
  ui.message(winner === 'you' ? 'YOU SCORE!' : 'BOT SCORES', sub, 1400);

  if (over) {
    G.state = 'gameover';
    obstacles.clear();
    stopAllLoops();
    if (you > bot) sfx.gameWin(); else sfx.gameLose();
    setTimeout(() => ui.showGameOver(you > bot, you, bot), 1300);
  } else {
    startPoint(1700);
  }
}

const opponentOf = w => (w === 'you' ? 'bot' : 'you');

const ballEvents = {
  onBounceTable(side) {
    sfx.bounce();
    if (G.state !== 'rally' || !G.lastHitter) return;
    const hitter = G.lastHitter;
    const hitterSide = hitter === 'you' ? 'player' : 'robot';
    if (side === hitterSide) {
      resolvePoint(opponentOf(hitter), hitter === 'you' ? 'your shot landed on your side' : 'bot hit its own side');
    } else {
      if (G.bouncedOpp) resolvePoint(hitter, hitter === 'you' ? 'double bounce — bot never touched it' : 'double bounce');
      else G.bouncedOpp = true;
    }
  },
  onNet() { sfx.net(); },
  onFloor() { floorOrOut(); },
  onOut() { floorOrOut(); },
};

function floorOrOut() {
  if (G.state !== 'rally') { ball.hide(); return; }
  const hitter = G.lastHitter;
  if (!hitter) { resolvePoint('replay', 'let'); return; }
  if (G.bouncedOpp) resolvePoint(hitter, hitter === 'you' ? 'bot missed the return' : 'you missed the return');
  else resolvePoint(opponentOf(hitter), hitter === 'you' ? 'you missed the table' : 'bot missed the table');
  ball.hide();
}

// ---------- Player hitting ----------
function tryPlayerHit(dt) {
  if (P.cooldown > 0 || !ball.active || G.state !== 'rally') return;
  if (ball.vel.z <= 0.2) return;                       // must be coming at us
  const inZone = ball.pos.z > PLAYER_Z - 0.65 && ball.pos.z < PLAYER_Z + 0.42;
  if (!inZone) return;
  _pv.set(P.x, P.y, PLAYER_Z);
  const dist = ball.pos.distanceTo(_pv);

  if (P.swing > 0 && dist < G.diff.hitRadius) {
    executePlayerHit(P.swingPower);
  } else if (dist < 0.22) {
    executePlayerHit(0.12, true);                      // passive block
  }
}

function executePlayerHit(power, passive = false) {
  const aimX = THREE.MathUtils.clamp(
    P.vx * 0.16 - P.x * 0.3 + (Math.random() * 2 - 1) * (passive ? 0.3 : 0.14),
    -0.62, 0.62
  );
  const depth = passive ? 0.35 + Math.random() * 0.3 : 0.42 + power * 0.78;
  const target = { x: aimX, y: TABLE_TOP, z: -depth };
  const speed = passive ? 2.6 : 3.1 + power * 4.1;
  const vel = solveShot(ball.pos, target, speed, passive ? 0.02 : 0.07);
  ball.vel.copy(vel);
  afterHit('you', power);
  sfx.paddleHit(power);
  cam.kick = 0.3 + power * 1.1;
  cam.shake = Math.max(cam.shake, 0.06 + power * 0.22);
}

// ---------- Robot AI ----------
function updateRobot(dt) {
  const d = G.diff;
  B.cooldown = Math.max(0, B.cooldown - dt);

  if (G.state === 'serve' && G.server === 'bot') {
    G.serveTimer -= dt;
    B.targetX = 0; B.targetY = 1.1;
    if (G.serveTimer <= 0) botServe();
  }

  const incoming = ball.active && ball.vel.z < -0.15 && G.state === 'rally';
  if (incoming) {
    B.reactClock -= dt;
    if (B.reactClock <= 0) {
      const pred = predictAtZ(ball.pos, ball.vel, ROBOT_Z + 0.12, obstacles.forceFn);
      if (pred) {
        B.targetX = THREE.MathUtils.clamp(pred.x + B.errX, -1.4, 1.4);
        B.targetY = THREE.MathUtils.clamp(pred.y + B.errY, TABLE_TOP + 0.05, 1.9);
        B.hasPrediction = true;
      }
      B.reactClock = Math.max(d.botReact * 0.6, 0.08);
    }
    // Hit when ball crosses the robot's plane
    if (B.cooldown <= 0 && ball.pos.z <= ROBOT_Z + 0.2 && ball.pos.z >= ROBOT_Z - 0.25) {
      _pv.set(B.x, B.y, ROBOT_Z);
      if (ball.pos.distanceTo(_pv) < d.reach) {
        const target = botPickTarget(d);
        const speed = THREE.MathUtils.lerp(d.botPower[0], d.botPower[1], Math.random());
        ball.vel.copy(solveShot(ball.pos, target, speed, 0.07));
        afterHit('bot', 0.6);
        sfx.botHit(0.6);
        B.swingAnim = 1;
      }
    }
  } else if (G.state === 'rally' || G.state === 'serve') {
    // ease back toward a ready position tracking the ball loosely
    B.targetX = ball.active ? THREE.MathUtils.clamp(ball.pos.x * 0.3, -0.5, 0.5) : 0;
    B.targetY = 1.08;
  }

  // Move paddle with capped speed
  const maxStep = d.botSpeed * dt;
  const dx = B.targetX - B.x, dy = B.targetY - B.y;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-4) {
    const step = Math.min(dist, maxStep);
    B.x += (dx / dist) * step;
    B.y += (dy / dist) * step;
  }
  B.swingAnim = Math.max(0, B.swingAnim - dt * 4);
}

// ---------- Frame update ----------
const clock = new THREE.Clock();
let acc = 0;
const FIXED_DT = 1 / 240;
const _pv = new THREE.Vector3();
const _from = new THREE.Vector3();

function physicsStep(dt) {
  updateRobot(dt);
  P.cooldown = Math.max(0, P.cooldown - dt);
  P.swing = Math.max(0, P.swing - dt);

  if (ball.active) {
    ball.step(dt, obstacles.forceFn, ballEvents);
    obstacles.collideBall(ball);
    tryPlayerHit(dt);

    if (G.state === 'rally') {
      if (obstacles.checkCapture(ball)) { resolvePoint('replay', 'swallowed'); return; }
      G.rallyClock += dt;
      if (G.rallyClock > 10) { resolvePoint('replay', 'let'); ball.hide(); return; }
      // ball dribbling to a stop on the table
      if (ball.vel.lengthSq() < 0.35 && ball.pos.y < TABLE_TOP + 0.12) {
        G.slowClock += dt;
        if (G.slowClock > 0.9) { floorOrOut(); return; }
      } else G.slowClock = 0;
    }
  }
}

function render(dt, t) {
  // --- player paddle smoothing ---
  const k = 1 - Math.exp(-26 * dt);
  const px = P.x;
  P.x += (P.tx - P.x) * k;
  P.y += (P.ty - P.y) * k;
  P.vx = dt > 0 ? (P.x - px) / dt : 0;

  // charge meter + paddle feedback
  if (P.charging) {
    P.charge = THREE.MathUtils.clamp((performance.now() - P.chargeStart) / 1000 / CHARGE_TIME, 0, 1);
    ui.charge(P.charge);
  } else P.charge = 0;

  const swingT = P.swing > 0 ? 1 - P.swing / SWING_TIME : 1; // 0->1 during swing
  const lunge = P.swing > 0 ? Math.sin(swingT * Math.PI) * 0.34 : 0;
  const pull = P.charge * 0.14;
  playerPaddle.position.set(P.x, P.y, PLAYER_Z + pull - lunge);
  playerPaddle.rotation.set(
    -0.35 - P.charge * 0.55 + (P.swing > 0 ? Math.sin(swingT * Math.PI) * 0.9 : 0),
    P.x * -0.25 + P.vx * 0.02,
    P.vx * -0.03
  );
  playerPaddle.userData.rubberMat.emissiveIntensity = P.charge * 0.5;

  // --- robot paddle & avatar ---
  const bl = B.swingAnim > 0 ? Math.sin((1 - B.swingAnim) * Math.PI) * 0.3 : 0;
  botPaddle.position.set(B.x, B.y, ROBOT_Z - 0.02 + bl);
  botPaddle.rotation.set(0.3 + bl * 1.4, Math.PI + B.x * 0.2, 0);
  robot.position.x += (B.x * 0.85 - robot.position.x) * (1 - Math.exp(-8 * dt));
  robot.position.y = Math.sin(t * 1.7) * 0.025;   // hover bob
  robot.rotation.z = (B.x * 0.85 - robot.position.x) * -0.4;
  robot.userData.visorMat.color.setHex(G.state === 'rally' ? 0xff5533 : 0xff9d4d);

  // --- serve: ball floats at paddle ---
  if (G.state === 'serve' && G.server === 'you') {
    ball.mesh.visible = true;
    ball.mesh.position.set(P.x, Math.max(P.y, TABLE_TOP + 0.25) + 0.02, PLAYER_Z - 0.12);
  }

  // --- obstacles ---
  obstacles.update(dt);

  // --- camera ---
  cam.kick = Math.max(0, cam.kick - dt * 4);
  cam.shake = Math.max(0, cam.shake - dt * 1.8);
  const sh = cam.shake * cam.shake;
  camera.position.set(
    CAM_BASE.x + P.x * 0.34 + (Math.random() - 0.5) * sh * 0.12,
    CAM_BASE.y + (P.y - 1.15) * 0.28 + (Math.random() - 0.5) * sh * 0.10,
    CAM_BASE.z + cam.kick * 0.05
  );
  camera.lookAt(P.x * 0.15, TABLE_TOP + 0.12, -1.25);
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

// Music toggle
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    initAudio();
    const on = toggleMusic();
    ui.hint(on ? '♪ MUSIC ON' : 'MUSIC OFF', 900);
  }
});
