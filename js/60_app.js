/* ================= APP: world helpers, controls, chapters ================= */
const $ = id => document.getElementById(id);
const DEFAULT_P = { g: 1, a: 1, e: 1, spin: 1, wind: 0 };
const App = {
  scene: 'earth', P: Object.assign({}, DEFAULT_P), sim: null, ts: 600, playing: true,
  chapter: null, ballN: 0, plane: { V: 900, alt: 10, angle: 0 }, onUserCamera: null
};

/* ---------- world helpers ---------- */
function newWorld(P, focusLon = 151, sunOffDeg = -25, date) {
  App.P = Object.assign({}, DEFAULT_P, P || {});
  Clock.date0 = date ? new Date(date) : (focusLon == null ? new Date() : dateForLocalSun(focusLon, sunOffDeg, App.storyBase || new Date()));
  const th0 = gmst(Clock.date0);
  App.sim = makeSim(Object.assign({}, App.P, { theta0: th0 }));
  App.sim.P = App.P;
  (U.pulses || []).forEach(P => { E.sky.remove(P.head, P.rb.mesh); P.rb.dispose(); Labels.remove(P.lbl); }); U.pulses = [];
  Viz.reset(App.sim); Viz.clearParticles(); HUD.clear(); App.ballN = 0;
  E.rings.visible = false; E.axis.visible = false;
  syncView();
  updateUniverse(Clock.dateAt(0), th0, Viz.view);
  return App.sim;
}
function setSpin(x) {
  const s = App.sim, th = thetaAt(s, s.t);
  App.P.spin = x; s.om = W0 * x; s.theta0 = th - s.om * s.t;
}
function applyP() {
  for (const c of App.sim.crafts) {
    if (c.kind !== 'plane') continue;
    c.engine = !!App.P.e;
    if (c.cruise && !(App.P.g && App.P.a && App.P.e) && !c.done) c.cruise = false;
  }
}
function setView(v) { Viz.view = v; syncView(); }
function syncView() {
  document.querySelectorAll('#viewSeg button').forEach(b => b.setAttribute('aria-pressed', b.dataset.view === Viz.view ? 'true' : 'false'));
  for (const it of Viz.items.values()) it.orbKey = null;
  if (Viz.view === 'ground') document.body.classList.add('ground'); else document.body.classList.remove('ground');
}
function setTS(x) {
  App.ts = x; App.live = false; const s = $('tsSel'); if (!s) return;
  if (![...s.options].some(o => +o.value === x)) {
    const o = document.createElement('option'); o.value = x;
    o.textContent = x < 60 ? x + '×' : x < 3600 ? fmt(x / 60, x % 60 ? 1 : 0) + ' min / s' : fmt(x / 3600, x % 3600 ? 1 : 0) + ' h / s';
    const after = [...s.options].find(op => +op.value > x); s.insertBefore(o, after || null);
  }
  s.value = String(x);
}
function cityRoute(a, b) { const A = CITIES[a], B = CITIES[b]; return greatCircle(llUnit(A.lat, A.lon), llUnit(B.lat, B.lon)); }
function flyRoute(from, to, o = {}) {
  const route = cityRoute(from, to);
  const c = launchPlane(App.sim, { id: o.id || from + '-' + to, route, V: (o.V ?? App.plane.V) / 3.6, alt: (o.alt ?? App.plane.alt) * 1000, angle: o.angle ?? App.plane.angle, color: o.color || PAL.A, title: CITIES[from].name + ' → ' + CITIES[to].name, fromName: from, toName: to });
  Viz.addRoute(route, o.color || PAL.A, 0.5); Viz.addCity(from); Viz.addCity(to);
  return c;
}
function race(lat, lon, distKm, o = {}) {
  const out = [];
  for (const [dir, id, col, nm] of [[1, 'E', PAL.E, 'Eastbound'], [-1, 'W', PAL.W, 'Westbound']]) {
    if (o.only && o.only !== id) continue;
    const route = parallelRoute(lat, lon, dir, distKm * 1000);
    const c = launchPlane(App.sim, { id, route, V: (o.V ?? App.plane.V) / 3.6, alt: (o.alt ?? App.plane.alt) * 1000, angle: o.angle ?? App.plane.angle, color: col, title: nm, fromName: 'Start', toName: (dir > 0 ? 'East' : 'West') + ' flag' });
    Viz.addRoute(route, col, 0.45);
    Viz.addFlag(route.b, col, (dir > 0 ? 'East' : 'West') + ' flag · ' + fmt(distKm) + ' km');
    out.push(c);
  }
  return out;
}
const CANNON = { lat: 0, lon: 30, alt: 150 };
function fire(kms, o = {}) {
  const col = PAL.ball[App.ballN++ % PAL.ball.length];
  return launchBall(App.sim, { id: 'ball' + App.ballN, lat: CANNON.lat, lon: CANNON.lon, alt: CANNON.alt * 1000, speed: kms * 1000, az: o.az ?? 90, el: 0, color: col, title: 'Ball fired at ' + fmt(kms, 1) + ' km/s' });
}
function launchSat(site, orbit, color = '#ffcf6b') {
  const S = SITES[site], T = ORBITS[orbit];
  Viz.addCity(site, '#ffcf6b');
  return launchRocket(App.sim, { id: T.short, site: S, target: T, color, title: 'Rocket → ' + T.short + ' orbit' });
}

