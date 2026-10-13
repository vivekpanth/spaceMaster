/* ================= PHYSICS (inertial frame, z = Earth's spin axis, metres, seconds) ================= */
const R = 6371000, GM = 3.986004418e14, W0 = 7.2921159e-5, CL = 299792458;
const RHO0 = 1.225, HS = 8500, CD = 3e-5, ATM_TOP = 150000, VREF = 220, ROCKET_A = 3;
const RHOC = RHO0 * Math.exp(-10000 / HS);
const DEG = Math.PI / 180, TAU = Math.PI * 2;

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rotZ = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]]; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
function rodrigues(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}
function llUnit(lat, lon) { lat *= DEG; lon *= DEG; return [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)]; }
function unitLL(u) { u = norm(u); return [Math.asin(clamp(u[2], -1, 1)) / DEG, Math.atan2(u[1], u[0]) / DEG]; }
function eastOf(u) { const e = cross([0, 0, 1], u); return len(e) < 1e-9 ? [0, 1, 0] : norm(e); }
function northOf(u) { return cross(u, eastOf(u)); }
function arcDist(a, b) { return Math.acos(clamp(dot(norm(a), norm(b)), -1, 1)) * R; }
function rhoAt(h) { return h >= ATM_TOP ? 0 : RHO0 * Math.exp(-Math.max(h, 0) / HS); }
/* jet stream: blows toward the east, strongest near 40 degrees north and south */
function jetProfile(u) { const lat = Math.abs(Math.asin(clamp(u[2], -1, 1)) / DEG); return Math.exp(-Math.pow((lat - 40) / 16, 2)); }
function windAt(P, u) { return P.a && P.wind ? mul(eastOf(u), P.wind / 3.6 * jetProfile(u)) : [0, 0, 0]; }

/* ---------- routes on the ground (Earth-fixed unit vectors) ---------- */
function greatCircle(a, b) {
  a = norm(a); b = norm(b);
  const ang = Math.acos(clamp(dot(a, b), -1, 1));
  let ax = cross(a, b); ax = len(ax) < 1e-9 ? northOf(a) : norm(ax);
  return {
    type: 'gc', L: ang * R, a, b,
    at: s => rodrigues(a, ax, s / R),
    tan: s => norm(cross(ax, rodrigues(a, ax, s / R)))
  };
}
function parallelRoute(lat, lon0, dir, L) {
  const cl = Math.cos(lat * DEG);
  return {
    type: 'par', L, lat, dir,
    at: s => llUnit(lat, lon0 + dir * (s / (R * cl)) / DEG),
    tan: s => mul(eastOf(llUnit(lat, lon0 + dir * (s / (R * cl)) / DEG)), dir),
    get b() { return llUnit(lat, lon0 + dir * (L / (R * cl)) / DEG); },
    get a() { return llUnit(lat, lon0); }
  };
}
function headingRoute(lat, lon, headingDeg, L) {
  const u = llUnit(lat, lon), h = headingDeg * DEG;
  const d = add(mul(northOf(u), Math.cos(h)), mul(eastOf(u), Math.sin(h)));
  const ax = norm(cross(u, d));
  return {
    type: 'gc', L, a: u, get b() { return rodrigues(u, ax, L / R); },
    at: s => rodrigues(u, ax, s / R),
    tan: s => norm(cross(ax, rodrigues(u, ax, s / R)))
  };
}

/* ---------- the simulation world ---------- */
function makeSim(P) {
  return { P, t: 0, theta0: P.theta0 || 0, om: W0 * P.spin, crafts: [], events: [] };
}
const thetaAt = (sim, t) => sim.theta0 + sim.om * t;
const toI = (sim, pE, t) => rotZ(pE, thetaAt(sim, t));
const toE = (sim, pI, t) => rotZ(pI, -thetaAt(sim, t));
const spinVel = (sim, r) => [-sim.om * r[1], sim.om * r[0], 0];

