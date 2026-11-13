/* main.js - bootstrap: canvas scaling and the requestAnimationFrame loop. */
(function () {
  'use strict';
  const LS = window.LS;
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  /* Scale the 480x270 canvas to the window, keeping the aspect ratio.
     Integer scale factors keep every game pixel the same size, so they are preferred
     whenever they fill at least 85% of the space a fractional scale would. */
  function resize() {
    const touch = document.body.classList.contains('touch');
    const padX = touch ? 4 : 24, padY = touch ? 4 : 64;
    const sx = (window.innerWidth - padX) / LS.W, sy = (window.innerHeight - padY) / LS.H;
    let s = Math.max(0.5, Math.min(sx, sy));
    const whole = Math.floor(s);
    if (whole >= 1 && whole / s >= 0.85) s = whole;
    canvas.style.width = Math.round(LS.W * s) + 'px';
    canvas.style.height = Math.round(LS.H * s) + 'px';
  }
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);

  LS.Input.init();
  LS.game.init();
  resize();

  // Auto-pause when the tab is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && LS.game.state === 'playing') {
      LS.game.setState('paused');
      LS.Audio.duck(true);
    }
    LS.Input.releaseAll();
  });

  // Development aid (?debug=1): mirror the game state and any error into the page title.
  const errors = [];
  if (LS.DEBUG) window.addEventListener('error', (e) => errors.push(e.message + ' @' + (e.filename || '').split('/').pop() + ':' + e.lineno));

  // Development aid (?warp=N): simulate N seconds instantly before the first frame.
  // Combined with ?start=1&auto=1 it plays the level without a human, for quick checks.
  const warp = parseFloat(LS.params.get('warp'));
  if (warp > 0) {
    try {
      for (let i = 0; i < warp * 60; i++) { LS.game.update(1 / 60); LS.Input.endFrame(); }
    } catch (e) { errors.push('warp: ' + e.message); console.error(e); }
  }

  let last = performance.now();
  function frame(now) {
    // Delta time in seconds, clamped so a long stall can't teleport anything.
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    LS.game.update(dt);
    LS.Renderer.draw(LS.game, ctx);
    LS.Input.endFrame();
    if (LS.DEBUG) {
      const g = LS.game, p = g.player;
      document.title = [g.state, g.phase, 'wave' + g.waveIndex, 'hp' + (p ? p.hp : '-'),
        'boss' + (g.boss ? g.boss.hp + '/' + g.boss.state + '@' + (g.boss.x | 0) + ',' + (g.boss.y | 0) : '-'),
        p ? 'p:' + p.state + '@' + (p.x | 0) + ',' + (p.y | 0) : '',
        'foes:' + g.enemies.map((e) => e.state + '@' + (e.x | 0) + ',' + (e.y | 0) + '/' + e.hp).join(';'), 't' + g.t.toFixed(1), 'err:' + (errors.join(' | ') || 'none')].join(' ');
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
