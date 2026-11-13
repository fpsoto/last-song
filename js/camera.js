/* camera.js - side-scrolling camera with limits, wave locks and screen shake. */
(function () {
  'use strict';
  const LS = window.LS;

  const C = (LS.Camera = {
    x: 0,          // world X of the left edge of the screen
    minX: 0,       // scrolling limits; setting both to the same value locks the screen
    maxX: 0,
    worldW: LS.W,
    sx: 0, sy: 0,  // shake offset
    mag: 0,
  });

  C.reset = function (worldW) {
    C.x = 0; C.minX = 0; C.maxX = 0; C.worldW = worldW;
    C.sx = C.sy = C.mag = 0;
  };

  C.update = function (dt, target) {
    const want = LS.clamp(target.x - LS.W * 0.42, C.minX, C.maxX);
    const d = want - C.x;
    const stepSize = Math.max(50, Math.abs(d) * 5) * dt;
    C.x = Math.abs(d) <= stepSize ? want : C.x + Math.sign(d) * stepSize;
    C.x = LS.clamp(C.x, 0, C.worldW - LS.W);
  };

  C.shake = function (m) { C.mag = Math.max(C.mag, m); };

  C.updateShake = function (dt) {
    if (C.mag > 0.3) {
      C.sx = (Math.random() * 2 - 1) * C.mag;
      C.sy = (Math.random() * 2 - 1) * C.mag * 0.6;
      C.mag *= Math.pow(0.0008, dt);
    } else { C.mag = 0; C.sx = C.sy = 0; }
  };
})();
