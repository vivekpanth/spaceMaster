# Earth & Space Lab

A real-time 3D simulation of Earth and space that runs in the browser.

- **Story**: 8 guided chapters on flight, frames of reference, orbits, Einstein's spacetime and the Sun.
- **Explore Earth**: the real Earth right now, with day and night, the Moon phase, tides and real eclipses.
- **Space**: the Moon, the Sun and all 8 planets at real positions, plus a true-scale switch, Kepler's laws, light delay and gravity on other worlds.
- **Sandbox**: launch planes, races, cannonballs and rockets, and switch gravity, air and Earth's spin on and off.

## Run locally

It is a static site. Serve the folder with any web server, for example `npx serve .`

`index.html` is generated from `shell.html` by `node build.js`, which adds a script tag for every file in `js/`.

## Credits

- Earth imagery: NASA Blue Marble and Black Marble (via the three-globe examples).
- Moon, Sun and planet textures: [Solar System Scope](https://www.solarsystemscope.com/textures/), CC BY 4.0.
- Sky positions, eclipses and rotation axes: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT).
- 3D rendering: [three.js](https://threejs.org) r147 (MIT).
- Satellite orbits: [CelesTrak](https://celestrak.org).
- Earthquakes: [US Geological Survey](https://earthquake.usgs.gov) (public domain).
- Aurora forecast, Kp index and solar wind: [NOAA Space Weather Prediction Center](https://www.swpc.noaa.gov) (public domain).
- Tropical storms: [NOAA National Hurricane Center](https://www.nhc.noaa.gov) (public domain).
- Winds: [Open-Meteo](https://open-meteo.com), CC BY 4.0.
- Daily whole-Earth photos: [NASA EPIC / DSCOVR](https://epic.gsfc.nasa.gov).
- Plate boundaries: Peter Bird (2003), *An updated digital model of plate boundaries*, converted by Hugo Ahlenius / Nordpil ([fraxen/tectonicplates](https://github.com/fraxen/tectonicplates)), Open Data Commons Attribution License.

## Live data

The `api/` folder holds Vercel serverless functions that fetch and cache the live feeds (`/api/tle`, `/api/quakes`, `/api/spaceweather`, `/api/winds`, `/api/storms`, `/api/epic`). If a feed is down, the site falls back to a clearly labelled typical pattern (aurora, winds) or simply hides that layer (earthquakes, storms).
