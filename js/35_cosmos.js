/* ================= THE MILKY WAY TURNING, AND THE SUN'S CORKSCREW PATH ================= */
const SCN = {};
const KMS_KPC_MYR = 1.0227e-3;            /* 1 km/s in kpc per million years */
const vRot = r => 230 * (1 - Math.exp(-r / 1.4));
const GX = { t: 0, speed: 2, built: false, sunR: 8.2, focus: 'galaxy' };

const GAL_VS = `
attribute vec4 g; attribute vec3 col; uniform float t; uniform float pr; uniform float scale; uniform float omP; uniform float bar;
varying vec3 vC; varying float vA;
${LOGV}
float vrot(float r){ return 230.0 * (1.0 - exp(-r / 1.4)); }
void main(){
  float r = g.x, kind = g.w;
  float ph;
  if (kind > 1.5) ph = g.y + bar * t;                       /* bar: turns as one solid block */
  else ph = g.y + vrot(r) * ${KMS_KPC_MYR} / max(r, 0.2) * t; /* everything else: each star at its own speed */
  vec3 p = vec3(r * cos(ph), g.z, r * sin(ph));
  /* spiral arms are a traffic jam that turns slower than the stars passing through it */
  float d = ph - omP * t + log(max(r, 0.5) / 4.0) * 4.3;   /* arms trail behind the rotation */
  float m2 = mod(d + 1.5708, 3.14159) - 1.5708;             /* two major arms */
  float m4 = mod(d + 0.7854, 1.5708) - 0.7854;              /* plus two minor arms */
  float arm = exp(-pow(m2 * r / 0.95, 2.0)) + 0.5 * exp(-pow(m4 * r / 0.7, 2.0));
  float dust = exp(-pow((m2 * r + 0.55) / 0.22, 2.0));
  arm *= smoothstep(2.5, 4.0, r) * (1.0 - smoothstep(13.0, 16.0, r));
  float b = kind > 0.5 ? 1.0 : (0.12 + 1.5 * arm) * (1.0 - 0.7 * dust);
  vC = kind > 0.5 ? col : mix(col, vec3(0.62, 0.78, 1.0), clamp(arm, 0.0, 1.0));
  vA = b;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(scale / -mv.z, 1.0, 6.0) * pr * (kind > 0.5 ? 1.0 : 0.8 + arm * 0.6);
  gl_Position = projectionMatrix * mv;
  ${LOGVM}
}`;
const GAL_FS = `varying vec3 vC; varying float vA; uniform float gain;
${LOGF}
void main(){ ${LOGFM} vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(vC * a * vA * gain, 1.0); }`;
function randn() { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }
function makeGalaxy(N, o = {}) {
  const g = new Float32Array(N * 4), col = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let r, ph, z, kind = 0, c;
    const u = Math.random();
    if (u < 0.12) { /* bulge */
      r = Math.abs(randn()) * 0.9; ph = Math.random() * TAU; z = randn() * 0.45 * Math.exp(-r / 2); kind = 1; c = [1.0, 0.78, 0.52];
    } else if (u < 0.2) { /* bar, about 4.5 kpc long, 27° from the Sun-centre line */
      const x = randn() * 2.2, y = randn() * 0.55; r = Math.hypot(x, y); ph = Math.atan2(y, x) + 0.47; z = randn() * 0.18; kind = 2; c = [1.0, 0.82, 0.6];
    } else { /* disc */
      do { r = -3.0 * Math.log(Math.random()); } while (r < 1 || r > 17);
      ph = Math.random() * TAU; z = randn() * 0.12 * (1 + r / 12); c = Math.random() < 0.5 ? [1.0, 0.88, 0.72] : [0.95, 0.93, 0.9];
    }
    g.set([r, ph, z, kind], i * 4); col.set(c, i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  geo.setAttribute('g', new THREE.BufferAttribute(g, 4)); geo.setAttribute('col', new THREE.BufferAttribute(col, 3));
  const uni = { t: { value: 0 }, pr: { value: Math.min(2, window.devicePixelRatio || 1) }, scale: { value: o.scale || 40 }, omP: { value: 28 * KMS_KPC_MYR }, bar: { value: 40 * KMS_KPC_MYR }, gain: { value: o.gain || 0.55 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: GAL_VS, fragmentShader: GAL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.userData.uni = uni;
  return pts;
}
function buildGalaxyScene() {
  const sc = new THREE.Scene(); scenes.galaxy = sc;
  const bg = new THREE.Mesh(new THREE.SphereGeometry(9e4, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x3a4152, depthWrite: false }));
  bg.renderOrder = -10; sc.add(bg); GX.bg = bg;
  GX.mw = makeGalaxy(GFX.quality === 'high' ? 160000 : 90000); sc.add(GX.mw);
  /* glow of the core */
  const core = sprite(GLOW_SUN, '#ffcc88', 7, 0.55); sc.add(core);
  /* Andromeda, 765 kpc away, tilted, approaching at ~110 km/s */
  GX.m31 = new THREE.Group(); const m = makeGalaxy(70000, { scale: 60, gain: 0.5 }); m.scale.setScalar(1.4); GX.m31.add(m); GX.m31.rotation.set(1.35, 0.4, 0.2); sc.add(GX.m31); GX.m31g = m;
  GX.m31dir = new V3(-0.45, -0.37, 0.81).normalize();
  /* the Sun */
  GX.sun = sprite(GLOW_SUN, '#ffe08a', 0.9, 1); sc.add(GX.sun);
  GX.sunRing = new Ribbon(361, '#ffcf6b', 1.2, { fade: 1, opacity: 0.28 }); sc.add(GX.sunRing.mesh);
  const ring = []; for (let i = 0; i <= 360; i++) { const a = i / 360 * TAU; ring.push(new V3(Math.cos(a) * GX.sunR, 0, Math.sin(a) * GX.sunR)); } GX.sunRing.set(ring);
  GX.sunTrail = new Ribbon(900, '#ffe08a', 2.4, { fade: 0.02, opacity: 0.95 }); sc.add(GX.sunTrail.mesh);
  GX.lSun = Labels.add('<b>The Sun</b><span>and all its planets</span>', 'craft', () => GX.sun.position.clone(), { scene: 'galaxy', occlude: false }); GX.lSun.el.style.setProperty('--c', '#ffe08a');
  GX.lCore = Labels.add('<b>Centre of the Milky Way</b><span>a black hole of 4 million Suns</span>', 'body', () => GX.focus === 'local' ? null : new V3(0, 0.2, 0), { scene: 'galaxy', occlude: false });
  GX.lM31 = Labels.add('<b>Andromeda Galaxy</b><span></span>', 'body', () => GX.m31.position.clone(), { scene: 'galaxy', occlude: false });
  GX.built = true;
  SCN.galaxy = { update: updateGalaxy };
}
function galSun(t) {
  const w = vRot(GX.sunR) * KMS_KPC_MYR / GX.sunR, ph = Math.PI + w * t;
  return new V3(GX.sunR * Math.cos(ph), 0.02 + 0.08 * 4 * Math.sin(TAU * t / 65 + 0.6), GX.sunR * Math.sin(ph));
}
function updateGalaxy(dt) {
  GX.t = clamp(GX.t + dt * GX.speed, -5000, 5000);
  GX.mw.userData.uni.t.value = GX.t; GX.m31g.userData.uni.t.value = GX.t;
  const s = galSun(GX.t); GX.sun.position.copy(s);
  GX.sun.scale.setScalar(Math.max(0.25, camera.position.distanceTo(s) * 0.03));
  const pts = []; const span = Math.min(230, 120 + Math.abs(GX.speed) * 8); for (let i = 0; i <= 300; i++) pts.push(galSun(GX.t - span + span * i / 300)); GX.sunTrail.set(pts);
  const d = Math.max(150, 765 - 110 * KMS_KPC_MYR * Math.max(0, GX.t));
  GX.m31.position.copy(GX.m31dir).multiplyScalar(d);
  GX.lM31.set(`<b>Andromeda Galaxy</b><span>${fmt(d * 3.2616 / 1000, 2)} million light years · coming closer at 110 km/s</span>`);
  GX.bg.position.copy(camera.position);
}
function enterGalaxy() {
  if (!GX.built) buildGalaxyScene();
  setTrails(''); setScene('galaxy'); GX.focus = 'galaxy';
  Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) }), dist: 38, az: 0.6, el: 0.75, worldUp: true }, 0.9);
  buildPanel();
}
function camGalaxy(which) {
  GX.focus = which;
  if (which === 'sun') Cam.go({ frame: () => ({ pos: GX.sun.position.clone(), fwd: GX.sun.position.clone().negate(), up: new V3(0, 1, 0) }), dist: 4.5, az: 0.5, el: 0.45, worldUp: true }, 1.0);
  else if (which === 'edge') Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) }), dist: 36, az: 0.2, el: 0.06, worldUp: true }, 1.0);
  else if (which === 'local') Cam.go({ frame: () => ({ pos: GX.m31.position.clone().multiplyScalar(0.5), fwd: GX.m31dir.clone(), up: new V3(0, 1, 0) }), dist: 1100, az: 1.2, el: 0.35, worldUp: true }, 0.9);
  else Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) }), dist: 38, az: 0.6, el: 0.75, worldUp: true }, 1.0);
}
function galaxyPanel() {
  const s = B.sec('The Milky Way', 'About 200 billion stars in a disc 100,000 light years wide. Every one of them is circling the centre.');
  const clock = document.createElement('div'); clock.className = 'now-card'; s.appendChild(clock);
  const draw = () => {
    if (!clock.isConnected) return;
    const year = 230 / 1, frac = GX.t / (TAU / (vRot(GX.sunR) * KMS_KPC_MYR / GX.sunR));
    clock.innerHTML = `<div class="nc-row"><span class="k">Time</span><b>${GX.t === 0 ? 'now' : (GX.t > 0 ? '+' : '−') + fmt(Math.abs(GX.t)) + ' million years'}</b></div>
      <div class="nc-row"><span class="k">Sun's trips round</span><b>${fmt(frac, 2)}</b></div>
      <div class="nc-row"><span class="k">Sun's speed</span><b>230 km/s · 828,000 km/h</b></div>`;
    setTimeout(draw, 250);
  };
  draw();
  B.chips(s, 'Speed', [[0, 'Pause'], [1, '1 million yrs/s'], [10, '10 million'], [100, '100 million']], () => GX.speed, v => { GX.speed = v; });
  B.buttons(s, [['Back to now', () => { GX.t = 0; }], ['Reverse', () => { GX.speed = -Math.abs(GX.speed || 10); }]]);
  const v = B.sec('Look');
  B.buttons(v, [['From above', () => camGalaxy('galaxy')], ['Edge on', () => camGalaxy('edge')], ['Follow the Sun', () => camGalaxy('sun')], ['Andromeda and us', () => camGalaxy('local')]]);
  const n = B.sec('What you are seeing');
  const p = document.createElement('p'); p.className = 'help';
  p.innerHTML = 'One trip round, a <b>galactic year</b>, takes the Sun about 220 million years. Last time it was here, the first dinosaurs were appearing.<br><br>Stars near the middle go round faster than stars at the edge. The bright <b>spiral arms</b> are not solid things: like traffic jams, stars drift in and out of them.<br><br>The Sun also bobs up and down through the disc every 60 to 70 million years (shown 4× bigger).<br><br>Andromeda, our big neighbour, is heading our way. A crash in about 5 billion years was long thought certain; measurements from 2025 put the odds closer to 50/50 within 10 billion years. The positions here are an illustration built from real sizes and speeds, not a map of individual stars.';
  n.appendChild(p);
  B.buttons(B.sec(''), [['Back to the solar system', () => { setScene('earth'); camFocus('sun', 160000, 0.3, 1.25); buildPanel(); }, 'primary']]);
}

