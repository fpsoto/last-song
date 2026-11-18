/* player.js - Jack Ryder.
   States: idle, walk, jump, attack (punch / kick / jump kick), special (the Last Solo),
   plus the shared hurt / fall / down / getup / dead states from Fighter. */
(function () {
  'use strict';
  const LS = window.LS;

  const SPEED_X = 100, SPEED_Y = 62; // depth movement is slower, like the arcade classics
  const GRAVITY = 640, JUMP_V = 235; // peak height ~43px, ~0.73s in the air

  // Attack data. Times in seconds, distances in logical pixels.
  const ATK = {
    punch1: { anim: 'punch1', dur: 0.26, active: [0.07, 0.16], range: [2, 30], lane: 13, dmg: 8, kb: 70, stun: 0.34, chain: true, lunge: 60, hitY: 34 },
    punch2: { anim: 'punch2', dur: 0.26, active: [0.07, 0.16], range: [2, 31], lane: 13, dmg: 8, kb: 80, stun: 0.34, chain: true, lunge: 60, hitY: 34 },
    punch3: { anim: 'upper', dur: 0.44, active: [0.13, 0.24], range: [2, 31], lane: 13, dmg: 14, kb: 150, knockdown: true, heavy: true, lunge: 70, hitY: 40 },
    kick: { anim: 'kick', dur: 0.48, active: [0.16, 0.28], range: [2, 39], lane: 14, dmg: 18, kb: 185, knockdown: true, heavy: true, lunge: 30, hitY: 26 },
    // Flying kick: the active window covers almost the whole attack, it ends when Jack lands.
    jumpkick: { anim: 'jumpkick', air: true, dur: 0.55, active: [0.05, 0.5], range: [2, 32], lane: 14, dmg: 13, kb: 135, stun: 0.4, hitY: 22 },
  };
  const PUNCHES = ['punch1', 'punch2', 'punch3'];

  // The "Last Solo": shockwave that hits everything close to Jack (resolved in game.js).
  const SOLO = { windup: 0.5, dur: 1.0, invuln: 1.05 };

  /* The block (hold I / Shift / the BLOCK button). All the tuning lives here:
     - It only covers blows coming from the front, so Jack has to face the attacker.
     - Light blows: damage x light, no flinch (Jack only slides back a little).
     - Heavy blows (def.heavy or def.knockdown: the roadie's haymaker, the boss, shockwaves):
       damage x heavy and a short stagger out of the guard, but never a knockdown.
     - Every blocked blow drains the guard meter (damage x cost). A blow the guard cannot pay for
       breaks it: it lands in full and the block is locked for `lockout` seconds. The guard only
       refills while NOT blocking (after `regenDelay`), so turtling in a crowd wears out fast. */
  const BLOCK = {
    guardMax: 60, regen: 22, regenDelay: 0.6,
    minGuard: 8,            // the guard cannot be raised with less than this left (no empty-guard turtling)
    startup: 0.07,          // seconds before the raised arms actually protect
    light: 0.2, heavy: 0.5, // fraction of the damage that gets through
    costLight: 1.4, costHeavy: 2.4,
    slide: 0.3, heavyKb: 0.5, heavyStun: 0.22,
    lockout: 1.0,
  };

  class Player extends LS.Fighter {
    constructor(x, y) {
      super('jack', x, y, { name: 'JACK RYDER', team: 'player', hp: 100, getupInvuln: 0.9, downTime: 0.55 });
      this.combo = 0;        // index of the last punch thrown in the current chain
      this.comboT = 0;       // window to continue the chain after a punch ends
      this.chainOk = false;  // did the last punch connect?
      this.buf = null;       // buffered button so presses during recovery aren't lost
      this.bufT = 0;
      this.air = false;      // true while off the ground by his own jump
      this.power = 0;        // solo charge, 0..powerMax; filled by KOs and pickups
      this.powerMax = 100;
      this.fired = false;    // has the current solo already released its blast?
      this.god = LS.params.get('god') === '1';
      this.guard = this.guardMax = BLOCK.guardMax; // block meter, see BLOCK above
      this.guardT = 0;       // time until the guard starts refilling
      this.blockLock = 0;    // > 0: the guard is broken and can't be raised yet
      this.hitResult = null; // 'block' | 'break' | null: what the last hit did (read by game.onHit)
    }

    /* Is a blow travelling in direction `dir` stopped by the raised guard? Jack must face it. */
    canBlock(dir) {
      return this.state === 'block' && !this.air && this.z <= 0 && this.stateT >= BLOCK.startup && dir === -this.facing;
    }

    takeHit(def, dir) {
      if (this.god) return false;
      this.hitResult = null;
      if (this.canBlock(dir)) {
        const heavy = !!(def.heavy || def.knockdown);
        const cost = def.dmg * (heavy ? BLOCK.costHeavy : BLOCK.costLight);
        if (this.guard >= cost) return this.blockHit(def, dir, heavy, cost);
        // The guard can't pay for this blow: it breaks, and the hit lands in full below.
        this.guard = 0; this.blockLock = BLOCK.lockout; this.guardT = BLOCK.regenDelay;
        this.hitResult = 'break';
      }
      this.combo = 0; this.chainOk = false;
      // Hit in mid-air: always get knocked down, and hand the vertical motion to the fall state.
      if (this.air || this.z > 0) {
        def = Object.assign({}, def, { knockdown: true });
        this.air = false; this.vz = 0;
      }
      return super.takeHit(def, dir);
    }

    /* A blow that the guard absorbs. Returns true only if the chip damage still kills Jack. */
    blockHit(def, dir, heavy, cost) {
      this.guard -= cost; this.guardT = BLOCK.regenDelay;
      this.hitResult = 'block';
      const dmg = Math.max(1, Math.round(def.dmg * (heavy ? BLOCK.heavy : BLOCK.light)));
      if (heavy || this.hp - dmg <= 0) {
        // Staggered out of the guard (no knockdown), or the chip damage was lethal.
        const d = Object.assign({}, def, { dmg, knockdown: false, stun: BLOCK.heavyStun, kb: (def.kb || 60) * BLOCK.heavyKb });
        return super.takeHit(d, dir);
      }
      this.hp -= dmg; this.barT = 2.5;                  // light blow: the guard holds, Jack slides back
      this.vx = dir * (def.kb || 60) * BLOCK.slide;
      return false;
    }

    punch(next) {
      this.combo = next ? Math.min(2, this.combo + 1) : 0;
      LS.Combat.begin(this, ATK[PUNCHES[this.combo]]);
      LS.Audio.sfx('whoosh');
      this.buf = null;
    }

    /* Horizontal control while airborne. `k` scales the speed, `turn` lets Jack face the way he moves. */
    airMove(dt, I, k, turn) {
      const mx = (I.down.right ? 1 : 0) - (I.down.left ? 1 : 0);
      const my = (I.down.down ? 1 : 0) - (I.down.up ? 1 : 0);
      const n = mx && my ? 0.7071 : 1;
      this.x += mx * SPEED_X * k * n * dt;
      this.y += my * SPEED_Y * 0.7 * n * dt;
      if (mx && turn) this.facing = mx;
    }

    update(dt, I, g) {
      // Input buffer: remember the last button for a short moment.
      this.comboT -= dt; this.bufT -= dt;
      if (I.pressed.punch) { this.buf = 'punch'; this.bufT = 0.18; }
      if (I.pressed.kick) { this.buf = 'kick'; this.bufT = 0.18; }
      if (I.pressed.jump) { this.buf = 'jump'; this.bufT = 0.15; }
      if (I.pressed.special) { this.buf = 'special'; this.bufT = 0.2; }
      if (this.bufT <= 0) this.buf = null;

      // Guard meter: refills only while the block is down, a moment after the last blocked blow.
      // The delay counts down all the time; the refill is paused while the player is holding a usable guard.
      if (this.blockLock > 0) this.blockLock -= dt;
      if (this.guardT > 0) this.guardT -= dt;
      const holding = I.down.block && this.blockLock <= 0 && this.guard >= BLOCK.minGuard;
      if (!holding && this.guardT <= 0 && this.guard < this.guardMax) this.guard = Math.min(this.guardMax, this.guard + BLOCK.regen * dt);

      if (this.updateCommon(dt, g)) return;

      // --- jump physics (runs in the jump state and during an air attack) ---
      if (this.air) {
        this.z += this.vz * dt;
        this.vz -= GRAVITY * dt;
        if (this.z <= 0) { // landing cancels whatever he was doing in the air
          this.z = 0; this.vz = 0; this.air = false;
          g.onLand(this, true);
          if (this.state === 'jump' || this.state === 'attack') this.setState('idle');
        }
      }

      // --- the solo: wind-up, then the blast is released once ---
      if (this.state === 'special') {
        this.moving = false;
        if (!this.fired && this.stateT >= SOLO.windup) { this.fired = true; g.superBlast(this); }
        if (this.stateT >= SOLO.dur) this.setState('idle');
        this.buf = null;
        return;
      }

      if (this.state === 'jump') {
        this.moving = false;
        this.airMove(dt, I, 1, true);
        if (this.buf === 'punch' || this.buf === 'kick') {
          LS.Combat.begin(this, ATK.jumpkick);
          LS.Audio.sfx('whoosh');
          this.buf = null;
        }
        return;
      }

      if (this.state === 'attack') {
        const a = this.atk, d = a.def;
        if (d.air) {
          this.airMove(dt, I, 0.6, false);
          if (this.stateT >= d.dur && this.air) this.setState('jump'); // keep falling
          return;
        }
        if (this.stateT < d.active[0]) this.x += this.facing * d.lunge * dt; // small step into the blow
        // Combo: a punch that connected can be cancelled into the next one once its
        // active window is over. Punch 3 (uppercut) ends the chain with a knockdown.
        if (a.connected && d.chain && this.stateT > d.active[1] && this.buf === 'punch') { this.punch(true); return; }
        if (this.stateT >= d.dur) {
          this.chainOk = a.connected && !!d.chain;
          this.comboT = 0.3;
          this.setState('idle');
        }
        return;
      }

      // --- grounded: idle / walk. Special first, then jump, then attacks ---
      if (this.buf === 'special' && this.power >= this.powerMax) {
        this.power = 0; this.fired = false; this.combo = 0; this.chainOk = false;
        this.setState('special');
        this.invuln = SOLO.invuln;
        this.buf = null;
        LS.Audio.sfx('charge');
        return;
      }
      if (this.buf === 'jump') {
        this.air = true; this.vz = JUMP_V; this.z = 1;
        this.setState('jump');
        this.buf = null; this.chainOk = false;
        LS.Audio.sfx('jump');
        return;
      }
      if (this.buf === 'punch') { this.punch(this.chainOk && this.comboT > 0); return; }
      if (this.buf === 'kick') {
        LS.Combat.begin(this, ATK.kick);
        LS.Audio.sfx('whoosh');
        this.buf = null; this.chainOk = false;
        return;
      }

      // Guard: held, on the ground, once any buffered action above has had its chance (so a punch,
      // a jump or the solo can cancel it). Jack can turn to face a foe but can't walk while guarding.
      if (I.down.block && this.blockLock <= 0 && (this.state === 'block' || this.guard >= BLOCK.minGuard)) {
        if (this.state !== 'block') { this.setState('block'); this.combo = 0; this.chainOk = false; this.vx = 0; }
        this.moving = false;
        const turn = (I.down.right ? 1 : 0) - (I.down.left ? 1 : 0);
        if (turn) this.facing = turn;
        this.x += this.vx * dt;                       // slide after a blocked blow
        this.vx -= this.vx * Math.min(1, 9 * dt);
        return;
      }
      if (this.state === 'block') this.setState('idle');

      // Movement on the floor plane (normalised so diagonals aren't faster).
      const mx = (I.down.right ? 1 : 0) - (I.down.left ? 1 : 0);
      const my = (I.down.down ? 1 : 0) - (I.down.up ? 1 : 0);
      if (mx || my) {
        const n = mx && my ? 0.7071 : 1;
        this.x += mx * SPEED_X * n * dt;
        this.y += my * SPEED_Y * n * dt;
        if (mx) this.facing = mx;
        this.moving = true;
        if (this.state !== 'walk') this.setState('walk');
      } else {
        this.moving = false;
        if (this.state !== 'idle') this.setState('idle');
      }
    }
  }

  LS.Player = Player;
})();
