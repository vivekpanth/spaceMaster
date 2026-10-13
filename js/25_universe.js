/* ================= ONE UNIVERSE: Sun, Moon (planets in phase 2) at their real positions ================= */
const U = { trueScale: false, showOrbits: true, showTides: false, bodies: {}, lastOrbit: { moon: -1e12, earth: -1e12 }, sunWorld: new V3(), moonWorld: new V3() };
const SUN_W = new V3(1, 0, 0);
const MOON_VS_INJ = `#include <worldpos_vertex>
vWP = (modelMatrix * vec4(transformed, 1.0)).xyz;`;
const TIDE_VS = `
uniform vec3 mDir; uniform vec3 sDir; uniform float amp;
varying float vH; varying vec3 vN;
${LOGV}
void main(){
  vec3 n = normalize(position);
  float cm = dot(n, mDir), cs = dot(n, sDir);
  float h = (1.5 * cm * cm - 0.5) + 0.46 * (1.5 * cs * cs - 0.5);
  vH = h; vN = normalize(mat3(modelMatrix) * n);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(n * (1.006 + amp * max(h + 0.5, 0.0)), 1.0);
  ${LOGVM}
}`;
const TIDE_FS = `
varying float vH; varying vec3 vN;
${LOGF}
void main(){
  ${LOGFM}
  float k = clamp((vH + 0.5) / 1.5, 0.0, 1.0);
  vec3 col = mix(vec3(0.05, 0.25, 0.65), vec3(0.45, 0.95, 1.0), k);
  gl_FragColor = vec4(col, 0.10 + 0.5 * k * k);
}`;

