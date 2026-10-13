/* ================= LIVING EARTH: plates, earthquakes, aurora, magnetic field, winds, storms, ocean currents ================= */
const Living = {
  on: { plates: false, quakes: false, aurora: false, field: false, winds: '', storms: false, currents: false },
  data: {}, status: {}, objs: {}, t: 0, built: false
};
/* earth-fixed point in the ground frame (radius in Earth radii) */
function gp(lat, lon, r = 1, out = new V3()) {
  const a = lat * DEG, b = lon * DEG, c = Math.cos(a);
  return out.set(c * Math.cos(b) * r, Math.sin(a) * r, -c * Math.sin(b) * r);
}
function gpLL(p) { const r = p.length(); return [Math.asin(clamp(p.y / r, -1, 1)) / DEG, Math.atan2(-p.z, p.x) / DEG]; }

/* fetch one live feed once; remember whether it worked */
function liveFeed(name, url) {
  if (Living.data[name] !== undefined) return Promise.resolve(Living.data[name]);
  if (Living['p_' + name]) return Living['p_' + name];
  Living.status[name] = { state: 'loading' };
  return (Living['p_' + name] = fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(d => { if (d.error) throw new Error(d.error); Living.data[name] = d; Living.status[name] = { state: 'live', source: d.source, fetched: d.fetched }; refreshLivingPanel(); return d; })
    .catch(e => { Living.data[name] = null; Living.status[name] = { state: 'off', err: String(e.message || e) }; refreshLivingPanel(); return null; }));
}
function refreshLivingPanel() { (Living.onRefresh || []).forEach(f => { try { f(); } catch (e) { } }); }

