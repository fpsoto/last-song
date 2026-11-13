/* boss.js - THE KING OF RIFFS, boss of 1984.
   LS.BOSSES is a registry so each future era can plug in its own boss class. */
(function () {
  'use strict';
  const LS = window.LS;

  const ATK = {
    // Guitar smash: slow wind-up, long reach, knocks Jack down.
    swing: { anim: 'swing', dur: 0.95, active: [0.5, 0.64], range: [4, 52], lane: 16, dmg: 16, kb: 190, knockdown: true, heavy: true, hitY: 34 },
    // Power chord: no melee hit; fires a shockwave along the floor at `fire` seconds.
    chord: { anim: 'chord', dur: 1.55, fire: 0.85, active: [99, 99], range: [0, 0], lane: 0, dmg: 0 },
  };
  const WAVE = { dmg: 16, kb: 170, knockdown: true, heavy: true, hitY: 20 };

  class KingOfRiffs extends LS.Fighter {
    constructor(x, y, cfg) {
      super('king', x, y, { name: cfg.name, team: 'enemy', hp: cfg.hp, halfW: 10, height: 62, downTime: 0.8 });
      this.isBoss = true;
      this.facing = -1;
      this.cool = 1.0;      // melee cooldown
      this.spCool = 2.5;    // special cooldown
      this.armorT = 0;      // while > 0 hits don't interrupt him
      this.hitsTaken = 0;   // consecutive flinches, used to break out of combos
      this.idleT = 0;
      this.entered = false;
      this.setState('approach');
    }

    get enraged() { return this.hp < this.maxHp * 0.5; }

    /* The boss can't be stun-locked:
       - while attacking, or shortly after getting up, he has super armour (takes damage, no flinch);
       - only the third consecutive heavy blow knocks him down;
       - after four flinches in a row he shrugs it off and counter-attacks. */
    takeHit(def, dir) {
      const armored = this.state === 'attack' || this.armorT > 0;
      if (armored && this.hp - def.dmg > 0) {
        this.hp -= def.dmg; this.flash = 0.12; this.barT = 2.5;
        return false;
      }
      this.hitsTaken++;
      const d = Object.assign({}, def, { kb: (def.kb || 60) * 0.5, knockdown: !!def.knockdown && this.hitsTaken >= 3 });
      const ko = super.takeHit(d, dir);
      if (this.state === 'fall') this.hitsTaken = 0;
      else if (this.hitsTaken >= 4) { this.hitsTaken = 0; this.armorT = 1.4; this.cool = 0; }
      return ko;
    }

    onGetUp() { this.armorT = 1.2; this.cool = Math.min(this.cool, 0.3); }

    update(dt, g) {
      if (this.updateCommon(dt, g)) return;
      const p = g.player;
      this.moving = false;

      // ---- Scripted entrance: strut in from the stage side, then strike a pose ----
      if (g.phase === 'bossIntro') {
        const stopX = LS.Camera.maxX + LS.W - 110;
        if (this.x > stopX) { this.x -= 70 * dt; this.moving = true; this.state = 'approach'; }
        else if (!this.entered) {
          this.entered = true;
          this.setState('taunt');
          LS.Audio.sfx('bossIn');
          LS.Camera.shake(5);
        }
        return;
      }
      if (this.state === 'taunt') this.setState('idle');

      this.cool -= dt; this.spCool -= dt;
      if (this.armorT > 0) this.armorT -= dt;
      const dx = p.x - this.x, dy = p.y - this.y, dist = Math.abs(dx);

      // ---- ATTACK ----
      if (this.state === 'attack') {
        const a = this.atk, d = a.def;
        if (d.anim === 'chord' && !a.fired && this.stateT >= d.fire) {
          a.fired = true;
          this.fireWave(g, this.facing);
          if (this.enraged) this.fireWave(g, -this.facing); // phase 2: waves in both directions
          LS.Audio.sfx('riff');
          LS.Camera.shake(4);
        }
        if (this.stateT >= d.dur) {
          this.setState('idle');
          this.idleT = this.enraged ? 0.2 : 0.4;
          this.cool = this.enraged ? 0.7 : 1.2;
        }
        return;
      }

      if (p.state === 'dead') return;
      this.facing = dx >= 0 ? 1 : -1;

      // ---- IDLE ----
      if (this.state === 'idle') {
        this.idleT -= dt;
        if (this.idleT <= 0) this.setState('approach');
        return;
      }

      // ---- APPROACH: pick the special at range, the smash up close ----
      const speed = this.enraged ? 68 : 54;
      const wantsSpecial = this.spCool <= 0 && dist > 80;
      if (wantsSpecial) {
        // line up with the player's lane, then play the chord
        if (Math.abs(dy) > 8) { this.y += Math.sign(dy) * speed * 0.7 * dt; this.moving = true; }
        else {
          LS.Combat.begin(this, ATK.chord);
          this.spCool = this.enraged ? 3.0 : 4.5;
          this.hitsTaken = 0;
          LS.Audio.sfx('charge');
        }
        return;
      }
      // Try to stand 40px from the player. The attack test uses the real distance (not
      // "did I reach my spot"), so he still swings when a wall keeps him from backing off.
      const side = this.x < p.x ? -1 : 1;
      const ex = p.x + side * 40 - this.x;
      if (Math.abs(ex) > 3) { this.x += Math.sign(ex) * Math.min(Math.abs(ex), speed * dt); this.moving = true; }
      if (Math.abs(dy) > 3) { this.y += Math.sign(dy) * Math.min(Math.abs(dy), speed * 0.65 * dt); this.moving = true; }
      if (this.cool <= 0 && dist < 50 && Math.abs(dy) < 10 && p.hittable()) {
        LS.Combat.begin(this, ATK.swing);
        this.hitsTaken = 0;
        LS.Audio.sfx('whoosh');
      }
    }

    fireWave(g, dir) {
      g.projectiles.push({
        x: this.x + dir * 22, y: this.y, vx: dir * 200, life: 2.4, t: 0,
        halfW: 6, lane: 11, def: WAVE, dead: false,
      });
    }
  }

  LS.BOSSES = { king: KingOfRiffs };
})();
