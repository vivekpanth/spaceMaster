// Shared helpers for the live-data proxies.
const UA = { 'User-Agent': 'EarthSpaceLab/1.0 (educational simulation)', 'Accept': 'application/json' };
async function getJSON(url, ms = 9000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) throw new Error(new URL(url).host + ' answered ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
function send(res, data, maxAge) {
  res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 4}`);
  res.status(200).json(data);
}
function fail(res, e) {
  res.setHeader('Cache-Control', 'public, s-maxage=120');
  res.status(502).json({ error: String((e && e.message) || e) });
}
/* NOAA "products" files are either an array of arrays with a header row, or an array of objects */
function rows(x) {
  if (!Array.isArray(x) || !x.length) return [];
  if (Array.isArray(x[0])) { const h = x[0]; return x.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); }
  return x;
}
module.exports = { getJSON, send, fail, rows };