/* ---------- camera presets ---------- */
function camEarth(dist = 3.3, az = 0.5, el = 0.25, rate = 1.4) {
  Viz.follow = null;
  Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist, az, el, worldUp: true }, rate);
}
function camGround(lat, lon, dist = 1.2, az = 0, el = 0.9, rate = 1.4) {
  Viz.follow = null;
  const u = llUnit(lat, lon), n = llUnit(lat + 1, lon);
  Cam.go({ frame: () => { const p = Viz.earthFixedWorld(u); return { pos: p, fwd: Viz.earthFixedWorld(n).sub(p), up: p.clone().normalize() }; }, dist, az, el, worldUp: false }, rate);
}
function camAtWorld(p, dist = 3.4, elAdd = 0.15, rate = 1.2) {
  Viz.follow = null;
  const az = Math.atan2(p.x, p.z), el = Math.asin(clamp(p.y / (p.length() || 1), -1, 1)) + elAdd;
  Cam.go({ frame: () => ({ pos: new V3(), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist, az, el, worldUp: true }, rate);
}
function camFollow(c, dist = 0.02, az = 0.5, el = 0.25, rate = 2) {
  Viz.follow = c;
  Cam.go({ frame: Viz.frameOf(c), dist, az, el, worldUp: false }, rate);
}
function camScene(dist, az, el, rate = 1.2, y = 0) {
  Cam.go({ frame: () => ({ pos: new V3(0, y, 0), fwd: new V3(0, 0, -1), up: new V3(0, 1, 0) }), dist, az, el, worldUp: true }, rate);
}
function setScene(name) {
  App.scene = name;
  document.body.dataset.scene = name;
  Viz.follow = null;
}

/* ---------- control builders ---------- */
const B = {
  body: null,
  sec(title, help) { const s = document.createElement('section'); s.className = 'ctl-sec'; s.innerHTML = '<h4>' + title + '</h4>' + (help ? '<p class="help">' + help + '</p>' : ''); this.body.appendChild(s); return s; },
  toggle(sec, label, small, get, set) {
    const row = document.createElement('div'); row.className = 'tg';
    const id = 'tg-' + label.replace(/\W+/g, '');
    row.innerHTML = `<div><b>${label}</b><small>${small}</small></div><button type="button" role="switch" id="${id}" aria-label="${label}"><i></i></button>`;
    const btn = row.querySelector('button');
    const sync = () => btn.setAttribute('aria-checked', get() ? 'true' : 'false');
    btn.addEventListener('click', () => { set(!get()); sync(); });
    sync(); sec.appendChild(row); return { sync };
  },
  slider(sec, label, min, max, step, get, set, f, live = false) {
    const row = document.createElement('label'); row.className = 'sl';
    const id = 'sl-' + label.replace(/\W+/g, '') + Math.round(Math.random() * 1e6);
    row.innerHTML = `<span class="sl-top"><span>${label}</span><output></output></span><input type="range" id="${id}" min="${min}" max="${max}" step="${step}">`;
    const inp = row.querySelector('input'), out = row.querySelector('output');
    inp.value = get(); out.textContent = f(get());
    inp.addEventListener('input', () => { out.textContent = f(+inp.value); if (live) set(+inp.value); });
    inp.addEventListener('change', () => set(+inp.value));
    sec.appendChild(row); return { inp, out, refresh() { inp.value = get(); out.textContent = f(get()); } };
  },
  select(sec, label, opts, get, set) {
    const row = document.createElement('label'); row.className = 'sel';
    row.innerHTML = `<span>${label}</span><select id="se-${label.replace(/\W+/g, '')}${Math.round(Math.random() * 1e6)}">${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
    const s = row.querySelector('select'); s.value = get(); s.addEventListener('change', () => set(s.value));
    sec.appendChild(row); return s;
  },
  buttons(sec, list) {
    const row = document.createElement('div'); row.className = 'btns';
    list.forEach(([t, fn, cls]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || ''); b.textContent = t; b.addEventListener('click', fn); row.appendChild(b); });
    sec.appendChild(row); return row;
  },
  chips(sec, label, list, get, set) {
    const row = document.createElement('div'); row.className = 'chips-row'; row.innerHTML = label ? '<span>' + label + '</span>' : '';
    const box = document.createElement('div'); box.className = 'chips'; row.appendChild(box);
    const sync = () => box.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v) === String(get()) ? 'true' : 'false'));
    list.forEach(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = v; b.textContent = t; b.addEventListener('click', () => { set(v); sync(); }); box.appendChild(b); });
    sync(); sec.appendChild(row); return { sync };
  }
};
const cityOpts = Object.entries(CITIES).map(([k, c]) => [k, c.name]);
function physicsSection(onChange) {
  const s = B.sec('Physics', 'Switch the laws of nature on and off.');
  B.toggle(s, 'Gravity', 'Pulls everything toward Earth\'s centre', () => App.P.g, v => { App.P.g = v ? 1 : 0; applyP(); onChange && onChange(); });
  B.toggle(s, 'Air', 'Lift for wings, drag that slows you, and wind', () => App.P.a, v => { App.P.a = v ? 1 : 0; applyP(); onChange && onChange(); });
  B.toggle(s, 'Engine', 'Jet engines need air. With no air it acts like a small rocket', () => App.P.e, v => { App.P.e = v ? 1 : 0; applyP(); onChange && onChange(); });
}
function worldSection(onChange, opts = {}) {
  const s = B.sec('World');
  B.slider(s, 'Earth spin', 0, 20, 1, () => App.P.spin, v => { setSpin(v); onChange && onChange('spin'); }, v => v === 1 ? 'real (×1)' : v === 0 ? 'stopped' : '×' + v);
  if (!opts.noWind) B.slider(s, 'Jet stream (blows east)', 0, 400, 10, () => App.P.wind, v => { App.P.wind = v; onChange && onChange('wind'); }, v => v ? fmt(v) + ' km/h' : 'calm');
}
function planeSection(onChange) {
  const s = B.sec('Plane');
  B.slider(s, 'Airspeed', 200, 30000, 50, () => App.plane.V, v => { App.plane.V = v; onChange && onChange(); }, v => fmt(v) + ' km/h');
  B.slider(s, 'Start height', 0, 400, 1, () => App.plane.alt, v => { App.plane.alt = v; onChange && onChange(); }, v => fmt(v) + ' km');
  B.slider(s, 'Climb angle (engine off)', 0, 80, 1, () => App.plane.angle, v => { App.plane.angle = v; onChange && onChange(); }, v => v + '°');
}

/* ---------- insets (diagrams that explain) ---------- */
const Inset = {
  show(html) { const el = $('inset'); el.innerHTML = html; el.hidden = false; },
  hide() { $('inset').hidden = true; $('inset').innerHTML = ''; },
  fallCurve() {
    this.show(`<h3>Why an orbit never lands</h3>
<svg viewBox="0 0 340 210" class="fc" role="img" aria-label="In one second the ball moves 7.9 km sideways and falls 4.9 m. The ground curves down 4.9 m over the same 7.9 km.">
  <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor"/></marker></defs>
  <path d="M10 70 Q170 40 330 70" class="fc-ground"/>
  <path d="M10 70 L330 70" class="fc-ground-flat"/>
  <path d="M30 40 L310 40" class="fc-straight"/>
  <path d="M30 40 Q170 18 310 58" class="fc-path"/>
  <circle cx="30" cy="40" r="7" class="fc-ball"><animateMotion dur="3.2s" repeatCount="indefinite" path="M0 0 Q140 -22 280 18"/></circle>
  <line x1="310" y1="42" x2="310" y2="56" class="fc-arrow" marker-end="url(#ah)"/>
  <text x="300" y="34" class="fc-t r">without gravity</text>
  <text x="170" y="100" class="fc-t c">7.9 km sideways in 1 second</text>
  <text x="318" y="54" class="fc-t">falls 4.9 m</text>
  <line x1="300" y1="70" x2="300" y2="64" class="fc-arrow2"/>
  <text x="170" y="122" class="fc-t c dim">…and over 7.9 km the round Earth curves down 4.9 m too</text>
  <text x="170" y="150" class="fc-t c big">falls 4.9 m · ground drops 4.9 m</text>
  <text x="170" y="172" class="fc-t c">so the height never changes: it keeps falling and keeps missing</text>
  <text x="170" y="198" class="fc-t c dim">(drawing exaggerated)</text>
</svg>`);
  },
  clocks() {
    this.show(`<h3>Einstein's clocks</h3><p class="ins-p">Time runs slower deeper in gravity and when moving fast. Satellites carry atomic clocks that show it.</p>
<div class="clocks">
  <figure><svg viewBox="0 0 100 100" class="clk"><circle cx="50" cy="50" r="44"/><line class="hand" id="hG" x1="50" y1="50" x2="50" y2="14"/></svg><figcaption><b>Ground</b><span>reference</span></figcaption></figure>
  <figure><svg viewBox="0 0 100 100" class="clk gps"><circle cx="50" cy="50" r="44"/><line class="hand" id="hP" x1="50" y1="50" x2="50" y2="14"/></svg><figcaption><b>GPS satellite</b><span>+38.5 µs a day</span></figcaption></figure>
  <figure><svg viewBox="0 0 100 100" class="clk iss"><circle cx="50" cy="50" r="44"/><line class="hand" id="hI" x1="50" y1="50" x2="50" y2="14"/></svg><figcaption><b>Space Station</b><span>−24.5 µs a day</span></figcaption></figure>
</div>
<div class="bars">
  <div class="bar"><span>GPS: weaker gravity up high</span><i style="--w:45.7;--c:#7cf29a"></i><b>+45.7 µs</b></div>
  <div class="bar"><span>GPS: moving at 3.9 km/s</span><i style="--w:7.2;--c:#ff8a4c"></i><b>−7.2 µs</b></div>
  <div class="bar"><span>Space Station: moving at 7.7 km/s</span><i style="--w:28.2;--c:#ff8a4c"></i><b>−28.2 µs</b></div>
</div>
<p class="ins-p big" id="clkDays"></p>`);
  }
};

/* ---------- chapters ---------- */
const CHAPTERS = [
  {
    id: 'earth', title: 'Our spinning Earth', sub: 'How fast are you moving right now?', scene: 'earth',
    setup() { newWorld({}, 151, -10); setTS(1800); camEarth(3.4, 0.2, 0.3); },
    steps: [
      { text: 'This is Earth, built from real NASA satellite images. Sunlight comes from one side, and city lights glow on the night side.', dur: 8 },
      { text: 'Earth spins once every 23 hours 56 minutes, from west to east. Watch the line between day and night sweep across the planet.', dur: 9, run() { E.axis.visible = true; camEarth(3.2, 1.2, 0.35); } },
      { text: 'The ground at the equator moves at 1,670 km/h. In Sydney it moves at 1,390 km/h, in London 1,040 km/h, and at the poles it barely moves at all.', dur: 10, run() { E.rings.visible = true; ringLabels(true); camEarth(3.0, 0.9, 0.15); } },
      { text: 'Right now Sydney is carried east at 1,390 km/h. So are you, the air, the oceans, and every plane waiting at the airport.', dur: 9, run() { ringLabels(false); E.rings.visible = false; Viz.addCity('SYD'); setTS(300); camGround(-33.87, 151.21, 0.9, 0.3, 0.6); } },
      { text: 'Why don\'t we feel it? Because everything moves together, like passengers on a smooth train. You only feel speed changing, never speed itself.', dur: 9 },
      { text: 'Earth also races around the Sun at 107,000 km/h. Chapter 8 shows that journey. Next: what happens to a plane on this spinning ball?', dur: 8, run() { camEarth(3.6, 0.5, 0.25); setTS(1800); } }
    ],
    panel() {
      const s = B.sec('Earth');
      B.slider(s, 'Spin speed', 0, 50, 1, () => App.P.spin, v => setSpin(v), v => v === 1 ? 'real (×1)' : '×' + v);
      B.toggle(s, 'Speed rings', 'How fast the ground moves at each latitude', () => E.rings.visible, v => { E.rings.visible = v; ringLabels(v); });
      B.toggle(s, 'Spin axis', 'Tilted 23.4°', () => E.axis.visible, v => { E.axis.visible = v; });
      B.buttons(s, [['Look at the whole Earth', () => camEarth()], ['Zoom to Sydney', () => camGround(-33.87, 151.21, 0.9, 0.3, 0.6)]]);
    }
  },
  {
    id: 'flight', title: 'Flying on a spinning planet', sub: 'Sydney to Los Angeles, the real route', scene: 'earth',
    setup() { newWorld({ wind: 160 }, 175, -40); setTS(120); const c = flyRoute('SYD', 'LAX', { V: 900, alt: 10, color: PAL.B }); App.main = c; camFollow(c, 0.025, 2.6, 0.18, 1.6); },
    steps: [
      { text: 'A real flight: Sydney to Los Angeles, 12,054 km. The plane flies through the air at 900 km/h, 10 km up.', dur: 9 },
      { text: 'Look at the dial. The needle is the ground speed: how fast the plane passes over the ground. The blue outer ring is its speed through space, which includes Earth\'s spin.', dur: 11, run() { camFollow(App.main, 0.02, -2.2, 0.1, 1.6); } },
      { text: 'Before take-off the plane was already moving east at 1,390 km/h with Sydney. The air moves with Earth too, so the plane keeps that speed without trying.', dur: 10, run() { setTS(600); camFollow(App.main, 0.6, 0.0, 0.9, 1.0); } },
      { text: 'Space view: seen from space the path swoops in a long curve, because the whole Earth turns while the plane flies.', dur: 10, run() { setTS(2400); setView('space'); camAtWorld(Viz.craftWorld(App.main), 3.5, 0.2, 1.0); } },
      { text: 'Ground view: now Earth stands still, the way the pilot sees it. The route is the shortest path over the globe, a great circle.', dur: 10, run() { setView('ground'); camGround(1, -170, 2.6, 0, 1.35, 1.0); } },
      { text: 'High above, the jet stream, a river of air blowing east at up to 400 km/h, gives flights like this a push. That\'s why flying east across the Pacific is usually quicker than flying back.', until: () => App.main.done, dur: 10, max: 40 },
      { text: 'Landed in Los Angeles. Now it\'s your turn: pick any two cities, switch gravity or air off, and see what changes.', dur: 8, run() { camGround(1, -170, 2.6, 0, 1.35, 1.0); } }
    ],
    panel() {
      const st = { from: 'SYD', to: 'LAX' };
      const go = () => { newWorld({ g: App.P.g, a: App.P.a, e: App.P.e, wind: App.P.wind, spin: App.P.spin }, CITIES[st.from].lon + 20, -30); App.main = flyRoute(st.from, st.to, { color: PAL.B }); camFollow(App.main, 0.6, 0, 0.9, 1.2); };
      const s = B.sec('Route', 'Any two cities. The plane flies the shortest path over the globe.');
      B.select(s, 'From', cityOpts, () => st.from, v => { st.from = v; });
      B.select(s, 'To', cityOpts, () => st.to, v => { st.to = v; });
      B.buttons(s, [['Take off', go, 'primary'], ['Swap', () => { [st.from, st.to] = [st.to, st.from]; buildPanel(); }]]);
      physicsSection(); planeSection(); worldSection(k => { if (k === 'wind') {} });
      cameraSection();
    }
  },
  {
    id: 'race', title: 'East versus West', sub: 'Does Earth\'s spin help the eastbound plane?', scene: 'earth',
    setup() { newWorld({ wind: 0 }, 151, -20); setTS(300); race(-33.87, 151.21, 3000, { V: 900, alt: 10 }); camGround(-33.87, 151.21, 2.0, 0, 1.05); },
    steps: [
      { text: 'Two planes leave Sydney at the same moment. One flies east, one flies west. Same airspeed, 900 km/h, and 3,000 km each.', dur: 9, run() { setView('space'); } },
      { text: 'Space view: the eastbound plane races through space at 2,290 km/h, the westbound plane at only 490 km/h. That\'s Earth\'s 1,390 km/h plus or minus 900 km/h. Compare their blue outer rings.', dur: 12 },
      { text: 'But both flags are moving east too, carried by the spinning Earth. Ground view shows what the pilots see: both planes cover the ground at exactly 900 km/h.', dur: 11, run() { setView('ground'); } },
      { text: 'Result: a tie. In still air, east and west take exactly the same time. The air spins with Earth, so it carries both planes equally.', until: () => App.sim.crafts.every(c => c.done), dur: 8, max: 30 },
      { text: 'Now a 200 km/h jet stream blows east, like the real one at this latitude. The eastbound plane gets a tailwind, the westbound plane a headwind.', run() { newWorld({ wind: 200 }, 151, -20); race(-33.87, 151.21, 3000, { V: 900, alt: 10 }); setView('ground'); }, until: () => App.sim.crafts.every(c => c.done), dur: 10, max: 40 },
      { text: 'Wind decides the winner, not the spin. One tiny difference remains: the weight gauges. Eastbound is 0.41% lighter, westbound 0.21% heavier. Going faster around Earth\'s centre makes you lighter. That\'s the Eötvös effect.', dur: 13, run() { newWorld({ wind: 0 }, 151, -20); race(-33.87, 151.21, 3000, { V: 900, alt: 10 }); setView('space'); camFollow(App.sim.crafts[0], 0.02, 2.4, 0.15, 1.5); } },
      { text: 'Pilots also feel a sideways nudge called the Coriolis effect: to the left in the Southern Hemisphere, to the right in the Northern. The autopilot corrects it so gently that nobody notices.', dur: 11, run() { camFollow(App.sim.crafts[1], 0.02, -2.4, 0.15, 1.5); } }
    ],
    panel() {
      const st = App.raceSt = App.raceSt || { lat: -33.87, dist: 3000 };
      const go = () => { newWorld({ g: App.P.g, a: App.P.a, e: App.P.e, wind: App.P.wind, spin: App.P.spin }, 151, -20); race(st.lat, 151.21, st.dist); camGround(st.lat, 151.21, 2.0, 0, 1.05); };
      const s = B.sec('Race', 'Two planes leave together, one east and one west.');
      B.slider(s, 'Latitude', -80, 80, 1, () => Math.round(st.lat), v => { st.lat = v; }, v => v === 0 ? 'equator' : Math.abs(v) + '° ' + (v > 0 ? 'north' : 'south'));
      B.slider(s, 'Distance', 500, 15000, 100, () => st.dist, v => { st.dist = v; }, v => fmt(v) + ' km');
      B.buttons(s, [['Start the race', go, 'primary']]);
      physicsSection(); planeSection(); worldSection(); cameraSection();
    }
  },
  {
    id: 'whatif', title: 'What if there were no gravity or air?', sub: 'Your first question, answered by simulation', scene: 'earth',
    setup() { newWorld({ g: 0, a: 0, e: 0 }, 0, 0); setTS(60); App.plane = { V: 900, alt: 10, angle: 0 }; race(0, 0, 3000, { V: 900, alt: 10 }); camGround(0, 0, 0.7, 0, 0.35); },
    steps: [
      { text: 'No gravity, no air, engine off. Two planes leave the equator, one east and one west. Nothing pushes or pulls them, so each flies in a perfectly straight line.', dur: 10 },
      { text: 'The ground curves away beneath them, so they rise higher and higher. They never reach anywhere. They just drift off into space.', dur: 10, run() { setTS(300); camEarth(2.8, 0.2, 0.25, 1.0); } },
      { text: 'Ground view: from the ground the straight paths look bent. The planes didn\'t turn. The Earth turned underneath them. Same motion, different point of view: that\'s a frame of reference.', dur: 12, run() { setView('ground'); } },
      { text: 'Gravity back on, still no air, engine off. Launched at 8,000 km/h at 45°, each plane flies like a thrown ball and falls back. East lands 534 km away, west 518 km. Earth\'s spin gave the east one a little extra speed.', run() { newWorld({ g: 1, a: 0, e: 0 }, 0, 0); setView('ground'); setTS(30); race(0, 0, 3000, { V: 8000, alt: 0, angle: 45 }); camGround(0, 0, 0.5, 0.2, 0.25); }, until: () => App.sim.crafts.every(c => c.done), dur: 12, max: 30 },
      { text: 'Gravity and air, engine off. The wings give lift so the plane glides, but drag steals its speed. It lands about 60 km away, a few minutes later.', run() { newWorld({ g: 1, a: 1, e: 0 }, 0, 0); setView('ground'); setTS(20); race(0, 0, 3000, { V: 900, alt: 10, angle: 0 }); camFollow(App.sim.crafts[0], 0.02, 2.5, 0.2, 1.6); }, until: () => App.sim.crafts.every(c => c.done), dur: 12, max: 30 },
      { text: 'Everything on. The engine beats drag, the wings beat gravity, and the plane flies level all the way. That\'s normal flight.', run() { newWorld({}, 0, 0); setView('ground'); setTS(300); race(0, 0, 3000, { V: 900, alt: 10 }); camGround(0, 0, 1.2, 0, 0.9); }, dur: 10 }
    ],
    panel() {
      const st = { dir: 'both' };
      const go = () => { newWorld({ g: App.P.g, a: App.P.a, e: App.P.e, wind: App.P.wind, spin: App.P.spin }, 0, 0); race(0, 0, 3000, { only: st.dir === 'both' ? null : st.dir }); camGround(0, 0, 1.0, 0, 0.6); };
      const s = B.sec('Launch', 'Pick the physics, then launch from the equator.');
      B.chips(s, 'Direction', [['both', 'Both'], ['E', 'East'], ['W', 'West']], () => st.dir, v => { st.dir = v; });
      B.buttons(s, [['Launch', go, 'primary']]);
      physicsSection(); planeSection(); worldSection(); cameraSection();
    }
  },
  {
    id: 'cannon', title: 'Newton\'s cannon: how orbits work', sub: 'Fire faster and faster from a giant mountain', scene: 'earth',
    setup() { newWorld({ g: 1, a: 0, e: 0, spin: 0 }, CANNON.lon, 10); Viz.addMountain(CANNON.lat, CANNON.lon, CANNON.alt); setTS(120); camGround(CANNON.lat, CANNON.lon, 0.5, 0, 0.12, 1.2); },
    steps: [
      { text: 'Isaac Newton imagined a cannon on a mountain so tall it pokes above the air (we froze Earth\'s spin to keep it simple). At 3 km/s, the ball curves down and hits the ground.', run() { fire(3); }, dur: 9 },
      { text: 'At 6 km/s it lands much farther away. The faster it goes sideways, the more the round Earth curves away beneath it.', run() { fire(6); camGround(CANNON.lat, CANNON.lon + 15, 1.1, 0, 0.3, 1.0); }, dur: 9 },
      { text: 'At 7.8 km/s something special happens. It falls, but the ground keeps curving away just as fast. It never lands. That\'s an orbit.', run() { fire(7.82); Inset.fallCurve(); camEarth(3.8, 0.9, 0.35, 0.9); }, dur: 14 },
      { text: 'The Earth does not turn to catch it. The ball does all the moving: falling 4.9 m every second while the ground drops 4.9 m below it. A satellite is just something falling around Earth forever.', dur: 13 },
      { text: 'Faster still, 9.5 km/s, and the circle stretches into an oval. It climbs high, slows down, and swings back.', run() { Inset.hide(); setTS(600); fire(9.5); camEarth(5.5, 0.3, 1.2, 1.0); }, dur: 12 },
      { text: 'At 11.1 km/s it never comes back. That\'s escape velocity: 11.2 km/s from the ground. So 7.9 km/s (28,400 km/h) is orbit speed, and 11.2 km/s is escape speed.', run() { setTS(1200); fire(11.1); camEarth(12, 0.3, 1.25, 0.8); }, dur: 13 }
    ],
    panel() {
      const st = App.canSt = App.canSt || { v: 7.8, az: 90 };
      const s = B.sec('Cannon', 'Fired sideways from a mountain 150 km high.');
      B.slider(s, 'Speed', 1, 12, 0.05, () => st.v, v => { st.v = v; }, v => fmt(v, 2) + ' km/s · ' + fmt(v * 3600) + ' km/h');
      B.chips(s, '', [[7.82, 'Orbit 7.8'], [11.1, 'Escape 11.1']], () => st.v, v => { st.v = v; buildPanel(); });
      B.chips(s, 'Aim', [[90, 'East'], [270, 'West'], [0, 'North']], () => st.az, v => { st.az = v; });
      B.buttons(s, [['Fire', () => fire(st.v, { az: st.az }), 'primary'], ['Clear', () => { newWorld({ g: App.P.g, a: App.P.a, e: 0, spin: App.P.spin }, CANNON.lon, 10); Viz.addMountain(CANNON.lat, CANNON.lon, CANNON.alt); }], ['Why it never lands', () => $('inset').hidden ? Inset.fallCurve() : Inset.hide()]]);
      const w = B.sec('World');
      B.toggle(w, 'Gravity', 'Without it the ball flies straight off', () => App.P.g, v => { App.P.g = v ? 1 : 0; });
      B.toggle(w, 'Air', 'Drag slows the ball (the mountain top is above most of it)', () => App.P.a, v => { App.P.a = v ? 1 : 0; });
      B.slider(w, 'Earth spin', 0, 1, 1, () => App.P.spin, v => setSpin(v), v => v ? 'on (real)' : 'frozen');
      cameraSection();
    }
  },
  {
    id: 'spacetime', title: 'Einstein: gravity is bent spacetime', sub: 'The 3D picture of an orbit', scene: 'spacetime',
    setup() { stClear(); ST.mass = 0; ST.targetMass = 0; camScene(24, 0.6, 0.42, 1.0, -3); Inset.hide(); },
    steps: [
      { text: 'Newton said gravity is a pull. Einstein said something stranger: mass bends space and time around it. Here is empty, flat space.', dur: 8 },
      { text: 'Add Earth\'s mass and space dips, like a heavy ball on a stretchy sheet. The grid lines show the bending.', dur: 9, run() { ST.targetMass = 1; } },
      { text: 'A satellite at the right speed circles inside the dip, like a marble rolling around a bowl. Nothing steers it. It just follows the straightest path it can through curved spacetime.', dur: 12, run() { stLaunch(1.0, '#7cf29a'); camScene(19, 1.2, 0.38, 0.8, -3); } },
      { text: 'Too slow, and it spirals down the dip and hits Earth.', dur: 9, run() { stLaunch(0.55, '#ff6b6b'); } },
      { text: 'Too fast, and it rolls up and out of the bowl and escapes. Faster than circling, slower than escaping gives an oval orbit.', dur: 11, run() { stLaunch(1.5, '#5ad1ff'); camScene(30, 1.6, 0.5, 0.8, -3); } },
      { text: 'Take the mass away and the sheet goes flat: the path becomes a straight line. That\'s the "no gravity" case from chapter 4.', dur: 10, run() { ST.targetMass = 0; stClear(); setTimeout(() => stLaunch(1, '#ffcf6b'), 600); } },
      { text: 'The sheet is only a picture. Real spacetime bends in four dimensions, and the biggest effect near Earth is the bending of time: clocks closer to Earth tick slower.', dur: 12, run() { ST.targetMass = 1; stClear(); stLaunch(1.0, '#7cf29a'); Inset.clocks(); CLOCK.day = 0; } },
      { text: 'GPS satellites fly 20,200 km up, where time runs 45.7 µs a day faster. Their speed slows them 7.2 µs. Without Einstein\'s correction, GPS would drift about 11 km every day.', dur: 14 }
    ],
    panel() {
      const s = B.sec('Spacetime');
      B.slider(s, 'Mass', 0, 2, 0.05, () => ST.targetMass, v => { ST.targetMass = v; }, v => v === 0 ? 'none (flat space)' : '×' + fmt(v, 2) + ' Earth', true);
      const st = App.stSt = App.stSt || { f: 1 };
      B.slider(s, 'Launch speed', 0.3, 1.7, 0.05, () => st.f, v => { st.f = v; }, v => fmt(v, 2) + '× circle speed' + (Math.abs(v - 1) < 0.03 ? ' (circle)' : v >= 1.41 ? ' (escape)' : ''));
      B.buttons(s, [['Launch', () => stLaunch(st.f, st.f < 0.97 ? '#ff6b6b' : st.f < 1.03 ? '#7cf29a' : st.f < 1.41 ? '#ffcf6b' : '#5ad1ff'), 'primary'], ['Clear', stClear], ['Clocks', () => $('inset').hidden ? Inset.clocks() : Inset.hide()]]);
    }
  },
  {
    id: 'satellite', title: 'Launch a satellite', sub: 'From India to orbit, then out to geostationary', scene: 'earth',
    setup() { newWorld({ g: 1, a: 1, e: 0 }, 80.23, 15); setTS(8); App.main = launchSat('SHAR', 'ISS'); camFollow(App.main, 0.04, 2.4, 0.3, 1.5); },
    steps: [
      { text: 'Lift-off from Sriharikota, India. Target: a low orbit 420 km up, the same height as the International Space Station.', dur: 8 },
      { text: 'The rocket climbs straight up first, to get out of the thick air quickly.', dur: 8, run() { camFollow(App.main, 0.05, 3.0, 0.35, 1.4); } },
      { text: 'Then it tips over. Going up is the easy part. The hard part is going sideways at 7.7 km/s. Watch the speed dial climb toward the green orbit zone.', dur: 11, run() { setTS(14); camFollow(App.main, 0.12, 1.6, 0.4, 1.0); } },
      { text: 'Launching toward the east gives a free boost: the spinning Earth was already carrying the rocket at 452 m/s before it left the pad.', until: () => App.main.phase !== 'ascent', dur: 9, max: 40 },
      { text: 'Engine off. The satellite is now falling around Earth at 7.7 km/s, once every 93 minutes. Just like Newton\'s cannonball.', dur: 10, run() { setTS(500); camAtWorld(Viz.craftWorld(App.main), 3.4, 0.35, 1.0); } },
      { text: 'Ground view: each lap the track over the ground shifts west, because Earth turns underneath. This wavy line is the ground track.', dur: 12, run() { setView('ground'); setTS(900); camGround(13.72, 80.23, 2.6, 0, 1.3, 1.0); } },
      { text: 'Now a geostationary satellite. It parks in a low orbit, fires once at the equator to swing out to 35,786 km, then fires again at the top to stay there.', run() { setView('space'); newWorld({ g: 1, a: 1, e: 0 }, 80.23, 15); setTS(1200); App.main = launchSat('SHAR', 'GEO'); camEarth(14, 0.5, 0.45, 0.8); }, until: () => App.main.phase === 'final', dur: 12, max: 60 },
      { text: 'Up there one lap takes exactly one day, the same as Earth\'s spin. Ground view: the satellite hangs over one spot on the equator. That\'s why a satellite TV dish never has to move.', run() { setTS(3000); setView('ground'); camGround(0, 80, 14, 0, 1.45, 0.8); }, dur: 14 }
    ],
    panel() {
      const st = App.satSt = App.satSt || { site: 'SHAR', orbit: 'ISS' };
      const s = B.sec('Mission');
      B.select(s, 'Launch site', Object.entries(SITES).map(([k, v]) => [k, v.name]), () => st.site, v => { st.site = v; });
      B.select(s, 'Orbit', Object.entries(ORBITS).map(([k, v]) => [k, v.name + ' · ' + fmt(v.alt / 1000) + ' km']), () => st.orbit, v => { st.orbit = v; });
      B.buttons(s, [['Launch', () => { newWorld({ g: 1, a: 1, e: 0 }, SITES[st.site].lon, 15); setTS(10); App.main = launchSat(st.site, st.orbit); camFollow(App.main, 0.05, 2.2, 0.05, 1.5); }, 'primary']]);
      cameraSection();
    }
  },
  {
    id: 'sun', title: 'Earth around the Sun', sub: 'The biggest ride of all, at true distances', scene: 'earth',
    setup() { App.storyBase = new Date(); newWorld({}, 151, -30); setTS(21600); U.showOrbits = true; camEarth(3.4, 0.4, 0.3); },
    steps: [
      { text: 'Zoom out. The Moon circles Earth every 27 days, about 384,000 km away. You could line up 30 Earths in that gap.', dur: 10, run() { camEarth(170, 0.6, 0.55, 0.9); } },
      { text: 'Further out is the Sun, 150 million km away. Its light takes 8 minutes 20 seconds to reach us. These are the real distances.', dur: 11, run() { setTS(86400); camFocus('earth', 70000, 0.5, 0.9, 0.7); } },
      { text: 'Watch a whole year. Earth circles the Sun at 107,000 km/h, more than 8 times its own width every hour. We follow the Sun now, so you see Earth go around.', dur: 14, run() { setTS(1728000); camFocus('sun', 110000, 0.3, 1.45, 0.8); } },
      { text: 'Earth\'s axis keeps pointing the same way all year. In December the south leans toward the Sun: long days and summer in Sydney, and the South Pole has 24-hour daylight.', dur: 13, run() { const d = dateForLocalSun(151, 10, new Date(Date.UTC(new Date().getUTCFullYear(), 11, 21))); newWorld({}, null, null, d); setTS(1800); E.axis.visible = true; camEarth(3.6, 0, -0.35, 1.0); camAtWorld(SUN_W.clone(), 3.6, -0.3, 1.0); } },
      { text: 'Six months later, in June, the north leans toward the Sun. Now it\'s winter in Sydney and the South Pole sits in darkness all day.', dur: 12, run() { const d = dateForLocalSun(151, 10, new Date(Date.UTC(new Date().getUTCFullYear(), 5, 21))); newWorld({}, null, null, d); setTS(1800); E.axis.visible = true; camAtWorld(SUN_W.clone(), 3.6, -0.3, 1.0); } },
      { text: 'Does 107,000 km/h change a flight from Sydney to Los Angeles? No. The plane, the air and both airports all move at that speed together, and the Sun pulls all of them the same way.', dur: 12, run() { camEarth(3.4, 0.5, 0.3, 1.0); } },
      { text: 'Earth is in free fall around the Sun, exactly like a satellite around Earth. Motion only matters compared to what\'s around you. That\'s the frame of reference, and it explains everything in this lab.', dur: 13, run() { setTS(1728000); camFocus('sun', 62000, 0.8, 0.6, 0.6); } }
    ],
    panel() { spacePanel(); }
  }
];
const SANDBOX = {
  id: 'sandbox', title: 'Sandbox', sub: 'Launch anything, change the laws of physics', scene: 'earth', mode: true,
  setup() { newWorld({}, null, null, new Date()); setTS(300); camEarth(3.2, 0.3, 0.3); },
  steps: [],
  panel() {
    const tab = App.sbTab = App.sbTab || 'fly';
    const t = B.sec('Launch');
    B.chips(t, '', [['fly', 'Flight'], ['race', 'Race'], ['cannon', 'Cannon'], ['sat', 'Satellite']], () => App.sbTab, v => { App.sbTab = v; buildPanel(); });
    if (tab === 'fly') {
      const st = App.sbFly = App.sbFly || { from: 'LHR', to: 'JFK' };
      B.select(t, 'From', cityOpts, () => st.from, v => { st.from = v; });
      B.select(t, 'To', cityOpts, () => st.to, v => { st.to = v; });
      B.buttons(t, [['Take off', () => { const c = flyRoute(st.from, st.to, { color: PAL.ball[(App.ballN++) % 6] }); camFollow(c, 0.5, 0, 0.9, 1.2); }, 'primary']]);
    } else if (tab === 'race') {
      const st = App.sbRace = App.sbRace || { lat: 40, dist: 3000 };
      B.slider(t, 'Latitude', -80, 80, 1, () => st.lat, v => { st.lat = v; }, v => v === 0 ? 'equator' : Math.abs(v) + '° ' + (v > 0 ? 'N' : 'S'));
      B.slider(t, 'Distance', 500, 15000, 100, () => st.dist, v => { st.dist = v; }, v => fmt(v) + ' km');
      B.buttons(t, [['Start race', () => { race(st.lat, 0, st.dist); camGround(st.lat, 0, 1.6, 0, 1.0); }, 'primary']]);
    } else if (tab === 'cannon') {
      const st = App.sbCan = App.sbCan || { v: 7.8, lat: 0, lon: 30 };
      B.slider(t, 'Speed', 1, 12, 0.05, () => st.v, v => { st.v = v; }, v => fmt(v, 2) + ' km/s');
      B.slider(t, 'From latitude', -60, 60, 1, () => st.lat, v => { st.lat = v; }, v => v + '°');
      B.buttons(t, [['Fire east', () => { CANNON.lat = st.lat; fire(st.v, { az: 90 }); camEarth(4, 0.3, 0.9); }, 'primary'], ['Fire north', () => { CANNON.lat = st.lat; fire(st.v, { az: 0 }); camEarth(4, 0.3, 0.6); }]]);
    } else {
      const st = App.sbSat = App.sbSat || { site: 'KSC', orbit: 'GPS' };
      B.select(t, 'Site', Object.entries(SITES).map(([k, v]) => [k, v.name]), () => st.site, v => { st.site = v; });
      B.select(t, 'Orbit', Object.entries(ORBITS).map(([k, v]) => [k, v.name]), () => st.orbit, v => { st.orbit = v; });
      B.buttons(t, [['Launch', () => { const c = launchSat(st.site, st.orbit); camFollow(c, 0.08, 2.2, 0.1, 1.5); }, 'primary']]);
    }
    B.buttons(t, [['Clear everything', () => { newWorld(App.P, null, null, Clock.now()); }], ['Gravity on other worlds', openGravityLab]]);
    physicsSection(); planeSection(); worldSection(); cameraSection();
  }
};
function cameraSection() {
  const s = B.sec('Camera');
  const list = [['Whole Earth', () => camEarth()]];
  App.sim && App.sim.crafts.filter(c => c.kind !== 'debris').slice(-4).forEach(c => list.push(['Follow ' + (c.title || c.id), () => camFollow(c, c.kind === 'plane' ? 0.02 : 0.06, 2.2, 0.15, 1.6)]));
  B.buttons(s, list);
}
function ringLabels(on) {
  (App.ringL || []).forEach(l => Labels.remove(l)); App.ringL = [];
  if (!on) return;
  [[0, '1,670 km/h'], [-33.87, '1,390 km/h · Sydney'], [51.5, '1,040 km/h · London'], [70, '570 km/h'], [89, '0 km/h at the pole']].forEach(([lat, t]) => {
    const u = llUnit(lat, 151.21 + 40);
    const L = Labels.add('<b>' + t + '</b>', 'ring', () => Viz.earthFixedWorld(u, 20000)); App.ringL.push(L);
  });
}

/* ---------- camera on any body ---------- */
function bodyWorld(name) {
  if (name === 'earth') return new V3();
  if (name === 'sun') return U.sunWorld.clone();
  if (name === 'moon') return U.moonWorld.clone();
  const b = U.bodies[name]; return b ? b.mesh.getWorldPosition(new V3()) : new V3();
}
function camFocus(name, dist, az = 0.5, el = 0.4, rate = 1.0) {
  Viz.follow = null; App.focus = name;
  Cam.go({ frame: () => { const p = bodyWorld(name); const f = name === 'earth' ? new V3(0, 0, -1) : p.clone().normalize(); return { pos: p, fwd: f, up: new V3(0, 1, 0) }; }, dist, az, el, worldUp: true }, rate);
}
const FOCUS = [['earth', 'Earth', 3.4], ['moon', 'Moon', 1.4], ['sun', 'Sun', 420]];

/* ---------- panels for the free modes ---------- */
function moonSvg(a) {
  const c = Math.cos(a * DEG), waxing = a < 180, gib = c < 0, rx = Math.abs(c) * 18;
  return `<svg viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18" fill="#1b2235" stroke="#3a4766"/><path d="M22 4 A18 18 0 0 ${waxing ? 1 : 0} 22 40 A${rx.toFixed(2)} 18 0 0 ${waxing ? (gib ? 1 : 0) : (gib ? 0 : 1)} 22 4Z" fill="#e9edf5"/></svg>`;
}
function nowCard(sec) {
  const box = document.createElement('div'); box.className = 'now-card'; sec.appendChild(box);
  const draw = () => {
    if (!box.isConnected) return;
    const d = Clock.now(), ss = subsolar(d), mp = moonPhaseInfo(d);
    box.innerHTML = `<div class="nc-row"><span class="k">Sun overhead at</span><b>${fmt(Math.abs(ss[0]), 1)}°${ss[0] >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(ss[1]), 1)}°${ss[1] >= 0 ? 'E' : 'W'}</b></div>
      <div class="nc-row"><span class="k">Moon</span><b>${mp.name} · ${fmt(mp.illum * 100)}% lit</b></div>
      <div class="moon-ico">${moonSvg(mp.angle)}<span>How the Moon looks from the Northern Hemisphere. From Sydney it appears flipped left to right.</span></div>
      <div class="nc-row"><span class="k">Tides</span><b class="sm">${tideState(d)}</b></div>`;
    setTimeout(draw, 1000);
  };
  draw();
}
function layersSection() {
  const s = B.sec('Layers');
  B.toggle(s, 'Clouds', 'Real cloud cover', () => E.clouds.visible, v => { E.clouds.visible = v; });
  B.toggle(s, 'City lights', 'Night-side lights from NASA', () => E.uni.nightGain.value > 0, v => { E.uni.nightGain.value = v ? 1.6 : 0; });
  B.toggle(s, 'Tides', 'Ocean bulges pulled by the Moon and Sun (hugely exaggerated)', () => U.showTides, v => { U.showTides = v; });
  B.toggle(s, 'Spin axis', 'Tilted 23.4°, always pointing at the North Star', () => E.axis.visible, v => { E.axis.visible = v; });
  B.toggle(s, 'Speed rings', 'How fast the ground moves at each latitude', () => E.rings.visible, v => { E.rings.visible = v; ringLabels(v); });
  B.toggle(s, 'Orbits', 'Paths of the Moon and of Earth around the Sun', () => U.showOrbits, v => { U.showOrbits = v; });
}
function eclipseSection() {
  const s = B.sec('Eclipses', 'Jump to the next real eclipse and watch the shadow.');
  const out = document.createElement('p'); out.className = 'help'; s.appendChild(out);
  B.buttons(s, [
    ['Next solar eclipse', () => {
      const e = Astronomy.SearchGlobalSolarEclipse(Clock.now());
      const peak = e.peak.date;
      newWorld(App.P, null, null, new Date(peak.getTime() - 45 * 60e3)); setTS(30);
      out.textContent = `${e.kind[0].toUpperCase() + e.kind.slice(1)} solar eclipse on ${fmtDate(peak)}${e.latitude != null ? ', centred near ' + fmt(Math.abs(e.latitude), 1) + '°' + (e.latitude >= 0 ? 'N' : 'S') + ' ' + fmt(Math.abs(e.longitude), 1) + '°' + (e.longitude >= 0 ? 'E' : 'W') : ''}. The Moon's shadow is the dark spot crossing Earth.`;
      if (e.latitude != null) camGround(e.latitude, e.longitude, 2.4, 0, 1.3, 1.2); else camAtWorld(SUN_W.clone(), 3.2, 0, 1.2);
    }, 'primary'],
    ['Next lunar eclipse', () => {
      let e = Astronomy.SearchLunarEclipse(Clock.now());
      for (let i = 0; i < 12 && e.kind === 'penumbral'; i++) e = Astronomy.NextLunarEclipse(e.peak);
      const peak = e.peak.date;
      newWorld(App.P, null, null, new Date(peak.getTime() - 70 * 60e3)); setTS(30);
      out.textContent = `${e.kind[0].toUpperCase() + e.kind.slice(1)} lunar eclipse on ${fmtDate(peak)}. Earth's shadow slides across the Moon and turns it red, from sunlight bent through our atmosphere.`;
      Viz.follow = null; App.focus = 'moon';
      Cam.go({ frame: () => { const p = U.moonWorld.clone(); return { pos: p, fwd: p.clone().normalize(), up: new V3(0, 1, 0) }; }, dist: 2.2, az: 0.25, el: 0.15, worldUp: true }, 1.0);
    }]
  ]);
}
function keplerChart(sec) {
  const pts = [['Earth', 1, 365.256, '#7cc4ff']].concat(PLANETS.map(p => [p.name, p.a, p.P, p.color]));
  const W = 270, H = 190, l = 34, b = 26, xr = [Math.log10(0.3), Math.log10(40)], yr = [Math.log10(50), Math.log10(1e5)];
  const X = a => l + (Math.log10(a) - xr[0]) / (xr[1] - xr[0]) * (W - l - 8), Y = d => H - b - (Math.log10(d) - yr[0]) / (yr[1] - yr[0]) * (H - b - 8);
  let svg = `<svg viewBox="0 0 ${W} ${H}" class="kchart" role="img" aria-label="Orbit time against distance from the Sun for each planet, all on one straight line">`;
  [0.5, 1, 2, 5, 10, 20].forEach(v => { svg += `<line x1="${X(v)}" x2="${X(v)}" y1="8" y2="${H - b}" class="kg"/><text x="${X(v)}" y="${H - b + 12}" class="kt">${v}</text>`; });
  [[100, '100 d'], [365.25, '1 yr'], [3652.5, '10 yr'], [36525, '100 yr']].forEach(([v, t]) => { svg += `<line x1="${l}" x2="${W - 8}" y1="${Y(v)}" y2="${Y(v)}" class="kg"/><text x="${l - 4}" y="${Y(v) + 3}" class="kt r">${t}</text>`; });
  svg += `<line x1="${X(0.3)}" y1="${Y(365.256 * Math.pow(0.3, 1.5))}" x2="${X(40)}" y2="${Y(365.256 * Math.pow(40, 1.5))}" class="kl"/>`;
  pts.forEach(([n, a, P, c]) => { svg += `<circle cx="${X(a)}" cy="${Y(P)}" r="4.5" fill="${c}"/><text x="${X(a) + 7}" y="${Y(P) + 4}" class="kn">${n}</text>`; });
  svg += `<text x="${(W + l) / 2}" y="${H - 2}" class="kt">distance from the Sun (Earth = 1)</text></svg>`;
  const d = document.createElement('div'); d.innerHTML = svg + '<p class="help">Every planet sits on one straight line: the time for one orbit squared grows with the distance cubed. Farther planets have farther to go and move slower.</p>'; sec.appendChild(d);
}
function spacePanel() {
  const s = B.sec('Go to');
  const go = (k, d) => () => camFocus(k, d, 0.5, 0.3);
  B.buttons(s, [['Earth', go('earth', 3.4)], ['Moon', go('moon', 1.3)], ['Sun', go('sun', 420)]].concat(PLANETS.map(p => [p.name, go(p.name.toLowerCase(), BODY_R[p.name] / R * (p.ring ? 7 : 4.5))])));
  B.buttons(s, [['Earth and Moon', () => camFocus('earth', 170, 0.6, 0.55)], ['Inner planets', () => camFocus('sun', 160000, 0.3, 1.35)], ['Whole solar system', () => camFocus('sun', 1900000, 0.3, 1.25)]]);
  const t = B.sec('Scale');
  B.toggle(t, 'True scale', 'Real sizes. Planets become tiny dots, so markers show where they are', () => U.trueScale, v => { U.trueScale = v; });
  B.toggle(t, 'Orbits', 'Paths of the Moon, Earth and the planets', () => U.showOrbits, v => { U.showOrbits = v; });
  const l = B.sec('Light delay', 'Send a flash of light from Earth. Nothing travels faster: 300,000 km every second.');
  const out = document.createElement('p'); out.className = 'help'; l.appendChild(out);
  B.buttons(l, ['Moon', 'Sun', 'Mars', 'Jupiter', 'Neptune'].map(n => [n, () => {
    const secs = sendLight(n);
    out.textContent = `Light takes ${secs < 60 ? fmt(secs, 2) + ' seconds' : secs < 3600 ? fmt(Math.floor(secs / 60)) + ' min ' + fmt(Math.round(secs % 60)) + ' s' : fmt(secs / 3600, 2) + ' hours'} to reach ${n === 'Sun' ? 'the Sun' : n === 'Moon' ? 'the Moon' : n}. ${n === 'Mars' ? 'That\'s why Mars rovers can\'t be driven live with a joystick.' : n === 'Moon' ? 'Apollo astronauts heard Mission Control with this delay.' : ''}`;
    camFocus('earth', clamp(len(bodyEqj(n, Clock.now())) / R * 1.25, 120, 2e6), 0.4, 0.9, 1.2);
  }]));
  const k = B.sec('Kepler\'s laws', 'Planets sweep out equal areas in equal times, so they speed up when close to the Sun.');
  const kout = document.createElement('p'); kout.className = 'help'; k.appendChild(kout);
  B.chips(k, '', [['', 'Off'], ['Mercury', 'Mercury'], ['Mars', 'Mars'], ['Earth', 'Earth']], () => App.kepler || '', v => {
    App.kepler = v; const r = setKepler(v);
    kout.textContent = r ? `Each coloured slice is ${fmt(r.days)} days of ${r.name}'s orbit. Same time, same area. Fastest ${fmt(r.vmax, 1)} km/s near the Sun, slowest ${fmt(r.vmin, 1)} km/s far away.` : '';
    if (v) camFocus('sun', v === 'Mercury' ? 34000 : v === 'Mars' ? 120000 : 80000, 0.3, 1.4, 1.0);
  });
  keplerChart(k);
  const gsec = B.sec('Gravity on other worlds');
  B.buttons(gsec, [['Open the gravity lab', openGravityLab, 'primary']]);
  const d = B.sec('Distances right now');
  const box = document.createElement('div'); box.className = 'now-card'; d.appendChild(box);
  const draw = () => {
    if (!box.isConnected) return;
    const dt = Clock.now();
    const rows = [['Moon', len(moonEqj(dt)) / 1000], ['Sun', len(sunEqj(dt)) / 1000]].concat(PLANETS.map(p => [p.name, len(bodyEqj(p.name, dt)) / 1000]));
    box.innerHTML = rows.map(([n, km]) => { const lt = km / 299792.458; return `<div class="nc-row"><span class="k">${n}</span><b>${km > 1e9 ? fmt(km / 1e9, 2) + ' bn km' : km > 1e6 ? fmt(km / 1e6, 1) + ' M km' : fmt(km) + ' km'} · ${lt < 60 ? fmt(lt, 2) + ' s' : lt < 3600 ? fmt(lt / 60, 1) + ' min' : fmt(lt / 3600, 2) + ' h'}</b></div>`; }).join('') + '<p class="help">Right column: how long light takes to get there.</p>';
    setTimeout(draw, 1000);
  };
  draw();
}
const EXPLORE = {
  id: 'explore', title: 'Explore Earth', sub: 'The real Earth, right now', scene: 'earth', mode: true, steps: [],
  setup() { newWorld({}, null, null, new Date()); setTS(1); App.live = true; camAtWorld(SUN_W.clone(), 3.3, 0.25, 1.2); },
  panel() {
    const s = B.sec('Right now');
    nowCard(s);
    layersSection(); eclipseSection();
  }
};
const SPACE = {
  id: 'space', title: 'Space', sub: 'The Moon, the Sun and the planets at real distances', scene: 'earth', mode: true, steps: [],
  setup() { newWorld({}, null, null, new Date()); setTS(3600); camFocus('earth', 170, 0.6, 0.55); },
  panel() { spacePanel(); }
};
