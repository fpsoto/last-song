/* core.js - shared namespace, constants and small helpers.
   Every other file hangs its system from the global `LS` object. */
(function () {
  'use strict';
  const LS = (window.LS = window.LS || {});

  // Logical resolution (the canvas is scaled up with CSS, pixels stay crisp).
  LS.W = 480;
  LS.H = 270;

  // Walkable floor band, in screen/world Y. "y" of a fighter is where the feet touch.
  LS.FLOOR_TOP = 181;
  LS.FLOOR_BOTTOM = 246;

  // URL flags used for development: ?debug=1 shows hitboxes and enables skip keys.
  const params = new URLSearchParams(window.location.search);
  LS.params = params;
  LS.DEBUG = params.get('debug') === '1';

  LS.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  LS.lerp = (a, b, t) => a + (b - a) * t;
  LS.rand = (a, b) => a + Math.random() * (b - a);
  LS.pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // Deterministic random generator (used so the procedural bar always looks the same).
  LS.rng = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // shade('#rrggbb', f): f < 1 darkens, f > 1 lightens towards white.
  const shadeCache = {};
  LS.shade = function (hex, f) {
    const key = hex + f;
    if (shadeCache[key]) return shadeCache[key];
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (f <= 1) { r *= f; g *= f; b *= f; }
    else { const k = f - 1; r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
    return (shadeCache[key] = 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')');
  };

  LS.makeCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  };
})();
