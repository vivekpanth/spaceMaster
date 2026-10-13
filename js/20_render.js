/* ================= RENDERING ================= */
const V3 = THREE.Vector3;
const TILT = 23.44 * DEG;
const PLANE_EXAG = 22, EXAG_H = 12000;
const GFX = { quality: 'high', ready: false };

let renderer, camera, composer, bloomPass, renderPass;
const scenes = {};
const texLoader = new THREE.TextureLoader();
const TEX = {};

function loadTex(name, url, opts = {}) {
  return new Promise(res => {
    texLoader.load(url, t => {
      t.anisotropy = 8;
      if (opts.srgb) t.encoding = THREE.sRGBEncoding;
      if (opts.wrap) { t.wrapS = THREE.RepeatWrapping; }
      TEX[name] = t; res(t);
    }, undefined, () => { TEX[name] = null; res(null); });
  });
}

/* physics vector (metres, z = axis) -> three local (Earth radii, y = axis) */
function p2t(p, out = new V3()) { return out.set(p[0] / R, p[2] / R, -p[1] / R); }
function t2p(v) { return [v.x * R, -v.z * R, v.y * R]; }

/* ---------- shaders ---------- */
const LOGV = '\n#include <common>\n#include <logdepthbuf_pars_vertex>\n', LOGVM = '\n#include <logdepthbuf_vertex>\n';
const LOGF = '\n#include <common>\n#include <logdepthbuf_pars_fragment>\n', LOGFM = '\n#include <logdepthbuf_fragment>\n';

