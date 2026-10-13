/* ================= PHYSICS LAB: black hole, gravitational waves, twin paradox, Foucault pendulum ================= */
const PL = { cur: 'bh' };
const FSQ_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/* ---------- 1. black hole: light rays bent by real Schwarzschild gravity, traced for every pixel ---------- */
const BH_FS = `
precision highp float;
uniform vec3 camPos; uniform mat3 camRot; uniform float tanH; uniform float aspect; uniform float time; uniform sampler2D mw; uniform float diskOn; uniform float doppler;
varying vec2 vUv;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 sky(vec3 d){
  float ra = atan(-d.z, d.x), dec = asin(clamp(d.y, -1.0, 1.0));
  float v = texture2D(mw, vec2(fract(ra / 6.2831853), 0.5 + dec / 3.1415927)).r;
  vec3 c = mix(vec3(0.42, 0.5, 0.75), vec3(1.0, 0.9, 0.74), smoothstep(0.35, 1.0, v)) * v * 0.55;
  vec3 q = d * 260.0, id = floor(q), f = fract(q) - 0.5; float h = hash(id);
  c += vec3(0.9, 0.95, 1.0) * step(0.982, h) * smoothstep(0.32, 0.0, length(f)) * (0.4 + (h - 0.982) * 60.0);
  return c;
}
vec3 bb(float t){ /* rough black-body colour, t = 0 (dull red) .. 1.5 (blue-white) */
  vec3 c = mix(vec3(0.9, 0.22, 0.05), vec3(1.0, 0.62, 0.3), smoothstep(0.15, 0.6, t));
  c = mix(c, vec3(1.0, 0.92, 0.82), smoothstep(0.6, 1.1, t));
  c = mix(c, vec3(0.75, 0.85, 1.0), smoothstep(1.2, 1.8, t));
  return c * smoothstep(0.0, 0.25, t) * (0.6 + 0.6 * t);
}
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  vec3 v = normalize(camRot * vec3(p.x * tanH * aspect, p.y * tanH, -1.0));
  vec3 x = camPos;
  float h2 = dot(cross(x, v), cross(x, v));
  vec3 col = vec3(0.0); float tr = 1.0; bool caught = false;
  for (int i = 0; i < 280; i++) {
    float r = length(x);
    float dt = clamp(0.08 * (r - 0.6), 0.012, 1.6);
    vec3 a = -1.5 * h2 * x / pow(r, 5.0);
    vec3 xm = x + v * dt * 0.5, vm = v + a * dt * 0.5;
    float rm = length(xm); vec3 am = -1.5 * h2 * xm / pow(rm, 5.0);
    vec3 xn = x + vm * dt, vn = v + am * dt;
    if (diskOn > 0.5 && x.y * xn.y < 0.0) {
      float f = x.y / (x.y - xn.y); vec3 hp = mix(x, xn, f); float rr = length(hp.xz);
      if (rr > 3.0 && rr < 13.0) {
        float T = pow(3.0 / rr, 0.75) * pow(max(1.0 - sqrt(3.0 / rr), 0.0), 0.25) * 2.6;
        vec3 vel = normalize(cross(vec3(0.0, 1.0, 0.0), hp)) * sqrt(0.5 / rr);
        float b = length(vel), gam = 1.0 / sqrt(1.0 - b * b);
        vec3 nl = -normalize(vm);
        float D = mix(1.0, 1.0 / (gam * (1.0 - dot(vel, nl))), doppler) * sqrt(1.0 - 1.0 / rr);
        float ang = atan(hp.z, hp.x) - time * sqrt(0.5 / (rr * rr * rr)) * 6.0;
        float tex = 0.78 + 0.22 * sin(rr * 6.0 + 2.0 * sin(ang * 3.0 + rr)) * sin(ang * 2.0 + rr * 1.3);
        float op = smoothstep(3.0, 3.4, rr) * (1.0 - smoothstep(9.0, 13.0, rr)) * 0.92;
        vec3 dc = bb(T * D) * pow(D, 3.0) * tex * 1.05;
        col += tr * dc * op; tr *= 1.0 - op;
      }
    }
    x = xn; v = vn;
    if (length(x) < 1.0) { caught = true; break; }
    if (length(x) > 90.0 && dot(x, v) > 0.0) break;
    if (tr < 0.02) break;
  }
  if (!caught) col += tr * sky(normalize(v));
  gl_FragColor = vec4(col, 1.0);
}`;
const BH = { built: false, q: 0.45, disk: true, doppler: true, kind: 'sgr' };
const BH_KINDS = {
  sgr: { name: 'Sagittarius A*', what: 'the black hole at the centre of our galaxy', suns: 4.3e6, rsKm: 1.27e7 },
  m87: { name: 'M87*', what: 'the first black hole ever photographed (2019)', suns: 6.5e9, rsKm: 1.92e10 },
  star: { name: 'A stellar black hole', what: 'left behind when a giant star explodes', suns: 10, rsKm: 29.5 }
};
function buildBH() {
  const sc = new THREE.Scene(); scenes.bh = sc;
  BH.uni = { camPos: { value: new V3() }, camRot: { value: new THREE.Matrix3() }, tanH: { value: 0.38 }, aspect: { value: 1 }, time: { value: 0 }, mw: { value: TEX.milkyway || TEX.stars }, diskOn: { value: 1 }, doppler: { value: 1 } };
  BH.rtScene = new THREE.Scene();
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: BH.uni, vertexShader: FSQ_VS, fragmentShader: BH_FS, depthWrite: false, depthTest: false }));
  q.frustumCulled = false; BH.rtScene.add(q);
  BH.rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const show = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({ uniforms: { map: { value: BH.rt.texture } }, vertexShader: FSQ_VS, fragmentShader: 'uniform sampler2D map; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(map, vUv).rgb, 1.0); }', depthWrite: false, depthTest: false }));
  show.frustumCulled = false; sc.add(show);
  BH.built = true;
  SCN.bh = { update: updateBH };
}
function updateBH(dt, time) {
  if (Cam.rig.dist * Cam.userZoom < 1.6) Cam.userZoom = 1.6 / Cam.rig.dist;
  const q = GFX.quality === 'high' ? 0.6 : BH.q, W = Math.max(64, Math.round(VIEW.W * q)), H = Math.max(64, Math.round(VIEW.H * q));
  if (BH.rt.width !== W || BH.rt.height !== H) BH.rt.setSize(W, H);
  camera.updateMatrixWorld();
  BH.uni.camPos.value.copy(camera.position);
  BH.uni.camRot.value.setFromMatrix4(camera.matrixWorld);
  BH.uni.tanH.value = Math.tan(camera.fov * DEG / 2); BH.uni.aspect.value = camera.aspect;
  BH.uni.time.value += dt; BH.uni.diskOn.value = BH.disk ? 1 : 0; BH.uni.doppler.value = BH.doppler ? 1 : 0;
  renderer.setRenderTarget(BH.rt); renderer.render(BH.rtScene, camera); renderer.setRenderTarget(null);
}
function bhPanel() {
  const s = B.sec('Black hole', 'Every pixel is a ray of light traced backwards through curved space. Light passing close is bent right round, so you see the far side of the disc above and below the hole.');
  B.chips(s, 'Which one', Object.entries(BH_KINDS).map(([k, v]) => [k, v.name]), () => BH.kind, v => { BH.kind = v; buildPanel(); });
  const K = BH_KINDS[BH.kind];
  const p0 = document.createElement('p'); p0.className = 'help'; p0.innerHTML = `${K.name}: ${K.what}. ${fmt(K.suns)} times the mass of the Sun; the point of no return is ${K.rsKm < 1000 ? fmt(K.rsKm, 1) + ' km' : fmt(K.rsKm / 1e6, 1) + ' million km'} from the centre.`; s.appendChild(p0);
  B.toggle(s, 'Glowing disc', 'Gas spiralling in, heated to millions of degrees', () => BH.disk, v => { BH.disk = v; });
  B.toggle(s, 'Doppler beaming', 'The side coming toward you looks brighter', () => BH.doppler, v => { BH.doppler = v; });
  B.buttons(s, [['Far away', () => camBH(40, 0.12)], ['Close', () => camBH(12, 0.08)], ['Edge on', () => camBH(22, 0.02)], ['From above', () => camBH(25, 1.3)]]);
  const t = B.sec('Time near the hole');
  const box = document.createElement('div'); box.className = 'now-card'; t.appendChild(box);
  const draw = () => {
    if (!box.isConnected) return;
    const r = Math.max(1.0001, camera.position.length()), rate = Math.sqrt(1 - 1 / r), km = r * K.rsKm;
    const rs = K.rsKm * 1000, L = 2, tidal = rs * 9e16 * L / Math.pow(r * rs, 3);
    box.innerHTML = `<div class="nc-row"><span class="k">Your distance</span><b>${fmt(r, 1)} × the horizon · ${km < 1e4 ? fmt(km) + ' km' : km < 1e9 ? fmt(km / 1e6, 1) + ' million km' : fmt(km / 1e9, 1) + ' billion km'}</b></div>
      <div class="nc-row"><span class="k">Your clock runs at</span><b>${fmt(rate * 100, 1)}% speed</b></div>
      <div class="gauge"><i style="width:${(rate * 100).toFixed(1)}%"></i></div>
      <div class="nc-row"><span class="k">1 hour for you</span><b>${fmt(1 / rate, 2)} hours far away</b></div>
      <div class="nc-row"><span class="k">Stretch on your body</span><b>${tidal > 9.81 * 3 ? 'deadly: ' + fmt(tidal / 9.81) + ' g head to toe' : tidal > 0.5 ? 'strong: ' + fmt(tidal / 9.81, 1) + ' g' : 'you wouldn\'t feel it'}</b></div>`;
    setTimeout(draw, 200);
  };
  draw();
  const n = document.createElement('p'); n.className = 'help'; n.textContent = 'Scroll to move closer. Near a small black hole the stretch would pull you apart; near a giant one you could cross the edge without noticing, though time would crawl. A hovering observer is assumed; the disc is drawn thin and simplified.'; t.appendChild(n);
}
function camBH(d, el) { Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist: d, az: 0.35, el, worldUp: true }, 1.0); }

