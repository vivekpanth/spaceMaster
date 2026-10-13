// The latest full-disc photos of Earth from NASA's EPIC camera on DSCOVR, which sits at the Sun-Earth L1 point.
const { getJSON, send, fail } = require('./_util');
module.exports = async (req, res) => {
  try {
    const list = await getJSON('https://epic.gsfc.nasa.gov/api/natural');
    const imgs = (Array.isArray(list) ? list : []).map(x => {
      const d = String(x.date || ''), ymd = d.slice(0, 10).split('-');
      const base = 'https://epic.gsfc.nasa.gov/archive/natural/' + ymd.join('/');
      return {
        date: d.replace(' ', 'T') + 'Z', caption: x.caption || '',
        lat: x.centroid_coordinates && x.centroid_coordinates.lat, lon: x.centroid_coordinates && x.centroid_coordinates.lon,
        url: base + '/jpg/' + x.image + '.jpg', thumb: base + '/thumbs/' + x.image + '.jpg'
      };
    });
    if (!imgs.length) throw new Error('No EPIC images listed');
    send(res, { source: 'NASA EPIC', fetched: new Date().toISOString(), images: imgs }, 3600);
  } catch (e) { fail(res, e); }
};
