/* ================= ORBIT DESIGN: Kepler propagation, Lambert transfers, real mission timelines ================= */
const MU_E = GM, MU_M = 4.9048695e12, MU_S = 1.32712440018e20, R_M = 1737.4e3;

/* Stumpff functions */
function stumC(z) { if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z; if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z; return 0.5 - z / 24; }
function stumS(z) { if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); } if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); } return 1 / 6 - z / 120; }
/* universal-variable Kepler: state after dt seconds (dt may be negative) */
function kepState(r0, v0, dt, mu) {
  const r0m = len(r0), v0m = len(v0), vr0 = dot(r0, v0) / r0m, alpha = 2 / r0m - v0m * v0m / mu, sq = Math.sqrt(mu);
  let x = alpha > 1e-12 ? sq * alpha * dt : sq * dt / r0m;
  for (let i = 0; i < 100; i++) {
    const z = alpha * x * x, C = stumC(z), S = stumS(z);
    const F = r0m * vr0 / sq * x * x * C + (1 - alpha * r0m) * x * x * x * S + r0m * x - sq * dt;
    const dF = r0m * vr0 / sq * x * (1 - alpha * x * x * S) + (1 - alpha * r0m) * x * x * C + r0m;
    const dx = F / dF; x -= dx;
    if (Math.abs(dx) < 1e-9 * Math.max(1, Math.abs(x))) break;
  }
  const z = alpha * x * x, C = stumC(z), S = stumS(z);
  const f = 1 - x * x / r0m * C, g = dt - x * x * x / sq * S;
  const r = add(mul(r0, f), mul(v0, g)), rm = len(r);
  const fd = sq / (rm * r0m) * (alpha * x * x * x * S - x), gd = 1 - x * x / rm * C;
  return [r, add(mul(r0, fd), mul(v0, gd))];
}
/* Lambert (universal variables, short way unless the normal says otherwise) */
function lambert(r1, r2, tof, mu, normal) {
  const r1m = len(r1), r2m = len(r2);
  let cosd = dot(r1, r2) / (r1m * r2m);
  let dth = Math.acos(clamp(cosd, -1, 1));
  const cz = cross(r1, r2);
  if (normal && dot(cz, normal) < 0) dth = TAU - dth;
  const A = Math.sin(dth) * Math.sqrt(r1m * r2m / (1 - Math.cos(dth)));
  const y = z => r1m + r2m + A * (z * stumS(z) - 1) / Math.sqrt(stumC(z));
  const T = z => { const yy = y(z); return (Math.pow(yy / stumC(z), 1.5) * stumS(z) + A * Math.sqrt(yy)) / Math.sqrt(mu); };
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI * 0.999;
  while (y(lo) < 0) lo += 0.1;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (T(m) < tof) lo = m; else hi = m; }
  const z = (lo + hi) / 2, yy = y(z);
  const f = 1 - yy / r1m, g = A * Math.sqrt(yy / mu), gd = 1 - yy / r2m;
  const v1 = mul(sub(r2, mul(r1, f)), 1 / g), v2 = mul(sub(mul(r2, gd), r1), 1 / g);
  return [v1, v2];
}
const ellipseSpeed = (r, rp, ra, mu) => Math.sqrt(mu * (2 / r - 2 / (rp + ra)));
const periodOf = (rp, ra, mu) => TAU * Math.sqrt(Math.pow((rp + ra) / 2, 3) / mu);
const tms = s => new Date(s).getTime();
const moonGeo = t => moonEqj(new Date(t));
/* Moon body-fixed lat/lon -> inertial (EQJ) direction at time t */
function moonSiteDir(lat, lon, t) {
  const ax = Astronomy.RotationAxis(Astronomy.Body.Moon, new Date(t));
  const N = [ax.north.x, ax.north.y, ax.north.z];
  let node = norm(cross([0, 0, 1], N));
  const pm = rodrigues(node, N, (ax.spin % 360) * DEG), east = cross(N, pm);
  const cl = Math.cos(lat * DEG);
  return norm(add(add(mul(pm, cl * Math.cos(lon * DEG)), mul(east, cl * Math.sin(lon * DEG))), mul(N, Math.sin(lat * DEG))));
}
function moonPole(t) { const ax = Astronomy.RotationAxis(Astronomy.Body.Moon, new Date(t)); return [ax.north.x, ax.north.y, ax.north.z]; }
function earthSiteECI(lat, lon, t, alt = 0) { return rotZ(mul(llUnit(lat, lon), R + alt), gmst(new Date(t))); }