function accelFree(sim, c, r, v) {
  const P = sim.P, rl = len(r), up = mul(r, 1 / rl), h = rl - R;
  let a = [0, 0, 0];
  const gm = P.g ? GM / (rl * rl) : 0;
  if (P.g) a = mul(up, -gm);
  const rh = P.a ? rhoAt(h) : 0, airOn = rh > 1e-4 * RHO0;
  if (rh > 0) {
    const vair = add(spinVel(sim, r), windAt(P, up));
    const rel = sub(v, vair), Va = len(rel);
    const drag = mul(rel, -CD * (rh / RHO0) * Va);
    a = add(a, drag);
    if (c.engine && airOn) a = sub(a, drag);
    if (P.g && c.wings) a = add(a, mul(up, Math.min(3, (rh / RHOC) * Va * Va / (VREF * VREF)) * gm));
  }
  if (c.engine && !airOn && c.kind === 'plane') {
    const rel = sub(v, spinVel(sim, r));
    if (len(rel) > 0.1) a = add(a, mul(norm(rel), ROCKET_A));
  }
  return a;
}
function rk4(sim, c, dt) {
  const r = c.r, v = c.v, f = (rr, vv) => accelFree(sim, c, rr, vv);
  const a1 = f(r, v);
  const r2 = add(r, mul(v, dt / 2)), v2 = add(v, mul(a1, dt / 2)), a2 = f(r2, v2);
  const r3 = add(r, mul(v2, dt / 2)), v3 = add(v, mul(a2, dt / 2)), a3 = f(r3, v3);
  const r4 = add(r, mul(v3, dt)), v4 = add(v, mul(a3, dt)), a4 = f(r4, v4);
  c.r = add(r, mul(add(add(v, mul(add(v2, v3), 2)), v4), dt / 6));
  c.v = add(v, mul(add(add(a1, mul(add(a2, a3), 2)), a4), dt / 6));
}
function orbitInfo(r, v) {
  const rl = len(r), eps = dot(v, v) / 2 - GM / rl;
  const hv = cross(r, v), h = len(hv);
  const e = Math.sqrt(Math.max(0, 1 + 2 * eps * h * h / (GM * GM)));
  if (eps >= 0) return { bound: false, e, rp: h * h / GM / (1 + e) };
  const a = -GM / (2 * eps);
  return { bound: true, a, e, rp: a * (1 - e), ra: a * (1 + e), period: TAU * Math.sqrt(a * a * a / GM), inc: Math.acos(clamp(hv[2] / h, -1, 1)) / DEG };
}
const circV = r => Math.sqrt(GM / r), escV = r => Math.sqrt(2 * GM / r);

/* ---------- crafts ---------- */
function newCraft(sim, o) {
  const c = Object.assign({ id: 'X', kind: 'plane', color: '#fff', done: false, status: '', trail: [], landed: false, t0: sim.t, maxAlt: 0, events: [] }, o);
  sim.crafts.push(c);
  return c;
}
function pushTrail(sim, c) {
  const tr = c.trail, last = tr[tr.length - 1];
  if (last && sim.t - last.t < c.trailDt) return;
  tr.push({ p: c.r.slice(), t: sim.t });
  if (tr.length > 3000) { c.trailDt *= 2; c.trail = tr.filter((_, i) => i % 2 === 0); }
}

