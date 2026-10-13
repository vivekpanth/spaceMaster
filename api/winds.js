// Current winds on a 10-degree grid, near the ground (10 m) and at jet-stream height (250 hPa), from Open-Meteo.
const { getJSON, send, fail } = require('./_util');
const LATS = [], LONS = [];
for (let la = -80; la <= 80; la += 10) LATS.push(la);
for (let lo = -180; lo < 180; lo += 10) LONS.push(lo);
module.exports = async (req, res) => {
  try {
    const pts = []; for (const la of LATS) for (const lo of LONS) pts.push([la, lo]);
    const chunks = []; for (let i = 0; i < pts.length; i += 210) chunks.push(pts.slice(i, i + 210));
    const vars = 'wind_speed_10m,wind_direction_10m,wind_speed_250hPa,wind_direction_250hPa';
    const out = await Promise.all(chunks.map(c => getJSON('https://api.open-meteo.com/v1/forecast?latitude=' + c.map(p => p[0]).join(',') + '&longitude=' + c.map(p => p[1]).join(',') + '&current=' + vars + '&wind_speed_unit=ms', 15000)));
    const list = out.flatMap(x => Array.isArray(x) ? x : [x]);
    if (list.length !== pts.length) throw new Error('Open-Meteo returned ' + list.length + ' of ' + pts.length + ' points');
    const u10 = [], v10 = [], uJ = [], vJ = [];
    const uv = (s, d) => { s = +s || 0; d = (+d || 0) * Math.PI / 180; return [+(-s * Math.sin(d)).toFixed(1), +(-s * Math.cos(d)).toFixed(1)]; };
    for (const p of list) {
      const c = p.current || {};
      const a = uv(c.wind_speed_10m, c.wind_direction_10m), b = uv(c.wind_speed_250hPa, c.wind_direction_250hPa);
      u10.push(a[0]); v10.push(a[1]); uJ.push(b[0]); vJ.push(b[1]);
    }
    send(res, { source: 'Open-Meteo', fetched: new Date().toISOString(), time: (list[0].current || {}).time || null, lats: LATS, lons: LONS, surface: { u: u10, v: v10 }, jet: { u: uJ, v: vJ } }, 10800);
  } catch (e) { fail(res, e); }
};
