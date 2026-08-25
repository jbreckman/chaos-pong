import * as THREE from 'three';
import { TABLE, TABLE_TOP, HALF_L, HALF_W, CAM_BASE, CAM_FOV, ROBOT_Z } from './constants.js';

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function createCamera() {
  const cam = new THREE.PerspectiveCamera(CAM_FOV, window.innerWidth / window.innerHeight, 0.05, 120);
  cam.position.set(CAM_BASE.x, CAM_BASE.y, CAM_BASE.z);
  cam.lookAt(0, TABLE_TOP + 0.1, -1.2);
  return cam;
}

export function createScene() {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xcfe6f5, 18, 55);

  // ---- Sky dome (vertical gradient) ----
  const sc = document.createElement('canvas');
  sc.width = 4; sc.height = 256;
  const sg = sc.getContext('2d');
  const skyGrad = sg.createLinearGradient(0, 0, 0, 256);
  skyGrad.addColorStop(0.0, '#3f8fd4');
  skyGrad.addColorStop(0.45, '#7dbde8');
  skyGrad.addColorStop(0.75, '#cfe9f7');
  skyGrad.addColorStop(1.0, '#e8f4e2');
  sg.fillStyle = skyGrad; sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sc);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(60, 24, 16),
    new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
  );
  scene.add(sky);

  // Sun disc
  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 24),
    new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false })
  );
  sun.position.set(22, 30, -38);
  sun.lookAt(0, 1, 0);
  scene.add(sun);

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight(0xbfe0ff, 0x4a7a3a, 0.85));
  const key = new THREE.DirectionalLight(0xfff2d9, 2.4);
  key.position.set(6, 9, -6);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 4;   key.shadow.camera.bottom = -3;
  key.shadow.camera.near = 2;  key.shadow.camera.far = 25;
  key.shadow.bias = -0.0015;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xd6ebff, 0.7);
  fill.position.set(-2, 2.2, 7);
  scene.add(fill);

  buildOutdoors(scene);
  buildTable(scene);
  return scene;
}

