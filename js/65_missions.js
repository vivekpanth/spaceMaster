/* ================= MISSIONS MODE: guided real missions ================= */
const mT = id => getMission(id).T;
const atLeast = ms => () => Clock.now().getTime() >= ms;
function missionPanel(id) {
  const M = getMission(id);
  const s = B.sec('Mission time', 'Drag to jump anywhere in the mission.');
  const t0 = M.segs[0].t0, t1 = (M.T.splash || M.T.land) + 3600e3;
  const out = document.createElement('p'); out.className = 'help';
  B.slider(s, 'Day', 0, Math.ceil((t1 - t0) / 86400e3 * 10) / 10, 0.1, () => Math.max(0, (Clock.now().getTime() - t0) / 86400e3), v => { jumpTo(t0 + v * 86400e3, App.ts); }, v => 'day ' + fmt(v, 1));
  s.appendChild(out);
  const f = B.sec('View');
  B.chips(f, 'Path drawn around', [['auto', 'Auto'], ['geo', 'Earth'], ['moon', M.center === 'moon' ? 'Moon' : 'Moon'], ['helio', 'Sun']].filter(x => M.center === 'moon' ? x[0] !== 'helio' : x[0] !== 'moon'), () => MV.frame, v => { MV.frame = v; });
  B.buttons(f, [['Follow the spacecraft', () => camMission(M.center === 'mars' ? 2 : 0.5, 0.5, 0.4)], ['Earth and Moon', () => camFocus('earth', 130, 0.5, 1.2)], ['Landing site', () => camMoonSite(M, M.center === 'mars' ? 0.25 : 0.08)]]);
  if (M.center === 'mars') B.buttons(f, [['Inner planets', () => camFocus('sun', 160000, 0.3, 1.35)]]);
}
const MISSIONS = [
  {
    id: 'cy3', title: 'Chandrayaan-3', sub: 'India lands near the Moon\'s south pole, 2023', scene: 'earth', group: 'missions',
    setup() { startMission('cy3'); MV.frame = 'auto'; jumpTo(mT('cy3').launch - 60e3, 30); camMission(0.35, 0.6, 0.35); },
    steps: [
      { text: '14 July 2023, 2:35 pm in India. Chandrayaan-3 lifts off from Sriharikota on ISRO\'s LVM3 rocket. Everything you see follows the real dates.', dur: 12 },
      { text: 'It can\'t carry enough fuel to fly straight to the Moon. So it fires its engine each time it swings closest to Earth, stretching the orbit wider: 36,500 km, then 41,762, 51,400, 71,351 and 127,609 km.', run() { setTS(43200); camFocus('earth', 45, 0.4, 1.25, 0.9); }, until: atLeast(mT('cy3').tli - 6 * 3600e3), dur: 10, max: 45 },
      { text: '31 July: trans-lunar injection. One last push at the closest point sends it toward the spot where the Moon will be five days later.', run() { setTS(14400); camFocus('earth', 125, 0.5, 1.3, 0.8); }, until: atLeast(mT('cy3').loi - 2 * 3600e3), dur: 10, max: 45 },
      { text: '5 August: it fires against its motion near the Moon and the Moon\'s gravity captures it, into a long 164 × 18,074 km orbit that passes over the poles.', run() { jumpTo(mT('cy3').loi - 1800e3, 1200); camFocus('moon', 14, 0.5, 0.7, 0.9); }, dur: 13 },
      { text: 'Over 11 days it lowers the orbit step by step, firing at the lowest point each time, down to a circle about 150 km above the surface.', run() { setTS(21600); camFocus('moon', 4.5, 0.4, 0.8, 0.9); }, until: atLeast(Date.parse('2023-08-16T12:00:00Z')), dur: 10, max: 35 },
      { text: '17 August: the lander, Vikram, separates from the propulsion module. It drops into an orbit that dips to just 25 km above the surface.', run() { jumpTo(Date.parse('2023-08-20T13:00:00Z'), 900); camFocus('moon', 2.4, 0.6, 0.5, 0.9); }, dur: 11 },
      { text: '23 August, 6:03 pm India time: powered descent. Vikram slows from 1.7 km/s to a gentle touchdown in 19 minutes.', run() { jumpTo(mT('cy3').land - 20 * 60e3, 30); camMission(0.12, 0.8, 0.35); }, until: atLeast(mT('cy3').land + 20e3), dur: 10, max: 70 },
      { text: 'Touchdown at 69.4° S, near the Moon\'s south pole. India became the first country to land there, and the fourth to land softly on the Moon.', run() { setTS(60); camMoonSite(getMission('cy3'), 0.08); }, dur: 14 }
    ],
    panel() { missionPanel('cy3'); }
  },
  {
    id: 'a11', title: 'Apollo 11', sub: 'The first people on the Moon, July 1969', scene: 'earth', group: 'missions',
    setup() { startMission('a11'); MV.frame = 'auto'; jumpTo(mT('a11').launch - 30e3, 30); camMission(0.35, 0.6, 0.35); },
    steps: [
      { text: '16 July 1969: a Saturn V lifts Neil Armstrong, Buzz Aldrin and Michael Collins off from Kennedy Space Center in Florida.', dur: 11 },
      { text: 'After one and a half laps of Earth, the third stage fires for 6 minutes. Apollo leaves at 39,000 km/h on a path that loops around the Moon.', run() { jumpTo(mT('a11').tli - 600e3, 120); camFocus('earth', 6, 0.6, 0.6, 0.9); }, until: atLeast(mT('a11').tli + 1800e3), dur: 9, max: 30 },
      { text: 'Three days of coasting. Earth\'s gravity slows them all the way until the Moon\'s gravity takes over.', run() { setTS(14400); camFocus('earth', 125, 0.5, 1.3, 0.8); }, until: atLeast(mT('a11').loi - 3600e3), dur: 9, max: 40 },
      { text: '19 July: behind the Moon, out of radio contact, they fire the engine to slow down and enter lunar orbit.', run() { jumpTo(mT('a11').loi - 1800e3, 900); camFocus('moon', 3.2, 0.4, 0.5, 0.9); }, dur: 12 },
      { text: '20 July: the lander Eagle separates and descends. Near the end Armstrong flies it by hand past a field of boulders, with seconds of fuel to spare.', run() { jumpTo(mT('a11').land - 13 * 60e3, 20); camMission(0.1, 0.7, 0.35); }, until: atLeast(mT('a11').land + 20e3), dur: 10, max: 60 },
      { text: '"Houston, Tranquility Base here. The Eagle has landed." Six hours later Armstrong steps onto the Moon.', run() { setTS(1800); camMoonSite(getMission('a11'), 0.08); }, dur: 13 },
      { text: 'After 21½ hours on the surface, Eagle lifts off, rejoins Columbia, and on 22 July the main engine fires to head home.', run() { jumpTo(mT('a11').tei - 1800e3, 900); camFocus('moon', 4, 0.5, 0.6, 0.9); }, dur: 11 },
      { text: 'The trip home takes two and a half days.', run() { setTS(14400); camFocus('earth', 125, 0.5, 1.3, 0.8); }, until: atLeast(mT('a11').entry - 3600e3), dur: 9, max: 40 },
      { text: '24 July: the capsule hits the atmosphere at 40,000 km/h. The heat shield glows at 2,700 °C, then parachutes lower it into the Pacific.', run() { jumpTo(mT('a11').entry - 120e3, 15); camMission(0.25, 0.5, 0.3); }, until: atLeast(mT('a11').splash + 10e3), dur: 10, max: 80 }
    ],
    panel() { missionPanel('a11'); }
  },
  {
    id: 'm20', title: 'Perseverance to Mars', sub: 'A 7-month curve around the Sun, 2020-21', scene: 'earth', group: 'missions',
    setup() { startMission('m20'); MV.frame = 'auto'; jumpTo(mT('m20').launch - 60e3, 600); camMission(1.2, 0.6, 0.35); },
    steps: [
      { text: '30 July 2020: an Atlas V rocket launches the Perseverance rover from Florida and flings it out of Earth\'s gravity.', dur: 10 },
      { text: 'It doesn\'t aim at Mars. It coasts on a curved path around the Sun, timed so it reaches the meeting point at the same moment as Mars: 7 months and about 470 million km.', run() { MV.frame = 'auto'; setTS(259200); camFocus('sun', 160000, 0.3, 1.3, 0.8); }, until: atLeast(mT('m20').arrive - 3 * 86400e3), dur: 12, max: 45 },
      { text: () => 'Earth and Mars only line up for this every 26 months. The next launch windows: ' + marsWindows(new Date()).map(d => d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })).join(', ') + '.', dur: 12 },
      { text: '18 February 2021: "seven minutes of terror". It hits the thin Martian air at 20,000 km/h, then a heat shield, a parachute and a rocket-powered sky crane lower it to the ground.', run() { jumpTo(mT('m20').arrive - 20e3, 6); MV.frame = 'geo'; camMission(1.6, 0.6, 0.35); }, until: atLeast(mT('m20').land + 10e3), dur: 10, max: 90 },
      { text: 'Landed in Jezero Crater, an ancient lake bed, to search for signs of past life and collect rock samples.', run() { setTS(600); camMoonSite(getMission('m20'), 0.3); }, dur: 12 }
    ],
    panel() { missionPanel('m20'); }
  },
  {
    id: 'reentry', title: 'Coming home: re-entry', sub: 'From 28,000 km/h to a splashdown', scene: 'earth', group: 'missions',
    setup() { stopMission(); newWorld({ g: 1, a: 1, e: 0 }, -150, -10); setTS(60); App.cap = launchCapsule(App.sim, { id: 'cap', title: 'Crew capsule', lat: 10, lon: -150, alt: 400e3, az: 60, dv: 150, color: '#ff9a4c' }); camFollow(App.cap, 0.06, 2.4, 0.25, 1.4); },
    steps: [
      { text: 'A crew capsule leaves the Space Station\'s orbit by firing its engines backwards for a few minutes. Slowing by just 150 m/s is enough to dip into the air half a lap later.', dur: 11 },
      { text: 'It falls for about 25 minutes, speeding up as it drops.', until: () => App.cap && len(App.cap.r) - R < 125e3, dur: 6, max: 40, run() { setTS(90); } },
      { text: 'Entry interface, 120 km up. The capsule flies heat shield first at 7.5 km/s. The air in front can\'t get out of the way fast enough, so it squeezes and heats up.', run() { setTS(8); camFollow(App.cap, 0.05, 2.8, 0.15, 1.4); }, until: () => App.cap && App.cap._bo, dur: 8, max: 40 },
      { text: 'Plasma glows around the capsule at over 1,600 °C. Radio signals can\'t get through: the blackout. Inside, the crew feel the braking pressing them into their seats.', until: () => App.cap && App.cap._boEnd, dur: 10, max: 60 },
      { text: 'Below the plasma, the capsule has shed almost all its speed to the air. At about 10 km the parachutes open.', run() { setTS(15); }, until: () => App.cap && App.cap.chute, dur: 8, max: 60 },
      { text: 'Gently down at about 25 km/h. Re-entry turned the capsule\'s enormous speed into heat, which the heat shield carried away.', run() { setTS(30); camFollow(App.cap, 0.02, 1.8, 0.3, 1.2); }, until: () => App.cap && App.cap.landed, dur: 10, max: 60 }
    ],
    panel() { const s = B.sec('Re-entry'); B.slider(s, 'Deorbit burn', 60, 400, 10, () => App.capDv || 150, v => { App.capDv = v; }, v => fmt(v) + ' m/s'); B.buttons(s, [['Run again', () => { newWorld({ g: 1, a: 1, e: 0 }, -150, -10); setTS(60); App.cap = launchCapsule(App.sim, { id: 'cap', title: 'Crew capsule', lat: 10, lon: -150, alt: 400e3, az: 60, dv: App.capDv || 150, color: '#ff9a4c' }); camFollow(App.cap, 0.06, 2.4, 0.25, 1.4); }, 'primary']]); const h = document.createElement('p'); h.className = 'help'; h.textContent = 'A bigger burn means a steeper dive: hotter and harder braking, but shorter.'; s.appendChild(h); }
  },
  {
    id: 'lagrange', title: 'Lagrange points and JWST', sub: 'Parking spots where gravity balances', scene: 'earth', group: 'missions',
    setup() { stopMission(); newWorld({}, null, null, new Date()); LG.on = true; setTS(86400); camFocus('sun', 90000, 0.3, 1.4, 0.8); },
    steps: [
      { text: 'Around the Sun and Earth there are five special places, the Lagrange points. A spacecraft there stays in the same spot compared to Earth, because the pulls of the Sun and Earth plus its own orbiting motion balance out.', dur: 13 },
      { text: 'L4 and L5 sit 60° ahead of and behind Earth. Asteroids called Trojans collect at these points around Jupiter.', dur: 10 },
      { text: 'L1 and L2 are close to us: 1.5 million km, about four times the Moon\'s distance. The lines show the balance of forces: the blue zone is where Earth\'s gravity wins, and L1 and L2 sit at its edges.', run() { setTS(21600); camLagrange('earth', 1400, 1.35); }, dur: 13 },
      { text: 'The James Webb Space Telescope circles L2. From there the Sun, Earth and Moon are all on one side, so one sunshield keeps the telescope at −230 °C, cold enough to see faint infrared light.', run() { setTS(21600); camLagrange('jwst', 0.6, 0.35); }, dur: 13 },
      { text: 'SOHO watches the Sun from L1, between us and the Sun, giving early warning of solar storms heading our way.', run() { camLagrange('L1', 420, 0.8); }, dur: 11 }
    ],
    panel() { const s = B.sec('Lagrange points'); B.buttons(s, [['L1 and L2', () => camLagrange('earth', 1400, 1.35)], ['JWST', () => camLagrange('jwst', 0.6, 0.35)], ['All five', () => camFocus('sun', 90000, 0.3, 1.4)]]); }
  },
  {
    id: 'assist', title: 'Gravity assist', sub: 'How Voyager stole speed from Jupiter', scene: 'earth', group: 'missions',
    setup() { stopMission(); newWorld({}, null, null, new Date()); setTS(3600); camFocus('jupiter', BODY_R.Jupiter / R * 6, 0.5, 0.3, 1.0); setTimeout(openAssist, 600); },
    steps: [
      { text: 'Spacecraft can gain speed for free by flying close behind a moving planet. Watch the same flyby drawn from Jupiter (left) and from the Sun (right).', dur: 12 },
      { text: 'From Jupiter, the probe swings around and leaves exactly as fast as it arrived: the planet\'s gravity bends the path but gives no energy.', dur: 12 },
      { text: 'From the Sun, Jupiter is racing along its orbit at 13 km/s and drags the probe with it. The probe leaves much faster, and Jupiter slows by a tiny, unmeasurable amount.', dur: 13 },
      { text: 'Voyager 2 did this at Jupiter, Saturn, Uranus and Neptune, a lineup that happens once every 175 years. It is now over 20 billion km away, still flying.', dur: 13 }
    ],
    panel() { const s = B.sec('Gravity assist'); B.buttons(s, [['Open the flyby', openAssist, 'primary']]); }
  }
];
