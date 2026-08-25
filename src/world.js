import * as THREE from 'three';
import { TABLE, TABLE_TOP } from './constants.js';

/**
 * Mutable per-point world configuration: table shape/size, seats, surface
 * features (holes, bumps, ice). Reconfigured at the start of every point.
 * Classic mode = 2 seats (you at +z, bot at -z). Triangle mode = 3 seats,
 * each behind one edge of an equilateral table; you pass to (hitter+1)%3.
 */
export const world = {
  mode: 'classic',
  scale: 1,
  seats: 2,
  halfW: TABLE.WIDTH / 2,
  halfL: TABLE.LENGTH / 2,
  apothem: 1.0,               // triangle: center -> edge
  edgeHalf: TABLE.WIDTH / 2,  // half-length of each seat's baseline edge
  playerZ: 1.62,
  robotDist: 1.62,            // paddle-plane distance from center (all seats)
  camZ: 2.42,
  camY: 1.52,
  playerXRange: 1.18,
  hasNet: true,
  nets: [],                   // net segments {ax,az,bx,bz,nx,nz} in xz
  speedScale: 1,
  seatDirs: [],               // Vector2 outward per seat (xz)
  seatTans: [],               // Vector2 edge tangent per seat
  surface: { holes: [], bumps: [], ice: false },

  configure({ mode = 'classic', scale = 1 } = {}) {
    this.mode = mode;
    this.scale = scale;
    this.surface = { holes: [], bumps: [], ice: false };
    if (mode === 'classic') {
      this.seats = 2;
      this.halfW = (TABLE.WIDTH / 2) * scale;
      this.halfL = (TABLE.LENGTH / 2) * scale;
      this.edgeHalf = this.halfW;
      this.playerZ = this.halfL + 0.26;
      this.robotDist = this.halfL + 0.26;
      this.camZ = this.halfL + 1.06;
      this.camY = 1.52 + Math.max(0, scale - 1) * 0.45;
      this.playerXRange = Math.max(1.18, this.halfW + 0.42);
      this.hasNet = true;
      this.speedScale = Math.pow(this.halfL / 1.37, 0.8);
      this.seatDirs = [new THREE.Vector2(0, 1), new THREE.Vector2(0, -1)];
      this.seatTans = [new THREE.Vector2(1, 0), new THREE.Vector2(-1, 0)];
      const nw = this.halfW + 0.16;
      this.nets = [{ ax: -nw, az: 0, bx: nw, bz: 0, nx: 0, nz: 1 }];
    } else {
      this.seats = 3;
      this.apothem = 0.95 * scale;
      this.edgeHalf = this.apothem * Math.tan(Math.PI / 3);
      this.playerZ = this.apothem + 0.26;
      this.robotDist = this.apothem + 0.26;
      this.camZ = this.apothem + 1.12;
      this.camY = 1.55 + Math.max(0, scale - 1) * 0.45;
      this.playerXRange = Math.max(1.4, this.edgeHalf * 0.9);
      this.hasNet = false;
      this.speedScale = 0.92 * Math.pow(scale, 0.8);
      this.seatDirs = []; this.seatTans = [];
      for (let k = 0; k < 3; k++) {
        const th = (k * Math.PI * 2) / 3;   // seat0 +z, seat1 right (+x), seat2 left
        this.seatDirs.push(new THREE.Vector2(Math.sin(th), Math.cos(th)));
        this.seatTans.push(new THREE.Vector2(Math.cos(th), -Math.sin(th)));
      }
      // three nets, center -> each vertex (sector boundaries)
      this.nets = [];
      const Rc = this.apothem * 2;
      for (let j = 0; j < 3; j++) {
        const th = THREE.MathUtils.degToRad(60 + 120 * j);
        const vx = Math.sin(th), vz = Math.cos(th);
        this.nets.push({ ax: 0, az: 0, bx: vx * Rc, bz: vz * Rc, nx: Math.cos(th), nz: -Math.sin(th) });
      }
    }
  },

  containsPoint(x, z) {
    if (this.mode === 'classic') {
      return Math.abs(x) <= this.halfW + 0.01 && Math.abs(z) <= this.halfL + 0.01;
    }
    for (const d of this.seatDirs) if (x * d.x + z * d.y > this.apothem + 0.01) return false;
    return true;
  },

  sectorOf(x, z) {
    if (this.mode === 'classic') return z >= 0 ? 0 : 1;
    let best = 0, bv = -Infinity;
    for (let k = 0; k < 3; k++) {
      const d = this.seatDirs[k];
      const v = x * d.x + z * d.y;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  },

  randomPointOnTable(marginFrac = 0.85) {
    if (this.mode === 'classic') {
      return {
        x: (Math.random() * 2 - 1) * this.halfW * marginFrac,
        z: (Math.random() * 2 - 1) * this.halfL * marginFrac,
      };
    }
    for (let i = 0; i < 40; i++) {
      const x = (Math.random() * 2 - 1) * this.apothem * 1.8;
      const z = (Math.random() * 2 - 1) * this.apothem * 1.8;
      let ok = true;
      for (const d of this.seatDirs) if (x * d.x + z * d.y > this.apothem * marginFrac) { ok = false; break; }
      if (ok) return { x, z };
    }
    return { x: 0, z: 0 };
  },

  /** Random legal landing point inside `seat`'s sector. depthFrac 0..1 (how deep). */
  sectorTarget(seat, depthFrac, latFrac) {
    if (this.mode === 'classic') {
      const d = this.seatDirs[seat];
      return {
        x: latFrac * this.halfW * 0.78,
        y: TABLE_TOP,
        z: d.y * this.halfL * (0.30 + 0.58 * depthFrac),
      };
    }
    const dir = this.seatDirs[seat], tan = this.seatTans[seat];
    for (let i = 0; i < 8; i++) {
      const depth = this.apothem * (0.28 + 0.52 * depthFrac);
      const lat = latFrac * this.apothem * 0.55;
      const x = dir.x * depth + tan.x * lat;
      const z = dir.y * depth + tan.y * lat;
      if (this.containsPoint(x, z) && this.sectorOf(x, z) === seat) return { x, y: TABLE_TOP, z };
      latFrac *= 0.6;
    }
    return { x: dir.x * this.apothem * 0.5, y: TABLE_TOP, z: dir.y * this.apothem * 0.5 };
  },

  distToNets(x, z) {
    let best = Infinity;
    for (const net of this.nets) {
      const ux = net.bx - net.ax, uz = net.bz - net.az;
      const L2 = ux * ux + uz * uz;
      let t = ((x - net.ax) * ux + (z - net.az) * uz) / L2;
      t = Math.max(0, Math.min(1, t));
      best = Math.min(best, Math.hypot(x - (net.ax + ux * t), z - (net.az + uz * t)));
    }
    return best;
  },

  surfaceAt(x, z) {
    for (const h of this.surface.holes) {
      const dx = x - h.x, dz = z - h.z;
      if (dx * dx + dz * dz < h.r * h.r) return { hole: true };
    }
    let nx = 0, nz = 0;
    for (const b of this.surface.bumps) {
      const dx = x - b.x, dz = z - b.z;
      const d2 = dx * dx + dz * dz;
      const s2 = b.r * b.r;
      if (d2 < s2 * 4) {
        const d = Math.sqrt(d2) + 1e-6;
        const f = Math.exp(-d2 / s2) * b.h * 9;
        nx += (dx / d) * f; nz += (dz / d) * f;
      }
    }
    if (nx || nz) {
      return { normal: new THREE.Vector3(nx, 1, nz).normalize(), ice: this.surface.ice };
    }
    return { ice: this.surface.ice };
  },
};
world.configure({});