/* ---------- many polylines in one draw call, screen-space width, optional flowing dashes ---------- */
const MRIB_VS = `
attribute vec3 prev; attribute vec3 next; attribute float side; attribute float counter; attribute vec3 acol; attribute float aw;
uniform vec2 resolution; uniform float width;
varying float vC; varying vec3 vCol;
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
  c.xy += nrm * side * width * aw / resolution.y * c.w;
  gl_Position = c; vC = counter; vCol = acol;
  ${LOGVM}
}`;
const MRIB_FS = `
uniform float opacity; uniform float time; uniform float dash;
varying float vC; varying vec3 vCol;
${LOGF}
void main(){
  ${LOGFM}
  float a = 1.0;
  if (dash > 0.0) { float f = fract(vC * dash - time); a = 0.18 + 0.82 * pow(f, 3.0); }
  gl_FragColor = vec4(vCol, opacity * a);
}`;
function multiRibbon(lines, o = {}) {
  /* lines: [{pts:[V3], color, w}] */
  let nv = 0, ni = 0;
  lines.forEach(L => { if (L.pts.length > 1) { nv += L.pts.length * 2; ni += (L.pts.length - 1) * 6; } });
  const P = new Float32Array(nv * 3), Pr = new Float32Array(nv * 3), Nx = new Float32Array(nv * 3), S = new Float32Array(nv), C = new Float32Array(nv), A = new Float32Array(nv * 3), W = new Float32Array(nv);
  const I = new Uint32Array(ni);
  let v = 0, ii = 0; const col = new THREE.Color();
  for (const L of lines) {
    const n = L.pts.length; if (n < 2) continue;
    col.set(L.color || '#ffffff');
    let arc = L.start || 0;
    for (let i = 0; i < n; i++) {
      const p = L.pts[i], pp = L.pts[Math.max(0, i - 1)], pn = L.pts[Math.min(n - 1, i + 1)];
      if (i) arc += p.distanceTo(L.pts[i - 1]);
      for (let k = 0; k < 2; k++) {
        const j = v + i * 2 + k;
        P[j * 3] = p.x; P[j * 3 + 1] = p.y; P[j * 3 + 2] = p.z;
        Pr[j * 3] = pp.x; Pr[j * 3 + 1] = pp.y; Pr[j * 3 + 2] = pp.z;
        Nx[j * 3] = pn.x; Nx[j * 3 + 1] = pn.y; Nx[j * 3 + 2] = pn.z;
        S[j] = k ? -1 : 1; C[j] = arc; A[j * 3] = col.r; A[j * 3 + 1] = col.g; A[j * 3 + 2] = col.b; W[j] = L.w || 1;
      }
      if (i < n - 1) { const a = v + i * 2; I.set([a, a + 1, a + 2, a + 2, a + 1, a + 3], ii); ii += 6; }
    }
    v += n * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('prev', new THREE.BufferAttribute(Pr, 3)); g.setAttribute('next', new THREE.BufferAttribute(Nx, 3));
  g.setAttribute('side', new THREE.BufferAttribute(S, 1)); g.setAttribute('counter', new THREE.BufferAttribute(C, 1)); g.setAttribute('acol', new THREE.BufferAttribute(A, 3)); g.setAttribute('aw', new THREE.BufferAttribute(W, 1));
  g.setIndex(new THREE.BufferAttribute(I, 1));
  const mat = o.mat || new THREE.ShaderMaterial({
    uniforms: { resolution: { value: new THREE.Vector2(VIEW.W, VIEW.H) }, width: { value: o.width || 2 }, opacity: { value: o.opacity ?? 0.9 }, time: { value: 0 }, dash: { value: o.dash || 0 } },
    vertexShader: MRIB_VS, fragmentShader: MRIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: o.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending
  });
  if (!o.mat) Ribbon.all.add({ mat });
  const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false;
  return mesh;
}
/* smooth a lat/lon path along the sphere */
function spherePath(ll, r, per = 8) {
  const raw = ll.map(([la, lo]) => gp(la, lo, 1));
  const curve = new THREE.CatmullRomCurve3(raw, false, 'centripetal');
  const n = Math.max(2, (raw.length - 1) * per);
  return curve.getPoints(n).map(p => p.normalize().multiplyScalar(r));
}

/* ---------- tectonic plates (Bird 2002) ---------- */
const PLATE_KIND = {
  spread: { color: '#5ad1ff', name: 'Pulling apart', note: 'new sea floor is made here' },
  collide: { color: '#ff6b6b', name: 'Crashing together', note: 'mountains are pushed up' },
  subduct: { color: '#ffcf6b', name: 'Diving under', note: 'one plate sinks, making trenches and volcanoes' },
  slide: { color: '#c9b9ff', name: 'Sliding past', note: 'like the San Andreas Fault' }
};
const PLATE_LABELS = [['Pacific', -8, -145], ['North American', 48, -100], ['South American', -15, -55], ['Eurasian', 52, 70], ['African', 5, 18], ['Antarctic', -78, 40], ['Indo-Australian', -25, 125], ['Nazca', -22, -92], ['Arabian', 23, 45], ['Philippine', 17, 133], ['Caribbean', 15, -75], ['Cocos', 7, -95], ['Scotia', -57, -45], ['Juan de Fuca', 46, -128]];
async function buildPlates() {
  if (Living.objs.plates) return;
  Living.objs.plates = { pending: true };
  let d = null;
  try { const r = await fetch('tex/plates.json'); d = await r.json(); } catch (e) { Living.objs.plates = null; return; }
  const lines = d.lines.map(L => {
    const pts = []; for (let i = 2; i < L.length; i += 2) pts.push(gp(L[i + 1], L[i], 1.0095));
    return { pts, color: PLATE_KIND[L[0]].color, w: L[0] === 'slide' ? 0.8 : 1.2 };
  });
  const mesh = multiRibbon(lines, { width: 2.2, opacity: 0.95, additive: false });
  E.ground.add(mesh);
  const lbls = PLATE_LABELS.map(([n, la, lo]) => {
    const p = gp(la, lo, 1.01);
    const L = Labels.add('<b>' + n + ' Plate</b>', 'body', () => Living.on.plates && Living.ok() ? E.ground.localToWorld(p.clone()) : null, { occlude: true });
    L.el.style.setProperty('--c', '#e8ecf5'); return L;
  });
  Living.objs.plates = { mesh, lbls };
}

/* ---------- earthquakes (USGS) ---------- */
const QUAKE_VS = `attribute float size; attribute vec3 color; attribute float recent; uniform float pr; uniform float time;
varying vec3 vC; varying float vR;
${LOGV}
void main(){ vC = color; vR = recent; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pr * (recent > 0.5 ? 3.2 : 1.0); gl_Position = projectionMatrix * mv; ${LOGVM} }`;
const QUAKE_FS = `uniform float time; varying vec3 vC; varying float vR;
${LOGF}
void main(){ ${LOGFM}
  vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
  float core = vR > 0.5 ? r * 3.2 : r;
  float a = smoothstep(1.0, 0.55, core);
  float ring = 0.0;
  if (vR > 0.5) { float rr = fract(time * 0.5 + vR * 0.37); ring = (1.0 - smoothstep(0.0, 0.08, abs(r - rr))) * (1.0 - rr); }
  float al = max(a, ring * 0.9); if (al < 0.01) discard;
  gl_FragColor = vec4(mix(vC, vec3(1.0), 0.25 * a), al);
}`;
function quakeColor(depth) { return depth < 70 ? '#ffd27a' : depth < 300 ? '#ff7a45' : '#ff4fa3'; }
async function buildQuakes() {
  if (Living.objs.quakes) return;
  Living.objs.quakes = { pending: true };
  const d = await liveFeed('quakes', '/api/quakes');
  if (!d || !d.quakes || !d.quakes.length) { Living.objs.quakes = { empty: true }; return; }
  const q = d.quakes.slice().sort((a, b) => a[3] - b[3]);
  const n = q.length, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), rec = new Float32Array(n);
  const c = new THREE.Color(), v = new V3(), now = Date.now();
  q.forEach((e, i) => {
    gp(e[1], e[0], 1.0098, v); pos.set([v.x, v.y, v.z], i * 3);
    c.set(quakeColor(e[2])); col.set([c.r, c.g, c.b], i * 3);
    size[i] = clamp(2.5 + (e[3] - 2.5) * 3.3, 2.5, 22);
    rec[i] = now - e[4] < 86400e3 && e[3] >= 4 ? 1 + (i % 7) * 0.1 : 0;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('recent', new THREE.BufferAttribute(rec, 1));
  const mat = new THREE.ShaderMaterial({ uniforms: { pr: { value: Math.min(2, window.devicePixelRatio || 1) }, time: { value: 0 } }, vertexShader: QUAKE_VS, fragmentShader: QUAKE_FS, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; E.ground.add(pts);
  const big = d.quakes.slice().sort((a, b) => b[3] - a[3]).slice(0, 3);
  const lbls = big.map(e => {
    const p = gp(e[1], e[0], 1.01);
    const L = Labels.add(`<b>M${fmt(e[3], 1)}</b><span>${e[5]}</span>`, 'flag', () => Living.on.quakes && Living.ok() ? E.ground.localToWorld(p.clone()) : null, { occlude: true });
    L.el.style.setProperty('--c', quakeColor(e[2])); return L;
  });
  Living.objs.quakes = { pts, mat, lbls, list: d.quakes };
}
function quakeStats() {
  const d = Living.data.quakes; if (!d || !d.quakes) return null;
  const q = d.quakes, now = Date.now();
  const day = q.filter(e => now - e[4] < 86400e3).length;
  const big = q.slice().sort((a, b) => b[3] - a[3]);
  return { total: q.length, day, top: big.slice(0, 5), m6: q.filter(e => e[3] >= 6).length };
}

/* ---------- aurora (NOAA OVATION) ---------- */
const AUR_VS = `varying vec3 vL; varying vec3 vW;
${LOGV}
void main(){ vL = position; vW = normalize(mat3(modelMatrix) * position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGVM} }`;
const AUR_FS = `uniform sampler2D map; uniform vec3 sunW; uniform float time; uniform vec3 tint; uniform float gain;
varying vec3 vL; varying vec3 vW;
${LOGF}
void main(){ ${LOGFM}
  vec3 p = normalize(vL);
  float lat = degrees(asin(clamp(p.y, -1.0, 1.0))), lon = degrees(atan(-p.z, p.x));
  vec2 uv = vec2(fract(lon / 360.0 + 0.5 / 360.0), (lat + 90.0) / 180.0 * (180.0 / 181.0) + 0.5 / 181.0);
  float v = texture2D(map, uv).r * 2.55;
  float i = smoothstep(0.02, 0.45, v);
  float night = smoothstep(0.08, -0.2, dot(vW, sunW));
  float sh = 0.5 + 0.5 * sin(lon * 0.9 + time * 0.7 + 1.6 * sin(lon * 0.23 - time * 0.35)) * sin(lon * 0.31 - time * 0.4 + lat * 0.2);
  float a = i * (0.12 + 0.88 * night) * (0.7 + 0.45 * sh) * gain;
  if (a < 0.004) discard;
  gl_FragColor = vec4(mix(tint, vec3(1.0, 0.35, 0.55), smoothstep(0.55, 1.0, v) * 0.35) * a, a);
}`;
const MAG_N = [80.8, -72.7];
function auroraModel(kp, date) {
  /* typical oval when live data is missing: centred on the magnetic poles, brightest around local midnight */
  const g = new Uint8Array(360 * 181), pole = gp(MAG_N[0], MAG_N[1]), ss = subsolar(date);
  const sun = gp(ss[0], ss[1]), v = new V3();
  const centre = 69 - 1.4 * kp, w = 2.6 + 0.7 * kp;
  for (let la = -90; la <= 90; la++) for (let lo = 0; lo < 360; lo++) {
    gp(la, lo, 1, v);
    const ml = Math.asin(clamp(v.dot(pole), -1, 1)) / DEG;
    const x = (Math.abs(ml) - centre) / w;
    if (Math.abs(x) > 3) continue;
    const tang = v.clone().sub(pole.clone().multiplyScalar(v.dot(pole))), st = sun.clone().sub(pole.clone().multiplyScalar(sun.dot(pole)));
    const mid = -tang.normalize().dot(st.normalize());
    g[(la + 90) * 360 + lo] = clamp(Math.round(55 * Math.exp(-x * x) * (0.4 + 0.6 * (0.5 + 0.5 * mid)) * (0.6 + kp / 7)), 0, 100);
  }
  return g;
}
function buildAurora() {
  if (Living.objs.aurora) return;
  const data = new Uint8Array(360 * 181 * 4);
  const tex = new THREE.DataTexture(data, 360, 181, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping; tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const mk = (r, tint, gain) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 256, 128), new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, sunW: { value: new V3(1, 0, 0) }, time: { value: 0 }, tint: { value: new THREE.Color(tint) }, gain: { value: gain } },
      vertexShader: AUR_VS, fragmentShader: AUR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    }));
    E.ground.add(m); return m;
  };
  const o = Living.objs.aurora = { tex, data, low: mk(1.016, '#46ff8c', 1.25), high: mk(1.034, '#ff5a7a', 0.35), mode: 'model', modelT: 0 };
  const fill = g => { for (let i = 0; i < g.length; i++) { data[i * 4] = g[i]; data[i * 4 + 3] = 255; } tex.needsUpdate = true; };
  o.fill = fill;
  fill(auroraModel(3, Clock.now()));
  liveFeed('space', '/api/spaceweather').then(d => {
    if (!d || !d.aurora) return;
    const bin = atob(d.aurora), g = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) g[i] = bin.charCodeAt(i);
    if (g.length === 360 * 181) { fill(g); o.mode = 'live'; }
  });
}

