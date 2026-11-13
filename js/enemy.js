/* enemy.js - regular enemies, fully described by data in ENEMY_TYPES.
   AI is a small state machine:  idle -> approach -> attack -> idle ...
   plus hurt / dead (and the shared fall / down / getup) from Fighter. */
(function () {
  'use strict';
  const LS = window.LS;

  const TYPES = (LS.ENEMY_TYPES = {
    // Slow, tough, hits hard with a clearly telegraphed haymaker.
    roadie: {
      kind: 'roadie', name: 'ROADIE', hp: 44, speed: 46, reach: 25, rest: 0.5, cooldown: 1.4, score: 500, charge: 25,
      atk: { anim: 'haymaker', dur: 0.82, active: [0.42, 0.54], range: [2, 31], lane: 12, dmg: 12, kb: 120, stun: 0.36, heavy: true, hitY: 34 },
    },
    // Mohawk punk: starts the attack from far away and dashes into Jack with a shoulder charge.
    // The telegraph is a deep crouch; sidestepping (W / S) or jumping dodges it.
    punk: {
      kind: 'punk', name: 'PUNK', hp: 34, speed: 80, reach: 54, rest: 0.4, cooldown: 1.2, score: 400, charge: 20,
      atk: { anim: 'lunge', dur: 0.78, active: [0.36, 0.56], range: [2, 30], lane: 11, dmg: 10, kb: 130, stun: 0.36, hitY: 30, dash: [0.3, 0.56, 170] },
    },
    // Fast and fragile: quick handbag swing, then backs off.
    groupie: {
      kind: 'groupie', name: 'GROUPIE', hp: 30, speed: 74, reach: 24, rest: 0.45, cooldown: 0.9, retreat: true, score: 300, charge: 16,
      atk: { anim: 'bag', dur: 0.5, active: [0.22, 0.32], range: [2, 30], lane: 12, dmg: 7, kb: 70, stun: 0.28, hitY: 36 },
    },
  });

  const MAX_ATTACKERS = 2; // never more than two enemies swinging at once

  class Enemy extends LS.Fighter {
    constructor(type, x, y) {
      const cfg = TYPES[type];
      super(cfg.kind, x, y, { name: cfg.name, team: 'enemy', hp: cfg.hp });
      this.cfg = cfg;
      this.cool = LS.rand(0.3, 1.0);       // time until it may attack again
      this.idleT = 0;
      this.backoff = false;
      this.laneBias = LS.rand(-12, 12);    // where it hovers while waiting its turn
      this.setState('approach');
    }

    update(dt, g) {
      if (this.updateCommon(dt, g)) {
        // Regular enemies blink out a moment after dying.
        if (this.state === 'dead' && this.stateT > 1.1) this.remove = true;
        return;
      }
      const p = g.player, cfg = this.cfg;
      const dx = p.x - this.x, dy = p.y - this.y;
      this.cool -= dt;
      this.moving = false;

      // ---- ATTACK: wait for the animation to finish, then rest ----
      if (this.state === 'attack') {
        const d = this.atk.def;
        // Dash attacks (the punk) move forward during part of the animation.
        if (d.dash && this.stateT >= d.dash[0] && this.stateT <= d.dash[1]) this.x += this.facing * d.dash[2] * dt;
        if (this.stateT >= d.dur) {
          this.setState('idle');
          this.idleT = cfg.rest;
          this.cool = cfg.cooldown * LS.rand(0.8, 1.3);
          this.backoff = !!cfg.retreat;
        }
        return;
      }

      this.facing = dx >= 0 ? 1 : -1;
      if (p.hp <= 0) return; // the fight is over: just stand there

      // ---- IDLE: short pause (some types step back while resting) ----
      if (this.state === 'idle') {
        this.idleT -= dt;
        if (this.backoff && this.idleT > 0) {
          this.x -= this.facing * cfg.speed * 0.8 * dt;
          this.moving = true;
        }
        if (this.idleT <= 0) { this.backoff = false; this.setState('approach'); }
        return;
      }

      // ---- APPROACH: walk to a spot beside the player ----
      // An enemy only steps into striking distance when its cooldown is over and an
      // "attack slot" is free; otherwise it hovers a bit further away, off the player's lane.
      const attackers = g.enemies.filter((e) => e.state === 'attack').length;
      const ready = this.cool <= 0 && attackers < MAX_ATTACKERS && p.hittable();
      const side = this.x < p.x ? -1 : 1;
      const gap = ready ? cfg.reach : cfg.reach + 28;
      // The spot must be inside the visible arena, otherwise an enemy could lurk (and hit)
      // from off-screen where the player can't follow. If there's no room on this side of
      // the player (they are against the edge), walk around to the other side.
      const lo = LS.Camera.x + 22, hi = LS.Camera.x + LS.W - 22;
      let tx = p.x + side * gap;
      if (tx < lo || tx > hi) {
        const other = p.x - side * gap;
        tx = other >= lo && other <= hi ? other : LS.clamp(tx, lo, hi);
      }
      const ty = p.y + (ready ? 0 : this.laneBias);
      const ex = tx - this.x, ey = ty - this.y;
      if (Math.abs(ex) > 2) { this.x += Math.sign(ex) * Math.min(Math.abs(ex), cfg.speed * dt); this.moving = true; }
      if (Math.abs(ey) > 2) { this.y += Math.sign(ey) * Math.min(Math.abs(ey), cfg.speed * 0.65 * dt); this.moving = true; }

      // Attack test uses the real distance, so an enemy pinned against the arena edge still swings.
      if (ready && Math.abs(dx) < cfg.reach + 6 && Math.abs(dy) < 6) LS.Combat.begin(this, cfg.atk);
    }
  }

  LS.Enemy = Enemy;
})();