/* ---- a mission is a list of segments; each gives position (geocentric EQJ metres) at time t (ms) ---- */
function seg(kind, t0, t1, fn, info) { return Object.assign({ kind, t0, t1, fn }, info || {}); }
function keplerSeg(t0, t1, r0, v0, mu, center, info) {
  return seg('orbit', t0, t1, t => { const [r] = kepState(r0, v0, (t - t0) / 1000, mu); return center ? add(r, center(t)) : r; }, Object.assign({ r0, v0, mu, center, rel: center ? (t => kepState(r0, v0, (t - t0) / 1000, mu)[0]) : null }, info));
}
/* chain orbits backward from a known orbit, burning at periapsis each time (burn keeps periapsis, changes the far point) */
function chainBack(orbit, list, mu, center, bodyR) {
  /* orbit: {t0, r0, v0} at periapsis; list: [{date, peri, apo, label}] older -> newer (excluding the known orbit) */
  const segs = [];
  let cur = orbit;
  for (let i = list.length - 1; i >= 0; i--) {
    const L = list[i];
    const rp = len(cur.r0), ra = bodyR + L.apo, P = periodOf(rp, ra, mu);
    const vp = mul(norm(cur.v0), ellipseSpeed(rp, rp, ra, mu));
    let tb = cur.t0;
    const want = tms(L.date);
    const n = Math.max(0, Math.round((tb - want) / (P * 1000)));
    const t0 = tb - n * P * 1000;
    const st = kepState(cur.r0, vp, (t0 - tb) / 1000, mu);
    segs.unshift(keplerSeg(t0, cur.t0, st[0], st[1], mu, center, { label: L.label, mu, peri: rp - bodyR, apo: L.apo }));
    cur = { t0, r0: st[0], v0: st[1] };
  }
  return { segs, first: cur };
}
function smoothBlend(a, b, t0, t1) { return t => { const u = clamp((t - t0) / (t1 - t0), 0, 1), k = u * u * (3 - 2 * u); return add(mul(a(t), 1 - k), mul(b(t), k)); }; }

