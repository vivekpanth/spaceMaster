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
    /* solar wind: try the 2-hour plasma product, then the real-time 1-minute feed */
    const pickWind = list => {
      const r = rows(list).map(x => ({ v: x.speed ?? x.proton_speed ?? x.bulk_speed, n: x.density ?? x.proton_density, t: x.time_tag }))
        .filter(x => x.v != null && x.v !== '' && !isNaN(+x.v) && +x.v > 100)
        .sort((a, b) => String(a.t).localeCompare(String(b.t)));
      const last = r[r.length - 1];
      return last ? { speed: +last.v, density: last.n != null && last.n !== '' ? +last.n : null, time: last.t } : null;
    };
    let wind = sw.status === 'fulfilled' ? pickWind(sw.value) : null;
    if (!wind) { try { wind = pickWind(await getJSON(S + '/json/rtsw/rtsw_wind_1m.json')); } catch (e) { wind = null; } }
    send(res, {
      source: 'NOAA SWPC', fetched: new Date().toISOString(),
      observed: ov.value['Observation Time'] || null, forecast: ov.value['Forecast Time'] || null,
      aurora: Buffer.from(grid).toString('base64'), kp: kpNow, kpTime, wind
    }, 600);
  } catch (e) { fail(res, e); }
};
