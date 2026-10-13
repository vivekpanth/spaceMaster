/* ================= LIVE SATELLITES (CelesTrak via /api/tle, positions computed here) ================= */
const SAT_GROUPS = {
  stations: { label: 'Space stations', color: '#ffcf6b', size: 7 },
  gps: { label: 'GPS', color: '#7cf29a', size: 5 },
  geo: { label: 'Geostationary', color: '#7cc4ff', size: 4 },
  weather: { label: 'Weather', color: '#5ad1ff', size: 5 },
  starlink: { label: 'Starlink', color: '#e8ecf5', size: 2.2 }
};
const J2 = 1.08262668e-3;
const Sats = { groups: {}, on: { stations: true, gps: false, geo: false, weather: false, starlink: false }, status: '', iss: null, lastUpd: 0, issTrack: null };
const SAT_VS = `attribute vec3 color; attribute float size; varying vec3 vC; uniform float pr;
${LOGV}
void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * pr; gl_Position = projectionMatrix * mv; ${LOGVM} }`;
const SAT_FS = `varying vec3 vC;
${LOGF}
void main(){ ${LOGFM} vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.1, r); gl_FragColor = vec4(vC * (0.6 + 0.8 * a), a); }`;

/* fast two-body + J2 propagation from TLE mean elements (good for drawing thousands at once) */
function satElements(rec) {
  const n = rec.no / 60, a = Math.cbrt(MU_E / (n * n)), e = rec.ecco, i = rec.inclo;
  const p = a * (1 - e * e), k = 1.5 * n * J2 * Math.pow(R / p, 2);
  const epoch = (rec.jdsatepoch + (rec.jdsatepochF || 0) - 2440587.5) * 86400e3;
  return { n, a, e, i, raan0: rec.nodeo, argp0: rec.argpo, M0: rec.mo, epoch, dRaan: -k * Math.cos(i), dArgp: 0.5 * k * (5 * Math.cos(i) ** 2 - 1) };
}
function satPos(el, tms, out) {
  const dt = (tms - el.epoch) / 1000;
  let M = el.M0 + el.n * dt, E = M;
  for (let k = 0; k < 6; k++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const xv = el.a * (Math.cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const W = el.raan0 + el.dRaan * dt, w = el.argp0 + el.dArgp * dt, i = el.i;
  const cW = Math.cos(W), sW = Math.sin(W), cw = Math.cos(w), sw = Math.sin(w), ci = Math.cos(i), si = Math.sin(i);
  const x = (cW * cw - sW * sw * ci) * xv + (-cW * sw - sW * cw * ci) * yv;
  const y = (sW * cw + cW * sw * ci) * xv + (-sW * sw + cW * cw * ci) * yv;
  const z = (sw * si) * xv + (cw * si) * yv;
  out[0] = x; out[1] = y; out[2] = z; return out;
}
function makeSatPoints(list, color, size) {
  const n = list.length, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const col = new THREE.Color(color), c = new Float32Array(n * 3), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; s[i] = size; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.setAttribute('size', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({ uniforms: { pr: { value: Math.min(2, window.devicePixelRatio || 1) } }, vertexShader: SAT_VS, fragmentShader: SAT_FS, transparent: true, depthWrite: false });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false;
  return pts;
}
/* illustrative fallback when live data is unavailable */
function fakeTLEGroup(name) {
  const els = [];
  const mk = (alt, inc, raan, M0, ecc = 0.0005) => { const a = R + alt * 1e3, n = Math.sqrt(MU_E / a ** 3); return { name: 'Example', el: { n, a, e: ecc, i: inc * DEG, raan0: raan * DEG, argp0: 0, M0: M0 * DEG, epoch: Date.UTC(2026, 0, 1), dRaan: 0, dArgp: 0 } }; };
  if (name === 'stations') els.push(Object.assign(mk(420, 51.6, 120, 0), { name: 'ISS (example orbit)' }));
  if (name === 'gps') for (let p = 0; p < 6; p++) for (let k = 0; k < 4; k++) els.push(mk(20200, 55, p * 60, k * 90 + p * 15));
  if (name === 'geo') for (let k = 0; k < 40; k++) els.push(mk(35786, 0.05, 0, k * 9));
  if (name === 'weather') for (let k = 0; k < 12; k++) els.push(mk(830, 98.7, k * 30, k * 47));
  if (name === 'starlink') for (let p = 0; p < 72; p++) for (let k = 0; k < 22; k++) els.push(mk(550, 53, p * 5, k * 16.4 + p * 3));
  return els;
}
async function loadSatGroup(name) {
  if (Sats.groups[name]) return Sats.groups[name];
  const G = { name, list: [], live: false, pts: null, fetched: null };
  Sats.groups[name] = G;
  try {
    const r = await fetch('/api/tle?group=' + name);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    if (!j.sats || !j.sats.length) throw new Error('empty');
    for (const [nm, l1, l2] of j.sats) {
      try { const rec = satellite.twoline2satrec(l1, l2); if (rec.error) continue; G.list.push({ name: nm, rec, el: satElements(rec) }); } catch (e) { }
    }
    G.live = true; G.fetched = j.fetched;
  } catch (e) {
    G.list = fakeTLEGroup(name); G.live = false; G.err = e.message;
  }
  const conf = SAT_GROUPS[name];
  G.pts = makeSatPoints(G.list, conf.color, conf.size);
  E.sky.add(G.pts);
  G.pts.visible = !!Sats.on[name];
  if (name === 'stations') {
    Sats.iss = G.list.find(s => /ISS \(ZARYA\)|^ISS/.test(s.name)) || G.list[0];
    if (Sats.iss) {
      Sats.issMarker = sprite(GLOW_SOFT, '#ffcf6b', 1, 1); E.sky.add(Sats.issMarker);
      Sats.issLbl = Labels.add('', 'craft', () => Sats.on.stations && Sats.issMarker.visible ? Sats.issMarker.getWorldPosition(new V3()) : null, { occlude: true });
      Sats.issLbl.el.style.setProperty('--c', '#ffcf6b');
      Sats.issTrack = new Ribbon(361, '#ffcf6b', 1.6, { fade: 0.15, opacity: 0.7 }); Sats.issTrack.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); E.ground.add(Sats.issTrack.mesh);
    }
  }
  Sats.status = satStatus();
  return G;
}
function satStatus() {
  const g = Object.values(Sats.groups);
  if (!g.length) return '';
  const live = g.filter(x => x.live), fake = g.filter(x => !x.live);
  return (live.length ? 'Live orbit data from CelesTrak (' + live.map(x => SAT_GROUPS[x.name].label + ' ' + x.list.length).join(', ') + ')' : '') + (fake.length ? (live.length ? '. ' : '') + 'Live data unavailable for ' + fake.map(x => SAT_GROUPS[x.name].label).join(', ') + ', showing example orbits.' : '');
}
function satEci(s, tms) {
  if (s.rec) {
    try { const p = satellite.propagate(s.rec, new Date(tms)); if (p.position) return [p.position.x * 1e3, p.position.y * 1e3, p.position.z * 1e3]; } catch (e) { }
  }
  return satPos(s.el, tms, [0, 0, 0]);
}
function updateSats(date) {
  const tms = date.getTime(), now = performance.now();
  const tmp = [0, 0, 0];
  for (const name in Sats.groups) {
    const G = Sats.groups[name]; if (!G.pts) continue;
    G.pts.visible = !!Sats.on[name];
    if (!G.pts.visible) continue;
    if (G.list.length > 1500 && now - (G.lastUpd || 0) < 120 && App.ts < 600) continue;
    G.lastUpd = now;
    const arr = G.pts.geometry.attributes.position.array;
    for (let i = 0; i < G.list.length; i++) {
      satPos(G.list[i].el, tms, tmp);
      arr[i * 3] = tmp[0] / R; arr[i * 3 + 1] = tmp[2] / R; arr[i * 3 + 2] = -tmp[1] / R;
    }
    G.pts.geometry.attributes.position.needsUpdate = true;
  }
  const iss = Sats.iss;
  if (iss && Sats.issMarker) {
    const vis = !!Sats.on.stations;
    Sats.issMarker.visible = vis; Sats.issTrack.mesh.visible = vis;
    if (vis) {
      const p = satEci(iss, tms), p2 = satEci(iss, tms + 1000);
      Sats.issMarker.position.copy(p2t(p));
      Sats.issMarker.scale.setScalar(markerSize(Sats.issMarker.getWorldPosition(new V3()), 16));
      const ll = unitLL(rotZ(p, -gmst(date)));
      const v = len(sub(p2, p));
      Sats.issPos = p; Sats.issLL = ll;
      Sats.issLbl.set(`<b>${/ISS/.test(iss.name) ? 'Space Station' : iss.name}</b><span>${fmt(Math.abs(ll[0]), 1)}°${ll[0] >= 0 ? 'N' : 'S'} ${fmt(Math.abs(ll[1]), 1)}°${ll[1] >= 0 ? 'E' : 'W'} · ${fmt((len(p) - R) / 1e3)} km up · ${fmt(v * 3.6)} km/h</span>`);
      if (!Sats.lastTrack || Math.abs(tms - Sats.lastTrack) > 60e3) {
        Sats.lastTrack = tms;
        const pts = [];
        for (let k = -60; k <= 300; k++) { const tt = tms + k * 30e3; const q = satEci(iss, tt); const e = norm(rotZ(q, -gmst(new Date(tt)))); pts.push(p2t(mul(e, R * 1.003))); }
        Sats.issTrack.set(pts);
      }
    }
  }
}
function satsSection() {
  const s = B.sec('Satellites', 'Real satellites from today\'s orbit data. Dots are drawn bigger than life so you can see them.');
  for (const k in SAT_GROUPS) B.toggle(s, SAT_GROUPS[k].label, k === 'starlink' ? 'Thousands of internet satellites at 550 km' : k === 'stations' ? 'The International Space Station and others, with the ISS ground track' : k === 'gps' ? 'About 30 satellites at 20,200 km' : k === 'geo' ? 'TV and weather satellites that hover over one spot' : 'Weather satellites in polar orbits', () => Sats.on[k], v => { Sats.on[k] = v; if (v) loadSatGroup(k).then(() => { st.textContent = Sats.status; }); });
  const st = document.createElement('p'); st.className = 'help'; st.textContent = Sats.status || 'Loading live data when you switch a group on.'; s.appendChild(st);
  B.buttons(s, [['Find the Space Station', () => { Sats.on.stations = true; loadSatGroup('stations').then(() => { buildPanel(); App.live = App.live; if (!Sats.iss) return; Viz.follow = null; Cam.go({ frame: () => { const p = Sats.issMarker.getWorldPosition(new V3()); return { pos: p, fwd: p.clone().cross(new V3(0, 1, 0)).normalize(), up: p.clone().normalize() }; }, dist: 0.35, az: 0.3, el: 0.6, worldUp: false }, 1.2); }); }, 'primary']]);
}
