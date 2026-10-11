// Just Living — 3D logo module (Three.js)
// Extrudes the traced SVG logos into real 3D geometry, assembles the bones
// piece by piece, then idles with a float + mouse parallax.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Procedural pavé normal map: a tiling grid of domed stones, so the "diamond"
// material sparkles as the logo turns. Built once, shared by every instance.
let paveNormal = null, paveColor = null;
function paveMap() { pave(); return paveColor; }
function pave() {
  if (paveNormal) return paveNormal;
  const S = 512, n = 9, cell = S / n;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cy = (j + 0.5) * cell, r = cell * 0.5;
    for (const cx of [(i + 0.5) * cell + (j % 2 ? cell / 2 : 0), (i + 0.5) * cell + (j % 2 ? cell / 2 : 0) - S]) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      // flat table in the middle, steep crown facets, a tiny dark seat between stones
      g.addColorStop(0, '#fff'); g.addColorStop(0.28, '#f4f4f4'); g.addColorStop(0.5, '#a8a8a8'); g.addColorStop(0.8, '#3a3a3a'); g.addColorStop(0.95, '#101010'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // height -> tangent-space normal map
  const h = ctx.getImageData(0, 0, S, S).data;
  const out = ctx.createImageData(S, S), d = out.data, k = 9.0;
  const H = (x, y) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const len = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    d[o] = (-dx / len * 0.5 + 0.5) * 255; d[o + 1] = (-dy / len * 0.5 + 0.5) * 255; d[o + 2] = (1 / len * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  paveNormal = new THREE.CanvasTexture(c);
  paveNormal.wrapS = paveNormal.wrapT = THREE.RepeatWrapping;
  paveNormal.repeat.set(1 / 620, 1 / 620); // extrude UVs are in SVG units: ~69 units per stone
  // colour: gold metal bed showing between the stones, stones near-white with a grey edge
  const c2 = document.createElement('canvas'); c2.width = c2.height = S;
  const x2 = c2.getContext('2d');
  x2.fillStyle = '#b8902e'; x2.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cy = (j + 0.5) * cell, r = cell * 0.46;
    for (const cx of [(i + 0.5) * cell + (j % 2 ? cell / 2 : 0), (i + 0.5) * cell + (j % 2 ? cell / 2 : 0) - S]) {
      const g = x2.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eef1f6'); g.addColorStop(0.92, '#9aa0ab'); g.addColorStop(1, '#6f6a5a');
      x2.fillStyle = g; x2.beginPath(); x2.arc(cx, cy, r, 0, Math.PI * 2); x2.fill();
    }
  }
  paveColor = new THREE.CanvasTexture(c2);
  paveColor.colorSpace = THREE.SRGBColorSpace;
  paveColor.wrapS = paveColor.wrapT = THREE.RepeatWrapping;
  paveColor.repeat.set(1 / 620, 1 / 620);
  return paveNormal;
}

const gold = () => new THREE.MeshPhysicalMaterial({
  color: 0xf0c050, metalness: 1, roughness: 0.14, envMapIntensity: 2.2,
  clearcoat: 0.5, clearcoatRoughness: 0.2,
});
const paveStones = () => new THREE.MeshPhysicalMaterial({
  // diamonds are not metal: near-white dielectric, mirror-smooth, very high IOR, strong reflections
  map: paveMap(), color: 0xffffff, metalness: 0.75, roughness: 0.07, ior: 2.4, specularIntensity: 1,
  envMapIntensity: 2.4, normalMap: pave(), normalScale: new THREE.Vector2(3, 3),
  clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.25, iridescenceIOR: 2.0,
});
const MATERIALS = {
  gold,
  diamond: () => [paveStones(), gold()],   // pavé face, gold rim and walls like the real pendant
  bone: () => new THREE.MeshPhysicalMaterial({
    color: 0xe6dfcf, roughness: 0.6, metalness: 0.0,
    clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.4, sheenColor: 0xfff6e6,
  }),
  chrome: () => new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.14, metalness: 1.0, envMapIntensity: 1.6,
  }),
  black: () => new THREE.MeshPhysicalMaterial({
    color: 0x111111, roughness: 0.32, metalness: 0.1,
    clearcoat: 1.0, clearcoatRoughness: 0.18,
  }),
};

const ease = {
  outExpo: t => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  inOutCubic: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
};

