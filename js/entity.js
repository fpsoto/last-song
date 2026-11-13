/* entity.js - Fighter: the base for the player, enemies and bosses.

   Holds position, health and the state machine pieces every fighter shares:
     hurt  -> short stun with sliding knockback
     fall  -> knocked into the air (z axis), bounces once
     down  -> lying on the floor
     getup -> standing up (optionally invulnerable)
     dead  -> lying for good
   Subclasses add their own "active" states (idle / walk / approach / attack...). */
(function () {
  'use strict';
  const LS = window.LS;
  const GRAVITY = 640;

  class Fighter {
    constructor(kind, x, y, o) {
      this.kind = kind;             // key into LS.Sprites.LOOKS
      this.name = o.name;
      this.team = o.team;           // 'player' | 'enemy'
      this.x = x; this.y = y; this.z = 0;
      this.vx = 0; this.vz = 0;
      this.facing = 1;
      this.maxHp = this.hp = this.lagHp = o.hp;
      this.halfW = o.halfW || 8;    // half body width used for hit tests
      this.height = o.height || 50;
      this.downTime = o.downTime || 0.7;
      this.getupInvuln = o.getupInvuln || 0;

      this.state = 'idle';
      this.stateT = 0;              // seconds spent in the current state
      this.animT = Math.random() * 5;
      this.moving = false;          // tells the sprite to use the walk cycle
      this.atk = null;              // current attack instance (see combat.js)
      this.flash = 0;               // white hit flash timer
      this.invuln = 0;
      this.stun = 0;
      this.bounced = false;
      this.barT = 0;                // how long to keep showing the mini life bar
      this.remove = false;
    }

    setState(s) {
      this.state = s;
      this.stateT = 0;
      if (s !== 'attack') this.atk = null;
      if (s === 'fall') this.bounced = false;
    }

    /* Can this fighter be hit right now? (no juggling, no hitting bodies on the floor) */
    hittable() {
      return this.invuln <= 0 && this.state !== 'fall' && this.state !== 'down' &&
        this.state !== 'getup' && this.state !== 'dead';
    }

    /* Apply an attack definition. `dir` is the direction the blow travels (+1 / -1).
       Returns true if this hit was a knockout. */
    takeHit(def, dir) {
      this.hp = Math.max(0, this.hp - def.dmg);
      this.flash = 0.12;
      this.barT = 2.5;
      this.facing = -dir; // always fall facing the attacker
      const ko = this.hp <= 0;
      if (ko || def.knockdown) {
        this.setState('fall');
        this.vx = dir * (def.kb || 130);
        this.vz = ko ? 215 : 175;
        this.z = Math.max(this.z, 1);
      } else {
        this.setState('hurt');
        this.stun = def.stun || 0.3;
        this.vx = dir * (def.kb || 60);
      }
      return ko;
    }

    /* Timers + the shared reaction states.
       Returns true when one of those states is in control, so the subclass skips its AI/input. */
    updateCommon(dt, g) {
      this.stateT += dt;
      this.animT += dt;
      if (this.flash > 0) this.flash -= dt;
      if (this.invuln > 0) this.invuln -= dt;
      if (this.barT > 0) this.barT -= dt;
      if (this.lagHp > this.hp) this.lagHp = Math.max(this.hp, this.lagHp - this.maxHp * 0.45 * dt);

      switch (this.state) {
        case 'hurt':
          this.moving = false;
          this.x += this.vx * dt;
          this.vx -= this.vx * Math.min(1, 9 * dt); // friction
          if (this.stateT >= this.stun) this.setState('idle');
          return true;

        case 'fall':
          this.moving = false;
          this.x += this.vx * dt;
          this.z += this.vz * dt;
          this.vz -= GRAVITY * dt;
          if (this.z <= 0) {
            this.z = 0;
            g.onLand(this);
            if (!this.bounced) { // first contact: small bounce, then settle
              this.bounced = true;
              this.vz = 85;
              this.vx *= 0.45;
              this.z = 0.5;
            } else {
              this.vx = 0;
              this.setState(this.hp <= 0 ? 'dead' : 'down');
            }
          }
          return true;

        case 'down':
          if (this.stateT >= this.downTime) this.setState('getup');
          return true;

        case 'getup':
          if (this.stateT >= 0.35) {
            this.invuln = this.getupInvuln;
            this.setState('idle');
            this.onGetUp();
          }
          return true;

        case 'dead':
          return true;
      }
      return false;
    }

    onGetUp() {}
  }

  LS.Fighter = Fighter;
})();
