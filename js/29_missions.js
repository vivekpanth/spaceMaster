/* ================= MISSIONS: draw real trajectories built in 27_orbits.js ================= */
const MV = { M: null, frame: 'auto' };
const MISSION_BUILDERS = { cy3: () => buildChandrayaan3(), a11: () => buildApollo11(), m20: () => buildPerseverance() };
const MISSION_CACHE = {};
function getMission(id) { return MISSION_CACHE[id] || (MISSION_CACHE[id] = MISSION_BUILDERS[id]()); }

function sampleMission(M) {
  const T = [], P = [], Mr = [], H = [];
  for (const s of M.segs) {
    let t = s.t0;
    const end = Math.min(s.t1, s.kind === 'surface' || s.kind === 'splash' ? s.t0 + 3600e3 : s.t1);
    while (t <= end) {
      const p = s.fn(t);
      T.push(t); P.push(p);
      const mg = moonGeo(t); Mr.push(sub(p, mg));
      if (M.helioPath) H.push(add(p, helioEqj('Earth', new Date(t))));
      let dt;
      if (s.kind === 'orbit' || s.kind === 'helio') {
        const c = s.center ? mg : (s.kind === 'helio' ? null : [0, 0, 0]);
        const q = s.fn(t + 20e3);
        if (s.kind === 'helio') dt = 6 * 3600e3;
        else { const rr = len(sub(p, c)), vv = len(sub(sub(q, s.center ? moonGeo(t + 20e3) : c), sub(p, c))) / 20; dt = clamp(0.035 * rr / Math.max(vv, 1), 10, 21600) * 1000; }
      } else dt = 15e3;
      t += dt;
    }
  }
  return { T, P, Mr, H };
}
function buildCraftModel(kind) {
  const g = new THREE.Group();
  const m = buildSatellite(); m.scale.setScalar(0.9); g.add(m);
  const glow = sprite(GLOW_SOFT, '#ffffff', 1.8, 0.5); g.add(glow);
  const heat = sprite(GLOW_SOFT, '#ff7a2a', 4.5, 0); g.add(heat);
  g.userData = { heat, glow };
  return g;
}
function startMission(id) {
  stopMission();
  const M = getMission(id);
  MV.M = M; MV.id = id;
  MV.S = sampleMission(M);
  MV.rib = new Ribbon(5000, '#ffcf6b', 2.2, { fade: 0.15, opacity: 0.95 }); MV.rib.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); E.sky.add(MV.rib.mesh);
  MV.ribH = new Ribbon(1500, '#ffcf6b', 2.2, { fade: 0.15, opacity: 0.95 }); MV.ribH.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); (U.orbitsG || E.sky).add(MV.ribH.mesh);
  MV.craft = buildCraftModel(); E.sky.add(MV.craft);
  MV.marker = sprite(GLOW_SOFT, '#ffcf6b', 1, 1); E.sky.add(MV.marker);
  MV.label = Labels.add('', 'craft', () => MV.marker.getWorldPosition(new V3()), { occlude: true }); MV.label.el.style.setProperty('--c', '#ffcf6b');
  MV.siteMk = sprite(GLOW_SOFT, '#7cf29a', 1, 1); E.sky.add(MV.siteMk);
  MV.siteLbl = Labels.add('<b>' + (M.name === 'Perseverance' ? 'Jezero Crater' : M.name === 'Apollo 11' ? 'Tranquility Base' : 'Shiv Shakti point') + '</b><span>landing site</span>', 'flag', () => MV.siteMk.visible ? MV.siteMk.getWorldPosition(new V3()) : null, { occlude: true });
  MV.siteLbl.el.style.setProperty('--c', '#7cf29a');
  MV.lastSeg = null;
  MV.milestones = M.segs.filter(s => s.label).map(s => ({ t: s.t0, label: s.label }));
}
function stopMission() {
  if (!MV.M) return;
  E.sky.remove(MV.rib.mesh, MV.craft, MV.marker, MV.siteMk); MV.rib.dispose();
  MV.ribH.mesh.parent && MV.ribH.mesh.parent.remove(MV.ribH.mesh); MV.ribH.dispose();
  Labels.remove(MV.label); Labels.remove(MV.siteLbl);
  if (MV.card) { MV.card.el.remove(); MV.card = null; }
  MV.M = null;
}
function missionCraftWorld() { return MV.M ? MV.marker.getWorldPosition(new V3()) : new V3(); }
function missionFrameName(t) {
  const M = MV.M; if (!M) return 'geo';
  if (MV.frame !== 'auto') return MV.frame;
  const s = missionSeg(M, t);
  if (s && s.kind === 'helio') return 'helio';
  if (M.center === 'moon') { const p = missionPos(M, t), d = len(sub(p, moonGeo(t))); if (d < 70000e3 && (!s || s.center || s.kind === 'descent' || s.kind === 'surface' || s.kind === 'ascent')) return 'moon'; }
  return 'geo';
}
function updateMission(date) {
  const M = MV.M; if (!M) return;
  const t = date.getTime();
  const p = missionPos(M, t), s = missionSeg(M, t);
  const frame = missionFrameName(t);
  MV.curFrame = frame;
  MV.craft.position.copy(p2t(p)); MV.marker.position.copy(MV.craft.position);
  const wp = MV.marker.getWorldPosition(new V3());
  MV.marker.scale.setScalar(markerSize(wp, 12));
  const cd = wp.distanceTo(camera.position);
  MV.craft.scale.setScalar(Math.max(cd * 0.04, 1e-5));
  const v = sub(missionPos(M, t + 1000), p);
  const fwd = u2t(norm(v)), up = MV.craft.position.clone().normalize();
  if (fwd.lengthSq() > 0.5) MV.craft.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), fwd.clone().negate(), up));
  const hot = s && (s.kind === 'reentry' || s.kind === 'edl') ? Math.sin(clamp((t - s.t0) / (s.t1 - s.t0), 0, 1) * Math.PI) : 0;
  MV.craft.userData.heat.material.opacity = hot * 0.95;
  /* trail */
  const S = MV.S;
  let n = 0; while (n < S.T.length && S.T[n] <= t) n++;
  const pts = [];
  const step = Math.max(1, Math.ceil(n / 4900));
  if (frame === 'moon') {
    const mNow = moonGeo(t); let i0 = 0; while (i0 < n && S.T[i0] < t - 2.5 * 86400e3) i0++;
    const st = Math.max(1, Math.ceil((n - i0) / 4900));
    for (let i = i0; i < n; i += st) pts.push(p2t(add(S.Mr[i], mNow)));
  }
  else if (frame !== 'helio') { for (let i = 0; i < n; i += step) pts.push(p2t(S.P[i])); }
  pts.push(MV.craft.position.clone());
  MV.rib.set(pts); MV.rib.mesh.visible = frame !== 'helio';
  if (M.helioPath) {
    const hp = []; const st2 = Math.max(1, Math.ceil(n / 1400));
    for (let i = 0; i < n; i += st2) hp.push(p2t(S.H[i]));
    hp.push(p2t(add(p, helioEqj('Earth', date))));
    MV.ribH.set(hp); MV.ribH.mesh.visible = frame === 'helio';
  } else MV.ribH.mesh.visible = false;
  /* landing site marker */
  if (M.center === 'moon') { MV.siteMk.position.copy(p2t(add(moonGeo(t), mul(moonSiteDir(M.site.lat, M.site.lon, t), R_M + 3e3)))); }
  else if (M.center === 'mars') { MV.siteMk.position.copy(p2t(add(sub(helioEqj('Mars', date), helioEqj('Earth', date)), mul(marsSite(M.site.lat, M.site.lon, t), BODY_R.Mars + 3e3)))); }
  MV.siteMk.scale.setScalar(markerSize(MV.siteMk.getWorldPosition(new V3()), 12));
  /* log the phases as they happen */
  if (s && s !== MV.lastSeg) {
    MV.lastSeg = s;
    if (s.label && App.sim) { App.sim.events.push({ t: App.sim.t, text: s.label, id: 'mission' }); }
  }
  /* label + instrument card */
  const dE = (len(p) - R) / 1000, dM = (len(sub(p, moonGeo(t))) - R_M) / 1000;
  const near = M.center === 'moon' && dM < dE ? 'moon' : 'earth';
  const vRel = near === 'moon' ? len(sub(sub(missionPos(M, t + 1000), moonGeo(t + 1000)), sub(p, moonGeo(t)))) : len(v);
  MV.label.set(`<b>${M.name}</b><span>${s ? (s.kind === 'surface' ? 'on the surface' : s.kind === 'splash' ? 'back on Earth' : fmt(vRel / 1000, 2) + ' km/s') : ''}</span>`);
  updateMissionCard(M, t, s, { dE, dM, vRel, near });
}
function updateMissionCard(M, t, s, d) {
  if (!HUD.box) return;
  if (!MV.card || !MV.card.el.isConnected) {
    const el = document.createElement('section'); el.className = 'card craft-card mission-card'; el.style.setProperty('--c', '#ffcf6b');
    el.innerHTML = `<header><i class="dot"></i><b>${M.name}</b><span class="pill"></span></header><div class="row"><div class="dialbox"></div><div class="mc-dist"></div></div><div class="tl"><div class="tl-bar"><i class="tl-fill"></i></div><div class="tl-ticks"></div></div><p class="orb mc-phase"></p>`;
    const dial = makeDial({ max: 12, tick: 0.5, major: 2, unit: 'km/s', color: '#ffcf6b', valFmt: v => fmt(v, 2) });
    el.querySelector('.dialbox').appendChild(dial.el);
    const t0 = M.segs[0].t0, t1 = M.T.land || M.T.splash || M.segs[M.segs.length - 1].t0;
    const ticks = el.querySelector('.tl-ticks');
    MV.milestones.forEach(m => { const x = clamp((m.t - t0) / (t1 - t0), 0, 1); const i = document.createElement('i'); i.style.left = (x * 100) + '%'; i.title = m.label + ' · ' + fmtDate(new Date(m.t), 'UTC') + ' UTC'; ticks.appendChild(i); });
    HUD.box.prepend(el);
    MV.card = { el, dial, t0, t1 };
  }
  const C = MV.card;
  C.dial.set(d.vRel / 1000, null, 0.2);
  C.el.querySelector('.pill').textContent = 'Day ' + fmt(Math.max(0, (t - C.t0) / 86400e3), 1);
  const km = x => x > 1e6 ? fmt(x / 1e6, 2) + ' M km' : fmt(x) + ' km';
  C.el.querySelector('.mc-dist').innerHTML = `<div class="nc-row"><span class="k">Earth</span><b>${km(Math.max(0, d.dE))}</b></div>` + (M.center === 'moon' ? `<div class="nc-row"><span class="k">Moon</span><b>${km(Math.max(0, d.dM))}</b></div>` : '') + `<div class="nc-row"><span class="k">vs ${d.near === 'moon' ? 'Moon' : 'Earth'}</span><b>${fmt(d.vRel / 1000, 2)} km/s</b></div><div class="nc-row"><span class="k">UTC</span><b>${new Date(t).toISOString().slice(0, 16).replace('T', ' ')}</b></div>`;
  C.el.querySelector('.tl-fill').style.width = (clamp((t - C.t0) / (C.t1 - C.t0), 0, 1) * 100) + '%';
  const lastM = MV.milestones.filter(m => m.t <= t).pop();
  C.el.querySelector('.mc-phase').textContent = lastM ? lastM.label : 'Countdown';
}
/* jump the world clock to a mission date without clearing anything */
function jumpTo(ms, ts) {
  newWorld({ g: 1, a: 1, e: 0 }, null, null, new Date(ms));
  if (ts) setTS(ts);
}
function camMission(dist, az = 0.5, el = 0.4, rate = 1.3) {
  Viz.follow = null;
  Cam.go({ frame: () => { const p = missionCraftWorld(); const b = MV.curFrame === 'moon' ? U.moonWorld.clone() : MV.curFrame === 'helio' ? U.sunWorld.clone() : new V3(); const up = p.clone().sub(b).normalize(); return { pos: p, fwd: up.clone().cross(new V3(0, 1, 0)).normalize(), up }; }, dist, az, el, worldUp: false }, rate);
}
function camMoonSite(M, dist = 0.06) {
  Viz.follow = null;
  Cam.go({ frame: () => { const p = MV.siteMk.getWorldPosition(new V3()); const up = p.clone().sub(M.center === 'mars' ? bodyWorld('mars') : U.moonWorld).normalize(); return { pos: p, fwd: up.clone().cross(new V3(0, 1, 0)).normalize(), up }; }, dist, az: 0.6, el: 0.35, worldUp: false }, 1.0);
}
