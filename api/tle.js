// Live satellite orbit data (TLE) from CelesTrak, cached at the edge for 6 hours.
const GROUPS = { stations: 'stations', gps: 'gps-ops', geo: 'geo', weather: 'weather', starlink: 'starlink' };

module.exports = async (req, res) => {
  const group = String((req.query && req.query.group) || 'stations');
  if (!GROUPS[group]) { res.status(400).json({ error: 'Unknown group. Use one of: ' + Object.keys(GROUPS).join(', ') }); return; }
  try {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=' + GROUPS[group] + '&FORMAT=tle';
    const r = await fetch(url, { headers: { 'User-Agent': 'EarthSpaceLab/1.0 (educational simulation)' } });
    if (!r.ok) throw new Error('CelesTrak answered ' + r.status);
    const lines = (await r.text()).split(/\r?\n/).map(l => l.trimEnd()).filter(Boolean);
    const sats = [];
    for (let i = 0; i + 2 < lines.length + 1 && lines[i + 2]; i += 3) {
      if (lines[i + 1].startsWith('1 ') && lines[i + 2].startsWith('2 ')) sats.push([lines[i].trim(), lines[i + 1], lines[i + 2]]);
    }
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json({ group, source: 'CelesTrak', fetched: new Date().toISOString(), count: sats.length, sats });
  } catch (e) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    res.status(502).json({ error: String((e && e.message) || e) });
  }
};
