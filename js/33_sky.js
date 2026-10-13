/* ================= THE REAL SKY: 8,900 catalogue stars (HYG), constellation lines, the Milky Way band ================= */
const Sky = { ready: false, showLines: false, showNames: false, extraYears: 0, group: null, fade: 1, lbls: [] };
const SKY_R = 3.4e6;
const SKYSTAR_VS = `
attribute vec4 info; uniform float years; uniform float pr; uniform float fade; uniform float R;
varying vec3 vCol; varying float vA;
${LOGV}
vec3 bv(float c){
  vec3 a = vec3(0.62, 0.74, 1.0), w = vec3(1.0), y = vec3(1.0, 0.86, 0.62), o = vec3(1.0, 0.66, 0.42);
  return c < 0.3 ? mix(a, w, clamp((c + 0.35) / 0.65, 0.0, 1.0)) : c < 1.0 ? mix(w, y, (c - 0.3) / 0.7) : mix(y, o, clamp((c - 1.0) / 0.8, 0.0, 1.0));
}
void main(){
  vec3 p = position;
  vec3 e = cross(vec3(0.0, 1.0, 0.0), p); e = length(e) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(e);
  vec3 n = cross(p, e);
  p = normalize(p + (e * info.z + n * info.w) * years * 4.8481368e-9);
  vec4 mv = modelViewMatrix * vec4(p * R, 1.0);
  float m = info.x;
  gl_PointSize = clamp(5.4 - 0.66 * m, 1.25, 8.5) * pr;
  vA = clamp(1.25 - 0.16 * m, 0.16, 1.0) * fade;
  vCol = bv(info.y);
  gl_Position = projectionMatrix * mv;
  ${LOGVM}
}`;
const SKYSTAR_FS = `varying vec3 vCol; varying float vA;
${LOGF}
void main(){ ${LOGFM} vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = smoothstep(1.0, 0.0, r); a = a * a; if (a * vA < 0.01) discard; gl_FragColor = vec4(vCol * (0.7 + 0.6 * a), a * vA); }`;
const SKYLINE_VS = `
attribute vec2 pm; uniform float years; uniform float R;
${LOGV}
void main(){
  vec3 p = position;
  vec3 e = cross(vec3(0.0, 1.0, 0.0), p); e = length(e) < 1e-6 ? vec3(1.0, 0.0, 0.0) : normalize(e);
  vec3 n = cross(p, e);
  p = normalize(p + (e * pm.x + n * pm.y) * years * 4.8481368e-9);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p * R * 0.999, 1.0);
  ${LOGVM}
}`;
const SKYLINE_FS = `uniform float fade; uniform vec3 color;
${LOGF}
void main(){ ${LOGFM} gl_FragColor = vec4(color, 0.38 * fade); }`;
const MW_VS = `varying vec3 vL;
${LOGV}
void main(){ vL = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGVM} }`;
const MW_FS = `uniform sampler2D map; uniform float fade; varying vec3 vL;
${LOGF}
void main(){ ${LOGFM}
  vec3 p = normalize(vL);
  float ra = atan(-p.z, p.x), dec = asin(clamp(p.y, -1.0, 1.0));
  vec2 uv = vec2(fract(ra / 6.2831853), 0.5 + dec / 3.1415927);
  float v = texture2D(map, uv).r;
  vec3 col = mix(vec3(0.45, 0.52, 0.75), vec3(1.0, 0.9, 0.74), smoothstep(0.35, 1.0, v));
  gl_FragColor = vec4(col * v * 0.32 * fade, 1.0);
}`;
/* daytime sky colour when standing on the ground */
const DOME_VS = `varying vec3 vW;
${LOGV}
void main(){ vW = normalize(mat3(modelMatrix) * position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); ${LOGVM} }`;
const DOME_FS = `uniform vec3 up; uniform vec3 sun; uniform float on; varying vec3 vW;
${LOGF}
void main(){ ${LOGFM}
  float h = dot(vW, up), s = dot(sun, up), toward = max(dot(vW, sun), 0.0);
  float day = smoothstep(-0.12, 0.15, s);
  vec3 zen = vec3(0.10, 0.28, 0.62), hor = vec3(0.55, 0.72, 0.92), dusk = vec3(1.0, 0.45, 0.2);
  vec3 col = mix(hor, zen, smoothstep(0.0, 0.6, h)) * day;
  col += dusk * pow(toward, 6.0) * smoothstep(0.25, 0.0, abs(s)) * smoothstep(-0.2, 0.1, h) * 0.9;
  col += vec3(1.0, 0.95, 0.85) * pow(toward, 200.0) * day * 0.6;
  float a = smoothstep(-0.06, 0.02, h) * on;
  gl_FragColor = vec4(col * a, 1.0);
}`;
async function buildSky() {
  let buf, meta;
  try {
    const [b, m] = await Promise.all([fetch('tex/stars.bin').then(r => r.arrayBuffer()), fetch('tex/sky.json').then(r => r.json())]);
    buf = new Float32Array(b); meta = m;
  } catch (e) { return; }
  const n = meta.n, pos = new Float32Array(n * 3), info = new Float32Array(n * 4), dirs = [];
  for (let i = 0; i < n; i++) {
    const x = buf[i * 8], y = buf[i * 8 + 1], z = buf[i * 8 + 2];
    pos[i * 3] = x; pos[i * 3 + 1] = z; pos[i * 3 + 2] = -y;
    info.set([buf[i * 8 + 3], buf[i * 8 + 4], buf[i * 8 + 5], buf[i * 8 + 6]], i * 4);
    dirs.push(new V3(x, z, -y));
  }
  Sky.dirs = dirs; Sky.info = info;
  const g = new THREE.Group(); E.sky.add(g); Sky.group = g;
  const uni = { years: { value: 0 }, pr: { value: Math.min(2, window.devicePixelRatio || 1) }, fade: { value: 1 }, R: { value: SKY_R } };
  Sky.uni = uni;
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('info', new THREE.BufferAttribute(info, 4));
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: uni, vertexShader: SKYSTAR_VS, fragmentShader: SKYSTAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; pts.renderOrder = -9; g.add(pts);
  /* constellation figures: each end follows its own star */
  const L = meta.lines, lp = new Float32Array(L.length * 3), lpm = new Float32Array(L.length * 2);
  L.forEach((si, k) => { lp.set([pos[si * 3], pos[si * 3 + 1], pos[si * 3 + 2]], k * 3); lpm.set([info[si * 4 + 2], info[si * 4 + 3]], k * 2); });
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('pm', new THREE.BufferAttribute(lpm, 2));
  Sky.lines = new THREE.LineSegments(lg, new THREE.ShaderMaterial({ uniforms: { years: uni.years, R: uni.R, fade: uni.fade, color: { value: new THREE.Color('#7cc4ff') } }, vertexShader: SKYLINE_VS, fragmentShader: SKYLINE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  Sky.lines.frustumCulled = false; Sky.lines.visible = false; g.add(Sky.lines);
  /* Milky Way */
  if (TEX.milkyway) {
    TEX.milkyway.wrapS = THREE.RepeatWrapping;
    const mw = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * 1.02, 96, 48), new THREE.ShaderMaterial({ uniforms: { map: { value: TEX.milkyway }, fade: uni.fade }, vertexShader: MW_VS, fragmentShader: MW_FS, side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true }));
    mw.renderOrder = -10; mw.frustumCulled = false; g.add(mw); Sky.mw = mw;
  }
  /* daytime dome (only near the ground) */
  Sky.domeU = { up: { value: new V3(0, 1, 0) }, sun: { value: new V3(1, 0, 0) }, on: { value: 0 } };
  Sky.dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 48, 24), new THREE.ShaderMaterial({ uniforms: Sky.domeU, vertexShader: DOME_VS, fragmentShader: DOME_FS, side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  Sky.dome.renderOrder = -8; Sky.dome.frustumCulled = false; scenes.earth.add(Sky.dome);
  /* names */
  const starPos = i => () => Sky.showNames && Sky.uni.fade.value > 0.2 ? Sky.group.localToWorld(Sky.starDir(i).multiplyScalar(SKY_R)) : null;
  meta.names.forEach(([nm, i]) => { const l = Labels.add('<b>' + nm + '</b>', 'star', starPos(i), { occlude: true }); Sky.lbls.push(l); });
  meta.cons.forEach(([nm, ra, dec]) => {
    const d = gp(dec, ra, 1);
    const l = Labels.add('<b>' + nm + '</b>', 'cons', () => Sky.showLines && Sky.uni.fade.value > 0.2 ? Sky.group.localToWorld(d.clone().multiplyScalar(SKY_R)) : null, { occlude: true });
    Sky.lbls.push(l);
  });
  if (E.stars) E.stars.visible = false;
  Sky.ready = true;
}
Sky.years = () => (Clock.now().getTime() - Date.UTC(2000, 0, 1, 12)) / 3.15576e10 + Sky.extraYears;
Sky.starDir = i => {
  const p = Sky.dirs[i].clone(), e = new V3(0, 1, 0).cross(p).normalize(), n = p.clone().cross(e), y = Sky.years() * 4.8481368e-9;
  return p.addScaledVector(e, Sky.info[i * 4 + 2] * y).addScaledVector(n, Sky.info[i * 4 + 3] * y).normalize();
};
function updateSky() {
  if (!Sky.ready) return;
  E.sky.updateMatrixWorld();
  Sky.group.position.copy(E.sky.worldToLocal(camera.position.clone()));
  Sky.uni.years.value = Sky.years();
  Sky.lines.visible = Sky.showLines;
  /* standing on the ground: blue sky by day, stars fade out */
  const cp = camera.position, h = cp.length(), sun = U.sunWorld.clone().normalize();
  const near = h < 1.03, up = cp.clone().normalize(), alt = up.dot(sun);
  Sky.dome.position.copy(cp); Sky.domeU.up.value.copy(up); Sky.domeU.sun.value.copy(sun); Sky.domeU.on.value = near ? 1 : 0;
  Sky.fade = near ? 1 - smooth01((alt + 0.1) / 0.22) : 1;
  Sky.uni.fade.value = Sky.fade;
}
/* look at a patch of sky from just outside Earth */
function camSkyDir(raDeg, decDeg, rate = 1.0) {
  Viz.follow = null; setView('space');
  Cam.go({ frame: () => { const d = E.sky.localToWorld(gp(decDeg, raDeg, 1)).sub(E.sky.localToWorld(new V3())).normalize(); const up = new V3(0, 1, 0).addScaledVector(d, -d.y).normalize(); return { pos: d.clone().multiplyScalar(6), fwd: d, up }; }, dist: 2, az: 0, el: 0, worldUp: false }, rate);
}
/* stand on the ground and look at the sky */
function camSky(lat, lon, azDeg = 180, altDeg = 30, rate = 1.0) {
  Viz.follow = null; setView('space');
  const u = llUnit(lat, lon), nn = llUnit(lat + 0.5, lon);
  Cam.go({
    frame: () => {
      const s = Viz.earthFixedWorld(u), n = s.clone().normalize(), north = Viz.earthFixedWorld(nn).sub(s); north.sub(n.clone().multiplyScalar(north.dot(n))).normalize();
      const h = north.clone().applyAxisAngle(n, -azDeg * DEG), e = altDeg * DEG;
      const base = s.clone().add(n.clone().multiplyScalar(0.00006));
      return { pos: base.clone().add(h.clone().multiplyScalar(Math.cos(e) * 1e-4)).add(n.clone().multiplyScalar(Math.sin(e) * 1e-4)), fwd: h, up: n };
    }, dist: 1e-4, az: 0, el: -altDeg * DEG, worldUp: false
  }, rate);
}
