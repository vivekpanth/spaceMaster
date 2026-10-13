/* ================= LAGRANGE POINTS (Sun-Earth), JWST and SOHO ================= */
const LG = { on: false, objs: null };
const HILL_FS = `
varying vec2 vUv;
${LOGF}
float iso(float f, float w){ float d = fwidth(f); return 1.0 - smoothstep(0.0, w * d, abs(fract(f) - 0.5) * 2.0 * 0.5); }
void main(){
  ${LOGFM}
  vec2 q = (vUv - 0.5) * 8.0;
  float rho = max(length(q), 0.05);
  float phi = -3.0 / rho - 1.5 * q.x * q.x;
  float lines = (1.0 - smoothstep(0.0, 1.2 * fwidth(phi), abs(fract(phi + 0.5) - 0.5))) * (1.0 - smoothstep(6.0, 12.0, -phi)) * (1.0 - smoothstep(6.0, 10.0, abs(q.x * q.x * 1.5)));
  float sep = 1.0 - smoothstep(0.0, 2.0 * fwidth(phi), abs(phi + 4.5));
  float inside = step(phi, -4.5);
  vec3 col = mix(vec3(1.0, 0.6, 0.25), vec3(0.3, 0.65, 1.0), inside);
  float edge = 1.0 - smoothstep(3.2, 4.0, max(abs(q.x), abs(q.y)));
  float a = (0.10 + 0.35 * lines + 0.9 * sep) * edge * smoothstep(0.08, 0.3, rho);
  gl_FragColor = vec4(mix(col, vec3(1.0, 0.95, 0.7), sep) * a, a);
}`;
const HILL_VS = `varying vec2 vUv;
${LOGV}
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGVM} }`;
function buildJWST() {
  const g = new THREE.Group();
  const shield = new THREE.Mesh(new THREE.CircleGeometry(1, 6), new THREE.MeshStandardMaterial({ color: '#c9b9ff', metalness: 0.9, roughness: 0.25, side: THREE.DoubleSide }));
  shield.scale.set(1.4, 0.75, 1); g.add(shield);
  const mirror = new THREE.Group();
  for (let i = 0; i < 18; i++) {
    const ring = i < 6 ? 1 : 2, k = i < 6 ? i : i - 6, n = ring === 1 ? 6 : 12;
    const a = k / n * TAU, rr = ring * 0.21;
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), M('#e6b84a', { metalness: 1, roughness: 0.15 }));
    h.position.set(Math.cos(a) * rr, Math.sin(a) * rr, 0); mirror.add(h);
  }
  mirror.add(new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), M('#e6b84a', { metalness: 1, roughness: 0.15 })));
  mirror.position.set(0, 0.45, 0.35); mirror.rotation.x = -0.25; g.add(mirror);
  return g;
}
function buildLagrange() {
  const o = { marks: {}, lbls: [] };
  const names = { L1: 'L1 · 1.5 million km sunward', L2: 'L2 · 1.5 million km behind Earth', L3: 'L3 · behind the Sun', L4: 'L4 · 60° ahead of Earth', L5: 'L5 · 60° behind Earth' };
  for (const k in names) {
    const s = sprite(GLOW_SOFT, '#c9b9ff', 1, 1); E.sky.add(s); o.marks[k] = s;
    const L = Labels.add('<b>' + names[k].split(' · ')[0] + '</b><span>' + names[k].split(' · ')[1] + '</span>', 'flag', () => LG.on ? s.getWorldPosition(new V3()) : null, { occlude: true });
    L.el.style.setProperty('--c', '#c9b9ff'); o.lbls.push(L);
  }
  o.hill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1, 1, 1), new THREE.ShaderMaterial({ vertexShader: HILL_VS, fragmentShader: HILL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, extensions: { derivatives: true } }));
  E.sky.add(o.hill);
  o.jwst = buildJWST(); E.sky.add(o.jwst);
  o.jwstMk = sprite(GLOW_SOFT, '#ffcf6b', 1, 1); E.sky.add(o.jwstMk);
  o.jl = Labels.add('<b>James Webb Space Telescope</b><span>circling L2, sunshield toward the Sun</span>', 'craft', () => LG.on ? o.jwstMk.getWorldPosition(new V3()) : null, { occlude: true });
  o.jl.el.style.setProperty('--c', '#ffcf6b');
  o.soho = buildSatellite(); E.sky.add(o.soho);
  o.sohoMk = sprite(GLOW_SOFT, '#7cf29a', 1, 1); E.sky.add(o.sohoMk);
  o.sl = Labels.add('<b>SOHO</b><span>watching the Sun from L1</span>', 'craft', () => LG.on ? o.sohoMk.getWorldPosition(new V3()) : null, { occlude: true });
  o.sl.el.style.setProperty('--c', '#7cf29a');
  o.haloRib = new Ribbon(181, '#ffcf6b', 1.4, { fade: 1, opacity: 0.4 }); E.sky.add(o.haloRib.mesh);
  LG.objs = o;
}
function updateLagrange(date) {
  if (!LG.objs) return;
  const o = LG.objs, vis = LG.on;
  [o.hill, o.jwst, o.jwstMk, o.soho, o.sohoMk, o.haloRib.mesh].concat(Object.values(o.marks)).forEach(x => { x.visible = vis; });
  if (!vis) return;
  const S = sunEqj(date), sh = norm(S), rH = len(S) * Math.cbrt(3.003e-6 / 3);
  const nEcl = [0, -Math.sin(OBLIQ), Math.cos(OBLIQ)];
  const yAx = norm(cross(nEcl, mul(sh, -1)));
  const P = { L1: mul(sh, rH), L2: mul(sh, -rH), L3: mul(S, 2) };
  const Eh = mul(S, -1);
  P.L4 = add(S, rodrigues(Eh, nEcl, 60 * DEG)); P.L5 = add(S, rodrigues(Eh, nEcl, -60 * DEG));
  for (const k in P) { const m = o.marks[k]; m.position.copy(p2t(P[k])); m.scale.setScalar(markerSize(m.getWorldPosition(new V3()), 14)); }
  /* Hill potential map around Earth, in the ecliptic, x axis pointing away from the Sun */
  const xAx = mul(sh, -1);
  o.hill.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(u2t(xAx), u2t(yAx), u2t(nEcl)));
  o.hill.scale.setScalar(rH * 8 / R); o.hill.position.set(0, 0, 0);
  /* JWST halo around L2 (about 800,000 km wide, ~6 month loop), SOHO near L1 */
  const ph = (date.getTime() / 86400e3) / 180 * TAU;
  const halo = (c, r, f) => add(c, add(mul(nEcl, r * 0.55 * Math.cos(f)), mul(yAx, r * Math.sin(f))));
  const jw = halo(P.L2, 8e8, ph), so = halo(P.L1, 6e8, ph * 1.05 + 1);
  o.jwst.position.copy(p2t(jw)); o.jwstMk.position.copy(o.jwst.position);
  o.soho.position.copy(p2t(so)); o.sohoMk.position.copy(o.soho.position);
  const jwW = o.jwst.getWorldPosition(new V3());
  o.jwst.scale.setScalar(Math.max(jwW.distanceTo(camera.position) * 0.03, 1e-4));
  o.jwst.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(new V3(), u2t(mul(sh, -1)), u2t(nEcl)));
  o.soho.scale.setScalar(Math.max(o.soho.getWorldPosition(new V3()).distanceTo(camera.position) * 0.02, 1e-4));
  o.jwstMk.scale.setScalar(markerSize(jwW, 12)); o.sohoMk.scale.setScalar(markerSize(o.soho.getWorldPosition(new V3()), 12));
  const pts = []; for (let i = 0; i <= 180; i++) pts.push(p2t(halo(P.L2, 8e8, i / 180 * TAU))); o.haloRib.set(pts);
}
function camLagrange(name, dist, el = 0.9) {
  Viz.follow = null;
  Cam.go({ frame: () => { const o = LG.objs; const p = name === 'jwst' ? o.jwst.getWorldPosition(new V3()) : name === 'earth' ? new V3() : o.marks[name].getWorldPosition(new V3()); return { pos: p, fwd: U.sunWorld.clone().normalize(), up: new V3(0, 1, 0) }; }, dist, az: 0.5, el, worldUp: true }, 1.0);
}
