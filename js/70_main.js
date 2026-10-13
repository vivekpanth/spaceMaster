/* ================= PLAYER + MAIN LOOP ================= */
const Player = {
  ch: null, i: 0, t: 0, playing: true, free: false,
  start(ch, opts = {}) {
    this.ch = ch; App.chapter = ch; if (!ch.mode && !ch.group) App.lastChapter = ch; if (ch.group === 'missions') App.lastMission = ch;
    if (ch.group !== 'missions') stopMission();
    if (ch.id !== 'space') { setTrails(''); Sky.extraYears = 0; App.motion = ''; }
    LG.on = false; if (GA.open) { $('glab').hidden = true; GA.open = false; }
    if (GL.open) closeGravityLab();
    buildChapterRow(ch.group === 'missions' ? MISSIONS : CHAPTERS);
    Inset.hide(); Labels.list.filter(l => l.tag === 'world' || l.cls === 'ring').forEach(l => Labels.remove(l)); ringLabels(false);
    setView('space');
    setScene(ch.scene);
    if (ch.scene === 'earth') { App.P = Object.assign({}, DEFAULT_P); App.plane = { V: 900, alt: 10, angle: 0 }; }
    ch.setup();
    this.i = -1; this.free = !!opts.free; this.playing = !opts.free;
    document.querySelectorAll('#chapters button').forEach(b => b.setAttribute('aria-current', b.dataset.id === ch.id ? 'true' : 'false'));
    const modeId = ch.mode ? ch.id : ch.group === 'missions' ? 'missions' : 'story';
    document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-current', b.dataset.mode === modeId ? 'true' : 'false'));
    document.body.dataset.mode = modeId;
    $('capChap').textContent = ch.mode ? ch.title : ch.group === 'missions' ? 'Mission · ' + ch.title : 'Chapter ' + (CHAPTERS.indexOf(ch) + 1) + ' · ' + ch.title;
    const dots = $('capDots'); dots.innerHTML = '';
    ch.steps.forEach((s, k) => { const d = document.createElement('button'); d.type = 'button'; d.className = 'dot'; d.setAttribute('aria-label', 'Step ' + (k + 1)); d.addEventListener('click', () => this.jump(k)); dots.appendChild(d); });
    showTitle(ch);
    buildPanel();
    document.body.classList.toggle('panel-open', this.free || !!ch.mode);
    try { localStorage.setItem('sel-chapter', ch.id); } catch (e) { }
    if (ch.steps.length) this.go(0); else { this.i = 0; }
  },
  go(k) {
    const ch = this.ch; if (!ch) return;
    k = clamp(k, 0, ch.steps.length - 1);
    this.i = k; this.t = 0;
    const s = ch.steps[k];
    s.run && s.run();
    $('capText').textContent = typeof s.text === 'function' ? s.text() : s.text;
    $('capText').classList.remove('in'); void $('capText').offsetWidth; $('capText').classList.add('in');
    $('capStep').textContent = (k + 1) + ' / ' + ch.steps.length;
    document.querySelectorAll('#capDots .dot').forEach((d, j) => d.setAttribute('aria-current', j === k ? 'true' : 'false'));
    $('capNext').textContent = k === ch.steps.length - 1 ? (ch.group === 'missions' ? 'Next mission ▶' : 'Next chapter ▶') : 'Next ▶';
    buildPanelCameraOnly();
  },
  jump(k) { if (k === this.i) return; if (k < this.i) { const ch = this.ch; this.start(ch); for (let j = 1; j < k; j++) { this.i = j; ch.steps[j].run && ch.steps[j].run(); } this.go(k); return; } for (let j = this.i + 1; j < k; j++) { this.ch.steps[j].run && this.ch.steps[j].run(); } this.go(k); },
  next() {
    if (this.ch.mode) return;
    if (this.i < this.ch.steps.length - 1) this.go(this.i + 1);
    else if (this.ch.group === 'missions') { const n = MISSIONS.indexOf(this.ch) + 1; this.start(n < MISSIONS.length ? MISSIONS[n] : SPACE); }
    else { const n = CHAPTERS.indexOf(this.ch) + 1; this.start(n < CHAPTERS.length ? CHAPTERS[n] : EXPLORE); }
  },
  tick(dt) {
    if (!this.ch || this.ch.mode) return;
    const s = this.ch.steps[this.i];
    const prog = s.until ? (s.until() ? 1 : Math.min(0.95, this.t / (s.max || 30))) : this.t / (s.dur || 8);
    $('capProg').style.width = (clamp(prog, 0, 1) * 100).toFixed(1) + '%';
    if (!this.playing) return;
    this.t += dt;
    const done = s.until ? ((s.until() && this.t >= Math.min(s.dur || 6, 6)) || this.t >= (s.max || 30)) : this.t >= (s.dur || 8);
    if (done && this.i < this.ch.steps.length - 1) this.go(this.i + 1);
    else if (done && this.i === this.ch.steps.length - 1 && !this.free) { this.playing = false; syncPlay(); openFree(); }
  }
};
function syncPlay() { $('capPlay').textContent = Player.playing ? 'Pause story' : 'Play story'; $('capPlay').setAttribute('aria-pressed', Player.playing ? 'false' : 'true'); }
function openFree() { Player.free = true; document.body.classList.add('panel-open'); buildPanel(); }
function buildPanel() {
  const body = $('panelBody'); body.innerHTML = ''; B.body = body;
  $('panelTitle').textContent = Player.ch && Player.ch.mode ? Player.ch.title : 'Free play';
  Player.ch && Player.ch.panel && Player.ch.panel();
}
function buildPanelCameraOnly() { if (document.body.classList.contains('panel-open')) buildPanel(); }
function showTitle(ch) {
  const t = $('titlecard');
  t.querySelector('small').textContent = ch.mode ? 'Free mode' : ch.group === 'missions' ? 'Mission' : 'Chapter ' + (CHAPTERS.indexOf(ch) + 1);
  t.querySelector('h1').textContent = ch.title; t.querySelector('p').textContent = ch.sub;
  t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
}

