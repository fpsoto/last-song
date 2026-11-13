/* renderer.js - draws one frame from the game state. It never changes game state. */
(function () {
  'use strict';
  const LS = window.LS;
  const R = (LS.Renderer = {});
  const rect = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  // ---------------------------------------------------------------------
  // World
  // ---------------------------------------------------------------------
  function drawShockwave(ctx, pr, t) {
    const x = Math.round(pr.x), y = Math.round(pr.y), dir = pr.vx > 0 ? 1 : -1;
    const cols = ['#ffffff', '#ffe14a', '#ff2e88'];
    rect(ctx, x - 10, y - 1, 20, 3, 'rgba(255,225,74,0.55)');
    for (let i = 0; i < 3; i++) {
      // three nested ")" arcs, flickering between colours
      const h = 36 - i * 9, ax = x - dir * i * 7, c = cols[(i + ((t * 20) | 0)) % 3];
      rect(ctx, ax, y - h + 4, 3, h - 8, c);
      rect(ctx, ax - dir * 3, y - h, 3, 6, c);
      rect(ctx, ax - dir * 3, y - 5, 3, 5, c);
    }
  }

  /* Electric glow + lightning bolts crackling around Jack while he charges the solo. */
  function drawAura(ctx, f, t) {
    const k = Math.min(1, f.stateT / 0.5), cx = Math.round(f.x), base = Math.round(f.y - f.z);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 + 0.18 * k;
    rect(ctx, cx - 14, base - 54, 28, 54, '#28dcff');
    rect(ctx, cx - 9, base - 50, 18, 46, '#9ae8ff');
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    for (let b = 0; b < 3; b++) { // three jagged bolts, redrawn at random every frame
      let x = cx + (b - 1) * 11, y = base;
      ctx.fillStyle = b === 1 ? '#ffffff' : '#9ae8ff';
      for (let s = 0; s < 6; s++) {
        const nx = x + ((Math.random() * 7) | 0) - 3, ny = y - 8 - ((Math.random() * 4) | 0);
        ctx.fillRect(Math.min(x, nx), ny, Math.abs(nx - x) + 1, y - ny);
        x = nx; y = ny;
      }
    }
  }

  function drawBubble(ctx, g) {
    const bub = g.bubble, p = g.player, T = LS.Text;
    if (!bub || bub.delay > 0) return;
    const lines = T.wrap(bub.text, 22);
    const w = Math.max.apply(null, lines.map((l) => l.length)) * 6 + 7, h = lines.length * 7 + 6;
    const cam = Math.round(LS.Camera.x);
    const x = LS.clamp(Math.round(p.x - w / 2), cam + 4, cam + LS.W - w - 4);
    const y = Math.round(p.y - p.z) - 64 - h;
    rect(ctx, x - 1, y - 1, w + 2, h + 2, '#12081c');
    rect(ctx, x, y, w, h, '#f4f0e8');
    rect(ctx, Math.round(p.x) - 2, y + h, 5, 3, '#12081c');
    rect(ctx, Math.round(p.x) - 1, y + h, 3, 2, '#f4f0e8');
    lines.forEach((l, i) => T.draw(ctx, l, x + 4, y + 4 + i * 7, '#12081c'));
  }

  function drawWorld(g, ctx) {
    const cam = LS.Camera, cx = Math.round(cam.x), S = LS.Sprites;
    const hot = g.phase === 'boss' || g.phase === 'bossIntro';

    ctx.save();
    ctx.translate(Math.round(cam.sx), Math.round(cam.sy)); // screen shake
    LS.Background.draw(ctx, cx, g.t, hot);

    ctx.save();
    ctx.translate(-cx, 0); // from here on we draw in world coordinates

    const fighters = g.enemies.concat(g.player);
    if (g.boss) fighters.push(g.boss);
    for (const f of fighters) S.shadow(ctx, f.x, f.y, f.z, f.isBoss ? 15 : 12);

    // Painter's algorithm: whoever is further down the floor (bigger y) is drawn later,
    // so it correctly overlaps things behind it. Scenery and pickups are sorted in too.
    const list = fighters.map((f) => ({ y: f.y, f }))
      .concat(g.props.map((p) => ({ y: p.y, p })))
      .concat(g.breakables.map((b) => ({ y: b.y, b })))
      .concat(g.items.map((i) => ({ y: i.y + 1, i })));
    list.sort((a, b) => a.y - b.y);
    for (const it of list) {
      if (it.p) { LS.Background.drawProp(ctx, it.p); continue; }
      if (it.b) { LS.Props.draw(ctx, it.b); continue; }
      if (it.i) { LS.Props.drawItem(ctx, it.i); continue; }
      const f = it.f, blinkOff = ((g.t * 14) | 0) % 2 === 0;
      if (f.state === 'dead' && f.team === 'enemy' && !f.isBoss && f.stateT > 0.4 && blinkOff) continue;
      if (f.invuln > 0 && blinkOff && f.state !== 'special') continue; // get-up blink (not during the solo)
      if (f.state === 'special' && f.stateT < 0.5) drawAura(ctx, f, g.t);
      const zone = g.era.lights.find((l) => f.x < l.to);
      S.draw(ctx, f, f.x, f.y - f.z, zone && zone.color);
      // mini life bar over regular enemies that were hit recently
      if (f.team === 'enemy' && !f.isBoss && f.barT > 0 && f.hp > 0) {
        const bx = Math.round(f.x) - 9, by = Math.round(f.y - f.z) - 62;
        rect(ctx, bx - 1, by - 1, 20, 4, '#12081c');
        rect(ctx, bx, by, Math.round(18 * f.hp / f.maxHp), 2, '#ff5a3c');
      }
    }

    for (const pr of g.projectiles) drawShockwave(ctx, pr, g.t);
    LS.Effects.draw(ctx);
    drawBubble(ctx, g);

    if (LS.DEBUG) drawDebug(g, ctx, fighters);
    ctx.restore();

    LS.Background.drawForeground(ctx, cx, g.t);
    ctx.restore();

    if (LS.Effects.flashA > 0) {
      ctx.globalAlpha = Math.min(1, LS.Effects.flashA);
      rect(ctx, 0, 0, LS.W, LS.H, LS.Effects.flashColor);
      ctx.globalAlpha = 1;
    }
  }

  /* ?debug=1 : body boxes (green), active attack ranges (red), prop footprints (blue). */
  function drawDebug(g, ctx, fighters) {
    ctx.lineWidth = 1;
    for (const f of fighters) {
      ctx.strokeStyle = '#2ee86a';
      ctx.strokeRect(Math.round(f.x - f.halfW) + 0.5, Math.round(f.y - f.z - f.height) + 0.5, f.halfW * 2, f.height);
      const a = f.atk;
      if (a && f.state === 'attack' && f.stateT >= a.def.active[0] && f.stateT <= a.def.active[1]) {
        const x0 = f.x + f.facing * a.def.range[0], x1 = f.x + f.facing * a.def.range[1];
        ctx.strokeStyle = '#ff3030';
        ctx.strokeRect(Math.round(Math.min(x0, x1)) + 0.5, Math.round(f.y - a.def.lane) + 0.5, Math.abs(x1 - x0), a.def.lane * 2);
      }
    }
    ctx.strokeStyle = '#28dcff';
    for (const p of g.props) ctx.strokeRect(p.x - p.rx + 0.5, p.y - p.ry + 0.5, p.rx * 2, p.ry * 2);
    LS.Text.draw(ctx, g.phase + ' W' + g.waveIndex + ' X' + (g.player.x | 0), LS.Camera.x + 4, 40, '#2ee86a');
  }

  // ---------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------
  const dummy = { kind: 'jack', state: 'idle', stateT: 0, animT: 0, moving: false, facing: 1, flash: 0 };

  function bigSprite(ctx, kind, x, y, scale, t, facing) {
    dummy.kind = kind; dummy.animT = t; dummy.facing = facing; dummy.state = 'idle';
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    LS.Sprites.draw(ctx, dummy, 0, 0);
    ctx.restore();
  }

  /* The bar itself, slowly panning and darkened, is the backdrop of the menus. */
  function backdrop(g, ctx, dark) {
    const span = g.era.width - LS.W;
    const camX = Math.round((0.5 - 0.5 * Math.cos(g.t * 0.07)) * span);
    LS.Background.draw(ctx, camX, g.t, false);
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(8,3,16,' + dark + ')');
  }

  function logo(ctx, g, y) {
    const T = LS.Text, s = 6, str = 'LAST SONG';
    const flick = Math.sin(g.t * 3.1) + Math.sin(g.t * 12.3) > 1.9;
    T.draw(ctx, str, 244, y + 4, '#2a0a3a', s, 'center');
    T.draw(ctx, str, 242, y + 2, '#ff2e88', s, 'center');
    T.draw(ctx, str, 240, y, flick ? '#c8a020' : '#ffe14a', s, 'center');
    // lighter top half = cheap chrome shine
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y, LS.W, 12); ctx.clip();
    T.draw(ctx, str, 240, y, flick ? '#e8d070' : '#fff6c0', s, 'center');
    ctx.restore();
  }

  function drawTitle(g, ctx) {
    const T = LS.Text, blink = ((g.t * 2.5) | 0) % 2 === 0;
    backdrop(g, ctx, 0.66);
    rect(ctx, 0, 36, LS.W, 1, '#ff2e88'); rect(ctx, 0, 112, LS.W, 1, '#28dcff');
    rect(ctx, 0, 37, LS.W, 75, 'rgba(8,3,16,0.55)');
    logo(ctx, g, 50);
    T.shadow(ctx, 'A ROCKSTAR NEVER DIES. HE JUST GETS OLDER.', 240, 96, '#28dcff', 1, 'center');

    bigSprite(ctx, 'jack', 76, 258, 2, g.t, 1);
    bigSprite(ctx, 'king', 412, 258, 2, g.t + 1, -1);

    ['START GAME', 'CONTROLS'].forEach((label, i) => {
      const sel = g.menu === i, y = 150 + i * 22;
      T.shadow(ctx, label, 240, y, sel ? '#ffe14a' : '#7d6f9c', 2, 'center');
      if (sel && blink) T.shadow(ctx, '>', 240 - T.width(label, 2) / 2 - 18, y, '#ff2e88', 2);
    });
    if (blink) T.shadow(ctx, 'PRESS ENTER', 240, 206, '#f4f0e8', 1, 'center');
    T.draw(ctx, 'VERTICAL SLICE - 1 STAGE', 240, 240, '#7d6f9c', 1, 'center');
    T.draw(ctx, 'ROCK BOTTOM ARCADE SYSTEM   CREDIT 01', 240, 254, '#4a3d66', 1, 'center');
  }

  function drawControls(g, ctx) {
    const T = LS.Text;
    backdrop(g, ctx, 0.8);
    T.shadow(ctx, 'CONTROLS', 240, 26, '#ffe14a', 3, 'center', '#b0241e');
    const rows = [
      ['MOVE', 'W A S D  /  ARROWS'], ['PUNCH', 'J'], ['KICK', 'K'], ['JUMP', 'SPACE'],
      ['SOLO', 'L (WHEN CHARGED)'], ['START', 'ENTER'], ['PAUSE', 'ESC'], ['SOUND', 'M'],
    ];
    rows.forEach((r, i) => {
      const y = 56 + i * 14;
      T.shadow(ctx, r[0], 150, y, '#28dcff', 1, 'right');
      T.draw(ctx, '.......', 160, y, '#4a3d66');
      T.shadow(ctx, r[1], 212, y, '#f4f0e8');
    });
    T.draw(ctx, 'PUNCH X3 = COMBO.  JUMP + PUNCH/KICK = FLYING KICK', 240, 172, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'KOS CHARGE THE SOLO. SMASH CRATES FOR FOOD AND POWER', 240, 184, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'JUMP OR SIDESTEP (W / S) TO DODGE SHOCKWAVES', 240, 196, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'TOUCH: STICK ON THE LEFT, BUTTONS ON THE RIGHT', 240, 210, '#7d6f9c', 1, 'center');
    if (((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER TO GO BACK', 240, 232, '#ffe14a', 1, 'center');
  }

  function drawIntro(g, ctx) {
    const T = LS.Text;
    backdrop(g, ctx, 0.86);
    rect(ctx, 0, 0, LS.W, 34, '#000'); rect(ctx, 0, LS.H - 34, LS.W, 34, '#000'); // letterbox
    const text = g.era.intro[g.introIndex];
    const shown = text.slice(0, Math.floor(g.introT * 42)); // typewriter
    T.wrap(text, 52).reduce((used, line, i) => {
      const part = shown.slice(used, used + line.length);
      T.shadow(ctx, part, 240 - T.width(line, 1) / 2, 96 + i * 14, '#f4f0e8');
      return used + line.length + 1;
    }, 0);
    T.draw(ctx, (g.introIndex + 1) + ' / ' + g.era.intro.length, 240, 60, '#ff2e88', 1, 'center');
    if (((g.t * 2.5) | 0) % 2 === 0) T.draw(ctx, 'ENTER >', 470, 250, '#ffe14a', 1, 'right');
  }

  function drawPause(g, ctx) {
    const T = LS.Text;
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(8,3,16,0.72)');
    T.shadow(ctx, 'PAUSED', 240, 96, '#ffe14a', 5, 'center', '#b0241e');
    T.shadow(ctx, 'ESC TO RESUME', 240, 140, '#f4f0e8', 1, 'center');
    T.draw(ctx, 'J PUNCH   K KICK   M SOUND', 240, 156, '#7d6f9c', 1, 'center');
  }

  function drawGameOver(g, ctx) {
    const T = LS.Text, k = Math.min(1, g.stateT / 0.8);
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(40,2,8,' + (0.72 * k).toFixed(2) + ')');
    T.shadow(ctx, 'GAME OVER', 240, 84, '#ff3b30', 5, 'center', '#3a0508');
    T.shadow(ctx, 'THE SHOW\'S OVER. NOBODY NOTICED.', 240, 126, '#f4f0e8', 1, 'center');
    T.draw(ctx, 'SCORE ' + String(g.score).padStart(6, '0'), 240, 146, '#ffe14a', 1, 'center');
    if (g.stateT > 1 && ((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER TO TRY AGAIN', 240, 176, '#ffe14a', 1, 'center');
    T.draw(ctx, 'ESC - TITLE', 240, 192, '#7d6f9c', 1, 'center');
  }

  function drawVictory(g, ctx) {
    const T = LS.Text, k = Math.min(1, g.stateT / 0.8);
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(8,3,16,' + (0.78 * k).toFixed(2) + ')');
    // confetti: deterministic per index, so no particle state is needed
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + Math.sin(g.t * 1.3 + i) * 12) % LS.W;
      const y = (g.stateT * (30 + (i % 7) * 9) + i * 53) % LS.H;
      rect(ctx, x, y, 2, 3, ['#ff2e88', '#ffe14a', '#28dcff', '#2ee86a'][i % 4]);
    }
    T.shadow(ctx, 'STAGE CLEAR', 240, 38, '#28dcff', 3, 'center', '#0a2a40');
    T.shadow(ctx, 'YOU ROCK... BUT YOU\'RE STILL BROKE.', 240, 68, '#ffe14a', 2, 'center', '#b0241e');
    bigSprite(ctx, 'jack', 240, 202, 2, g.t, 1);
    T.draw(ctx, 'SCORE ' + String(g.score).padStart(6, '0'), 240, 212, '#f4f0e8', 1, 'center');
    T.draw(ctx, 'NEXT ERA: THE 1970S - COMING SOON', 240, 224, '#ff9ad0', 1, 'center');
    if (g.stateT > 1.5 && ((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER', 240, 240, '#ffe14a', 1, 'center');
  }

  R.draw = function (g, ctx) {
    ctx.imageSmoothingEnabled = false;
    switch (g.state) {
      case 'title': drawTitle(g, ctx); break;
      case 'controls': drawControls(g, ctx); break;
      case 'intro': drawIntro(g, ctx); break;
      default:
        drawWorld(g, ctx);
        LS.HUD.draw(ctx, g);
        if (g.state === 'paused') drawPause(g, ctx);
        else if (g.state === 'gameover') drawGameOver(g, ctx);
        else if (g.state === 'victory') drawVictory(g, ctx);
    }
  };
})();
