/* props.js - destructible scenery (crates, kegs, cases, amps) and the pickups they drop.

   A Breakable looks like a fighter to the combat system (it has x / y / z, halfW,
   hittable() and takeHit()), so the exact same attack code that damages enemies also
   smashes crates. It also has an ellipse footprint (rx / ry) so it blocks movement
   until it breaks. */
(function () {
  'use strict';
  const LS = window.LS;
  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  // hp is compared with attack damage: punch 8, kick 18, jump kick 13, solo 30.
  const TYPES = {
    crate: { hp: 20, halfW: 13, height: 24, rx: 14, ry: 5, debris: ['#c08a4c', '#8a5a2c', '#5a3418'], sfx: 'smash' },
    barrel: { hp: 30, halfW: 11, height: 28, rx: 12, ry: 5, debris: ['#b07a40', '#6a4420', '#8a8a94'], sfx: 'smash' },
    case: { hp: 24, halfW: 18, height: 14, rx: 19, ry: 5, debris: ['#26262e', '#8a8a94', '#c8a040'], sfx: 'clang' },
    amp: { hp: 36, halfW: 15, height: 30, rx: 16, ry: 5, debris: ['#26262e', '#c8a040', '#c8c8d0'], sfx: 'clang' },
  };

  class Breakable {
    constructor(type, x, y, drop) {
      const cfg = TYPES[type];
      this.kind = type; this.cfg = cfg; this.team = 'prop';
      this.x = x; this.y = y; this.z = 0; this.facing = 1;
      this.halfW = cfg.halfW; this.height = cfg.height; this.rx = cfg.rx; this.ry = cfg.ry;
      this.maxHp = this.hp = cfg.hp;
      this.drop = drop;     // 'burger' | 'beer' | 'pick' | 'random' | null
      this.shake = 0;
      this.remove = false;
    }
    hittable() { return !this.remove && this.hp > 0; }
    /* Returns true when this hit destroyed it. */
    takeHit(def) { this.hp -= def.dmg; this.shake = 0.14; return this.hp <= 0; }
    update(dt) { if (this.shake > 0) this.shake -= dt; }
  }

  // ---------------------------------------------------------------------
  // Pickups
  // ---------------------------------------------------------------------
  const ITEMS = {
    burger: { hp: 35, power: 0, label: '+35 HP', color: '#2ee86a' },
    beer: { hp: 15, power: 15, label: '+HP +SOLO', color: '#ffe14a' },
    pick: { hp: 0, power: 45, label: '+SOLO', color: '#28dcff' },
  };

  class Item {
    constructor(kind, x, y) {
      this.kind = kind; this.cfg = ITEMS[kind];
      this.x = x; this.y = y; this.z = 8; this.vz = 150;
      this.t = 0; this.life = 14; this.remove = false;
    }
    update(dt) {
      this.t += dt;
      if ((this.life -= dt) <= 0) this.remove = true;
      // tiny bouncing pop when it spawns
      this.z += this.vz * dt; this.vz -= 520 * dt;
      if (this.z <= 0) { this.z = 0; this.vz = this.vz < -60 ? -this.vz * 0.4 : 0; }
    }
  }

  function rollDrop() {
    const r = Math.random();
    return r < 0.4 ? 'burger' : r < 0.7 ? 'beer' : 'pick';
  }

  // ---------------------------------------------------------------------
  // Drawing (feet centre at b.x, b.y)
  // ---------------------------------------------------------------------
  function cracks(c, b, x0, y0, w, h) {
    if (b.hp > b.maxHp * 0.55) return;
    const k = '#1a0e08';
    R(c, x0 + w * 0.3, y0 + 2, 1, h * 0.4, k); R(c, x0 + w * 0.3 + 1, y0 + h * 0.4, 1, h * 0.25, k);
    R(c, x0 + w * 0.65, y0 + h * 0.5, 1, h * 0.35, k); R(c, x0 + w * 0.65 - 1, y0 + h * 0.8, 1, 3, k);
  }

  function drawCrate(c, b, sx) {
    const x0 = Math.round(b.x - 13 + sx), y0 = Math.round(b.y - 24);
    R(c, x0, y0, 26, 24, '#4a2a14');
    R(c, x0 + 1, y0 + 1, 24, 22, '#a8743c');
    R(c, x0 + 1, y0 + 8, 24, 1, '#7a4a24'); R(c, x0 + 1, y0 + 16, 24, 1, '#7a4a24');         // plank gaps
    R(c, x0 + 1, y0 + 1, 24, 3, '#c08a4c');                                                   // top light
    R(c, x0 + 1, y0 + 1, 3, 22, '#8a5a2c'); R(c, x0 + 22, y0 + 1, 3, 22, '#8a5a2c'); R(c, x0 + 1, y0 + 20, 24, 3, '#8a5a2c'); // frame
    for (let i = 0; i < 17; i++) R(c, x0 + 4 + i, y0 + 3 + i, 3, 2, '#7a4a24');             // diagonal brace
    for (const [nx, ny] of [[2, 2], [22, 2], [2, 20], [22, 20]]) R(c, x0 + nx, y0 + ny, 2, 2, '#d8d8d8');
    R(c, x0 + 23, y0 + 4, 2, 18, 'rgba(0,0,0,0.2)');
    cracks(c, b, x0, y0, 26, 24);
  }

  function drawBarrel(c, b, sx) {
    const y0 = Math.round(b.y - 28);
    for (let r = 0; r < 28; r++) {
      const w = 18 + Math.round(4 * Math.sin(Math.PI * r / 27)), x0 = Math.round(b.x - w / 2 + sx);
      R(c, x0 - 1, y0 + r, w + 2, 1, '#2a1608');            // outline
      R(c, x0, y0 + r, w, 1, '#8a5a2c');
      R(c, x0, y0 + r, 3, 1, '#b07a40');
      R(c, x0 + w - 4, y0 + r, 4, 1, '#5a3a1c');
      if (r % 4 === 1) { R(c, x0 + 5, y0 + r, 1, 1, '#6a4420'); R(c, x0 + w - 9, y0 + r, 1, 1, '#6a4420'); } // stave lines
    }
    R(c, b.x - 11 + sx, y0 + 4, 22, 2, '#8a8a94'); R(c, b.x - 11 + sx, y0 + 4, 22, 1, '#c8c8d0');   // steel hoops
    R(c, b.x - 11 + sx, y0 + 21, 22, 2, '#8a8a94'); R(c, b.x - 11 + sx, y0 + 21, 22, 1, '#c8c8d0');
    R(c, b.x - 9 + sx, y0 + 10, 18, 8, '#e8d8a0');                                                    // label
    LS.Text.draw(c, 'ALE', b.x + sx, y0 + 12, '#7a1a1a', 1, 'center');
    cracks(c, b, b.x - 10 + sx, y0, 20, 28);
  }

  function drawCase(c, b, sx) {
    const x0 = Math.round(b.x - 17 + sx), y0 = Math.round(b.y - 14);
    R(c, x0, y0, 34, 14, '#0a0a0e');
    R(c, x0 + 1, y0 + 1, 32, 12, '#26262e');
    R(c, x0 + 1, y0 + 1, 32, 2, '#3c3c48'); R(c, x0 + 28, y0 + 3, 4, 10, 'rgba(0,0,0,0.25)');
    for (const [cx, cy] of [[0, 0], [31, 0], [0, 11], [31, 11]]) R(c, x0 + cx, y0 + cy, 3, 3, '#b8b8c4');   // metal corners
    R(c, x0 + 8, y0 + 6, 4, 3, '#c8a040'); R(c, x0 + 22, y0 + 6, 4, 3, '#c8a040');                         // latches
    R(c, x0 + 12, y0 - 2, 10, 2, '#6a6a74');                                                                // handle
    R(c, x0 + 14, y0 + 3, 6, 4, '#ff2e88'); R(c, x0 + 15, y0 + 4, 4, 1, '#ffd0e8');                        // band sticker
    cracks(c, b, x0, y0, 34, 14);
  }

  function drawAmp(c, b, sx) {
    const x0 = Math.round(b.x - 15 + sx), y0 = Math.round(b.y - 30);
    R(c, x0, y0, 30, 30, '#050508');
    R(c, x0 + 1, y0 + 1, 28, 28, '#1c1c22');
    R(c, x0 + 2, y0 + 2, 26, 6, '#c8a040');                                       // control strip
    for (let i = 0; i < 5; i++) R(c, x0 + 4 + i * 4, y0 + 4, 2, 2, '#1a1a22');   // knobs
    R(c, x0 + 24, y0 + 3, 2, 2, '#ff3030');                                       // power LED
    R(c, x0 + 2, y0 + 10, 26, 16, '#2c2c34');                                     // speaker cloth
    for (let yy = y0 + 11; yy < y0 + 25; yy += 2) for (let xx = x0 + 3 + (yy % 4 ? 1 : 0); xx < x0 + 27; xx += 2) R(c, xx, yy, 1, 1, '#14141a');
    R(c, x0 + 11, y0 + 27, 8, 2, '#c8a040');                                      // badge
    R(c, x0 + 26, y0 + 2, 3, 26, 'rgba(0,0,0,0.25)');
    cracks(c, b, x0, y0, 30, 30);
  }

  const DRAW = { crate: drawCrate, barrel: drawBarrel, case: drawCase, amp: drawAmp };

  function drawItem(c, it) {
    if (it.life < 3 && ((it.t * 10) | 0) % 2) return;        // blink before vanishing
    const x = Math.round(it.x), by = Math.round(it.y);
    const y = Math.round(it.y - it.z - 6 - Math.sin(it.t * 5) * 1.5);
    R(c, x - 6, by - 1, 12, 3, 'rgba(0,0,0,0.35)');
    if (it.kind === 'burger') {
      R(c, x - 7, y - 10, 14, 14, '#0d0812');
      R(c, x - 6, y - 9, 12, 4, '#d8923a'); R(c, x - 4, y - 9, 3, 1, '#f2c070');
      R(c, x - 2, y - 8, 1, 1, '#fff3c0'); R(c, x + 2, y - 7, 1, 1, '#fff3c0');
      R(c, x - 6, y - 5, 12, 2, '#4ac24a'); R(c, x - 5, y - 3, 10, 1, '#ffd21f');
      R(c, x - 6, y - 2, 12, 3, '#6a3418'); R(c, x - 6, y + 1, 12, 2, '#c8822e');
    } else if (it.kind === 'beer') {
      R(c, x - 6, y - 10, 11, 14, '#0d0812'); R(c, x + 4, y - 7, 4, 8, '#0d0812');
      R(c, x - 5, y - 6, 9, 9, '#f0a020'); R(c, x - 4, y - 5, 2, 7, '#ffd070');
      R(c, x - 5, y - 9, 9, 4, '#fff8e0'); R(c, x + 5, y - 6, 2, 6, '#c8c8d8'); R(c, x + 6, y - 5, 1, 4, '#0d0812');
    } else { // pick = solo charge
      const glow = 0.12 + 0.08 * Math.sin(it.t * 6);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = glow;
      R(c, x - 11, y - 14, 22, 22, '#28dcff');
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      for (let r = 0; r < 12; r++) {
        const w = 12 - Math.floor(r * 0.9), x0 = x - (w >> 1);
        R(c, x0 - 1, y - 11 + r, w + 2, 1, '#0d0812');
        R(c, x0, y - 11 + r, w, 1, '#28dcff');
        R(c, x0, y - 11 + r, 2, 1, '#d8f8ff');
      }
      R(c, x - 1, y - 8, 3, 2, '#ffe14a'); R(c, x - 2, y - 6, 3, 2, '#ffe14a'); R(c, x - 1, y - 4, 2, 2, '#ffe14a'); // bolt
    }
  }

  LS.Breakable = Breakable;
  LS.Item = Item;
  LS.Props = {
    types: TYPES,
    items: ITEMS,
    rollDrop,
    draw(ctx, b) {
      const sx = b.shake > 0 ? (Math.random() * 3 | 0) - 1 : 0;   // rattle when hit
      R(ctx, b.x - b.cfg.rx, b.y - 1, b.cfg.rx * 2, 4, 'rgba(0,0,0,0.35)');
      DRAW[b.kind](ctx, b, sx);
    },
    drawItem,
  };
})();
