/* collision.js - all spatial tests live here (no rendering, no game rules).
   Beat 'em up space: x = horizontal, y = depth on the floor, z = height above the floor. */
(function () {
  'use strict';
  const LS = window.LS;
  const C = (LS.Collision = {});

  C.overlap = (a0, a1, b0, b1) => Math.max(a0, b0) <= Math.min(a1, b1);

  /* Does an attack (range in front of the attacker, limited to a depth "lane") reach a target? */
  C.attackReaches = function (attacker, def, target) {
    if (Math.abs(target.y - attacker.y) > def.lane) return false;
    if (target.z > 26) return false;
    const a = attacker.x + attacker.facing * def.range[0];
    const b = attacker.x + attacker.facing * def.range[1];
    return C.overlap(Math.min(a, b), Math.max(a, b), target.x - target.halfW, target.x + target.halfW);
  };

  /* Projectile travelling along the floor vs. a fighter. */
  C.projectileHits = function (pr, target) {
    return Math.abs(pr.x - target.x) < pr.halfW + target.halfW &&
      Math.abs(pr.y - target.y) <= pr.lane && target.z < 20;
  };

  /* Keep a fighter on the walkable floor band and inside [minX, maxX]. */
  C.confine = function (f, minX, maxX) {
    f.y = LS.clamp(f.y, LS.FLOOR_TOP, LS.FLOOR_BOTTOM);
    f.x = LS.clamp(f.x, minX, maxX);
  };

  /* Solid props are ellipses on the floor; push the fighter out radially so it slides around. */
  C.pushOutProps = function (f, props) {
    for (const p of props) {
      const dx = (f.x - p.x) / p.rx, dy = (f.y - p.y) / p.ry;
      const d = dx * dx + dy * dy;
      if (d >= 1) continue;
      const len = Math.sqrt(d) || 0.001;
      f.x = p.x + (dx / len) * p.rx;
      f.y = p.y + (dy / len) * p.ry;
      if (len < 0.01) f.y = p.y + p.ry;
    }
  };

  /* Soft separation so enemies don't stand inside each other. */
  C.separate = function (list, dt) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.z > 0 || b.z > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) < 18 && Math.abs(dy) < 9) {
          const sx = (dx >= 0 ? 1 : -1) * 26 * dt, sy = (dy >= 0 ? 1 : -1) * 14 * dt;
          a.x -= sx; b.x += sx; a.y -= sy; b.y += sy;
        }
      }
    }
  };
})();