/* race strip: two lanes when an east/west pair is flying */
function updateRace() {
  const box = $('race'); const s = App.sim;
  const E1 = s && s.crafts.find(c => c.id === 'E' && c.kind === 'plane'), W1 = s && s.crafts.find(c => c.id === 'W' && c.kind === 'plane');
  if (App.scene !== 'earth' || !E1 || !W1) { box.hidden = true; return; }
  box.hidden = false;
  const lane = (c, el) => {
    const r = readout(s, c), p = clamp(Math.abs(r.progress || 0), 0, 1);
    el.querySelector('.pl').style.left = (p * 100) + '%';
    el.querySelector('.fill').style.width = (p * 100) + '%';
    el.querySelector('.t').textContent = c.arrived ? 'Arrived ' + fmtDur(c.arriveT) : c.landed ? 'Landed ' + fmt(c.landFrom / 1000) + ' km out' : c.status || (fmt(r.ground * 3.6) + ' km/h over the ground');
  };
  lane(E1, box.querySelector('.lane.e')); lane(W1, box.querySelector('.lane.w'));
  let res = '';
  if (E1.arrived && W1.arrived) { const d = Math.abs(E1.arriveT - W1.arriveT); res = d < 60 ? 'Tie: same flight time' : (E1.arriveT < W1.arriveT ? 'East' : 'West') + ' wins by ' + fmtDur(d); }
  box.querySelector('.res').textContent = res;
}

function buildChapterRow(list) {
  const nav = $('chapters');
  if (nav.dataset.list === (list === MISSIONS ? 'm' : 's')) { nav.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', Player.ch && b.dataset.id === Player.ch.id ? 'true' : 'false')); return; }
  nav.dataset.list = list === MISSIONS ? 'm' : 's';
  nav.innerHTML = '';
  list.forEach((ch, k) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.id = ch.id;
    b.innerHTML = `<i>${k + 1}</i><span>${ch.title.split(':')[0]}</span>`;
    b.title = ch.title + ': ' + ch.sub;
    b.setAttribute('aria-current', Player.ch && ch.id === Player.ch.id ? 'true' : 'false');
    b.addEventListener('click', () => Player.start(ch));
    nav.appendChild(b);
  });
}
/* time bar */
function updateTimebar() {
  const d = Clock.now();
  let local = '';
  try { local = d.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: App.ts <= 10 ? '2-digit' : undefined }); } catch (e) { local = d.toString(); }
  $('dateNow').textContent = local;
  $('dateUtc').textContent = d.toISOString().slice(11, 16) + ' UTC';
  const live = App.live && App.playing;
  $('nowBtn').classList.toggle('live', live);
  $('nowBtn').textContent = live ? '● Live' : 'Now';
}