function buildOutdoors(scene) {
  // ---- Grass: tiled noisy green texture ----
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#4d8f3c'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 3800; i++) {
    const shade = 60 + Math.random() * 90;
    g.fillStyle = `rgba(${30 + Math.random() * 40}, ${shade + 40}, ${25 + Math.random() * 30}, 0.5)`;
    const x = Math.random() * 256, y = Math.random() * 256;
    g.fillRect(x, y, 1.5 + Math.random() * 2, 2 + Math.random() * 4);
  }
  const grassTex = new THREE.CanvasTexture(c);
  grassTex.colorSpace = THREE.SRGBColorSpace;
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(24, 24);
  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, metalness: 0 })
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  // ---- Court pad under the table (light concrete with chalk boundary) ----
  const pad = new THREE.Mesh(
    new THREE.PlaneGeometry(5.4, 7.6),
    new THREE.MeshStandardMaterial({ color: 0x9aa89a, roughness: 0.9 })
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.005;
  pad.receiveShadow = true;
  scene.add(pad);
  const chalkMat = new THREE.MeshBasicMaterial({ color: 0xf5f8f0 });
  const mkChalk = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), chalkMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.008, z);
    scene.add(m);
  };
  mkChalk(0.07, 7.6, -2.7, 0); mkChalk(0.07, 7.6, 2.7, 0);
  mkChalk(5.4, 0.07, 0, -3.8); mkChalk(5.4, 0.07, 0, 3.8);

  // ---- Bushes & shrubs (instanced icospheres) ----
  const bushGeo = new THREE.IcosahedronGeometry(1, 1);
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x2e6b2a, roughness: 0.9, flatShading: true });
  const shrubMat = new THREE.MeshStandardMaterial({ color: 0x3f8f38, roughness: 0.9, flatShading: true });
  const bushes = new THREE.InstancedMesh(bushGeo, bushMat, 34);
  const shrubs = new THREE.InstancedMesh(bushGeo, shrubMat, 40);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const place = (mesh, count, rMin, rMax, sMin, sMax, squash) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const r = rMin + Math.random() * (rMax - rMin);
      const sc = sMin + Math.random() * (sMax - sMin);
      p.set(Math.cos(a) * r, sc * squash * 0.55, Math.sin(a) * r * 0.85);
      // keep the player's sightline to the robot clear-ish behind the far end
      q.setFromEuler(new THREE.Euler(0, Math.random() * Math.PI, 0));
      s.set(sc, sc * squash, sc);
      m4.compose(p, q, s);
      mesh.setMatrixAt(i, m4);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false; mesh.receiveShadow = false;
    scene.add(mesh);
  };
  place(bushes, 34, 9, 22, 0.9, 2.2, 0.75);
  place(shrubs, 40, 5.5, 9, 0.35, 0.8, 0.8);

  // ---- A few simple trees on the horizon ----
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2a6e33, roughness: 0.85, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.4;
    const r = 16 + Math.random() * 14;
    const tree = new THREE.Group();
    const h = 2.2 + Math.random() * 1.6;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, h, 7), trunkMat);
    trunk.position.y = h / 2;
    tree.add(trunk);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + Math.random() * 0.8, 1), leafMat);
    crown.position.y = h + 0.7;
    crown.scale.y = 1.15;
    tree.add(crown);
    tree.position.set(Math.cos(a) * r, 0, Math.sin(a) * r * 0.8);
    scene.add(tree);
  }

  // ---- Clouds (flat billboards, always face up-ish; static) ----
  const cc = document.createElement('canvas');
  cc.width = 128; cc.height = 64;
  const cg = cc.getContext('2d');
  const blob = (x, y, r) => {
    const rad = cg.createRadialGradient(x, y, 0, x, y, r);
    rad.addColorStop(0, 'rgba(255,255,255,0.95)');
    rad.addColorStop(1, 'rgba(255,255,255,0)');
    cg.fillStyle = rad; cg.fillRect(0, 0, 128, 64);
  };
  blob(40, 34, 26); blob(64, 28, 30); blob(90, 36, 24); blob(56, 40, 22);
  const cloudTex = new THREE.CanvasTexture(cc);
  cloudTex.colorSpace = THREE.SRGBColorSpace;
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false });
  for (let i = 0; i < 8; i++) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), cloudMat);
    const a = (i / 8) * Math.PI * 2 + 0.9;
    cloud.position.set(Math.cos(a) * 32, 16 + Math.random() * 8, Math.sin(a) * 32);
    cloud.lookAt(0, 2, 0);
    scene.add(cloud);
  }
}

