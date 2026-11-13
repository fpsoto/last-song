/* background.js - procedural stage art.

   LS.Scenes is a registry: each era points to a scene by name (see levels.js). A scene has:
     build(c, era)            paints the static art ONCE into a wide off-screen canvas
     dynamic(ctx, t, hot)     animated bits drawn every frame (people, neon, lights)
     foreground(ctx, camX, t) things in front of the fighters, with parallax
     prop(ctx, p)             solid props that are depth-sorted with the fighters
   LS.Background is the thin layer the renderer talks to. */
(function () {
  'use strict';
  const LS = window.LS;
  const WALL = 172; // y where the back wall meets the floor
  const SOFF = 1000; // the stage block was authored at x=916 and is shifted here (the level grew)

  const R = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  /* Thick pixel line made of square stamps. */
  function seg(c, x0, y0, x1, y1, w, col) {
    c.fillStyle = col;
    const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + dx * i / n - w / 2), Math.round(y0 + dy * i / n - w / 2), w, w);
  }

  // =====================================================================
  // People. Small functions that draw shaded, rounded pixel characters;
  // shared by the bar patrons, the bartender, the booth guests and the crowd.
  // =====================================================================
  const dk = (hex, f) => LS.shade(hex, f);

  /* Head and shoulders, facing the camera. `top` = y of the top of the head.
     p: skin, hair, style ('slick' | 'long' | 'cap' | 'afro'), shirt, plus optional
        cap, vest, bow, stache, beard, shades, len (torso rows), arms. */
  function bust(c, x, top, p, t, i) {
    const blink = ((t * 0.8 + i * 0.41) % 3.2) < 0.1;
    const look = Math.round(Math.sin(t * 0.7 + i * 2));         // pupils drift left / right
    const sk = p.skin, skd = dk(sk, 0.76), len = p.len || 22, ty = top + 11;
    const sh = p.shirt, shd = dk(sh, 0.62), shl = dk(sh, 1.25);

    // torso: narrow sloped shoulders on top, then straight down
    for (let r = 0; r < len; r++) {
      const w = r === 0 ? 12 : r === 1 ? 16 : 18, x0 = x - (w >> 1);
      R(c, x0, ty + r, w, 1, sh);
      R(c, x0, ty + r, 1, 1, shl);
      R(c, x0 + w - 3, ty + r, 3, 1, shd);
    }
    R(c, x - 2, top + 9, 4, 3, skd);                              // neck
    if (p.vest) {                                                // open vest, shirt in the middle
      R(c, x - 9, ty + 2, 5, len - 2, p.vest); R(c, x + 4, ty + 2, 5, len - 2, p.vest);
      R(c, x - 9, ty + 2, 1, len - 2, dk(p.vest, 1.8)); R(c, x + 4, ty + 2, 1, len - 2, dk(p.vest, 0.6));
      for (let k = 0; k < 3; k++) R(c, x, ty + 5 + k * 5, 1, 2, '#c8a040');
    }
    if (p.bow) { R(c, x - 5, ty, 4, 3, p.bow); R(c, x + 1, ty, 4, 3, p.bow); R(c, x - 1, ty, 2, 3, dk(p.bow, 0.55)); }
    R(c, x - 3, ty - 1, 6, 2, sk);                                // open collar
    if (p.arms !== false) {                                       // near arm hanging down
      R(c, x - 12, ty + 1, 4, 12, p.vest ? sh : dk(sh, 0.9));
      if (p.rolled) { R(c, x - 12, ty + 7, 4, 7, sk); R(c, x - 12, ty + 7, 4, 1, shl); }
    }

    // head
    R(c, x - 6, top + 4, 1, 3, skd); R(c, x + 5, top + 4, 1, 3, skd);   // ears
    R(c, x - 5, top, 10, 10, sk);
    R(c, x - 5, top + 9, 10, 1, skd);
    R(c, x + 3, top + 1, 2, 8, dk(sk, 0.9));                              // lit left / shaded right
    const hr = p.hair, hl = dk(hr, 1.5), hd = dk(hr, 0.65);
    if (p.style === 'slick') {
      R(c, x - 5, top - 1, 10, 3, hr); R(c, x - 6, top, 1, 5, hr); R(c, x + 5, top, 1, 5, hr);
      R(c, x - 3, top - 1, 5, 1, hl); R(c, x - 5, top + 2, 2, 1, hd);
    } else if (p.style === 'long') {
      R(c, x - 6, top - 2, 12, 4, hr); R(c, x - 7, top, 3, 17, hr); R(c, x + 4, top, 3, 17, hr);
      R(c, x - 4, top - 2, 6, 1, hl); R(c, x - 7, top + 6, 1, 8, hd); R(c, x + 6, top + 4, 1, 10, hd);
    } else if (p.style === 'cap') {
      R(c, x - 6, top - 3, 12, 5, p.cap); R(c, x - 5, top - 3, 6, 1, dk(p.cap, 1.5));
      R(c, x - 8, top + 1, 16, 2, dk(p.cap, 0.6)); R(c, x - 6, top + 2, 1, 4, hr); R(c, x + 5, top + 2, 1, 4, hr);
    } else if (p.style === 'afro') {
      R(c, x - 8, top - 5, 16, 9, hr); R(c, x - 9, top - 2, 2, 9, hr); R(c, x + 7, top - 2, 2, 9, hr);
      R(c, x - 5, top - 5, 7, 1, hl); R(c, x + 4, top - 3, 4, 6, hd);
    }
    if (p.shades) { R(c, x - 5, top + 3, 10, 3, '#0a0a12'); R(c, x - 4, top + 3, 3, 1, '#7a7aa0'); }
    else if (blink) { R(c, x - 3, top + 5, 2, 1, '#14100e'); R(c, x + 1, top + 5, 2, 1, '#14100e'); }
    else {
      R(c, x - 3, top + 4, 3, 2, '#f4f0e8'); R(c, x + 1, top + 4, 3, 2, '#f4f0e8');
      R(c, x - 2 + look, top + 4, 1, 2, '#14100e'); R(c, x + 2 + look, top + 4, 1, 2, '#14100e');
      R(c, x - 4, top + 3, 4, 1, hd); R(c, x + 1, top + 3, 4, 1, hd);          // brows
    }
    R(c, x - 1, top + 6, 2, 2, skd);                                           // nose
    if (p.beard) { R(c, x - 5, top + 7, 10, 4, hr); R(c, x - 2, top + 8, 4, 1, '#7a3a30'); }
    else {
      if (p.stache) R(c, x - 3, top + 7, 6, 2, hr);
      R(c, x - 2, top + 8 + (p.stache ? 1 : 0), 4, 1, '#7a3a30');
    }
  }

  const BARMAN = { skin: '#d8a47a', hair: '#1c1410', style: 'slick', shirt: '#ece4d4', vest: '#1c1c26', bow: '#b0241e', stache: true, rolled: true, len: 23 };
  const GUESTS = [
    { skin: '#f0c8a8', hair: '#f4d35e', style: 'afro', shirt: '#e0348c', len: 36, arms: false },
    { skin: '#c48c64', hair: '#2a1a12', style: 'cap', cap: '#2e6ab0', shirt: '#46628a', beard: true, len: 36, arms: false },
  ];

  /* Customer sitting on a bar stool, seen from behind. Seat top is y = 148. */
  function patron(c, x, t, i, p) {
    const nod = Math.sin(t * 3 + i * 2) > 0.5 ? 1 : 0;           // nodding to the music
    const sip = ((t * 0.3 + i * 0.29) % 1) < 0.14;                // lifts the glass now and then
    const top = 128 + nod, col = p.c, cd = dk(col, 0.6), cl = dk(col, 1.3);
    const sk = p.skin, skd = dk(sk, 0.76), hr = p.h, hl = dk(hr, 1.5), hd = dk(hr, 0.6);

    // legs + shoes
    R(c, x - 6, 149, 5, 11, p.pants); R(c, x + 1, 149, 5, 11, p.pants);
    R(c, x - 6, 149, 1, 11, dk(p.pants, 1.4)); R(c, x + 4, 149, 2, 11, dk(p.pants, 0.6));
    R(c, x - 7, 159, 6, 3, '#14100e'); R(c, x + 1, 159, 6, 3, '#14100e');
    R(c, x - 7, 161, 6, 1, '#3a3a44'); R(c, x + 1, 161, 6, 1, '#3a3a44');

    // torso: sloped shoulders, tapering waist, centre seam, belt
    for (let r = 0; r < 21; r++) {
      const w = r === 0 ? 10 : r === 1 ? 12 : r < 8 ? 14 : r < 14 ? 13 : 12, x0 = x - (w >> 1);
      R(c, x0, top + r, w, 1, col); R(c, x0, top + r, 1, 1, cl); R(c, x0 + w - 3, top + r, 3, 1, cd);
    }
    R(c, x, top + 4, 1, 15, cd);
    R(c, x - 6, top + 19, 12, 2, '#14100e'); R(c, x - 1, top + 19, 2, 2, '#c8c8d0');
    if (p.logo) { R(c, x - 4, top + 5, 8, 7, dk(p.logo, 0.7)); R(c, x - 3, top + 6, 6, 1, p.logo); R(c, x - 2, top + 8, 4, 1, p.logo); R(c, x - 3, top + 10, 6, 1, p.logo); }
    R(c, x - 6, top + 1, 1, 7, 'rgba(142,234,255,0.4)');          // neon rim light on the left shoulder

    // arms: left rests on the bar, right sometimes lifts the drink
    R(c, x - 9, top + 1, 3, 9, col); R(c, x - 9, top + 1, 1, 9, cl);
    if (sip) {
      R(c, x + 6, top - 8, 3, 11, cd); R(c, x + 6, top - 9, 3, 2, sk);
      R(c, x + 5, top - 14, 5, 5, '#f0a020'); R(c, x + 5, top - 15, 5, 2, '#fff8e0');
    } else {
      R(c, x + 6, top + 1, 3, 9, cd);
      R(c, x + 9, 119, 3, 7, '#3fae5a'); R(c, x + 10, 117, 1, 3, '#3fae5a'); R(c, x + 9, 121, 1, 3, 'rgba(255,255,255,0.45)');
    }

    // neck + head
    R(c, x - 2, top - 2, 4, 3, skd);
    const hy = top - 10;
    if (p.style === 'afro') {
      R(c, x - 7, hy - 3, 14, 12, hr); R(c, x - 5, hy - 3, 7, 1, hl); R(c, x + 3, hy, 4, 9, hd); R(c, x - 6, hy + 4, 1, 4, hd);
    } else if (p.style === 'long') {
      R(c, x - 5, hy - 1, 10, 19, hr); R(c, x - 3, hy - 1, 4, 1, hl);
      R(c, x - 1, hy + 4, 1, 12, hd); R(c, x + 2, hy + 3, 1, 14, hd); R(c, x + 4, hy + 2, 1, 14, hd);
    } else if (p.style === 'cap') {
      R(c, x - 4, hy + 6, 8, 4, hr); R(c, x - 5, hy, 10, 6, p.cap); R(c, x - 4, hy, 5, 1, dk(p.cap, 1.5));
      R(c, x - 1, hy - 1, 2, 1, dk(p.cap, 0.7)); R(c, x - 3, hy + 6, 6, 1, '#14100e');
      R(c, x + 4, hy + 5, 2, 3, sk);
    } else if (p.style === 'bald') {
      R(c, x - 4, hy, 8, 10, sk); R(c, x - 4, hy, 8, 2, dk(sk, 1.2)); R(c, x + 2, hy + 1, 2, 9, skd);
      R(c, x - 6, hy + 4, 2, 3, skd); R(c, x + 4, hy + 4, 2, 3, skd);
    } else { // short hair
      R(c, x - 4, hy, 8, 9, hr); R(c, x - 3, hy, 4, 1, hl); R(c, x + 2, hy + 1, 2, 8, hd);
      R(c, x - 6, hy + 4, 2, 3, skd); R(c, x + 4, hy + 4, 2, 3, skd);
    }
  }

  /* Member of the audience, from behind, facing the stage. `baseY` = feet / bottom edge. */
  function fan(c, x, baseY, p, t, hot, i) {
    const bob = Math.sin(t * (hot ? 9 : 5) + i * 1.7) > 0 ? 1 : 0, top = baseY - p.h + bob;
    const col = dk(p.c, 0.62), cd = dk(p.c, 0.38), cl = dk(p.c, 0.95), hr = dk(p.hair, 0.7), hl = dk(p.hair, 1.1);
    const rim = hot ? '#ff9ad0' : '#ffb870', sk = '#8a6048';
    // body: rounded shoulders widening to the torso
    for (let r = 9, k = 0; r < p.h; r++, k++) {
      const w = k === 0 ? 10 : k === 1 ? 13 : 15, x0 = x - (w >> 1);
      R(c, x0, top + r, w, 1, col); R(c, x0, top + r, 1, 1, cl); R(c, x0 + w - 3, top + r, 3, 1, cd);
    }
    R(c, x - 7, top + 11, 1, p.h - 14, rim);                          // stage light catching the edge
    if (p.logo) { R(c, x - 4, top + 14, 8, 5, dk(p.logo, 0.55)); R(c, x - 3, top + 15, 6, 1, dk(p.logo, 0.9)); }
    R(c, x - 2, top + 7, 4, 3, dk(sk, 0.8));                          // neck
    // head + hair
    if (p.style === 'mohawk') {
      R(c, x - 4, top + 1, 8, 8, dk(sk, 0.8)); R(c, x - 1, top - 6, 3, 8, p.hair);
      R(c, x - 1, top - 7, 3, 1, dk(p.hair, 1.5)); R(c, x - 4, top + 1, 8, 1, dk(sk, 0.6));
    } else if (p.style === 'long') {
      R(c, x - 5, top, 10, 17, hr); R(c, x - 4, top, 5, 1, hl); R(c, x - 1, top + 5, 1, 9, dk(hr, 0.7)); R(c, x + 2, top + 4, 1, 11, dk(hr, 0.7));
    } else if (p.style === 'cap') {
      R(c, x - 5, top - 1, 10, 5, dk(p.cap, 0.7)); R(c, x - 4, top - 1, 5, 1, dk(p.cap, 1.1)); R(c, x - 4, top + 4, 8, 5, hr);
    } else {
      R(c, x - 4, top, 8, 9, hr); R(c, x - 3, top, 4, 1, hl); R(c, x + 2, top + 1, 2, 8, dk(hr, 0.65));
    }
    R(c, x - 5, top + 1, 1, 5, rim);
    // raised arm
    const up = hot || Math.sin(t * 2 + i) > 0.2;
    if (p.arm && up) {
      const ax = x + 7;
      R(c, ax, top + 1 + bob, 3, 11, col); R(c, ax, top + 1 + bob, 1, 11, cl);
      R(c, ax - 1, top - 4 + bob, 5, 5, dk(sk, 0.85));                  // fist
      if (p.arm === 'horns') { R(c, ax - 1, top - 8 + bob, 1, 4, dk(sk, 0.85)); R(c, ax + 3, top - 8 + bob, 1, 4, dk(sk, 0.85)); }
      if (p.arm === 'lighter') {
        const fl = Math.sin(t * 20 + i) > 0 ? 5 : 4;
        R(c, ax, top - 5 - fl + bob, 3, fl, '#ffb02e'); R(c, ax + 1, top - 4 - fl + bob, 1, fl - 1, '#fff3b0');
      }
    }
  }

  const PATRONS = [
    { x: 530, c: '#46506a', pants: '#2a3040', h: '#1a1210', skin: '#c88c60', style: 'long', logo: '#ffb02e' },
    { x: 662, c: '#2e6a5a', pants: '#2a2a34', h: '#d8b040', skin: '#efc2a2', style: 'afro' },
    { x: 772, c: '#6a2a3a', pants: '#34304a', h: '#3a2418', skin: '#b87a54', style: 'cap', cap: '#c8a030' },
    { x: 838, c: '#2a2a32', pants: '#1c2a4a', h: '#1c1814', skin: '#d8a47a', style: 'bald', logo: '#ff2e88' },
  ];
  const FANS = [
    { x: 986, h: 31, c: '#5a4a8a', hair: '#8a5a2a', style: 'long', arm: 'horns', logo: '#ff2e88' },
    { x: 1052, h: 28, c: '#3a5a6a', hair: '#2a1a12', style: 'short' },
    { x: 1118, h: 33, c: '#6a3a4a', hair: '#2ee86a', style: 'mohawk', arm: 'fist', logo: '#ffe14a' },
    { x: 1214, h: 29, c: '#4a4a5a', hair: '#c8a040', style: 'long', arm: 'lighter' },
    { x: 1276, h: 31, c: '#2a3a5a', hair: '#1a1a1a', style: 'cap', cap: '#a02030', arm: 'fist' },
    { x: 1352, h: 27, c: '#5a2a5a', hair: '#e0e0e8', style: 'short', arm: 'horns', logo: '#28dcff' },
  ];

  // =====================================================================
  // Scene: 1984 - THE LAST BAR
  // Layout (world x):  0-470 entrance | 470-916 bar | 916-1416 game room |
  //                    1416-1916 backstage hall | 1916-2400 live stage
  // =====================================================================
  const signs = [
    { text: 'THE LAST BAR', x: 150, y: 42, scale: 2, color: '#ff2e88', core: '#ffd0e8', a: 3.1, b: 7.3 },
    { text: 'EXIT', x: 30, y: 66, scale: 1, color: '#2ee86a', core: '#d0ffe0', a: 2.3, b: 5.1 },
    { text: 'COLD BEER', x: 636, y: 37, scale: 2, color: '#28dcff', core: '#d8f8ff', a: 4.7, b: 3.3 },
    { text: 'LIVE >>', x: 806, y: 37, scale: 2, color: '#ffb02e', core: '#fff0c8', a: 1.9, b: 6.1 },
    { text: '8 BALL', x: 1146, y: 37, scale: 2, color: '#2ee86a', core: '#d0ffe0', a: 2.7, b: 5.9 },
    { text: 'ON AIR', x: 1566, y: 37, scale: 2, color: '#ff3030', core: '#ffd0d0', a: 3.7, b: 4.3 },
  ];
  const JUKE = 352;
  const LIGHTS = ['#ff2e88', '#ffe14a', '#28dcff', '#2ee86a', '#b04dff'];

  function bricks(c, x0, x1, y0, y1, rnd) {
    R(c, x0, y0, x1 - x0, y1 - y0, '#3a2034');
    for (let y = y0, row = 0; y < y1; y += 7, row++) {
      R(c, x0, y, x1 - x0, 1, '#22121f');
      for (let x = x0 + (row % 2 ? 8 : 0); x < x1; x += 16) {
        R(c, x, y, 1, 7, '#22121f');
        const k = rnd();
        if (k < 0.12) R(c, x + 1, y + 1, 15, 6, '#452840');
        else if (k < 0.22) R(c, x + 1, y + 1, 15, 6, '#30182c');
      }
    }
  }

  function wainscot(c, x0, x1) {
    R(c, x0, 128, x1 - x0, 44, '#2c1810');
    R(c, x0, 128, x1 - x0, 3, '#4e2c18'); R(c, x0, 131, x1 - x0, 1, '#1a0e08');
    for (let x = x0 + 6; x < x1; x += 14) R(c, x, 134, 1, 36, '#20100a');
  }

  function poster(c, x, y, w, h, bg, accent, fg, lines) {
    const T = LS.Text;
    R(c, x - 1, y - 1, w + 2, h + 2, '#0c0810');
    R(c, x, y, w, h, bg);
    R(c, x + 2, y + 2, w - 4, (h * 0.42) | 0, accent);
    lines.forEach((ln, i) => T.draw(c, ln, x + w / 2, y + h - 7 * (lines.length - i), fg, 1, 'center'));
    R(c, x - 1, y - 1, 3, 2, '#d8d0b0'); R(c, x + w - 2, y - 1, 3, 2, '#d8d0b0'); // tape
  }

  function bottle(c, x, base, h, col) {
    R(c, x, base - h + 4, 3, h - 4, col);
    R(c, x + 1, base - h, 1, 4, col);
    R(c, x, base - h + 5, 1, 3, 'rgba(255,255,255,0.45)');
  }

  function ampCab(c, x, y) { // 36 x 28 speaker cabinet
    R(c, x, y, 36, 28, '#0c0c10'); R(c, x + 1, y + 1, 34, 26, '#1a1a20');
    R(c, x + 3, y + 3, 30, 20, '#2c2c34');
    for (let yy = y + 4; yy < y + 22; yy += 2) for (let xx = x + 4 + (yy % 4 ? 1 : 0); xx < x + 32; xx += 2) R(c, xx, yy, 1, 1, '#14141a');
    R(c, x + 14, y + 24, 8, 2, '#c8a040');
  }
  function ampHead(c, x, y) { // 36 x 10 amplifier head
    R(c, x, y, 36, 10, '#0c0c10'); R(c, x + 1, y + 1, 34, 8, '#22222a');
    R(c, x + 2, y + 5, 32, 3, '#c8a040');
    for (let i = 0; i < 6; i++) R(c, x + 4 + i * 4, y + 5, 2, 2, '#1a1a20');
    R(c, x + 31, y + 2, 2, 2, '#ff3030');
  }

  function flight(c, x, y, w, h) { // flight case with metal edges and a latch
    R(c, x, y, w, h, '#0c0c10'); R(c, x + 1, y + 1, w - 2, h - 2, '#1c1c24');
    R(c, x, y, w, 2, '#9a9aa4'); R(c, x, y + h - 2, w, 2, '#6a6a74');
    R(c, x, y, 2, h, '#9a9aa4'); R(c, x + w - 2, y, 2, h, '#6a6a74');
    for (const [cx, cy] of [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]]) R(c, x + cx, y + cy, 4, 4, '#c0c0c8');
    R(c, x + (w >> 1) - 3, y + (h >> 1) - 2, 6, 4, '#c8c8d0'); R(c, x + (w >> 1) - 2, y + (h >> 1) - 1, 4, 2, '#2a2a32');
    R(c, x + 6, y + 4, w - 12, 1, 'rgba(255,255,255,0.08)');
  }

  function disc(c, cx, cy, rad, col) {
    c.fillStyle = col;
    for (let y = -rad; y <= rad; y++) for (let x = -rad; x <= rad; x++) if (x * x + y * y <= rad * rad) c.fillRect(cx + x, cy + y, 1, 1);
  }

  function dartboard(c, cx, cy) {
    disc(c, cx, cy, 17, '#0c0810');
    for (let y = -15; y <= 15; y++) {
      for (let x = -15; x <= 15; x++) {
        const d = Math.hypot(x, y);
        if (d > 15) continue;
        const sector = Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 20) % 2;
        let col = sector ? '#e8dcb0' : '#1a1a1a';
        if ((d > 11 && d <= 13) || (d > 5 && d <= 7)) col = sector ? '#2e9a4a' : '#c0262e'; // doubles / trebles
        if (d <= 3) col = '#2e9a4a';
        if (d <= 1.6) col = '#c0262e';
        c.fillStyle = col; c.fillRect(cx + x, cy + y, 1, 1);
      }
    }
    for (const [dx, dy] of [[4, -3], [-6, 2], [1, 7]]) { seg(c, cx + dx, cy + dy, cx + dx + 5, cy + dy - 4, 1, '#d8d8e0'); R(c, cx + dx + 5, cy + dy - 5, 2, 2, '#c0262e'); }
  }

  const lastBar = {
    build(c, era) {
      const T = LS.Text, rnd = LS.rng(1984), W = era.width;

      // ---------- Entrance: brick wall, wainscot, door, posters ----------
      bricks(c, 0, 470, 0, 130, rnd);
      R(c, 0, 128, 470, 44, '#2c1810');
      R(c, 0, 128, 470, 3, '#4e2c18'); R(c, 0, 131, 470, 1, '#1a0e08');
      for (let x = 6; x < 470; x += 14) R(c, x, 134, 1, 36, '#20100a');

      R(c, 16, 76, 50, 96, '#150c0a');                    // door frame
      R(c, 20, 80, 42, 92, '#5a1c1c'); R(c, 20, 80, 42, 2, '#7a2c2c');
      R(c, 28, 88, 26, 22, '#0c1422'); R(c, 30, 90, 8, 18, '#2a1a44'); // window
      R(c, 24, 118, 34, 1, '#3e1212'); R(c, 24, 146, 34, 1, '#3e1212');
      R(c, 56, 128, 3, 6, '#d0a848');                     // handle
      R(c, 24, 62, 34, 12, '#101814');                    // EXIT box (neon drawn live)

      poster(c, 84, 60, 36, 48, '#e8d8a0', '#1a1a22', '#b0241e', ['THE', 'VOLTS']);
      c.fillStyle = '#ffe14a';                            // lightning bolt
      [[100, 64, 6, 4], [97, 68, 6, 4], [100, 72, 8, 3], [98, 75, 5, 4], [96, 79, 3, 3]].forEach((r) => c.fillRect(r[0], r[1], r[2], r[3]));
      poster(c, 128, 70, 34, 40, '#2a0a3a', '#ff2e88', '#ffd0e8', ['NEON', 'WIDOW']);
      R(c, 138, 76, 14, 10, '#2a0a3a'); R(c, 141, 78, 3, 3, '#28dcff'); R(c, 147, 78, 3, 3, '#28dcff');
      // Jack's own poster, with the bad news stuck on top
      poster(c, 262, 58, 38, 52, '#20202a', '#a62a3a', '#f4f0e8', ['JACK', 'RYDER', 'LIVE']);
      R(c, 276, 63, 10, 10, '#dba077'); R(c, 274, 61, 13, 4, '#3d2b22'); R(c, 273, 63, 3, 12, '#3d2b22');
      R(c, 264, 76, 34, 8, '#ffe14a'); T.draw(c, '3 SOLD', 281, 78, '#1a1010', 1, 'center');
      poster(c, 424, 64, 36, 44, '#d8702a', '#3a1a0a', '#fff0c8', ['RUSTY', 'HALO']);
      R(c, 434, 70, 16, 3, '#ffe14a'); R(c, 432, 72, 3, 3, '#ffe14a'); R(c, 449, 72, 3, 3, '#ffe14a');
      R(c, 146, 38, 152, 20, 'rgba(8,4,12,0.55)');        // board behind the big neon sign

      // ---------- Jukebox ----------
      const j = JUKE;
      R(c, j + 6, 98, 26, 6, '#7a3a14'); R(c, j + 2, 103, 34, 10, '#7a3a14');
      R(c, j, 112, 38, 60, '#5a2a10'); R(c, j, 112, 38, 1, '#d8c070');
      R(c, j + 6, 114, 26, 16, '#0e1620'); R(c, j + 12, 117, 14, 10, '#050508');
      R(c, j + 15, 119, 8, 6, '#1a1a22'); R(c, j + 18, 121, 2, 2, '#e03030');
      R(c, j + 6, 132, 26, 4, '#e8e0c0');
      for (let i = 0; i < 6; i++) R(c, j + 8 + i * 4, 133, 2, 2, '#b0241e');
      R(c, j + 6, 139, 26, 27, '#2a1408');
      for (let x = j + 7; x < j + 32; x += 3) R(c, x, 140, 1, 25, '#c8a040');
      R(c, j + 2, 169, 34, 3, '#2a1408');

      // ---------- Bar: mirror, shelves, bottles, counter, stools ----------
      R(c, 470, 0, 446, WALL, '#141c28');
      for (let x = 470; x < 916; x += 22) R(c, x, 0, 1, 126, '#101722');
      R(c, 508, 52, 364, 68, '#3a2212'); R(c, 512, 56, 356, 60, '#1c2e3c');
      for (let i = 0; i < 5; i++) { // diagonal shine on the mirror
        for (let k = 0; k < 52; k += 2) R(c, 560 + i * 62 + k / 2, 110 - k, 2, 2, '#243a4a');
      }
      const cols = ['#3fae5a', '#c8862a', '#b8d8e8', '#c03a3a', '#3a6ad0', '#8a4ad0'];
      for (const sy of [80, 112]) {
        R(c, 512, sy, 356, 3, '#5a3418'); R(c, 512, sy + 3, 356, 1, '#24140a');
        for (let x = 518; x < 860; x += 6 + ((rnd() * 5) | 0)) bottle(c, x, sy, 10 + ((rnd() * 6) | 0), cols[(rnd() * cols.length) | 0]);
      }
      R(c, 486, 126, 408, 5, '#96582c'); R(c, 486, 126, 408, 1, '#c88a4a'); // counter top
      R(c, 490, 131, 400, 41, '#4a2614'); R(c, 490, 131, 400, 2, '#2a140a');
      for (let x = 496; x < 884; x += 44) { R(c, x, 137, 38, 22, '#3c1e10'); R(c, x, 137, 38, 1, '#5e3420'); }
      R(c, 490, 163, 400, 2, '#d0a848');                  // brass foot rail
      for (let x = 500; x < 890; x += 40) R(c, x, 163, 2, 9, '#a07a28');
      for (let i = 0; i < 3; i++) { R(c, 700 + i * 8, 116, 2, 10, '#c8c8d0'); R(c, 699 + i * 8, 114, 4, 3, ['#b0241e', '#ffe14a', '#28dcff'][i]); } // taps
      for (const x of [530, 596, 662, 772, 838]) {        // stools
        R(c, x - 7, 148, 14, 4, '#a02030'); R(c, x - 7, 148, 14, 1, '#d04050');
        R(c, x - 1, 152, 2, 18, '#8a8a94'); R(c, x - 5, 162, 10, 1, '#8a8a94'); R(c, x - 6, 170, 12, 3, '#4a4a54');
      }
      for (const x of [470, 900, 1400, 1900]) { R(c, x, 0, 16, WALL, '#2a1810'); R(c, x, 0, 2, WALL, '#4a2c1a'); R(c, x + 14, 0, 2, WALL, '#160c08'); } // pillars

      // ---------- Game room: pinstripe wall, dartboard, corkboard, booths, arcade ----------
      R(c, 916, 0, 500, 128, '#18242c');
      for (let x = 916; x < 1416; x += 10) { R(c, x, 0, 2, 128, '#1e303a'); R(c, x + 6, 0, 1, 128, '#131c24'); }
      wainscot(c, 916, 1416);
      dartboard(c, 990, 74);
      R(c, 969, 96, 42, 6, '#3a2212'); R(c, 972, 99, 36, 1, '#c8a040'); T.draw(c, 'DARTS', 990, 90, '#c8a040', 1, 'center'); // sign under the board
      R(c, 1256, 42, 100, 58, '#4a2c14'); R(c, 1259, 45, 94, 52, '#a8743c');      // corkboard
      for (let i = 0; i < 160; i++) R(c, 1259 + rnd() * 92, 45 + rnd() * 50, 1, 1, rnd() < 0.5 ? '#8a5a2c' : '#c08a4c');
      R(c, 1264, 50, 42, 24, '#e8e0b0'); T.draw(c, 'BASSIST', 1285, 54, '#2a2a30', 1, 'center'); T.draw(c, 'WANTED', 1285, 62, '#b0241e', 1, 'center'); R(c, 1283, 51, 4, 3, '#b0241e');
      R(c, 1312, 56, 38, 22, '#f0a0b8'); T.draw(c, 'LOST:', 1331, 60, '#2a2a30', 1, 'center'); T.draw(c, 'DREAMS', 1331, 68, '#2a2a30', 1, 'center'); R(c, 1329, 57, 4, 3, '#2e6ab0');
      R(c, 1270, 78, 30, 14, '#d8f0d8'); T.draw(c, 'GIGS', 1285, 83, '#2a2a30', 1, 'center'); R(c, 1283, 79, 4, 3, '#2e9a4a');
      R(c, 1150, 0, 2, 22, '#14141a');                                              // hanging lamp over the pool table
      R(c, 1128, 22, 46, 8, '#1e5a2e'); R(c, 1128, 22, 46, 2, '#3a9a5a'); R(c, 1132, 30, 38, 2, '#14301c');
      R(c, 1150, 33, 2, 2, '#fff0b0');
      // booths along the left wall of the room
      R(c, 1030, 98, 92, 46, '#5a1020'); R(c, 1030, 98, 92, 3, '#8a2034'); R(c, 1030, 98, 3, 46, '#7a1a2c'); R(c, 1119, 98, 3, 46, '#3a0a14');
      for (let y = 106; y < 142; y += 9) for (let x = 1040; x < 1115; x += 11) { R(c, x, y, 2, 2, '#9a2a40'); R(c, x + 1, y + 1, 1, 1, '#3a0a14'); } // tufting
      R(c, 1030, 144, 92, 12, '#4a0e1a'); R(c, 1030, 144, 92, 2, '#7a1a2c');
      R(c, 1044, 150, 64, 4, '#c8b890'); R(c, 1044, 150, 64, 1, '#e8dcb8'); R(c, 1074, 154, 4, 16, '#6a5a48');   // little table
      R(c, 1056, 146, 3, 4, '#c8862a'); R(c, 1090, 146, 3, 4, '#3fae5a');                                       // drinks
      // arcade cabinet
      R(c, 1364, 78, 34, 94, '#0c0c1c'); R(c, 1366, 80, 30, 90, '#1a1a34'); R(c, 1366, 80, 3, 90, '#ff2e88'); R(c, 1393, 80, 3, 90, '#28dcff');
      R(c, 1370, 84, 22, 10, '#2a0a3a'); T.draw(c, 'FIGHT', 1381, 87, '#ffe14a', 1, 'center');
      R(c, 1369, 96, 24, 20, '#050508'); R(c, 1370, 97, 22, 18, '#0a1020');
      R(c, 1368, 118, 26, 10, '#2a2a44'); R(c, 1374, 120, 2, 4, '#c0c0c8'); R(c, 1373, 119, 4, 2, '#e03030'); R(c, 1382, 122, 3, 3, '#e03030'); R(c, 1387, 122, 3, 3, '#2e6ab0');
      R(c, 1370, 138, 22, 22, '#14142c'); R(c, 1376, 144, 10, 4, '#ffd21f'); R(c, 1378, 145, 6, 2, '#0c0c1c');   // coin door
      R(c, 1364, 78, 34, 2, '#3a3a5a');

      // ---------- Backstage hall: concrete, pipes, dressing-room door and mirror ----------
      R(c, 1416, 0, 500, WALL, '#24232c');
      R(c, 1416, 70, 500, 102, '#2e2c38'); R(c, 1416, 70, 500, 2, '#3e3c4a'); R(c, 1416, 72, 500, 1, '#14141a');
      for (let x = 1440; x < 1916; x += 62) R(c, x, 72, 1, 100, '#1e1d26');
      for (let i = 0; i < 70; i++) R(c, 1416 + rnd() * 500, rnd() * 170, 2, 1, rnd() < 0.5 ? '#2c2b36' : '#1c1b24');   // wall grime
      R(c, 1416, 8, 500, 7, '#4a4a56'); R(c, 1416, 8, 500, 2, '#7a7a88'); R(c, 1416, 13, 500, 2, '#2e2e38');          // pipes
      for (let x = 1440; x < 1916; x += 118) { R(c, x, 5, 5, 13, '#3a3a46'); R(c, x, 5, 5, 2, '#6a6a78'); }
      R(c, 1416, 20, 500, 2, '#14141a'); R(c, 1416, 23, 500, 1, '#2a2a34');                                           // cable run
      // door
      R(c, 1440, 78, 54, 94, '#0e0e14'); R(c, 1444, 82, 46, 90, '#44445a'); R(c, 1444, 82, 46, 3, '#5a5a74');
      R(c, 1444, 126, 46, 2, '#34344a'); R(c, 1480, 128, 4, 8, '#d0a848');
      R(c, 1452, 92, 30, 16, '#d8d0b0'); T.draw(c, 'STAFF', 1467, 94, '#14141a', 1, 'center'); T.draw(c, 'ONLY', 1467, 101, '#b0241e', 1, 'center');
      R(c, 1462, 58, 10, 8, '#2a0a0a'); R(c, 1459, 66, 16, 3, '#3a3a46');                                            // warning lamp (lit live)
      // stacked flight cases
      flight(c, 1556, 148, 44, 24); flight(c, 1556, 124, 44, 24); flight(c, 1604, 148, 56, 24); flight(c, 1610, 124, 38, 24); flight(c, 1566, 100, 30, 24);
      R(c, 1580, 108, 2, 8, '#8a8a94'); R(c, 1576, 106, 10, 3, '#c0c0c8');                                           // pile of cables on top
      // tour poster, setlist, extinguisher
      poster(c, 1696, 84, 46, 62, '#14244a', '#ffb02e', '#fff0c8', ['WORLD', 'TOUR', '1984']);
      R(c, 1706, 90, 26, 12, '#14244a'); T.draw(c, 'NO', 1719, 92, '#ff2e88', 1, 'center'); T.draw(c, 'HOPE', 1719, 98, '#ff2e88', 1, 'center');
      R(c, 1748, 96, 40, 38, '#e8e0b0'); R(c, 1748, 96, 40, 1, '#c8c090');
      ['SET:', '1 LAST', '2 SONG', '3 ...', '4 ...'].forEach((s, i) => T.draw(c, s, 1752, 100 + i * 7, i ? '#4a3a2a' : '#b0241e'));
      R(c, 1676, 120, 9, 24, '#c0262e'); R(c, 1676, 120, 9, 3, '#e04048'); R(c, 1678, 116, 5, 4, '#14141a'); R(c, 1680, 112, 2, 6, '#14141a'); R(c, 1677, 130, 7, 6, '#f4f0e8');
      // dressing-room mirror with bulbs (lit live) over a counter
      R(c, 1792, 72, 96, 60, '#3a2a1c'); R(c, 1796, 76, 88, 52, '#3a4a5a'); R(c, 1796, 76, 88, 3, '#5a6a7a');
      for (let k = 0; k < 40; k += 2) R(c, 1806 + k, 126 - k, 2, 2, '#4a5c6e');
      R(c, 1786, 132, 108, 6, '#5a3a22'); R(c, 1786, 132, 108, 1, '#8a5a34'); R(c, 1790, 138, 100, 34, '#2a1a10');
      R(c, 1800, 124, 4, 8, '#e0348c'); R(c, 1810, 126, 6, 6, '#f0f0f0'); R(c, 1860, 122, 3, 10, '#d8d8e0');   // hair spray, powder, brush

      // ---------- Stage block (authored at x=916, drawn SOFF further right) ----------
      c.save();
      c.translate(SOFF, 0);
      const SW = 1400;
      const fold = ['#5c1222', '#4a0e1c', '#6a1628', '#521020'];
      for (let x = 916, i = 0; x < SW; x += 12, i++) { R(c, x, 0, 12, 140, fold[i % 4]); R(c, x, 0, 1, 140, '#3a0a16'); }
      R(c, 916, 0, SW - 916, 14, '#3a0a16');
      for (let x = 916; x < SW; x += 6) R(c, x, 14, 3, 3, '#d0a848');     // gold fringe
      R(c, 1038, 38, 224, 34, '#d0a848'); R(c, 1040, 40, 220, 30, '#120a14');
      T.draw(c, 'THE KING OF RIFFS', 1150, 44, '#ffe14a', 2, 'center');
      T.draw(c, 'ONE NIGHT ONLY - AGAIN', 1150, 60, '#ff9ad0', 1, 'center');

      R(c, 930, 136, SW - 944, 10, '#6e4628'); R(c, 930, 136, SW - 944, 1, '#9a6a3c'); // stage floor
      for (let x = 940; x < SW - 14; x += 26) R(c, x, 137, 1, 9, '#523218');
      R(c, 930, 146, SW - 944, 26, '#241610'); R(c, 930, 146, SW - 944, 1, '#8a6a3a');
      R(c, 916, 154, 14, 18, '#3a2416'); R(c, 916, 154, 14, 1, '#6e4628');           // step

      ampCab(c, 946, 108); ampCab(c, 946, 80); ampHead(c, 946, 70);                   // left stack
      ampCab(c, 990, 108); ampHead(c, 990, 98);
      ampCab(c, 1332, 108); ampCab(c, 1332, 80); ampHead(c, 1332, 70);                // right stack
      ampCab(c, 1288, 108); ampHead(c, 1288, 98);

      // drum kit
      const dx = 1160;
      R(c, dx - 32, 92, 1, 44, '#8a8a94'); R(c, dx - 40, 91, 17, 2, '#d8b040');       // crash
      R(c, dx + 30, 88, 1, 48, '#8a8a94'); R(c, dx + 22, 87, 18, 2, '#d8b040');       // ride
      R(c, dx - 44, 104, 12, 2, '#d8b040'); R(c, dx - 38, 106, 1, 30, '#8a8a94');     // hi-hat
      R(c, dx - 12, 98, 11, 9, '#b0202e'); R(c, dx - 12, 98, 11, 2, '#e8e0d0');       // rack toms
      R(c, dx + 2, 98, 11, 9, '#b0202e'); R(c, dx + 2, 98, 11, 2, '#e8e0d0');
      R(c, dx + 16, 114, 14, 22, '#b0202e'); R(c, dx + 16, 114, 14, 2, '#e8e0d0');    // floor tom
      R(c, dx - 28, 116, 13, 7, '#c8c8d0'); R(c, dx - 22, 123, 1, 13, '#8a8a94');     // snare
      R(c, dx - 10, 108, 20, 28, '#b0202e'); R(c, dx - 13, 111, 26, 22, '#b0202e');   // bass drum
      R(c, dx - 8, 110, 16, 24, '#e8e0d0'); R(c, dx - 11, 113, 22, 18, '#e8e0d0');
      T.draw(c, 'KR', dx, 120, '#6a1b9a', 1, 'center');

      R(c, 1080, 94, 1, 42, '#8a8a94'); R(c, 1075, 135, 11, 1, '#8a8a94'); R(c, 1078, 91, 5, 3, '#c8c8d0'); // mic
      for (const x of [1036, 1246]) { R(c, x, 129, 24, 7, '#16161c'); R(c, x + 3, 126, 18, 3, '#16161c'); R(c, x + 4, 130, 16, 4, '#2c2c34'); } // monitors
      R(c, 1230, 104, 1, 32, '#8a8a94'); R(c, 1227, 116, 7, 12, '#28a0d8'); R(c, 1229, 98, 3, 18, '#d9a14a'); // spare guitar
      R(c, SW - 14, 0, 14, WALL, '#0e0810');
      c.restore();

      // ---------- Mood: darken the top of the wall ----------
      for (let i = 0; i < 10; i++) R(c, 0, i * 6, W, 6, 'rgba(6,2,12,' + (0.5 - i * 0.05).toFixed(2) + ')');

      // ---------- Floor: wooden planks with fake perspective ----------
      // Rows get taller towards the camera, which is what sells the depth.
      const rows = [172, 179, 188, 199, 212, 228, 247, 270];
      for (let i = 0; i < rows.length - 1; i++) {
        const y = rows[i], h = rows[i + 1] - y;
        R(c, 0, y, W, h, i % 2 ? '#3d2619' : '#412a1c');
        R(c, 0, y, W, 1, '#24140e');
        for (let x = (rnd() * 60) | 0; x < W; x += 50 + ((rnd() * 70) | 0)) {
          R(c, x, y, 1, h, '#24140e');
          if (rnd() < 0.5) R(c, x + 2, y + 1, 18 + ((rnd() * 30) | 0), h - 1, 'rgba(255,220,160,0.035)');
        }
      }
      // Backstage hall: grey checker lino, tiles also grow towards the camera.
      const tw = [30, 34, 40, 48, 58, 70, 84];
      for (let i = 0; i < rows.length - 1; i++) {
        const y = rows[i], h = rows[i + 1] - y, w = tw[i];
        for (let x = 1416, k = 0; x < 1916; x += w, k++) {
          R(c, x, y, Math.min(w, 1916 - x), h, (i + k) % 2 ? '#2e2d38' : '#383744');
          R(c, x, y, 1, h, '#1a1a22');
        }
        R(c, 1416, y, 500, 1, '#1a1a22');
      }
      // Red rug under the pool table
      R(c, 1112, 184, 156, 40, '#3a0e1c'); R(c, 1116, 188, 148, 32, '#5a1a2c'); R(c, 1124, 194, 132, 20, '#4a1424');
      for (let x = 1120; x < 1262; x += 8) { R(c, x, 184, 2, 2, '#c8a040'); R(c, x, 222, 2, 2, '#c8a040'); }
      for (let i = 0; i < 130; i++) R(c, rnd() * W, 176 + rnd() * 92, 2, 1, rnd() < 0.5 ? '#5a4030' : '#2a180f'); // grit
      for (let i = 0; i < 14; i++) { const x = rnd() * W, y = 186 + rnd() * 70; R(c, x, y, 5, 3, '#c8c0a8'); R(c, x + 1, y + 1, 3, 1, '#8a8478'); } // flyers
      // Cables snaking across the hall floor
      for (const [cy, off] of [[200, 0], [232, 11]]) {
        for (let x = 1424; x < 1900; x += 2) R(c, x, cy + Math.round(Math.sin(x * 0.05 + off) * 3), 2, 2, '#0c0c10');
      }
      R(c, 0, 172, W, 3, 'rgba(0,0,0,0.5)'); R(c, 0, 175, W, 3, 'rgba(0,0,0,0.22)');
      // coloured light pools on the floor under the neon signs / stage
      const pool = (x, w, col) => { for (let i = 0; i < 4; i++) R(c, x + i * 10, 175 + i * 5, w - i * 20, 34 - i * 6, col); };
      pool(130, 190, 'rgba(255,46,136,0.05)'); pool(540, 150, 'rgba(40,220,255,0.04)'); pool(1100, 200, 'rgba(46,232,106,0.045)');
      pool(1440, 150, 'rgba(255,48,48,0.05)'); pool(1790, 120, 'rgba(255,220,150,0.05)'); pool(1960, 400, 'rgba(255,190,90,0.035)');
    },

    dynamic(ctx, t, hot) {
      const T = LS.Text;

      // Bartender: head and torso behind the counter, polishing a glass with the right arm
      const bx = 742 + Math.round(Math.sin(t * 0.6) * 4);
      bust(ctx, bx, 92, BARMAN, t, 0);
      const ang = t * 5, hx = bx + 8 + Math.round(Math.cos(ang) * 3), hy = 115 + Math.round(Math.sin(ang) * 2);
      seg(ctx, bx + 10, 105, bx + 12, 115, 4, '#ece4d4');          // sleeve
      seg(ctx, bx + 12, 115, hx, hy, 3, '#d8a47a');                // forearm
      R(ctx, hx - 2, hy - 6, 4, 7, '#b8d8e8'); R(ctx, hx - 1, hy - 6, 1, 6, '#ffffff');  // the glass
      R(ctx, hx - 3, hy - 1, 6, 3, '#f4f4f4');                     // towel

      // Customers on stools, nodding to the music
      for (let i = 0; i < PATRONS.length; i++) patron(ctx, PATRONS[i].x, t, i, PATRONS[i]);

      // Guests in the booth
      bust(ctx, 1056, 100, GUESTS[0], t, 3);
      bust(ctx, 1096, 100, GUESTS[1], t, 5);

      // The audience facing the stage
      for (let i = 0; i < FANS.length; i++) fan(ctx, FANS[i].x + SOFF, 176, FANS[i], t, hot, i);

      // Jukebox light tubes cycling colours
      const j = JUKE, n = (t * 3) | 0;
      R(ctx, j + 1, 114, 2, 52, LIGHTS[n % 5]); R(ctx, j + 35, 114, 2, 52, LIGHTS[(n + 2) % 5]);
      R(ctx, j + 8, 100, 22, 2, LIGHTS[(n + 1) % 5]); R(ctx, j + 4, 106, 30, 2, LIGHTS[(n + 3) % 5]);

      // Arcade cabinet: two tiny fighters trading blows on the screen
      const f = ((t * 4) | 0) % 2;
      R(ctx, 1371, 98, 20, 16, '#10183a');
      R(ctx, 1371, 111, 20, 3, '#2a3a6a');
      R(ctx, 1374, 103, 3, 3, '#ffd21f'); R(ctx, 1374, 106, 3, 5, '#e03030');
      R(ctx, 1385, 103, 3, 3, '#ffd21f'); R(ctx, 1385, 106, 3, 5, '#2e6ab0');
      R(ctx, 1377 + f * 2, 107, 3, 1, '#ffd21f'); R(ctx, 1382 - f * 2, 108, 3, 1, '#ffd21f');
      R(ctx, 1372, 99, 8, 1, '#2ee86a'); R(ctx, 1383, 99, 6, 1, '#e03030');

      // Backstage warning lamp blinking above the door, and the mirror bulbs
      if (((t * 1.5) | 0) % 2 === 0) {
        R(ctx, 1462, 58, 10, 8, '#ff3030'); R(ctx, 1464, 60, 4, 3, '#ffd0d0');
        ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.12;
        R(ctx, 1448, 46, 38, 36, '#ff3030');
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      for (let i = 0; i < 16; i++) {
        // bulbs along the top (0-5), the right side (6-10) and the left side (11-15) of the mirror
        const bxp = i < 6 ? 1798 + i * 15 : i < 11 ? 1884 : 1789;
        const byp = i < 6 ? 70 : 76 + ((i - 6) % 5) * 10;
        const on = Math.sin(t * 9 + i * 3) < 0.97;
        R(ctx, bxp, byp, 4, 4, on ? '#fff0b0' : '#6a5a30');
        if (on) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18; R(ctx, bxp - 2, byp - 2, 8, 8, '#ffd070'); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      }

      // Pool-table lamp cone
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.07; ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); ctx.moveTo(1136, 30); ctx.lineTo(1164, 30); ctx.lineTo(1250, 188); ctx.lineTo(1080, 188); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

      // Chasing bulbs along the stage edge
      for (let x = 940 + SOFF, i = 0; x < 1380 + SOFF; x += 16, i++) {
        const on = (i + ((t * (hot ? 10 : 4)) | 0)) % 3 === 0;
        R(ctx, x, 157, 3, 3, on ? '#ffe14a' : '#5a4418');
        if (on) R(ctx, x - 1, 158, 5, 1, 'rgba(255,225,74,0.5)');
      }

      // Neon signs. Flicker comes from two out-of-phase sines: they only add up to
      // almost 2 occasionally, which gives short, irregular blackouts.
      for (const sgn of signs) {
        const off = Math.sin(t * sgn.a) + Math.sin(t * sgn.b * 1.7) > 1.9;
        const w = T.width(sgn.text, sgn.scale), h = 5 * sgn.scale;
        if (off) { T.draw(ctx, sgn.text, sgn.x, sgn.y, '#3a2a40', sgn.scale); continue; }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.07; R(ctx, sgn.x - 8, sgn.y - 8, w + 16, h + 16, sgn.color);
        ctx.globalAlpha = 0.1; R(ctx, sgn.x - 4, sgn.y - 4, w + 8, h + 8, sgn.color);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
        T.draw(ctx, sgn.text, sgn.x - 1, sgn.y, sgn.color, sgn.scale); T.draw(ctx, sgn.text, sgn.x + 1, sgn.y, sgn.color, sgn.scale);
        T.draw(ctx, sgn.text, sgn.x, sgn.y - 1, sgn.color, sgn.scale); T.draw(ctx, sgn.text, sgn.x, sgn.y + 1, sgn.color, sgn.scale);
        T.draw(ctx, sgn.text, sgn.x, sgn.y, sgn.core, sgn.scale);
      }

      // Stage spotlights: additive light cones sweeping left and right
      ctx.globalCompositeOperation = 'lighter';
      const cones = [[1000, '#ff2e88'], [1160, '#ffe14a'], [1320, '#28dcff']];
      for (let i = 0; i < cones.length; i++) {
        const x0 = cones[i][0] + SOFF, sway = Math.sin(t * (hot ? 2.4 : 0.8) + i * 2.1) * (hot ? 110 : 60);
        ctx.globalAlpha = hot ? 0.2 : 0.11;
        ctx.fillStyle = cones[i][1];
        ctx.beginPath();
        ctx.moveTo(x0 - 3, 0); ctx.lineTo(x0 + 3, 0);
        ctx.lineTo(x0 + sway + 34, 176); ctx.lineTo(x0 + sway - 34, 176);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },

    /* Foreground furniture: it scrolls faster than the world (parallax factor 1.35),
       so it reads as being closer to the camera than the fighters. */
    foreground(ctx, camX) {
      for (let k = 0; k < 8; k++) {
        const x = Math.round(300 + k * 500 - camX * 1.35);
        if (x < -70 || x > LS.W + 70) continue;
        if (k % 2 === 0) { // table with a bottle, a glass and a chair back
          R(ctx, x - 30, 256, 60, 14, '#120a12'); R(ctx, x - 34, 253, 68, 4, '#1c1018'); R(ctx, x - 34, 253, 68, 1, '#4a2a40');
          R(ctx, x - 12, 241, 4, 12, '#0e2a1c'); R(ctx, x - 11, 237, 2, 4, '#0e2a1c'); R(ctx, x - 12, 243, 1, 5, '#3a8a5a');
          R(ctx, x + 8, 246, 5, 7, '#2a2434'); R(ctx, x + 8, 246, 1, 7, '#6a6480');
          R(ctx, x - 56, 244, 12, 26, '#120a12'); R(ctx, x - 56, 244, 12, 1, '#3a2034');
        } else { // stacked beer crates seen from the front
          R(ctx, x - 24, 252, 48, 18, '#120a12'); R(ctx, x - 24, 252, 48, 1, '#4a2a40');
          for (let b = 0; b < 4; b++) { R(ctx, x - 20 + b * 11, 246, 4, 6, '#0e2a1c'); R(ctx, x - 19 + b * 11, 243, 2, 3, '#0e2a1c'); }
          R(ctx, x - 22, 262, 44, 1, '#2a1a24');
        }
      }
    },

    prop(ctx, p) {
      const x = Math.round(p.x), y = Math.round(p.y);
      if (p.type === 'table') {
        R(ctx, x - 16, y - 1, 32, 4, 'rgba(0,0,0,0.35)');
        R(ctx, x - 8, y - 3, 16, 4, '#2a1a12'); R(ctx, x - 2, y - 20, 4, 18, '#3a2416');
        R(ctx, x - 16, y - 26, 32, 7, '#7a4a26'); R(ctx, x - 19, y - 24, 38, 4, '#7a4a26');
        R(ctx, x - 16, y - 26, 32, 1, '#a8703c'); R(ctx, x - 19, y - 20, 38, 1, '#3a2010');
        bottle(ctx, x - 9, y - 25, 12, '#c8862a'); bottle(ctx, x + 2, y - 24, 10, '#3fae5a');
        R(ctx, x + 9, y - 30, 4, 5, '#b8d8e8');
      } else if (p.type === 'pool') {
        R(ctx, x - 42, y - 1, 84, 4, 'rgba(0,0,0,0.35)');
        R(ctx, x - 36, y - 15, 5, 15, '#2a1408'); R(ctx, x + 31, y - 15, 5, 15, '#2a1408');   // legs
        R(ctx, x - 40, y - 24, 80, 9, '#5a3018'); R(ctx, x - 40, y - 24, 80, 1, '#8a5a34'); R(ctx, x - 40, y - 16, 80, 1, '#2a1408');
        R(ctx, x - 40, y - 34, 80, 11, '#7a4a24');                                              // wooden rail
        R(ctx, x - 37, y - 32, 74, 8, '#1f8a4a'); R(ctx, x - 37, y - 32, 74, 2, '#2fb060'); R(ctx, x - 37, y - 25, 74, 1, '#176a38'); // felt
        for (const [px, py] of [[-37, -32], [35, -32], [-37, -26], [35, -26]]) R(ctx, x + px, y + py, 3, 3, '#050508');                // pockets
        const balls = [['#f0f0f0', -20, -29], ['#ffd21f', 8, -28], ['#c0262e', 12, -30], ['#2e6ab0', 16, -28], ['#14141a', 14, -29], ['#e87a1e', 18, -30]];
        for (const [col, bx, by] of balls) { R(ctx, x + bx, y + by, 3, 3, '#050508'); R(ctx, x + bx, y + by, 2, 2, col); }
        seg(ctx, x - 6, y - 36, x - 26, y - 26, 1, '#d8b070');                                  // cue resting on the rail
      } else if (p.type === 'stack') {
        R(ctx, x - 22, y - 1, 44, 4, 'rgba(0,0,0,0.35)');
        flight(ctx, x - 20, y - 24, 40, 24); flight(ctx, x - 16, y - 46, 32, 22);
        LS.Text.draw(ctx, 'K.O.R', x, y - 13, '#d8d0b0', 1, 'center');
      } else { // road case
        R(ctx, x - 20, y - 1, 40, 4, 'rgba(0,0,0,0.35)');
        R(ctx, x - 18, y - 24, 36, 24, '#17171c'); R(ctx, x - 18, y - 24, 36, 2, '#9a9aa4'); R(ctx, x - 18, y - 2, 36, 2, '#6a6a74');
        R(ctx, x - 18, y - 24, 2, 24, '#9a9aa4'); R(ctx, x + 16, y - 24, 2, 24, '#6a6a74');
        R(ctx, x - 3, y - 15, 6, 4, '#c8c8d0');
        LS.Text.draw(ctx, 'K.O.R', x, y - 9, '#d8d0b0', 1, 'center');
      }
    },
  };

  LS.Scenes = { lastBar };

  // =====================================================================
  // Renderer-facing API
  // =====================================================================
  const B = (LS.Background = {});
  let canvas = null, scene = null;

  B.build = function (era) {
    scene = LS.Scenes[era.background];
    canvas = LS.makeCanvas(era.width, LS.H);
    scene.build(canvas.getContext('2d'), era);
  };

  /* Blits the visible slice of the pre-rendered art, then the animated layer on top. */
  B.draw = function (ctx, camX, t, hot) {
    ctx.drawImage(canvas, camX, 0, LS.W, LS.H, 0, 0, LS.W, LS.H);
    ctx.save();
    ctx.translate(-camX, 0);
    scene.dynamic(ctx, t, hot);
    ctx.restore();
  };

  B.drawForeground = function (ctx, camX, t) { scene.foreground(ctx, camX, t); };
  B.drawProp = function (ctx, p) { scene.prop(ctx, p); };
})();