/* ---------- 2. gravitational waves ---------- */
const GW = { built: false, t: 0, tc: 16, C: 2.4, speed: 1, m1: 36, m2: 29, hist: [] };
const GW_VS = `
uniform float t; uniform float tc; uniform float C; uniform float cw; uniform vec2 b1; uniform vec2 b2; uniform float merged;
varying float vH; varying vec2 vG;
${LOGV}
float orb(float tau){ return tau < tc ? -C * pow(tc - tau, 0.625) : 9.0 * (tau - tc); }
float amp(float tau){ return tau < tc ? 0.9 * pow(max(tc - tau, 0.05) / tc, -0.25) : 0.9 * pow(0.05 / tc, -0.25) * exp(-(tau - tc) / 0.45); }
void main(){
  vec3 p = position; float r = length(p.xz), th = atan(p.z, p.x);
  float tau = t - r / cw;
  float h = amp(tau) * cos(2.0 * th - 2.0 * orb(tau)) * 3.0 / (r + 3.0) * smoothstep(0.8, 2.5, r);
  float well = merged > 0.5 ? -3.2 / sqrt(r * r + 0.6) : -1.7 / sqrt(dot(p.xz - b1, p.xz - b1) + 0.4) - 1.4 / sqrt(dot(p.xz - b2, p.xz - b2) + 0.4);
  p.y = h * 1.6 + well;
  vH = h; vG = p.xz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  ${LOGVM}
}`;
const GW_FS = `varying float vH; varying vec2 vG;
${LOGF}
void main(){ ${LOGFM}
  vec2 g = abs(fract(vG * 0.8) - 0.5) / fwidth(vG * 0.8);
  float l = 1.0 - min(min(g.x, g.y), 1.0);
  float r = length(vG); float edge = 1.0 - smoothstep(26.0, 34.0, r);
  vec3 col = mix(vec3(0.18, 0.45, 1.0), vec3(0.75, 0.95, 1.0), clamp(0.5 + vH * 1.4, 0.0, 1.0));
  float a = (0.12 + 0.75 * l) * edge;
  gl_FragColor = vec4(col * a, a);
}`;
function buildGW() {
  const sc = new THREE.Scene(); scenes.gw = sc;
  const bg = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x5a6273, depthWrite: false })); sc.add(bg); GW.bg = bg;
  GW.uni = { t: { value: 0 }, tc: { value: GW.tc }, C: { value: GW.C }, cw: { value: 7 }, b1: { value: new THREE.Vector2() }, b2: { value: new THREE.Vector2() }, merged: { value: 0 } };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(70, 70, 320, 320).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: GW.uni, vertexShader: GW_VS, fragmentShader: GW_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, extensions: { derivatives: true } }));
  grid.frustumCulled = false; sc.add(grid);
  const mkBH = (r) => { const g = new THREE.Group(); const s = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ color: 0x000000 })); g.add(s); const glow = sprite(GLOW_SOFT, '#ffb366', r * 6, 0.9); g.add(glow); g.userData.glow = glow; sc.add(g); return g; };
  GW.a = mkBH(0.42); GW.b = mkBH(0.37); GW.c = mkBH(0.62); GW.c.visible = false;
  GW.lbl = Labels.add('<b>Two black holes</b><span>36 and 29 times the Sun</span>', 'craft', () => GW.c.visible ? null : new V3(0, 1.6, 0), { scene: 'gw', occlude: false });
  GW.built = true;
  SCN.gw = { update: updateGW };
}
function gwOrb(t) { return t < GW.tc ? -GW.C * Math.pow(GW.tc - t, 0.625) : 9 * (t - GW.tc); }
function gwStrain(t, r) { const tau = t - r / 7; const a = tau < GW.tc ? 0.55 * Math.pow(Math.max(GW.tc - tau, 0.05) / GW.tc, -0.25) : 0.55 * Math.pow(0.05 / GW.tc, -0.25) * Math.exp(-(tau - GW.tc) / 0.45); return a * Math.cos(-2 * gwOrb(tau)) * 3 / (r + 3); }
function updateGW(dt) {
  GW.t += dt * GW.speed;
  if (GW.t > GW.tc + 9) { GW.t = 0; GW.hist = []; }
  const t = GW.t; GW.uni.t.value = t;
  const merged = t >= GW.tc; GW.uni.merged.value = merged ? 1 : 0;
  const a = 6 * Math.pow(Math.max(GW.tc - t, 0.0001) / GW.tc, 0.25), ph = gwOrb(t), M = GW.m1 + GW.m2;
  const r1 = a * GW.m2 / M, r2 = a * GW.m1 / M;
  GW.a.position.set(Math.cos(ph) * r1, 0.3, Math.sin(ph) * r1); GW.b.position.set(-Math.cos(ph) * r2, 0.3, -Math.sin(ph) * r2);
  GW.uni.b1.value.set(GW.a.position.x, GW.a.position.z); GW.uni.b2.value.set(GW.b.position.x, GW.b.position.z);
  GW.a.visible = GW.b.visible = !merged; GW.c.visible = merged;
  if (merged) { const k = 1 + 0.12 * Math.exp(-(t - GW.tc) / 0.5) * Math.sin((t - GW.tc) * 22); GW.c.scale.set(k, 1 / k, k); GW.c.position.set(0, 0.3, 0); }
  GW.bg.position.copy(camera.position);
  /* what a detector 30 units away feels */
  GW.hist.push([t, gwStrain(t, 30)]); while (GW.hist.length && GW.hist[0][0] < t - 8) GW.hist.shift();
  drawLigo();
}
function drawLigo() {
  const cv = document.getElementById('ligoCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(100, r.width), H = Math.max(80, r.height);
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const h = GW.hist.length ? GW.hist[GW.hist.length - 1][1] : 0, e = h * 0.35;
  /* L-shaped detector: one arm stretches while the other squeezes */
  const ox = 22, oy = H - 22, L = Math.min(W * 0.32, H - 40);
  c.lineWidth = 4; c.lineCap = 'round';
  c.strokeStyle = '#7cc4ff'; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox + L * (1 + e), oy); c.stroke();
  c.strokeStyle = '#ffcf6b'; c.beginPath(); c.moveTo(ox, oy); c.lineTo(ox, oy - L * (1 - e)); c.stroke();
  c.fillStyle = '#eaf0fa'; c.beginPath(); c.arc(ox, oy, 5, 0, TAU); c.fill();
  c.fillStyle = '#9aa8c2'; c.font = '11px "IBM Plex Sans", system-ui'; c.fillText('detector arms (stretch hugely exaggerated)', ox + 8, 14);
  /* waveform */
  const x0 = ox + L + 26, w = W - x0 - 8, mid = H / 2;
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, mid); c.lineTo(x0 + w, mid); c.stroke();
  c.strokeStyle = '#7cf29a'; c.lineWidth = 1.6; c.beginPath();
  const t1 = GW.t, t0 = t1 - 8;
  GW.hist.forEach(([t, v], i) => { const X = x0 + (t - t0) / 8 * w, Y = mid - v * (H * 0.28); i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
  c.stroke(); c.fillStyle = '#7cf29a'; c.fillText('the "chirp"', x0, H - 6);
}
function gwPanel() {
  const s = B.sec('Gravitational waves', 'Two black holes circle closer and closer, then merge. Their dance shakes space itself, sending out ripples at the speed of light.');
  B.chips(s, 'Speed', [[1, 'Normal'], [0.35, 'Slow motion'], [0, 'Pause']], () => GW.speed, v => { GW.speed = v; });
  B.buttons(s, [['Replay', () => { GW.t = 0; GW.hist = []; }, 'primary'], ['From above', () => camGW(26, 1.35)], ['Low angle', () => camGW(24, 0.35)]]);
  const d = B.sec('What a detector feels');
  const cv = document.createElement('canvas'); cv.id = 'ligoCv'; cv.className = 'ligo'; cv.setAttribute('aria-label', 'Detector arms stretching and squeezing, with the wave signal'); d.appendChild(cv);
  const p = document.createElement('p'); p.className = 'help';
  p.innerHTML = 'On 14 September 2015 the LIGO detectors caught exactly this: two black holes of 36 and 29 Suns merging 1.3 billion light years away. Three Suns\' worth of mass turned into wave energy in a fraction of a second.<br><br>The 4 km arms changed length by less than a thousandth of the width of a proton. Here everything is slowed down and exaggerated hugely; the real last orbits took a fifth of a second.';
  d.appendChild(p);
}
function camGW(d, el) { Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist: d, az: 0.5, el, worldUp: true }, 1.0); }

