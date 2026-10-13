/* ================= EARTH LABS: layers of the sky, greenhouse effect, why storms spin ================= */
const LAB = { cur: null, t: 0 };
function openLab(def) {
  const el = $('glab'); el.hidden = false;
  GL.open = false; GA.open = false; LAB.cur = def; LAB.t = 0;
  el.setAttribute('aria-label', def.title);
  el.innerHTML = `<header><div><h3>${def.title}</h3><p>${def.sub}</p></div><button type="button" class="btn" id="labClose">Close</button></header>
  <div class="gl-ctl lab-ctl" id="labCtl"></div><canvas id="labCv" aria-label="${def.aria}"></canvas>`;
  $('labClose').addEventListener('click', () => { $('glab').hidden = true; LAB.cur = null; });
  def.controls($('labCtl'));
}
function labSlider(box, label, min, max, step, get, set, f) {
  const l = document.createElement('label'); l.className = 'sl';
  l.innerHTML = `<span class="sl-top"><span>${label}</span><output></output></span><input type="range" min="${min}" max="${max}" step="${step}">`;
  const inp = l.querySelector('input'), out = l.querySelector('output');
  inp.value = get(); out.textContent = f(get());
  inp.addEventListener('input', () => { set(+inp.value); out.textContent = f(+inp.value); });
  box.appendChild(l); return { inp, out, sync() { inp.value = get(); out.textContent = f(get()); } };
}
function labChips(box, list, get, set) {
  const d = document.createElement('div'); d.className = 'chips';
  const sync = () => d.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === String(get()) ? 'true' : 'false'));
  list.forEach(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = String(v); b.textContent = t; b.addEventListener('click', () => { set(v); sync(); }); d.appendChild(b); });
  sync(); box.appendChild(d); return { sync };
}
function drawLabs(dt) {
  const def = LAB.cur; if (!def) return;
  const cv = $('labCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(200, Math.round(r.width)), H = Math.max(200, Math.round(r.height));
  if (cv.width !== W * dpr || cv.height !== H * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  LAB.t += dt;
  def.draw(c, W, H, Math.min(dt, 0.05));
}
const FONT = { h: '600 12px "Chakra Petch", system-ui', b: '13px "IBM Plex Sans", system-ui', s: '11.5px "IBM Plex Sans", system-ui', m: '500 12px "JetBrains Mono", monospace', big: '600 22px "JetBrains Mono", monospace' };

/* ---------- 1. layers of the sky ---------- */
function tempAt(h) {
  /* US Standard Atmosphere 1976 below 86 km, smooth fit above (°C) */
  if (h < 11) return 15 - 6.5 * h;
  if (h < 20) return -56.5;
  if (h < 32) return -56.5 + (h - 20);
  if (h < 47) return -44.5 + 2.8 * (h - 32);
  if (h < 51) return -2.5;
  if (h < 71) return -2.5 - 2.8 * (h - 51);
  if (h < 86) return -58.5 - 2 * (h - 71);
  if (h < 91) return -86.3;
  return 1000 - 813 * Math.exp(-Math.pow((h - 91) / 70, 1.5)) - 273.15;
}
const ATM_LAYERS = [
  { name: 'Troposphere', from: 0, to: 12, col: '#2f6fd1', note: 'All weather happens here. It holds three quarters of all the air.' },
  { name: 'Stratosphere', from: 12, to: 50, col: '#244e9e', note: 'Calm and dry. The ozone layer here soaks up harmful UV, which warms it.' },
  { name: 'Mesosphere', from: 50, to: 85, col: '#1a2f66', note: 'The coldest place around Earth. Shooting stars burn up here.' },
  { name: 'Thermosphere', from: 85, to: 600, col: '#121c40', note: 'Hit by raw sunlight: over 1,000 °C, but the air is so thin you would still freeze.' },
  { name: 'Exosphere', from: 600, to: 1000, col: '#0b1028', note: 'Air fades into space. Atoms here can drift away from Earth for ever.' }
];
const ATM_MARKS = [
  [8.85, 'Mount Everest', '#e8ecf5'], [11, 'Passenger jets', '#e8ecf5'], [20, 'Spy planes', '#c6d0e2'], [39, 'Highest skydive', '#c6d0e2'],
  [80, 'Shooting stars', '#ffd27a'], [100, 'Edge of space (Kármán line)', '#ffcf6b'], [420, 'Space Station', '#ffcf6b'], [520, 'Hubble telescope', '#c9b9ff']
];
const ATL = { h: 11 };
const atmY = (h, top, bot) => bot - (Math.log10(1 + h / 2) / Math.log10(1 + 1000 / 2)) * (bot - top);
function openAtmosLab() {
  openLab({
    title: 'Layers of the sky', sub: 'Climb from the ground to space. The scale stretches near the ground so the thin lower layers fit.', aria: 'Atmosphere layers from the ground to 1,000 km with temperature and air pressure',
    controls(box) { box.classList.add('one'); labSlider(box, 'Your altitude', 0, 1000, 1, () => ATL.h, v => { ATL.h = v; }, v => fmt(v) + ' km'); labChips(box, [[0, 'Ground'], [11, 'Jet'], [30, 'Ozone'], [80, 'Meteors'], [100, 'Space'], [420, 'ISS']], () => ATL.h, v => { ATL.h = v; const i = $('labCtl').querySelector('input'); i.value = v; i.dispatchEvent(new Event('input')); }); },
    draw: drawAtmos
  });
}
function drawAtmos(c, W, H) {
  const top = 18, bot = H - 26, colW = Math.min(W * 0.5, 520), x0 = 16;
  c.fillStyle = '#060b16'; c.fillRect(0, 0, W, H);
  /* layer bands */
  ATM_LAYERS.forEach((L, i) => {
    const y1 = atmY(L.from, top, bot), y2 = atmY(L.to, top, bot);
    const g = c.createLinearGradient(0, y1, 0, y2); g.addColorStop(0, L.col); g.addColorStop(1, ATM_LAYERS[i + 1] ? ATM_LAYERS[i + 1].col : '#060b16');
    c.fillStyle = g; c.fillRect(x0, y2, colW, y1 - y2);
    c.fillStyle = 'rgba(255,255,255,.18)'; c.fillRect(x0, y2, colW, 1);
    c.fillStyle = '#eaf0fa'; c.font = FONT.h; c.fillText(L.name.toUpperCase(), x0 + 10, y2 + 16);
  });
  /* ozone and aurora bands */
  const oz1 = atmY(15, top, bot), oz2 = atmY(35, top, bot);
  c.fillStyle = 'rgba(160,120,255,.18)'; c.fillRect(x0 + colW * 0.55, oz2, colW * 0.45, oz1 - oz2);
  c.fillStyle = '#c9b9ff'; c.font = FONT.s; c.fillText('ozone layer', x0 + colW * 0.57, (oz1 + oz2) / 2 + 4);
  const a1 = atmY(100, top, bot), a2 = atmY(300, top, bot);
  const ga = c.createLinearGradient(0, a1, 0, a2); ga.addColorStop(0, 'rgba(70,255,140,.35)'); ga.addColorStop(0.6, 'rgba(70,255,140,.12)'); ga.addColorStop(1, 'rgba(255,90,122,.18)');
  c.fillStyle = ga; c.fillRect(x0 + colW * 0.55, a2, colW * 0.45, a1 - a2);
  c.fillStyle = '#7cf2a4'; c.fillText('aurora', x0 + colW * 0.57, (a1 + a2) / 2 + 4);
  /* ground */
  c.fillStyle = '#2d5a24'; c.fillRect(x0, bot, colW, 6);
  /* marks */
  c.font = FONT.s;
  ATM_MARKS.forEach(([h, t, col]) => {
    const y = atmY(h, top, bot);
    c.strokeStyle = col; c.globalAlpha = 0.55; c.setLineDash(h === 100 ? [5, 4] : [2, 3]); c.beginPath(); c.moveTo(x0 + colW * 0.3, y); c.lineTo(x0 + colW, y); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
    c.fillStyle = col; c.textAlign = 'right'; c.fillText(t + ' · ' + fmt(h, h < 10 ? 1 : 0) + ' km', x0 + colW - 6, y - 4); c.textAlign = 'left';
  });
  /* altitude ticks */
  c.fillStyle = '#7d8aa5'; c.font = FONT.s;
  [0, 10, 50, 100, 200, 500, 1000].forEach(h => { const y = atmY(h, top, bot); c.fillText(h + ' km', x0 + colW + 6, y + 4); });
  /* temperature curve */
  const tx0 = x0 + colW + 64, tw = W - tx0 - 20;
  const tX = T => tx0 + Math.sqrt(clamp(T + 110, 0, 1300)) / Math.sqrt(1210) * tw;
  if (tw > 120) {
    c.fillStyle = '#9aa8c2'; c.font = FONT.h; c.fillText('TEMPERATURE', tx0, top + 4);
    c.strokeStyle = 'rgba(255,255,255,.08)'; c.font = FONT.s; c.fillStyle = '#7d8aa5';
    [-100, -50, 0, 100, 500, 1000].forEach(T => { const x = tX(T); c.beginPath(); c.moveTo(x, top + 12); c.lineTo(x, bot); c.stroke(); c.fillText(T + '°', x - 10, bot + 16); });
    c.strokeStyle = '#ff9a5c'; c.lineWidth = 2.2; c.beginPath();
    for (let h = 0; h <= 1000; h += h < 100 ? 0.5 : 5) { const x = tX(tempAt(h)), y = atmY(h, top, bot); h ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke(); c.lineWidth = 1;
  }
  /* explorer */
  const h = ATL.h, y = atmY(h, top, bot), T = tempAt(h);
  c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x0, y); c.lineTo(tw > 120 ? tX(T) : x0 + colW, y); c.stroke(); c.lineWidth = 1;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(x0 + colW * 0.18, y, 6, 0, TAU); c.fill();
  if (tw > 120) { c.fillStyle = '#ff9a5c'; c.beginPath(); c.arc(tX(T), y, 5, 0, TAU); c.fill(); }
  /* readout card */
  const rho = h <= 180 ? rhoStd(h * 1000) : 0, pPct = h < 86 ? rho * 287.05 * (T + 273.15) / 101325 * 100 : null;
  const layer = ATM_LAYERS.find(L => h >= L.from && h < L.to) || ATM_LAYERS[4];
  const air = h === 0 ? 100 : pPct != null ? pPct : 0;
  const bx = x0 + 14, by = clamp(y + 14, top + 30, bot - 120), bw = Math.min(300, colW * 0.62);
  c.fillStyle = 'rgba(6,11,22,.86)'; c.strokeStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.roundRect ? c.roundRect(bx, by, bw, 104, 10) : c.rect(bx, by, bw, 104); c.fill(); c.stroke();
  c.fillStyle = '#ffcf6b'; c.font = FONT.h; c.fillText(layer.name.toUpperCase() + ' · ' + fmt(h) + ' KM', bx + 10, by + 18);
  c.fillStyle = '#eaf0fa'; c.font = FONT.m;
  c.fillText('Temperature  ' + fmt(T) + ' °C', bx + 10, by + 38);
  c.fillText('Air pressure ' + (air >= 1 ? fmt(air) + '%' : air >= 0.01 ? fmt(air, 2) + '%' : h < 100 ? '<0.01%' : 'almost none') + (h < 86 ? ' of ground' : ''), bx + 10, by + 56);
  /* air bar */
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(bx + 10, by + 64, bw - 20, 6); c.fillStyle = '#7cc4ff'; c.fillRect(bx + 10, by + 64, (bw - 20) * clamp(air / 100, 0, 1), 6);
  c.fillStyle = '#c6d0e2'; c.font = FONT.s; wrapText(c, layer.note, bx + 10, by + 86, bw - 20, 14);
}
function wrapText(c, txt, x, y, w, lh) {
  const words = txt.split(' '); let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (c.measureText(t).width > w && line) { c.fillText(line, x, y); y += lh; line = wd; } else line = t; }
  if (line) c.fillText(line, x, y); return y;
}

/* ---------- 2. greenhouse effect ---------- */
const GH = { co2: 425, none: false, ph: [], spawn: 0, flash: [] };
function ghTemp() { return GH.none ? -18 : 14 + 3 / Math.LN2 * Math.log(GH.co2 / 280); }
function ghAbsorb() { return GH.none ? 0 : clamp(0.62 + 0.11 * Math.log(GH.co2 / 280), 0.2, 0.95); }
function openGreenhouseLab() {
  GH.ph = []; GH.flash = [];
  openLab({
    title: 'The greenhouse effect', sub: 'Sunlight (yellow) passes through the air and warms the ground. The warm ground glows with heat (red). Carbon dioxide catches that heat and sends some of it back down.', aria: 'Animated sunlight and heat rays between space, the atmosphere and the ground, with a thermometer',
    controls(box) {
      box.classList.add('two');
      const sl = labSlider(box, 'Carbon dioxide in the air', 180, 1200, 5, () => GH.co2, v => { GH.co2 = v; GH.none = false; ch.sync(); }, v => fmt(v) + ' ppm');
      const ch = labChips(box, [['ice', 'Ice age · 180'], ['pre', '1750 · 280'], ['now', 'Today · 425'], ['dbl', 'Doubled · 560'], ['none', 'No atmosphere']],
        () => GH.none ? 'none' : ({ 180: 'ice', 280: 'pre', 425: 'now', 560: 'dbl' })[GH.co2] || '', v => { if (v === 'none') GH.none = true; else { GH.none = false; GH.co2 = { ice: 180, pre: 280, now: 425, dbl: 560 }[v]; } sl.sync(); });
    },
    draw: drawGreenhouse
  });
}
function drawGreenhouse(c, W, H, dt) {
  const gw = Math.max(160, W - 190), groundY = H - 46, atTop = H * 0.3, atBot = groundY - 20;
  const sky = c.createLinearGradient(0, 0, 0, groundY); sky.addColorStop(0, '#03060f'); sky.addColorStop(0.3, '#08122a'); sky.addColorStop(1, '#173a6b');
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  /* Sun */
  const sg = c.createRadialGradient(40, 30, 0, 40, 30, 70); sg.addColorStop(0, 'rgba(255,240,200,1)'); sg.addColorStop(0.3, 'rgba(255,207,107,.7)'); sg.addColorStop(1, 'rgba(255,207,107,0)');
  c.fillStyle = sg; c.fillRect(0, 0, 140, 110);
  /* atmosphere band with CO2 molecules */
  if (!GH.none) {
    c.fillStyle = 'rgba(124,196,255,.07)'; c.fillRect(0, atTop, gw, atBot - atTop);
    c.fillStyle = 'rgba(124,196,255,.5)'; c.font = FONT.h; c.fillText('ATMOSPHERE', 12, atTop + 16);
    const nMol = Math.round(GH.co2 / 7), hash = k => { const v = Math.sin(k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    for (let i = 0; i < nMol; i++) {
      const x = 8 + hash(i + 1) * (gw - 16), y = atTop + 26 + hash(i + 101.7) * (atBot - atTop - 34);
      const fl = GH.flash.find(f => Math.hypot(f.x - x, f.y - y) < 14);
      c.fillStyle = fl ? '#ff9a7a' : 'rgba(200,215,240,.55)';
      c.beginPath(); c.arc(x - 4, y, 2, 0, TAU); c.arc(x + 4, y, 2, 0, TAU); c.fill();
      c.fillStyle = fl ? '#ffd0c0' : 'rgba(150,160,175,.8)'; c.beginPath(); c.arc(x, y, 2.6, 0, TAU); c.fill();
    }
  }
  /* ground warms with temperature */
  const T = ghTemp(), warm = clamp((T + 20) / 40, 0, 1);
  const gcol = `rgb(${Math.round(40 + 120 * warm)},${Math.round(70 + 20 * warm)},${Math.round(60 - 30 * warm)})`;
  c.fillStyle = gcol; c.fillRect(0, groundY, gw, H - groundY);
  c.fillStyle = 'rgba(255,255,255,.75)'; c.font = FONT.h; c.fillText('GROUND AND OCEAN', 12, H - 18);
  /* photons */
  GH.spawn += dt * 9;
  while (GH.spawn > 1) { GH.spawn--; GH.ph.push({ x: 60 + Math.random() * (gw - 80), y: -5, vx: 30 + Math.random() * 20, vy: 150, k: 'sun', age: 0 }); }
  const pAbs = ghAbsorb(), band = atBot - atTop, rate = -Math.log(1 - pAbs) / band;
  for (const p of GH.ph) {
    p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 'sun' && p.y >= groundY) { p.k = 'ir'; p.y = groundY - 1; const a = (Math.random() - 0.5) * 1.1; p.vx = Math.sin(a) * 120; p.vy = -Math.cos(a) * 120; }
    else if (p.k === 'ir') {
      if (p.y >= groundY) { const a = (Math.random() - 0.5) * 1.1; p.y = groundY - 1; p.vx = Math.sin(a) * 120; p.vy = -Math.cos(a) * 120; p.back = (p.back || 0) + 1; }
      if (!GH.none && p.y > atTop && p.y < atBot && Math.random() < rate * Math.abs(p.vy) * dt) {
        GH.flash.push({ x: p.x, y: p.y, t: 0.35 });
        const a = Math.random() * TAU; p.vx = Math.cos(a) * 120; p.vy = Math.sin(a) * 120;
      }
    }
  }
  if (GH.ph.length > 900) GH.ph.splice(0, GH.ph.length - 900);
  GH.ph = GH.ph.filter(p => p.y > -10 && p.x > -10 && p.x < gw + 10 && p.age < 12);
  GH.flash.forEach(f => { f.t -= dt; }); GH.flash = GH.flash.filter(f => f.t > 0);
  for (const p of GH.ph) {
    const sp = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp, L = p.k === 'sun' ? 12 : 10;
    c.strokeStyle = p.k === 'sun' ? '#ffd76a' : '#ff5a4a'; c.lineWidth = p.k === 'sun' ? 2 : 1.8;
    c.beginPath();
    for (let s = 0; s <= L; s += 1) { const w = Math.sin((s + p.age * 60) * (p.k === 'sun' ? 1.1 : 0.55)) * (p.k === 'sun' ? 1.6 : 2.4); const x = p.x - ux * s - uy * w, y = p.y - uy * s + ux * w; s ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  c.lineWidth = 1;
  /* thermometer */
  const tx = gw + 40, tt = 40, tb = H - 70, tr = 14;
  c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(tx - 8, tt, 16, tb - tt);
  const fy = tb - clamp((T + 25) / 50, 0, 1) * (tb - tt);
  const tc = T < 0 ? '#7cc4ff' : T < 15 ? '#7cf29a' : T < 17 ? '#ffcf6b' : '#ff6b5c';
  c.fillStyle = tc; c.fillRect(tx - 5, fy, 10, tb - fy); c.beginPath(); c.arc(tx, tb + 8, tr, 0, TAU); c.fill();
  c.fillStyle = '#9aa8c2'; c.font = FONT.s;
  [-20, -10, 0, 10, 20].forEach(v => { const y = tb - (v + 25) / 50 * (tb - tt); c.fillRect(tx + 9, y, 6, 1); c.fillText(v + '°', tx + 18, y + 4); });
  c.fillStyle = '#eaf0fa'; c.font = FONT.big; c.textAlign = 'center'; c.fillText((T >= 0 ? '+' : '') + fmt(T, 1) + ' °C', tx + 40, 26); c.textAlign = 'left';
  c.fillStyle = '#c6d0e2'; c.font = FONT.s;
  const msg = GH.none ? 'No greenhouse gases: heat escapes straight to space. Earth would be frozen.' : GH.co2 <= 200 ? 'Less CO₂: a colder planet, as in the ice ages.' : GH.co2 <= 300 ? 'The natural greenhouse effect keeps Earth livable.' : 'Extra CO₂ traps more heat. Each doubling adds about 3 °C once the oceans catch up.';
  wrapText(c, msg, gw + 8, H - 34, W - gw - 14, 13);
  c.fillStyle = '#9aa8c2'; c.fillText('Average temperature of Earth', gw + 8, 44 - 2);
}

/* ---------- 3. why storms spin (Coriolis) ---------- */
const CO = { lat: 25, t: 0, parts: [] };
function openCoriolisLab() {
  CO.parts = []; CO.t = 0;
  openLab({
    title: 'Why storms spin', sub: 'Left: a ball rolled across a spinning merry-go-round looks like it curves to the person riding it. Right: the same effect on Earth bends air flowing into a storm into a spiral.', aria: 'A merry-go-round seen from above and from riding it, and air spiralling into a low pressure area',
    controls(box) { box.classList.add('one'); labSlider(box, 'Latitude of the storm', -60, 60, 1, () => CO.lat, v => { CO.lat = v; CO.parts = []; }, v => v === 0 ? 'equator' : Math.abs(v) + '° ' + (v > 0 ? 'north' : 'south')); labChips(box, [[25, 'Florida'], [15, 'Philippines'], [0, 'Equator'], [-20, 'Madagascar']], () => CO.lat, v => { CO.lat = v; CO.parts = []; const i = $('labCtl').querySelector('input'); i.value = v; i.dispatchEvent(new Event('input')); }); },
    draw: drawCoriolis
  });
}
function drawCoriolis(c, W, H, dt) {
  c.fillStyle = '#060b16'; c.fillRect(0, 0, W, H);
  const half = W * 0.5;
  CO.t += dt;
  /* merry-go-round, two small views */
  const T = 4, tt = CO.t % (T + 1), Om = 0.9;
  const views = [['SEEN FROM ABOVE', false], ['SEEN BY A RIDER', true]];
  const rr = Math.min(half / 4.6, H / 2.9);
  views.forEach(([title, ride], k) => {
    const cx = half * (k ? 0.74 : 0.26), cy = H * 0.5;
    c.fillStyle = '#9aa8c2'; c.font = FONT.h; c.textAlign = 'center'; c.fillText(title, cx, cy - rr - 18); c.textAlign = 'left';
    const rot = ride ? 0 : Om * tt;
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#1b2a48'; c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.15)';
    for (let i = 0; i < 8; i++) { const a = rot + i * TAU / 8; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * rr, -Math.sin(a) * rr); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.stroke();
    /* the ball: straight line in the still frame, curve in the rider's frame */
    const path = []; const tEnd = Math.min(tt, 1 / 0.9 * 1.0);
    for (let s = 0; s <= tEnd; s += 0.02) { const r = rr * 0.9 * s; let a = Math.PI / 2; if (ride) a -= Om * s; path.push([Math.cos(a) * r, -Math.sin(a) * r]); }
    c.strokeStyle = '#ffcf6b'; c.lineWidth = 2; c.beginPath(); path.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); c.lineWidth = 1;
    const b = path[path.length - 1] || [0, 0]; c.fillStyle = '#ffcf6b'; c.beginPath(); c.arc(b[0], b[1], 5, 0, TAU); c.fill();
    /* the thrower, fixed to the disc */
    const ta = rot + Math.PI / 2; c.fillStyle = '#7cf29a'; c.beginPath(); c.arc(0, 0, 5, 0, TAU); c.fill();
    c.fillStyle = '#7cc4ff'; c.beginPath(); c.arc(Math.cos(ta) * rr * 0.9, -Math.sin(ta) * rr * 0.9, 6, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = '#c6d0e2'; c.font = FONT.s; c.textAlign = 'center';
    c.fillText(ride ? 'The ball seems to swerve right' : 'The ball goes straight; the disc turns', cx, cy + rr + 22);
    c.textAlign = 'left';
  });
  c.fillStyle = '#7d8aa5'; c.font = FONT.s; c.fillText('Yellow: ball rolled from the centre toward the blue friend at the edge', 14, H - 12);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(half, 10, 1, H - 20);
  /* storm */
  const cx = half + (W - half) / 2, cy = H / 2, R0 = Math.min((W - half) / 2, H / 2) - 26;
  const f = Math.sin(CO.lat * DEG) * 2.4;
  while (CO.parts.length < 260) { const a = Math.random() * TAU, r = R0 * (0.75 + Math.random() * 0.25); CO.parts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, tr: [] }); }
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, R0); g.addColorStop(0, 'rgba(255,107,107,.25)'); g.addColorStop(1, 'rgba(124,196,255,.05)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R0, 0, TAU); c.fill();
  c.fillStyle = '#ff9a8a'; c.font = FONT.h; c.textAlign = 'center'; c.fillText('LOW', cx, cy + 4);
  for (const p of CO.parts) {
    const r = Math.hypot(p.x, p.y) || 1;
    /* pull toward the low, Coriolis turns moving air (right in the north, left in the south), friction slows it */
    /* screen y points down, so the turn is written mirrored: north still comes out anticlockwise */
    const ax = -60 * p.x / r - f * p.vy - 1.1 * p.vx, ay = -60 * p.y / r + f * p.vx - 1.1 * p.vy;
    p.vx += ax * dt; p.vy += ay * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.tr.push([p.x, p.y]); if (p.tr.length > 14) p.tr.shift();
    if (r < 10 || r > R0 * 1.3) { const a = Math.random() * TAU, rr2 = R0 * (0.8 + Math.random() * 0.2); p.x = Math.cos(a) * rr2; p.y = Math.sin(a) * rr2; p.vx = p.vy = 0; p.tr = []; }
  }
  c.strokeStyle = 'rgba(200,225,255,.7)'; c.lineWidth = 1.4;
  for (const p of CO.parts) { if (p.tr.length < 2) continue; c.beginPath(); p.tr.forEach(([x, y], i) => i ? c.lineTo(cx + x, cy + y) : c.moveTo(cx + x, cy + y)); c.stroke(); }
  c.lineWidth = 1;
  const sense = Math.abs(CO.lat) < 3 ? 'No spin: air flows straight in, so hurricanes cannot form at the equator.' : CO.lat > 0 ? 'Northern Hemisphere: storms spin anticlockwise.' : 'Southern Hemisphere: storms spin clockwise.';
  c.fillStyle = '#eaf0fa'; c.font = FONT.b; c.fillText(sense, cx, H - 12); c.textAlign = 'left';
  c.fillStyle = '#9aa8c2'; c.font = FONT.h; c.fillText('AIR RUSHING INTO A STORM, SEEN FROM SPACE', half + 14, 22);
}
