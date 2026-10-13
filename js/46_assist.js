/* ================= GRAVITY ASSIST: same flyby seen from Jupiter and from the Sun ================= */
const GA = { open: false, t: 0, vinf: 10, vj: 13.1, b: 1.6 };
function openAssist() {
  const el = $('glab'); el.hidden = false; GA.open = true; GL.open = false;
  el.innerHTML = `<header><div><h3>Gravity assist: free speed from a planet</h3><p>The same flyby drawn twice. Left: from Jupiter, the probe leaves as fast as it came. Right: from the Sun, Jupiter's own motion is added, so the probe leaves much faster.</p></div><button type="button" class="btn" id="gaClose">Close</button></header>
  <div class="gl-ctl ga-ctl">
    <label class="sl"><span class="sl-top"><span>Probe speed far from Jupiter</span><output id="gaVo"></output></span><input type="range" id="gaV" min="4" max="16" step="0.5"></label>
    <label class="sl"><span class="sl-top"><span>How close it passes</span><output id="gaBo"></output></span><input type="range" id="gaB" min="1.1" max="4" step="0.1"></label>
    <div class="btns"><button type="button" class="btn primary" id="gaGo">Replay</button></div>
  </div>
  <canvas id="gaCv" aria-label="Flyby of Jupiter shown in Jupiter's frame and in the Sun's frame"></canvas>`;
  $('gaClose').addEventListener('click', () => { $('glab').hidden = true; GA.open = false; });
  const v = $('gaV'), b = $('gaB');
  v.value = GA.vinf; b.value = GA.b;
  const sync = () => { GA.vinf = +v.value; GA.b = +b.value; $('gaVo').textContent = fmt(GA.vinf, 1) + ' km/s'; $('gaBo').textContent = fmt(GA.b, 1) + ' Jupiter radii'; GA.t = 0; GA.path = null; };
  v.addEventListener('input', sync); b.addEventListener('input', sync); $('gaGo').addEventListener('click', () => { GA.t = 0; });
  sync();
}
/* integrate the flyby in Jupiter's frame (units: Jupiter radii, km/s, hours) */
function gaPath() {
  const RJ = 71492, GMJ = 1.26687e8;
  const mu = GMJ / (RJ * RJ * RJ) * 3600 * 3600;
  const vin = GA.vinf / RJ * 3600;
  const ang = 205 * DEG;
  let x = -Math.cos(ang) * 60, y = -Math.sin(ang) * 60;
  let vx = Math.cos(ang) * vin, vy = Math.sin(ang) * vin;
  const perp = [-Math.sin(ang), Math.cos(ang)];
  /* aim offset: impact parameter that gives the chosen closest approach */
  const rp = GA.b, vinf2 = vin * vin, bimp = rp * Math.sqrt(1 + 2 * mu / (rp * vinf2));
  x += perp[0] * bimp; y += perp[1] * bimp;
  const pts = []; let t = 0;
  const dt = 0.02;
  for (let i = 0; i < 40000; i++) {
    const r = Math.hypot(x, y), a = -mu / (r * r * r);
    vx += a * x * dt; vy += a * y * dt; x += vx * dt; y += vy * dt; t += dt;
    if (i % 10 === 0) pts.push({ x, y, t, vx, vy });
    if (r > 62 && i > 100 && x * vx + y * vy > 0) break;
  }
  return { pts, toKms: RJ / 3600 };
}
function drawAssist(dt) {
  if (!GA.open) return;
  const cv = $('gaCv'); if (!cv) return;
  const r = cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(200, Math.round(r.width)), H = Math.max(200, Math.round(r.height));
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = '#060b16'; c.fillRect(0, 0, W, H);
  if (!GA.path) GA.path = gaPath();
  const P = GA.path.pts, Tend = P[P.length - 1].t;
  GA.t += dt * Tend / 9; if (GA.t > Tend * 1.15) GA.t = 0;
  const k = P.findIndex(p => p.t >= GA.t); const idx = k < 0 ? P.length - 1 : k;
  const half = W / 2, sc = Math.min(half, H) / 130;
  const vjU = GA.vj / GA.path.toKms;
  const panel = (ox, sun) => {
    const cx = ox + half / 2, cy = H / 2 + 10;
    c.save(); c.beginPath(); c.rect(ox, 0, half, H); c.clip();
    c.fillStyle = sun ? '#ffcf6b' : '#9aa8c2'; c.font = '600 13px "Chakra Petch", system-ui'; c.fillText(sun ? 'SEEN FROM THE SUN' : 'SEEN FROM JUPITER', ox + 14, 22);
    const shift = t => sun ? (t - P[0].t - (Tend / 2)) * vjU : 0;
    /* path */
    c.strokeStyle = sun ? 'rgba(255,207,107,.85)' : 'rgba(124,196,255,.85)'; c.lineWidth = 2; c.beginPath();
    for (let i = 0; i <= idx; i++) { const p = P[i], X = cx + (p.x + shift(p.t)) * sc, Y = cy - p.y * sc; i ? c.lineTo(X, Y) : c.moveTo(X, Y); }
    c.stroke();
    /* Jupiter */
    const p = P[idx], jx = cx + shift(p.t) * sc;
    c.fillStyle = '#d9b48a'; c.beginPath(); c.arc(jx, cy, Math.max(4, sc * 1.0), 0, TAU); c.fill();
    if (sun) { c.strokeStyle = 'rgba(217,180,138,.6)'; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(jx - 40, cy); c.lineTo(jx + 40, cy); c.stroke(); c.setLineDash([]); c.fillStyle = '#d9b48a'; c.font = '11px "IBM Plex Sans"'; c.fillText('Jupiter moves at ' + fmt(GA.vj, 1) + ' km/s →', jx - 60, cy + 26); }
    /* probe */
    const X = cx + (p.x + shift(p.t)) * sc, Y = cy - p.y * sc;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(X, Y, 4, 0, TAU); c.fill();
    const sp = Math.hypot(p.vx + (sun ? vjU : 0), p.vy) * GA.path.toKms;
    c.fillStyle = '#eaf0fa'; c.font = '500 13px "JetBrains Mono", monospace'; c.fillText('speed ' + fmt(sp, 1) + ' km/s', ox + 14, H - 16);
    c.restore();
  };
  panel(0, false); panel(half, true);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(half - 0.5, 0, 1, H);
  const a = P[0], b = P[P.length - 1], g = GA.path.toKms;
  const sin = Math.hypot(a.vx + vjU, a.vy) * g, sout = Math.hypot(b.vx + vjU, b.vy) * g;
  c.fillStyle = '#ffcf6b'; c.font = '600 13px "Chakra Petch", system-ui';
  c.fillText(`From the Sun: ${fmt(sin, 1)} km/s in → ${fmt(sout, 1)} km/s out (${sout > sin ? '+' : ''}${fmt(sout - sin, 1)} km/s, taken from Jupiter's orbit)`, half + 14, 42);
}