/* ---------- Chandrayaan-3 (ISRO, 2023) ---------- */
function buildChandrayaan3() {
  const T = {
    launch: tms('2023-07-14T09:05:17Z'), tli: tms('2023-07-31T18:30:00Z'), loi: tms('2023-08-05T13:45:00Z'),
    land: tms('2023-08-23T12:33:00Z')
  };
  const site = { lat: -69.373, lon: 32.319 };
  const pdT = T.land - 19 * 60e3;
  /* landing plane: polar orbit through the site (as it will be at landing time) */
  const siteD = moonSiteDir(site.lat, site.lon, T.land), pole = moonPole(T.land);
  const n = norm(cross(siteD, pole));
  /* landing orbit 25 x 134 km with low point 24.7 deg before the site at powered descent */
  const rp = R_M + 25e3, ra = R_M + 134e3;
  const pDir = rodrigues(siteD, n, -24.7 * DEG);
  const vDir = norm(cross(n, pDir));
  const landOrbit = { t0: pdT, r0: mul(pDir, rp), v0: mul(vDir, ellipseSpeed(rp, rp, ra, MU_M)) };
  /* LOI orbit 164 x 18,074 km, low point in the landing plane on the Earth-facing side */
  const mg = moonGeo(T.loi), lead = norm(sub(moonGeo(T.loi + 600e3), mg));
  const dIn = norm(sub(lead, mul(n, dot(lead, n))));
  const rpL = R_M + 164e3, raL = R_M + 18074e3;
  const loiOrbit = { t0: T.loi, r0: mul(dIn, rpL), v0: mul(norm(cross(n, dIn)), ellipseSpeed(rpL, rpL, raL, MU_M)) };
  /* forward chain of lunar orbit reductions, burns at the low point */
  const steps = [
    { date: '2023-08-06T18:00:00Z', peri: 170, apo: 4313, label: 'Orbit lowered to 170 × 4,313 km' },
    { date: '2023-08-09T08:30:00Z', peri: 174, apo: 1437, label: 'Orbit lowered to 174 × 1,437 km' },
    { date: '2023-08-14T06:30:00Z', peri: 150, apo: 177, label: 'Near-circular orbit 150 × 177 km' },
    { date: '2023-08-16T03:30:00Z', peri: 153, apo: 163, label: 'Final circular orbit 153 × 163 km' }
  ];
  const moonC = t => moonGeo(t);
  const segs = [];
  let cur = loiOrbit, curApo = 18074;
  for (const s of steps) {
    const P = periodOf(len(cur.r0), R_M + curApo * 1e3, MU_M) * 1000;
    const k = Math.max(1, Math.round((tms(s.date) - cur.t0) / P));
    const tb = cur.t0 + k * P;
    const st = kepState(cur.r0, cur.v0, (tb - cur.t0) / 1000, MU_M);
    segs.push(keplerSeg(cur.t0, tb, cur.r0, cur.v0, MU_M, moonC, { label: curApo === 18074 ? 'Captured by the Moon: 164 × 18,074 km' : null }));
    const rpN = len(st[0]), raN = R_M + s.apo * 1e3;
    cur = { t0: tb, r0: st[0], v0: mul(norm(st[1]), ellipseSpeed(rpN, rpN, raN, MU_M)), label: s.label };
    curApo = s.apo;
    segs[segs.length - 1].nextLabel = s.label;
  }
  /* switch to the landing orbit where the two orbits cross (same plane, find the moment their angles match) */
  const angOf = (r) => Math.atan2(dot(r, cross(n, dIn)), dot(r, dIn));
  let best = null;
  for (let t = tms('2023-08-17T00:00:00Z'); t < tms('2023-08-21T00:00:00Z'); t += 60e3) {
    const a1 = angOf(kepState(cur.r0, cur.v0, (t - cur.t0) / 1000, MU_M)[0]), a2 = angOf(kepState(landOrbit.r0, landOrbit.v0, (t - landOrbit.t0) / 1000, MU_M)[0]);
    const d = Math.abs(((a1 - a2 + 3 * Math.PI) % TAU) - Math.PI);
    if (!best || d < best.d) best = { t, d };
  }
  const tSw = best.t;
  segs.push(keplerSeg(cur.t0, tSw, cur.r0, cur.v0, MU_M, moonC, {}));
  const lo = landOrbit;
  const landSeg = keplerSeg(tSw, pdT, ...kepState(lo.r0, lo.v0, (tSw - pdT) / 1000, MU_M), MU_M, moonC, { label: 'Lander Vikram separates and drops to 25 × 134 km' });
  const prevFn = segs[segs.length - 1].fn, landFn = landSeg.fn;
  landSeg.fn = t => t < tSw + 240e3 ? smoothBlend(prevFn, landFn, tSw, tSw + 240e3)(t) : landFn(t);
  segs.push(landSeg);
  /* powered descent: follow the orbit plane down to the site */
  const descent = seg('descent', pdT, T.land, t => {
    const u = clamp((t - pdT) / (T.land - pdT), 0, 1);
    const k = 1 - Math.pow(1 - u, 1.6);
    const sd = moonSiteDir(site.lat, site.lon, t);
    const start = norm(kepState(lo.r0, lo.v0, 0, MU_M)[0]);
    const ang = Math.acos(clamp(dot(start, sd), -1, 1));
    const ax = norm(cross(start, sd));
    const dir = rodrigues(start, ax, ang * k);
    const alt = 25e3 * Math.pow(1 - u, 1.3) + 2;
    return add(moonC(t), mul(dir, R_M + alt));
  }, { label: 'Powered descent: 30 km to the surface in 19 minutes' });
  const surface = seg('surface', T.land, T.land + 14 * 86400e3, t => add(moonC(t), mul(moonSiteDir(site.lat, site.lon, t), R_M + 2)), { label: 'Touchdown near the lunar south pole' });
  /* transfer from Earth: Lambert from a low point to the LOI point */
  const tgt = add(moonGeo(T.loi), loiOrbit.r0);
  const hMoon = norm(cross(moonGeo(T.loi), sub(moonGeo(T.loi + 3600e3), moonGeo(T.loi))));
  const r1 = mul(rodrigues(norm(mul(tgt, -1)), hMoon, -9 * DEG), R + 288e3);
  const [v1] = lambert(r1, tgt, (T.loi - T.tli) / 1000, MU_E, hMoon);
  const transfer = keplerSeg(T.tli, T.loi, r1, v1, MU_E, null, { label: 'Trans-lunar injection: heading for the Moon' });
  /* Earth orbits before TLI: same direction, lower speed; chain backward with perigee burns */
  const apoPre = 127609e3;
  const vPre = mul(norm(v1), Math.sqrt(MU_E * (2 / len(r1) - 2 / (len(r1) + apoPre + R))));
  const preStart = { t0: T.tli, r0: r1, v0: vPre };
  /* find the pre-TLI orbit's perigee before TLI so the backward chain burns at perigee */
  const Ppre = TAU * Math.sqrt(Math.pow(1 / (2 / len(r1) - dot(vPre, vPre) / MU_E), 3) / MU_E);
  let tPer = T.tli, best2 = Infinity;
  for (let dt = 0; dt < Ppre; dt += 60) { const r = len(kepState(r1, vPre, -dt, MU_E)[0]); if (r < best2) { best2 = r; tPer = T.tli - dt * 1000; } }
  const per0 = kepState(r1, vPre, (tPer - T.tli) / 1000, MU_E);
  const kk = Math.max(0, Math.round((tPer - tms('2023-07-25T09:30:00Z')) / (Ppre * 1000)));
  const t25 = tPer - kk * Ppre * 1000;
  const per = kepState(per0[0], per0[1], (t25 - tPer) / 1000, MU_E);
  tPer = t25;
  const earthList = [
    { date: '2023-07-15T06:30:00Z', apo: 41762e3, label: 'Orbit raised to 41,762 km' },
    { date: '2023-07-18T09:30:00Z', apo: 51400e3, label: 'Orbit raised to 51,400 km' },
    { date: '2023-07-20T09:30:00Z', apo: 71351e3, label: 'Orbit raised to 71,351 km' },
    { date: '2023-07-25T09:30:00Z', apo: 127609e3, label: 'Orbit raised to 127,609 km' }
  ];
  const back = chainBack({ t0: tPer, r0: per[0], v0: per[1] }, [{ date: '2023-07-14T09:22:00Z', apo: 36500e3, label: 'In orbit: 170 × 36,500 km' }].concat(earthList.slice(0, 3)), MU_E, null, R);
  const preSeg = keplerSeg(tPer, T.tli, per[0], per[1], MU_E, null, { label: 'Orbit raised to 127,609 km' });
  const earthSegs = back.segs.concat([preSeg]);
  const t1st = T.launch + 17 * 60e3;
  earthSegs[0].t0 = t1st;
  const launchSeg = seg('launch', T.launch, t1st, (() => { const orb = earthSegs[0]; return t => { const u = clamp((t - T.launch) / (t1st - T.launch), 0, 1); const pad = earthSiteECI(13.72, 80.23, t, 0); const tgtp = orb.fn(t1st); const k = u * u * (3 - 2 * u); const p = add(mul(pad, 1 - k), mul(tgtp, k)); const rr = len(p); return mul(p, (R + Math.sin(u * Math.PI / 2) * (len(tgtp) - R)) / rr); }; })(), { label: 'Lift-off on LVM3 from Sriharikota' });
  return { name: 'Chandrayaan-3', T, site, center: 'moon', segs: [launchSeg].concat(earthSegs, [transfer], segs, [descent, surface]), checks: { tgt, landSite: siteD } };
}
function missionPos(M, t) {
  const segs = M.segs;
  if (t <= segs[0].t0) return segs[0].fn(segs[0].t0);
  for (const s of segs) if (t >= s.t0 && t <= s.t1) return s.fn(t);
  const L = segs[segs.length - 1]; return L.fn(L.t1);
}
function missionSeg(M, t) { for (const s of M.segs) if (t >= s.t0 && t <= s.t1) return s; return null; }


