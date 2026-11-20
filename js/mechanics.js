/* mechanics.js - boss signature mechanics, declared in data.

   Design rules (docs/level-design.md, #33): every boss is beaten in its own way, but normal combat
   ALWAYS takes HP off him. The mechanic never replaces the fight: it decides when he is protected
   and when the finishing blow becomes possible.

   A boss declares it in its level data:
       boss: { type, name, hp, ..., hint: 'SHORT LINE FOR THE INTRO CARD',
               mechanic: { type: 'amps', ...options } }

   While the boss is GUARDED his damage is reduced (`guard`, default x0.5) and his HP cannot drop below
   a floor (`floor`, default 15% of max): the fight can be fought to that point, no further. The
   module decides when the guard drops. Dropping it leaves him EXHAUSTED for a moment: he stands
   helpless, takes full damage and cannot be interrupted or protected; that is the opening for the
   final blow. After it the floor is gone for good.

   A mechanic MODULE is a plain object registered with LS.Mechanics.define(name, module):
       setup(m, g, lock)   once, when the boss appears (spawn what the mechanic needs; `m.cfg` = options)
       update(m, g, dt)    every frame: set m.st.guarded; call LS.Mechanics.exhaust(m, seconds) to open a window
       draw(ctx, m, g)     world-space cues (no text: glows, cables, auras)
   `m` = { boss, cfg, st: { guarded, exhausted, exT, t, ... } }. Modules know nothing about any boss class:
   start() wraps the boss' takeHit() and update(), so a new boss only needs its data. */
