/* ================= REAL MOTION: orbit trails around the Sun, loops seen from Earth, sky from the ground ================= */
const Trails = { mode: '', list: {}, lastT: null };
const TRAIL_BODIES = [['Mercury', '#c9b9a6', 87.97], ['Venus', '#ffd9a0', 224.7], ['Earth', '#7cc4ff', 365.25], ['Mars', '#ff8a5c', 687], ['Jupiter', '#f0c9a0', 4333], ['Saturn', '#f3dfa8', 10759], ['Uranus', '#9fe3ef', 30688], ['Neptune', '#6f8fff', 60182]];
function setTrails(mode) {
  for (const k in Trails.list) { const t = Trails.list[k]; t.rib.mesh.parent && t.rib.mesh.parent.remove(t.rib.mesh); t.rib.dispose(); }
  Trails.list = {}; Trails.mode = mode;
  if (!mode) return;
  const parent = mode === 'helio' ? U.orbitsG : E.sky;
  const bodies = mode === 'helio' ? TRAIL_BODIES : [['Sun', '#ffd27a', 365.25]].concat(TRAIL_BODIES.filter(b => b[0] !== 'Earth'));
  bodies.forEach(([name, color, P]) => {
    const rib = new Ribbon(1600, color, name === 'Earth' ? 2.6 : 2, { fade: 0.02, opacity: 0.95 });
    rib.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); parent.add(rib.mesh);
    Trails.list[name] = { rib, pts: [], last: null, step: mode === 'helio' ? P / 500 : 1.5 };
  });
}
function updateTrails(date) {
  if (!Trails.mode) return;
  const t = date.getTime();
  if (Trails.lastT != null && Math.abs(t - Trails.lastT) > 400 * 86400e3 * 30) { const m = Trails.mode; setTrails(m); }
  Trails.lastT = t;
  for (const name in Trails.list) {
    const tr = Trails.list[name];
    if (tr.last != null && Math.abs(t - tr.last) < tr.step * 86400e3) continue;
    if (tr.last != null && t < tr.last) { tr.pts = []; }
    tr.last = t;
    const v = Trails.mode === 'helio' ? p2t(helioEqj(name, date)) : p2t(name === 'Sun' ? sunEqj(date) : bodyEqj(name, date));
    tr.pts.push(v); if (tr.pts.length > 1600) tr.pts.shift();
    tr.rib.set(tr.pts);
  }
}
/* the Sun turns too: once every ~25 days at its equator */
function orientSun(date) { if (U.sunMesh) orientBody(U.sunMesh, 'Sun', date); }

/* ---------- Space panel: motion section ---------- */
const MOTION_VIEWS = [
  ['planets', 'Planets circling the Sun', 'Inner planets race round; one week passes every second.', () => { camFocus('sun', 160000, 0.3, 1.25); setTS(604800); setTrails('helio'); }],
  ['outer', 'The whole solar system', 'Half a year every second: watch Jupiter and Saturn crawl while Earth zips round.', () => { camFocus('sun', 1.6e6, 0.3, 1.2); setTS(15778800); setTrails('helio'); }],
  ['earthmoon', 'Earth spins, the Moon orbits', 'Six hours every second. Earth turns once a day; the Moon goes round once a month.', () => { camFocus('earth', 150, 0.6, 0.45); setTS(21600); setTrails(''); }],
  ['loops', 'Planets seen from Earth', 'Because we are moving too, planets seem to loop backwards from time to time.', () => { camFocus('earth', 260000, 0.3, 1.35); setTS(2592000); setTrails('geo'); }],
  ['sky', 'The sky turning, from Sydney', 'Stand on the ground and watch the Sun, Moon and stars rise and set as Earth turns.', () => { setTrails(''); setTS(600); Sky.showNames = true; camSky(-33.87, 151.21, 180, 18); }]
];
function motionSection() {
  const s = B.sec('Everything moves', 'Real positions from the planets\' orbits, at whatever speed you choose. Drag to look around.');
  const out = document.createElement('p'); out.className = 'help'; s.appendChild(out);
  const cur = MOTION_VIEWS.find(v => v[0] === App.motion); out.textContent = cur ? cur[2] : '';
  B.buttons(s, MOTION_VIEWS.map(([id, t, txt, fn]) => [t, () => { App.motion = id; fn(); buildPanel(); }, App.motion === id ? 'primary' : '']));
  B.chips(s, 'Trails', [['', 'Off'], ['helio', 'Around the Sun'], ['geo', 'Seen from Earth']], () => Trails.mode, v => setTrails(v));
  const k = B.sec('Stars move too', 'Every star drifts slowly. Over thousands of years the constellations change shape.');
  B.toggle(k, 'Constellations', 'Stick figures joining the stars', () => Sky.showLines, v => { Sky.showLines = v; });
  B.toggle(k, 'Star names', 'The brightest stars', () => Sky.showNames, v => { Sky.showNames = v; });
  B.slider(k, 'Jump in time (stars only)', -200000, 200000, 1000, () => Sky.extraYears, v => { Sky.extraYears = v; }, v => v === 0 ? 'today' : (v > 0 ? '+' : '−') + fmt(Math.abs(v)) + ' years', true);
  B.buttons(k, [['Big Dipper', () => { Sky.showLines = true; camSkyDir(180, 56); buildPanel(); }], ['Southern Cross', () => { Sky.showLines = true; camSkyDir(187, -60); buildPanel(); }], ['Orion', () => { Sky.showLines = true; camSkyDir(84, 2); buildPanel(); }]]);
  const p = document.createElement('p'); p.className = 'help'; p.textContent = 'Star motions from the HYG catalogue (Hipparcos). The slider moves only the stars, in straight lines; Earth\'s slow wobble (precession) is not included.'; k.appendChild(p);
  const g = B.sec('Bigger still', 'The Sun carries all the planets around the Milky Way, and the whole galaxy moves too.');
  B.buttons(g, [['The Milky Way turning', () => enterGalaxy(), 'primary'], ['The Sun\'s corkscrew path', () => enterHelix()]]);
}