/* generic body-fixed site direction (Moon, Mars ...) */
function siteDir(body, lat, lon, t) {
  const ax = Astronomy.RotationAxis(Astronomy.Body[body], new Date(t));
  const N = [ax.north.x, ax.north.y, ax.north.z];
  const node = norm(cross([0, 0, 1], N));
  const pm = rodrigues(node, N, (ax.spin % 360) * DEG), east = cross(N, pm);
  const cl = Math.cos(lat * DEG);
  return norm(add(add(mul(pm, cl * Math.cos(lon * DEG)), mul(east, cl * Math.sin(lon * DEG))), mul(N, Math.sin(lat * DEG))));
}
/* lunar part shared by Apollo-style missions: orbit list in one plane, switch to a landing orbit, descend */
function lunarPart(o) {
  const moonC = t => moonGeo(t);
  const siteD = moonSiteDir(o.site.lat, o.site.lon, o.land);
  const pole = moonPole(o.land);
  let n = o.plane === 'polar' ? norm(cross(siteD, pole)) : norm(cross(siteD, norm(cross(pole, siteD))));
  if (o.westward) n = mul(n, -1);
  const mg = moonGeo(o.loi), lead = norm(sub(moonGeo(o.loi + 600e3), mg));
  const dIn = norm(sub(lead, mul(n, dot(lead, n))));
  const rp0 = R_M + o.orbits[0].peri * 1e3, ra0 = R_M + o.orbits[0].apo * 1e3;
  const loiOrbit = { t0: o.loi, r0: mul(dIn, rp0), v0: mul(norm(cross(n, dIn)), ellipseSpeed(rp0, rp0, ra0, MU_M)) };
  const segs = [];
  let cur = loiOrbit, curApo = o.orbits[0].apo, label = o.orbits[0].label;
  for (const s of o.orbits.slice(1)) {
    const P = periodOf(len(cur.r0), R_M + curApo * 1e3, MU_M) * 1000;
    const k = Math.max(1, Math.round((tms(s.date) - cur.t0) / P));
    const tb = cur.t0 + k * P;
    const st = kepState(cur.r0, cur.v0, (tb - cur.t0) / 1000, MU_M);
    segs.push(keplerSeg(cur.t0, tb, cur.r0, cur.v0, MU_M, moonC, { label }));
    const rpN = len(st[0]), raN = R_M + s.apo * 1e3;
    cur = { t0: tb, r0: st[0], v0: mul(norm(st[1]), ellipseSpeed(rpN, rpN, raN, MU_M)) };
    curApo = s.apo; label = s.label;
  }
  const pdT = o.land - o.descentMin * 60e3;
  const rpL = R_M + o.landOrbit.peri * 1e3, raL = R_M + o.landOrbit.apo * 1e3;
  const pDir = rodrigues(siteD, n, -o.descentDeg * DEG);
  const lo = { t0: pdT, r0: mul(pDir, rpL), v0: mul(norm(cross(n, pDir)), ellipseSpeed(rpL, rpL, raL, MU_M)) };
  const ang = r => Math.atan2(dot(r, cross(n, dIn)), dot(r, dIn));
  let best = null;
  for (let t = o.switchFrom; t < o.switchTo; t += 30e3) {
    const d = Math.abs(((ang(kepState(cur.r0, cur.v0, (t - cur.t0) / 1000, MU_M)[0]) - ang(kepState(lo.r0, lo.v0, (t - pdT) / 1000, MU_M)[0]) + 3 * Math.PI) % TAU) - Math.PI);
    const score = d + (o.switchPref ? Math.abs(t - o.switchPref) / 3.6e6 * 0.004 : 0);
    if (!best || score < best.s) best = { t, d, s: score };
  }
  const tSw = best.t;
  const parking = { r0: cur.r0, v0: cur.v0, t0: cur.t0 };
  segs.push(keplerSeg(cur.t0, tSw, cur.r0, cur.v0, MU_M, moonC, { label }));
  const ls = keplerSeg(tSw, pdT, ...kepState(lo.r0, lo.v0, (tSw - pdT) / 1000, MU_M), MU_M, moonC, { label: o.landOrbit.label });
  const pf = segs[segs.length - 1].fn, lf = ls.fn; ls.fn = t => t < tSw + 240e3 ? smoothBlend(pf, lf, tSw, tSw + 240e3)(t) : lf(t);
  segs.push(ls);
  const start = norm(lo.r0);
  segs.push(seg('descent', pdT, o.land, t => {
    const u = clamp((t - pdT) / (o.land - pdT), 0, 1), k = 1 - Math.pow(1 - u, 1.6);
    const sd = moonSiteDir(o.site.lat, o.site.lon, t);
    const a = Math.acos(clamp(dot(start, sd), -1, 1)), ax = norm(cross(start, sd));
    return add(moonC(t), mul(rodrigues(start, ax, a * k), R_M + o.landOrbit.peri * 1e3 * Math.pow(1 - u, 1.3) + 2));
  }, { label: o.descentLabel }));
  return { segs, loiOrbit, parking, n, site: o.site };
}
/* ---------- Apollo 11 (NASA, 1969) ---------- */
function buildApollo11() {
  const T = { launch: tms('1969-07-16T13:32:00Z'), tli: tms('1969-07-16T16:22:13Z'), loi: tms('1969-07-19T17:21:50Z'), land: tms('1969-07-20T20:17:40Z'), liftoff: tms('1969-07-21T17:54:00Z'), tei: tms('1969-07-22T04:55:42Z'), entry: tms('1969-07-24T16:35:05Z'), splash: tms('1969-07-24T16:50:35Z') };
  const site = { lat: 0.67408, lon: 23.47297 };
  const L = lunarPart({ site, land: T.land, loi: T.loi, plane: 'equatorial', westward: true,
    orbits: [{ peri: 111, apo: 314, label: 'Lunar orbit 111 × 314 km' }, { date: '1969-07-19T21:43:36Z', peri: 100, apo: 122, label: 'Orbit circularised: 100 × 122 km' }],
    landOrbit: { peri: 15, apo: 110, label: 'Eagle undocks and drops to 15 × 110 km' }, descentMin: 12.5, descentDeg: 15, descentLabel: 'Powered descent: Armstrong takes manual control near the end',
    switchFrom: tms('1969-07-19T23:00:00Z'), switchTo: tms('1969-07-20T19:40:00Z'), switchPref: tms('1969-07-20T18:30:00Z') });
  const moonC = t => moonGeo(t);
  /* transfer from Earth */
  const tgt = add(moonGeo(T.loi), L.loiOrbit.r0);
  const hMoon = norm(cross(moonGeo(T.loi), sub(moonGeo(T.loi + 3600e3), moonGeo(T.loi))));
  const r1 = mul(rodrigues(norm(mul(tgt, -1)), hMoon, -10 * DEG), R + 185e3);
  const [v1] = lambert(r1, tgt, (T.loi - T.tli) / 1000, MU_E, hMoon);
  const transfer = keplerSeg(T.tli, T.loi, r1, v1, MU_E, null, { label: 'Trans-lunar injection: the third stage sends Apollo to the Moon' });
  /* circular parking orbit through r1 */
  const vdir = norm(sub(v1, mul(norm(r1), dot(v1, norm(r1)))));
  const park = keplerSeg(T.launch + 12 * 60e3, T.tli, ...kepState(r1, mul(vdir, circV(len(r1))), -(T.tli - T.launch - 12 * 60e3) / 1000, MU_E), MU_E, null, { label: 'Parking orbit 185 km: checking the spacecraft' });
  const launch = seg('launch', T.launch, T.launch + 12 * 60e3, t => { const u = clamp((t - T.launch) / 720e3, 0, 1), k = u * u * (3 - 2 * u); const pad = earthSiteECI(28.608, -80.604, t); const p = add(mul(pad, 1 - k), mul(park.fn(T.launch + 720e3), k)); return mul(norm(p), R + 185e3 * Math.sin(u * Math.PI / 2)); }, { label: 'Lift-off on Saturn V from Kennedy Space Center' });
  /* on the surface, then back to orbit */
  const surf = seg('surface', T.land, T.liftoff, t => add(moonC(t), mul(moonSiteDir(site.lat, site.lon, t), R_M + 2)), { label: '"The Eagle has landed." First steps on the Moon' });
  const csm = L.parking;
  const csmFn = t => add(moonC(t), kepState(csm.r0, csm.v0, (t - csm.t0) / 1000, MU_M)[0]);
  const ascent = seg('ascent', T.liftoff, T.liftoff + 7 * 60e3, t => { const u = clamp((t - T.liftoff) / 420e3, 0, 1); return smoothBlend(surf.fn, csmFn, T.liftoff, T.liftoff + 420e3)(t); }, { label: 'Eagle lifts off and climbs back to Columbia' });
  const orbitBack = seg('orbit', T.liftoff + 7 * 60e3, T.tei, csmFn, { label: 'Docked with Columbia in lunar orbit' });
  /* trans-Earth injection: Lambert from lunar orbit to the entry point over the Pacific */
  const entryP = earthSiteECI(5.5, 175.0, T.entry, 122e3);
  const r2 = csmFn(T.tei);
  const [vt] = lambert(r2, entryP, (T.entry - T.tei) / 1000, MU_E, mul(hMoon, 1));
  const home = keplerSeg(T.tei, T.entry, r2, vt, MU_E, null, { label: 'Trans-Earth injection: heading home' });
  const splashD = t => earthSiteECI(13.30, -169.15, t, 0);
  const reentry = seg('reentry', T.entry, T.splash, t => { const u = clamp((t - T.entry) / (T.splash - T.entry), 0, 1); const a = earthSiteECI(5.5, 175.0, t, 0), b = splashD(t); const k = 1 - Math.pow(1 - u, 2.2); const dir = norm(add(mul(norm(a), 1 - k), mul(norm(b), k))); return mul(dir, R + 122e3 * Math.pow(1 - u, 1.8)); }, { label: 'Re-entry at 11 km/s: the heat shield glows at 2,700 °C' });
  const sea = seg('splash', T.splash, T.splash + 3 * 86400e3, splashD, { label: 'Splashdown in the Pacific' });
  return { name: 'Apollo 11', T, site, center: 'moon', segs: [launch, park, transfer].concat(L.segs, [surf, ascent, orbitBack, home, reentry, sea]) };
}
/* ---------- Perseverance to Mars (NASA, 2020-21) ---------- */
function marsSite(lat, lon, t) { return siteDir('Mars', lat, lon, t); }
function buildPerseverance() {
  const T = { launch: tms('2020-07-30T11:50:00Z'), arrive: tms('2021-02-18T20:48:00Z'), land: tms('2021-02-18T20:55:00Z') };
  const site = { lat: 18.4447, lon: 77.4508 };
  const hE = t => helioEqj('Earth', new Date(t)), hM = t => helioEqj('Mars', new Date(t));
  const RMARS = BODY_R.Mars;
  const r1 = hE(T.launch + 86400e3), r2 = add(hM(T.arrive), mul(marsSite(site.lat, site.lon, T.land), RMARS + 125e3));
  const nE = norm(cross(hE(T.launch), sub(hE(T.launch + 86400e3), hE(T.launch))));
  const [v1] = lambert(r1, r2, (T.arrive - T.launch - 86400e3) / 1000, MU_S, nE);
  const cruise = t => kepState(r1, v1, (t - T.launch - 86400e3) / 1000, MU_S)[0];
  const geo = h => (t => sub(h(t), hE(t)));
  const launch = seg('launch', T.launch, T.launch + 86400e3, t => { const u = clamp((t - T.launch) / 86400e3, 0, 1), k = Math.pow(u, 0.6); const pad = earthSiteECI(28.5, -80.6, t); const c = sub(cruise(T.launch + 86400e3), hE(t)); return add(mul(pad, 1 - k), mul(c, k)); }, { label: 'Lift-off on Atlas V, escaping Earth at 11 km/s' });
  const transfer = seg('helio', T.launch + 86400e3, T.arrive, geo(cruise), { label: 'Cruise: 7 months and 470 million km around the Sun', helio: cruise });
  const edl = seg('edl', T.arrive, T.land, t => { const u = clamp((t - T.arrive) / (T.land - T.arrive), 0, 1); const s = marsSite(site.lat, site.lon, t); return add(sub(hM(t), hE(t)), mul(s, RMARS + 125e3 * Math.pow(1 - u, 1.5) + 2)); }, { label: '"Seven minutes of terror": heat shield, parachute, sky crane' });
  const surf = seg('surface', T.land, T.land + 30 * 86400e3, t => add(sub(hM(t), hE(t)), mul(marsSite(site.lat, site.lon, t), RMARS + 2)), { label: 'Landed in Jezero Crater' });
  return { name: 'Perseverance', T, site, center: 'mars', helioPath: cruise, segs: [launch, transfer, edl, surf] };
}
/* next Mars launch windows: Mars about 44 degrees ahead of Earth */
function marsWindows(from, count = 3) {
  const out = []; let t = from.getTime(), prev = null;
  const phase = t => { const e = helioEqj('Earth', new Date(t)), m = helioEqj('Mars', new Date(t)); return Math.atan2(cross(e, m)[2], dot(e, m)) / DEG; };
  for (let i = 0; i < 365 * 12 && out.length < count; i++, t += 86400e3) { const p = phase(t); if (prev !== null && prev > 44 && p <= 44) out.push(new Date(t)); prev = p; }
  return out;
}

if (typeof module !== 'undefined') module.exports = { kepState, lambert, buildChandrayaan3, missionPos, missionSeg, MU_M, R_M };
