/* ================= PLANETS, ORBITS, KEPLER, LIGHT DELAY ================= */
const GM_SUN = 1.32712440018e20;
const PLANETS = [
  { name: 'Mercury', tex: 'mercury', color: '#c9b9a6', P: 87.969, a: 0.387, g: 3.7 },
  { name: 'Venus', tex: 'venus', color: '#ffd9a0', P: 224.701, a: 0.723, g: 8.87 },
  { name: 'Mars', tex: 'mars', color: '#ff8a5c', P: 686.98, a: 1.524, g: 3.71 },
  { name: 'Jupiter', tex: 'jupiter', color: '#f0c9a0', P: 4332.59, a: 5.203, g: 24.79 },
  { name: 'Saturn', tex: 'saturn', color: '#f3dfa8', P: 10759.2, a: 9.537, g: 10.44, ring: [1.24, 2.27] },
  { name: 'Uranus', tex: 'uranus', color: '#9fe3ef', P: 30688.5, a: 19.19, g: 8.69 },
  { name: 'Neptune', tex: 'neptune', color: '#6f8fff', P: 60182, a: 30.07, g: 11.15 }
];
const u2t = v => new V3(v[0], v[2], -v[1]);

/* orient a body from its real rotation axis and spin angle (IAU), texture longitude 0 = local +x */
function orientBody(obj, name, date) {
  let ax;
  try { ax = Astronomy.RotationAxis(Astronomy.Body[name], date); } catch (e) { return; }
  const N = [ax.north.x, ax.north.y, ax.north.z];
  let node = cross([0, 0, 1], N); node = len(node) < 1e-9 ? [1, 0, 0] : norm(node);
  const pm = rodrigues(node, N, (ax.spin % 360) * DEG);
  const east = cross(N, pm);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u2t(pm), u2t(N), u2t(mul(east, -1))));
}