/* ---------- 3. twin paradox ---------- */
const TW = { built: false, beta: 0.8, D: 4.25, star: 'Proxima Centauri', p: 0, run: true, age: 20 };
const TW_STARS = [['Proxima Centauri', 4.25], ['Sirius', 8.6], ['Vega', 25], ['Polaris', 433]];
function buildTwins() {
  const sc = new THREE.Scene(); scenes.twins = sc;
  const bg = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x8a92a6, depthWrite: false })); sc.add(bg); TW.bg = bg;
  sc.add(new THREE.AmbientLight(0x56607a, 0.6)); const l = new THREE.DirectionalLight(0xffffff, 1.6); l.position.set(-5, 6, 10); sc.add(l);
  TW.earth = new THREE.Mesh(new THREE.SphereGeometry(1.2, 64, 32), new THREE.MeshStandardMaterial({ map: TEX.day, roughness: 0.8 })); TW.earth.position.set(-11, 0, 0); sc.add(TW.earth);
  TW.starG = sprite(GLOW_SUN, '#ffe6b0', 5, 1); TW.starG.position.set(11, 0, 0); sc.add(TW.starG);
  TW.rocket = new THREE.Group(); const rk = buildRocket(); rk.rotation.y = Math.PI / 2; rk.scale.setScalar(4.5); TW.rocket.add(rk); TW.rk = rk; sc.add(TW.rocket);
  if (rk.userData.flame) rk.userData.flame.visible = false;
  TW.path = new Ribbon(2, '#7cc4ff', 1.4, { fade: 1, opacity: 0.4 }); TW.path.set([new V3(-11, 0, 0), new V3(11, 0, 0)]); sc.add(TW.path.mesh);
  TW.lE = Labels.add('', 'craft', () => TW.earth.position.clone().add(new V3(0, 1.8, 0)), { scene: 'twins', occlude: false }); TW.lE.el.style.setProperty('--c', '#7cc4ff');
  TW.lR = Labels.add('', 'craft', () => TW.rocket.position.clone().add(new V3(0, 1.4, 0)), { scene: 'twins', occlude: false }); TW.lR.el.style.setProperty('--c', '#ffcf6b');
  TW.lS = Labels.add('', 'body', () => TW.starG.position.clone().add(new V3(0, -1.6, 0)), { scene: 'twins', occlude: false });
  TW.built = true;
  SCN.twins = { update: updateTwins };
}
function twin() { const g = 1 / Math.sqrt(1 - TW.beta * TW.beta), T = 2 * TW.D / TW.beta; return { g, T, tau: T / g }; }
function updateTwins(dt) {
  const { g, T, tau } = twin();
  if (TW.run) TW.p = Math.min(1, TW.p + dt / 12);
  const te = TW.p * T, half = TW.p <= 0.5, f = half ? TW.p * 2 : (1 - TW.p) * 2;
  const x = -10 + 20 * f;
  TW.rocket.position.set(x, 0, 0);
  TW.rk.rotation.y = half ? Math.PI / 2 : -Math.PI / 2;
  TW.rocket.scale.set(TW.p > 0 && TW.p < 1 ? 1 / g : 1, 1, 1);
  const ageE = TW.age + te, ageR = TW.age + te / g;
  TW.lE.set(`<b>Twin at home</b><span>age ${fmt(ageE, 1)}</span>`);
  TW.lR.set(`<b>Travelling twin</b><span>age ${fmt(ageR, 1)}</span>`);
  TW.lS.set(`<b>${TW.star}</b><span>${fmt(TW.D, TW.D < 10 ? 2 : 0)} light years away</span>`);
  TW.earth.rotation.y += dt * 0.4;
  TW.bg.position.copy(camera.position);
  drawTwinDiagram();
}
function drawTwinDiagram() {
  const cv = document.getElementById('twinCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), W = Math.max(100, r.width), H = Math.max(100, r.height);
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const { g, T } = twin(), x0 = 30, y0 = H - 20, sx = (W - 60), sy = (H - 36) / T;
  const X = d => x0 + d / TW.D * sx, Y = t => y0 - t * sy;
  c.strokeStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + sx, y0); c.moveTo(x0, y0); c.lineTo(x0, 12); c.stroke();
  c.fillStyle = '#9aa8c2'; c.font = '11px "IBM Plex Sans", system-ui'; c.fillText('time on Earth ↑', 4, 10); c.fillText('distance →', W - 70, H - 6);
  /* worldlines, with a tick for every year each twin lives */
  c.strokeStyle = '#7cc4ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(0), Y(T)); c.stroke();
  c.strokeStyle = '#ffcf6b'; c.beginPath(); c.moveTo(X(0), Y(0)); c.lineTo(X(TW.D), Y(T / 2)); c.lineTo(X(0), Y(T)); c.stroke();
  const ticks = Math.min(60, Math.floor(T)), step = Math.max(1, Math.ceil(T / 30));
  c.fillStyle = '#7cc4ff'; for (let k = step; k <= ticks; k += step) c.fillRect(X(0) - 4, Y(k) - 1, 8, 2);
  c.fillStyle = '#ffcf6b'; for (let k = step; k <= T / g; k += step) { const te = k * g, d = te <= T / 2 ? te * TW.beta : TW.D - (te - T / 2) * TW.beta; c.beginPath(); c.arc(X(d), Y(te), 2.5, 0, TAU); c.fill(); }
  const te = TW.p * T, d = TW.p <= 0.5 ? te * TW.beta : TW.D - (te - T / 2) * TW.beta;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(X(Math.max(0, d)), Y(te), 4, 0, TAU); c.fill();
  c.fillStyle = '#c6d0e2'; c.fillText(`ticks every ${step} year${step > 1 ? 's' : ''} of each twin's life`, x0 + 6, 24);
}
function twinsPanel() {
  const s = B.sec('The twin paradox', 'One twin stays on Earth. The other flies to a star and back, very fast. Moving clocks tick slower, so the traveller comes home younger.');
  B.chips(s, 'Fly to', TW_STARS.map(([n]) => [n, n]), () => TW.star, v => { TW.star = v; TW.D = TW_STARS.find(x => x[0] === v)[1]; TW.p = 0; TW.run = true; buildPanel(); });
  B.slider(s, 'Rocket speed', 0.1, 0.999, 0.001, () => TW.beta, v => { TW.beta = v; TW.p = 0; TW.run = true; }, v => fmt(v * 100, v > 0.99 ? 1 : 0) + '% of light speed', true);
  B.buttons(s, [['Launch again', () => { TW.p = 0; TW.run = true; }, 'primary']]);
  const box = document.createElement('div'); box.className = 'now-card'; s.appendChild(box);
  const draw = () => {
    if (!box.isConnected) return;
    const { g, T, tau } = twin();
    box.innerHTML = `<div class="nc-row"><span class="k">Round trip, Earth clock</span><b>${fmt(T, 1)} years</b></div>
      <div class="nc-row"><span class="k">Round trip, rocket clock</span><b>${fmt(tau, 1)} years</b></div>
      <div class="gauge"><i style="width:${(100 / g).toFixed(1)}%"></i></div>
      <div class="nc-row"><span class="k">Home twin is older by</span><b>${fmt(T - tau, 1)} years</b></div>
      <div class="nc-row"><span class="k">Rocket clock speed</span><b>${fmt(100 / g, 1)}% · ship squashed to ${fmt(100 / g)}% length</b></div>`;
    setTimeout(draw, 250);
  };
  draw();
  const d = B.sec('Spacetime diagram');
  const cv = document.createElement('canvas'); cv.id = 'twinCv'; cv.className = 'ligo tall'; cv.setAttribute('aria-label', 'Spacetime diagram of both twins'); d.appendChild(cv);
  const p = document.createElement('p'); p.className = 'help';
  p.innerHTML = 'Why isn\'t it symmetric? Only the traveller turns round, switching to a different frame. That turn is what breaks the tie.<br><br>It is real: astronauts on the Space Station age about 0.005 seconds less than us every six months, and GPS satellites must correct for both speed and gravity effects.';
  d.appendChild(p);
}

