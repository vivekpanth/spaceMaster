/* ================= WORLD VIEW: physics -> 3D ================= */
const VIEW = { W: 1, H: 1 };
const CITIES = {
  SYD: { name: 'Sydney', lat: -33.87, lon: 151.21 }, LAX: { name: 'Los Angeles', lat: 33.94, lon: -118.41 },
  LHR: { name: 'London', lat: 51.47, lon: -0.45 }, JFK: { name: 'New York', lat: 40.64, lon: -73.78 },
  DEL: { name: 'Delhi', lat: 28.56, lon: 77.1 }, BOM: { name: 'Mumbai', lat: 19.09, lon: 72.87 },
  DXB: { name: 'Dubai', lat: 25.25, lon: 55.36 }, SIN: { name: 'Singapore', lat: 1.36, lon: 103.99 },
  NRT: { name: 'Tokyo', lat: 35.55, lon: 139.78 }, PER: { name: 'Perth', lat: -31.94, lon: 115.97 },
  AKL: { name: 'Auckland', lat: -37.0, lon: 174.79 }, JNB: { name: 'Johannesburg', lat: -26.14, lon: 28.24 },
  GRU: { name: 'São Paulo', lat: -23.43, lon: -46.47 }, UIO: { name: 'Quito', lat: -0.13, lon: -78.36 },
  ANC: { name: 'Anchorage', lat: 61.17, lon: -150.0 }, KTM: { name: 'Kathmandu', lat: 27.7, lon: 85.36 }
};
const SITES = {
  SHAR: { name: 'Sriharikota, India', lat: 13.72, lon: 80.23 }, KSC: { name: 'Cape Canaveral, USA', lat: 28.57, lon: -80.65 },
  CSG: { name: 'Kourou, French Guiana', lat: 5.24, lon: -52.77 }, BAI: { name: 'Baikonur, Kazakhstan', lat: 45.96, lon: 63.31 }
};
const ORBITS = {
  ISS: { name: 'Space Station orbit', short: 'ISS', alt: 420e3, inc: 51.6 },
  LEO: { name: 'Low orbit (Starlink)', short: 'LEO', alt: 550e3, inc: 53 },
  GPS: { name: 'GPS orbit', short: 'GPS', alt: 20200e3, inc: 55 },
  GEO: { name: 'Geostationary orbit', short: 'GEO', alt: 35786e3, inc: 0 }
};
const PAL = { E: '#35e0b8', W: '#ff8a4c', A: '#7cc4ff', B: '#ffcf6b', ball: ['#ff6b6b', '#ffb84d', '#7cf29a', '#5ad1ff', '#b98cff', '#ff7ad9'] };