function bodyMat(map, opts = {}) {
  return new THREE.MeshStandardMaterial(Object.assign({ map, roughness: 1, metalness: 0 }, opts));
}
function buildUniverse() {
  const sky = new THREE.Group(); E.tilt.add(sky); E.sky = sky;
  /* the Sun */
  const sunG = new THREE.Group();
  const sunR = BODY_R.Sun / R;
  const sunMesh = new THREE.Mesh(new THREE.SphereGeometry(sunR, 64, 32), new THREE.MeshBasicMaterial({ map: TEX.sun, color: 0xfff1d6 }));
  sunG.add(sunMesh);
  const glow1 = sprite(GLOW_SUN, '#fff3d8', sunR * 4.5), glow2 = sprite(GLOW_SOFT, '#ffcf8a', sunR * 18, 0.45);
  sunG.add(glow2, glow1);
  sky.add(sunG); U.sun = sunG; U.sunMesh = sunMesh;
  const light = new THREE.PointLight(0xfff4e6, 2.3, 0, 0); sunG.add(light); E.sunLight = light;
  /* the Moon: tidally locked, shaded by Earth's shadow during a lunar eclipse */
  const mMat = bodyMat(TEX.moon, { normalMap: TEX.moonN, normalScale: new THREE.Vector2(0.28, 0.28) });
  U.moonUni = { shadowAxis: { value: new V3(-1, 0, 0) } };
  mMat.onBeforeCompile = sh => {
    sh.uniforms.shadowAxis = U.moonUni.shadowAxis;
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', MOON_VS_INJ);
    sh.fragmentShader = 'varying vec3 vWP;\nuniform vec3 shadowAxis;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float along = dot(vWP, shadowAxis);
      if (along > 0.0) {
        float dperp = length(vWP - along * shadowAxis);
        float ru = 1.02 - along * 0.004608, rp = 1.02 + along * 0.004693;
        float k = smoothstep(ru, rp, dperp);
        vec3 umbra = gl_FragColor.rgb * vec3(0.55, 0.18, 0.1);
        gl_FragColor.rgb = mix(umbra, gl_FragColor.rgb, 0.15 + 0.85 * k);
      }`);
  };
  const moon = new THREE.Mesh(new THREE.SphereGeometry(BODY_R.Moon / R, 96, 64), mMat);
  sky.add(moon); U.moon = moon;
  U.moonMarker = sprite(GLOW_SOFT, '#dfe6f2', 1, 0.55); sky.add(U.moonMarker);
  U.sunMarker = sprite(GLOW_SOFT, '#ffd27a', 1, 0.8); sky.add(U.sunMarker);
  /* orbits */
  U.moonOrbit = new Ribbon(201, '#b9c6dd', 1.2, { fade: 1, opacity: 0.35 }); sky.add(U.moonOrbit.mesh);
  U.earthOrbit = new Ribbon(241, '#7cc4ff', 1.4, { fade: 1, opacity: 0.4 }); sky.add(U.earthOrbit.mesh);
  /* tides (hugely exaggerated) */
  U.tideUni = { mDir: { value: new V3(1, 0, 0) }, sDir: { value: new V3(1, 0, 0) }, amp: { value: 0.035 } };
  const tide = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 90), new THREE.ShaderMaterial({ uniforms: U.tideUni, vertexShader: TIDE_VS, fragmentShader: TIDE_FS, transparent: true, depthWrite: false }));
  E.tilt.add(tide); U.tide = tide; tide.visible = false;
  U.earthMarker = sprite(GLOW_SOFT, '#7cc4ff', 1, 0.9); E.tilt.add(U.earthMarker);
  U.lblEarth = Labels.add('<b>Earth</b><span>you are here</span>', 'body', () => camera.position.length() > 40 ? new V3() : null, { occlude: false });
  U.lblEarth.el.style.setProperty('--c', '#7cc4ff');
  /* labels */
  U.lblSun = Labels.add('<b>Sun</b><span></span>', 'body', () => U.sun.getWorldPosition(new V3()), { occlude: true });
  U.lblMoon = Labels.add('<b>Moon</b><span></span>', 'body', () => U.moon.getWorldPosition(new V3()), { occlude: true });
  U.lblSun.el.style.setProperty('--c', '#ffcf6b'); U.lblMoon.el.style.setProperty('--c', '#dfe6f2');
}
/* how big to draw a body so it stays visible (unless true scale is on) */
function visScale(worldPos, radius, minPx) {
  if (U.trueScale || !minPx) return 1;
  const d = worldPos.distanceTo(camera.position);
  const pxPerUnit = VIEW.H / (2 * Math.tan(camera.fov * DEG / 2) * d);
  return Math.max(1, minPx / (radius * pxPerUnit));
}
function markerSize(worldPos, px) {
  const d = worldPos.distanceTo(camera.position);
  return px * 2 * Math.tan(camera.fov * DEG / 2) * d / VIEW.H;
}
function updateUniverse(date, theta, view) {
  const sky = E.sky;
  sky.rotation.y = view === 'ground' ? -theta : 0;
  const sE = sunEqj(date), mE = moonEqj(date);
  U.sun.position.copy(p2t(sE)); U.moon.position.copy(p2t(mE));
  E.tilt.updateMatrixWorld(true);
  U.sun.getWorldPosition(U.sunWorld); U.moon.getWorldPosition(U.moonWorld);
  SUN_W.copy(U.sunWorld).normalize();
  E.uni.sunDir.value.copy(SUN_W);
  E.uni.moonPos.value.copy(U.moonWorld);
  E.uni.sunAng.value = Math.asin(BODY_R.Sun / len(sE));
  U.moonUni.shadowAxis.value.copy(SUN_W).negate();
  const mR = BODY_R.Moon / R;
  U.moon.scale.setScalar(visScale(U.moonWorld, mR, 7));
  const sR = BODY_R.Sun / R;
  U.sun.scale.setScalar(visScale(U.sunWorld, sR, 10));
  U.moonMarker.position.copy(U.moon.position); U.moonMarker.scale.setScalar(markerSize(U.moonWorld, 18)); U.moonMarker.visible = U.trueScale;
  { const cd = camera.position.length(); U.earthMarker.visible = cd > 40; U.earthMarker.scale.setScalar(markerSize(new V3(), 16)); }
  U.sunMarker.position.copy(U.sun.position); U.sunMarker.scale.setScalar(markerSize(U.sunWorld, 30)); U.sunMarker.visible = U.trueScale;
  /* orbits: Moon around Earth; Earth around the Sun (drawn around the Sun's current spot) */
  const tms = date.getTime();
  if (Math.abs(tms - U.lastOrbit.moon) > 6 * 3600e3) {
    U.lastOrbit.moon = tms;
    const pts = []; for (let i = 0; i <= 200; i++) pts.push(p2t(moonEqj(new Date(tms + (i / 200 - 0.5) * 27.32 * 86400e3))));
    U.moonOrbit.set(pts);
  }
  U.moonOrbit.mesh.visible = U.showOrbits;
  updatePlanets(date);
  updateSats(date);
  updateLagrange(date);
  if (typeof updateMission === 'function') updateMission(date);
  /* tides follow Moon and Sun directions (in the Earth's tilted frame) */
  U.tide.visible = U.showTides;
  if (U.showTides) {
    U.tideUni.mDir.value.copy(U.moon.position).applyAxisAngle(new V3(0, 1, 0), sky.rotation.y).normalize();
    U.tideUni.sDir.value.copy(U.sun.position).applyAxisAngle(new V3(0, 1, 0), sky.rotation.y).normalize();
  }
  const dm = len(mE) / 1000, ds = len(sE) / 1000;
  U.lblMoon.set('<b>Moon</b><span>' + fmt(dm) + ' km · light takes ' + fmt(dm / 299792.458, 2) + ' s</span>');
  U.lblSun.set('<b>Sun</b><span>' + fmt(ds / 1e6, 1) + ' million km · light takes ' + fmt(ds / 299792.458 / 60, 1) + ' min</span>');
}
function tideState(date) {
  const a = Astronomy.MoonPhase(date) % 180;
  const k = Math.abs(Math.cos(a * DEG));
  return k > 0.8 ? 'Spring tides: Sun and Moon line up, so high tides are extra high' : k < 0.3 ? 'Neap tides: Sun and Moon pull at right angles, so tides are gentle' : 'Between spring and neap tides';
}