/* clocks inset animation */
function updateClocks(dt) {
  const hG = document.getElementById('hG'); if (!hG) return;
  CLOCK.day += dt * 0.6;
  const a = CLOCK.day * 360;
  hG.setAttribute('transform', `rotate(${a % 360} 50 50)`);
  document.getElementById('hP').setAttribute('transform', `rotate(${(a + CLOCK.day * 9) % 360} 50 50)`);
  document.getElementById('hI').setAttribute('transform', `rotate(${(a - CLOCK.day * 6) % 360} 50 50)`);
  const days = CLOCK.day * 2;
  const el = document.getElementById('clkDays');
  if (el) el.innerHTML = `After <b>${fmt(days, 1)} days</b> the GPS clock is <b>${fmt(days * 38.5)} µs</b> ahead. Uncorrected, your phone's map would be off by <b>${fmt(days * 11.5, 1)} km</b>.`;
}

/* ---------- boot ---------- */
let lastT = performance.now(), hudT = 0, simClockT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const time = now / 1000;
  const W = VIEW.W, H = VIEW.H;
  if (App.scene === 'earth') {
    if (App.sim && App.playing) {
      if (App.live) { const want = (Date.now() - Clock.date0.getTime()) / 1000 - App.sim.t; if (want > 0) advanceSim(App.sim, Math.min(want, 600)); }
      else advanceSim(App.sim, dt * App.ts);
    }
    Viz.update(dt, time);
    updateLiving(dt, time);
    { const d = Clock.now(); updateTrails(d); orientSun(d); }
    scenes.earth.updateMatrixWorld();
    Cam.update(dt);
    const cd = camera.position.length();
    E.atm.material.uniforms.strength.value = clamp((cd - 1.0) / 0.1, 0.25, 1.25);
    updateSky();
    renderScene(scenes.earth);
  } else if (SCN[App.scene]) {
    Cam.update(dt);
    SCN[App.scene].update(App.playing ? dt : 0, time);
    renderScene(scenes[App.scene]);
  } else if (App.scene === 'spacetime') {
    stUpdate(App.playing ? dt : 0);
    Cam.update(dt);
    renderScene(scenes.spacetime);
    updateClocks(App.playing ? dt : 0);
  }
  Labels.update(App.scene, W, H);
  drawGravityLab(dt); drawAssist(dt); drawLabs(dt);
  Player.tick(dt);
  hudT += dt;
  if (hudT > 0.1) {
    if (App.scene === 'earth') { HUD.update(App.sim, hudT); updateRace(); $('hud').hidden = false; }
    else { $('hud').hidden = true; $('race').hidden = true; }
    updateTimebar();
    hudT = 0;
  }
  requestAnimationFrame(frame);
}
function onResize() {
  const r = $('gl').getBoundingClientRect();
  VIEW.W = Math.max(1, Math.round(r.width)); VIEW.H = Math.max(1, Math.round(r.height));
  resizeRenderer(VIEW.W, VIEW.H);
  if (Viz.particles) Viz.particles.mat.uniforms.scale.value = VIEW.H * 1.3;
}
async function boot() {
  initRenderer($('gl'));
  Labels.box = $('labels');
  HUD.box = $('hud');
  await Promise.all([
    loadTex('day', 'tex/earth_day.jpg', { srgb: true }), loadTex('night', 'tex/earth_night.jpg', { srgb: true }),
    loadTex('clouds', 'tex/clouds.jpg', { wrap: true }), loadTex('water', 'tex/water.jpg'), loadTex('stars', 'tex/stars.jpg', { srgb: true }),
    loadTex('moon', 'tex/moon.jpg', { srgb: true }), loadTex('moonN', 'tex/moon_normal.jpg'), loadTex('sun', 'tex/sun.jpg', { srgb: true }), loadTex('milkyway', 'tex/milkyway.jpg')
  ]);
  buildEarthScene(); buildUniverse(); buildPlanets(); buildLagrange(); buildSpacetimeScene(); buildSky();
  Viz.initParticles();
  onResize();
  new ResizeObserver(onResize).observe($('gl'));
  setupInput($('gl'));
  /* chapter nav */
  const modes = $('modes');
  [['story', 'Story', () => Player.start(CHAPTERS[Math.max(0, CHAPTERS.indexOf(App.lastChapter || CHAPTERS[0]))])], ['missions', 'Missions', () => Player.start(App.lastMission || MISSIONS[0])], ['explore', 'Explore Earth', () => Player.start(EXPLORE)], ['space', 'Space', () => Player.start(SPACE)], ['physics', 'Physics Lab', () => Player.start(PHYS)], ['sandbox', 'Sandbox', () => Player.start(SANDBOX)]].forEach(([id, t, fn]) => {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.mode = id; b.textContent = t; b.addEventListener('click', fn); modes.appendChild(b);
  });
  $('capPrev').addEventListener('click', () => { if (Player.i > 0) Player.jump(Player.i - 1); else { const L = Player.ch.group === 'missions' ? MISSIONS : CHAPTERS; const n = L.indexOf(Player.ch); if (n > 0) Player.start(L[n - 1]); } });
  $('capNext').addEventListener('click', () => Player.next());
  $('capPlay').addEventListener('click', () => { Player.playing = !Player.playing; syncPlay(); });
  $('capFree').addEventListener('click', () => { Player.playing = false; syncPlay(); openFree(); });
  $('panelClose').addEventListener('click', () => { document.body.classList.remove('panel-open'); });
  $('simPause').addEventListener('click', () => { App.playing = !App.playing; $('simPause').textContent = App.playing ? '❚❚' : '▶'; $('simPause').setAttribute('aria-label', App.playing ? 'Pause simulation' : 'Resume simulation'); });
  document.querySelectorAll('#viewSeg button').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
  const ts = $('tsSel');
  [[1, 'Real time'], [10, '10×'], [60, '1 min / s'], [300, '5 min / s'], [1200, '20 min / s'], [3600, '1 hour / s'], [10800, '3 hours / s']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; ts.appendChild(o); });
  ts.addEventListener('change', () => { App.ts = +ts.value; App.live = false; });
  [[21600, '6 hours / s'], [86400, '1 day / s'], [604800, '1 week / s'], [2592000, '1 month / s'], [15778800, '6 months / s'], [31557600, '1 year / s']].forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; ts.appendChild(o); });
  $('nowBtn').addEventListener('click', () => { if (Player.ch && !Player.ch.mode) Player.start(EXPLORE); newWorld(App.P, null, null, new Date()); setTS(1); App.live = true; });
  $('dateIn').addEventListener('change', e => { const v = e.target.value; if (!v) return; const d = new Date(v); if (isNaN(d)) return; if (Player.ch && !Player.ch.mode) Player.start(EXPLORE); newWorld(App.P, null, null, d); });
  $('quality').addEventListener('click', () => { GFX.quality = GFX.quality === 'high' ? 'low' : 'high'; $('quality').textContent = GFX.quality === 'high' ? 'High detail' : 'Fast mode'; onResize(); });
  App.onUserCamera = () => { };
  $('loading').classList.add('done');
  let first = CHAPTERS[0];
  try { const id = location.hash.replace('#', '') || ''; const f = CHAPTERS.concat(MISSIONS, [SANDBOX, EXPLORE, SPACE, PHYS]).find(c => c.id === id); if (f) first = f; } catch (e) { }
  Player.start(first);
  /* planet textures load in the background */
  PLANETS.forEach(p => loadTex(p.tex, 'tex/' + p.tex + '.jpg', { srgb: true }).then(t => { const b = U.bodies[p.name.toLowerCase()]; if (t && b) { b.mesh.material.map = t; b.mesh.material.color.set(0xffffff); b.mesh.material.needsUpdate = true; } }));
  loadTex('saturnRing', 'tex/saturn_ring.png', { srgb: true }).then(t => { const b = U.bodies.saturn; if (t && b) { const r = b.mesh.children[0]; r.material.map = t; r.material.color.set(0xffffff); r.material.needsUpdate = true; } });
  syncPlay();
  requestAnimationFrame(frame);
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea')) return;
    if (e.key === 'ArrowRight') Player.next();
    if (e.key === 'ArrowLeft') $('capPrev').click();
    if (e.key === ' ') { e.preventDefault(); Player.playing = !Player.playing; syncPlay(); }
  });
}
boot();
window.__lab = { PHYS, PL, GX, HX, Sky, Trails, MISSIONS, MV, Player, CHAPTERS, SANDBOX, EXPLORE, SPACE, App, Viz, Cam, setTS, setView, U, Clock, newWorld, camFocus, camGround, camAtWorld, E };