/* ---------- magnetic field and solar wind ---------- */
function buildField() {
  if (Living.objs.field) return;
  const o = Living.objs.field = { mesh: null, t: -1 };
  const mat = new THREE.ShaderMaterial({
    uniforms: { resolution: { value: new THREE.Vector2(VIEW.W, VIEW.H) }, width: { value: 1.6 }, opacity: { value: 0.55 }, time: { value: 0 }, dash: { value: 0.35 } },
    vertexShader: MRIB_VS, fragmentShader: MRIB_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
  Ribbon.all.add({ mat }); o.mat = mat;
  /* solar wind particles, in a frame whose +x points at the Sun */
  o.sw = new THREE.Group(); scenes.earth.add(o.sw);
  const N = 2200; o.N = N; o.p = new Float32Array(N * 3); o.hot = new Uint8Array(N);
  for (let i = 0; i < N; i++) swSpawn(o, i, true);
  o.pts = makeSatPoints(new Array(N), '#ffe08a', 4.2); o.sw.add(o.pts);
  liveFeed('space', '/api/spaceweather');
}
function swSpawn(o, i, anywhere) {
  /* a thin sheet through Earth, seen from above, so the swerve around the bow shock is visible */
  o.p[i * 3] = anywhere ? 30 - Math.random() * 75 : 30 + Math.random() * 4; o.p[i * 3 + 1] = (Math.random() - 0.5) * 2.4; o.p[i * 3 + 2] = (Math.random() * 2 - 1) * 28; o.hot[i] = 0;
}
function windPressureScale() {
  const d = Living.data.space, w = d && d.wind;
  const v = w && w.speed ? w.speed : 400, n = w && w.density ? w.density : 5;
  return { v, n, R0: clamp(10.2 * Math.pow((n * v * v) / (5 * 400 * 400), -1 / 6), 5.5, 13) };
}
function fieldLines(sunL, R0) {
  const m = gp(MAG_N[0], MAG_N[1]), e1 = new V3(0, 1, 0).cross(m).normalize(), e2 = m.clone().cross(e1).normalize();
  const lines = [];
  const deform = p => {
    const r = p.length(), s = p.clone().normalize().dot(sunL);
    const f = s > 0 ? 1 / (1 + Math.max(0, r - 1) * s * 0.9 / R0) : 1 + Math.max(0, r - 1.2) * (-s) * 0.16;
    return p.multiplyScalar(f);
  };
  [1.7, 2.4, 3.4, 4.8, 6.6, 9].forEach((L, li) => {
    for (let k = 0; k < 12; k++) {
      const ph = k / 12 * TAU, lm = Math.acos(Math.sqrt(1 / L)), pts = [];
      for (let j = 0; j <= 80; j++) {
        const la = -lm + 2 * lm * j / 80, r = L * Math.cos(la) ** 2;
        const p = e1.clone().multiplyScalar(Math.cos(ph)).add(e2.clone().multiplyScalar(Math.sin(ph))).multiplyScalar(Math.cos(la) * r).add(m.clone().multiplyScalar(Math.sin(la) * r));
        pts.push(deform(p).multiplyScalar(1.0));
      }
      const c = new THREE.Color().setHSL(0.52 + li * 0.045, 0.85, 0.62);
      lines.push({ pts, color: '#' + c.getHexString(), w: L > 7 ? 0.7 : 1 });
    }
  });
  return lines;
}
function updateField(dt, time) {
  const o = Living.objs.field; if (!o) return;
  const vis = Living.on.field && Living.ok();
  o.sw.visible = vis; if (o.mesh) o.mesh.visible = vis;
  if (!vis) return;
  const sunW = U.sunWorld.clone().normalize();
  const { v, R0 } = windPressureScale();
  if (time - o.t > 1.0 || !o.mesh) {
    o.t = time;
    const sunL = E.ground.worldToLocal(U.sunWorld.clone()).normalize();
    if (o.mesh) { E.ground.remove(o.mesh); o.mesh.geometry.dispose(); }
    o.mesh = multiRibbon(fieldLines(sunL, R0), { mat: o.mat }); E.ground.add(o.mesh);
  }
  o.mat.uniforms.time.value = time * 0.6;
  /* particles flow away from the Sun and swerve around the bow shock */
  const up = Math.abs(sunW.y) > 0.9 ? new V3(1, 0, 0) : new V3(0, 1, 0);
  const z = sunW.clone().cross(up).normalize(), y = z.clone().cross(sunW).normalize();
  o.sw.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sunW, y, z));
  const sp = dt * 11 * (v / 400), P = o.p, bs = R0 * 1.35;
  for (let i = 0; i < o.N; i++) {
    let x = P[i * 3], yy = P[i * 3 + 1], zz = P[i * 3 + 2];
    x -= sp * (o.hot[i] ? 0.55 : 1);
    const r = Math.hypot(x, yy, zz), ct = x / (r || 1), rb = bs * Math.sqrt(2 / (1 + Math.max(-0.95, ct)));
    if (r < rb && x > -40) { const k = rb / (r || 1); yy *= k; zz *= k; x = x * k; o.hot[i] = 1; }
    if (x < -45) { swSpawn(o, i, false); continue; }
    P[i * 3] = x; P[i * 3 + 1] = yy; P[i * 3 + 2] = zz;
  }
  const pos = o.pts.geometry.attributes.position, col = o.pts.geometry.attributes.color;
  pos.array.set(P); pos.needsUpdate = true;
  for (let i = 0; i < o.N; i++) { const h = o.hot[i]; col.array[i * 3] = 1; col.array[i * 3 + 1] = h ? 0.6 : 0.88; col.array[i * 3 + 2] = h ? 0.35 : 0.55; }
  col.needsUpdate = true;
}