(function () {
  'use strict';
  const LS = window.LS;
  const M = (LS.Mechanics = { modules: {} });
  const rect = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  M.define = (name, mod) => { M.modules[name] = mod; };

  /* Called when the boss appears. Does nothing for a boss without a mechanic (plain HP fight). */
  M.start = function (boss, g, cfg, lock) {
    boss.mech = null;
    const mc = cfg && cfg.mechanic, mod = mc && M.modules[mc.type];
    if (!mod) return;
    const m = (boss.mech = { boss, mod, cfg: mc, st: { guarded: true, exhausted: false, exT: 0, t: 0 } });
    const hitOrig = boss.takeHit, updOrig = boss.update;

    boss.takeHit = function (def, dir, by) {
      const st = m.st;
      if (st.exhausted && this.state === 'exhausted') {
        // Helpless: full damage, no flinch (so the window cannot be cut short), but a KO still counts.
        if (this.hp - def.dmg > 0) { this.hp -= def.dmg; this.flash = 0.12; this.barT = 2.5; return false; }
        st.exhausted = false;
        return hitOrig.call(this, def, dir, by);
      }
      if (st.guarded) {
        const floorHp = Math.ceil(this.maxHp * (m.cfg.floor == null ? 0.15 : m.cfg.floor));
        const dmg = Math.max(0, Math.min(Math.round(def.dmg * (m.cfg.guard == null ? 0.5 : m.cfg.guard)), this.hp - floorHp));
        def = Object.assign({}, def, { dmg });
        st.hitFlash = 0.15;
      }
      return hitOrig.call(this, def, dir, by);
    };

    boss.update = function (dt, gg) {
      if (m.st.exhausted && this.state === 'exhausted' && gg.phase === 'boss') {
        this.updateCommon(dt, gg);     // timers only: he does nothing while exhausted
        this.moving = false;
        return;
      }
      updOrig.call(this, dt, gg);
    };

    mod.setup && mod.setup(m, g, lock);
  };

  /* Opens the vulnerability window: the boss slumps, takes full damage and cannot act. */
  M.exhaust = function (m, seconds) {
    const b = m.boss, st = m.st;
    if (st.exhausted || b.hp <= 0) return;
    st.exhausted = true; st.guarded = false; st.exT = seconds;
    b.setState('exhausted');
    LS.Effects.ring(b.x, b.y - 30, 40);
    LS.Effects.flash(0.35, '#ff9ad0');
    LS.Camera.shake(5);
    LS.Audio.sfx('guitarOut');
    LS.game.score += 500;
  };

  M.update = function (boss, g, dt) {
    const m = boss.mech;
    if (!m || boss.hp <= 0) return;
    const st = m.st;
    st.t += dt;
    if (st.hitFlash > 0) st.hitFlash -= dt;
    if (st.exhausted) {
      if (boss.state !== 'exhausted') st.exhausted = false;           // knocked out of it (e.g. a KO)
      else if ((st.exT -= dt) <= 0) {                                 // window over: back to the fight, a bit angrier
        st.exhausted = false;
        boss.setState('idle'); boss.idleT = 0.3; boss.armorT = 1.0;
      }
    }
    if (g.phase === 'boss' || g.phase === 'bossIntro') m.mod.update && m.mod.update(m, g, dt);
  };

  /* World-space cues. Shared: the guard aura while protected, stars while exhausted. */
  M.draw = function (ctx, g) {
    const b = g.boss, m = b && b.mech;
    if (!m || b.hp <= 0) return;
    const st = m.st, t = g.t, cx = Math.round(b.x), base = Math.round(b.y - b.z);
    if (st.guarded) {      // a pulsing red glow around him: he is powered up
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.1 + 0.07 * Math.sin(t * 7) + (st.hitFlash > 0 ? 0.15 : 0);
      rect(ctx, cx - 16, base - 66, 32, 66, m.cfg.aura || '#ff3b30');
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    if (st.exhausted) {    // dizzy stars circling his head
      for (let i = 0; i < 3; i++) {
        const a = t * 5 + i * 2.1;
        rect(ctx, cx + Math.cos(a) * 11, base - 50 + Math.sin(a) * 3, 3, 3, i % 2 ? '#ffe14a' : '#ffffff');
      }
      if (((t * 8) | 0) % 2) rect(ctx, cx + 6, base - 12, 2, 2, '#ffe14a');   // guitar sparks
    }
    m.mod.draw && m.mod.draw(ctx, m, g);
  };

  // ---------------------------------------------------------------------
  // Module: amps. Powered by amplifiers: while any stands he is guarded. Smash them all and the
  // sound cuts out (the guard drops and he is left exhausted).
  //   options: { amps: [{ dx, y }], ampHp, exhaust }   dx = x relative to the locked screen
  // ---------------------------------------------------------------------
  M.define('amps', {
    setup(m, g, lock) {
      const spots = m.cfg.amps || [{ dx: 64, y: 232 }, { dx: LS.W - 64, y: 226 }];
      m.st.amps = spots.map((s) => {
        const a = new LS.Breakable('amp', lock + s.dx, s.y, null);
        a.hp = a.maxHp = m.cfg.ampHp || 40;
        a.powered = true;
        g.breakables.push(a);
        return a;
      });
      g.solids = g.props.concat(g.breakables);
    },
    update(m, g) {
      const alive = m.st.amps.filter((a) => !a.remove && a.hp > 0);
      m.st.ampsLeft = alive.length;
      if (alive.length) m.st.guarded = !m.st.exhausted;
      else if (!m.st.cut) { m.st.cut = true; LS.Mechanics.exhaust(m, m.cfg.exhaust || 3.2); }
    },
    draw(ctx, m, g) {
      const b = m.boss, t = g.t;
      for (const a of m.st.amps) {
        if (a.remove || a.hp <= 0) continue;
        // a glow over the amp: it can be destroyed
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.18 + 0.12 * Math.sin(t * 6 + a.x);
        rect(ctx, a.x - 17, a.y - 32, 34, 34, '#ff3b30');
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        // a crackling cable running to the boss
        const x0 = a.x, y0 = a.y - 22, x1 = b.x, y1 = b.y - 24, n = 10;
        let px = x0, py = y0;
        ctx.fillStyle = '#ff9a7a';
        for (let i = 1; i <= n; i++) {
          const nx = x0 + (x1 - x0) * i / n;
          const ny = y0 + (y1 - y0) * i / n + (i === n ? 0 : ((t * 30 + i * 7 + a.x) | 0) % 5 - 2);   // jitters: it crackles
          ctx.fillRect(Math.round(Math.min(px, nx)), Math.round(Math.min(py, ny)), Math.abs(Math.round(nx - px)) + 1, Math.abs(Math.round(ny - py)) + 1);
          px = nx; py = ny;
        }
      }
    },
  });

  // ---------------------------------------------------------------------
  // Module: windows (counter windows). He is guarded, except for a moment after each of his special
  // attacks: the wind-up is the warning, and the recovery is the window to punish.
  //   options: { after: 'chord' (the attack animation), time }
  // ---------------------------------------------------------------------
  M.define('windows', {
    update(m, g) {
      const b = m.boss, st = m.st, a = b.state === 'attack' && b.atk ? b.atk.def.anim : null;
      if (st.prevAnim === (m.cfg.after || 'chord') && a !== st.prevAnim && b.state !== 'hurt' && b.state !== 'fall' && b.hp > 0) {
        LS.Mechanics.exhaust(m, m.cfg.time || 2.4);
      }
      st.prevAnim = a;
      st.guarded = !st.exhausted;
    },
  });
})();
