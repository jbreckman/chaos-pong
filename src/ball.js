import * as THREE from 'three';
import { softCircleTexture } from './texutil.js';
import {
  GRAVITY, BALL_RADIUS, BALL_RESTITUTION, BALL_FRICTION, AIR_DRAG,
  TABLE_TOP, NET_TOP,
} from './constants.js';
import { world } from './world.js';

const TRAIL_N = 26;

export class Ball {
  constructor(scene, { fake = false } = {}) {
    this.fake = fake;
    this.pos = new THREE.Vector3(0, 1.2, 0);
    this.vel = new THREE.Vector3();
    this.active = false;
    this.sunk = false;

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
    this.sunk = false;
    this.mesh.visible = true;
    this.trail.visible = true;
    for (let i = 0; i < TRAIL_N; i++) {
      this.trailPts[i * 3] = pos.x; this.trailPts[i * 3 + 1] = pos.y; this.trailPts[i * 3 + 2] = pos.z;
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }

  /**
   * forceFn(pos, vel, outAccel) adds obstacle accelerations.
   * events: { onBounceTable(sector, pos), onNet(), onHole(sector, pos), onFloor(pos), onOut() }
   */
  step(dt, forceFn, events) {
    if (!this.active) return;
    const p = this.pos, v = this.vel;

    _a.set(0, -GRAVITY, 0);
    if (forceFn) forceFn(p, v, _a);
    v.addScaledVector(_a, dt);
    v.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));

    const prevZ = p.z, prevY = p.y;
    p.addScaledVector(v, dt);

    // Net (classic mode only)
    if (!this.fake && world.hasNet && Math.sign(prevZ) !== Math.sign(p.z) && prevZ !== p.z) {
      const f = (0 - prevZ) / (p.z - prevZ);
      const yAt = p.y - v.y * dt * (1 - f);
      const xAt = p.x - v.x * dt * (1 - f);
      if (yAt < NET_TOP + BALL_RADIUS && yAt > TABLE_TOP - 0.05 && Math.abs(xAt) < world.halfW + 0.16) {
        p.z = prevZ > 0 ? 0.02 : -0.02;
        v.z *= -0.18;
        v.x *= 0.5;
        v.y = Math.min(v.y, 0.4) * 0.4;
        if (events?.onNet) events.onNet();
      }
    }

    // Table: only from above, and never after sinking through a hole
    if (!this.sunk && v.y < 0 &&
        p.y - BALL_RADIUS <= TABLE_TOP && prevY - BALL_RADIUS >= TABLE_TOP - 0.02 &&
        world.containsPoint(p.x, p.z)) {
      const surf = world.surfaceAt(p.x, p.z);
      if (surf.hole) {
        this.sunk = true;    // falls straight through
        if (!this.fake && events?.onHole) events.onHole(world.sectorOf(p.x, p.z), p.clone());
      } else {
        if (surf.normal) {
          const vn = v.dot(surf.normal);
          if (vn < 0) v.addScaledVector(surf.normal, -(1 + BALL_RESTITUTION) * vn);
          p.y = TABLE_TOP + BALL_RADIUS + 0.001;
        } else {
          p.y = TABLE_TOP + BALL_RADIUS;
          v.y = -v.y * (surf.ice ? 0.70 : BALL_RESTITUTION);
        }
        if (surf.ice) { v.x *= 1.02; v.z *= 1.02; }      // skids on ice
        else { v.x *= BALL_FRICTION; v.z *= BALL_FRICTION; }
        if (v.y < 0.3) v.y = Math.max(v.y, 0.0);
        if (events?.onBounceTable) events.onBounceTable(world.sectorOf(p.x, p.z), p.clone());
      }
    }

    // Floor
    if (v.y < 0 && p.y - BALL_RADIUS <= 0.0) {
      p.y = BALL_RADIUS;
      v.y = -v.y * 0.55;
      v.x *= 0.8; v.z *= 0.8;
      if (events?.onFloor) events.onFloor(p.clone());
    }

    if (Math.abs(p.x) > 8 || Math.abs(p.z) > 9 || p.y > 10) {
      if (events?.onOut) events.onOut();
    }

    this.mesh.position.copy(p);

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

/**
 * Simulate the real ball (obstacle forces + surface features included) until its
 * xz-projection onto seat direction `dir2` crosses `planeDist` moving outward.
 * Returns predicted {x, y, z, t} or null (floor / hole / never arrives).
 */
export function predictAtPlane(pos, vel, dir2, planeDist, forceFn, maxT = 3.0) {
  _sp.copy(pos); _sv.copy(vel);
  const dt = 1 / 120;
  for (let t = 0; t < maxT; t += dt) {
    _sa.set(0, -GRAVITY, 0);
    if (forceFn) forceFn(_sp, _sv, _sa);
    _sv.addScaledVector(_sa, dt);
    _sv.multiplyScalar(Math.max(0, 1 - AIR_DRAG * dt));
    const prevY = _sp.y;
    _sp.addScaledVector(_sv, dt);
    if (_sv.y < 0 && _sp.y - BALL_RADIUS <= TABLE_TOP && prevY - BALL_RADIUS >= TABLE_TOP - 0.02 &&
        world.containsPoint(_sp.x, _sp.z)) {
      const surf = world.surfaceAt(_sp.x, _sp.z);
      if (surf.hole) return null;
      if (surf.normal) {
        const vn = _sv.dot(surf.normal);
        if (vn < 0) _sv.addScaledVector(surf.normal, -(1 + BALL_RESTITUTION) * vn);
        _sp.y = TABLE_TOP + BALL_RADIUS + 0.001;
      } else {
        _sp.y = TABLE_TOP + BALL_RADIUS;
        _sv.y = -_sv.y * (surf.ice ? 0.70 : BALL_RESTITUTION);
      }
      if (surf.ice) { _sv.x *= 1.02; _sv.z *= 1.02; }
      else { _sv.x *= BALL_FRICTION; _sv.z *= BALL_FRICTION; }
    }
    if (_sp.y < 0.05) return null;
    const proj = _sp.x * dir2.x + _sp.z * dir2.y;
    const vproj = _sv.x * dir2.x + _sv.z * dir2.y;
    if (proj >= planeDist && vproj > 0) return { x: _sp.x, y: _sp.y, z: _sp.z, t };
  }
  return null;
}
const _sp = new THREE.Vector3();
const _sv = new THREE.Vector3();
const _sa = new THREE.Vector3();

/** Ballistic shot solver: raises the arc until the net (if any) is cleared. */
export function solveShot(from, target, hSpeed, netMargin = 0.06) {
  const dx = target.x - from.x;
  const dz = target.z - from.z;
  const d = Math.max(Math.hypot(dx, dz), 0.001);
  let T = d / hSpeed;
  let vy = 0;
  for (let i = 0; i < 5; i++) {
    vy = (target.y - from.y + 0.5 * GRAVITY * T * T) / T;
    if (world.hasNet) {
      const f = (0 - from.z) / dz;
      if (f > 0.02 && f < 0.98) {
        const t = f * T;
        const yAtNet = from.y + vy * t - 0.5 * GRAVITY * t * t;
        if (yAtNet < NET_TOP + BALL_RADIUS + netMargin) { T *= 1.16; continue; }
      }
    }
    break;
  }
  return new THREE.Vector3(dx / T, vy, dz / T);
}