/* ---------- winds (Open-Meteo) ---------- */
function windModel(level, lat, lon, t) {
  /* typical global pattern, used when live data is missing */
  const a = Math.abs(lat), s = Math.sign(lat) || 1;
  if (level === 'jet') {
    const c = 42 + 6 * Math.sin(lon * DEG * 4 + t * 0.05), j = 38 * Math.exp(-Math.pow((a - c) / 7, 2)) + 18 * Math.exp(-Math.pow((a - 28) / 5, 2));
    return [j + 4, 6 * Math.cos(lon * DEG * 4 + t * 0.05) * Math.exp(-Math.pow((a - c) / 10, 2)) * s];
  }
  let u, v;
  if (a < 30) { u = -6 * Math.sin(a / 30 * Math.PI) - 1; v = -2.5 * s * Math.sin(a / 30 * Math.PI); }
  else if (a < 60) { u = 8 * Math.sin((a - 30) / 30 * Math.PI); v = 1.5 * s * Math.sin((a - 30) / 30 * Math.PI); }
  else { u = -4 * Math.sin((a - 60) / 30 * Math.PI); v = -1 * s * Math.sin((a - 60) / 30 * Math.PI); }
  return [u + 2 * Math.sin(lon * DEG * 3), v + 1.5 * Math.cos(lon * DEG * 5 + lat * DEG * 3)];
}
function liveWindAt(level, lat, lon, t) {
  const d = Living.data.winds;
  if (!d || !d.lats) return windModel(level, lat, lon, t);
  const f = d[level === 'jet' ? 'jet' : 'surface'], NL = d.lats.length, NO = d.lons.length;
  const la = clamp((lat - d.lats[0]) / 10, 0, NL - 1.001), lo = ((lon - d.lons[0]) / 10 % NO + NO) % NO;
  const i0 = Math.floor(la), j0 = Math.floor(lo), fi = la - i0, fj = lo - j0, j1 = (j0 + 1) % NO;
  const get = (A, i, j) => A[i * NO + j];
  const bil = A => (get(A, i0, j0) * (1 - fj) + get(A, i0, j1) * fj) * (1 - fi) + (get(A, i0 + 1, j0) * (1 - fj) + get(A, i0 + 1, j1) * fj) * fi;
  return [bil(f.u), bil(f.v)];
}
const WIND_COLS = {
  surface: [[0, '#2f5fc9'], [4, '#5ab4ff'], [9, '#d8f1ff'], [15, '#ffd27a'], [22, '#ff7a45']],
  jet: [[0, '#4636a8'], [15, '#9a7bff'], [35, '#ff6fd0'], [55, '#fff0fb']]
};
function windColor(level, s, out) {
  const t = WIND_COLS[level === 'jet' ? 'jet' : 'surface'];
  for (let i = 1; i < t.length; i++) if (s <= t[i][0] || i === t.length - 1) { const k = clamp((s - t[i - 1][0]) / (t[i][0] - t[i - 1][0]), 0, 1); return out.set(t[i - 1][1]).lerp(new THREE.Color(t[i][1]), k); }
  return out;
}
function buildWinds() {
  if (Living.objs.winds) return;
  const N = 3000, T = 14, o = Living.objs.winds = { N, T, p: new Float32Array(N * T * 3), life: new Float32Array(N), age: new Float32Array(N), level: '' };
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * (T - 1) * 2 * 3), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * (T - 1) * 2 * 4), 4));
  o.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  o.lines.frustumCulled = false; E.ground.add(o.lines);
  for (let i = 0; i < N; i++) windSpawn(o, i);
  liveFeed('winds', '/api/winds');
}
function windSpawn(o, i) {
  const z = Math.random() * 2 - 1, a = Math.random() * TAU, c = Math.sqrt(1 - z * z);
  for (let k = 0; k < o.T; k++) { o.p[(i * o.T + k) * 3] = c * Math.cos(a); o.p[(i * o.T + k) * 3 + 1] = z; o.p[(i * o.T + k) * 3 + 2] = c * Math.sin(a); }
  o.life[i] = 2 + Math.random() * 5; o.age[i] = 0;
}
function updateWinds(dt, time) {
  const o = Living.objs.winds; if (!o) return;
  const level = Living.on.winds, vis = !!level && Living.ok();
  o.lines.visible = vis; if (!vis) return;
  const rad = level === 'jet' ? 1.016 : 1.0105, K = (level === 'jet' ? 0.16 : 0.5) * DEG;
  const P = o.p, T = o.T, pos = o.lines.geometry.attributes.position.array, col = o.lines.geometry.attributes.color.array;
  const p = new V3(), e = new V3(), n = new V3(), c = new THREE.Color(), Y = new V3(0, 1, 0);
  const step = Math.min(dt, 0.05);
  for (let i = 0; i < o.N; i++) {
    o.age[i] += step;
    if (o.age[i] > o.life[i]) windSpawn(o, i);
    const b = i * T * 3;
    for (let k = T - 1; k > 0; k--) { P[b + k * 3] = P[b + (k - 1) * 3]; P[b + k * 3 + 1] = P[b + (k - 1) * 3 + 1]; P[b + k * 3 + 2] = P[b + (k - 1) * 3 + 2]; }
    p.set(P[b], P[b + 1], P[b + 2]);
    const lat = Math.asin(clamp(p.y, -1, 1)) / DEG, lon = Math.atan2(-p.z, p.x) / DEG;
    const [u, v] = liveWindAt(level, lat, lon, time);
    e.copy(Y).cross(p); if (e.lengthSq() < 1e-8) e.set(1, 0, 0); e.normalize(); n.copy(p).cross(e).normalize();
    /* e = Y x p points east, n = p x e points north */
    p.addScaledVector(e, u * K * step).addScaledVector(n, v * K * step).normalize();
    P[b] = p.x; P[b + 1] = p.y; P[b + 2] = p.z;
    const s = Math.hypot(u, v); windColor(level, s, c);
    const fadeIn = Math.min(1, o.age[i] * 2), fadeOut = Math.min(1, (o.life[i] - o.age[i]) * 2), polar = 1 - smooth01((Math.abs(lat) - 78) / 8);
    for (let k = 0; k < T - 1; k++) {
      const j = (i * (T - 1) + k) * 2;
      for (let h = 0; h < 2; h++) {
        const q = b + (k + h) * 3;
        pos[(j + h) * 3] = P[q] * rad; pos[(j + h) * 3 + 1] = P[q + 1] * rad; pos[(j + h) * 3 + 2] = P[q + 2] * rad;
        const al = (1 - (k + h) / (T - 1)) * fadeIn * fadeOut * polar;
        col[(j + h) * 4] = c.r; col[(j + h) * 4 + 1] = c.g; col[(j + h) * 4 + 2] = c.b; col[(j + h) * 4 + 3] = al;
      }
    }
  }
  o.lines.geometry.attributes.position.needsUpdate = true; o.lines.geometry.attributes.color.needsUpdate = true;
}
function smooth01(x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); }