function buildPlanets() {
  const og = new THREE.Group(); E.sky.add(og); U.orbitsG = og;
  /* Earth's orbit, heliocentric, drawn around the Sun */
  U.earthOrbit.mesh.parent && U.earthOrbit.mesh.parent.remove(U.earthOrbit.mesh);
  og.add(U.earthOrbit.mesh);
  const t0 = Date.now();
  const sample = (name, P, n) => { const pts = []; for (let i = 0; i <= n; i++) pts.push(p2t(helioEqj(name, new Date(t0 + (i / n - 0.5) * P * 86400e3)))); return pts; };
  U.earthOrbit.set(sample('Earth', 365.256, 240));
  U.earthOrbitHelio = true;
  for (const p of PLANETS) {
    const rad = BODY_R[p.name] / R;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(rad, 64, 32), bodyMat(TEX[p.tex] || null, { color: TEX[p.tex] ? 0xffffff : p.color }));
    E.sky.add(mesh);
    if (p.ring) {
      const rin = rad * p.ring[0], rout = rad * p.ring[1];
      const g = new THREE.RingGeometry(rin, rout, 128, 1);
      const pos = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (r - rin) / (rout - rin), 0.5); }
      const ring = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: TEX.saturnRing || null, color: TEX.saturnRing ? 0xffffff : 0xd8c79a, transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; mesh.add(ring);
    }
    const marker = sprite(GLOW_SOFT, p.color, 1, 0.9); E.sky.add(marker);
    const orbit = new Ribbon(361, p.color, 1.3, { fade: 1, opacity: 0.35 }); orbit.set(sample(p.name, p.P, 360)); og.add(orbit.mesh);
    const lbl = Labels.add('<b>' + p.name + '</b><span></span>', 'body', () => U.trueScale || camera.position.distanceTo(mesh.getWorldPosition(new V3())) > rad * 3 ? mesh.getWorldPosition(new V3()) : null, { occlude: true });
    lbl.el.style.setProperty('--c', p.color);
    U.bodies[p.name.toLowerCase()] = { p, mesh, marker, orbit, lbl, rad };
  }
  /* Kepler's second law: equal areas in equal times */
  U.kepler = new THREE.Group(); og.add(U.kepler); U.kepler.visible = false;
  /* light pulses */
  U.pulses = [];
}
function setKepler(name) {
  const g = U.kepler; while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); }
  (U.keplerLbls || []).forEach(l => Labels.remove(l)); U.keplerLbls = [];
  if (!name) { g.visible = false; return; }
  g.visible = true;
  const p = name === 'Earth' ? { name: 'Earth', P: 365.256, a: 1, color: '#7cc4ff' } : PLANETS.find(x => x.name === name);
  const base = Clock.now().getTime(), slices = 12, sub = 10;
  for (let k = 0; k < slices; k++) {
    const pos = [0, 0, 0], idx = [];
    const pts = [];
    for (let j = 0; j <= sub; j++) pts.push(p2t(helioEqj(p.name, new Date(base + (k + j / sub) / slices * p.P * 86400e3))));
    pts.forEach(v => pos.push(v.x, v.y, v.z));
    for (let j = 1; j <= sub; j++) idx.push(0, j, j + 1);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    g.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: k % 2 ? '#ffcf6b' : '#7cc4ff', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })));
  }
  /* perihelion and aphelion speeds (vis-viva) */
  let rmin = Infinity, rmax = 0, tmin = 0, tmax = 0;
  for (let i = 0; i < 360; i++) { const t = new Date(base + i / 360 * p.P * 86400e3), r = len(helioEqj(p.name, t)); if (r < rmin) { rmin = r; tmin = t; } if (r > rmax) { rmax = r; tmax = t; } }
  const a = (rmin + rmax) / 2, v = r => Math.sqrt(GM_SUN * (2 / r - 1 / a)) / 1000;
  const mk = (t, txt) => { const L = Labels.add(txt, 'flag', () => { const v3 = p2t(helioEqj(p.name, t)); return v3.applyMatrix4(U.orbitsG.matrixWorld); }, { occlude: false }); L.el.style.setProperty('--c', '#ffcf6b'); U.keplerLbls.push(L); };
  mk(tmin, `Closest to the Sun · ${fmt(v(rmin), 1)} km/s`);
  mk(tmax, `Farthest · ${fmt(v(rmax), 1)} km/s`);
  return { vmax: v(rmin), vmin: v(rmax), name: p.name, days: p.P / slices };
}
function sendLight(target) {
  const s = App.sim; if (!s) return;
  const date = Clock.now();
  const vec = bodyEqj(target, date), dist = len(vec);
  const dir = norm(vec);
  const head = sprite(GLOW_SOFT, '#fff7c2', 1, 1); E.sky.add(head);
  const rb = new Ribbon(2, '#fff2a8', 2.4, { fade: 0.05 }); rb.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); E.sky.add(rb.mesh);
  const P = { t0: s.t, dist, dir, head, rb, target, done: false };
  P.lbl = Labels.add('', 'flag', () => head.getWorldPosition(new V3()), { occlude: false }); P.lbl.el.style.setProperty('--c', '#fff2a8');
  U.pulses.push(P);
  const secs = dist / CL;
  setTS(clamp(Math.round(secs / 12), 1, 3600));
  return secs;
}
function updatePlanets(date) {
  if (!U.orbitsG) return;
  U.orbitsG.position.copy(U.sun.position);
  for (const k in U.bodies) {
    const b = U.bodies[k];
    const g = bodyEqj(b.p.name, date);
    b.mesh.position.copy(p2t(g));
    orientBody(b.mesh, b.p.name, date);
    b.mesh.updateMatrixWorld();
    const wp = b.mesh.getWorldPosition(new V3());
    b.mesh.scale.setScalar(visScale(wp, b.rad, 4));
    b.marker.position.copy(b.mesh.position); b.marker.scale.setScalar(markerSize(wp, 14)); b.marker.visible = U.trueScale || wp.distanceTo(camera.position) > b.rad * 400;
    b.orbit.mesh.visible = U.showOrbits && camera.position.length() > 800;
    const dk = len(g) / 1000, lt = dk / 299792.458;
    b.lbl.set('<b>' + b.p.name + '</b><span>' + (dk > 1e9 ? fmt(dk / 1e9, 2) + ' billion km' : fmt(dk / 1e6) + ' million km') + ' · light ' + (lt > 3600 ? fmt(lt / 3600, 1) + ' h' : fmt(lt / 60, 1) + ' min') + '</span>');
  }
  orientBody(U.moon, 'Moon', date);
  U.earthOrbit.mesh.visible = U.showOrbits && camera.position.length() > 800;
  /* light pulses travel at c in simulation time */
  const s = App.sim;
  for (const P of U.pulses) {
    const tr = Math.min(P.dist, CL * Math.max(0, s.t - P.t0));
    const head = P.dir.map(x => x * tr);
    P.head.position.copy(p2t(head));
    P.head.scale.setScalar(markerSize(P.head.getWorldPosition(new V3()), 22));
    P.rb.set([new V3(), P.head.position.clone()]);
    const el = s.t - P.t0;
    const nice = x => x < 60 ? fmt(x, 2) + ' s' : x < 3600 ? fmt(Math.floor(x / 60)) + ' min ' + fmt(Math.floor(x % 60)) + ' s' : fmt(x / 3600, 2) + ' h';
    if (tr >= P.dist && !P.done) { P.done = true; P.doneT = performance.now(); }
    P.lbl.set(P.done ? `<b>Light reached ${P.target}</b><span>after ${nice(P.dist / CL)}</span>` : `<b>Light → ${P.target}</b><span>${nice(el)} of ${nice(P.dist / CL)}</span>`);
  }
  U.pulses = U.pulses.filter(P => {
    if (P.done && performance.now() - P.doneT > 6000) { E.sky.remove(P.head, P.rb.mesh); P.rb.dispose(); Labels.remove(P.lbl); return false; }
    return true;
  });
}
