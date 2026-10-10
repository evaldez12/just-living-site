// Just Living — 3D logo module (Three.js)
// Extrudes the traced SVG logos into real 3D geometry, assembles the bones
// piece by piece, then idles with a float + mouse parallax.
import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Procedural pavé normal map: a tiling grid of domed stones, so the "diamond"
// material sparkles as the logo turns. Built once, shared by every instance.
let paveNormal = null;
function pave() {
  if (paveNormal) return paveNormal;
  const S = 512, n = 10, cell = S / n;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cy = (j + 0.5) * cell, r = cell * 0.5;
    for (const cx of [(i + 0.5) * cell + (j % 2 ? cell / 2 : 0), (i + 0.5) * cell + (j % 2 ? cell / 2 : 0) - S]) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#c8c8c8'); g.addColorStop(0.9, '#303030'); g.addColorStop(1, '#000');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // height -> tangent-space normal map
  const h = ctx.getImageData(0, 0, S, S).data;
  const out = ctx.createImageData(S, S), d = out.data, k = 6.0;
  const H = (x, y) => h[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * k, dy = (H(x, y + 1) - H(x, y - 1)) * k;
    const len = Math.hypot(dx, dy, 1), o = (y * S + x) * 4;
    d[o] = (-dx / len * 0.5 + 0.5) * 255; d[o + 1] = (-dy / len * 0.5 + 0.5) * 255; d[o + 2] = (1 / len * 0.5 + 0.5) * 255; d[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  paveNormal = new THREE.CanvasTexture(c);
  paveNormal.wrapS = paveNormal.wrapT = THREE.RepeatWrapping;
  paveNormal.repeat.set(1 / 620, 1 / 620); // extrude UVs are in SVG units: ~62 units per stone
  return paveNormal;
}

const MATERIALS = {
  diamond: () => new THREE.MeshPhysicalMaterial({
    color: 0xf2f5ff, metalness: 0.9, roughness: 0.06, envMapIntensity: 3.2,
    normalMap: pave(), normalScale: new THREE.Vector2(1.6, 1.6),
    clearcoat: 1, clearcoatRoughness: 0.04, iridescence: 0.45, iridescenceIOR: 1.8,
  }),
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
  iced: () => new THREE.MeshPhysicalMaterial({
    color: 0xf4f7ff, roughness: 0.02, metalness: 0.55, transmission: 0.35, thickness: 0.6,
    ior: 2.4, clearcoat: 1, clearcoatRoughness: 0, envMapIntensity: 2.8, iridescence: 0.6,
    iridescenceIOR: 1.6, specularIntensity: 1,
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
    parallax: 0.55,    // mouse influence (radians)
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
      pieces.push({ mesh, home, start, delay: i * 0.09 });
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

  const onMove = e => {
    const r = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX);
    const cy = (e.touches ? e.touches[0].clientY : e.clientY);
    mouse.tx = ((cx - r.left) / r.width - 0.5) * 2;
    mouse.ty = ((cy - r.top) / r.height - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });
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
    for (const p of pieces) {
      const local = THREE.MathUtils.clamp((assembleT * 1.9 - p.delay) / (1.9 - pieces.length * 0.09), 0, 1);
      const k = ease.outExpo(local);
      p.mesh.position.lerpVectors(p.start.pos, p.home, k);
      p.mesh.rotation.set(p.start.rot.x * (1 - k), p.start.rot.y * (1 - k), p.start.rot.z * (1 - k));
    }

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    const idleY = o.spin ? Math.sin(t * 0.45) * 0.35 : 0;
    root.rotation.y = idleY + mouse.x * o.parallax + (scrollY / 1000) * o.scrollRotate;
    root.rotation.x = Math.sin(t * 0.6) * 0.06 + mouse.y * o.parallax * 0.55;
    logo.position.y = Math.sin(t * 0.9) * 0.05;
    renderer.render(scene, camera);
  }
  frame();

  const api = { renderer, scene, camera, root, logo, pieces, setMaterial, assemble, explode,
    get assembled() { return assembleT; },
    destroy() { cancelAnimationFrame(raf); renderer.dispose(); } };
  return api;
}
