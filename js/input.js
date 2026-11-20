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
    KeyI: 'block', ShiftLeft: 'block', ShiftRight: 'block', // hold to guard
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
  // Which actions the keyboard holds, so the pad and the keyboard never release each other's input.
  const keyHeld = {};
  let padHeld = {};
  function release(a) { I.down[a] = false; }

  I.endFrame = function () { I.pressed = {}; };

  /* ---- Gamepad (standard mapping) ----
     The Gamepad API has no events for button changes, so main.js calls I.poll() once per frame. It
     turns the pad into the same abstract actions as the keyboard: a change of state calls press() /
     release() exactly like a key would, so keyboard, touch and pad all work at the same time.
       stick / d-pad  move (menus too)      X punch   Y kick   A jump   B solo
       LB RB LT RT    block (hold)          Start     start / confirm, and pause while playing
       Back / Select  pause (go back in menus) */
  const PAD_BUTTONS = {
    0: 'jump', 1: 'special', 2: 'punch', 3: 'kick',
    4: 'block', 5: 'block', 6: 'block', 7: 'block',
    8: 'pause', 9: 'start',
    12: 'up', 13: 'down', 14: 'left', 15: 'right',
  };
  const STICK_DEADZONE = 0.45;
  I.poll = function () {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const want = {};
    for (const gp of pads) {
      if (!gp || !gp.connected || gp.mapping !== 'standard') continue;
      gp.buttons.forEach((b, i) => { if ((b.pressed || b.value > 0.5) && PAD_BUTTONS[i]) want[PAD_BUTTONS[i]] = true; });
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (ax < -STICK_DEADZONE) want.left = true; else if (ax > STICK_DEADZONE) want.right = true;
      if (ay < -STICK_DEADZONE) want.up = true; else if (ay > STICK_DEADZONE) want.down = true;
      // Start also pauses during play (Esc does on the keyboard; Enter alone would do nothing there).
      // Only on the press itself: held on, it would re-pause the frame after Start resumed the game.
      if (want.start && !padHeld.start && LS.game && LS.game.state === 'playing' && !LS.game.exitPick) want.pause = true;   // at a fork Start confirms the door instead
    }
    for (const a of Object.keys(want)) if (!padHeld[a]) press(a);
    for (const a of Object.keys(padHeld)) if (!want[a] && !keyHeld[a]) release(a);   // a key still holding it keeps it down
    padHeld = want;
  };
  I.releaseAll = function () { I.down = {}; };

  I.init = function () {
    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      keyHeld[a] = true;
      if (!e.repeat) press(a);
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) { e.preventDefault(); keyHeld[a] = false; if (!padHeld[a]) release(a); }
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
    // Any pointer reports where it landed, in canvas coordinates, as `pressed.click` (menus hit-test it);
    // a touch also counts as `tap` (confirm), which is all the old screens react to.
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      I.pressed.click = { x: (e.clientX - r.left) / r.width * LS.W, y: (e.clientY - r.top) / r.height * LS.H };
      LS.Audio.unlock();
      if (e.pointerType === 'touch') { enableTouch(); I.pressed.tap = true; }
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
    if (g.exitPick) I.pressed.start = true;                                       // at a fork: take the highlighted way
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
