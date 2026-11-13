/* combat.js - attack resolution. Knows nothing about drawing or sound:
   it only decides who got hit and reports it through game.onHit().

   An attack DEFINITION is plain data:
     { anim, dur, active:[start, end], range:[near, far], lane, dmg, kb, stun, knockdown, heavy }
   - `active` is the time window (seconds into the attack) in which it can connect.
   - `range` is measured in front of the attacker; `lane` is the depth tolerance.
   An attack INSTANCE (fighter.atk) remembers who it already hit so one swing
   never damages the same target twice. */
(function () {
  'use strict';
  const LS = window.LS;
  const C = (LS.Combat = {});

  C.begin = function (f, def) {
    f.setState('attack');
    f.atk = { def, hit: new Set(), connected: false, fired: false };
  };

  function resolve(g, attacker, targets) {
    const a = attacker.atk;
    if (!a || attacker.state !== 'attack') return;
    const d = a.def, t = attacker.stateT;
    if (t < d.active[0] || t > d.active[1]) return;
    for (const target of targets) {
      if (a.hit.has(target) || !target.hittable()) continue;
      if (!LS.Collision.attackReaches(attacker, d, target)) continue;
      a.hit.add(target);
      a.connected = true;
      const ko = target.takeHit(d, attacker.facing, attacker);
      g.onHit(attacker, target, d, ko);
    }
  }

  C.update = function (g) {
    const p = g.player;
    const foes = g.boss ? g.enemies.concat(g.boss) : g.enemies;
    resolve(g, p, foes.concat(g.breakables)); // Jack's attacks also smash scenery
    for (const e of foes) resolve(g, e, [p]);

    // Floor projectiles (the boss' shockwave)
    for (const pr of g.projectiles) {
      if (pr.dead || !p.hittable()) continue;
      if (LS.Collision.projectileHits(pr, p)) {
        pr.dead = true;
        const dir = pr.vx > 0 ? 1 : -1;
        const ko = p.takeHit(pr.def, dir, null);
        g.onHit(null, p, pr.def, ko);
      }
    }
  };
})();
