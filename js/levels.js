/* levels.js - the level registry. A LEVEL is a graph of SEGMENTS, all pure data:

     LS.LEVELS[id] = {
       defaults   values every segment inherits (year, title, palette, intro, quips...)
       start      id of the first segment
       segments   { id: segment }
     }

   A SEGMENT is one stretch of scenery (what used to be a whole "era"):

     background        key into LS.Scenes (background.js)
     width             world width in pixels
     sceneX/sceneWidth optional: show only a slice of a bigger scene (see Background.build), so one
                       long stage can be cut into segments with no visible seam
     tint              optional colour wash over the scene art (palette of a placeholder route)
     ending            line shown on the Stage Clear screen when this route is finished
     lights            rim-light colour on the fighters, by world x
     music/bossMusic   patterns for the sequencer in audio.js
     start             where Jack appears (when he walks in from another segment only x is used)
     props             solid scenery that is only decoration (depth-sorted)
     breakables        crates, kegs, cases, amps: smash them for pickups
     waves             where the screen locks and who walks in
     year / title ...  optional overrides of the level defaults (HUD, stage card)

   and it ENDS in exactly one of:

     boss   { type, name, hp, trigger, lock, tagline }   key into LS.BOSSES (boss.js); beating
            him ends the route (Stage Clear)
     exit   { lock, at, options: [ { to, y: [min, max], label } ] }
            After the last wave the camera stops at `lock` and Jack may walk to the line x = `at`.
            Crossing it takes the option whose depth band `y` contains Jack's y at that moment
            (the closest band if he is in a gap; on a shared edge the option listed first wins).
            One option = a plain door (`y` can be omitted);
            several options = a PHYSICAL FORK chosen with the depth axis, no menu.

   Rules, checked by LS.validateLevel(): the graph is a tree (a route never reconnects with
   the one it left; a new fork is just another exit), every `to` exists, every segment is
   reachable, and depth bands of one exit do not overlap. Switching segment rebuilds the scenery,
   so the routes not taken stop existing.

   Dev flags: ?level=ID picks the level, ?seg=ID starts straight in a segment (any route),
   ?skip=N jumps to wave N of that segment (N past the last wave = its boss / exit).

   To add a decade: write a scene, its enemy types and boss class, describe its level here and
   point LS.ERAS at it with available: true. */
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

  // The title menu: slow and moody, so the stage lights have room to breathe.
  const slow = (r) => [r, _, _, _, r, _, _, _, r, _, _, _, r + 7, _, r + 5, _];
  const menuTheme = {
    bpm: 96, root: 82.41,
    bass: bars(slow, [0, 0, 5, 3]),
    lead: [
      12, _, _, _, _, _, 10, _, 7, _, _, _, _, _, _, _,
      12, _, _, _, _, _, 15, _, 14, _, 12, _, 10, _, _, _,
      17, _, _, _, 15, _, _, _, 12, _, _, _, 10, _, _, _,
      14, _, _, 12, _, _, 10, _, 7, _, _, _, _, _, _, _,
    ],
    kick: 'x.......x.x.....', snare: '....x.......x...', hat: '..x...x...x...x.',
  };
  LS.MENU_MUSIC = menuTheme;

  const stub = (year, theme) => ({ year, theme, available: false, title: 'COMING SOON' });

  // The era registry only tells the menus what exists; a playable era points at its level graph.
  LS.ERAS = {
    1950: stub('1955', 'The birth of rock and roll'),
    1960: stub('1967', 'The musical revolution'),
    1970: stub('1975', 'Classic rock and excess'),
    1980: { available: true, level: 'lastbar' },
  };

  // ======================================================================
  // Level 'lastbar' = Level 4 (1984): the Heavy Metal opening and the first fork
  // (docs/level-design.md). The original one-room stage is cut at ~40% into two segments that
  // share the same scene, so going from one to the other looks like simply walking on:
  //
  //   metal1 (0% - 40%) -+- top band     glam ----> boss (placeholder, Glam Metal ending)
  //                      +- middle band  metal2 --> THE KING OF RIFFS (Heavy Metal ending)
  //                      +- bottom band  disco ---> boss (placeholder, Disco ending)
  //
  // Segment x is local: every segment after the fork starts at scene x 1000 (`sceneX`).
  // `glam` and `disco` reuse the bar scene under a colour tint, with their own enemy mix, music
  // and boss stats, until their real scenery, enemies and bosses exist (#27, #28, #33).
  // The three routes have the same length (1400 px, two waves of ten enemies in total, then the
  // boss), so choosing one is a matter of style, not of distance.
  // ======================================================================
  const TOP = [LS.FLOOR_TOP, 203], MID = [203, 224], BOT = [224, LS.FLOOR_BOTTOM];
  const SCENE_W = 2400, FORK_X = 1000;   // the scene is 2400 px wide; the fork sits at ~40%

  // The opening: entrance and bar. It ends in the first fork.
  const metal1 = {
    background: 'lastBar',
    width: FORK_X,
    sceneWidth: SCENE_W,
    // Zones, left to right: entrance | bar | game room | backstage hall | stage
    lights: [{ to: 470, color: '#ff9ac8' }, { to: 916, color: '#8eeaff' }, { to: FORK_X, color: '#9ae8b0' }],
    music: barTheme,
    bossMusic: bossTheme,
    start: { x: 70, y: 214 },

    // Decoration that blocks movement but can't be broken
    props: [
      { type: 'table', x: 420, y: 189, rx: 20, ry: 6 },
      { type: 'table', x: 884, y: 188, rx: 20, ry: 6 },
    ],

    // drop: 'burger' (+35 HP) | 'beer' (+15 HP, +15 solo) | 'pick' (+45 solo) | 'random' | null
    breakables: [
      { type: 'crate', x: 250, y: 236, drop: null },
      { type: 'case', x: 170, y: 196, drop: 'beer' },
      { type: 'barrel', x: 540, y: 210, drop: 'beer' },
      { type: 'crate', x: 640, y: 238, drop: 'burger' },
      { type: 'barrel', x: 800, y: 205, drop: null },
      { type: 'amp', x: 950, y: 222, drop: 'pick' },
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
    ],

    // The first fork: three ways out, picked with the depth Jack crosses the line at.
    exit: {
      lock: 520, at: 980,
      options: [
        { to: 'glam', y: TOP, label: 'GLAM' },
        { to: 'metal2', y: MID, label: 'METAL' },
        { to: 'disco', y: BOT, label: 'DISCO' },
      ],
    },
    quips: { waves: ['I\'VE HAD TOUGHER CROWDS. BARELY.', 'THREE WAYS OUT. WHICH ONE HAS THE BEER?'] },
  };

  // Shared shape of the three routes after the fork (the remaining 60% of the scene).
  const route = (o) => Object.assign({
    background: 'lastBar', width: SCENE_W - FORK_X, sceneX: FORK_X, sceneWidth: SCENE_W,
    bossMusic: bossTheme, start: { x: 70, y: 214 },
  }, o);

  // Heavy Metal, the main route: the game room and the backstage hall, then the King.
  const metal2 = route({
    lights: [{ to: 416, color: '#9ae8b0' }, { to: 916, color: '#ffa090' }, { to: 1400, color: '#ffe09a' }],
    music: barTheme,
    props: [
      { type: 'pool', x: 190, y: 191, rx: 40, ry: 7 },
      { type: 'stack', x: 770, y: 188, rx: 20, ry: 6 },
      { type: 'case', x: 1012, y: 187, rx: 21, ry: 6 },
    ],
    breakables: [
      { type: 'crate', x: 50, y: 236, drop: 'beer' },
      { type: 'crate', x: 270, y: 240, drop: null },
      { type: 'barrel', x: 330, y: 206, drop: 'burger' },
      { type: 'case', x: 410, y: 200, drop: 'pick' },
      { type: 'crate', x: 470, y: 236, drop: 'burger' },
      { type: 'amp', x: 560, y: 205, drop: 'burger' },
      { type: 'barrel', x: 700, y: 238, drop: 'beer' },
      { type: 'case', x: 832, y: 208, drop: 'random' },
      { type: 'barrel', x: 1000, y: 205, drop: 'burger' },
      { type: 'case', x: 1330, y: 200, drop: 'pick' },
    ],
    waves: [
      { trigger: 230, lock: 0, spawns: [              // the game room: first punks
        { type: 'punk', side: 1, y: 210, delay: 0 },
        { type: 'punk', side: -1, y: 230, delay: 1.5 },
        { type: 'groupie', side: 1, y: 220, delay: 3.5 },
        { type: 'roadie', side: -1, y: 214, delay: 5.5 },
      ] },
      { trigger: 640, lock: 380, spawns: [            // the backstage hall: the last test before the King
        { type: 'roadie', side: 1, y: 208, delay: 0 },
        { type: 'punk', side: -1, y: 232, delay: 0.8 },
        { type: 'groupie', side: 1, y: 220, delay: 2.5 },
        { type: 'punk', side: 1, y: 215, delay: 5 },
        { type: 'roadie', side: -1, y: 238, delay: 7 },
        { type: 'punk', side: 1, y: 224, delay: 9 },
      ] },
    ],
    boss: {
      type: 'king', name: 'THE KING OF RIFFS', hp: 280, trigger: 1090, lock: 920,
      tagline: '"KNEEL BEFORE THE RIFF, AMATEUR."',
    },
    quips: { waves: ['A MOHAWK IN 1984? BOLD.', 'ONE LAST DOOR. THEN THE KING.'] },
    ending: 'ENDING 1 OF 4: LOYAL TO HEAVY METAL',
  });

  // Glam Metal (placeholder): lots of groupies, hairspray pink, faster tempo.
  const glam = route({
    title: 'GLAM METAL',
    tint: 'rgba(255,40,200,0.16)',
    lights: [{ to: 1400, color: '#ff7ad9' }],
    music: Object.assign({}, barTheme, { bpm: 150 }),
    props: metal2.props, breakables: metal2.breakables,
    waves: [
      { trigger: 230, lock: 0, spawns: [
        { type: 'groupie', side: 1, y: 206, delay: 0 },
        { type: 'groupie', side: -1, y: 232, delay: 1 },
        { type: 'groupie', side: 1, y: 214, delay: 2.5 },
        { type: 'punk', side: -1, y: 224, delay: 4.5 },
      ] },
      { trigger: 640, lock: 380, spawns: [
        { type: 'groupie', side: 1, y: 208, delay: 0 },
        { type: 'punk', side: -1, y: 232, delay: 0.8 },
        { type: 'groupie', side: 1, y: 220, delay: 2.5 },
        { type: 'groupie', side: -1, y: 214, delay: 4 },
        { type: 'roadie', side: 1, y: 238, delay: 6 },
        { type: 'punk', side: -1, y: 224, delay: 8 },
      ] },
    ],
    boss: {
      type: 'king', name: 'LADY LACQUER', hp: 260, trigger: 1090, lock: 920,
      tagline: '"DARLING, THE HAIR IS THE BAND."',
    },
    quips: { waves: ['TWENTY YEARS AND STILL NO ENCORE.', 'MORE HAIRSPRAY THAN SENSE.'], boss: 'THAT HAIR HAS MORE VOLUME THAN MY CAREER.' },
    ending: 'ENDING 2 OF 4: SHOWBIZ, DARLING',
  });

  // Disco (placeholder): punks and bouncers on a cyan dance floor, slower groove. The second fork
  // (Disco -> Pop) arrives with the Disco and Pop segments (#28, #29, #30).
  const disco = route({
    title: 'DISCO',
    tint: 'rgba(40,220,255,0.14)',
    lights: [{ to: 1400, color: '#8eeaff' }],
    music: Object.assign({}, barTheme, { bpm: 120 }),
    props: metal2.props, breakables: metal2.breakables,
    waves: [
      { trigger: 230, lock: 0, spawns: [
        { type: 'punk', side: 1, y: 210, delay: 0 },
        { type: 'punk', side: -1, y: 230, delay: 1.2 },
        { type: 'groupie', side: 1, y: 220, delay: 3 },
        { type: 'punk', side: -1, y: 214, delay: 4.5 },
      ] },
      { trigger: 640, lock: 380, spawns: [
        { type: 'punk', side: 1, y: 208, delay: 0 },
        { type: 'punk', side: -1, y: 232, delay: 0.8 },
        { type: 'groupie', side: 1, y: 220, delay: 2.5 },
        { type: 'punk', side: 1, y: 215, delay: 4.5 },
        { type: 'groupie', side: -1, y: 238, delay: 6.5 },
        { type: 'roadie', side: -1, y: 224, delay: 8 },
      ] },
    ],
    boss: {
      type: 'king', name: 'MIRROR BALL MARV', hp: 260, trigger: 1090, lock: 920,
      tagline: '"STAYIN\' ALIVE? NOT TONIGHT."',
    },
    quips: { waves: ['WHO TURNED THE FLOOR INTO A WEAPON?', 'MY SHOES ARE NOT MADE FOR THIS.'], boss: 'I DIDN\'T COME TO DANCE.' },
    ending: 'ENDING 3 OF 4: THE DANCE FLOOR WINS',
  });

  const lastBar = {
    // Inherited by every segment that does not set its own value.
    defaults: {
      stage: 'LEVEL 4',
      year: '1984',
      title: 'THE LAST BAR',
      theme: 'Glam rock, heavy metal and MTV culture',
      palette: { neon: '#ff2e88', cool: '#28dcff', gold: '#ffe14a' },
      enemyTypes: ['roadie', 'groupie', 'punk'],
      intro: [
        'FOR TWENTY YEARS, JACK RYDER HAS PLAYED EVERY DIVE BAR THAT WOULD HAVE HIM. TONIGHT\'S CROWD: ELEVEN PEOPLE. TWO WERE LOST.',
        'BUT WHEN THE LAST CHORD FADED, THE OLD JUKEBOX DID SOMETHING STRANGE... IT STARTED PLAYING EVERY DECADE AT ONCE.',
        'ROCK HISTORY IS OPEN FOR BUSINESS, AND EVERY ERA HAS A KING. FIRST STOP: 1984.',
      ],
      quips: {
        start: 'ANOTHER NIGHT, ANOTHER EMPTY ROOM.',
        waves: ['I\'VE HAD TOUGHER CROWDS. BARELY.'],
        boss: 'LET ME GUESS... YOU PEAKED IN \'72.',
        low: 'MY BACK HURTS MORE THAN MY PRIDE.',
        power: 'TIME FOR A SOLO.',
      },
      ending: 'THE ROAD ENDS HERE... FOR NOW',
    },
    start: 'metal1',
    segments: { metal1, metal2, glam, disco },
  };

  // ======================================================================
  // Level 'forktest': a development fixture, reached with ?level=forktest. It mirrors the two
  // forks planned for Level 4 (docs/level-design.md) with tiny segments, so the graph engine can
  // be tested end to end: parallel routes with their own lights, music, enemies and boss, and
  // a second fork that exists only inside one of them. The real routes replace it later.
  //
  //   metal1 -+- (top band)    glam ----------> boss GLAM
  //           +- (middle band) metal2 --------> boss METAL
  //           +- (bottom band) disco1 -+- (top)    disco2 -> boss DISCO
  //                                    +- (bottom) pop ----> boss POP
  // ======================================================================
  const ftWave = (types) => ({
    trigger: 300, lock: 100,
    spawns: types.map((type, i) => ({ type, side: i % 2 ? -1 : 1, y: 206 + i * 12, delay: i * 1.2 })),
  });
  const ftBoss = (name, hp, tagline) => ({ type: 'king', name, hp, trigger: 650, lock: 480, tagline });
  const ftExit = (options) => ({ lock: 480, at: 920, options });
  const ftSeg = (title, color, bpm, extra) => Object.assign({
    title, background: 'lastBar', width: 960, start: { x: 70, y: 214 },
    lights: [{ to: 960, color }],
    music: Object.assign({}, barTheme, { bpm }), bossMusic: bossTheme,
    props: [], breakables: [{ type: 'crate', x: 200, y: 232, drop: 'burger' }],
  }, extra);

  const forkTest = {
    defaults: Object.assign({}, lastBar.defaults, { stage: 'DEV', title: 'FORK TEST', year: '1984' }),
    start: 'metal1',
    segments: {
      metal1: ftSeg('HEAVY METAL', '#ff9ac8', 132, {
        waves: [ftWave(['groupie', 'roadie'])],
        exit: ftExit([
          { to: 'glam', y: TOP, label: 'GLAM' },
          { to: 'metal2', y: MID, label: 'METAL' },
          { to: 'disco1', y: BOT, label: 'DISCO' },
        ]),
      }),
      metal2: ftSeg('HEAVY METAL II', '#ffa090', 140, {
        waves: [ftWave(['roadie', 'punk'])],
        boss: ftBoss('METAL TITAN', 90, '"ONLY THE LOUD SURVIVE."'),
      }),
      glam: ftSeg('GLAM METAL', '#ff7ad9', 150, {
        waves: [ftWave(['groupie', 'groupie', 'punk'])],
        boss: ftBoss('LADY LACQUER', 60, '"DARLING, THE HAIR IS THE BAND."'),
      }),
      disco1: ftSeg('DISCO', '#8eeaff', 120, {
        waves: [ftWave(['punk', 'groupie'])],
        exit: ftExit([
          { to: 'disco2', y: [LS.FLOOR_TOP, 214], label: 'DISCO' },
          { to: 'pop', y: [214, LS.FLOOR_BOTTOM], label: 'POP' },
        ]),
      }),
      disco2: ftSeg('DISCO II', '#9ae8b0', 124, {
        waves: [ftWave(['punk', 'punk'])],
        boss: ftBoss('MIRROR BALL MARV', 70, '"STAYIN\' ALIVE? NOT TONIGHT."'),
      }),
      pop: ftSeg('POP', '#ffe09a', 118, {
        waves: [ftWave(['groupie', 'groupie'])],
        boss: ftBoss('CHART TOPPER', 50, '"I\'M ON EVERY RADIO."'),
      }),
    },
  };

  LS.LEVELS = { lastbar: lastBar, forktest: forkTest };

  LS.getEra = (key) => LS.ERAS[key];
  LS.getLevel = (id) => LS.LEVELS[id];

  /* A segment with the level defaults filled in. This is what the engine sees as `game.era`,
     so everything that reads era.year / era.title / era.quips / era.width keeps working. */
  LS.resolveSegment = (level, id) => {
    const seg = level.segments[id], era = Object.assign({ id }, level.defaults, seg);
    era.quips = Object.assign({}, level.defaults.quips, seg.quips);   // a segment can override single quips
    return era;
  };

  /* Which exit option does a player standing at depth `y` take? The band that contains it,
     or the closest band when he stands in a gap. */
  LS.pickExit = function (exit, y) {
    let best = exit.options[0], bestD = Infinity;
    for (const o of exit.options) {
      const d = !o.y ? 0 : y < o.y[0] ? o.y[0] - y : y > o.y[1] ? y - o.y[1] : 0;
      if (d < bestD) { best = o; bestD = d; }
    }
    return best;
  };

  /* Returns a list of problems (empty = the level is well formed). Run once at start-up, so a
     broken level shows up in the console immediately instead of as a stuck player later. */
  LS.validateLevel = function (level, id) {
    const errs = [], segs = level.segments || {}, ids = Object.keys(segs);
    const err = (m) => errs.push("level '" + id + "': " + m);
    if (!segs[level.start]) err("start segment '" + level.start + "' does not exist");

    const parents = {};
    for (const sid of ids) {
      const s = segs[sid], at = "segment '" + sid + "' ";
      if (!s.start || typeof s.start.x !== 'number' || typeof s.start.y !== 'number') err(at + 'needs start: { x, y }');
      if (!(s.width >= LS.W)) err(at + 'needs a width of at least one screen');
      if (s.sceneWidth && (s.sceneX || 0) + s.width > s.sceneWidth) err(at + 'sceneX + width runs past sceneWidth');
      if (!Array.isArray(s.waves)) err(at + 'needs a waves array (it can be empty)');
      if (!s.music) err(at + 'needs music');
      for (const k of ['props', 'breakables', 'lights']) if (!Array.isArray(s[k])) err(at + 'needs a ' + k + ' array (it can be empty)');
      if (!!s.boss === !!s.exit) err(at + 'must end in exactly one of boss / exit');
      if (!LS.Scenes[s.background || level.defaults.background]) err(at + "uses an unknown background '" + s.background + "'");
      if (s.boss) {
        if (!LS.BOSSES[s.boss.type]) err(at + "uses an unknown boss type '" + s.boss.type + "'");
        if (s.boss.lock > s.width - LS.W) err(at + 'boss.lock is past the last screen of the segment');
      }
      const ex = s.exit;
      if (!ex) continue;
      if (!ex.options || !ex.options.length) { err(at + 'exit has no options'); continue; }
      if (ex.lock > s.width - LS.W) err(at + 'exit.lock is past the last screen of the segment');
      // Jack is confined to the screen, so the line must be reachable with the camera at `lock`.
      if (ex.at <= ex.lock || ex.at > ex.lock + LS.W - 16) err(at + 'exit.at is not reachable on the locked screen');
      const bands = [];
      for (const o of ex.options) {
        if (!segs[o.to]) { err(at + "exit leads to unknown segment '" + o.to + "'"); continue; }
        (parents[o.to] = parents[o.to] || []).push(sid);
        if (ex.options.length > 1) {
          if (!o.y || !(o.y[0] < o.y[1]) || o.y[0] < LS.FLOOR_TOP || o.y[1] > LS.FLOOR_BOTTOM) err(at + "option '" + o.to + "' needs a depth band y inside the floor");
          else bands.push(o.y);
        }
      }
      bands.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < bands.length; i++) if (bands[i][0] < bands[i - 1][1]) err(at + 'exit depth bands overlap');
    }

    // Tree rule: nothing leads back into the start, and a route never merges with another.
    if (parents[level.start]) err('the start segment has an incoming exit');
    for (const sid of ids) if ((parents[sid] || []).length > 1) err("segment '" + sid + "' is reachable from several routes (" + parents[sid].join(', ') + ')');
    // Everything must be reachable from the start.
    const seen = {}, queue = [level.start];
    while (queue.length) {
      const sid = queue.pop();
      if (seen[sid] || !segs[sid]) continue;
      seen[sid] = true;
      if (segs[sid].exit) for (const o of segs[sid].exit.options || []) queue.push(o.to);
    }
    for (const sid of ids) if (!seen[sid]) err("segment '" + sid + "' cannot be reached from the start");
    return errs;
  };
})();