const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${LOGV}
void main(){
  vUv = uv;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 wp = modelMatrix * vec4(position,1.0); vP = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
  ${LOGVM}
}`;
const EARTH_FS = `
uniform sampler2D dayMap, nightMap, cloudMap, waterMap;
uniform vec3 sunDir; uniform float cloudOff; uniform float nightGain; uniform float hasTex;
uniform vec3 moonPos; uniform float moonRad; uniform float sunAng;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
${LOGF}
float eclipseShade(vec3 P){
  vec3 m = moonPos - P; float dm = length(m); vec3 mu = m / dm;
  if (dot(mu, sunDir) < 0.9) return 1.0;
  float rm = moonRad / dm, rs = sunAng;
  float sep = length(cross(mu, sunDir));
  if (sep >= rs + rm) return 1.0;
  float t = clamp((rs + rm - sep) / (2.0 * min(rs, rm)), 0.0, 1.0);
  float cov = t * t * (3.0 - 2.0 * t) * min(1.0, (rm * rm) / (rs * rs));
  return 1.0 - 0.97 * cov;
}
void main(){
  ${LOGFM}
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vP);
  float ndl = dot(n, sunDir);
  vec3 day = hasTex > 0.5 ? texture2D(dayMap, vUv).rgb : vec3(0.1,0.25,0.5);
  day = pow(day, vec3(1.05));
  vec3 night = hasTex > 0.5 ? texture2D(nightMap, vUv).rgb : vec3(0.0);
  float water = hasTex > 0.5 ? texture2D(waterMap, vUv).r : 0.0;
  float cl = hasTex > 0.5 ? texture2D(cloudMap, vUv + vec2(cloudOff, 0.0)).r : 0.0;
  float ecl = eclipseShade(vP);
  float lit = smoothstep(-0.12, 0.25, ndl) * ecl;
  vec3 col = day * (0.03 + 1.15 * max(ndl, 0.0) * ecl) * (1.0 - 0.45 * cl * lit);
  vec3 h = normalize(sunDir + v);
  float spec = pow(max(dot(n, h), 0.0), 140.0) * water * 0.45 * lit;
  col += vec3(1.0, 0.92, 0.75) * spec;
  float term = exp(-pow(ndl / 0.12, 2.0));
  col = mix(col, col * vec3(1.25, 0.75, 0.55), term * 0.6);
  vec3 lights = night * vec3(1.0, 0.78, 0.45) * nightGain * (1.0 - lit) * (1.0 - 0.6 * cl);
  col += lights;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col += vec3(0.32, 0.58, 1.0) * fres * (0.25 + 0.9 * lit) * 0.8;
  gl_FragColor = vec4(col, 1.0);
  #include <encodings_fragment>
}`;
const CLOUD_FS = `
uniform sampler2D cloudMap; uniform vec3 sunDir; uniform float cloudOff; uniform float hasTex;
uniform vec3 moonPos; uniform float moonRad; uniform float sunAng;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
float eclipseShadeC(vec3 P){
  vec3 m = moonPos - P; float dm = length(m); vec3 mu = m / dm;
  if (dot(mu, sunDir) < 0.9) return 1.0;
  float rm = moonRad / dm, rs = sunAng, sep = length(cross(mu, sunDir));
  if (sep >= rs + rm) return 1.0;
  float t = clamp((rs + rm - sep) / (2.0 * min(rs, rm)), 0.0, 1.0);
  return 1.0 - 0.97 * t * t * (3.0 - 2.0 * t) * min(1.0, (rm * rm) / (rs * rs));
}
${LOGF}
void main(){
  ${LOGFM}
  vec3 n = normalize(vN);
  float ndl = dot(n, sunDir);
  float c = hasTex > 0.5 ? texture2D(cloudMap, vUv + vec2(cloudOff, 0.0)).r : 0.0;
  float lit = smoothstep(-0.15, 0.3, ndl) * eclipseShadeC(vP);
  vec3 col = mix(vec3(0.05,0.06,0.09), vec3(1.0), lit) * (0.35 + 0.75 * max(ndl, 0.0));
  float term = exp(-pow(ndl / 0.15, 2.0));
  col = mix(col, vec3(1.0, 0.6, 0.4), term * 0.35);
  gl_FragColor = vec4(col, c * 0.92 * (0.25 + 0.75 * lit));
}`;
const ATM_VS = `
varying vec3 vNv; varying vec3 vN;
${LOGV}
void main(){
  vNv = normalize(normalMatrix * normal);
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  ${LOGVM}
}`;
const ATM_FS = `
uniform vec3 sunDir; uniform float strength;
varying vec3 vNv; varying vec3 vN;
${LOGF}
void main(){
  ${LOGFM}
  float i = pow(max(0.0, 0.66 - dot(vNv, vec3(0.0, 0.0, 1.0))), 3.2);
  float d = dot(normalize(vN), sunDir);
  float lit = smoothstep(-0.45, 0.4, d);
  vec3 col = mix(vec3(1.0, 0.45, 0.2), vec3(0.3, 0.6, 1.0), smoothstep(-0.1, 0.4, d));
  gl_FragColor = vec4(col * i * strength * (0.08 + lit), 1.0);
}`;

/* ---------- glow sprite texture ---------- */
function glowTexture(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(s => gr.addColorStop(s[0], s[1]));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); return t;
}
let GLOW_SOFT, GLOW_SUN;
function sprite(tex, color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m); s.scale.set(size, size, 1); return s;
}

/* ---------- ribbon trail (screen-space width) ---------- */
const RIB_VS = `
attribute vec3 prev; attribute vec3 next; attribute float side; attribute float counter;
uniform vec2 resolution; uniform float width;
varying float vC;
${LOGV}
void main(){
  mat4 m = projectionMatrix * modelViewMatrix;
  vec4 c = m * vec4(position, 1.0), p = m * vec4(prev, 1.0), n = m * vec4(next, 1.0);
  vec2 asp = vec2(resolution.x / resolution.y, 1.0);
  vec2 cs = c.xy / c.w * asp, ps = p.xy / p.w * asp, ns = n.xy / n.w * asp;
  vec2 d1 = cs - ps, d2 = ns - cs;
  vec2 dir = length(d1) < 1e-7 ? d2 : (length(d2) < 1e-7 ? d1 : d1 / max(length(d1),1e-7) + d2 / max(length(d2),1e-7));
  dir = normalize(dir + vec2(1e-9));
  vec2 nrm = vec2(-dir.y, dir.x); nrm.x /= asp.x;
  c.xy += nrm * side * width / resolution.y * c.w;
  gl_Position = c; vC = counter;
  ${LOGVM}
}`;
const RIB_FS = `
uniform vec3 color; uniform float opacity; uniform float fade;
varying float vC;
${LOGF}
void main(){
  ${LOGFM}
  gl_FragColor = vec4(color, opacity * mix(fade, 1.0, pow(vC, 0.7)));
}`;
class Ribbon {
  constructor(maxN, color, width = 3, opts = {}) {
    this.maxN = maxN;
    const g = new THREE.BufferGeometry();
    const mk = n => new THREE.BufferAttribute(new Float32Array(maxN * 2 * n), n);
    g.setAttribute('position', mk(3)); g.setAttribute('prev', mk(3)); g.setAttribute('next', mk(3));
    g.setAttribute('side', mk(1)); g.setAttribute('counter', mk(1));
    const idx = new Uint32Array((maxN - 1) * 6);
    for (let i = 0; i < maxN - 1; i++) { const a = i * 2; idx.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], i * 6); }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const sd = g.attributes.side.array; for (let i = 0; i < maxN; i++) { sd[i * 2] = 1; sd[i * 2 + 1] = -1; }
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { resolution: { value: new THREE.Vector2(typeof VIEW !== 'undefined' && VIEW.W || 1, typeof VIEW !== 'undefined' && VIEW.H || 1) }, width: { value: width }, color: { value: new THREE.Color(color) }, opacity: { value: opts.opacity ?? 1 }, fade: { value: opts.fade ?? 0.15 } },
      vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false,
      blending: opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.geo = g;
    Ribbon.all.add(this);
  }
  set(points) {
    const n = Math.min(points.length, this.maxN), g = this.geo;
    const P = g.attributes.position.array, Pr = g.attributes.prev.array, Nx = g.attributes.next.array, C = g.attributes.counter.array;
    const off = points.length - n;
    for (let i = 0; i < n; i++) {
      const p = points[off + i], pp = points[off + Math.max(0, i - 1)], pn = points[off + Math.min(n - 1, i + 1)];
      for (let k = 0; k < 2; k++) {
        const j = (i * 2 + k) * 3;
        P[j] = p.x; P[j + 1] = p.y; P[j + 2] = p.z;
        Pr[j] = pp.x; Pr[j + 1] = pp.y; Pr[j + 2] = pp.z;
        Nx[j] = pn.x; Nx[j + 1] = pn.y; Nx[j + 2] = pn.z;
        C[i * 2 + k] = n > 1 ? i / (n - 1) : 1;
      }
    }
    ['position', 'prev', 'next', 'counter'].forEach(k => { g.attributes[k].needsUpdate = true; });
    g.setDrawRange(0, Math.max(0, n - 1) * 6);
  }
  dispose() { this.geo.dispose(); this.mat.dispose(); Ribbon.all.delete(this); }
}
Ribbon.all = new Set();

/* ---------- models ---------- */
function M(color, o = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.4, metalness: 0.15 }, o)); }
function extrudeShape(pts, depth) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 1 });
  g.translate(0, 0, -depth / 2);
  return g;
}
function buildPlane(tailColor) {
  const g = new THREE.Group();
  const body = M('#f3f5f8', { roughness: 0.32, metalness: 0.25 }), grey = M('#c4c9d2', { roughness: 0.45, metalness: 0.4 });
  const tail = M(tailColor, { roughness: 0.35, metalness: 0.2 }), dark = M('#1b2230', { roughness: 0.2, metalness: 0.6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 28), body); fus.rotation.x = Math.PI / 2; fus.position.z = 0.04; g.add(fus);
  const nosePts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; nosePts.push(new THREE.Vector2(0.055 * Math.sqrt(1 - t * t), t * 0.16)); }
  const nose = new THREE.Mesh(new THREE.LatheGeometry(nosePts, 28), body); nose.rotation.x = Math.PI / 2; nose.position.z = 0.4; g.add(nose);
  const cock = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), dark); cock.scale.set(1.5, 0.45, 1.2); cock.position.set(0, 0.035, 0.45); g.add(cock);
  const tc = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.014, 0.2, 28), body); tc.rotation.x = -Math.PI / 2; tc.position.set(0, 0.012, -0.42); g.add(tc);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.0562, 0.0562, 0.62, 28, 1, true, -0.45, 0.9), tail); stripe.rotation.x = Math.PI / 2; stripe.rotation.y = Math.PI / 2; stripe.position.z = 0.05; g.add(stripe);
  const wingShape = [[0, 0.1], [0.56, -0.12], [0.56, -0.19], [0, -0.1]];
  for (const s of [1, -1]) {
    const w = new THREE.Mesh(extrudeShape(wingShape.map(p => [p[0] * s, p[1]]), 0.012), grey);
    w.rotation.x = Math.PI / 2; w.position.set(0, -0.025, 0.02); w.rotation.z = s * 0.06; g.add(w);
    const st = new THREE.Mesh(extrudeShape([[0, 0.04], [0.2, -0.05], [0.2, -0.1], [0, -0.06]].map(p => [p[0] * s, p[1]]), 0.008), tail);
    st.rotation.x = Math.PI / 2; st.position.set(0, 0.015, -0.4); g.add(st);
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.14, 20), grey); eng.rotation.x = Math.PI / 2; eng.position.set(0.2 * s, -0.06, 0.08); g.add(eng);
    const pyl = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.08), grey); pyl.position.set(0.2 * s, -0.035, 0.07); g.add(pyl);
    const inl = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), dark); inl.position.set(0.2 * s, -0.06, 0.151); g.add(inl);
    const nl = sprite(GLOW_SOFT, s > 0 ? '#ff3b3b' : '#3bff7a', 0.08); nl.position.set(0.57 * s, -0.012, -0.16); g.add(nl);
  }
  const fin = new THREE.Mesh(extrudeShape([[-0.5, 0], [-0.3, 0], [-0.44, 0.24], [-0.52, 0.24]], 0.01), tail);
  fin.rotation.y = -Math.PI / 2; fin.position.set(0, 0.03, 0); g.add(fin);
  const strobe = sprite(GLOW_SOFT, '#ffffff', 0.1); strobe.position.set(0, 0.27, -0.52); g.add(strobe); g.userData.strobe = strobe;
  g.traverse(o => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}
function buildRocket() {
  const outer = new THREE.Group(), g = new THREE.Group(); g.position.z = 0.56; outer.add(g);
  const white = M('#eef0f3', { roughness: 0.35 }), black = M('#20242c', { roughness: 0.5, metalness: 0.4 }), metal = M('#9aa3ae', { metalness: 0.8, roughness: 0.3 });
  const booster = new THREE.Group();
  const s1 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.55, 28), white); s1.rotation.x = Math.PI / 2; s1.position.z = -0.225; booster.add(s1);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0455, 0.0455, 0.05, 28), black); band.rotation.x = Math.PI / 2; band.position.z = 0.03; booster.add(band);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.06, 0.09), black); const a = i * Math.PI / 2; f.position.set(Math.cos(a) * 0.06, Math.sin(a) * 0.06, -0.46); f.rotation.z = a; booster.add(f); }
  const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.04, 20), metal); nz.rotation.x = Math.PI / 2; nz.position.z = -0.52; booster.add(nz);
  g.add(booster);
  const stage2 = new THREE.Group();
  const s2 = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 28), white); s2.rotation.x = Math.PI / 2; s2.position.z = 0.155; stage2.add(s2);
  const nz2 = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.032, 0.05, 20), metal); nz2.rotation.x = Math.PI / 2; nz2.position.z = 0.035; stage2.add(nz2);
  g.add(stage2);
  const fairing = new THREE.Group();
  const pts = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.05 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.8))), t * 0.22)); }
  for (const s of [0, 1]) {
    const half = new THREE.Mesh(new THREE.LatheGeometry(pts, 24, s * Math.PI, Math.PI), white);
    half.rotation.x = Math.PI / 2; half.position.z = 0.255; fairing.add(half);
  }
  g.add(fairing);
  const sat = buildSatellite(); sat.scale.setScalar(0.35); sat.position.z = 0.33; sat.visible = false; g.add(sat);
  const flame = buildFlame(); flame.position.z = -0.54; g.add(flame);
  outer.userData = { booster, stage2, fairing, flame, sat };
  return outer;
}
const FLAME_FS = `
uniform float time; uniform float power; varying vec2 vUv;
${LOGF}
void main(){
  ${LOGFM}
  float y = vUv.y;
  float flick = 0.85 + 0.15 * sin(time * 40.0 + y * 20.0);
  float core = smoothstep(0.0, 1.0, 1.0 - y);
  vec3 col = mix(vec3(1.0, 0.3, 0.02), vec3(1.0, 0.8, 0.35), pow(core, 2.0));
  float a = clamp(pow(core, 1.2) * flick * power * 1.2, 0.0, 1.0);
  gl_FragColor = vec4(col, a);
}`;
const FLAME_VS = `varying vec2 vUv;
${LOGV}
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); ${LOGVM} }`;
function buildFlame() {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({ uniforms: { time: { value: 0 }, power: { value: 1 } }, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.42, 20, 1, true), mat);
  cone.rotation.x = -Math.PI / 2; cone.position.z = -0.21; g.add(cone);
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.2, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.95, depthWrite: false }));
  core.rotation.x = -Math.PI / 2; core.position.z = -0.1; g.add(core);
  const gl = sprite(GLOW_SOFT, '#ff9a40', 0.5); gl.position.z = -0.08; g.add(gl);
  g.userData = { mat, glow: gl };
  return g;
}
function panelTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); g.fillStyle = '#16244a'; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#5f7fd0'; g.lineWidth = 1.2;
  for (let x = 0; x <= 256; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  for (let y = 0; y <= 64; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
}
let PANEL_TEX;
function buildSatellite() {
  const g = new THREE.Group();
  const gold = M('#d2a63c', { metalness: 0.9, roughness: 0.28 }), white = M('#e8eaee'), panel = M('#ffffff', { map: PANEL_TEX, metalness: 0.5, roughness: 0.25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.2), gold); g.add(body);
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.08), white); arm.rotation.z = Math.PI / 2; arm.position.x = s * 0.11; g.add(arm);
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.004, 0.15), panel); p.position.x = s * 0.4; g.add(p);
  }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 8, 0, Math.PI * 2, 0, 0.9), white); dish.rotation.x = Math.PI; dish.position.y = -0.12; g.add(dish);
  const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1), white); ant.position.set(0.03, 0.12, 0.03); g.add(ant);
  return g;
}
function buildCapsule() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.5, 0.62, 32), M('#d8dce3', { roughness: 0.5, metalness: 0.3 }));
  body.rotation.x = Math.PI / 2; body.position.z = 0.1; g.add(body);
  const shield = new THREE.Mesh(new THREE.SphereGeometry(0.62, 32, 12, 0, Math.PI * 2, 0, 0.9), M('#3a2a20', { roughness: 0.9 }));
  shield.rotation.x = -Math.PI / 2; shield.position.z = -0.38; shield.scale.set(1, 1, 0.35); g.add(shield);
  const win = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), M('#1b2230', { metalness: 0.8, roughness: 0.2 })); win.position.set(0.31, 0, 0.12); win.rotation.y = Math.PI / 2 - 0.35; g.add(win);
  const plasma = sprite(GLOW_SOFT, '#ff8a3c', 2.6, 0); plasma.position.z = -0.5; g.add(plasma);
  const plasma2 = sprite(GLOW_SOFT, '#ffd9a0', 1.3, 0); plasma2.position.z = -0.45; g.add(plasma2);
  const chute = new THREE.Group();
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.4, 24, 8, 0, Math.PI * 2, 0, 1.0), new THREE.MeshStandardMaterial({ color: '#f07a3a', side: THREE.DoubleSide, roughness: 0.8 }));
  canopy.position.z = 3.2; canopy.rotation.x = Math.PI / 2; chute.add(canopy); chute.visible = false; g.add(chute);
  g.userData = { plasma, plasma2, chute };
  return g;
}
function buildMountain() {
  const g = new THREE.Group();
  const geo = new THREE.ConeGeometry(1, 1, 48, 8);
  const pos = geo.attributes.position, col = [];
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) + 0.5;
    const n = 1 + 0.12 * Math.sin(pos.getX(i) * 17 + pos.getZ(i) * 13) * (1 - y);
    pos.setX(i, pos.getX(i) * n); pos.setZ(i, pos.getZ(i) * n);
    const snow = y > 0.62 ? 1 : 0;
    const c = snow ? [0.93, 0.95, 1] : [0.36 + 0.1 * y, 0.32 + 0.08 * y, 0.28 + 0.06 * y];
    col.push(...c);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  m.position.y = 0.5; g.add(m);
  const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.35, 16), M('#3a3f48', { metalness: 0.7 }));
  can.rotation.z = -Math.PI / 2 + 0.1; can.position.set(0.12, 1.03, 0); g.add(can);
  return g;
}

/* ---------- Earth scene ---------- */
const E = {};
function buildEarthScene() {
  const sc = new THREE.Scene();
  scenes.earth = sc;
  const stars = new THREE.Mesh(new THREE.SphereGeometry(4e6, 48, 24), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x9aa3b8, depthWrite: false }));
  stars.renderOrder = -10; stars.frustumCulled = false; sc.add(stars); E.stars = stars;
  sc.add(new THREE.AmbientLight(0x27324a, 0.45));
  sc.add(new THREE.HemisphereLight(0x8fb4ff, 0x10141c, 0.25));
  const tilt = new THREE.Group(); tilt.rotation.x = -OBLIQ; sc.add(tilt); E.tilt = tilt;
  const spin = new THREE.Group(); tilt.add(spin); E.spin = spin;
  const uni = { dayMap: { value: TEX.day }, nightMap: { value: TEX.night }, cloudMap: { value: TEX.clouds }, waterMap: { value: TEX.water }, sunDir: { value: new V3(1, 0, 0) }, cloudOff: { value: 0 }, nightGain: { value: 1.6 }, hasTex: { value: TEX.day ? 1 : 0 }, moonPos: { value: new V3(60, 0, 0) }, moonRad: { value: 1737.4 / 6371 }, sunAng: { value: 0.00465 } };
  E.uni = uni;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 100), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: EARTH_VS, fragmentShader: EARTH_FS }));
  spin.add(earth); E.earth = earth;
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.007, 128, 80), new THREE.ShaderMaterial({ uniforms: uni, vertexShader: EARTH_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
  spin.add(clouds); E.clouds = clouds;
  const atm = new THREE.Mesh(new THREE.SphereGeometry(1.055, 96, 64), new THREE.ShaderMaterial({ uniforms: { sunDir: uni.sunDir, strength: { value: 1.25 } }, vertexShader: ATM_VS, fragmentShader: ATM_FS, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  tilt.add(atm); E.atm = atm;
  const ground = new THREE.Group(); spin.add(ground); E.ground = ground;
  const objs = new THREE.Group(); tilt.add(objs); E.objs = objs;
  E.axis = new THREE.Group();
  const axGeo = new THREE.CylinderGeometry(0.004, 0.004, 2.8, 8);
  const axis = new THREE.Mesh(axGeo, new THREE.MeshBasicMaterial({ color: 0x9fc3ff, transparent: true, opacity: 0.55 }));
  E.axis.add(axis); tilt.add(E.axis); E.axis.visible = false;
  E.rings = new THREE.Group(); spin.add(E.rings); E.rings.visible = false;
  [0, 33.87, 51.5, 70].forEach(lat => {
    for (const s of lat ? [1, -1] : [1]) {
      const r = Math.cos(lat * DEG) * 1.004, y = Math.sin(s * lat * DEG) * 1.004;
      const pts = []; for (let i = 0; i <= 180; i++) { const a = i / 180 * TAU; pts.push(new V3(Math.cos(a) * r, y, Math.sin(a) * r)); }
      const rb = new Ribbon(181, lat === 0 ? '#ffd27a' : '#8fd3ff', lat === 0 ? 2.5 : 1.6, { fade: 1, opacity: 0.8 });
      rb.set(pts); E.rings.add(rb.mesh);
    }
  });
  return sc;
}

/* ---------- camera rig ---------- */
const Cam = {
  rig: { frame: () => ({ pos: new V3(), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist: 3.2, az: 0.4, el: 0.25, lock: false },
  cur: { pos: new V3(0, 0, 3), look: new V3(), up: new V3(0, 1, 0) },
  rate: 2.2, userAz: 0, userEl: 0, userZoom: 1, minDist: 0.003, maxDist: 3e6,
  go(o, rate) {
    Object.assign(this.rig, o);
    if (rate) this.rate = rate;
    this.userAz = 0; this.userEl = 0; this.userZoom = 1;
  },
  desired() {
    const f = this.rig.frame();
    const up = f.up.clone().normalize();
    let fwd = f.fwd.clone().sub(up.clone().multiplyScalar(f.fwd.dot(up)));
    if (fwd.lengthSq() < 1e-10) fwd = new V3(1, 0, 0).sub(up.clone().multiplyScalar(up.x));
    fwd.normalize();
    const az = this.rig.az + this.userAz, el = clamp(this.rig.el + this.userEl, -1.45, 1.5);
    const back = fwd.clone().negate().applyAxisAngle(up, az);
    const dir = back.multiplyScalar(Math.cos(el)).add(up.clone().multiplyScalar(Math.sin(el)));
    const d = clamp(this.rig.dist * this.userZoom, this.minDist, this.maxDist);
    const look = f.pos.clone().add(f.lookOff || new V3());
    return { pos: f.pos.clone().add(dir.multiplyScalar(d)), look, up: this.rig.worldUp ? new V3(0, 1, 0) : up };
  },
  update(dt, snap) {
    const d = this.desired(), k = (snap || window.__snapCam) ? 1 : 1 - Math.exp(-dt * this.rate);
    const off = this.cur.pos.clone().sub(this.cur.look), dOff = d.pos.clone().sub(d.look);
    const l0 = Math.max(off.length(), 1e-6), l1 = Math.max(dOff.length(), 1e-6);
    const ln = Math.exp(Math.log(l0) + (Math.log(l1) - Math.log(l0)) * k);
    const dir = off.normalize().lerp(dOff.normalize(), k);
    if (dir.lengthSq() < 1e-8) dir.copy(dOff).normalize(); else dir.normalize();
    this.cur.look.lerp(d.look, k); this.cur.up.lerp(d.up, k).normalize();
    this.cur.pos.copy(this.cur.look).add(dir.multiplyScalar(ln));
    camera.position.copy(this.cur.pos); camera.up.copy(this.cur.up); camera.lookAt(this.cur.look);
    camera.near = Math.max(1e-5, Math.min(0.05, ln * 0.02)); camera.far = 1e7; camera.updateProjectionMatrix();
    if (E.stars) E.stars.position.copy(camera.position);
  }
};
function setupInput(el) {
  let drag = null, pinch = null;
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id || pinch) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    Cam.userAz -= dx * 0.006; Cam.userEl += dy * 0.005; Cam.rate = Math.max(Cam.rate, 6);
    App.onUserCamera && App.onUserCamera();
  });
  const end = e => { if (drag && e.pointerId === drag.id) drag = null; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('wheel', e => { e.preventDefault(); Cam.userZoom *= Math.exp(e.deltaY * 0.0012); Cam.rate = Math.max(Cam.rate, 6); App.onUserCamera && App.onUserCamera(); }, { passive: false });
  el.addEventListener('touchstart', e => { if (e.touches.length === 2) { pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: true });
  el.addEventListener('touchmove', e => {
    if (e.touches.length === 2 && pinch) {
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      Cam.userZoom *= pinch / d; pinch = d; Cam.rate = Math.max(Cam.rate, 6);
    }
  }, { passive: true });
  el.addEventListener('touchend', () => { pinch = null; });
}

/* ---------- labels projected from 3D ---------- */
const Labels = {
  list: [], box: null,
  add(html, cls, posFn, opts = {}) {
    const el = document.createElement('div'); el.className = 'lbl ' + (cls || ''); el.innerHTML = html;
    this.box.appendChild(el);
    const L = { el, posFn, occlude: opts.occlude !== false, scene: opts.scene || 'earth', set: h => { if (L._h !== h) { el.innerHTML = h; L._h = h; } } };
    this.list.push(L); return L;
  },
  clear() { this.list.forEach(l => l.el.remove()); this.list = []; },
  remove(L) { if (!L) return; L.el.remove(); this.list = this.list.filter(x => x !== L); },
  update(sceneName, W, H) {
    const v = new V3(), cp = camera.position;
    for (const L of this.list) {
      if (L.scene !== sceneName) { L.el.style.display = 'none'; continue; }
      const p = L.posFn(); if (!p) { L.el.style.display = 'none'; continue; }
      v.copy(p);
      let hidden = false;
      if (L.occlude && sceneName === 'earth') {
        const d = v.clone().sub(cp), dl = d.length(); d.normalize();
        const b = cp.dot(d), c = cp.lengthSq() - 0.995 * 0.995, disc = b * b - c;
        if (disc > 0) { const t = -b - Math.sqrt(disc); if (t > 0 && t < dl) hidden = true; }
      }
      v.project(camera);
      if (hidden || v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.2 || Math.abs(v.y) > 1.2) { L.el.style.display = 'none'; continue; }
      L.el.style.display = '';
      L.el.style.transform = `translate(${((v.x + 1) / 2 * W).toFixed(1)}px, ${((1 - v.y) / 2 * H).toFixed(1)}px)`;
    }
  }
};

/* ---------- renderer ---------- */
function initRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  camera = new THREE.PerspectiveCamera(42, 1, 0.001, 2400);
  GLOW_SOFT = glowTexture([[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.12)'], [1, 'rgba(255,255,255,0)']]);
  GLOW_SUN = glowTexture([[0, 'rgba(255,255,255,1)'], [0.12, 'rgba(255,252,240,1)'], [0.22, 'rgba(255,230,180,0.6)'], [0.5, 'rgba(255,190,110,0.12)'], [1, 'rgba(255,160,80,0)']]);
  PANEL_TEX = panelTexture();
  if (THREE.EffectComposer && THREE.UnrealBloomPass) {
    composer = new THREE.EffectComposer(renderer);
    renderPass = new THREE.RenderPass(new THREE.Scene(), camera);
    bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
    composer.addPass(renderPass); composer.addPass(bloomPass);
  }
}
function resizeRenderer(W, H) {
  const pr = Math.min(window.devicePixelRatio || 1, GFX.quality === 'high' ? 2 : 1);
  renderer.setPixelRatio(pr); renderer.setSize(W, H, false);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(pr); composer.setSize(W, H); }
  Ribbon.all.forEach(r => r.mat.uniforms.resolution.value.set(W, H));
}
function renderScene(sc) {
  if (composer && GFX.quality === 'high') { renderPass.scene = sc; composer.render(); }
  else renderer.render(sc, camera);
}