/* ---------- tropical storms (NOAA NHC) ---------- */
function spiralTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.translate(128, 128);
  for (let arm = 0; arm < 4; arm++) {
    for (let t = 0; t < 1; t += 0.004) {
      const ang = arm * Math.PI / 2 + t * 5.2, r = 10 + t * 112;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r, a = (1 - t) * 0.5;
      const gr = g.createRadialGradient(x, y, 0, x, y, 10 + t * 26); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, 10 + t * 26, 0, TAU); g.fill();
    }
  }
  g.globalCompositeOperation = 'destination-out';
  const eye = g.createRadialGradient(0, 0, 0, 0, 0, 14); eye.addColorStop(0, 'rgba(0,0,0,1)'); eye.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = eye; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill();
  return new THREE.CanvasTexture(c);
}
async function buildStorms() {
  if (Living.objs.storms) return;
  Living.objs.storms = { list: [], pending: true };
  const d = await liveFeed('storms', '/api/storms');
  const o = Living.objs.storms = { list: [] };
  if (!d || !d.storms) return;
  const tex = spiralTexture();
  d.storms.forEach(s => {
    const kmh = s.windKt != null ? s.windKt * 1.852 : null;
    const size = clamp(0.05 + (s.windKt || 30) / 1800, 0.06, 0.16);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: s.cls === 'HU' ? '#ffffff' : '#dfe8f5' }));
    const nrm = gp(s.lat, s.lon, 1).normalize();
    m.position.copy(nrm.clone().multiplyScalar(1.0115));
    m.quaternion.setFromUnitVectors(new V3(0, 0, 1), nrm);
    E.ground.add(m);
    const cat = s.cls === 'HU' && s.windKt ? (s.windKt >= 137 ? 5 : s.windKt >= 113 ? 4 : s.windKt >= 96 ? 3 : s.windKt >= 83 ? 2 : 1) : null;
    const L = Labels.add(`<b>${s.kind} ${s.name}</b><span>${cat ? 'Category ' + cat + ' · ' : ''}${kmh ? fmt(kmh) + ' km/h winds' : ''}</span>`, 'flag', () => Living.on.storms && Living.ok() ? m.getWorldPosition(new V3()) : null, { occlude: true });
    L.el.style.setProperty('--c', '#ffcf6b');
    o.list.push({ s, m, L, spin: s.lat >= 0 ? 1 : -1, kmh, cat });
  });
}