/* ---------- the Sun's corkscrew: planets follow the Sun as it races round the galaxy ---------- */
const HX = { t: 0, speed: 1, built: false, bodies: [], zoom: 'inner' };
const AU_M = 1.495978707e11;
function galBasis() {
  const eq = (ra, dec) => { const a = ra * DEG, d = dec * DEG; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };
  const xg = eq(266.405, -28.936), zg = eq(192.859, 27.128), yg = norm(cross(zg, xg));
  return { xg, yg, zg };
}
function buildHelixScene() {
  const sc = new THREE.Scene(); scenes.helix = sc;
  const bg = new THREE.Mesh(new THREE.SphereGeometry(4e5, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x6c7488, depthWrite: false })); bg.renderOrder = -10; sc.add(bg); HX.bg = bg;
  HX.B = galBasis();
  const list = [['Sun', '#ffe08a', 0.034, 0]].concat(TRAIL_BODIES.map(([n, c, P]) => [n, c, n === 'Jupiter' || n === 'Saturn' ? 0.016 : 0.011, P]));
  HX.bodies = list.map(([name, color, size, P]) => {
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: name === 'Sun' ? GLOW_SUN : GLOW_SOFT, color, sizeAttenuation: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    spr.scale.setScalar(size * 2.2); sc.add(spr);
    const rib = new Ribbon(1800, color, name === 'Sun' ? 3 : name === 'Earth' ? 2.4 : 1.8, { fade: 0.02, opacity: 0.95 }); sc.add(rib.mesh);
    const L = Labels.add('<b>' + name + '</b>', 'body', () => spr.position.clone(), { scene: 'helix', occlude: false }); L.el.style.setProperty('--c', color);
    return { name, color, P, spr, rib, pts: [], last: null };
  });
  HX.arrow = Labels.add('<b>→ 230 km/s round the galaxy</b><span>toward the constellation Cygnus</span>', 'flag', () => HX.bodies[0].spr.position.clone().add(new V3(12, 6, 0)), { scene: 'helix', occlude: false });
  HX.built = true;
  SCN.helix = { update: updateHelix };
}
function hxMap(v) { const B = HX.B; return new V3(dot(v, B.yg), dot(v, B.zg), dot(v, B.xg)); }
function hxPos(b, t) {
  const sun = new V3(t * 230e3 * 3.15576e7 / AU_M, 0, 0);
  if (b.name === 'Sun') return sun;
  return sun.add(hxMap(helioEqj(b.name, new Date(HX.t0 + t * 3.15576e10)).map(x => x / AU_M)));
}
function updateHelix(dt) {
  const target = HX.t + dt * HX.speed, h = HX.zoom === 'outer' ? 0.05 : 0.008;
  const n = Math.min(80, Math.ceil(Math.abs(target - HX.t) / h));
  for (let k = 1; k <= n; k++) {
    const t = HX.t + (target - HX.t) * k / n;
    for (const b of HX.bodies) { b.pts.push(hxPos(b, t)); if (b.pts.length > 1800) b.pts.shift(); }
  }
  HX.t = target;
  for (const b of HX.bodies) { const p = hxPos(b, HX.t); b.spr.position.copy(p); if (n) b.rib.set(b.pts); }
  HX.bg.position.copy(camera.position);
}
function enterHelix() {
  if (!HX.built) buildHelixScene();
  setTrails(''); setScene('helix');
  HX.t = 0; HX.t0 = Clock.now().getTime(); HX.bodies.forEach(b => { b.pts = []; b.last = null; });
  camHelix('inner'); buildPanel();
}
function camHelix(which) {
  HX.zoom = which;
  const d = which === 'inner' ? 11 : which === 'side' ? 70 : 260;
  HX.speed = which === 'outer' ? 6 : 0.6;
  Cam.go({ frame: () => ({ pos: HX.bodies[0].spr.position.clone().add(new V3(-d * 0.15, 0, 0)), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) }), dist: d, az: which === 'side' ? 1.45 : 0.9, el: 0.3, worldUp: true }, 1.0);
}
function helixPanel() {
  const s = B.sec('The Sun\'s path through space', 'The planets don\'t trail behind the Sun: they circle it while it carries them all forward at 230 km/s, 7 times faster than Earth goes round the Sun.');
  const box = document.createElement('div'); box.className = 'now-card'; s.appendChild(box);
  const draw = () => { if (!box.isConnected) return; const km = HX.t * 230 * 3.15576e7; box.innerHTML = `<div class="nc-row"><span class="k">Years passed</span><b>${fmt(HX.t, 1)}</b></div><div class="nc-row"><span class="k">Distance travelled</span><b>${fmt(km / 1e9, 1)} billion km</b></div>`; setTimeout(draw, 250); };
  draw();
  B.chips(s, 'Speed', [[0, 'Pause'], [0.25, '3 months/s'], [1, '1 year/s'], [6, '6 years/s']], () => HX.speed, v => { HX.speed = v; });
  B.buttons(s, [['Inner planets', () => camHelix('inner')], ['From the side', () => camHelix('side')], ['Outer planets', () => camHelix('outer')], ['Start again', () => enterHelix()]]);
  const p = document.createElement('p'); p.className = 'help';
  p.textContent = 'The planets\' orbits are tilted about 60° to the galaxy\'s disc, so the corkscrews lean. Real orbits from the planet tables, real speeds; planets drawn as dots.';
  s.appendChild(p);
  B.buttons(B.sec(''), [['Back to the solar system', () => { setScene('earth'); camFocus('sun', 160000, 0.3, 1.25); buildPanel(); }, 'primary']]);
}
