// Earthquakes of magnitude 2.5+ in the last 30 days, from the US Geological Survey.
const { getJSON, send, fail } = require('./_util');
module.exports = async (req, res) => {
  try {
    const d = await getJSON('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_month.geojson');
    const q = (d.features || []).map(f => {
      const c = f.geometry.coordinates, p = f.properties;
      return [+c[0].toFixed(2), +c[1].toFixed(2), Math.round(c[2] || 0), +(p.mag || 0).toFixed(1), p.time, p.place || '', p.tsunami ? 1 : 0];
    });
    send(res, { source: 'USGS', fetched: new Date().toISOString(), fields: ['lon', 'lat', 'depthKm', 'mag', 'time', 'place', 'tsunami'], count: q.length, quakes: q }, 600);
  } catch (e) { fail(res, e); }
};
