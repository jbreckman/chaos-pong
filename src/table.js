import * as THREE from 'three';
import { TABLE, TABLE_TOP } from './constants.js';
import { world } from './world.js';

let scene = null;
let group = null;
let overlayFactory = null;

const topMat = new THREE.MeshStandardMaterial({ color: 0x10418f, roughness: 0.35, metalness: 0.1 });
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const legMat = new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.6, metalness: 0.5 });
const postMat = new THREE.MeshStandardMaterial({ color: 0x333844, roughness: 0.4, metalness: 0.6 });

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m && m !== topMat && m !== lineMat && m !== legMat && m !== postMat) m.dispose?.();
    }
  });
}

export const table = {
  init(s) { scene = s; },
  get group() { return group; },

  rebuild() {
    if (group) { disposeGroup(group); scene.remove(group); }
    group = new THREE.Group();
    if (world.mode === 'classic') buildRect(); else buildTri();
    scene.add(group);
  },

  /** Dark jagged hole decal ('meteor' = glowing rim, 'bite' = plain). */
  addHoleDecal(x, z, r, kind = 'meteor') {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.translate(64, 64);
    g.beginPath();
    const jag = [];
    for (let i = 0; i <= 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      const rr = i === 18 ? jag[0] : 46 + Math.random() * 14;
      jag.push(rr);
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
    }
    g.closePath();
    if (kind === 'meteor') {
      g.strokeStyle = 'rgba(255,120,30,0.95)'; g.lineWidth = 7; g.stroke();
    } else {
      g.strokeStyle = 'rgba(240,240,255,0.5)'; g.lineWidth = 4; g.stroke();
    }
    g.fillStyle = '#050508'; g.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(r * 2.2, r * 2.2),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
    );
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.random() * Math.PI * 2;
    m.position.set(x, TABLE_TOP + 0.003, z);
    group.add(m);
  },

  setSnow() {
    if (overlayFactory) {
      const top = overlayFactory();
      top.material = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.45, roughness: 0.9 });
      group.add(top);
    }
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(26, 40),
      new THREE.MeshStandardMaterial({ color: 0xf4f8ff, transparent: true, opacity: 0.55, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.012;
    group.add(ground);
  },
};

const _netTex = { tape: null, plain: null };
function netTexture(tape) {
  const key = tape ? 'tape' : 'plain';
  if (_netTex[key]) return _netTex[key];
  const nc = document.createElement('canvas');
  nc.width = 256; nc.height = 32;
  const ng = nc.getContext('2d');
  ng.fillStyle = 'rgba(40,50,70,0.30)'; ng.fillRect(0, 0, 256, 32);
  ng.strokeStyle = 'rgba(30,38,55,0.9)'; ng.lineWidth = 1;
  for (let i = 0; i <= 64; i++) { ng.beginPath(); ng.moveTo(i * 4, 0); ng.lineTo(i * 4, 32); ng.stroke(); }
  for (let i = 0; i <= 8; i++) { ng.beginPath(); ng.moveTo(0, i * 4); ng.lineTo(256, i * 4); ng.stroke(); }
  // classic net keeps its white top tape; triangle nets skip it so they don't
  // read as white lines painted on the table from the player's viewing angle
  if (tape) { ng.fillStyle = '#fff'; ng.fillRect(0, 0, 256, 3); }
  const tex = new THREE.CanvasTexture(nc);
  tex.colorSpace = THREE.SRGBColorSpace;
  _netTex[key] = tex;
  return tex;
}
function netMesh(len, tape = true) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(len, TABLE.NET_HEIGHT),
    new THREE.MeshBasicMaterial({ map: netTexture(tape), transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
}

function addLegs(points) {
  for (const [x, z] of points) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE_TOP - TABLE.THICKNESS, 0.06), legMat);
    leg.position.set(x, (TABLE_TOP - TABLE.THICKNESS) / 2, z);
    leg.castShadow = true;
    group.add(leg);
  }
}