/* ---------- ocean currents (major surface currents, simplified paths) ---------- */
const CURRENTS = [
  { name: 'Gulf Stream', warm: 1, label: [36, -72], path: [[24.5, -81], [27, -79.8], [31, -79.3], [35, -75], [38, -70], [40, -62], [42, -52], [45, -42], [49, -32], [53, -24], [57, -16], [61, -8], [65, 0], [69, 8], [71, 16]] },
  { name: 'Kuroshio', warm: 1, label: [31, 134], path: [[14, 124], [19, 122.5], [24, 123.5], [28, 127.5], [31, 132], [34, 138], [36, 144], [38, 152], [40, 162], [42, 175], [43, -172], [44, -158], [45, -145], [45, -132]] },
  { name: 'Brazil Current', warm: 1, path: [[-8, -34], [-14, -37.5], [-20, -39.5], [-26, -45], [-32, -49], [-38, -54]] },
  { name: 'East Australian', warm: 1, path: [[-14, 154.5], [-20, 154.8], [-26, 154.5], [-31, 153.6], [-35, 152.5], [-39, 152]] },
  { name: 'Agulhas', warm: 1, path: [[-14, 42], [-20, 39.5], [-26, 34.5], [-31, 31], [-35, 26], [-38, 20]] },
  { name: 'North Equatorial (Atlantic)', warm: 1, path: [[16, -20], [14.5, -30], [13.5, -40], [14, -50], [15.5, -58], [17, -66], [20, -74], [23, -79]] },
  { name: 'North Equatorial (Pacific)', warm: 1, path: [[14, -110], [13, -125], [12.5, -140], [12.5, -155], [13, -170], [13, 175], [13.5, 160], [14, 145], [14, 128]] },
  { name: 'South Equatorial (Pacific)', warm: 1, path: [[-2, -88], [-3, -100], [-4, -115], [-5, -130], [-6, -145], [-7, -160], [-9, -175], [-11, 172], [-13, 160]] },
  { name: 'California Current', warm: 0, path: [[48, -128], [44, -127], [39, -125.5], [34, -122], [29, -117.5], [24, -114], [19, -108]] },
  { name: 'Humboldt Current', warm: 0, label: [-25, -77], path: [[-46, -78], [-40, -76.5], [-33, -74], [-26, -73], [-18, -74], [-11, -80], [-5, -84]] },
  { name: 'Canary Current', warm: 0, path: [[43, -13], [37, -12.5], [31, -13], [26, -16], [21, -19], [16, -21]] },
  { name: 'Benguela Current', warm: 0, path: [[-35, 17.5], [-30, 15], [-24, 12.5], [-18, 10.5], [-12, 8]] },
  { name: 'Labrador Current', warm: 0, path: [[63, -61], [58, -57], [53, -53], [48, -50], [44, -50], [41, -56]] },
  { name: 'Oyashio', warm: 0, path: [[56, 163], [51, 158], [47, 152], [43, 147], [40, 144.5]] },
  { name: 'West Australian', warm: 0, path: [[-36, 113], [-30, 111.5], [-24, 110], [-18, 106], [-13, 101]] }
];
(function () { const ring = []; for (let lo = -180; lo <= 180; lo += 10) ring.push([-56 - 3 * Math.sin(lo * DEG * 2) - (lo > -80 && lo < -50 ? 3 : 0), lo]); CURRENTS.push({ name: 'Antarctic Circumpolar', warm: 0, label: [-57, 100], path: ring }); })();
function buildCurrents() {
  if (Living.objs.currents) return;
  const lines = CURRENTS.map(c => ({ pts: spherePath(c.path, 1.0096, 10), color: c.warm ? '#ff7a59' : '#5ab4ff', w: 1 }));
  const mesh = multiRibbon(lines, { width: 3.2, opacity: 0.95, dash: 22 });
  E.ground.add(mesh);
  const lbls = CURRENTS.filter(c => c.label).map(c => {
    const p = gp(c.label[0], c.label[1], 1.01);
    const L = Labels.add(`<b>${c.name}</b><span>${c.warm ? 'warm' : 'cold'}</span>`, 'flag', () => Living.on.currents && Living.ok() ? E.ground.localToWorld(p.clone()) : null, { occlude: true });
    L.el.style.setProperty('--c', c.warm ? '#ff7a59' : '#5ab4ff'); return L;
  });
  Living.objs.currents = { mesh, lbls };
}

