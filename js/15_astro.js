/* ================= REAL SKY: time, Sun, Moon, planets (Astronomy Engine) ================= */
const AU = 1.495978707e11, OBLIQ = 23.4393 * DEG;
const BODY_R = { Sun: 696340e3, Moon: 1737.4e3, Mercury: 2439.7e3, Venus: 6051.8e3, Mars: 3389.5e3, Jupiter: 69911e3, Saturn: 58232e3, Uranus: 25362e3, Neptune: 24622e3 };

/* the simulation clock: real date = date0 + sim.t */
const Clock = {
  date0: new Date(),
  dateAt(t) { return new Date(this.date0.getTime() + (t || 0) * 1000); },
  now() { return this.dateAt(App.sim ? App.sim.t : 0); }
};
function gmst(date) { return Astronomy.SiderealTime(date) * 15 * DEG; }
const v2a = v => [v.x * AU, v.y * AU, v.z * AU];
function sunEqj(date) { return v2a(Astronomy.GeoVector(Astronomy.Body.Sun, date, true)); }
function moonEqj(date) { return v2a(Astronomy.GeoMoon(date)); }
function bodyEqj(name, date) { return name === 'Moon' ? moonEqj(date) : v2a(Astronomy.GeoVector(Astronomy.Body[name], date, true)); }
function helioEqj(name, date) { return v2a(Astronomy.HelioVector(Astronomy.Body[name], date)); }
/* subsolar point (lat, lon) for a date */
function subsolar(date) {
  const s = sunEqj(date), e = rotZ(s, -gmst(date));
  return unitLL(e);
}
/* pick a time (near base date) when the Sun stands at `hourAngleDeg` west of longitude `lon` (0 = local noon) */
function dateForLocalSun(lon, offDeg = 0, base = new Date()) {
  let d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 12));
  for (let i = 0; i < 4; i++) {
    const ss = subsolar(d)[1];
    const diff = ((lon - offDeg) - ss + 540) % 360 - 180;
    d = new Date(d.getTime() - diff / 360 * 86400e3);
  }
  return d;
}
function moonPhaseInfo(date) {
  const a = Astronomy.MoonPhase(date);
  const illum = (1 - Math.cos(a * DEG)) / 2;
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const name = names[Math.floor(((a + 22.5) % 360) / 45)];
  return { angle: a, illum, name };
}
function fmtDate(d, tz) {
  try { return d.toLocaleString('en-AU', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }); }
  catch (e) { return d.toISOString().slice(0, 16).replace('T', ' '); }
}
