/* ================= EINSTEIN: the spacetime "bowl" ================= */
const ST = { mass: 1, targetMass: 1, depthK: 11, soft: 1.6, GMk: 46, sats: [], earthR: 1.15, t: 0 };
const GRID_VS = `
uniform float depth; uniform float soft;
varying vec2 vXZ; varying float vD;
${LOGV}
void main(){
  vec3 p = position;
  float r = length(p.xz);
  float y = -depth / sqrt(r * r + soft * soft);
  p.y = y; vXZ = p.xz; vD = -y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  ${LOGVM}
}`;
const GRID_FS = `
uniform float depth; uniform vec3 cA; uniform vec3 cB; uniform float time;
varying vec2 vXZ; varying float vD;
${LOGF}
float line(float x, float w){ float f = abs(fract(x - 0.5) - 0.5); float d = fwidth(x); return 1.0 - smoothstep(w * d, (w + 1.2) * d, f); }
void main(){
  ${LOGFM}
  vec2 g = vXZ / 1.25;
  float l = max(line(g.x, 0.6), line(g.y, 0.6));
  float r = length(vXZ);
  float rings = line(r / 2.5 - time * 0.15, 0.4) * 0.25;
  float edge = 1.0 - smoothstep(18.0, 30.0, r);
  float k = clamp(vD / max(depth, 0.001) * 1.6, 0.0, 1.0);
  vec3 col = mix(cA, cB, k);
  float a = (l * 0.85 + rings * k + 0.05) * edge;
  gl_FragColor = vec4(col * a, a);
}`;
function buildSpacetimeScene() {
  const sc = new THREE.Scene(); scenes.spacetime = sc;
  const stars = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.MeshBasicMaterial({ map: TEX.stars, side: THREE.BackSide, color: 0x6c7488, depthWrite: false }));
  sc.add(stars);
  sc.add(new THREE.AmbientLight(0x404a66, 0.8));
  const sun = new THREE.DirectionalLight(0xfff2e0, 2.0); sun.position.set(20, 14, 10); sc.add(sun);
  ST.uni = { depth: { value: ST.depthK }, soft: { value: ST.soft }, cA: { value: new THREE.Color('#2f7dff') }, cB: { value: new THREE.Color('#9ff3ff') }, time: { value: 0 } };
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(60, 60, 300, 300).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ uniforms: ST.uni, vertexShader: GRID_VS, fragmentShader: GRID_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, extensions: { derivatives: true } }));
  sc.add(grid); ST.grid = grid;
  const eu = Object.assign({}, E.uni, { sunDir: { value: new V3(20, 14, 10).normalize() }, cloudOff: { value: 0 } });
  ST.eu = eu;
  const earth = new THREE.Group();
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.ShaderMaterial({ uniforms: eu, vertexShader: EARTH_VS, fragmentShader: EARTH_FS })));
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1.008, 96, 64), new THREE.ShaderMaterial({ uniforms: eu, vertexShader: EARTH_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false })));
  earth.add(new THREE.Mesh(new THREE.SphereGeometry(1.06, 64, 48), new THREE.ShaderMaterial({ uniforms: { sunDir: eu.sunDir, strength: { value: 1.2 } }, vertexShader: ATM_VS, fragmentShader: ATM_FS, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  earth.scale.setScalar(ST.earthR); earth.rotation.z = TILT;
  sc.add(earth); ST.earth = earth;
  ST.trailGroup = new THREE.Group(); sc.add(ST.trailGroup);
  ST.label = Labels.add('<b>Earth</b><span>its mass bends spacetime</span>', 'craft', () => ST.earth.position.clone().add(new V3(0, 1.8, 0)), { scene: 'spacetime', occlude: false });
  return sc;
}
const surfY = (r, m) => -ST.depthK * m / Math.sqrt(r * r + ST.soft * ST.soft);
function stLaunch(f, color = '#ffcf6b', r0 = 9) {
  const m = Math.max(ST.mass, 1e-4), GMk = ST.GMk * m;
  const vc = Math.sqrt(GMk * r0 * r0 / Math.pow(r0 * r0 + ST.soft * ST.soft, 1.5));
  const s = { x: r0, z: 0, vx: 0, vz: -(ST.mass < 0.02 ? 3.2 : vc) * f, color, alive: true, trail: [], age: 0 };
  s.obj = new THREE.Group();
  const sat = buildSatellite(); sat.scale.setScalar(0.9); s.obj.add(sat, sprite(GLOW_SOFT, color, 1.6, 0.7));
  ST.trailGroup.add(s.obj);
  s.rib = new Ribbon(1500, color, 3, { fade: 0.05 }); s.rib.mat.uniforms.resolution.value.set(VIEW.W, VIEW.H);
  ST.trailGroup.add(s.rib.mesh);
  ST.sats.push(s);
  while (ST.sats.length > 3) { const o = ST.sats.shift(); ST.trailGroup.remove(o.obj, o.rib.mesh); o.rib.dispose(); }
  return s;
}
function stClear() { ST.sats.forEach(o => { ST.trailGroup.remove(o.obj, o.rib.mesh); o.rib.dispose(); }); ST.sats = []; }
function stUpdate(dt) {
  ST.t += dt;
  ST.mass += (ST.targetMass - ST.mass) * Math.min(1, dt * 1.5);
  ST.uni.depth.value = ST.depthK * ST.mass; ST.uni.time.value = ST.t;
  ST.earth.position.y = surfY(0, ST.mass) + ST.earthR * 0.7;
  ST.earth.visible = ST.mass > 0.03;
  ST.earth.scale.setScalar(ST.earthR * Math.min(1, 0.4 + ST.mass * 0.6));
  ST.earth.children[0].rotation.y += dt * 0.25; ST.earth.children[1].rotation.y += dt * 0.25;
  const GMk = ST.GMk * ST.mass;
  for (const s of ST.sats) {
    if (s.alive) {
      const n = 40, h = dt / n;
      for (let i = 0; i < n; i++) {
        const r2 = s.x * s.x + s.z * s.z, d = Math.pow(r2 + ST.soft * ST.soft, 1.5);
        s.vx += -GMk * s.x / d * h; s.vz += -GMk * s.z / d * h;
        s.x += s.vx * h; s.z += s.vz * h;
      }
      const r = Math.hypot(s.x, s.z);
      if (ST.mass > 0.03 && r < ST.earthR * 1.05) { s.alive = false; s.crashed = true; }
      if (r > 34) { s.alive = false; s.escaped = true; }
      s.age += dt;
      if (s.trail.length === 0 || s.age - s.lastT > 0.03) { s.trail.push(new V3(s.x, surfY(r, ST.mass) + 0.25, s.z)); s.lastT = s.age; if (s.trail.length > 1500) s.trail.shift(); }
    }
    const r = Math.hypot(s.x, s.z);
    s.obj.position.set(s.x, surfY(r, ST.mass) + 0.25, s.z);
    s.obj.visible = !s.crashed;
    s.obj.lookAt(s.obj.position.clone().add(new V3(s.vx, 0, s.vz)));
    s.rib.set(s.trail.concat([s.obj.position.clone()]));
  }
}

/* clocks: why GPS needs Einstein */
const CLOCK = { day: 0, rate: 1 };
const DAY_US = { gpsG: 45.7, gpsV: -7.2, issG: 3.7, issV: -28.2 };