/* plane: o = {route, V m/s airspeed, alt m, angle deg, id, color} */
function launchPlane(sim, o) {
  const P = sim.P;
  const cruise = !!(P.g && P.a && P.e && o.alt <= 30000);
  const c = newCraft(sim, Object.assign({ kind: 'plane', s: 0, cruise, engine: !!P.e, wings: true, trailDt: 5 }, o));
  const uE = o.route.at(0), tE = o.route.tan(0), al = cruise ? 0 : (o.angle || 0) * DEG;
  const rE = mul(uE, R + o.alt);
  let vE = add(mul(tE, o.V * Math.cos(al)), mul(uE, o.V * Math.sin(al)));
  vE = add(vE, windAt(P, uE));
  c.r = toI(sim, rE, sim.t);
  c.v = add(toI(sim, vE, sim.t), spinVel(sim, c.r));
  c.maxAlt = o.alt;
  c.dest = o.route.b; c.start = o.route.a;
  c.trail.push({ p: c.r.slice(), t: sim.t });
  return c;
}
/* cannonball: o = {lat, lon, alt, speed m/s, az deg from north, el deg} */
function launchBall(sim, o) {
  const c = newCraft(sim, Object.assign({ kind: 'ball', engine: false, wings: false, trailDt: 4 }, o));
  const u = llUnit(o.lat, o.lon), az = (o.az ?? 90) * DEG, el = (o.el || 0) * DEG;
  const d = add(add(mul(northOf(u), Math.cos(az) * Math.cos(el)), mul(eastOf(u), Math.sin(az) * Math.cos(el))), mul(u, Math.sin(el)));
  c.r = toI(sim, mul(u, R + o.alt), sim.t);
  c.v = add(toI(sim, mul(d, o.speed), sim.t), spinVel(sim, c.r));
  c.maxAlt = o.alt;
  c.start = u;
  c.trail.push({ p: c.r.slice(), t: sim.t });
  return c;
}

/* rocket that carries a satellite: o = {site:{lat,lon,name}, target:{alt, inc, name}} */
const ASCENT_T = 540, ASCENT_RANGE = 1900e3;
function launchRocket(sim, o) {
  const c = newCraft(sim, Object.assign({ kind: 'rocket', phase: 'ascent', engine: false, wings: false, trailDt: 3, tL: sim.t }, o));
  c.parkAlt = o.target.alt < 2000e3 ? o.target.alt : 250e3;
  c.siteU = llUnit(o.site.lat, o.site.lon);
  const phi = o.site.lat * DEG, inc = o.target.inc * DEG;
  c.az = Math.abs(o.target.inc) >= Math.abs(o.site.lat) + 0.5 ? Math.asin(clamp(Math.cos(inc) / Math.cos(phi), -1, 1)) : Math.PI / 2;
  c.r = toI(sim, mul(c.siteU, R), sim.t);
  c.v = spinVel(sim, c.r);
  c.speed = len(c.v);
  c.spinGift = len(c.v);
  c.u = 0; c.flame = 1;
  c.stagesShown = { booster: true, fairing: true, stage2: true };
  c.trail.push({ p: c.r.slice(), t: sim.t });
  logEv(sim, c, 'Liftoff from ' + o.site.name);
  return c;
}
function spawnDebris(sim, parent, part, vfac) {
  /* real speed along the path: scale the direction of travel to the reported speed */
  const dir = len(parent.v) > 1 ? norm(parent.v) : norm(parent.r);
  const v = mul(dir, parent.speed * vfac);
  const d = newCraft(sim, { id: parent.id + '-' + part, kind: 'debris', part, parent: parent.id, engine: false, wings: false, trailDt: 1e9, born: sim.t });
  d.r = parent.r.slice(); d.v = v; d.maxAlt = len(d.r) - R;
  return d;
}
function logEv(sim, c, text) { c.events.push({ t: sim.t, text }); sim.events.push({ t: sim.t, text, id: c.id }); }
function ascentPos(sim, c, t) {
  const u = clamp((t - c.tL) / ASCENT_T, 0, 1);
  const pad = toI(sim, c.siteU, t);
  const e = eastOf(pad), n = northOf(pad);
  const d = add(mul(n, Math.cos(c.az)), mul(e, Math.sin(c.az)));
  const ax = norm(cross(pad, d));
  const psi = ASCENT_RANGE / R * Math.pow(u, 2.5), h = c.parkAlt * (3 * u * u - 2 * u * u * u);
  return { r: mul(rodrigues(pad, ax, psi), R + h), ax, u };
}