function buildRect() {
  const W = world.halfW * 2, L = world.halfL * 2;
  const top = new THREE.Mesh(new THREE.BoxGeometry(W, TABLE.THICKNESS, L), topMat);
  top.position.y = TABLE_TOP - TABLE.THICKNESS / 2;
  top.castShadow = true; top.receiveShadow = true;
  group.add(top);
  overlayFactory = () => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W, L));
    m.rotation.x = -Math.PI / 2;
    m.position.y = TABLE_TOP + 0.0015;
    return m;
  };

  const lineY = TABLE_TOP + 0.001;
  const mkLine = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, lineY, z);
    group.add(m);
  };
  const lw = 0.02;
  mkLine(lw, L, -world.halfW + lw / 2, 0);
  mkLine(lw, L, world.halfW - lw / 2, 0);
  mkLine(W, lw, 0, -world.halfL + lw / 2);
  mkLine(W, lw, 0, world.halfL - lw / 2);
  mkLine(0.006, L, 0, 0);

  addLegs([
    [-(world.halfW - 0.14), world.halfL - 0.22], [world.halfW - 0.14, world.halfL - 0.22],
    [-(world.halfW - 0.14), -(world.halfL - 0.22)], [world.halfW - 0.14, -(world.halfL - 0.22)],
  ]);

  // Net
  const netW = W + TABLE.NET_OVERHANG * 2;
  const net = netMesh(netW);
  net.position.set(0, TABLE_TOP + TABLE.NET_HEIGHT / 2, 0);
  group.add(net);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TABLE.NET_HEIGHT + 0.03, 8), postMat);
    post.position.set(sx * netW / 2, TABLE_TOP + (TABLE.NET_HEIGHT + 0.03) / 2, 0);
    group.add(post);
  }
}

function buildTri() {
  const A = world.apothem;
  const Rc = A * 2;                     // circumradius of equilateral triangle
  // vertices between the seat edges (edge normals at 0/120/240 deg -> vertices at 60/180/300)
  const verts = [];
  for (let j = 0; j < 3; j++) {
    const th = THREE.MathUtils.degToRad(60 + 120 * j);
    verts.push([Math.sin(th) * Rc, Math.cos(th) * Rc]);
  }
  const shape = new THREE.Shape();
  shape.moveTo(verts[0][0], -verts[0][1]);   // shape y maps to -world z after rotateX
  shape.lineTo(verts[1][0], -verts[1][1]);
  shape.lineTo(verts[2][0], -verts[2][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: TABLE.THICKNESS, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  const top = new THREE.Mesh(geo, topMat);
  top.position.y = TABLE_TOP - TABLE.THICKNESS;
  top.castShadow = true; top.receiveShadow = true;
  group.add(top);
  overlayFactory = () => {
    const sg = new THREE.ShapeGeometry(shape);
    sg.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(sg);
    m.position.y = TABLE_TOP + 0.0015;
    return m;
  };

  // Edge lines
  const lineY = TABLE_TOP + 0.001;
  for (let j = 0; j < 3; j++) {
    const [x1, z1] = verts[j], [x2, z2] = verts[(j + 1) % 3];
    const len = Math.hypot(x2 - x1, z2 - z1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.022, len - 0.02), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, lineY, (z1 + z2) / 2);
    group.add(m);
  }
  // Three real nets along the sector dividers (center -> each vertex)
  const netY = TABLE_TOP + TABLE.NET_HEIGHT / 2;
  for (const [vx, vz] of verts) {
    const len = Math.hypot(vx, vz);
    const net = netMesh(len, false);
    net.rotation.y = Math.atan2(-vz, vx);
    net.position.set(vx / 2, netY, vz / 2);
    group.add(net);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TABLE.NET_HEIGHT + 0.03, 8), postMat);
    post.position.set(vx, TABLE_TOP + (TABLE.NET_HEIGHT + 0.03) / 2, vz);
    group.add(post);
  }
  const centerPost = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, TABLE.NET_HEIGHT + 0.04, 10), postMat);
  centerPost.position.y = TABLE_TOP + (TABLE.NET_HEIGHT + 0.04) / 2;
  group.add(centerPost);

  addLegs(verts.map(([x, z]) => [x * 0.72, z * 0.72]));
}
