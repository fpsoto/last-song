/* effects.js - short-lived visual feedback: hit sparks, dust, comic text, screen flash.
   Particles live in world space and are drawn by the renderer inside the camera transform. */
(function () {
  'use strict';
  const LS = window.LS;
  const E = (LS.Effects = { flashA: 0, flashColor: '#fff' });

  let parts = [];

  E.reset = function () { parts = []; E.flashA = 0; };

  /* Impact burst: a bright star plus sparks flying away. */
  E.spark = function (x, y, heavy) {
    parts.push({ kind: 'star', x, y, t: 0, life: heavy ? 0.16 : 0.11, size: heavy ? 9 : 6 });
    const n = heavy ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = LS.rand(50, heavy ? 190 : 120);
      parts.push({
        kind: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30, g: 320,
        t: 0, life: LS.rand(0.15, 0.32), color: LS.pick(['#fff', '#ffe14a', '#ff9a3c']), size: heavy ? 2 : 1,
      });
    }
  };

  /* Dust puff when a body lands on the floor. */
  E.dust = function (x, y) {
    for (let i = 0; i < 6; i++) {
      parts.push({
        kind: 'dot', x: x + LS.rand(-10, 10), y, vx: LS.rand(-40, 40), vy: LS.rand(-28, -6), g: 40,
        t: 0, life: LS.rand(0.25, 0.45), color: LS.pick(['#8a7a6a', '#6a5a50', '#a89888']), size: 2,
      });
    }
  };

  /* Comic-book onomatopoeia that pops up and drifts. */
  E.text = function (x, y, str, color) {
    parts.push({ kind: 'text', x, y, vy: -26, t: 0, life: 0.55, str, color: color || '#ffe14a' });
  };

  /* Chunks of a broken crate / amp: they fly out, then bounce and rest on the floor line `fy`. */
  E.debris = function (x, y, colors, n, fy) {
    for (let i = 0; i < n; i++) {
      parts.push({
        kind: 'chip', x: x + LS.rand(-8, 8), y: y + LS.rand(-6, 6), vx: LS.rand(-110, 110), vy: LS.rand(-190, -60), g: 520,
        fy: fy + LS.rand(-4, 3), t: 0, life: LS.rand(0.7, 1.1), color: LS.pick(colors), size: LS.pick([2, 3, 3, 4]),
      });
    }
  };

  /* Expanding ring on the floor (the Last Solo shockwave). */
  E.ring = function (x, y, maxR) { parts.push({ kind: 'ring', x, y, t: 0, life: 0.5, maxR }); };

  E.flash = function (a, color) { E.flashA = a; E.flashColor = color || '#fff'; };

  E.update = function (dt) {
    if (E.flashA > 0) E.flashA = Math.max(0, E.flashA - dt * 2.2);
    for (const p of parts) {
      p.t += dt;
      if (p.kind === 'dot') { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; }
      else if (p.kind === 'text') { p.y += p.vy * dt; p.vy *= Math.pow(0.02, dt); }
      else if (p.kind === 'chip') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
        if (p.y >= p.fy) { p.y = p.fy; p.vy *= -0.3; p.vx *= 0.6; } // bounce on the floor
      }
    }
    parts = parts.filter((p) => p.t < p.life);
  };

  E.draw = function (ctx) {
    for (const p of parts) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.kind === 'dot') {
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size, p.size);
      } else if (p.kind === 'star') {
        // Four-pointed star made of two crossing bars that shrink over its life.
        const k = 1 - p.t / p.life, s = Math.max(1, Math.round(p.size * k));
        ctx.fillStyle = '#ffe14a';
        ctx.fillRect(x - s - 2, y - 1, s * 2 + 4, 3);
        ctx.fillRect(x - 1, y - s - 2, 3, s * 2 + 4);
        ctx.fillStyle = '#fff';
        ctx.fillRect(x - s, y, s * 2, 1);
        ctx.fillRect(x, y - s, 1, s * 2);
        ctx.fillRect(x - 2, y - 2, 5, 5);
      } else if (p.kind === 'chip') {
        if (p.life - p.t < 0.25 && ((p.t * 30) | 0) % 2) continue; // blink out
        ctx.fillStyle = '#12081c'; ctx.fillRect(x - 1, y - 1, p.size + 2, p.size + 2);
        ctx.fillStyle = p.color; ctx.fillRect(x, y, p.size, p.size);
      } else if (p.kind === 'ring') {
        // Squashed circle drawn with 2x2 pixels: looks like a shockwave lying on the floor.
        const k = p.t / p.life, r = p.maxR * (1 - Math.pow(1 - k, 3));
        ctx.fillStyle = k < 0.5 ? '#ffffff' : '#28dcff';
        for (let a = 0; a < 64; a++) {
          const an = (a / 64) * Math.PI * 2;
          ctx.fillRect(Math.round(p.x + Math.cos(an) * r), Math.round(p.y + Math.sin(an) * r * 0.32), 2, 2);
        }
        ctx.fillStyle = 'rgba(40,220,255,0.5)';
        for (let a = 0; a < 48; a++) {
          const an = (a / 48) * Math.PI * 2, r2 = r * 0.8;
          ctx.fillRect(Math.round(p.x + Math.cos(an) * r2), Math.round(p.y + Math.sin(an) * r2 * 0.32), 2, 1);
        }
      } else if (p.kind === 'text') {
        const T = LS.Text;
        T.draw(ctx, p.str, x + 1, y + 1, '#1a0a1e', 1, 'center');
        T.draw(ctx, p.str, x, y, p.color, 1, 'center');
      }
    }
  };
})();
