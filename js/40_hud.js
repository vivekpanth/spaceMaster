/* ================= HUD: gauges instead of tables ================= */
const SVGNS = 'http://www.w3.org/2000/svg';
const fmt = (n, d = 0) => Number(n).toLocaleString('en-AU', { maximumFractionDigits: d, minimumFractionDigits: d });
function fmtDur(s) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  if (h >= 48) return fmt(h / 24, 1) + ' days';
  if (h) return h + ' h ' + String(m).padStart(2, '0') + ' min';
  if (m) return m + ' min ' + String(x).padStart(2, '0') + ' s';
  return x + ' s';
}
function svgEl(tag, attrs, parent) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
function arcPath(cx, cy, r, a0, a1) {
  const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/* speed dial: needle + inner arc = ground speed, outer arc = speed through space */
function makeDial(o) {
  const A0 = Math.PI * 0.75, SW = Math.PI * 1.5;
  const svg = svgEl('svg', { viewBox: '0 0 160 150', class: 'dial', role: 'img', 'aria-label': o.aria || 'Speed dial' });
  const ang = v => A0 + SW * clamp(v / o.max, 0, 1);
  svgEl('path', { d: arcPath(80, 80, 66, A0, A0 + SW), class: 'dial-track' }, svg);
  (o.zones || []).forEach(z => svgEl('path', { d: arcPath(80, 80, 66, ang(z[0]), ang(Math.min(z[1], o.max))), stroke: z[2], class: 'dial-zone' }, svg));
  for (let v = 0; v <= o.max + 1e-9; v += o.tick) {
    const a = ang(v), major = Math.abs(v / o.major - Math.round(v / o.major)) < 1e-6;
    svgEl('line', { x1: 80 + Math.cos(a) * (major ? 52 : 56), y1: 80 + Math.sin(a) * (major ? 52 : 56), x2: 80 + Math.cos(a) * 60, y2: 80 + Math.sin(a) * 60, class: major ? 'tick major' : 'tick' }, svg);
    if (major && v > 0 && v < o.max - 1e-9) { const t = svgEl('text', { x: 80 + Math.cos(a) * 42, y: 80 + Math.sin(a) * 42 + 3.5, class: 'tick-lbl' }, svg); t.textContent = o.tickFmt ? o.tickFmt(v) : fmt(v); }
  }
  const outer = svgEl('path', { class: 'dial-outer', stroke: o.outerColor || '#7cc4ff' }, svg);
  const inner = svgEl('path', { class: 'dial-inner', stroke: o.color }, svg);
  const needle = svgEl('g', { class: 'needle' }, svg);
  svgEl('line', { x1: 80, y1: 80, x2: 80 + 56, y2: 80, stroke: o.color }, needle);
  svgEl('circle', { cx: 80, cy: 80, r: 4.5, fill: o.color }, needle);
  const val = svgEl('text', { x: 80, y: 116, class: 'dial-val' }, svg);
  const unit = svgEl('text', { x: 80, y: 142, class: 'dial-unit' }, svg); unit.textContent = o.unit;
  let cur = 0, curO = 0;
  return {
    el: svg, color: o.color,
    set(v, outerV, dt = 0.1) {
      cur += (v - cur) * Math.min(1, dt * 6); curO += ((outerV ?? 0) - curO) * Math.min(1, dt * 6);
      inner.setAttribute('d', cur > o.max * 0.002 ? arcPath(80, 80, 66, A0, ang(cur)) : '');
      outer.setAttribute('d', outerV != null && curO > o.max * 0.002 ? arcPath(80, 80, 73, A0, ang(curO)) : '');
      needle.setAttribute('transform', `rotate(${(ang(cur) * 180 / Math.PI).toFixed(2)} 80 80)`);
      val.textContent = o.valFmt ? o.valFmt(v) : fmt(v);
    },
    setColor(c) { inner.setAttribute('stroke', c); needle.querySelectorAll('*').forEach(e => { e.setAttribute('stroke', c); if (e.tagName === 'circle') e.setAttribute('fill', c); }); }
  };
}

/* altitude ladder on a log scale with real-world markers */
const ALT_MARKS = [[0.01, 'Ground', 0], [10, 'Airliners 10 km', 0], [100, 'Edge of space', 4], [420, 'Space Station', -3], [20200, 'GPS', 5], [35786, 'TV satellites', -4]];
function makeLadder() {
  const H = 150, top = 10, bot = 140;
  const y = km => { const l = Math.log10(clamp(km, 0.01, 100000)); return bot - (l + 2) / 7 * (bot - top); };
  const svg = svgEl('svg', { viewBox: `0 0 120 ${H}`, class: 'ladder', role: 'img', 'aria-label': 'Altitude' });
  svgEl('rect', { x: 14, y: top, width: 6, height: bot - top, rx: 3, class: 'lad-track' }, svg);
  const fill = svgEl('rect', { x: 14, width: 6, rx: 3, class: 'lad-fill' }, svg);
  ALT_MARKS.forEach(([km, t, dy]) => {
    const yy = y(km);
    svgEl('line', { x1: 10, x2: 24, y1: yy, y2: yy, class: 'lad-tick' }, svg);
    const tx = svgEl('text', { x: 30, y: yy + 3.5 + dy, class: 'lad-lbl' }, svg); tx.textContent = t;
  });
  const mk = svgEl('g', {}, svg);
  svgEl('path', { d: 'M2 0 L12 -6 L12 6 Z', class: 'lad-mk' }, mk);
  return {
    el: svg,
    set(km, color) {
      const yy = y(Math.max(km, 0.01));
      fill.setAttribute('y', yy); fill.setAttribute('height', Math.max(0, bot - yy)); fill.setAttribute('fill', color);
      mk.setAttribute('transform', `translate(0 ${yy.toFixed(1)})`); mk.firstChild.setAttribute('fill', color);
    }
  };
}

/* weight scale for the Eötvös effect */
function makeScale() {
  const d = document.createElement('div'); d.className = 'scale';
  d.innerHTML = '<div class="scale-top"><span class="k">Weight on board</span><b class="v">100%</b></div><div class="scale-bar"><i class="mid"></i><i class="mk"></i></div><div class="scale-ends"><span>lighter</span><span>heavier</span></div><p class="note"></p>';
  const v = d.querySelector('.v'), mk = d.querySelector('.mk'), note = d.querySelector('.note'), bar = d.querySelector('.scale-bar');
  return {
    el: d,
    set(w, color) {
      if (w == null) { d.hidden = true; return; }
      d.hidden = false;
      if (w === 0) { v.textContent = '0% · weightless'; bar.classList.add('zero'); mk.style.left = '0%'; note.textContent = 'Falling freely: everything on board floats.'; return; }
      bar.classList.remove('zero');
      const dlt = w - 100;
      v.textContent = (dlt >= 0 ? '+' : '−') + fmt(Math.abs(dlt), 2) + '%';
      mk.style.left = (50 + clamp(dlt / 1.0, -1, 1) * 50) + '%';
      mk.style.background = color;
      note.textContent = Math.abs(dlt) < 0.02 ? 'Same as standing on the ground.' : (dlt < 0 ? 'Lighter: going fast around Earth\'s centre.' : 'Heavier: moving slower around Earth\'s centre than the ground does.');
    }
  };
}

/* route progress strip */
function makeRoute(c) {
  const d = document.createElement('div'); d.className = 'route';
  d.innerHTML = `<div class="route-ends"><span class="a"></span><span class="b"></span></div><div class="route-line"><i class="fill"></i><i class="pl">✈</i></div><div class="route-sub"></div>`;
  d.style.setProperty('--c', c.color);
  d.querySelector('.a').textContent = c.fromName || 'Start'; d.querySelector('.b').textContent = c.toName || 'Destination';
  const fill = d.querySelector('.fill'), pl = d.querySelector('.pl'), sub = d.querySelector('.route-sub');
  return {
    el: d,
    set(p, text) { const x = clamp(Math.abs(p), 0, 1) * 100; fill.style.width = x + '%'; pl.style.left = x + '%'; pl.style.opacity = p < 0 ? 0.4 : 1; sub.textContent = text; }
  };
}

const HUD = {
  box: null, cards: new Map(), feed: null,
  clear() { this.box.innerHTML = ''; this.cards.clear(); this.feedEl = null; },
  ensureFeed() {
    if (this.feedEl) return;
    const f = document.createElement('section'); f.className = 'card feed'; f.innerHTML = '<h3>Mission log</h3><ol></ol>';
    this.box.appendChild(f); this.feedEl = f.querySelector('ol'); this.feedCount = 0;
  },
  card(c) {
    let k = this.cards.get(c); if (k) return k;
    const el = document.createElement('section'); el.className = 'card craft-card'; el.style.setProperty('--c', c.color);
    k = { el, c };
    if (c.kind === 'capsule') {
      el.innerHTML = `<header><i class="dot"></i><b>${c.title || 'Capsule'}</b><span class="pill"></span></header><div class="row"><div class="dialbox"></div><div class="ladbox"></div></div><div class="cap-g"><span class="k">Deceleration</span><div class="gbar"><i></i></div><b class="gv"></b></div><div class="cap-g"><span class="k">Heat shield</span><div class="gbar heat"><i></i></div><b class="tv"></b></div><p class="orb"></p>`;
      k.dial = makeDial({ max: 8, tick: 0.5, major: 2, unit: 'km/s through the air', color: c.color, valFmt: v => fmt(v, 2) });
      el.querySelector('.dialbox').appendChild(k.dial.el);
      k.lad = makeLadder(); el.querySelector('.ladbox').appendChild(k.lad.el);
    } else if (c.kind === 'plane') {
      el.innerHTML = `<header><i class="dot"></i><b>${c.title || 'Plane'}</b><span class="pill"></span></header><div class="row"><div class="dialbox"></div><div class="ladbox"></div></div><div class="speeds"><span><i class="sw in"></i>Ground speed</span><span><i class="sw out"></i>Speed through space</span></div>`;
      k.dial = makeDial({ max: 3000, tick: 250, major: 1000, unit: 'km/h over the ground', color: c.color, tickFmt: v => v / 1000 + 'k', valFmt: v => fmt(v) });
      el.querySelector('.dialbox').appendChild(k.dial.el);
      k.lad = makeLadder(); el.querySelector('.ladbox').appendChild(k.lad.el);
      k.scale = makeScale(); el.appendChild(k.scale.el);
      if (c.route) { k.route = makeRoute(c); el.appendChild(k.route.el); }
      k.cor = document.createElement('p'); k.cor.className = 'cor'; el.appendChild(k.cor);
    } else {
      el.innerHTML = `<header><i class="dot"></i><b>${c.title || 'Object'}</b><span class="pill"></span></header><div class="row"><div class="dialbox"></div><div class="ladbox"></div></div><div class="zones"><span class="z1">falls back</span><span class="z2">orbits</span><span class="z3">escapes</span></div><p class="orb"></p>`;
      k.dial = makeDial({ max: 13, tick: 0.5, major: 2, unit: 'km/s through space', color: c.color, zones: [[0, 7.9, 'rgba(255,107,107,.55)'], [7.9, 11.2, 'rgba(124,242,154,.6)'], [11.2, 13, 'rgba(90,209,255,.6)']], valFmt: v => fmt(v, 2) });
      el.querySelector('.dialbox').appendChild(k.dial.el);
      k.lad = makeLadder(); el.querySelector('.ladbox').appendChild(k.lad.el);
    }
    k.pill = el.querySelector('.pill');
    this.box.prepend(el);
    this.cards.set(c, k); return k;
  },
  removeMissing(sim) {
    for (const [c, k] of this.cards) if (!sim.crafts.includes(c) || c.hideCard) { k.el.remove(); this.cards.delete(c); }
  },
  update(sim, dt) {
    if (!sim) return;
    this.removeMissing(sim);
    const shown = sim.crafts.filter(c => c.kind !== 'debris' && !c.hideCard).slice(-3);
    for (const c of shown) {
      const k = this.card(c), r = readout(sim, c);
      if (c.kind === 'capsule') {
        const st = capsuleState(sim, c);
        k.dial.set(st.V / 1000, null, dt);
        k.lad.set(Math.max(0, st.h / 1000), c.color);
        k.el.querySelector('.gbar i').style.width = clamp(st.g / 6, 0, 1) * 100 + '%';
        k.el.querySelector('.gv').textContent = fmt(st.g, 1) + ' g';
        k.el.querySelector('.gbar.heat i').style.width = clamp(st.T / 2000, 0, 1) * 100 + '%';
        k.el.querySelector('.tv').textContent = fmt(Math.max(st.T, 20)) + ' °C';
        k.pill.textContent = c.landed ? 'Splashdown' : c.chute ? 'Under parachutes' : st.q > 3e5 ? 'Radio blackout' : st.h < 120e3 ? 'Entering the air' : 'Falling from orbit';
        k.el.querySelector('.orb').textContent = c.landed ? 'Down after ' + fmtDur(c.landT) + '. Peak ' + fmt(c.maxT) + ' °C and ' + fmt(c.maxG, 1) + ' g.' : fmt(st.h / 1000, 1) + ' km up · ' + fmt(st.V * 3.6) + ' km/h';
      } else if (c.kind === 'plane') {
        k.dial.set(r.ground * 3.6, r.space * 3.6, dt);
        k.lad.set(Math.max(0, r.alt / 1000), c.color);
        k.scale.set(r.weight == null ? null : (r.weight === 0 ? 0 : r.weight), c.color);
        let pill = c.cruise ? 'Cruising' : (sim.P.g ? (sim.P.a ? 'Gliding' : 'Falling') : 'Coasting');
        if (c.status === 'Arrived') pill = 'Arrived · ' + fmtDur(c.arriveT);
        else if (c.landed) pill = 'Landed after ' + fmtDur(c.landT);
        else if (c.status) pill = c.status;
        else if (r.alt > 200e3) pill = 'Leaving Earth';
        k.pill.textContent = pill;
        if (k.route) {
          let text;
          if (c.cruise && !c.done) { const eta = r.left / Math.max(c.gs || c.V, 1); text = fmt(r.left / 1000) + ' km to go · lands in ' + fmtDur(eta) + (c.windAlong && Math.abs(c.windAlong) > 3 ? ' · wind ' + (c.windAlong > 0 ? '+' : '−') + fmt(Math.abs(c.windAlong * 3.6)) + ' km/h' : ''); }
          else if (c.arrived) text = 'Flight time ' + fmtDur(c.arriveT) + ' over ' + fmt(c.route.L / 1000) + ' km';
          else if (c.landed) text = 'Came down ' + fmt(c.landFrom / 1000, 1) + ' km from the start · ' + fmt(c.missBy / 1000) + ' km from the destination';
          else text = fmt(r.alt / 1000, 1) + ' km up · ' + fmt(r.left / 1000) + ' km from the destination';
          k.route.set(r.progress ?? 0, text);
        }
        k.cor.textContent = r.coriolis != null && Math.abs(r.coriolis) > 0.005 ? 'Coriolis push ' + fmt(Math.abs(r.coriolis), 2) + '% of gravity, to the ' + (r.coriolis > 0 ? 'right' : 'left') + '. The autopilot cancels it.' : '';
      } else {
        const kms = r.space / 1000;
        k.dial.set(kms, null, dt);
        k.lad.set(Math.max(0, r.alt / 1000), c.color);
        let pill = '';
        if (c.kind === 'rocket') pill = { ascent: 'Climbing', park: 'Parking orbit', transfer: 'Transfer orbit', final: 'In orbit' }[c.phase] || '';
        if (c.landed) pill = 'Hit the ground';
        else if (c.status) pill = c.status;
        else if (c.kind === 'ball') { const o = r.orbit; pill = !o ? 'Flying straight' : (!o.bound ? 'Escaping Earth' : (o.rp > R + 1e3 ? 'In orbit' : 'Falling back')); }
        k.pill.textContent = pill;
        const o = r.orbit; let t = c.landed ? 'Landed after ' + fmtDur(c.landT) + ', ' + fmt(c.landFrom / 1000) + ' km from the cannon' : fmt(Math.max(0, r.alt) / 1000) + ' km up';
        if (o && o.bound && o.rp > R && !c.landed && !(c.kind === 'rocket' && c.phase === 'ascent')) t += ' · one lap takes ' + fmtDur(o.period) + (o.e > 0.05 ? ' · lowest ' + fmt((o.rp - R) / 1000) + ' km, highest ' + fmt((o.ra - R) / 1000) + ' km' : '');
        if (c.kind === 'rocket' && c.phase === 'ascent') t += ' · Earth\'s spin gave a free ' + fmt(c.spinGift) + ' m/s';
        k.el.querySelector('.orb').textContent = t;
      }
    }
    if (sim.events.length) {
      this.ensureFeed();
      while (this.feedCount < sim.events.length) {
        const e = sim.events[this.feedCount++];
        const li = document.createElement('li'); li.innerHTML = `<time>T+${fmtDur(e.t - (sim.crafts.find(c => c.id === e.id)?.tL || 0))}</time>${e.text}`;
        this.feedEl.prepend(li);
        while (this.feedEl.children.length > 5) this.feedEl.lastChild.remove();
      }
    }
  }
};