function stepCraft(sim, c, dt) {
  if (c.done) return;
  const P = sim.P;
  if (c.kind === 'plane' && c.cruise && !c.landed) {
    const uE = c.route.at(c.s), tE = c.route.tan(c.s);
    const w = windAt(P, uE), gs = c.V + dot(w, tE);
    c.gs = gs; c.windAlong = dot(w, tE);
    c.s = Math.min(c.route.L, c.s + gs * dt);
    const u2 = c.route.at(c.s), t2 = c.route.tan(c.s);
    c.r = toI(sim, mul(u2, R + c.alt), sim.t + dt);
    c.v = add(toI(sim, mul(t2, gs), sim.t + dt), spinVel(sim, c.r));
    if (c.s >= c.route.L - 1) { c.arrived = true; c.arriveT = sim.t + dt - c.t0; c.status = 'Arrived'; c.done = true; c.fixedE = mul(u2, R + c.alt); }
    return;
  }
  if (c.kind === 'rocket' && c.phase === 'ascent') {
    const t2 = sim.t + dt;
    const a = ascentPos(sim, c, t2);
    const prev = c.r;
    c.r = a.r;
    c.u = a.u;
    const vc = circV(len(c.r));
    c.speed = c.spinGift + (vc - c.spinGift) * Math.pow(a.u, 1.6);
    c.v = mul(norm(sub(c.r, prev)), c.speed);
    const mark = (k, at, text, fn) => { if (!c[k] && a.u >= at) { c[k] = true; logEv(sim, c, text); fn && fn(); } };
    mark('_mq', 0.12, 'Max Q: the rocket pushes through the thickest air');
    mark('_sep', 0.32, 'Stage 1 separates and falls back to Earth', () => { c.stagesShown.booster = false; spawnDebris(sim, c, 'booster', 0.97); });
    mark('_fair', 0.46, 'Nose cone opens: we are above the air now', () => { c.stagesShown.fairing = false; spawnDebris(sim, c, 'fairingL', 0.995); spawnDebris(sim, c, 'fairingR', 0.993); });
    if (a.u >= 1) {
      c.phase = c.parkAlt < c.target.alt - 1000 ? 'park' : 'final';
      c.v = mul(norm(cross(a.ax, c.r)), vc);
      c.speed = len(c.v);
      c.flame = 0; c.stagesShown.stage2 = false;
      spawnDebris(sim, c, 'stage2', 0.9985);
      c.orbitT = sim.t + dt;
      logEv(sim, c, c.phase === 'park' ? 'Engine off. Parking orbit at ' + Math.round(c.parkAlt / 1000) + ' km, waiting to cross the equator' : 'Engine off. In orbit at ' + Math.round(c.parkAlt / 1000) + ' km: falling around Earth');
    }
    return;
  }
  const prevR = c.r, prevRad = dot(c.r, c.v);
  rk4(sim, c, dt);
  c.speed = len(c.v);
  const rl = len(c.r);
  c.maxAlt = Math.max(c.maxAlt, rl - R);
  if (c.kind === 'rocket') {
    if (c.phase === 'park' && prevR[2] * c.r[2] <= 0 && sim.t - c.orbitT > 60) {
      const ra = R + c.target.alt;
      const vt = Math.sqrt(GM * (2 / rl - 2 / (rl + ra)));
      c.v = mul(norm(c.v), vt); c.phase = 'transfer'; c.flame = 1; c.flameT = sim.t;
      logEv(sim, c, 'Transfer burn at the equator: speed up to ' + (vt / 1000).toFixed(1) + ' km/s to swing out to ' + Math.round(c.target.alt / 1000).toLocaleString() + ' km');
    } else if (c.phase === 'transfer' && prevRad > 0 && dot(c.r, c.v) <= 0) {
      const vc = circV(rl);
      c.v = c.target.inc < 1 ? mul(eastOf(norm(c.r)), vc) : mul(norm(c.v), vc);
      c.phase = 'final'; c.flame = 1; c.flameT = sim.t;
      logEv(sim, c, 'Circularise at the top of the climb: ' + (vc / 1000).toFixed(2) + ' km/s' + (c.target.inc < 1 ? ', and turn the orbit flat over the equator' : ''));
    }
    if (c.flame && c.flameT && sim.t - c.flameT > 120) c.flame = 0;
  }
  if (P.g && rl < R) {
    c.r = mul(c.r, R / rl);
    c.landed = true; c.done = true; c.status = 'Landed';
    c.fixedE = toE(sim, c.r, sim.t + dt);
    c.landT = sim.t + dt - c.t0;
    if (c.dest) c.missBy = arcDist(c.fixedE, c.dest);
    c.landFrom = c.start ? arcDist(c.fixedE, c.start) : null;
  } else if (rl > 12 * R) { c.done = true; c.status = 'Gone into space'; }
  if (c.dest && !c.passed && rl - R < 60000) {
    const sp = toE(sim, c.r, sim.t + dt);
    if (arcDist(sp, c.dest) < 40000) { c.passed = true; c.arriveT = sim.t + dt - c.t0; }
  }
}
/* fixed things ride along with the Earth */
function stepFixed(sim, c) { if (c.fixedE) { c.r = toI(sim, c.fixedE, sim.t); c.v = spinVel(sim, c.r); } }