const Viz = {
  sim: null, view: 'space', items: new Map(), ground: [], follow: null,
  particles: null,
  reset(sim) {
    for (const it of this.items.values()) this.dropItem(it);
    this.items.clear();
    this.ground.forEach(g => { g.parent && g.parent.remove(g); if (g.userData.rib) g.userData.rib.dispose(); });
    this.ground = [];
    Labels.list.filter(l => l.tag === 'world').forEach(l => Labels.remove(l));
    this.sim = sim; this.follow = null;
  },
  dropItem(it) {
    if (it.obj) E.objs.remove(it.obj);
    if (it.rib) { E.objs.remove(it.rib.mesh); it.rib.dispose(); }
    if (it.orb) { E.objs.remove(it.orb.mesh); it.orb.dispose(); }
    if (it.track) { E.ground.remove(it.track.mesh); it.track.dispose(); }
    if (it.label) Labels.remove(it.label);
  },
  theta(t) { return thetaAt(this.sim, t ?? this.sim.t); },
  /* physics inertial -> tilt-local three vector for the current view */
  vpos(pI, t, exag, out) {
    let p = this.view === 'ground' ? rotZ(pI, -this.theta(t)) : pI;
    if (typeof exag === 'function') exag = exag();
    if (exag) {
      const rl = len(p), h = rl - R, hv = h + exag * (PLANE_EXAG - 1) * EXAG_H * Math.tanh(Math.max(h, 0) / EXAG_H);
      p = mul(p, (R + hv) / rl);
    }
    return p2t(p, out);
  },
  vvel(c) {
    const s = this.sim;
    let v = c.v;
    if (this.view === 'ground') v = rotZ(sub(c.v, spinVel(s, c.r)), -this.theta());
    return new V3(v[0], v[2], -v[1]);
  },
  worldOf(local) { return local.clone().applyMatrix4(E.tilt.matrixWorld); },
  earthFixedWorld(pE, h = 0) {
    const u = norm(pE), v = p2t(mul(u, R + h));
    return v.applyMatrix4(E.spin.matrixWorld);
  },
  /* ground marker / route helpers (Earth-fixed, inside spin group) */
  addCity(code, color = '#ffffff', show = true) {
    const c = CITIES[code] || SITES[code]; if (!c) return;
    const u = llUnit(c.lat, c.lon), p = p2t(mul(u, R * 1.002));
    const s = sprite(GLOW_SOFT, color, 0.035); s.position.copy(p); E.ground.add(s); this.ground.push(s);
    if (show) { const L = Labels.add('<b>' + c.name + '</b>', 'city', () => this.earthFixedWorld(u, 3000)); L.tag = 'world'; }
    return s;
  },
  addRoute(route, color, opacity = 0.6) {
    const n = 160, pts = [];
    for (let i = 0; i <= n; i++) pts.push(p2t(mul(route.at(route.L * i / n), R * 1.003)));
    const rb = new Ribbon(n + 1, color, 2, { fade: 1, opacity, additive: true });
    rb.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H);
    rb.set(pts); rb.mesh.userData.rib = rb; E.ground.add(rb.mesh); this.ground.push(rb.mesh);
    return rb;
  },
  addFlag(pE, color, text) {
    const u = norm(pE);
    const s = sprite(GLOW_SOFT, color, 0.05); s.position.copy(p2t(mul(u, R * 1.003))); E.ground.add(s); this.ground.push(s);
    const L = Labels.add(text, 'flag', () => this.earthFixedWorld(u, 3000)); L.tag = 'world'; L.el.style.setProperty('--c', color);
    return L;
  },
  addMountain(lat, lon, hKm) {
    const m = buildMountain(); const u = llUnit(lat, lon);
    const up = p2t(u).normalize();
    m.position.copy(up.clone().multiplyScalar(0.995));
    m.quaternion.setFromUnitVectors(new V3(0, 1, 0), up);
    const s = hKm * 1000 / R / 1.05; m.scale.set(s * 0.9, s, s * 0.9);
    E.ground.add(m); this.ground.push(m);
    return m;
  },
  /* craft visuals */
  makeItem(c) {
    const it = { c, label: null };
    if (c.kind === 'plane') {
      it.obj = buildPlane(c.color); it.exag = true;
      it.rib = new Ribbon(3000, c.color, 3, { fade: 0.05, opacity: 0.95 });
    } else if (c.kind === 'ball') {
      it.obj = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12), M('#2b2f36', { metalness: 0.8, roughness: 0.3 }));
      it.obj.add(ball, sprite(GLOW_SOFT, c.color, 2.6, 0.9));
      it.rib = new Ribbon(3000, c.color, 3.2, { fade: 0.2, opacity: 1 });
      it.ballSize = true;
    } else if (c.kind === 'rocket') {
      it.obj = buildRocket();
      it.exag = () => c.phase === 'ascent' ? Math.pow(1 - clamp(c.u, 0, 1), 2) : 0;
      it.rib = new Ribbon(3000, c.color, 2.6, { fade: 0.1, opacity: 0.9 });
      it.track = new Ribbon(3000, c.color, 1.6, { fade: 0.25, opacity: 0.7 });
      E.ground.add(it.track.mesh); it.trackPts = [];
    } else if (c.kind === 'debris') {
      const src = buildRocket().userData;
      it.obj = new THREE.Group();
      if (c.part === 'booster') it.obj.add(src.booster);
      else if (c.part === 'stage2') it.obj.add(src.stage2);
      else { const f = src.fairing.children[c.part === 'fairingL' ? 0 : 1]; it.obj.add(f); }
      it.debris = true;
    }
    if (it.rib) { it.rib.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); E.objs.add(it.rib.mesh); }
    if (it.track) it.track.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H);
    if (it.obj) E.objs.add(it.obj);
    if (c.kind !== 'debris') {
      it.label = Labels.add('', 'craft', () => it.obj && it.obj.visible && !(c.landed && c.kind === 'ball') ? this.worldOf(it.obj.position) : null, { occlude: true });
      it.label.tag = 'world'; it.label.el.style.setProperty('--c', c.color);
    }
    this.items.set(c, it);
    return it;
  },
  craftWorld(c) { const it = this.items.get(c); return it ? this.worldOf(it.obj.position) : new V3(); },
  frameOf(c) {
    return () => {
      const it = this.items.get(c);
      if (!it) return { pos: new V3(), fwd: new V3(1, 0, 0), up: new V3(0, 1, 0) };
      const pos = this.worldOf(it.obj.position);
      const up = pos.clone().normalize();
      const fwd = it.fwdW ? it.fwdW.clone() : up.clone().cross(new V3(0, 1, 0));
      return { pos, fwd, up };
    };
  },
  update(dtReal, time) {
    const s = this.sim; if (!s) return;
    const th = this.theta();
    E.spin.rotation.y = this.view === 'space' ? th : 0;
    updateUniverse(Clock.dateAt(s.t), th, this.view);
    for (const c of s.crafts) if (!this.items.has(c)) this.makeItem(c);
    const camW = camera.position;
    for (const [c, it] of this.items) {
      const pos = this.vpos(c.r, s.t, it.exag);
      it.obj.position.copy(pos);
      const worldPos = this.worldOf(pos);
      const camDist = worldPos.distanceTo(camW);
      const followed = this.follow === c;
      let size;
      if (c.kind === 'plane') size = followed ? Math.min(camDist * 0.3, Cam.rig.dist * 0.32) : Math.max(0.0005, camDist * 0.022);
      else if (c.kind === 'ball') size = Math.max(0.002, camDist * 0.008);
      else if (c.kind === 'rocket') size = followed ? Math.min(camDist * 0.2, Cam.rig.dist * 0.16) : Math.max(0.001, camDist * 0.03);
      else size = Math.max(0.001, camDist * 0.025);
      it.size = it.size ? it.size + (size - it.size) * Math.min(1, dtReal * 4) : size;
      it.obj.scale.setScalar(it.size);
      const up = pos.clone().normalize();
      let fwd;
      if (c.kind === 'rocket' && c.phase === 'ascent') {
        const vv = this.vvel(c); fwd = vv.lengthSq() > 1 ? vv.normalize() : up.clone();
        if (c.u < 0.02) fwd = up.clone();
      } else if (c.landed) fwd = it.lastFwd || up.clone().cross(new V3(0, 1, 0)).normalize();
      else { const vv = this.vvel(c); fwd = vv.lengthSq() > 1e-6 ? vv.normalize() : up.clone(); }
      it.lastFwd = fwd.clone();
      it.fwdW = fwd.clone().applyQuaternion(E.tilt.quaternion);
      if (c.kind === 'plane' || c.kind === 'ball') {
        it.obj.up.copy(up);
        it.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), fwd.clone().negate(), up));
      } else if (c.kind === 'rocket') {
        const side = Math.abs(fwd.dot(up)) > 0.98 ? new V3(1, 0, 0).cross(up).normalize() : up;
        it.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), fwd.clone().negate(), side));
        const u = it.obj.userData;
        const inOrbit = c.phase !== 'ascent';
        u.booster.visible = c.stagesShown.booster; u.fairing.visible = c.stagesShown.fairing; u.stage2.visible = c.stagesShown.stage2;
        u.sat.visible = !c.stagesShown.fairing;
        if (inOrbit) { u.sat.scale.setScalar(1); u.sat.position.z = 0; } else { u.sat.scale.setScalar(0.35); u.sat.position.z = 0.33; }
        u.flame.visible = !!c.flame;
        u.flame.position.z = c.stagesShown.booster ? -0.54 : (inOrbit ? -0.12 : 0.01);
        u.flame.scale.setScalar(inOrbit ? 0.6 : (c.stagesShown.booster ? 1.4 : 0.9));
        u.flame.userData.mat.uniforms.time.value = time;
        if (c.flame && c.phase === 'ascent') this.emit(it, fwd, c.stagesShown.booster ? 1 : 0.5);
      } else if (it.debris) {
        it.spinA = (it.spinA || 0) + dtReal * 1.3;
        it.obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), fwd.clone().negate(), up));
        it.obj.rotateX(it.spinA * 0.5); it.obj.rotateY(it.spinA * 0.3);
        const age = s.t - c.born;
        it.obj.visible = !c.landed && age < 1500;
      }
      if (c.kind === 'plane' && it.obj.userData.strobe) it.obj.userData.strobe.material.opacity = (Math.sin(time * 9) > 0.92) ? 1 : 0.05;
      if (it.label && (!it.lt || time - it.lt > 0.25)) {
        it.lt = time;
        const vg = len(sub(c.v, spinVel(s, c.r)));
        const short = c.kind === 'plane' ? (c.id === 'E' || c.id === 'W' ? (c.id === 'E' ? 'East' : 'West') : (c.fromName ? c.fromName + '→' + c.toName : 'Plane')) : c.kind === 'ball' ? 'Ball' : (c.target ? c.target.short : 'Rocket');
        const sp = c.kind === 'plane' ? (c.landed ? 'landed' : fmt(vg * 3.6) + ' km/h') : (c.landed ? 'landed' : fmt(len(c.v) / 1000, 2) + ' km/s');
        it.label.set('<b>' + short + '</b><span>' + sp + '</span>');
      }
      /* trails */
      if (it.rib) {
        const pts = c.trail.map(q => this.vpos(q.p, q.t, it.exag));
        pts.push(pos.clone());
        it.rib.set(pts);
      }
      if (it.track) {
        const tr = c.trail;
        while (it.trackPts.length < tr.length) {
          const q = tr[it.trackPts.length];
          it.trackPts.push(p2t(mul(norm(rotZ(q.p, -this.theta(q.t))), R * 1.004)));
        }
        if (it.trackPts.length > 2) { const tp = it.trackPts.slice(); let pts = tp; if (tp.length > 3000) pts = tp.slice(-3000); it.track.set(pts); }
        it.track.mesh.visible = c.phase !== 'ascent';
      }
      /* predicted orbit (space view) */
      if (c.kind === 'rocket' || c.kind === 'ball') this.updateOrbitPath(it, c);
    }
    this.stepParticles(dtReal);
    E.uni.cloudOff.value = (s.t * 2e-7) % 1;
  },
  updateOrbitPath(it, c) {
    const s = this.sim;
    const show = this.view === 'space' && s.P.g && !c.landed && !(c.kind === 'rocket' && c.phase === 'ascent');
    if (!show) { if (it.orb) it.orb.mesh.visible = false; return; }
    const o = orbitInfo(c.r, c.v);
    const key = c.phase + '|' + Math.round((o.a || 0) / 2000) + '|' + Math.round(o.e * 1000) + '|' + Math.round((o.inc || 0) * 10);
    if (!it.orb) { it.orb = new Ribbon(361, c.color, 1.4, { fade: 1, opacity: 0.35 }); it.orb.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H); E.objs.add(it.orb.mesh); }
    it.orb.mesh.visible = true;
    if (it.orbKey === key) return;
    it.orbKey = key;
    const pts = [];
    if (o.bound) {
      const hv = cross(c.r, c.v), hn = norm(hv);
      const ev = sub(mul(cross(c.v, hv), 1 / GM), norm(c.r));
      const ex = len(ev) > 1e-6 ? norm(ev) : norm(c.r), ey = cross(hn, ex);
      const p = o.a * (1 - o.e * o.e);
      for (let i = 0; i <= 360; i++) {
        const nu = i / 360 * TAU, r = p / (1 + o.e * Math.cos(nu));
        pts.push(p2t(add(mul(ex, r * Math.cos(nu)), mul(ey, r * Math.sin(nu)))));
      }
    }
    it.orb.set(pts);
  },
  /* exhaust particles */
  initParticles() {
    const N = 700, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(N), 1));
    g.setAttribute('size', new THREE.BufferAttribute(new Float32Array(N), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: GLOW_SOFT }, scale: { value: 400 } },
      vertexShader: `attribute float alpha; attribute float size; varying float vA; uniform float scale;
        ${LOGV} void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * scale / -mv.z, 1.0, 160.0); gl_Position = projectionMatrix * mv; ${LOGVM} }`,
      fragmentShader: `uniform sampler2D map; varying float vA; ${LOGF} void main(){ ${LOGFM} vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(mix(vec3(1.0,0.55,0.2), vec3(0.85,0.85,0.9), 1.0 - vA) * t.a * vA, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; E.objs.add(pts);
    this.particles = { mat, g, N, i: 0, life: new Float32Array(N), vel: new Array(N).fill(null).map(() => new V3()), base: new Float32Array(N) };
  },
  emit(it, fwd, power) {
    const P = this.particles; if (!P) return;
    const pos = P.g.attributes.position.array, sz = P.g.attributes.size.array;
    const nozzle = it.obj.position.clone().add(fwd.clone().multiplyScalar(it.size * (it.c.stagesShown.booster ? -0.05 : 0.5)));
    for (let k = 0; k < 3; k++) {
      const i = P.i = (P.i + 1) % P.N;
      pos[i * 3] = nozzle.x; pos[i * 3 + 1] = nozzle.y; pos[i * 3 + 2] = nozzle.z;
      P.life[i] = 1; P.base[i] = it.size * (0.35 + Math.random() * 0.3) * power;
      P.vel[i].copy(fwd).multiplyScalar(-it.size * (0.6 + Math.random())).add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(it.size * 0.4));
      sz[i] = P.base[i];
    }
  },
  stepParticles(dt) {
    const P = this.particles; if (!P) return;
    const pos = P.g.attributes.position.array, al = P.g.attributes.alpha.array, sz = P.g.attributes.size.array;
    for (let i = 0; i < P.N; i++) {
      if (P.life[i] <= 0) { al[i] = 0; continue; }
      P.life[i] -= dt * 0.6;
      pos[i * 3] += P.vel[i].x * dt; pos[i * 3 + 1] += P.vel[i].y * dt; pos[i * 3 + 2] += P.vel[i].z * dt;
      al[i] = Math.max(0, P.life[i]) * 0.8; sz[i] = P.base[i] * (1 + (1 - P.life[i]) * 4);
    }
    P.g.attributes.position.needsUpdate = true; P.g.attributes.alpha.needsUpdate = true; P.g.attributes.size.needsUpdate = true;
    P.g.computeBoundingSphere();
  },
  clearParticles() { const P = this.particles; if (P) P.life.fill(0); }
};
