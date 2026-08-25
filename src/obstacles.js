import * as THREE from 'three';
import { TABLE_TOP, BALL_RADIUS } from './constants.js';
import { world } from './world.js';
import { table } from './table.js';
import { Ball } from './ball.js';
import { softCircleTexture } from './texutil.js';
import { startLoop, stopLoop, stopAllLoops, sfx } from './audio.js';

const LABELS = {
  fan: '🌬️ CROSSWIND FAN',
  block: '🧱 FLOATING BLOCK',
  blackhole: '🕳️ BLACK HOLE',
  fakeballs: '🟡 DECOY BALLS',
  bumpy: '🪨 BUMPY TABLE',
  giant: '🐘 GIANT TABLE',
  tiny: '🐜 TINY TABLE',
  volcano: '🌋 VOLCANOES',
  meteor: '☄️ METEOR SHOWER',
  snow: '❄️ SNOW & ICE',
  drunk: '🍺 DRUNK MODE',
  giantpaddle: '🏓 GIANT PADDLE',
  quake: '🌍 EARTHQUAKES',
  bite: '👹 MONSTER BITE',
  strobe: '⚡ STROBE ⚠️',
};
const ALL_TYPES = Object.keys(LABELS);

export class ObstacleManager {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.active = [];
    this.roster = [];
    this.flags = { drunk: false, giantPaddle: false, strobe: false, snowSlip: false };
    this.quake = 0;
    this.pendingShake = 0;
    this.fakeBalls = [];
    for (let i = 0; i < 3; i++) this.fakeBalls.push(new Ball(scene, { fake: true }));
    this.bursts = [];          // transient particle explosions
    this.time = 0;
    if (typeof window !== 'undefined') window.__obstacles = this;   // automation hook
  }

  labels() { return this.roster.map(t => LABELS[t]); }

  /** Escalating chaos roll. Call BEFORE world.configure/table.rebuild. */
  roll(totalPoints, { allowStrobe = true } = {}) {
    this.clear();
    let count = 0;
    if (totalPoints >= 2 && totalPoints <= 4) count = 1;
    else if (totalPoints >= 5 && totalPoints <= 8) count = 1 + (Math.random() < 0.6 ? 1 : 0);
    else if (totalPoints >= 9) count = 2 + (Math.random() < 0.35 ? 1 : 0);

    const pool = ALL_TYPES.filter(t => allowStrobe || t !== 'strobe');
    const roster = [];
    for (let i = 0; i < count && pool.length; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      const t = pool.splice(idx, 1)[0];
      roster.push(t);
      // exclusions
      const drop = x => { const j = pool.indexOf(x); if (j >= 0) pool.splice(j, 1); };
      if (t === 'giant') drop('tiny');
      if (t === 'tiny') drop('giant');
    }
    this.roster = roster;
    return roster;
  }

  /** Spawn everything in the roster. Call AFTER world.configure + table.rebuild. */
  apply(roster) {
    this.roster = roster;
    for (const t of roster) this.spawn(t, Math.random);
  }

  spawn(type, rng = Math.random) {
    const fn = {
      fan: () => this.spawnFan(rng),
      block: () => this.spawnBlock(rng),
      blackhole: () => this.spawnBlackHole(rng),
      fakeballs: () => this.spawnFakeBalls(rng),
      bumpy: () => this.spawnBumpy(rng),
      volcano: () => this.spawnVolcano(rng),
      meteor: () => this.spawnMeteor(rng),
      snow: () => this.spawnSnow(rng),
      bite: () => this.spawnBite(rng),
      quake: () => { this.active.push({ type: 'quake', next: 2 + rng() * 3, phase: 0, meshes: [] }); },
      drunk: () => { this.flags.drunk = true; },
      giantpaddle: () => { this.flags.giantPaddle = true; },
      strobe: () => { this.flags.strobe = true; },
      giant: () => {}, tiny: () => {},          // handled by world scale
    }[type];
    if (fn) fn();
    if (!this.roster.includes(type)) this.roster.push(type);
  }

  // ---------- FAN ----------
  spawnFan(rng) {
    const side = rng() < 0.5 ? -1 : 1;
    const zPos = (rng() * 1.4 - 0.7) * world.scale;
    const standOff = Math.max(2.0, world.halfL + 0.7);
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
    g.position.set(side * standOff, 0, zPos);
    g.rotation.y = side > 0 ? 0 : Math.PI;
    this.group.add(g);

    const N = 40;
    const pts = new Float32Array(N * 3);
    const seeds = [];
    const span = standOff * 2;
    for (let i = 0; i < N; i++) {
      seeds.push({ p: Math.random() * span, y: 1.0 + Math.random() * 0.8, z: zPos + (Math.random() - 0.5) * 1.1 });
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
      type: 'fan', dir: -side, zPos, standOff, span, strength: 3.2 + Math.random() * 1.2,
      blades, streaks, seeds, meshes: [g, streaks],
    });
  }

  // ---------- FLOATING BLOCK ----------
  spawnBlock(rng) {
    const s = Math.max(0.7, world.scale);
    const x0 = (rng() * 1.0 - 0.5) * s;
    const z0 = (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.45) * s;
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
    const p = world.randomPointOnTable(0.8);
    const y0 = TABLE_TOP + 0.42 + rng() * 0.28;
    const g = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 24, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000 })
    );
    g.add(core);
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
    const hc = document.createElement('canvas');
    hc.width = hc.height = 128;
    const hg = hc.getContext('2d');
    const rad = hg.createRadialGradient(64, 64, 6, 64, 64, 64);
    rad.addColorStop(0, 'rgba(90,20,160,0.55)');
    rad.addColorStop(0.4, 'rgba(120,40,200,0.30)');
    rad.addColorStop(1, 'rgba(80,20,160,0)');
    hg.fillStyle = rad; hg.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false }));
    halo.scale.set(0.7, 0.7, 1);
    g.add(halo);
    const light = new THREE.PointLight(0x9b4dff, 1.4, 3.2);
    g.add(light);
    g.position.set(p.x, y0, p.z);
    this.group.add(g);
    startLoop('blackhole', 'hum');
    this.active.push({
      type: 'blackhole', g, disk, disk2, swirl, seeds,
      pos: new THREE.Vector3(p.x, y0, p.z),
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

  // ---------- BUMPY TABLE ----------
  spawnBumpy(rng) {
    const st = { type: 'bumpy', meshes: [] };
    const mat = new THREE.MeshStandardMaterial({ color: 0x2f66c4, roughness: 0.4 });
    const n = 8 + Math.floor(rng() * 4);
    for (let i = 0; i < n; i++) {
      const p = world.randomPointOnTable(0.85);
      if (world.distToNets(p.x, p.z) < 0.14) continue;
      const r = 0.10 + rng() * 0.07;
      const h = 0.035 + rng() * 0.025;
      world.surface.bumps.push({ x: p.x, z: p.z, r, h });
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), mat);
      m.scale.set(r, h, r);
      m.position.set(p.x, TABLE_TOP, p.z);
      m.castShadow = true;
      this.group.add(m);
      st.meshes.push(m);
    }
    this.active.push(st);
  }

  // ---------- VOLCANOES ----------
  spawnVolcano(rng) {
    const n = 1 + (rng() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      let p = world.randomPointOnTable(0.7);
      for (let tries = 0; tries < 10 && world.distToNets(p.x, p.z) < 0.3; tries++) {
        p = world.randomPointOnTable(0.7);
      }
      const baseR = 0.16, h = 0.24;
      const g = new THREE.Group();
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(baseR, h, 12, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x6b3a24, roughness: 0.9, flatShading: true, side: THREE.DoubleSide })
      );
      cone.position.y = h / 2;
      cone.castShadow = true;
      g.add(cone);
      const crater = new THREE.Mesh(
        new THREE.CircleGeometry(baseR * 0.35, 10),
        new THREE.MeshBasicMaterial({ color: 0xff5a1a })
      );
      crater.rotation.x = -Math.PI / 2;
      crater.position.y = h - 0.005;
      g.add(crater);
      g.position.set(p.x, TABLE_TOP, p.z);
      this.group.add(g);
      // lava particle fountain
      const N = 36;
      const pts = new Float32Array(N * 3).fill(9999);
      const seeds = Array.from({ length: N }, () => ({ life: -1, p: new THREE.Vector3(), v: new THREE.Vector3() }));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      const lava = new THREE.Points(geo, new THREE.PointsMaterial({
        map: softCircleTexture(), color: 0xff7a20, size: 0.045, transparent: true, opacity: 0.95, depthWrite: false,
      }));
      this.group.add(lava);
      this.active.push({
        type: 'volcano', x: p.x, z: p.z, baseR, h,
        nextEruption: 1.5 + rng() * 3, erupting: 0,
        crater: crater.material, lava, seeds,
        meshes: [g, lava],
      });
    }
  }

  // ---------- METEOR SHOWER ----------
  spawnMeteor(rng) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x54371f, roughness: 0.8, flatShading: true, emissive: 0xff5a1a, emissiveIntensity: 0.8 });
    this.active.push({
      type: 'meteor', timer: 1.0 + rng(), holesMade: 0, meteors: [], mat, meshes: [],
    });
  }

  launchMeteor(st) {
    const target = world.randomPointOnTable(0.85);
    // 25% chance it misses the table and just hits the lawn
    if (Math.random() < 0.25) { target.x += (Math.random() < 0.5 ? -1 : 1) * 2.5; target.z += (Math.random() * 2 - 1) * 2; }
    const dirA = Math.random() * Math.PI * 2;
    const start = new THREE.Vector3(target.x + Math.cos(dirA) * 3.2, 5.5, target.z + Math.sin(dirA) * 3.2);
    const flight = 0.9;
    const vel = new THREE.Vector3(
      (target.x - start.x) / flight,
      -(5.5 - TABLE_TOP) / flight,
      (target.z - start.z) / flight
    );
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.07, 0), st.mat);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softCircleTexture(), color: 0xff8030, transparent: true, opacity: 0.8, depthWrite: false,
    }));
    glow.scale.set(0.3, 0.3, 1);
    mesh.add(glow);
    this.group.add(mesh);
    st.meteors.push({ pos: start.clone(), vel, mesh });
    st.meshes.push(mesh);
    sfx.meteorWhistle?.();
  }

  // ---------- SNOW ----------
  spawnSnow(rng) {
    this.flags.snowSlip = true;
    world.surface.ice = true;
    table.setSnow();
    const N = 320;
    const pts = new Float32Array(N * 3);
    const seeds = [];
    for (let i = 0; i < N; i++) {
      seeds.push({
        x: (Math.random() * 2 - 1) * 5, y: Math.random() * 4.5, z: (Math.random() * 2 - 1) * 5,
        s: 0.35 + Math.random() * 0.5, ph: Math.random() * Math.PI * 2,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const flakes = new THREE.Points(geo, new THREE.PointsMaterial({
      map: softCircleTexture(), color: 0xffffff, size: 0.035, transparent: true, opacity: 0.85, depthWrite: false,
    }));
    this.group.add(flakes);
    this.active.push({ type: 'snow', flakes, seeds, meshes: [flakes] });
  }

  // ---------- MONSTER BITE ----------
  spawnBite(rng) {
    // pick a random point on the table boundary
    let edge, out, tan;
    if (world.mode === 'classic') {
      const side = Math.floor(rng() * 4);
      if (side < 2) {          // left/right edges
        const sx = side === 0 ? -1 : 1;
        edge = new THREE.Vector2(sx * world.halfW, (rng() * 2 - 1) * world.halfL * 0.6);
        out = new THREE.Vector2(sx, 0);
      } else {                 // far/near edges (avoid dead center where serves land)
        const sz = side === 2 ? -1 : 1;
        edge = new THREE.Vector2((rng() * 2 - 1) * world.halfW * 0.7, sz * world.halfL);
        out = new THREE.Vector2(0, sz);
      }
    } else {
      const k = Math.floor(rng() * 3);
      const d = world.seatDirs[k], t = world.seatTans[k];
      const lat = (rng() * 2 - 1) * world.edgeHalf * 0.5;
      edge = new THREE.Vector2(d.x * world.apothem + t.x * lat, d.y * world.apothem + t.y * lat);
      out = d.clone();
    }
    // Monster head
    const g = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x5a2d7a, roughness: 0.6, flatShading: true });
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 1), skinMat);
    head.scale.y = 1.15;
    head.castShadow = true;
    g.add(head);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe14d });
    for (const ex of [-0.14, 0.14]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), eyeMat);
      eye.position.set(ex, 0.16, -0.26);
      g.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(ex, 0.16, -0.30);
      g.add(pupil);
    }
    const toothMat = new THREE.MeshStandardMaterial({ color: 0xf5f5ea, roughness: 0.4 });
    for (let i = 0; i < 6; i++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.11, 5), toothMat);
      tooth.position.set(-0.2 + i * 0.08, -0.2, -0.26);
      tooth.rotation.x = Math.PI;
      g.add(tooth);
    }
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, Math.PI / 2), skinMat);
    jaw.position.y = -0.22;
    g.add(jaw);
    // stand outside the table pointing inward
    const standX = edge.x + out.x * 0.42, standZ = edge.y + out.y * 0.42;
    g.position.set(standX, -0.6, standZ);
    g.lookAt(edge.x, TABLE_TOP, edge.y);
    this.group.add(g);
    this.active.push({
      type: 'bite', g, jaw, t: 0, done: false,
      holeX: edge.x - out.x * 0.13, holeZ: edge.y - out.y * 0.13, holeR: 0.30,
      meshes: [g],
    });
  }

  // ---------- Forces (shared by live physics and bot prediction) ----------
  forceFn = (pos, vel, accel) => {
    for (const o of this.active) {
      if (o.type === 'fan') {
        if (pos.y > TABLE_TOP - 0.05 && pos.y < TABLE_TOP + 1.2 &&
            Math.abs(pos.z - o.zPos) < 0.62 && Math.abs(pos.x) < o.standOff) {
          accel.x += o.dir * o.strength;
        }
      } else if (o.type === 'blackhole') {
        _d.subVectors(o.pos, pos);
        const d2 = Math.max(_d.lengthSq(), 0.05);
        const mag = Math.min(o.G / d2, 16);
        accel.addScaledVector(_d.normalize(), mag);
      } else if (o.type === 'volcano' && o.erupting > 0) {
        const dx = pos.x - o.x, dz = pos.z - o.z;
        if (dx * dx + dz * dz < 0.09 && pos.y > TABLE_TOP && pos.y < TABLE_TOP + 1.4) {
          accel.y += 10;
          accel.x += (Math.random() - 0.5) * 4;
          accel.z += (Math.random() - 0.5) * 4;
        }
      } else if (o.type === 'quake' && this.quake > 0) {
        accel.x += (Math.random() - 0.5) * 7 * this.quake;
        accel.z += (Math.random() - 0.5) * 7 * this.quake;
      }
    }
  };

  /** Sphere collisions vs blocks and volcano cones. */
  collideBall(ball) {
    let hit = false;
    for (const o of this.active) {
      if (o.type === 'block') {
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
            ball.vel.addScaledVector(_d, -1.75 * vDotN);
            if (!ball.fake) {
              sfx.block();
              o.mesh.material.emissiveIntensity = 1.6;
            }
          }
          hit = true;
        }
      } else if (o.type === 'volcano') {
        const hRel = ball.pos.y - TABLE_TOP;
        if (hRel > -0.02 && hRel < o.h) {
          const rAt = o.baseR * (1 - hRel / o.h) + BALL_RADIUS;
          const dx = ball.pos.x - o.x, dz = ball.pos.z - o.z;
          const d = Math.hypot(dx, dz);
          if (d < rAt && d > 1e-6) {
            _d.set(dx / d, 0.4, dz / d).normalize();
            ball.pos.x = o.x + (dx / d) * rAt;
            ball.pos.z = o.z + (dz / d) * rAt;
            const vDotN = ball.vel.dot(_d);
            if (vDotN < 0) {
              ball.vel.addScaledVector(_d, -1.7 * vDotN);
              if (!ball.fake) sfx.block();
            }
            hit = true;
          }
        }
      }
    }
    return hit;
  }

  checkCapture(ball) {
    for (const o of this.active) {
      if (o.type === 'blackhole' && ball.pos.distanceTo(o.pos) < o.captureR) return true;
    }
    return false;
  }

  consumeShake() { const s = this.pendingShake; this.pendingShake = 0; return s; }

  burst(pos, color, n = 22, speed = 2.6) {
    const pts = new Float32Array(n * 3);
    const seeds = [];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, e = Math.random() * Math.PI / 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      seeds.push({
        p: pos.clone(),
        v: new THREE.Vector3(Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s * 1.4, Math.sin(a) * Math.cos(e) * s),
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const mat = new THREE.PointsMaterial({
      map: softCircleTexture(), color, size: 0.055, transparent: true, opacity: 1, depthWrite: false,
    });
    const mesh = new THREE.Points(geo, mat);
    this.group.add(mesh);
    this.bursts.push({ mesh, seeds, life: 0.7 });
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.quake = 0;

    for (const o of this.active) {
      if (o.type === 'fan') {
        o.blades.rotation.x += dt * 22;
        const attr = o.streaks.geometry.attributes.position;
        for (let i = 0; i < o.seeds.length; i++) {
          const s = o.seeds[i];
          s.p += dt * (2.2 + o.strength * 0.4);
          if (s.p > o.span) { s.p = 0; s.y = 1.0 + Math.random() * 0.8; s.z = o.zPos + (Math.random() - 0.5) * 1.1; }
          attr.setXYZ(i, -o.dir * o.standOff + o.dir * s.p, s.y, s.z);
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
          attr.setXYZ(i, Math.cos(s.a) * s.r, Math.sin(s.a * 0.7) * s.r * s.tilt, Math.sin(s.a) * s.r);
        }
        attr.needsUpdate = true;
      } else if (o.type === 'fakeballs') {
        for (let i = 0; i < o.n; i++) {
          const b = this.fakeBalls[i];
          b.step(dt, this.forceFn, null);
          this.collideBall(b);
          o.timers[i] -= dt;
          if ((o.timers[i] <= 0 && Math.abs(b.pos.x) > 2.6) ||
              b.pos.y < 0.12 || Math.abs(b.pos.z) > 4.5 || Math.abs(b.pos.x) > 4.5) {
            this.launchFake(i);
            o.timers[i] = 2 + Math.random() * 2;
          }
        }
      } else if (o.type === 'volcano') {
        if (o.erupting > 0) {
          o.erupting -= dt;
          o.crater.color.setHex(0xffa040);
          // feed lava particles
          for (const s of o.seeds) {
            if (s.life <= 0 && Math.random() < 0.4) {
              s.life = 0.5 + Math.random() * 0.4;
              s.p.set(o.x + (Math.random() - 0.5) * 0.04, TABLE_TOP + o.h, o.z + (Math.random() - 0.5) * 0.04);
              s.v.set((Math.random() - 0.5) * 1.4, 2.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.4);
            }
          }
        } else {
          o.nextEruption -= dt;
          o.crater.color.setHex(0xff5a1a);
          if (o.nextEruption <= 0) {
            o.erupting = 1.2;
            o.nextEruption = 2.5 + Math.random() * 3.5;
            sfx.eruption?.();
          }
        }
        const attr = o.lava.geometry.attributes.position;
        for (let i = 0; i < o.seeds.length; i++) {
          const s = o.seeds[i];
          if (s.life > 0) {
            s.life -= dt;
            s.v.y -= 6 * dt;
            s.p.addScaledVector(s.v, dt);
            attr.setXYZ(i, s.p.x, s.p.y, s.p.z);
          } else attr.setXYZ(i, 9999, 9999, 9999);
        }
        attr.needsUpdate = true;
      } else if (o.type === 'meteor') {
        o.timer -= dt;
        if (o.timer <= 0 && o.holesMade < 5 && o.meteors.length < 2) {
          this.launchMeteor(o);
          o.timer = 1.6 + Math.random() * 1.6;
        }
        for (let i = o.meteors.length - 1; i >= 0; i--) {
          const m = o.meteors[i];
          m.pos.addScaledVector(m.vel, dt);
          m.mesh.position.copy(m.pos);
          m.mesh.rotation.x += dt * 9; m.mesh.rotation.y += dt * 7;
          const impactY = world.containsPoint(m.pos.x, m.pos.z) ? TABLE_TOP : 0.02;
          if (m.pos.y <= impactY) {
            this.group.remove(m.mesh);
            o.meteors.splice(i, 1);
            if (impactY === TABLE_TOP && !world.surfaceAt(m.pos.x, m.pos.z).hole) {
              const r = 0.14 + Math.random() * 0.07;
              world.surface.holes.push({ x: m.pos.x, z: m.pos.z, r });
              table.addHoleDecal(m.pos.x, m.pos.z, r, 'meteor');
              o.holesMade++;
              this.burst(new THREE.Vector3(m.pos.x, TABLE_TOP + 0.05, m.pos.z), 0xff8030, 26, 3);
              this.pendingShake = Math.max(this.pendingShake, 0.5);
              sfx.boom?.();
            } else {
              this.burst(new THREE.Vector3(m.pos.x, impactY + 0.05, m.pos.z), 0x8a6a3a, 16, 2);
              this.pendingShake = Math.max(this.pendingShake, 0.2);
              sfx.boom?.(0.4);
            }
          }
        }
      } else if (o.type === 'snow') {
        const attr = o.flakes.geometry.attributes.position;
        for (let i = 0; i < o.seeds.length; i++) {
          const s = o.seeds[i];
          s.y -= dt * s.s;
          if (s.y < 0.02) s.y = 4.2 + Math.random() * 0.4;
          attr.setXYZ(i, s.x + Math.sin(t * 0.8 + s.ph) * 0.25, s.y, s.z + Math.cos(t * 0.6 + s.ph) * 0.2);
        }
        attr.needsUpdate = true;
      } else if (o.type === 'quake') {
        if (o.phase > 0) {
          o.phase -= dt;
          this.quake = Math.max(this.quake, Math.sin(Math.min(1, o.phase / 1.6) * Math.PI) * 0.9);
        } else {
          o.next -= dt;
          if (o.next <= 0) {
            o.phase = 1.6;
            o.next = 3.5 + Math.random() * 3.5;
            sfx.rumble?.();
          }
        }
      } else if (o.type === 'bite') {
        o.t += dt;
        const g = o.g;
        if (o.t < 0.7) {
          g.position.y = -0.6 + (o.t / 0.7) * (TABLE_TOP + 0.75);        // rise
        } else if (o.t < 1.0) {
          const c = (o.t - 0.7) / 0.3;
          o.jaw.position.y = -0.22 + Math.sin(c * Math.PI) * 0.12;       // chomp
          if (!o.done && c > 0.5) {
            o.done = true;
            world.surface.holes.push({ x: o.holeX, z: o.holeZ, r: o.holeR });
            table.addHoleDecal(o.holeX, o.holeZ, o.holeR, 'bite');
            this.pendingShake = Math.max(this.pendingShake, 0.35);
            sfx.chomp?.();
          }
        } else if (o.t < 2.2) {
          g.position.y = (TABLE_TOP + 0.15) - ((o.t - 1.0) / 1.2) * (TABLE_TOP + 0.9);  // sink
        } else {
          g.visible = false;
        }
      }
    }

    // transient bursts
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      if (b.life <= 0) {
        this.group.remove(b.mesh);
        b.mesh.geometry.dispose(); b.mesh.material.dispose();
        this.bursts.splice(i, 1);
        continue;
      }
      const attr = b.mesh.geometry.attributes.position;
      for (let j = 0; j < b.seeds.length; j++) {
        const s = b.seeds[j];
        s.v.y -= 7 * dt;
        s.p.addScaledVector(s.v, dt);
        attr.setXYZ(j, s.p.x, s.p.y, s.p.z);
      }
      attr.needsUpdate = true;
      b.mesh.material.opacity = Math.min(1, b.life / 0.35);
    }
  }

  clear() {
    for (const o of this.active) {
      for (const m of o.meshes || []) this.group.remove(m);
    }
    for (const b of this.bursts) this.group.remove(b.mesh);
    this.bursts = [];
    this.active = [];
    this.roster = [];
    this.flags = { drunk: false, giantPaddle: false, strobe: false, snowSlip: false };
    this.quake = 0;
    this.pendingShake = 0;
    for (const b of this.fakeBalls) b.hide();
    stopAllLoops();
  }
}
const _d = new THREE.Vector3();