function stepSim(sim, dt) {
  for (const c of sim.crafts) { if (!c.done) stepCraft(sim, c, dt); }
  sim.t += dt;
  for (const c of sim.crafts) { if (c.done) stepFixed(sim, c); pushTrail(sim, c); }
}
function advanceSim(sim, simDt) {
  let h = 2;
  for (const c of sim.crafts) {
    if (c.done) continue;
    if (c.kind === 'plane' && !c.cruise) h = Math.min(h, sim.P.a ? 0.25 : 1);
    if (c.kind === 'ball') h = Math.min(h, 1);
    if (c.kind === 'rocket') h = Math.min(h, c.phase === 'ascent' ? 0.5 : (len(c.r) > 3 * R ? 20 : 4));
    if (c.kind === 'debris') h = Math.min(h, 0.5);
    if (c.kind === 'plane' && c.cruise) h = Math.min(h, 5);
  }
  const n = Math.max(1, Math.min(3000, Math.ceil(simDt / h)));
  const d = simDt / n;
  for (const c of sim.crafts) c.trailDt = c.trailDt || 2;
  for (let i = 0; i < n; i++) stepSim(sim, d);
}

/* readouts */
function readout(sim, c) {
  const rl = len(c.r), up = mul(c.r, 1 / rl), alt = rl - R;
  const vg = sub(c.v, spinVel(sim, c.r));
  const ground = c.landed ? 0 : len(vg), space = len(c.v);
  const latlon = unitLL(toE(sim, up, sim.t));
  const out = { alt, ground, space, lat: latlon[0], lon: latlon[1] };
  if (c.kind === 'plane' && sim.P.g) {
    const g = GM / (rl * rl);
    const vh = sub(c.v, mul(up, dot(c.v, up)));
    const v0 = sim.om * rl * Math.cos(latlon[0] * DEG);
    if (c.cruise && !c.done) {
      out.weight = 100 - (dot(vh, vh) - v0 * v0) / (rl * g) * 100;
      const lat = latlon[0] * DEG;
      out.coriolis = 2 * sim.om * len(vg) * Math.sin(lat) / g * 100;
    } else if (c.landed || c.done) out.weight = 100;
    else if (!sim.P.a || alt > ATM_TOP) out.weight = 0;
  }
  if (c.kind !== 'plane' || !c.cruise) out.orbit = sim.P.g ? orbitInfo(c.r, c.v) : null;
  if (c.route) {
    if (c.cruise) { out.progress = c.s / c.route.L; out.left = c.route.L - c.s; }
    else {
      const sp = toE(sim, up, sim.t);
      const fromStart = arcDist(sp, c.start), toDest = arcDist(sp, c.dest);
      out.progress = clamp(fromStart / c.route.L, 0, 1.5) * (toDest < c.route.L + 1000 ? 1 : -1);
      out.left = toDest;
    }
  }
  return out;
}

if (typeof module !== 'undefined') module.exports = { R, GM, W0, CL, DEG, ATM_TOP, llUnit, unitLL, eastOf, northOf, greatCircle, parallelRoute, headingRoute, makeSim, launchPlane, launchBall, launchRocket, advanceSim, stepSim, readout, orbitInfo, circV, escV, toE, toI, len, arcDist, jetProfile };
