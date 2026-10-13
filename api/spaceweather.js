// Aurora forecast (OVATION), Kp index and solar wind, from NOAA's Space Weather Prediction Center.
const { getJSON, send, fail, rows } = require('./_util');
const S = 'https://services.swpc.noaa.gov';
module.exports = async (req, res) => {
  try {
    const [ov, kp, sw] = await Promise.allSettled([
      getJSON(S + '/json/ovation_aurora_latest.json'),
      getJSON(S + '/products/noaa-planetary-k-index.json'),
      getJSON(S + '/products/solar-wind/plasma-2-hour.json')
    ]);
    if (ov.status !== 'fulfilled') throw ov.reason;
    /* 360 x 181 grid of aurora probability (0-100), row = latitude + 90, column = longitude 0-359 */
    const grid = new Uint8Array(360 * 181);
    for (const c of ov.value.coordinates || []) {
      const lon = ((Math.round(c[0]) % 360) + 360) % 360, lat = Math.round(c[1]);
      if (lat < -90 || lat > 90) continue;
      grid[(lat + 90) * 360 + lon] = Math.max(0, Math.min(100, Math.round(c[2])));
    }
    let kpNow = null, kpTime = null;
    if (kp.status === 'fulfilled') {
      const r = rows(kp.value).filter(x => x.Kp != null || x.kp_index != null || x.kp != null);
      const last = r[r.length - 1];
      if (last) { kpNow = +(last.Kp ?? last.kp_index ?? last.kp); kpTime = last.time_tag || null; }
    }
    let wind = null;
    if (sw.status === 'fulfilled') {
      const r = rows(sw.value).filter(x => x.speed != null && x.speed !== '' && !isNaN(+x.speed));
      const last = r[r.length - 1];
      if (last) wind = { speed: +last.speed, density: last.density != null ? +last.density : null, time: last.time_tag };
    }
    send(res, {
      source: 'NOAA SWPC', fetched: new Date().toISOString(),
      observed: ov.value['Observation Time'] || null, forecast: ov.value['Forecast Time'] || null,
      aurora: Buffer.from(grid).toString('base64'), kp: kpNow, kpTime, wind
    }, 600);
  } catch (e) { fail(res, e); }
};
