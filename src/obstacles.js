import * as THREE from 'three';
import { TABLE_TOP, BALL_RADIUS } from './constants.js';
import { Ball } from './ball.js';
import { softCircleTexture } from './texutil.js';
import { startLoop, stopLoop, stopAllLoops, sfx } from './audio.js';

const TYPES = ['fan', 'block', 'blackhole', 'fakeballs'];
const LABELS = {
  fan: '🌬️ CROSSWIND FAN',
  block: '🧱 FLOATING BLOCK',
  blackhole: '🕳️ BLACK HOLE',
  fakeballs: '🟡 DECOY BALLS',
};

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.active = [];          // [{type, ...state}]
    this.fakeBalls = [];       // pooled Ball instances (fake)
    for (let i = 0; i < 3; i++) this.fakeBalls.push(new Ball(scene, { fake: true }));
    this.time = 0;
    if (typeof window !== "undefined") window.__obstacles = this;   // automation hook
  }

  labels() {
    return this.active.map(o => LABELS[o.type]);
  }

  /** Escalating chaos: pick obstacle count from total points played. */
  setupForPoint(totalPoints, rng = Math.random) {
    this.clear();
    let count = 0;
    if (totalPoints >= 2 && totalPoints <= 4) count = 1;
    else if (totalPoints >= 5 && totalPoints <= 8) count = 1 + (rng() < 0.5 ? 1 : 0);
    else if (totalPoints >= 9) count = 2 + (rng() < 0.2 ? 1 : 0);

    const pool = [...TYPES];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(rng() * pool.length);
      const type = pool.splice(idx, 1)[0];
      this.spawn(type, rng);
    }
    return this.labels();
  }

  spawn(type, rng) {
    if (type === 'fan') this.spawnFan(rng);
    else if (type === 'block') this.spawnBlock(rng);
    else if (type === 'blackhole') this.spawnBlackHole(rng);
    else if (type === 'fakeballs') this.spawnFakeBalls(rng);
  }

  // ---------- FAN ----------
  spawnFan(rng) {
    const side = rng() < 0.5 ? -1 : 1;          // which x-side the fan sits on
    const zPos = (rng() * 1.4 - 0.7);           // band center along table
    const g = new THREE.Group();

    const metal = new THREE.MeshStandardMaterial({ color: 0x39404e, roughness: 0.4, metalness: 0.7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 1.15, 10), metal);
    pole.position.y = 0.575; pole.castShadow = true;
    g.add(pole);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 16), metal);
    foot.position.y = 0.025; foot.castShadow = true;
    g.add(foot);
    const ringM = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 10, 28), metal);
    ringM.position.y = 1.25;
    ringM.rotation.y = Math.PI / 2;
    g.add(ringM);
    // blades
    const blades = new THREE.Group();
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x9fd8ff, roughness: 0.3, metalness: 0.4, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.24), bladeMat);
      b.position.y = 0.14;
      const holder = new THREE.Group();
      holder.rotation.x = (i / 4) * Math.PI * 2;
      b.rotation.y = 0.6;
      holder.add(b);
      blades.add(holder);
    }
    blades.position.y = 1.25;
    g.add(blades);
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), metal);
    hub.position.y = 1.25;
    g.add(hub);

    g.position.set(side * 2.0, 0, zPos);
    g.rotation.y = side > 0 ? 0 : Math.PI;      // face across the table
    this.group.add(g);

    // wind streak particles
    const N = 40;
    const pts = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      seeds.push({ p: Math.random() * 4.0, y: 1.0 + Math.random() * 0.8, z: zPos + (Math.random() - 0.5) * 1.1 });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const streaks = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softCircleTexture(), color: 0xe8f6ff, size: 0.05, transparent: true, opacity: 0.5,
      depthWrite: false,
    }));
    this.group.add(streaks);

    startLoop('fan', 'wind');
    this.active.push({
      type: 'fan', dir: -side, zPos, strength: 3.2 + Math.random() * 1.2,
      blades, streaks, seeds, meshes: [g, streaks],
    });
  }

  // ---------- FLOATING BLOCK ----------
  spawnBlock(rng) {
    const x0 = (rng() * 1.0 - 0.5);
    const z0 = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.45);
    const size = new THREE.Vector3(0.52, 0.34, 0.14);
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshStandardMaterial({
        color: 0xb47dff, roughness: 0.25, metalness: 0.3,
        emissive: 0x5a2ea6, emissiveIntensity: 0.5,
      })
    );
    mesh.castShadow = true;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(mesh.geometry),
      new THREE.LineBasicMaterial({ color: 0xe6ccff, transparent: true, opacity: 0.8 })
    );
    mesh.add(edge);
    this.group.add(mesh);
    this.active.push({
      type: 'block', mesh, size,
      x0, z0, y0: TABLE_TOP + 0.55 + rng() * 0.3,
      phase: rng() * Math.PI * 2,
      ampX: 0.35 + rng() * 0.3, spdX: 0.5 + rng() * 0.4,
      ampY: 0.08, spdY: 1.3,
      pos: new THREE.Vector3(), meshes: [mesh],
    });
  }

  // ---------- BLACK HOLE ----------
  spawnBlackHole(rng) {
    const x0 = (rng() * 1.4 - 0.7);
    const z0 = (rng() * 1.2 - 0.6);
    const y0 = TABLE_TOP + 0.42 + rng() * 0.28;
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    g.add(core);
    // accretion disk
    const disk = new THREE.Mesh(
      new THREE.TorusGeometry(0.15, 0.028, 10, 40),
      new THREE.MeshBasicMaterial({ color: 0x8a2be2, transparent: true, opacity: 0.9 })
    );
    disk.rotation.x = Math.PI / 2.4;
    g.add(disk);
    const disk2 = new THREE.Mesh(
      new THREE.TorusGeometry(0.21, 0.012, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x3a0f8a, transparent: true, opacity: 0.6 })
    );
    disk2.rotation.x = Math.PI / 2.1;
    g.add(disk2);
    // swirl particles
    const N = 60;
    const pts = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) seeds.push({ a: Math.random() * Math.PI * 2, r: 0.14 + Math.random() * 0.3, s: 1.5 + Math.random() * 2.5, tilt: (Math.random() - 0.5) * 0.5 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const swirl = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softCircleTexture(), color: 0x7a2ee0, size: 0.026, transparent: true, opacity: 0.9,
      depthWrite: false,
    }));
    g.add(swirl);
    // glow halo so it reads against any backdrop
    const hc = document.createElement("canvas");
    hc.width = hc.height = 128;
    const hg = hc.getContext("2d");
    const rad = hg.createRadialGradient(64, 64, 6, 64, 64, 64);
    rad.addColorStop(0, "rgba(90,20,160,0.55)");
    rad.addColorStop(0.4, "rgba(120,40,200,0.30)");
    rad.addColorStop(1, "rgba(80,20,160,0)");
    hg.fillStyle = rad; hg.fillRect(0, 0, 128, 128);
    const haloTex = new THREE.CanvasTexture(hc);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false }));
    halo.scale.set(0.7, 0.7, 1);
    g.add(halo);
    const light = new THREE.PointLight(0x9b4dff, 1.4, 3.2);
    g.add(light);
    g.position.set(x0, y0, z0);
    this.group.add(g);
    startLoop('blackhole', 'hum');
    this.active.push({
      type: 'blackhole', g, disk, disk2, swirl, seeds,
      pos: new THREE.Vector3(x0, y0, z0),
      G: 2.9, captureR: 0.1, meshes: [g],
    });
  }

  // ---------- FAKE BALLS ----------
  spawnFakeBalls(rng) {
    const n = 2 + (rng() < 0.5 ? 1 : 0);
    const st = { type: 'fakeballs', n, timers: [], meshes: [] };
    for (let i = 0; i < n; i++) {
      st.timers.push(0.5 + i * 0.9);
      this.launchFake(i);
    }
    this.active.push(st);
  }

  launchFake(i) {
    const b = this.fakeBalls[i];
    const fromLeft = Math.random() < 0.5;
    const x = fromLeft ? -2.4 : 2.4;
    const z = Math.random() * 3 - 1.5;
    const y = 1.0 + Math.random() * 0.8;
    const vel = new THREE.Vector3(
      (fromLeft ? 1 : -1) * (1.6 + Math.random() * 1.6),
      1.6 + Math.random() * 1.6,
      (Math.random() - 0.5) * 2.4
    );
    b.spawn(new THREE.Vector3(x, y, z), vel);
  }

  /** Add obstacle accelerations to the ball. Shared by live physics AND robot prediction. */
  forceFn = (pos, vel, accel) => {
    for (const o of this.active) {
      if (o.type === 'fan') {
        if (pos.y > TABLE_TOP - 0.05 && pos.y < TABLE_TOP + 1.2 && Math.abs(pos.z - o.zPos) < 0.62 && Math.abs(pos.x) < 2.0) {
          accel.x += o.dir * o.strength;
        }
      } else if (o.type === 'blackhole') {
        _d.subVectors(o.pos, pos);
        const d2 = Math.max(_d.lengthSq(), 0.05);
        const mag = Math.min(o.G / d2, 16);
        accel.addScaledVector(_d.normalize(), mag);
      }
    }
  };

  /** Sphere-vs-block collision for any ball (real or fake). Returns true on hit. */
  collideBall(ball) {
    for (const o of this.active) {
      if (o.type !== 'block') continue;
      const p = ball.pos, half = o.size, c = o.pos;
      const cx = Math.max(c.x - half.x / 2, Math.min(p.x, c.x + half.x / 2));
      const cy = Math.max(c.y - half.y / 2, Math.min(p.y, c.y + half.y / 2));
      const cz = Math.max(c.z - half.z / 2, Math.min(p.z, c.z + half.z / 2));
      _d.set(p.x - cx, p.y - cy, p.z - cz);
      const dist = _d.length();
      if (dist < BALL_RADIUS && dist > 1e-6) {
        _d.normalize();
        p.addScaledVector(_d, BALL_RADIUS - dist + 0.002);
        const vDotN = ball.vel.dot(_d);
        if (vDotN < 0) {
          ball.vel.addScaledVector(_d, -1.75 * vDotN); // restitution ~0.75
          if (!ball.fake) {
            sfx.block();
            o.mesh.material.emissiveIntensity = 1.6;   // flash
          }
        }
        return true;
      }
    }
    return false;
  }

  /** Black hole capture check for the real ball. */
  checkCapture(ball) {
    for (const o of this.active) {
      if (o.type !== 'blackhole') continue;
      if (ball.pos.distanceTo(o.pos) < o.captureR) return true;
    }
    return false;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (const o of this.active) {
      if (o.type === 'fan') {
        o.blades.rotation.x += dt * 22;
        const attr = o.streaks.geometry.attributes.position;
        for (let i = 0; i < o.seeds.length; i++) {
          const s = o.seeds[i];
          s.p += dt * (2.2 + o.strength * 0.4);
          if (s.p > 4.0) { s.p = 0; s.y = 1.0 + Math.random() * 0.8; s.z = o.zPos + (Math.random() - 0.5) * 1.1; }
          const x = -o.dir * 2.0 + o.dir * s.p;
          attr.setXYZ(i, x, s.y, s.z);
        }
        attr.needsUpdate = true;
      } else if (o.type === 'block') {
        o.pos.set(
          o.x0 + Math.sin(t * o.spdX + o.phase) * o.ampX,
          o.y0 + Math.sin(t * o.spdY + o.phase) * o.ampY,
          o.z0
        );
        o.mesh.position.copy(o.pos);
        o.mesh.rotation.y = Math.sin(t * 0.4 + o.phase) * 0.3;
        o.mesh.material.emissiveIntensity += (0.5 - o.mesh.material.emissiveIntensity) * Math.min(1, dt * 5);
      } else if (o.type === 'blackhole') {
        o.disk.rotation.z += dt * 2.4;
        o.disk2.rotation.z -= dt * 1.6;
        const attr = o.swirl.geometry.attributes.position;
        for (let i = 0; i < o.seeds.length; i++) {
          const s = o.seeds[i];
          s.a += dt * s.s;
          s.r -= dt * 0.06;
          if (s.r < 0.1) s.r = 0.32 + Math.random() * 0.15;
          attr.setXYZ(i,
            Math.cos(s.a) * s.r,
            Math.sin(s.a * 0.7) * s.r * s.tilt,
            Math.sin(s.a) * s.r
          );
        }
        attr.needsUpdate = true;
      } else if (o.type === 'fakeballs') {
        for (let i = 0; i < o.n; i++) {
          const b = this.fakeBalls[i];
          b.step(dt, this.forceFn, null);
          this.collideBall(b);
          o.timers[i] -= dt;
          // relaunch when settled, drifting away, or on a timer
          if ((o.timers[i] <= 0 && Math.abs(b.pos.x) > 2.6) ||
              b.pos.y < 0.12 || Math.abs(b.pos.z) > 4.5 || Math.abs(b.pos.x) > 4.5) {
            this.launchFake(i);
            o.timers[i] = 2 + Math.random() * 2;
          }
        }
      }
    }
  }

  clear() {
    for (const o of this.active) {
      for (const m of o.meshes || []) this.group.remove(m);
    }
    this.active = [];
    for (const b of this.fakeBalls) b.hide();
    stopAllLoops();
  }
}
const _d = new THREE.Vector3();
