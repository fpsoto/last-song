/* hud.js - bitmap font + arcade HUD (life bars, decade, stage name, boss bar, GO arrow).
   The font is defined in code so the game needs no font files and stays pixel-perfect. */
(function () {
  'use strict';
  const LS = window.LS;

  // ---------------------------------------------------------------------
  // 5x5 pixel font. Each glyph is 5 rows separated by '/', '#' = pixel on.
  // ---------------------------------------------------------------------
  const GLYPHS = {
    A: '.###./#...#/#####/#...#/#...#', B: '####./#...#/####./#...#/####.', C: '.####/#..../#..../#..../.####',
    D: '####./#...#/#...#/#...#/####.', E: '#####/#..../####./#..../#####', F: '#####/#..../####./#..../#....',
    G: '.####/#..../#..##/#...#/.####', H: '#...#/#...#/#####/#...#/#...#', I: '#####/..#../..#../..#../#####',
    J: '..###/...#./...#./#..#./.##..', K: '#...#/#..#./###../#..#./#...#', L: '#..../#..../#..../#..../#####',
    M: '#...#/##.##/#.#.#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#', O: '.###./#...#/#...#/#...#/.###.',
    P: '####./#...#/####./#..../#....', Q: '.###./#...#/#.#.#/#..#./.##.#', R: '####./#...#/####./#..#./#...#',
    S: '.####/#..../.###./....#/####.', T: '#####/..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/.###.',
    V: '#...#/#...#/#...#/.#.#./..#..', W: '#...#/#...#/#.#.#/##.##/#...#', X: '#...#/.#.#./..#../.#.#./#...#',
    Y: '#...#/.#.#./..#../..#../..#..', Z: '#####/...#./..#../.#.../#####',
    0: '.###./#..##/#.#.#/##..#/.###.', 1: '..#../.##../..#../..#../.###.', 2: '####./....#/.###./#..../#####',
    3: '####./....#/.###./....#/####.', 4: '#..#./#..#./#####/...#./...#.', 5: '#####/#..../####./....#/####.',
    6: '.###./#..../####./#...#/.###.', 7: '#####/....#/...#./..#../..#..', 8: '.###./#...#/.###./#...#/.###.',
    9: '.###./#...#/.####/....#/.###.',
    '.': '...../...../...../...../..#..', ',': '...../...../...../..#../.#...', '!': '..#../..#../..#../...../..#..',
    '?': '####./....#/..##./...../..#..', "'": '..#../..#../...../...../.....', '-': '...../...../.###./...../.....',
    ':': '...../..#../...../..#../.....', '/': '....#/...#./..#../.#.../#....', '>': '.#.../..#../...#./..#../.#...',
    '<': '...#./..#../.#.../..#../...#.', '+': '...../..#../.###./..#../.....', '"': '.#.#./.#.#./...../...../.....',
    '(': '...#./..#../..#../..#../...#.', ')': '.#.../..#../..#../..#../.#...', '%': '#...#/...#./..#../.#.../#...#',
    '=': '...../.###./...../.###./.....',
    '&':'.##../#..../.##.#/#..#./.##.#', '*': '#.#.#/.###./#####/.###./#.#.#',
  };

  // Pre-compute horizontal pixel runs per glyph so drawing needs few fillRect calls.
  const RUNS = {};
  for (const ch in GLYPHS) {
    const runs = [];
    GLYPHS[ch].split('/').forEach((row, y) => {
      let x = 0;
      while (x < 5) {
        if (row[x] === '#') { let n = 1; while (row[x + n] === '#') n++; runs.push([x, y, n]); x += n; }
        else x++;
      }
    });
    RUNS[ch] = runs;
  }

  const T = (LS.Text = {});
  T.width = (str, scale) => str.length * 6 * (scale || 1) - (scale || 1);

  T.draw = function (ctx, str, x, y, color, scale, align) {
    scale = scale || 1;
    str = String(str).toUpperCase();
    if (align === 'center') x -= T.width(str, scale) / 2;
    else if (align === 'right') x -= T.width(str, scale);
    x = Math.round(x); y = Math.round(y);
    ctx.fillStyle = color;
    for (let i = 0; i < str.length; i++) {
      const runs = RUNS[str[i]];
      if (runs) {
        const gx = x + i * 6 * scale;
        for (const r of runs) ctx.fillRect(gx + r[0] * scale, y + r[1] * scale, r[2] * scale, scale);
      }
    }
  };

  /* Text with a hard drop shadow, the default arcade look. */
  T.shadow = function (ctx, str, x, y, color, scale, align, shadowColor) {
    scale = scale || 1;
    T.draw(ctx, str, x + scale, y + scale, shadowColor || '#12081c', scale, align);
    T.draw(ctx, str, x, y, color, scale, align);
  };

  /* Word-wrap to a maximum number of characters per line. */
  T.wrap = function (str, max) {
    const lines = [];
    let line = '';
    for (const w of str.split(' ')) {
      if (line && (line + ' ' + w).length > max) { lines.push(line); line = w; }
      else line = line ? line + ' ' + w : w;
    }
    if (line) lines.push(line);
    return lines;
  };

  // ---------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------
  const H = (LS.HUD = {});
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  /* Life bar with a white "lag" segment that drains after the real value drops. */
  H.bar = function (ctx, x, y, w, h, frac, lag, color, hi) {
    R(ctx, x - 1, y - 1, w + 2, h + 2, '#f4f0e8');
    R(ctx, x, y, w, h, '#3a0a16');
    R(ctx, x, y, Math.round(w * LS.clamp(lag, 0, 1)), h, '#ffffff');
    const fw = Math.round(w * LS.clamp(frac, 0, 1));
    R(ctx, x, y, fw, h, color);
    R(ctx, x, y, fw, 2, hi);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 10; i < w; i += 10) ctx.fillRect(x + i, y, 1, h);
  };

  function portrait(ctx, x, y, kind, border) {
    R(ctx, x, y, 22, 22, border);
    R(ctx, x + 1, y + 1, 20, 20, '#2a1636');
    ctx.save();
    ctx.beginPath(); ctx.rect(x + 1, y + 1, 20, 20); ctx.clip(); // big hair stays inside the frame
    LS.Sprites.head(ctx, kind, x + 10, y + 12);
    ctx.restore();
  }

  H.draw = function (ctx, g) {
    const p = g.player, era = g.era, blink = ((g.t * 4) | 0) % 2 === 0;

    // Top band
    R(ctx, 0, 0, LS.W, 31, 'rgba(10,5,18,0.82)');
    R(ctx, 0, 31, LS.W, 1, '#ff2e88');
    R(ctx, 0, 32, LS.W, 1, 'rgba(40,220,255,0.5)');

    // Player
    portrait(ctx, 4, 4, 'jack', '#ffe14a');
    T.shadow(ctx, p.name, 30, 3, '#ffe14a');
    const low = p.hp / p.maxHp < 0.3;
    H.bar(ctx, 30, 10, 120, 6, p.hp / p.maxHp, p.lagHp / p.maxHp,
      low && blink ? '#ff3b30' : '#ffd21f', low && blink ? '#ff8a80' : '#fff3a0');
    // Solo meter: fills with every KO and pickup; flashes when it can be used (key L)
    const ready = p.power >= p.powerMax, pf = p.power / p.powerMax;
    H.bar(ctx, 30, 19, 90, 4, pf, pf, ready && blink ? '#ffffff' : '#28dcff', ready && blink ? '#ffe14a' : '#b8f4ff');
    T.draw(ctx, ready ? 'SOLO READY' : 'SOLO', 125, 18, ready && blink ? '#ffe14a' : '#28dcff');
    T.draw(ctx, 'SCORE ' + String(g.score).padStart(6, '0'), 30, 25, '#cfc6e6');

    // Decade + stage name
    T.shadow(ctx, era.year, 240, 3, '#ff2e88', 2, 'center', '#3a0a3a');
    T.draw(ctx, era.title, 240, 17, '#28dcff', 1, 'center');
    T.draw(ctx, 'STAGE 1', 240, 24, '#7d6f9c', 1, 'center');

    // Last enemy hit (name + life bar), classic beat 'em up style
    const e = g.target;
    if (e && g.targetT > 0 && !e.isBoss) { // the boss has its own bar at the bottom
      portrait(ctx, 454, 4, e.kind, '#ff5a3c');
      T.shadow(ctx, e.name, 450, 4, '#ff9a7a', 1, 'right');
      H.bar(ctx, 330, 12, 120, 7, e.hp / e.maxHp, e.lagHp / e.maxHp, '#ff5a3c', '#ffb09a');
    } else {
      T.draw(ctx, 'HI-SCORE 084000', 476, 4, '#7d6f9c', 1, 'right');
      if (blink) T.draw(ctx, 'ROCK OR BUST', 476, 13, '#4a3d66', 1, 'right');
    }

    // Boss bar
    const b = g.boss;
    if (b && (g.phase === 'boss' || g.phase === 'bossDead')) {
      R(ctx, 78, 246, 324, 22, 'rgba(10,5,18,0.78)');
      T.shadow(ctx, b.name, 240, 248, '#ffe14a', 1, 'center');
      H.bar(ctx, 90, 257, 300, 7, b.hp / b.maxHp, b.lagHp / b.maxHp,
        b.hp / b.maxHp < 0.5 ? '#ff2e88' : '#b04dff', '#ffc0f0');
    }

    // "GO" prompt while the way forward is open
    if (g.phase === 'advance' && g.cardT > 3 && blink && p.hp > 0) {
      T.shadow(ctx, 'GO', 428, 92, '#ffe14a', 3, 'left', '#b0241e');
      ctx.fillStyle = '#ffe14a';
      for (let i = 0; i < 7; i++) ctx.fillRect(432 + i * 3, 112 + i * 2, 3, 26 - i * 4); // arrow head
      ctx.fillRect(418, 120, 16, 10);
    }

    // Stage intro card
    if (g.cardT < 2.8) {
      const k = Math.min(1, g.cardT / 0.25), out = g.cardT > 2.4 ? (g.cardT - 2.4) / 0.4 : 0;
      const off = Math.round((1 - k) * 300 + out * 500);
      R(ctx, 0, 96, LS.W, 64, 'rgba(10,5,18,0.8)');
      R(ctx, 0, 96, LS.W, 1, '#ff2e88'); R(ctx, 0, 159, LS.W, 1, '#28dcff');
      T.shadow(ctx, era.year, 240 - off, 104, '#ffe14a', 5, 'center', '#b0241e');
      T.shadow(ctx, era.title, 240 + off, 138, '#28dcff', 2, 'center', '#0a2a40');
    }

    // Boss warning
    if (g.phase === 'bossIntro') {
      const on = ((g.t * 6) | 0) % 2 === 0;
      for (const y of [40, 222]) {
        R(ctx, 0, y, LS.W, 14, on ? '#ff2e2e' : '#3a0a0a');
        for (let x = -((g.t * 60) | 0) % 48; x < LS.W; x += 48)
          T.draw(ctx, 'WARNING', x, y + 4, on ? '#1a0606' : '#ff2e2e');
      }
      if (g.phaseT > 1.4) {
        R(ctx, 0, 60, LS.W, 34, 'rgba(10,5,18,0.82)');
        T.shadow(ctx, era.boss.name, 240, 64, '#ffe14a', 3, 'center', '#b0241e');
        T.draw(ctx, era.boss.tagline, 240, 84, '#ff9ad0', 1, 'center');
      }
    }
  };
})();