/* ---------- 4. Foucault pendulum ---------- */
const FP = { built: false, lat: 48.85, place: 'Paris', speed: 600, simT: 0, realT: 0, A: 5.2, L: 22, Lreal: 67, pins: [] };
const FP_PLACES = [['North Pole', 90], ['Paris', 48.85], ['Sydney', -33.87], ['Equator', 0]];
function floorTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 1024; const g = c.getContext('2d');
  const gr = g.createRadialGradient(512, 512, 0, 512, 512, 512); gr.addColorStop(0, '#3a2c1f'); gr.addColorStop(1, '#22190f'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 1024);
  g.translate(512, 512);
  for (let i = 0; i < 360; i += 5) { const a = i * DEG, l = i % 30 === 0 ? 40 : 18; g.strokeStyle = i % 30 === 0 ? 'rgba(255,215,140,.7)' : 'rgba(255,215,140,.35)'; g.lineWidth = i % 30 === 0 ? 3 : 1.5; g.beginPath(); g.moveTo(Math.cos(a) * 470, Math.sin(a) * 470); g.lineTo(Math.cos(a) * (470 - l), Math.sin(a) * (470 - l)); g.stroke(); }
  g.fillStyle = 'rgba(255,215,140,.85)'; g.font = '600 48px "Chakra Petch", system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  [['N', -90], ['E', 0], ['S', 90], ['W', 180]].forEach(([t, a]) => g.fillText(t, Math.cos(a * DEG) * 395, Math.sin(a * DEG) * 395));
  g.strokeStyle = 'rgba(255,215,140,.25)'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 470, 0, TAU); g.stroke();
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
function buildFoucault() {
  const sc = new THREE.Scene(); scenes.foucault = sc; sc.background = new THREE.Color('#0b0f18');
  sc.add(new THREE.HemisphereLight(0xbfd2ff, 0x2a1d10, 0.6));
  const sp = new THREE.SpotLight(0xfff0d8, 2.2, 0, 0.6, 0.5); sp.position.set(4, 30, 6); sc.add(sp); sc.add(sp.target);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9.5, 96), new THREE.MeshStandardMaterial({ map: floorTexture(), roughness: 0.75 })); floor.rotation.x = -Math.PI / 2; sc.add(floor);
  const rail = new THREE.Mesh(new THREE.TorusGeometry(9.5, 0.12, 12, 120), M('#b08a4a', { metalness: 0.8, roughness: 0.3 })); rail.rotation.x = Math.PI / 2; rail.position.y = 0.6; sc.add(rail);
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU, post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 8), M('#b08a4a', { metalness: 0.8 })); post.position.set(Math.cos(a) * 9.5, 0.3, Math.sin(a) * 9.5); sc.add(post); }
  const pivot = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 8), M('#888888', { metalness: 0.9 })); pivot.position.y = FP.L; sc.add(pivot);
  FP.wire = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new V3(0, FP.L, 0), new V3()]), new THREE.LineBasicMaterial({ color: 0xcfd6e2 })); FP.wire.frustumCulled = false; sc.add(FP.wire);
  FP.bob = new THREE.Mesh(new THREE.SphereGeometry(0.55, 48, 24), M('#c9a44a', { metalness: 1, roughness: 0.22 })); sc.add(FP.bob);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.4, 16), M('#c9a44a', { metalness: 1, roughness: 0.22 })); tip.rotation.x = Math.PI; tip.position.y = -0.7; FP.bob.add(tip);
  FP.trace = new Ribbon(2400, '#ffcf6b', 1.3, { fade: 0.05, opacity: 0.7 }); sc.add(FP.trace.mesh); FP.tpts = [];
  FP.pinG = new THREE.Group(); sc.add(FP.pinG); resetPins();
  FP.lbl = Labels.add('', 'flag', () => new V3(0, FP.L + 0.6, 0), { scene: 'foucault', occlude: false });
  FP.built = true;
  SCN.foucault = { update: updateFoucault };
}
function resetPins() {
  while (FP.pinG.children.length) FP.pinG.remove(FP.pinG.children[0]);
  FP.pins = [];
  for (let i = 0; i < 36; i++) {
    const a = i / 36 * TAU, g = new THREE.Group(); g.position.set(Math.cos(a) * (FP.A + 0.35), 0, -Math.sin(a) * (FP.A + 0.35));
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.7, 10), M(i % 2 ? '#e8ecf5' : '#ff6b6b', { roughness: 0.5 })); pin.position.y = 0.35; g.add(pin);
    FP.pinG.add(g); FP.pins.push({ g, a, down: 0 });
  }
  FP.tpts = []; FP.simT = 0; FP.psi0 = 0;
}
function updateFoucault(dt) {
  FP.realT += dt; FP.simT += dt * FP.speed;
  const T = 2 * Math.PI * Math.sqrt(FP.Lreal / 9.81);
  const s = FP.A * Math.cos(TAU * FP.realT / T);
  const psi = FP.psi0 - 7.2921159e-5 * Math.sin(FP.lat * DEG) * FP.simT;
  const dir = new V3(Math.cos(psi), 0, -Math.sin(psi));
  const y = FP.L - Math.sqrt(FP.L * FP.L - s * s);
  const pos = dir.clone().multiplyScalar(s); pos.y = y + 1.0;
  FP.bob.position.copy(pos);
  const wp = FP.wire.geometry.attributes.position; wp.setXYZ(1, pos.x, pos.y + 0.5, pos.z); wp.needsUpdate = true;
  const g = new V3(pos.x, 0.02, pos.z);
  const last = FP.tpts[FP.tpts.length - 1];
  if (!last || last.distanceTo(g) > 0.05) { FP.tpts.push(g); if (FP.tpts.length > 2400) FP.tpts.shift(); FP.trace.set(FP.tpts); }
  for (const p of FP.pins) {
    if (!p.down && Math.hypot(pos.x - p.g.position.x, pos.z - p.g.position.z) < 0.55) p.down = 0.001;
    if (p.down && p.down < Math.PI / 2) { p.down = Math.min(Math.PI / 2, p.down + dt * 4); const out = p.g.position.clone().normalize(); p.g.rotation.set(0, 0, 0); p.g.rotateOnWorldAxis(new V3(-out.z, 0, out.x), p.down); }
  }
  const hrs = FP.simT / 3600, deg = Math.abs(psi - FP.psi0) / DEG;
  FP.lbl.set(`<b>${fmt(hrs, 1)} hours later</b><span>swing turned ${fmt(deg % 360)}°</span>`);
}
function fpPanel() {
  const s = B.sec('Foucault\'s pendulum', 'A heavy pendulum keeps swinging in the same direction in space. The floor, fixed to the spinning Earth, turns underneath it. In 1851 this was the first proof you could see that Earth spins.');
  B.chips(s, 'Where', FP_PLACES.map(([n]) => [n, n]), () => FP.place, v => { FP.place = v; FP.lat = FP_PLACES.find(x => x[0] === v)[1]; resetPins(); buildPanel(); });
  B.slider(s, 'Latitude', -90, 90, 0.5, () => FP.lat, v => { FP.lat = v; FP.place = ''; resetPins(); }, v => v === 0 ? 'equator' : fmt(Math.abs(v), 1) + '° ' + (v > 0 ? 'N' : 'S'), true);
  B.chips(s, 'Turning speed', [[1, 'Real'], [60, '1 min/s'], [600, '10 min/s'], [3600, '1 hour/s']], () => FP.speed, v => { FP.speed = v; });
  B.buttons(s, [['Set up the pins again', resetPins, 'primary']]);
  const box = document.createElement('div'); box.className = 'now-card'; s.appendChild(box);
  const draw = () => {
    if (!box.isConnected) return;
    const sl = Math.sin(FP.lat * DEG), rate = 15.041 * sl, full = Math.abs(sl) < 1e-3 ? Infinity : 23.934 / Math.abs(sl);
    box.innerHTML = `<div class="nc-row"><span class="k">Turns by</span><b>${fmt(Math.abs(rate), 1)}° every hour</b></div>
      <div class="nc-row"><span class="k">Full circle in</span><b>${full === Infinity ? 'never' : fmt(full, 1) + ' hours'}</b></div>
      <div class="nc-row"><span class="k">Direction (from above)</span><b>${Math.abs(sl) < 1e-3 ? 'does not turn' : sl > 0 ? 'clockwise' : 'anticlockwise'}</b></div>
      <div class="nc-row"><span class="k">One swing</span><b>${fmt(2 * Math.PI * Math.sqrt(FP.Lreal / 9.81), 1)} s (67 m wire, as in Paris)</b></div>`;
    setTimeout(draw, 300);
  };
  draw();
  const p = document.createElement('p'); p.className = 'help';
  p.textContent = 'At the poles the floor turns a full circle in a day (23 h 56 min). At the equator it does not turn at all, and in between it is slower. The speed buttons only speed up the slow turn; the swing itself stays at its real pace.';
  s.appendChild(p);
}

