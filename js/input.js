/* input.js - keyboard + touch mapped to abstract actions.
   `down[action]` is true while held, `pressed[action]` only on the frame it went down. */
(function () {
  'use strict';
  const LS = window.LS;

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    KeyJ: 'punch', KeyK: 'kick', Space: 'jump', KeyL: 'special',
    Enter: 'start', NumpadEnter: 'start',
    Escape: 'pause',
    KeyM: 'mute',
  };
  if (LS.DEBUG) {
    KEYMAP.Digit1 = 'dbg1'; KEYMAP.Digit2 = 'dbg2'; KEYMAP.Digit3 = 'dbg3';
  }

  const I = (LS.Input = { down: {}, pressed: {} });

  function press(a) {
    if (!I.down[a]) I.pressed[a] = true;
    I.down[a] = true;
    LS.Audio.unlock(); // browsers only allow audio after a user gesture
  }
  function release(a) { I.down[a] = false; }

  I.endFrame = function () { I.pressed = {}; };
  I.releaseAll = function () { I.down = {}; };

  I.init = function () {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!e.repeat) press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) { e.preventDefault(); release(a); }
    });
    window.addEventListener('blur', I.releaseAll);

    // --- Buttons (touch action buttons + sound toggle) ---
    document.querySelectorAll('[data-action]').forEach((el) => {
      const a = el.dataset.action;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); press(a); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        el.addEventListener(ev, () => release(a)));
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    });

    // --- Virtual stick ---
    const pad = document.getElementById('pad');
    const stick = document.getElementById('stick');
    let padId = null;
    function padMove(e) {
      const r = pad.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const max = r.width / 2 - 14;
      const len = Math.hypot(dx, dy) || 1;
      if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
      stick.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const dz = 14;
      setDir('left', dx < -dz); setDir('right', dx > dz);
      setDir('up', dy < -dz); setDir('down', dy > dz);
    }
    function setDir(a, on) { if (on) press(a); else release(a); }
    function padEnd(e) {
      if (e.pointerId !== padId) return;
      padId = null;
      stick.style.transform = '';
      ['left', 'right', 'up', 'down'].forEach(release);
    }
    if (pad) {
      pad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        padId = e.pointerId;
        if (pad.setPointerCapture) pad.setPointerCapture(padId);
        padMove(e);
      });
      pad.addEventListener('pointermove', (e) => { if (e.pointerId === padId) padMove(e); });
      pad.addEventListener('pointerup', padEnd);
      pad.addEventListener('pointercancel', padEnd);
    }

    // Tapping the screen works as START on touch devices (menus only react to it).
    const canvas = document.getElementById('game');
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch') { enableTouch(); I.pressed.tap = true; LS.Audio.unlock(); }
    });

    function enableTouch() {
      if (document.body.classList.contains('touch')) return;
      document.body.classList.add('touch');
      window.dispatchEvent(new Event('resize'));
    }
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) enableTouch();
    window.addEventListener('touchstart', enableTouch, { once: true, passive: true });
  };

  /* Development only (?auto=1): a tiny bot that walks to the nearest foe and attacks.
     Lets the whole level be exercised without a human at the keyboard. */
  I.autopilot = function (g) {
    const p = g.player;
    if (!p) return;
    const d = (I.down = {});
    let t = g.boss && g.boss.hp > 0 && g.phase === 'boss' ? g.boss : null;
    if (!t) {
      let best = 1e9;
      for (const e of g.enemies) {
        const dist = Math.abs(e.x - p.x);
        if (e.hp > 0 && dist < best) { best = dist; t = e; }
      }
    }
    if (p.power >= p.powerMax && g.enemies.length >= 2) I.pressed.special = true;  // use the solo when it's full
    if (Math.random() < 0.003) I.pressed.jump = true;                              // hop around now and then
    if (!t) {
      // No foes: grab a nearby pickup, smash nearby scenery, otherwise keep walking right.
      let near = null, best = 90;
      for (const it of g.items) { const dd = Math.abs(it.x - p.x) + Math.abs(it.y - p.y); if (dd < best) { best = dd; near = it; } }
      if (!near) for (const b of g.breakables) { const dd = Math.abs(b.x - p.x) + Math.abs(b.y - p.y); if (dd < best) { best = dd; near = b; } }
      if (!near) { d.right = true; return; }
      t = near;
      if (t.life !== undefined) { // a pickup: just walk onto it
        const ix = t.x - p.x, iy = t.y - p.y;
        if (Math.abs(ix) > 4) d[ix > 0 ? 'right' : 'left'] = true;
        if (Math.abs(iy) > 3) d[iy > 0 ? 'down' : 'up'] = true;
        return;
      }
    }
    const dx = t.x - p.x, dy = t.y - p.y;
    if (Math.abs(dy) > 5) d[dy > 0 ? 'down' : 'up'] = true;
    if (Math.abs(dx) > 26) d[dx > 0 ? 'right' : 'left'] = true;
    else if (Math.abs(dx) < 6) d[dx > 0 ? 'left' : 'right'] = true;
    else if ((dx > 0 ? 1 : -1) !== p.facing) { if (p.state !== 'attack') p.facing = dx > 0 ? 1 : -1; }
    else if (Math.abs(dy) <= 8) I.pressed[Math.random() < 0.25 ? 'kick' : 'punch'] = true;
  };
})();
