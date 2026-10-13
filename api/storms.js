// Active tropical storms tracked by the US National Hurricane Center (Atlantic, East and Central Pacific).
const { getJSON, send, fail } = require('./_util');
const NAMES = { TD: 'Tropical depression', TS: 'Tropical storm', HU: 'Hurricane', STD: 'Subtropical depression', STS: 'Subtropical storm', PTC: 'Potential tropical cyclone', TY: 'Typhoon', PC: 'Post-tropical cyclone' };
module.exports = async (req, res) => {
  try {
    const d = await getJSON('https://www.nhc.noaa.gov/CurrentStorms.json');
    const parse = (n, s) => { if (typeof n === 'number') return n; const m = String(s || '').match(/([\d.]+)\s*([NSEW])/i); if (!m) return null; const v = +m[1]; return /[SW]/i.test(m[2]) ? -v : v; };
    const storms = (d.activeStorms || []).map(s => ({
      name: s.name, id: s.id, kind: NAMES[s.classification] || s.classification, cls: s.classification,
      windKt: s.intensity != null ? +s.intensity : null, pressure: s.pressure != null ? +s.pressure : null,
      lat: parse(s.latitudeNumeric, s.latitude), lon: parse(s.longitudeNumeric, s.longitude),
      moveDir: s.movementDir != null ? +s.movementDir : null, moveKt: s.movementSpeed != null ? +s.movementSpeed : null, updated: s.lastUpdate || null
    })).filter(s => s.lat != null && s.lon != null);
    send(res, { source: 'NOAA National Hurricane Center', fetched: new Date().toISOString(), storms }, 1800);
  } catch (e) { fail(res, e); }
};
