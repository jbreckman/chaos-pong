import * as THREE from 'three';
import { softCircleTexture } from './texutil.js';
import {
  GRAVITY, BALL_RADIUS, BALL_RESTITUTION, BALL_FRICTION, AIR_DRAG,
  TABLE_TOP, NET_TOP, HALF_L, HALF_W,
} from './constants.js';

const TRAIL_N = 26;

export class Ball {
  constructor(scene, { fake = false } = {}) {
    this.fake = fake;
    this.pos = new THREE.Vector3(0, 1.2, 0);
    this.vel = new THREE.Vector3();
    this.active = false;

    const color = fake ? 0xffd83d : 0xffffff;
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 20, 16),
      new THREE.MeshStandardMaterial({
        color, roughness: 0.4, metalness: 0.0,
        emissive: color, emissiveIntensity: fake ? 0.28 : 0.22,
      })
    );
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    // Trail (points, fading size/alpha)
    this.trailPts = new Float32Array(TRAIL_N * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.BufferAttribute(this.trailPts, 3));
    this.trail = new THREE.Points(tg, new THREE.PointsMaterial({
      map: softCircleTexture(),
      color: fake ? 0xffb800 : 0x66c8ff,
      size: fake ? 0.03 : 0.038,
      transparent: true, opacity: fake ? 0.4 : 0.55,
      sizeAttenuation: true, depthWrite: false,
    }));
    scene.add(this.trail);
    this.trailIdx = 0;
    this.trailTimer = 0;
    this.hide();
  }

  hide() {
    this.active = false;
    this.mesh.visible = false;
    this.trail.visible = false;
  }

  spawn(pos, vel) {
    this.pos.copy(pos);
    this.vel.copy(vel);
    this.active = true;
    this.mesh.visible = true;
    this.trail.visible = true;
    for (let i = 0; i < TRAIL_N; i++) {
      this.trailPts[i * 3] = pos.x; this.trailPts[i * 3 + 1] = pos.y; this.trailPts[i * 3 + 2] = pos.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * Step physics. forceFn(pos, vel, outAccel) adds obstacle accelerations.
   * events: { onBounceTable(side), onNet(), onOut(), onBlockHit() } — only for real ball.
   */
  step(dt, forceFn, events) {
    if (!this.active) return;
    const p = this.pos, v = this.vel;

    // accelerations
    _a.set(0, -GRAVITY, 0);
    if (forceFn) forceFn(p, v, _a);
    v.addScaledVector(_a, dt);
    v.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));

    const prevZ = p.z;
    p.addScaledVector(v, dt);

    // Net collision (real ball crossing z=0 below net top)
    if (!this.fake && Math.sign(prevZ) !== Math.sign(p.z) && prevZ !== p.z) {
      const f = (0 - prevZ) / (p.z - prevZ);
      const yAt = p.y - v.y * dt * (1 - f);  // approx y at crossing
      const xAt = p.x - v.x * dt * (1 - f);
      if (yAt < NET_TOP + BALL_RADIUS && yAt > TABLE_TOP - 0.05 && Math.abs(xAt) < HALF_W + 0.16) {
        // hit the net: kill forward speed, drop
        p.z = prevZ > 0 ? 0.02 : -0.02;
        v.z *= -0.18;
        v.x *= 0.5;
        v.y = Math.min(v.y, 0.4) * 0.4;
        if (events?.onNet) events.onNet();
      }
    }

    // Table bounce
    if (v.y < 0 && p.y - BALL_RADIUS <= TABLE_TOP &&
        Math.abs(p.x) <= HALF_W + 0.01 && Math.abs(p.z) <= HALF_L + 0.01) {
      p.y = TABLE_TOP + BALL_RADIUS;
      v.y = -v.y * BALL_RESTITUTION;
      v.x *= BALL_FRICTION; v.z *= BALL_FRICTION;
      if (v.y < 0.3) v.y = Math.max(v.y, 0.0); // let it settle
      if (events?.onBounceTable) events.onBounceTable(p.z >= 0 ? 'player' : 'robot', p.clone());
    }

    // Floor
    if (v.y < 0 && p.y - BALL_RADIUS <= 0.0) {
      p.y = BALL_RADIUS;
      v.y = -v.y * 0.55;
      v.x *= 0.8; v.z *= 0.8;
      if (events?.onFloor) events.onFloor(p.clone());
    }

    // Far out of bounds
    if (Math.abs(p.x) > 6 || Math.abs(p.z) > 7 || p.y > 8) {
      if (events?.onOut) events.onOut();
    }

    this.mesh.position.copy(p);

    // Trail update (every ~12ms)
    this.trailTimer += dt;
    if (this.trailTimer > 0.012) {
      this.trailTimer = 0;
      this.trailIdx = (this.trailIdx + 1) % TRAIL_N;
      const i = this.trailIdx * 3;
      this.trailPts[i] = p.x; this.trailPts[i + 1] = p.y; this.trailPts[i + 2] = p.z;
      this.trail.geometry.attributes.position.needsUpdate = true;
    }
  }
}
const _a = new THREE.Vector3();

/** Simulate the real ball forward (obstacle forces included) until it reaches targetZ or times out.
 *  Returns predicted {x, y, t} at that plane, or null. Used by robot AI. */
export function predictAtZ(pos, vel, targetZ, forceFn, maxT = 3.0) {
  _sp.copy(pos); _sv.copy(vel);
  const dt = 1 / 120;
  const dir = Math.sign(targetZ - pos.z);
  for (let t = 0; t < maxT; t += dt) {
    _sa.set(0, -GRAVITY, 0);
    if (forceFn) forceFn(_sp, _sv, _sa);
    _sv.addScaledVector(_sa, dt);
    _sv.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));
    _sp.addScaledVector(_sv, dt);
    // table bounce in sim
    if (_sv.y < 0 && _sp.y - BALL_RADIUS <= TABLE_TOP &&
        Math.abs(_sp.x) <= HALF_W + 0.01 && Math.abs(_sp.z) <= HALF_L + 0.01) {
      _sp.y = TABLE_TOP + BALL_RADIUS;
      _sv.y = -_sv.y * BALL_RESTITUTION;
      _sv.x *= BALL_FRICTION; _sv.z *= BALL_FRICTION;
    }
    if (_sp.y < 0.05) return null; // hits floor first
    if (dir > 0 ? _sp.z >= targetZ : _sp.z <= targetZ) {
      return { x: _sp.x, y: _sp.y, t };
    }
  }
  return null;
}
const _sp = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _sa = new THREE.Vector3();

/** Ballistic shot solver: from -> lands near target with given horizontal speed.
 *  Raises the arc until the net is cleared. Returns a velocity Vector3. */
export function solveShot(from, target, hSpeed, netMargin = 0.06) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.max(Math.hypot(dx, dz), 0.001);
  let T = d / hSpeed;
  let vy = 0;
  for (let i = 0; i < 5; i++) {
    vy = (target.y - from.y + 0.5 * GRAVITY * T * T) / T;
    const f = (0 - from.z) / dz;
    if (f > 0.02 && f < 0.98) {
      const t = f * T;
      const yAtNet = from.y + vy * t - 0.5 * GRAVITY * t * t;
      if (yAtNet < NET_TOP + BALL_RADIUS + netMargin) { T *= 1.16; continue; }
    }
    break;
  }
  return new THREE.Vector3(dx / T, vy, dz / T);
}
