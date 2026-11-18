/* game.js - the conductor. Owns the global state machine and the level flow.

   Screen states:  title -> controls
                   title -> intro -> playing <-> paused
                                     playing -> victory | gameover
   A level is a graph of segments (levels.js); `era` below is the segment being played.
   Level phases (while playing):
     advance    the way is open; walking past a trigger starts the next wave / the boss,
                and once the waves are done the segment's exit (a door or a fork) opens
     wave       screen locked until every enemy of the wave is down
     bossIntro  scripted entrance, input frozen
     boss       the fight
     transition fade out, load the next segment, fade in (input frozen)
     bossDead / playerDead   short pause before the result screen */
(function () {
  'use strict';
  const LS = window.LS;
  const NO_INPUT = { down: {}, pressed: {} };

  const G = (LS.game = {
    state: 'title', stateT: 0, t: 0,
    menu: 0, introIndex: 0, introT: 0,
    era: null, player: null, enemies: [], boss: null, projectiles: [], props: [],
    breakables: [], items: [], solids: [],
    phase: 'advance', phaseT: 0, waveIndex: 0, pending: [],
    hitstop: 0, slowT: 0, score: 0, cardT: 0, noCharge: false,
    bubble: null, target: null, targetT: 0, lowWarned: false,
    level: null, segId: null, startSeg: null, builtSeg: null, route: [], pendingSeg: null, fade: 0,
  });

  G.setState = function (s) { G.state = s; G.stateT = 0; };

  G.init = function () {
    // ?level=ID picks a level graph, ?seg=ID starts straight in one of its segments (any route).
    let levelId = LS.params.get('level') || LS.getEra('1980').level;
    if (!LS.getLevel(levelId)) { console.error("unknown level '" + levelId + "', using 'lastbar'"); levelId = 'lastbar'; }
    G.level = LS.getLevel(levelId);
    LS.validateLevel(G.level, levelId).forEach((m) => console.error(m));
    G.startSeg = LS.params.get('seg') || G.level.start;
    if (!G.level.segments[G.startSeg]) { console.error("unknown segment '" + G.startSeg + "'"); G.startSeg = G.level.start; }
    G.era = LS.resolveSegment(G.level, G.startSeg);
    G.segId = G.startSeg;
    LS.Background.build(G.era);        // backdrop of the title screen
    G.builtSeg = G.segId;
    LS.Camera.reset(G.era.width);
    // Development shortcuts: ?start=1 jumps into the level, ?skip=N jumps to wave N / the boss.
    if (LS.params.get('start') === '1') {
      G.startLevel();
      const skip = parseInt(LS.params.get('skip'), 10);
      if (skip) G.debugSkip(skip);
    }
    // ?screen=controls|intro|paused opens a given screen directly (used for visual checks).
    const screen = LS.params.get('screen');
    if (screen) G.setState(screen);
  };

  /* Speech bubble over Jack's head. */
  G.say = function (text, delay) { G.bubble = { text, t: 2.8, delay: delay || 0 }; };

  /* Builds a segment of the level graph: scenery, props, music, camera. `carry` is true when Jack
     walks in from the previous segment (he keeps his health, score and depth, and only his x
     resets); false for a fresh start. Nothing of the segment left behind survives, which is what
     makes a route, once taken, unreachable again. */
  G.loadSegment = function (id, carry) {
    const era = LS.resolveSegment(G.level, id);
    G.era = era; G.segId = id;
    if (!carry) G.route = [];
    G.route.push(id);
    // The scene art is static, so a retry in the same segment (or the build done by init) reuses it.
    if (G.builtSeg !== id) { LS.Background.build(era); G.builtSeg = id; }
    G.enemies = []; G.boss = null; G.projectiles = []; G.pending = []; G.items = [];
    G.props = era.props;
    G.breakables = era.breakables.map((b) => new LS.Breakable(b.type, b.x, b.y, b.drop));
    G.solids = G.props.concat(G.breakables);
    G.phase = 'advance'; G.phaseT = 0; G.waveIndex = 0;
    G.cardT = 0; G.target = null; G.targetT = 0; G.bubble = null;
    LS.Effects.reset();
    LS.Camera.reset(era.width);
    LS.Audio.playMusic(era.music);
    if (carry) {
      const p = G.player;
      p.x = era.start.x; p.vx = 0; p.setState('idle');
      p.y = LS.clamp(p.y, LS.FLOOR_TOP, LS.FLOOR_BOTTOM);
    }
  };

  /* Back to the title screen. Its backdrop is the scene of the level's first segment, so a run that
     ended in a tinted route (Glam, Disco) does not leave that tint on the menu. */
  G.toTitle = function () {
    G.era = LS.resolveSegment(G.level, G.startSeg); G.segId = G.startSeg;
    if (G.builtSeg !== G.startSeg) { LS.Background.build(G.era); G.builtSeg = G.startSeg; }
    G.setState('title');
  };

  G.startLevel = function () {
    G.player = new LS.Player(0, 0);
    const hp = parseInt(LS.params.get('hp'), 10);
    if (hp) G.player.hp = G.player.lagHp = hp;
    const pw = parseInt(LS.params.get('power'), 10);
    if (pw) G.player.power = Math.min(100, pw);
    G.hitstop = 0; G.slowT = 0; G.score = 0; G.noCharge = false; G.lowWarned = false;
    G.pendingSeg = null; G.fade = 0;
    G.loadSegment(G.startSeg, false);        // a retry starts again from the level's first segment
    const era = G.era;
    G.player.x = era.start.x; G.player.y = era.start.y;
    G.say(era.quips.start, 3);
    // ?spawn=punk,roadie puts those enemies next to Jack right away (development aid)
    const spawn = LS.params.get('spawn');
    if (spawn) spawn.split(',').forEach((type, i) => G.enemies.push(new LS.Enemy(type, G.player.x + 70 + i * 34, 200 + i * 14)));
    G.setState('playing');
  };

  /* Development aid: ?seq=jump:2,punch:2.25 presses those actions once the game clock passes each time. */
  const seqDone = {};
  function runSeq() {
    const seq = LS.params.get('seq');
    if (!seq) return;
    seq.split(',').forEach((s) => {
      const [action, at] = s.split(':');
      if (!seqDone[s] && G.t >= parseFloat(at)) { seqDone[s] = true; LS.Input.pressed[action] = true; }
    });
  }

  /* What the player is walking towards: the next wave, else the boss, else the segment's exit. */
  G.goal = function (era, n) { return era.waves[n] || era.boss || era.exit; };

  /* Jump straight to wave n (0-based) or, when n >= number of waves, to the boss / the exit. */
  G.debugSkip = function (n) {
    const era = G.era, next = G.goal(era, n);
    G.enemies = []; G.pending = []; G.projectiles = [];
    G.waveIndex = Math.min(n, era.waves.length);
    G.phase = 'advance';
    // an exit has no trigger: start the player just inside the locked screen, like the boss trigger
    G.player.x = (next.trigger !== undefined ? next.trigger : next.lock + 60) - 30;
    LS.Camera.maxX = next.lock;
    LS.Camera.x = LS.clamp(G.player.x - 200, 0, next.lock);
    G.cardT = 3;
  };

  // ---------------------------------------------------------------------
  // Solo meter, pickups and destruction
  // ---------------------------------------------------------------------
  G.addPower = function (n) {
    const p = G.player, before = p.power;
    p.power = Math.min(p.powerMax, p.power + n);
    if (before < p.powerMax && p.power >= p.powerMax) {
      LS.Audio.sfx('ready');
      LS.Effects.text(p.x, p.y - 80, 'SOLO READY!', '#28dcff');
      G.say(G.era.quips.power, 0.3);
    }
  };

  G.spawnItem = function (kind, x, y) { G.items.push(new LS.Item(kind, x, y)); };

  G.breakProp = function (b) {
    b.remove = true;
    LS.Effects.debris(b.x, b.y - b.height * 0.5, b.cfg.debris, 12, b.y);
    LS.Effects.dust(b.x, b.y);
    LS.Audio.sfx(b.cfg.sfx);
    LS.Camera.shake(2.5);
    G.score += 50;
    const kind = b.drop === 'random' ? LS.Props.rollDrop() : b.drop;
    if (kind) G.spawnItem(kind, b.x, b.y);
  };

  /* Picks up an item if it would actually help (so a burger is never wasted at full health). */
  function tryPickup(it) {
    const p = G.player, c = it.cfg;
    const helpsHp = c.hp > 0 && p.hp < p.maxHp, helpsPower = c.power > 0 && p.power < p.powerMax;
    if (!helpsHp && !helpsPower) return false;
    if (helpsHp) { p.hp = Math.min(p.maxHp, p.hp + c.hp); p.lagHp = Math.max(p.lagHp, p.hp); }
    if (helpsPower) G.addPower(c.power);
    LS.Effects.text(p.x, p.y - 70, c.label, c.color);
    LS.Audio.sfx('pickup');
    return true;
  }

  function updateItems(dt) {
    const p = G.player;
    for (const it of G.items) {
      it.update(dt);
      if (!it.remove && p.hp > 0 && it.z < 12 && Math.abs(it.x - p.x) < 14 && Math.abs(it.y - p.y) < 10 && tryPickup(it)) it.remove = true;
    }
    G.items = G.items.filter((it) => !it.remove);
  }

  /* The Last Solo: a shockwave around Jack that damages and knocks down everything nearby,
     smashes scenery and wipes out the boss' shockwaves. Called by the player at the end of
     the wind-up. KOs caused by the blast don't refill the meter. */
  G.superBlast = function (p) {
    const RANGE = 125, LANE = 48;
    const def = { dmg: 30, kb: 230, knockdown: true, heavy: true, hitY: 30 };
    G.noCharge = true;
    const targets = G.enemies.concat(G.boss ? [G.boss] : [], G.breakables);
    for (const f of targets) {
      if (!f.hittable() || Math.abs(f.x - p.x) > RANGE || Math.abs(f.y - p.y) > LANE) continue;
      const dir = f.x >= p.x ? 1 : -1;
      const ko = f.takeHit(def, dir);
      G.onHit(p, f, def, ko);
    }
    for (const pr of G.projectiles) if (Math.abs(pr.x - p.x) < RANGE) pr.dead = true;
    G.noCharge = false;
    LS.Effects.ring(p.x, p.y, RANGE);
    LS.Effects.flash(0.7, '#9ae8ff');
    LS.Effects.text(p.x, p.y - 84, 'LAST SOLO!', '#ffe14a');
    LS.Camera.shake(8);
    LS.Audio.sfx('blast');
  };

  // ---------------------------------------------------------------------
  // Events raised by the simulation (combat.js / entity.js)
  // ---------------------------------------------------------------------
  /* `attacker` is null for projectiles. All the "juice" for a hit is triggered here,
     which keeps combat.js free of any presentation code. */
  G.onHit = function (attacker, target, def, ko) {
    // Scenery: a small spark, and a big crash when it finally breaks.
    if (target.team === 'prop') {
      LS.Effects.spark(target.x, target.y - target.height * 0.6, false);
      G.hitstop = 0.04;
      LS.Audio.sfx('hit');
      if (ko) G.breakProp(target);
      return;
    }

    // A blow absorbed by Jack's guard: a small ping instead of the full impact (the player sets
    // `hitResult` in takeHit, so combat.js still knows nothing about blocking). A chip KO falls
    // through to the normal presentation below.
    if (target.team === 'player' && target.hitResult === 'block' && !ko) {
      const fx = target.x + target.facing * 10, fy = target.y - target.z - 32;
      LS.Effects.ring(fx, fy, 14);
      LS.Effects.spark(fx, fy, false);
      LS.Effects.text(target.x, target.y - 72, 'BLOCK', '#b04dff');
      G.hitstop = 0.03;
      LS.Camera.shake(def.heavy ? 2.5 : 0.8);
      LS.Audio.sfx('block');
      return;
    }

    const heavy = !!def.heavy || ko;
    const dir = attacker ? attacker.facing : (target.facing * -1);
    LS.Effects.spark(target.x - dir * 5, target.y - target.z - (def.hitY || 30), heavy);
    G.hitstop = heavy ? 0.09 : 0.05;      // freeze a few frames so the blow has weight
    LS.Camera.shake(heavy ? 4 : 1.5);
    LS.Audio.sfx(heavy ? 'heavy' : 'hit');

    if (target.team === 'enemy') {
      G.target = target; G.targetT = 3;
      G.score += heavy ? 200 : 100;
      if (heavy) LS.Effects.text(target.x, target.y - 70, LS.pick(['POW!', 'WHAM!', 'CRACK!', 'KRANG!']));
      if (ko) {
        LS.Audio.sfx('ko');
        G.score += target.isBoss ? 5000 : target.cfg.score;
        if (!G.noCharge && !target.isBoss) G.addPower(target.cfg.charge || 20); // every KO charges the solo
      }
    } else {
      LS.Audio.sfx('hurt');
      if (target.hitResult === 'break') { // the guard could not take it
        LS.Audio.sfx('guardbreak');
        LS.Effects.text(target.x, target.y - 72, 'GUARD BREAK!', '#ff3b30');
      }
      if (!G.lowWarned && target.hp > 0 && target.hp < target.maxHp * 0.3) {
        G.lowWarned = true;
        G.say(G.era.quips.low, 0.8);
      }
    }
  };

  /* `soft` landings (Jack's own jumps) only raise a bit of dust. */
  G.onLand = function (f, soft) {
    LS.Effects.dust(f.x, f.y);
    if (soft) return;
    LS.Audio.sfx('thud');
    LS.Camera.shake(f.isBoss ? 4 : 2);
  };

  // ---------------------------------------------------------------------
  // Level flow
  // ---------------------------------------------------------------------
  /* Jack walked through an exit option: start the transition into its segment. */
  G.takeExit = function (option) {
    G.pendingSeg = option.to;
    G.phase = 'transition'; G.phaseT = 0; G.fade = 0;
    G.bubble = null;
    LS.Audio.sfx('go');
  };

  function updatePhase() {
    const era = G.era, cam = LS.Camera, p = G.player;

    if (p.hp <= 0 && G.phase !== 'playerDead' && G.phase !== 'bossDead') {
      G.phase = 'playerDead'; G.phaseT = 0;
      LS.Audio.stopMusic();
      LS.Audio.sfx('defeat');
    }

    switch (G.phase) {
      case 'advance': {
        const wave = era.waves[G.waveIndex];
        const next = wave || era.boss || era.exit;
        cam.minX = 0;
        cam.maxX = next.lock; // the camera can't scroll past the next arena
        if (!wave && !era.boss) {
          // The segment's exit: no trigger, the screen just stops and the way out stays open.
          // The depth (y) at which Jack crosses the line picks the option: a physical fork.
          if (p.x > era.exit.at && p.hp > 0) G.takeExit(LS.pickExit(era.exit, p.y));
          break;
        }
        if (p.x > next.trigger) {
          G.phaseT = 0;
          cam.minX = cam.maxX = next.lock; // lock the screen
          if (wave) {
            G.phase = 'wave';
            G.pending = wave.spawns.map((s) => Object.assign({}, s));
          } else {
            G.phase = 'bossIntro';
            G.boss = new LS.BOSSES[era.boss.type](next.lock + LS.W + 40, 212, era.boss);
            G.bubble = null;
            LS.Audio.stopMusic();
            LS.Audio.sfx('warning');
          }
        }
        break;
      }
      case 'wave': {
        const wave = era.waves[G.waveIndex];
        G.pending = G.pending.filter((s) => {
          if (G.phaseT < s.delay) return true;
          const x = s.side > 0 ? wave.lock + LS.W + 24 : wave.lock - 24; // walk in from off-screen
          G.enemies.push(new LS.Enemy(s.type, x, s.y));
          return false;
        });
        if (!G.pending.length && !G.enemies.length) {
          G.say(era.quips.waves[G.waveIndex % era.quips.waves.length], 0.4);
          G.phase = 'advance'; G.phaseT = 0; G.waveIndex++;
          LS.Audio.sfx('go');
        }
        break;
      }
      case 'transition': {
        // Fade to black, swap the segment while nothing is visible, fade back in.
        const FADE = 0.45;
        if (G.pendingSeg) {
          G.fade = Math.min(1, G.phaseT / FADE);
          if (G.fade >= 1) {
            const id = G.pendingSeg;
            G.pendingSeg = null;
            G.loadSegment(id, true);
            G.phase = 'transition'; G.phaseT = 0;   // loadSegment resets the phase: keep fading in
          }
        } else {
          G.fade = Math.max(0, 1 - G.phaseT / FADE);
          if (G.fade <= 0) { G.phase = 'advance'; G.phaseT = 0; }
        }
        break;
      }
      case 'bossIntro':
        if (G.phaseT > 3.6) {
          G.phase = 'boss'; G.phaseT = 0;
          LS.Audio.playMusic(era.bossMusic);
          G.say(era.quips.boss, 0.2);
        }
        break;
      case 'boss':
        if (G.boss.hp <= 0) {
          G.phase = 'bossDead'; G.phaseT = 0;
          G.slowT = 1.1;               // slow motion on the final blow
          G.projectiles = [];
          LS.Effects.flash(0.9);
          LS.Camera.shake(7);
          LS.Audio.stopMusic();
        }
        break;
      case 'bossDead':
        if (G.phaseT > 2.6) { G.setState('victory'); LS.Audio.sfx('victory'); }
        break;
      case 'playerDead':
        if (G.phaseT > 2.4) G.setState('gameover');
        break;
    }
  }

  function updatePlaying(dt) {
    const I = LS.Input, cam = LS.Camera, p = G.player;

    if (I.pressed.pause) {
      G.setState('paused');
      LS.Audio.sfx('pause'); LS.Audio.duck(true);
      return;
    }
    if (LS.DEBUG) {
      if (I.pressed.dbg1) G.debugSkip(1);
      if (I.pressed.dbg2) G.debugSkip(G.era.waves.length);
      if (I.pressed.dbg3) { if (G.boss) G.boss.hp = 10; p.power = p.powerMax; }
    }

    // These run in real time, even during hit-stop.
    G.cardT += dt;
    LS.Effects.update(dt);
    cam.updateShake(dt);
    if (G.targetT > 0) G.targetT -= dt;

    // Hit-stop: skip the simulation for a few frames after an impact.
    if (G.hitstop > 0) { G.hitstop -= dt; return; }
    if (G.slowT > 0) { G.slowT -= dt; dt *= 0.3; }
    G.phaseT += dt;

    // --- fighters ---
    const frozen = G.phase === 'bossIntro' || G.phase === 'transition' || G.cardT < 1.0;
    if (frozen && (p.state === 'walk')) p.setState('idle');
    if (frozen) p.moving = false;
    p.update(dt, frozen ? NO_INPUT : I, G);
    for (const e of G.enemies) e.update(dt, G);
    if (G.boss) G.boss.update(dt, G);
    G.enemies = G.enemies.filter((e) => !e.remove);
    if (G.target && G.target.remove) G.targetT = Math.min(G.targetT, 0.6);

    // --- projectiles, scenery, pickups ---
    for (const pr of G.projectiles) { pr.t += dt; pr.x += pr.vx * dt; if (pr.t > pr.life) pr.dead = true; }
    G.projectiles = G.projectiles.filter((pr) => !pr.dead);
    for (const b of G.breakables) b.update(dt);
    updateItems(dt);

    // --- combat + collisions ---
    LS.Combat.update(G);
    G.breakables = G.breakables.filter((b) => !b.remove);
    G.solids = G.props.concat(G.breakables); // broken scenery stops blocking the way
    const Col = LS.Collision;
    Col.separate(G.enemies, dt);
    // The player is confined to the visible screen; enemies may be off-screen (they walk in).
    Col.pushOutProps(p, G.solids);
    Col.confine(p, Math.max(14, cam.x + 14), Math.min(G.era.width - 14, cam.x + LS.W - 14));
    // Once an enemy has walked into view it stays in the arena, so it can't be knocked out of reach.
    for (const e of G.enemies) {
      if (e.z === 0) Col.pushOutProps(e, G.solids);
      if (!e.entered && e.x > cam.x + 18 && e.x < cam.x + LS.W - 18) e.entered = true;
      if (e.entered) Col.confine(e, cam.x + 12, cam.x + LS.W - 12);
      else Col.confine(e, -60, G.era.width + 60);
    }
    if (G.boss && G.phase !== 'bossIntro') { Col.pushOutProps(G.boss, G.solids); Col.confine(G.boss, cam.x + 16, cam.x + LS.W - 16); }

    updatePhase();
    cam.update(dt, p);

    if (G.bubble) {
      if (G.bubble.delay > 0) G.bubble.delay -= dt;
      else if ((G.bubble.t -= dt) <= 0) G.bubble = null;
    }
  }

  // ---------------------------------------------------------------------
  // Main update
  // ---------------------------------------------------------------------
  G.update = function (dt) {
    const I = LS.Input, A = LS.Audio;
    G.t += dt; G.stateT += dt;
    if (I.pressed.mute) A.toggleMute();
    if (LS.params.get('auto') === '1' && G.state === 'playing') I.autopilot(G);
    if (G.state === 'playing') runSeq();
    A.update();
    const ok = I.pressed.start || I.pressed.tap; // "confirm" in menus

    switch (G.state) {
      case 'title':
        if (I.pressed.up || I.pressed.down) { G.menu = 1 - G.menu; A.sfx('select'); }
        if (ok || I.pressed.punch) {
          A.sfx('confirm');
          if (G.menu === 0) { G.introIndex = 0; G.introT = 0; G.setState('intro'); }
          else G.setState('controls');
        }
        break;

      case 'controls':
        if (ok || I.pressed.pause || I.pressed.punch) { A.sfx('select'); G.setState('title'); }
        break;

      case 'intro': {
        const text = G.era.intro[G.introIndex], before = Math.floor(G.introT * 42);
        G.introT += dt;
        if (before < text.length && Math.floor(G.introT * 42) % 3 === 0 && Math.floor(G.introT * 42) !== before) A.sfx('type');
        const done = G.introT * 42 >= text.length;
        if (ok || I.pressed.punch || (done && G.introT > text.length / 42 + 3.5)) {
          if (!done) G.introT = 999;           // first press: reveal the whole card
          else if (++G.introIndex >= G.era.intro.length) G.startLevel();
          else G.introT = 0;
        }
        if (I.pressed.pause) G.startLevel();   // ESC skips the intro
        break;
      }

      case 'playing':
        updatePlaying(dt);
        break;

      case 'paused':
        if (I.pressed.pause || I.pressed.start) { A.sfx('pause'); A.duck(false); G.setState('playing'); }
        break;

      case 'victory':
      case 'gameover':
        LS.Effects.update(dt);
        // Very short gate: `pressed` is edge-triggered, so a key still held from combat
        // cannot fire, and the gate only absorbs a last-moment mash as the screen appears.
        if (G.stateT > 0.25) {
          if (ok) { A.sfx('confirm'); G.startLevel(); }
          else if (I.pressed.pause) { A.stopMusic(); G.toTitle(); }
        }
        break;
    }
  };
})();
