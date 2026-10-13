/* ================= GRAVITY ON OTHER WORLDS (2D lab, same scale for every world) ================= */
const WORLDS = [
  { name: 'Pluto', g: 0.62, r: 1188.3e3, tex: null, col: ['#c7b39b', '#8d7a66'] },
  { name: 'Moon', g: 1.62, r: 1737.4e3, tex: 'moon', col: ['#b9bcc3', '#6d7078'] },
  { name: 'Mars', g: 3.71, r: 3389.5e3, tex: 'mars', col: ['#d0764a', '#7c3b22'] },
  { name: 'Earth', g: 9.81, r: 6371e3, tex: null, col: ['#4f8a3a', '#2d5a24'] },
  { name: 'Jupiter', g: 24.79, r: 69911e3, tex: 'jupiter', col: ['#d9b48a', '#8f6a46'], note: 'no solid surface: imagine a platform at the cloud tops' }
];
const GL = { mode: 'throw', v: 15, ang: 45, h: 20, jump: 3, mass: 60, t: 0, run: false, speed: 1, open: false };
function openGravityLab() {
  const el = $('glab'); el.hidden = false; GL.open = true;
  el.innerHTML = `<header><div><h3>Gravity on other worlds</h3><p>Same throw, same jump, same drop. Only gravity changes. Every world is drawn to the same scale.</p></div><button type="button" class="btn" id="glClose">Close</button></header>
  <div class="gl-ctl">
    <div class="chips" id="glMode"></div>
    <label class="sl" id="glS1"><span class="sl-top"><span></span><output></output></span><input type="range" id="glIn1"></label>
    <label class="sl" id="glS2"><span class="sl-top"><span></span><output></output></span><input type="range" id="glIn2"></label>
    <label class="sl"><span class="sl-top"><span>Your mass</span><output id="glMassO"></output></span><input type="range" id="glMass" min="20" max="120" step="1"></label>
    <div class="btns"><button type="button" class="btn primary" id="glGo">Go</button><div class="chips" id="glSpd"></div></div>
  </div>
  <canvas id="glCv" aria-label="Five worlds side by side showing the same motion under different gravity"></canvas>`;
  $('glClose').addEventListener('click', closeGravityLab);
  const modes = [['throw', 'Throw a ball'], ['jump', 'Jump'], ['drop', 'Drop from a height']];
  const mbox = $('glMode');
  const sync = () => { mbox.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === GL.mode ? 'true' : 'false')); setupSliders(); GL.t = 0; GL.run = true; };
  modes.forEach(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = v; b.textContent = t; b.addEventListener('click', () => { GL.mode = v; sync(); }); mbox.appendChild(b); });
  const sbox = $('glSpd');
  [[1, 'Real speed'], [3, '3× faster']].forEach(([v, t]) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.v = v; b.textContent = t; b.addEventListener('click', () => { GL.speed = v; sbox.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', +x.dataset.v === v ? 'true' : 'false')); }); sbox.appendChild(b); });
  sbox.querySelector('button').setAttribute('aria-pressed', 'true');
  const mass = $('glMass'); mass.value = GL.mass; $('glMassO').textContent = GL.mass + ' kg';
  mass.addEventListener('input', () => { GL.mass = +mass.value; $('glMassO').textContent = GL.mass + ' kg'; });
  $('glGo').addEventListener('click', () => { GL.t = 0; GL.run = true; });
  sync();
  GL.imgs = {};
  WORLDS.forEach(w => { if (w.tex && TEX[w.tex] && TEX[w.tex].image) GL.imgs[w.name] = TEX[w.tex].image; });
}
function setupSliders() {
  const conf = GL.mode === 'throw' ? [['Throw speed', 'v', 2, 40, 1, v => v + ' m/s (' + fmt(v * 3.6) + ' km/h)'], ['Angle', 'ang', 5, 85, 1, v => v + '°']]
    : GL.mode === 'jump' ? [['Jump push-off speed', 'jump', 1, 6, 0.1, v => fmt(v, 1) + ' m/s'], null]
      : [['Drop height', 'h', 2, 100, 1, v => v + ' m'], null];
  [['glS1', 'glIn1', conf[0]], ['glS2', 'glIn2', conf[1]]].forEach(([sid, iid, c]) => {
    const row = $(sid), inp = $(iid);
    if (!c) { row.hidden = true; return; }
    row.hidden = false;
    row.querySelector('.sl-top span').textContent = c[0];
    inp.min = c[2]; inp.max = c[3]; inp.step = c[4]; inp.value = GL[c[1]];
    const out = row.querySelector('output'); out.textContent = c[5](GL[c[1]]);
    inp.oninput = () => { GL[c[1]] = +inp.value; out.textContent = c[5](+inp.value); GL.t = 0; GL.run = true; };
  });
}
function closeGravityLab() { $('glab').hidden = true; GL.open = false; }
function drawGravityLab(dt) {
  if (!GL.open) return;
  const cv = $('glCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(200, Math.round(r.width)), H = Math.max(200, Math.round(r.height));
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#060b16'; c.fillRect(0, 0, W, H);
  if (GL.run) GL.t += dt * GL.speed;
  const n = WORLDS.length, laneH = H / n, info = Math.min(330, W * 0.36), plotW = W - info - 24, left = 14;
  /* one scale for all worlds, set by the weakest gravity */
  const gmin = Math.min(...WORLDS.map(w => w.g));
  let spanX, spanY;
  if (GL.mode === 'throw') { const a = GL.ang * DEG; spanX = GL.v * GL.v * Math.sin(2 * a) / gmin * 1.05; spanY = GL.v * GL.v * Math.sin(a) ** 2 / (2 * gmin); }
  else if (GL.mode === 'jump') { spanY = GL.jump * GL.jump / (2 * gmin) + 2; spanX = spanY * 2; }
  else { spanY = GL.h * 1.1; spanX = spanY * 2; }
  const mpp = Math.max(spanX / plotW, spanY / (laneH - 26));
  let allDone = true;
  WORLDS.forEach((w, i) => {
    const y0 = i * laneH, gy = y0 + laneH - 14;
    c.save(); c.beginPath(); c.rect(0, y0, W, laneH); c.clip();
    const sky = c.createLinearGradient(0, y0, 0, gy); sky.addColorStop(0, '#060b16'); sky.addColorStop(1, w.name === 'Earth' ? '#16345a' : w.name === 'Mars' ? '#3a1e16' : '#0c1222');
    c.fillStyle = sky; c.fillRect(0, y0, W, laneH);
    const img = GL.imgs && GL.imgs[w.name];
    if (img) { c.save(); c.beginPath(); c.rect(0, gy, W, 14); c.clip(); c.drawImage(img, 0, img.height * 0.45, img.width, img.height * 0.1, 0, gy, W, 14); c.restore(); }
    else { const gg = c.createLinearGradient(0, gy, 0, gy + 14); gg.addColorStop(0, w.col[0]); gg.addColorStop(1, w.col[1]); c.fillStyle = gg; c.fillRect(0, gy, W, 14); }
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(0, gy, W, 1);
    /* motion */
    const X = m => left + m / mpp, Y = m => gy - m / mpp;
    let done = false, label = '';
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,207,107,.45)'; c.setLineDash([4, 4]);
    if (GL.mode === 'throw') {
      const a = GL.ang * DEG, vx = GL.v * Math.cos(a), vy = GL.v * Math.sin(a), T = 2 * vy / w.g, t = Math.min(GL.t, T);
      c.beginPath(); for (let k = 0; k <= 60; k++) { const tt = t * k / 60; const xx = vx * tt, yy = vy * tt - 0.5 * w.g * tt * tt; k ? c.lineTo(X(xx), Y(yy)) : c.moveTo(X(xx), Y(yy)); } c.stroke(); c.setLineDash([]);
      const bx = vx * t, by = vy * t - 0.5 * w.g * t * t;
      drawPerson(c, X(0) - 4, gy, 1.75 / mpp, false);
      c.fillStyle = '#ffcf6b'; c.beginPath(); c.arc(X(bx), Y(by), 5, 0, TAU); c.fill();
      done = GL.t >= T; label = `lands ${fmt(GL.v * GL.v * Math.sin(2 * a) / w.g, 1)} m away · ${fmt(T, 1)} s in the air · peak ${fmt(vy * vy / (2 * w.g), 1)} m`;
    } else if (GL.mode === 'jump') {
      const T = 2 * GL.jump / w.g, t = Math.min(GL.t, T), hgt = GL.jump * t - 0.5 * w.g * t * t;
      c.setLineDash([]); c.strokeStyle = 'rgba(124,196,255,.35)'; c.beginPath(); c.moveTo(X(1.2), Y(GL.jump ** 2 / (2 * w.g))); c.lineTo(X(3), Y(GL.jump ** 2 / (2 * w.g))); c.stroke();
      drawPerson(c, X(1.2), Y(hgt), 1.75 / mpp, hgt > 0.01);
      done = GL.t >= T; label = `jumps ${fmt(GL.jump ** 2 / (2 * w.g), 2)} m high · ${fmt(T, 2)} s in the air`;
    } else {
      const T = Math.sqrt(2 * GL.h / w.g), t = Math.min(GL.t, T), hgt = GL.h - 0.5 * w.g * t * t;
      c.setLineDash([]); c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(X(0.6), Y(GL.h), 3, GL.h / mpp);
      c.fillStyle = '#ffcf6b'; c.beginPath(); c.arc(X(1.2), Y(hgt) - 5, 5, 0, TAU); c.fill();
      done = GL.t >= T; label = `falls ${GL.h} m in ${fmt(T, 2)} s · hits at ${fmt(w.g * T, 1)} m/s`;
    }
    c.setLineDash([]);
    if (!done) allDone = false;
    c.restore();
    /* info column */
    const ix = W - info - 8;
    c.fillStyle = 'rgba(9,15,29,.75)'; c.fillRect(ix, y0 + 6, info, laneH - 12);
    c.fillStyle = '#eaf0fa'; c.font = '600 14px "Chakra Petch", system-ui, sans-serif'; c.fillText(w.name, ix + 10, y0 + 24);
    c.fillStyle = '#ffcf6b'; c.font = '500 12px "JetBrains Mono", monospace'; c.fillText(fmt(w.g, 2) + ' m/s²', ix + info - 92, y0 + 24);
    c.fillStyle = '#9aa8c2'; c.font = '11.5px "IBM Plex Sans", system-ui, sans-serif';
    const lines = [label, `You (${GL.mass} kg) weigh like ${fmt(GL.mass * w.g / 9.81, 1)} kg on Earth`, `Orbit speed ${fmt(Math.sqrt(w.g * w.r) / 1000, 2)} km/s · escape ${fmt(Math.sqrt(2 * w.g * w.r) / 1000, 2)} km/s`];
    if (w.note) lines.push(w.note);
    wrapLines(c, lines, ix + 10, y0 + 40, info - 20, 14, laneH - 44);
  });
  /* scale bar */
  const tenM = Math.pow(10, Math.floor(Math.log10(mpp * 120)));
  c.strokeStyle = '#9aa8c2'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(left, 12); c.lineTo(left + tenM / mpp, 12); c.stroke();
  c.fillStyle = '#9aa8c2'; c.font = '11px "JetBrains Mono", monospace'; c.fillText(fmt(tenM) + ' m (same scale for every world)', left, 26);
  if (allDone) GL.run = false;
}
function wrapLines(c, lines, x, y, w, lh, maxH) {
  let yy = y;
  for (const t of lines) {
    const words = t.split(' '); let line = '';
    for (const wd of words) { const test = line ? line + ' ' + wd : wd; if (c.measureText(test).width > w && line) { if (yy - y < maxH) c.fillText(line, x, yy); yy += lh; line = wd; } else line = test; }
    if (yy - y < maxH) c.fillText(line, x, yy); yy += lh;
  }
}
function drawPerson(c, x, footY, hPx, air) {
  hPx = Math.max(hPx, 10);
  const head = hPx * 0.13;
  c.strokeStyle = '#eaf0fa'; c.fillStyle = '#eaf0fa'; c.lineWidth = Math.max(1.5, hPx * 0.06); c.lineCap = 'round';
  const hip = footY - hPx * 0.48, sh = footY - hPx * 0.8;
  c.beginPath(); c.arc(x, footY - hPx + head, head, 0, TAU); c.fill();
  c.beginPath(); c.moveTo(x, sh); c.lineTo(x, hip);
  c.moveTo(x, hip); c.lineTo(x - hPx * 0.12, air ? hip + hPx * 0.3 : footY); c.moveTo(x, hip); c.lineTo(x + hPx * 0.12, air ? hip + hPx * 0.3 : footY);
  c.moveTo(x, sh + hPx * 0.05); c.lineTo(x - hPx * 0.2, air ? sh - hPx * 0.2 : sh + hPx * 0.25); c.moveTo(x, sh + hPx * 0.05); c.lineTo(x + hPx * 0.2, air ? sh - hPx * 0.2 : sh + hPx * 0.25);
  c.stroke();
}