function buildTable(scene) {
  const group = new THREE.Group();

  const topMat = new THREE.MeshStandardMaterial({ color: 0x10418f, roughness: 0.35, metalness: 0.1 });
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(TABLE.WIDTH, TABLE.THICKNESS, TABLE.LENGTH), topMat);
  top.position.y = TABLE_TOP - TABLE.THICKNESS / 2;
  top.castShadow = true; top.receiveShadow = true;
  group.add(top);

  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lineY = TABLE_TOP + 0.001;
  const mkLine = (w, l, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, lineY, z);
    group.add(m);
  };
  const lw = 0.02;
  mkLine(lw, TABLE.LENGTH, -HALF_W + lw / 2, 0);
  mkLine(lw, TABLE.LENGTH,  HALF_W - lw / 2, 0);
  mkLine(TABLE.WIDTH, lw, 0, -HALF_L + lw / 2);
  mkLine(TABLE.WIDTH, lw, 0,  HALF_L - lw / 2);
  mkLine(0.006, TABLE.LENGTH, 0, 0);

  const legMat = new THREE.MeshStandardMaterial({ color: 0x30363f, roughness: 0.6, metalness: 0.5 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE_TOP - TABLE.THICKNESS, 0.06), legMat);
    leg.position.set(sx * (HALF_W - 0.14), (TABLE_TOP - TABLE.THICKNESS) / 2, sz * (HALF_L - 0.22));
    leg.castShadow = true;
    group.add(leg);
  }

  const netW = TABLE.WIDTH + TABLE.NET_OVERHANG * 2;
  const nc = document.createElement('canvas');
  nc.width = 256; nc.height = 32;
  const ng = nc.getContext('2d');
  ng.fillStyle = 'rgba(40,50,70,0.30)'; ng.fillRect(0, 0, 256, 32);
  ng.strokeStyle = 'rgba(30,38,55,0.9)'; ng.lineWidth = 1;
  for (let i = 0; i <= 64; i++) { ng.beginPath(); ng.moveTo(i * 4, 0); ng.lineTo(i * 4, 32); ng.stroke(); }
  for (let i = 0; i <= 8; i++) { ng.beginPath(); ng.moveTo(0, i * 4); ng.lineTo(256, i * 4); ng.stroke(); }
  ng.fillStyle = '#fff'; ng.fillRect(0, 0, 256, 3);
  const netTex = new THREE.CanvasTexture(nc);
  netTex.colorSpace = THREE.SRGBColorSpace;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(netW, TABLE.NET_HEIGHT),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, side: THREE.DoubleSide, depthWrite: false })
  );
  net.position.set(0, TABLE_TOP + TABLE.NET_HEIGHT / 2, 0);
  group.add(net);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x333844, roughness: 0.4, metalness: 0.6 });
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, TABLE.NET_HEIGHT + 0.03, 8), postMat);
    post.position.set(sx * netW / 2, TABLE_TOP + (TABLE.NET_HEIGHT + 0.03) / 2, 0);
    group.add(post);
  }

  scene.add(group);
}

// ---- Paddle ----
export function createPaddle(color = 0xd1342f) {
  const g = new THREE.Group();
  const rubberMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.02, emissive: color, emissiveIntensity: 0.0 });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.014, 28), rubberMat);
  face.rotation.x = Math.PI / 2;
  face.castShadow = true;
  g.add(face);
  const backMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.12 });
  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.093, 0.004, 28), backMat);
  back.rotation.x = Math.PI / 2;
  back.position.z = 0.009;
  g.add(back);
  const handle = new THREE.Mesh(
    new THREE.BoxGeometry(0.028, 0.105, 0.02),
    new THREE.MeshStandardMaterial({ color: 0xc9a06a, roughness: 0.7 })
  );
  handle.position.y = -0.14;
  handle.castShadow = true;
  g.add(handle);
  g.userData.rubberMat = rubberMat;
  return g;
}

// ---- Robot avatar ----
export function createRobot() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdde4ee, roughness: 0.35, metalness: 0.45 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x465064, roughness: 0.5, metalness: 0.5 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.3, 6, 14), bodyMat);
  torso.position.y = 1.06;
  torso.castShadow = true;
  g.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 16), bodyMat);
  head.position.y = 1.47;
  head.castShadow = true;
  g.add(head);

  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff6a2a });
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.04), eyeMat);
  visor.position.set(0, 1.49, 0.11);
  g.add(visor);
  g.userData.visorMat = eyeMat;

  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.12, 6), darkMat);
  ant.position.y = 1.65;
  g.add(ant);
  const antTip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), eyeMat);
  antTip.position.y = 1.72;
  g.add(antTip);

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.17, 0.09, 16), darkMat);
  base.position.y = 0.82;
  base.castShadow = true;
  g.add(base);
  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.15, 0.014, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x1fb8e8 })
  );
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = 0.78;
  g.add(glowRing);

  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.032, 0.3, 4, 10), darkMat);
  arm.rotation.z = Math.PI / 2.4;
  arm.position.set(0.24, 1.16, 0.06);
  g.add(arm);

  g.position.set(0, 0, ROBOT_Z - 0.45);
  return g;
}