/* ---------- the mode ---------- */
const PHYS_LABS = [['bh', 'Black hole', buildBH, bhPanel, () => camBH(28, 0.1)], ['gw', 'Gravitational waves', buildGW, gwPanel, () => camGW(26, 0.6)], ['twins', 'Twin paradox', buildTwins, twinsPanel, () => Cam.go({ frame: () => ({ pos: new V3(0, 0, 0), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) }), dist: 30, az: 1.3, el: 0.35, worldUp: true }, 1.0)], ['foucault', 'Foucault pendulum', buildFoucault, fpPanel, () => Cam.go({ frame: () => ({ pos: new V3(0, 6, 0), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist: 22, az: 0.6, el: 0.55, worldUp: true }, 1.0)]];
function enterLab(id) {
  const L = PHYS_LABS.find(x => x[0] === id) || PHYS_LABS[0];
  PL.cur = L[0];
  if (!scenes[L[0]]) L[2]();
  setScene(L[0]); L[4]();
  if (L[0] === 'gw') { GW.t = 0; GW.hist = []; }
  if (L[0] === 'twins') { TW.p = 0; TW.run = true; }
}
const PHYS = {
  id: 'physics', title: 'Physics Lab', sub: 'Black holes, ripples in space, time travel and a spinning Earth', mode: true, steps: [],
  get scene() { return PL.cur; },
  setup() { enterLab(PL.cur); },
  panel() {
    const s = B.sec('Experiments');
    B.chips(s, '', PHYS_LABS.map(([id, t]) => [id, t]), () => PL.cur, v => { enterLab(v); buildPanel(); });
    ({ bh: bhPanel, gw: gwPanel, twins: twinsPanel, foucault: fpPanel })[PL.cur]();
  }
};