export function createLogo3D(canvas, opts = {}) {
  const o = Object.assign({
    svg: 'assets/logo/jl-mark.svg',
    material: 'bone',
    depth: 170,        // extrude depth in SVG units
    bevel: 34,         // bevel size in SVG units (rounded "bone" edges)
    fit: 0.8,          // fraction of the visible viewport (both axes) the logo may fill
    offsetX: 0,        // shift, as a fraction of the visible width (+ = right); use for hero layouts
    offsetXMobile: 0,  // same, when the canvas is narrower than 760px
    offsetY: 0,        // fraction of the visible height (+ = up)
    narrowBelow: 760,  // canvas width under which the *Mobile overrides apply
    fitMobile: null,   // optional overrides for narrow canvases
    offsetYMobile: null,
    curveSegments: 10,
    assemble: true,    // fly the pieces in on load
    spin: true,        // slow idle rotation
    parallax: 0.8,     // cursor / gyroscope influence (radians)
    scrollRotate: 0,   // extra Y rotation per 1000px scrolled
    alpha: true,
    exposure: 1.15,
    onReady: null,
  }, opts);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: o.alpha, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 7.2);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const key = new THREE.DirectionalLight(0xfff4e0, 1.7); key.position.set(3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.4); rim.position.set(-4, -2, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const sp1 = new THREE.PointLight(0xffffff, 60, 0, 2); sp1.position.set(2.5, 3, 4); scene.add(sp1);
  const sp2 = new THREE.PointLight(0xfff0d0, 40, 0, 2); sp2.position.set(-3, 1.5, 3.5); scene.add(sp2);

  const root = new THREE.Group();   // handles idle rotation + parallax
  const logo = new THREE.Group();   // centered logo
  root.add(logo); scene.add(root);

  let material = MATERIALS[o.material in MATERIALS ? o.material : 'bone']();
  const pieces = [];               // { mesh, home:{pos,rot}, start:{pos,rot}, delay }
  let ready = false;
  let assembleT = o.assemble ? 0 : 1;   // 0..1 progress
  let assembleDir = 1;                  // 1 = assembling, -1 = exploding
  const clock = new THREE.Clock();
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollY = 0;

  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // keep the logo the same visual size across aspect ratios
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const visH = 2 * Math.tan(vFov / 2) * camera.position.z;
    const visW = visH * camera.aspect;
    const mobile = w < o.narrowBelow;
    const fit = mobile && o.fitMobile != null ? o.fitMobile : o.fit;
    const sc = Math.min((visH * fit) / baseSize.y, (visW * fit) / baseSize.x);
    logo.scale.setScalar(sc);
    root.position.x = visW * (mobile ? o.offsetXMobile : o.offsetX);
    root.position.y = visH * (mobile && o.offsetYMobile != null ? o.offsetYMobile : o.offsetY);
  }
  const baseSize = new THREE.Vector3(1, 1, 1);

  new SVGLoader().load(o.svg, data => {
    const bounds = new THREE.Box3();
    const geoms = [];
    for (const path of data.paths) {
      const shapes = SVGLoader.createShapes(path);
      for (const shape of shapes) {
        const g = new THREE.ExtrudeGeometry(shape, {
          depth: o.depth, bevelEnabled: true, bevelThickness: o.bevel, bevelSize: o.bevel,
          bevelSegments: 5, curveSegments: o.curveSegments,
        });
        g.computeBoundingBox();
        bounds.union(g.boundingBox);
        geoms.push(g);
      }
    }
    const size = new THREE.Vector3(); bounds.getSize(size);
    const center = new THREE.Vector3(); bounds.getCenter(center);
    baseSize.copy(size);

    geoms.forEach((g, i) => {
      // center each piece on its own origin so it can rotate in place, keep its offset
      g.computeBoundingBox();
      const c = new THREE.Vector3(); g.boundingBox.getCenter(c);
      g.translate(-c.x, -c.y, -c.z);
      g.computeVertexNormals();
      const mesh = new THREE.Mesh(g, material);
      const home = new THREE.Vector3(c.x - center.x, -(c.y - center.y), 0); // flip Y (SVG is y-down)
      mesh.position.copy(home);
      mesh.scale.y = -1; // flip the geometry itself too, so winding/normals stay right
      const r = (a) => (Math.random() - 0.5) * a;
      const start = {
        pos: new THREE.Vector3(home.x + r(size.x * 1.6), home.y + r(size.y * 1.6), r(size.x * 1.2) + size.x * 0.6),
        rot: new THREE.Euler(r(Math.PI * 1.5), r(Math.PI * 1.5), r(Math.PI)),
      };
      pieces.push({ mesh, home, start, delay: i * 0.09, lift: 0, pop: 0, spin: 0, kick: 0 });
      logo.add(mesh);
    });
    ready = true;
    resize();
    o.onReady && o.onReady(api);
  });

  function setMaterial(name) {
    if (!MATERIALS[name]) return;
    material = MATERIALS[name]();
    pieces.forEach(p => { p.mesh.material = material; });
  }
  function assemble() { assembleDir = 1; }
  function explode() { assembleDir = -1; }

  // ---------- interaction: cursor parallax, drag to spin, gyroscope, hover / tap on bones ----------
  const coarse = matchMedia('(pointer: coarse)').matches;
  const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, rx: 0, ry: 0, moved: false };
  const gyro = { on: false, x: 0, y: 0 };
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hovered = null;
  canvas.style.touchAction = 'pan-y'; // vertical scroll still works on phones, sideways drags spin the logo

  const toLocal = e => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width - 0.5) * 2, y: ((e.clientY - r.top) / r.height - 0.5) * 2, inside: e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom };
  };
  const pick = (x, y) => {
    if (!ready) return null;
    ndc.set(x, -y); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pieces.map(p => p.mesh), false)[0];
    return hit ? pieces.find(p => p.mesh === hit.object) : null;
  };
  const onMove = e => {
    const l = toLocal(e);
    if (drag.on) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.vy = dx * 0.006; drag.vx = dy * 0.004;
      drag.ry += drag.vy; drag.rx += drag.vx;
      drag.x = e.clientX; drag.y = e.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      return;
    }
    if (!coarse) {
      mouse.tx = l.x; mouse.ty = l.y;
      const h = l.inside ? pick(l.x, l.y) : null;
      if (h !== hovered) { hovered = h; canvas.style.cursor = h ? 'grab' : ''; }
    }
  };
  const onDown = e => {
    const l = toLocal(e); if (!l.inside) return;
    const h = pick(l.x, l.y);
    if (h) { h.kick += Math.PI * 2; h.pop = 1; }       // tap or click a bone: it spins once and pops forward
    drag.on = true; drag.moved = false; drag.x = e.clientX; drag.y = e.clientY; drag.vx = drag.vy = 0;
    canvas.style.cursor = 'grabbing';
    if (coarse && !gyro.on) askGyro();
  };
  const onUp = () => { if (!drag.on) return; drag.on = false; canvas.style.cursor = hovered ? 'grab' : ''; };

  // iPhone needs an explicit permission for the gyroscope, and only inside a tap
  function askGyro() {
    const start = () => { gyro.on = true; window.addEventListener('deviceorientation', e => {
      if (e.gamma == null) return;
      gyro.x = THREE.MathUtils.clamp(e.gamma / 35, -1, 1);           // left / right tilt
      gyro.y = THREE.MathUtils.clamp((e.beta - 45) / 35, -1, 1);     // front / back, 45° = holding it normally
    }, { passive: true }); };
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(r => { if (r === 'granted') start(); }).catch(() => {});
    } else if ('DeviceOrientationEvent' in window) start();
  }
  if (coarse) window.addEventListener('touchend', () => { if (!gyro.on) askGyro(); }, { once: true, passive: true });

  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });
  window.addEventListener('resize', resize);
  resize();

  let raf;
  function frame() {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    if (!ready) { renderer.render(scene, camera); return; }

    assembleT = THREE.MathUtils.clamp(assembleT + assembleDir * dt / 1.9, 0, 1);
    pieces.forEach((p, i) => {
      const local = THREE.MathUtils.clamp((assembleT * 1.9 - p.delay) / (1.9 - pieces.length * 0.09), 0, 1);
      const k = ease.outExpo(local);
      // hover lift / tap pop / click spin, all spring back on their own
      p.lift += ((p === hovered ? 1 : 0) - p.lift) * 0.12;
      p.pop *= 0.9;
      p.spin += (p.kick - p.spin) * 0.08;
      const lift = (p.lift * 0.08 + p.pop * 0.14) * baseSize.x;
      p.mesh.position.lerpVectors(p.start.pos, p.home, k);
      p.mesh.position.z += lift;
      p.mesh.position.y += Math.sin(t * 1.3 + i * 1.7) * baseSize.y * 0.004; // each bone breathes a little
      p.mesh.rotation.set(p.start.rot.x * (1 - k) + p.lift * 0.12, p.start.rot.y * (1 - k) + p.spin, p.start.rot.z * (1 - k) - p.lift * 0.08);
    });

    // drag inertia
    if (!drag.on) { drag.vx *= 0.94; drag.vy *= 0.94; drag.rx += drag.vx; drag.ry += drag.vy; }
    drag.rx = THREE.MathUtils.clamp(drag.rx, -0.9, 0.9);

    const tx = coarse ? gyro.x : mouse.tx, ty = coarse ? gyro.y : mouse.ty;
    mouse.x += (tx - mouse.x) * 0.1;
    mouse.y += (ty - mouse.y) * 0.1;
    const idleAmp = coarse ? 0.55 : 0.35;
    const idleY = o.spin ? Math.sin(t * 0.45) * idleAmp : 0;
    root.rotation.y = idleY + mouse.x * o.parallax + (scrollY / 1000) * o.scrollRotate + drag.ry;
    root.rotation.x = Math.sin(t * 0.6) * 0.06 + mouse.y * o.parallax * 0.55 + drag.rx;
    logo.position.y = Math.sin(t * 0.9) * 0.05;
    renderer.render(scene, camera);
  }
  frame();

  const api = { renderer, scene, camera, root, logo, pieces, setMaterial, assemble, explode,
    get assembled() { return assembleT; },
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); } };
  return api;
}
