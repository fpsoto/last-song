/* levels.js - the time-travel registry. Each ERA is pure data:

     year / title      shown in the HUD and the stage card
     background        key into LS.Scenes (background.js)
     palette           signature colours of the decade
     lights            rim-light colour on the fighters, by world x
     music/bossMusic   patterns for the sequencer in audio.js
     props             solid scenery that is only decoration (depth-sorted)
     breakables        crates, kegs, cases, amps: smash them for pickups
     waves             where the screen locks and who walks in
     boss              key into LS.BOSSES (boss.js) + trigger zone
     intro / quips     narrative text

   Only 1980 is playable in this proof of concept. To add a decade: write a scene,
   its enemy types and boss class, then fill in its entry here and set available: true. */
(function () {
  'use strict';
  const LS = window.LS;
  const _ = null;

  // --- Music helpers: one bar = 16 steps, numbers are semitones above the root ---
  const gallop = (r) => [r, _, r, r, r, _, r, r, r, _, r, r, r + 7, _, r + 10, _];
  const drive = (r) => [r, r, r + 12, r, r, r + 12, r, r, r, r, r + 12, r, r + 10, r, r + 12, r];
  const bars = (fn, roots) => roots.reduce((acc, r) => acc.concat(fn(r)), []);

  const barTheme = {
    bpm: 132, root: 82.41, // E2
    bass: bars(gallop, [0, 3, 5, 7]),
    lead: [
      12, _, _, 10, _, _, 7, _, 10, _, _, 7, _, _, 3, _,
      3, _, 5, 7, _, _, 10, _, 7, _, _, _, _, _, _, _,
      5, _, _, 8, _, _, 12, _, 8, _, _, 5, _, _, 8, _,
      7, _, 11, 14, _, _, 11, _, 7, _, _, _, 6, _, 7, _,
    ],
    kick: 'x.....x.x.......', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.x.',
  };

  const bossTheme = {
    bpm: 164, root: 82.41,
    bass: bars(drive, [0, 0, 1, 0, 0, 0, 6, 5]),
    lead: [
      12, _, 13, _, 12, _, _, 7, _, _, 6, _, 7, _, _, _,
      12, _, 13, _, 15, _, _, 13, _, _, 12, _, 10, _, _, _,
      13, _, 12, _, 13, _, _, 8, _, _, 7, _, 8, _, _, _,
      18, _, 17, _, 15, _, 13, _, 12, _, 10, _, 7, _, 6, _,
    ],
    kick: 'x..x..x.x..x..x.', snare: '....x.......x..x', hat: 'xxxxxxxxxxxxxxxx',
  };

  const stub = (year, theme) => ({ year, theme, available: false, title: 'COMING SOON', waves: [], props: [] });

  LS.ERAS = {
    1950: stub('1955', 'The birth of rock and roll'),
    1960: stub('1967', 'The musical revolution'),
    1970: stub('1975', 'Classic rock and excess'),

    1980: {
      available: true,
      year: '1984',
      title: 'THE LAST BAR',
      theme: 'Glam rock, heavy metal and MTV culture',
      background: 'lastBar',
      width: 2400,
      palette: { neon: '#ff2e88', cool: '#28dcff', gold: '#ffe14a' },
      // Zones, left to right: entrance | bar | game room | backstage hall | stage
      lights: [
        { to: 470, color: '#ff9ac8' }, { to: 916, color: '#8eeaff' }, { to: 1416, color: '#9ae8b0' },
        { to: 1916, color: '#ffa090' }, { to: 2400, color: '#ffe09a' },
      ],
      music: barTheme,
      bossMusic: bossTheme,
      enemyTypes: ['roadie', 'groupie', 'punk'],
      start: { x: 70, y: 214 },

      // Decoration that blocks movement but can't be broken
      props: [
        { type: 'table', x: 420, y: 189, rx: 20, ry: 6 },
        { type: 'table', x: 884, y: 188, rx: 20, ry: 6 },
        { type: 'pool', x: 1190, y: 191, rx: 40, ry: 7 },
        { type: 'stack', x: 1770, y: 188, rx: 20, ry: 6 },
        { type: 'case', x: 2012, y: 187, rx: 21, ry: 6 },
      ],

      // drop: 'burger' (+35 HP) | 'beer' (+15 HP, +15 solo) | 'pick' (+45 solo) | 'random' | null
      breakables: [
        { type: 'crate', x: 250, y: 236, drop: null },
        { type: 'case', x: 170, y: 196, drop: 'beer' },
        { type: 'barrel', x: 540, y: 210, drop: 'beer' },
        { type: 'crate', x: 640, y: 238, drop: 'burger' },
        { type: 'barrel', x: 800, y: 205, drop: null },
        { type: 'amp', x: 950, y: 222, drop: 'pick' },
        { type: 'crate', x: 1050, y: 236, drop: 'beer' },
        { type: 'crate', x: 1270, y: 240, drop: null },
        { type: 'barrel', x: 1330, y: 206, drop: 'burger' },
        { type: 'case', x: 1410, y: 200, drop: 'pick' },
        { type: 'crate', x: 1470, y: 236, drop: 'burger' },
        { type: 'amp', x: 1560, y: 205, drop: 'burger' },
        { type: 'barrel', x: 1700, y: 238, drop: 'beer' },
        { type: 'case', x: 1832, y: 208, drop: 'random' },
        { type: 'barrel', x: 2000, y: 205, drop: 'burger' },
        { type: 'case', x: 2330, y: 200, drop: 'pick' },
      ],

      // trigger: player x that starts the wave | lock: camera x while it lasts
      // side: +1 enters from the right edge, -1 from the left | delay in seconds
      waves: [
        { trigger: 300, lock: 100, spawns: [            // the entrance: a gentle warm-up
          { type: 'groupie', side: 1, y: 206, delay: 0 },
          { type: 'roadie', side: 1, y: 232, delay: 1.5 },
          { type: 'groupie', side: 1, y: 220, delay: 4 },
        ] },
        { trigger: 760, lock: 520, spawns: [            // the bar
          { type: 'roadie', side: 1, y: 206, delay: 0 },
          { type: 'groupie', side: -1, y: 232, delay: 1.2 },
          { type: 'groupie', side: 1, y: 212, delay: 3 },
          { type: 'roadie', side: -1, y: 226, delay: 5 },
        ] },
        { trigger: 1230, lock: 960, spawns: [           // the game room: first punks
          { type: 'punk', side: 1, y: 210, delay: 0 },
          { type: 'punk', side: -1, y: 230, delay: 1.5 },
          { type: 'groupie', side: 1, y: 220, delay: 3.5 },
          { type: 'roadie', side: -1, y: 214, delay: 5.5 },
        ] },
        { trigger: 1640, lock: 1380, spawns: [          // the backstage hall: the last test before the King
          { type: 'roadie', side: 1, y: 208, delay: 0 },
          { type: 'punk', side: -1, y: 232, delay: 0.8 },
          { type: 'groupie', side: 1, y: 220, delay: 2.5 },
          { type: 'punk', side: 1, y: 215, delay: 5 },
          { type: 'roadie', side: -1, y: 238, delay: 7 },
          { type: 'punk', side: 1, y: 224, delay: 9 },
        ] },
      ],

      boss: {
        type: 'king', name: 'THE KING OF RIFFS', hp: 280, trigger: 2090, lock: 1920,
        tagline: '"KNEEL BEFORE THE RIFF, AMATEUR."',
      },

      intro: [
        'FOR TWENTY YEARS, JACK RYDER HAS PLAYED EVERY DIVE BAR THAT WOULD HAVE HIM. TONIGHT\'S CROWD: ELEVEN PEOPLE. TWO WERE LOST.',
        'BUT WHEN THE LAST CHORD FADED, THE OLD JUKEBOX DID SOMETHING STRANGE... IT STARTED PLAYING EVERY DECADE AT ONCE.',
        'ROCK HISTORY IS OPEN FOR BUSINESS, AND EVERY ERA HAS A KING. FIRST STOP: 1984.',
      ],
      quips: {
        start: 'ANOTHER NIGHT, ANOTHER EMPTY ROOM.',
        waves: [
          'I\'VE HAD TOUGHER CROWDS. BARELY.',
          'TWENTY YEARS AND STILL NO ENCORE.',
          'A MOHAWK IN 1984? BOLD.',
          'ONE LAST DOOR. THEN THE KING.',
        ],
        boss: 'LET ME GUESS... YOU PEAKED IN \'72.',
        low: 'MY BACK HURTS MORE THAN MY PRIDE.',
        power: 'TIME FOR A SOLO.',
      },
    },
  };

  LS.getEra = (key) => LS.ERAS[key];
})();