/* ---------- per-frame ---------- */
Living.ok = () => App.scene === 'earth' && !!Player.ch && ['explore', 'sandbox'].includes(Player.ch.id);
function setLiving(name, v) {
  Living.on[name] = v;
  if (!v) return;
  ({ plates: buildPlates, quakes: buildQuakes, aurora: buildAurora, field: buildField, winds: buildWinds, storms: buildStorms, currents: buildCurrents })[name]();
}
function updateLiving(dt, time) {
  const ok = Living.ok(), o = Living.objs;
  if (o.plates && o.plates.mesh) o.plates.mesh.visible = ok && Living.on.plates;
  if (o.quakes && o.quakes.pts) { o.quakes.pts.visible = ok && Living.on.quakes; o.quakes.mat.uniforms.time.value = time; }
  if (o.aurora) {
    const vis = ok && Living.on.aurora, sw = U.sunWorld.clone().normalize();
    [o.aurora.low, o.aurora.high].forEach(m => { m.visible = vis; m.material.uniforms.sunW.value.copy(sw); m.material.uniforms.time.value = time; });
    if (vis && o.aurora.mode === 'model' && time - o.aurora.modelT > 20) { o.aurora.modelT = time; o.aurora.fill(auroraModel(Living.data.space && Living.data.space.kp != null ? Living.data.space.kp : 3, Clock.now())); }
  }
  if (o.currents) { o.currents.mesh.visible = ok && Living.on.currents; o.currents.mesh.material.uniforms.time.value = time * 0.5; }
  if (o.storms) (o.storms.list || []).forEach(st => { st.m.visible = ok && Living.on.storms; st.m.rotateZ(st.spin * dt * 0.9); });
  updateField(dt, time);
  updateWinds(dt, time);
}

/* ---------- panel ---------- */
function ago(iso) { if (!iso) return ''; const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : Math.round(m / 1440) + ' days ago'; }
function feedNote(name, liveTxt, offTxt) {
  const s = Living.status[name];
  if (!s || s.state === 'loading') return '<span class="feed">Loading live data…</span>';
  return s.state === 'live' ? `<span class="feed live">● Live · ${s.source} · ${ago(s.fetched)}</span>${liveTxt ? ' ' + liveTxt : ''}` : `<span class="feed off">Live feed unavailable</span> ${offTxt || ''}`;
}
function livingSection() {
  const s = B.sec('Living Earth', 'Real data from scientific agencies, refreshed through this site\'s own servers.');
  Living.onRefresh = [];
  const note = (fn) => { const p = document.createElement('p'); p.className = 'help'; s.appendChild(p); const f = () => { if (p.isConnected) p.innerHTML = fn(); }; Living.onRefresh.push(f); f(); return f; };
  const camNight = (lat) => { const ss = subsolar(Clock.now()); camAtWorld(Viz.earthFixedWorld(llUnit(lat, ss[1] + 180)), 2.9, 0, 1.2); };

  B.toggle(s, 'Tectonic plates', 'The 50 or so pieces Earth\'s crust is broken into', () => Living.on.plates, v => { setLiving('plates', v); fPl(); if (v) camEarth(3.2, 0.3, 0.35); });
  const fPl = note(() => Living.on.plates ? Object.values(PLATE_KIND).map(k => `<span class="key" style="--c:${k.color}"></span>${k.name}: ${k.note}`).join('<br>') + '<br>Plates move 2 to 10 cm a year, about as fast as your fingernails grow.' : '');
  B.toggle(s, 'Earthquakes', 'Every quake of magnitude 2.5 or more in the last 30 days', () => Living.on.quakes, v => { setLiving('quakes', v); fQ(); });
  const fQ = note(() => {
    if (!Living.on.quakes) return '';
    const st = quakeStats();
    const legend = `<span class="key" style="--c:#ffd27a"></span>shallow · <span class="key" style="--c:#ff7a45"></span>70–300 km deep · <span class="key" style="--c:#ff4fa3"></span>deeper. Bigger dot = stronger. Rings = last 24 hours.`;
    return feedNote('quakes', st ? `<br><b>${fmt(st.total)}</b> quakes, <b>${st.day}</b> today, <b>${st.m6}</b> of magnitude 6+. Turn on the plates: almost all of them sit on the edges.<br>${legend}` : '', 'Earthquake dots need the USGS feed, so none are shown.');
  });
  const qb = document.createElement('div'); qb.className = 'btns qlist'; s.appendChild(qb);
  const fQb = () => {
    qb.innerHTML = ''; const st = Living.on.quakes && quakeStats(); if (!st) return;
    st.top.slice(0, 4).forEach(e => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = `M${fmt(e[3], 1)} · ${e[5].replace(/^.*? of /, '')}`; b.title = e[5] + ', ' + new Date(e[4]).toUTCString(); b.addEventListener('click', () => camGround(e[1], e[0], 1.6, 0, 1.1, 1.2)); qb.appendChild(b); });
  };
  Living.onRefresh.push(() => qb.isConnected && fQb()); fQb();

  B.toggle(s, 'Aurora', 'Where the northern and southern lights are glowing right now', () => Living.on.aurora, v => { setLiving('aurora', v); fA(); if (v) camNight(70); });
  const fA = note(() => {
    if (!Living.on.aurora) return '';
    const d = Living.data.space;
    return feedNote('space', d ? `Kp index <b>${d.kp != null ? fmt(d.kp, 1) : '–'}</b> of 9${d.kp >= 5 ? ' (a geomagnetic storm!)' : ''}. Particles from the Sun hit air 100–300 km up and make it glow: green from oxygen low down, red higher up.` : '', 'Showing a typical aurora oval instead.');
  });
  B.toggle(s, 'Magnetic field and solar wind', 'Earth\'s invisible shield pushing the solar wind aside', () => Living.on.field, v => { setLiving('field', v); fF(); if (v) camAtWorld(U.sunWorld.clone().applyAxisAngle(new V3(0, 1, 0), 0.9), 46, 1.15, 1.0); });
  const fF = note(() => {
    if (!Living.on.field) return '';
    const w = windPressureScale(), d = Living.data.space && Living.data.space.wind;
    return feedNote('space', d ? `Solar wind right now: <b>${fmt(w.v)} km/s</b>, ${w.n != null ? fmt(w.n, 1) : '–'} particles per cm³.` : '', 'Using a typical solar wind of 400 km/s.') + `<br>The wind is stopped about <b>${fmt(w.R0, 1)} Earth radii</b> (${fmt(w.R0 * 6371 / 1000)} thousand km) out on the Sun side. Field shape simplified.`;
  });
  B.chips(s, 'Winds', [['', 'Off'], ['surface', 'Near the ground'], ['jet', 'Jet stream (10 km up)']], () => Living.on.winds, v => { Living.on.winds = v; if (v) buildWinds(); fW(); });
  const fW = note(() => {
    if (!Living.on.winds) return '';
    const jet = Living.on.winds === 'jet';
    return feedNote('winds', '', 'Showing the typical global pattern instead.') + '<br>' + (jet ? 'Rivers of fast air where cold polar air meets warm air. Planes flying east ride it to save time; this is why New York to London is quicker than the way back.' : 'Trade winds blow toward the equator and get bent west by Earth\'s spin. Farther out, westerlies blow the other way.') + ' Brighter = faster.';
  });
  B.toggle(s, 'Tropical storms', 'Hurricanes and storms the US National Hurricane Center is tracking', () => Living.on.storms, v => { setLiving('storms', v); fS(); });
  const fS = note(() => {
    if (!Living.on.storms) return '';
    const o = Living.objs.storms, n = o && o.list ? o.list.length : 0;
    return feedNote('storms', n ? `${n} active. They spin anticlockwise in the north and clockwise in the south.` : 'No active storms in the Atlantic or East Pacific right now. Open "Why storms spin" below to see how they form.', 'No storm positions to show.');
  });
  const sb = document.createElement('div'); sb.className = 'btns'; s.appendChild(sb);
  Living.onRefresh.push(() => { if (!sb.isConnected) return; sb.innerHTML = ''; const o = Living.objs.storms; if (!Living.on.storms || !o || !o.list) return; o.list.forEach(st => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = st.s.name; b.addEventListener('click', () => camGround(st.s.lat, st.s.lon, 1.5, 0, 1.2, 1.2)); sb.appendChild(b); }); });
  B.toggle(s, 'Ocean currents', 'Rivers inside the sea that carry heat around the planet', () => Living.on.currents, v => { setLiving('currents', v); fC(); if (v) camEarth(3.2, -0.6, 0.3); });
  const fC = note(() => Living.on.currents ? '<span class="key" style="--c:#ff7a59"></span>warm water from the tropics · <span class="key" style="--c:#5ab4ff"></span>cold water from the poles. The Gulf Stream is why London is milder than Montreal, though both are at a similar latitude. Paths simplified.' : '');
  refreshLivingPanel();

  const l = B.sec('Earth labs', 'Hands-on experiments in their own window.');
  B.buttons(l, [['Layers of the sky', openAtmosLab, 'primary'], ['Greenhouse effect', openGreenhouseLab], ['Why storms spin', openCoriolisLab]]);
  epicSection();
}
function epicSection() {
  const s = B.sec('Earth from a million miles', 'NASA\'s EPIC camera photographs the whole sunlit Earth every day from the L1 point, 1.5 million km toward the Sun.');
  const box = document.createElement('div'); box.className = 'epic'; s.appendChild(box);
  box.innerHTML = '<p class="help">Loading the latest photo…</p>';
  liveFeed('epic', '/api/epic').then(d => {
    if (!box.isConnected) return;
    if (!d || !d.images || !d.images.length) { box.innerHTML = '<p class="help">NASA\'s latest photo couldn\'t be loaded right now.</p>'; return; }
    const im = d.images[d.images.length - 1], when = new Date(im.date);
    box.innerHTML = `<figure><img alt="Whole Earth photographed by NASA's EPIC camera" loading="lazy" referrerpolicy="no-referrer"><figcaption>${fmtDate(when)} UTC · centred on ${fmt(Math.abs(im.lat || 0), 0)}°${(im.lat || 0) >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(im.lon || 0), 0)}°${(im.lon || 0) >= 0 ? 'E' : 'W'}</figcaption></figure>`;
    const img = box.querySelector('img'); img.src = im.thumb; img.addEventListener('load', () => { if (img.src !== im.url) { const big = new Image(); big.onload = () => { img.src = im.url; }; big.src = im.url; } }, { once: true });
    img.addEventListener('error', () => { box.innerHTML = '<p class="help">The photo is listed but couldn\'t be downloaded.</p>'; });
    B.buttons(s, [['Show the same moment here', () => { newWorld(App.P, null, null, when); setTS(1); App.live = false; camAtWorld(U.sunWorld.clone(), 3.0, 0, 1.2); }]]);
  });
}
