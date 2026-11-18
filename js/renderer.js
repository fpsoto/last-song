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

  /* Generic cue for a segment's exit, drawn on the floor in world space. A single option is a
     glowing line to walk through. A fork is one doorway per option, each laid on the depth band that
     selects it: a lit threshold on the floor with a neon sign over it. The doorway Jack stands in
     front of lights up with a prompt (ENTER or tap confirms, see game.js). Scenes are expected to
     draw their own doors, streets and passages on top of (or instead of) this stand-in. */
  const DOOR_COLORS = ['#ff2e88', '#ffe14a', '#28dcff', '#7dff6a'];
  function drawExit(ctx, g) {
    const ex = g.era.exit;
    if (!ex || g.phase !== 'advance' || g.waveIndex < g.era.waves.length) return;
    const blink = ((g.t * 3) | 0) % 2 === 0, T = LS.Text, pulse = 0.5 + 0.5 * Math.sin(g.t * 6);
    if (ex.options.length === 1) {
      for (let y = LS.FLOOR_TOP; y < LS.FLOOR_BOTTOM; y += 4) rect(ctx, ex.at, y, 2, 2, blink ? '#ffe14a' : '#ff2e88');
      const o = ex.options[0];
      T.shadow(ctx, (o.label || 'GO') + ' >', ex.at - 8, Math.round((LS.FLOOR_TOP + LS.FLOOR_BOTTOM) / 2) - 3, blink ? '#ffe14a' : '#28dcff', 1, 'right');
      return;
    }
    const x0 = ex.at - 46, w = 50, camX = Math.round(LS.Camera.x);
    ex.options.forEach((o, i) => {
      const col = o.color || DOOR_COLORS[i % DOOR_COLORS.length], on = g.exitPick === o;
      const y0 = o.y[0], h = o.y[1] - o.y[0], mid = Math.round(y0 + h / 2);
      // the threshold: a dark doorway slab with a glowing frame, brighter when it is the chosen one
      ctx.globalAlpha = on ? 0.55 + 0.25 * pulse : 0.28;
      rect(ctx, x0, y0 + 1, w, h - 2, col);
      ctx.globalAlpha = 1;
      rect(ctx, x0 + 3, y0 + 3, w - 6, h - 6, '#0b0612');
      rect(ctx, x0, y0 + 1, w, 1, col); rect(ctx, x0, y0 + h - 2, w, 1, col);
      rect(ctx, x0, y0 + 1, 2, h - 2, col); rect(ctx, x0 + w - 2, y0 + 1, 2, h - 2, col);
      // chevrons running into the door
      for (let k = 0; k < 3; k++) {
        const cx = x0 + 10 + k * 11 + (on ? ((g.t * 14) | 0) % 3 : 0);
        ctx.globalAlpha = on ? 1 : 0.5;
        rect(ctx, cx, mid - 3, 2, 2, col); rect(ctx, cx + 2, mid - 1, 2, 2, col); rect(ctx, cx, mid + 1, 2, 2, col);
      }
      ctx.globalAlpha = 1;
      T.shadow(ctx, o.label || 'GO', x0 - 4, mid - 3, on ? '#fff6c0' : col, 1, 'right');
    });
    // header, in screen space on the locked screen
    T.shadow(ctx, 'CHOOSE YOUR WAY', camX + LS.W / 2, 28, blink ? '#ffe14a' : '#ff2e88', 1, 'center');
    if (g.exitPick) {
      T.shadow(ctx, 'ENTER / TAP: GO TO ' + (g.exitPick.label || 'GO'), camX + LS.W / 2, 40, '#fff6c0', 1, 'center');
    } else {
      T.shadow(ctx, 'WALK TO A DOOR', camX + LS.W / 2, 40, '#c8bce0', 1, 'center');
    }
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
      // Jack's guard meter, over his head while he is blocking or it is not full (red when broken)
      if (f === g.player && f.hp > 0 && (f.state === 'block' || f.guard < f.guardMax)) {
        const bx = Math.round(f.x) - 9, by = Math.round(f.y - f.z) - 62, locked = f.blockLock > 0;
        rect(ctx, bx - 1, by - 1, 20, 4, '#12081c');
        rect(ctx, bx, by, Math.round(18 * f.guard / f.guardMax), 2, locked ? '#ff3b30' : '#b04dff');
      }
      // mini life bar over regular enemies that were hit recently
      if (f.team === 'enemy' && !f.isBoss && f.barT > 0 && f.hp > 0) {
        const bx = Math.round(f.x) - 9, by = Math.round(f.y - f.z) - 62;
        rect(ctx, bx - 1, by - 1, 20, 4, '#12081c');
        rect(ctx, bx, by, Math.round(18 * f.hp / f.maxHp), 2, '#ff5a3c');
      }
    }

    drawExit(ctx, g);
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
    LS.Text.draw(ctx, g.segId + ' ' + g.phase + ' W' + g.waveIndex + ' X' + (g.player.x | 0) + ' Y' + (g.player.y | 0), LS.Camera.x + 4, 40, '#2ee86a');
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
    const span = LS.Background.panSpan();
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

  // ---------------------------------------------------------------------
  // Splash: the developer card and the LAST SONG card on an old amplifier
  // ---------------------------------------------------------------------
  let ampTex = null;
  /* The front of an old amp, painted once: grille cloth (a fine cross-hatch), a dark vignette,
     metal trim at the top and a row of knobs. All code, no image. */
  function ampTexture() {
    if (ampTex) return ampTex;
    ampTex = LS.makeCanvas(LS.W, LS.H);
    const c = ampTex.getContext('2d'), W = LS.W, H = LS.H;
    c.fillStyle = '#0d0907'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 3) { c.fillStyle = 'rgba(70,52,34,0.35)'; c.fillRect(0, y, W, 1); }   // weft
    for (let x = 0; x < W; x += 3) { c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillRect(x, 0, 1, H); }      // warp
    for (let y = 1; y < H; y += 6) for (let x = 1; x < W; x += 6) { c.fillStyle = 'rgba(120,92,60,0.18)'; c.fillRect(x, y, 2, 1); }
    // metal trim along the top with knobs
    c.fillStyle = '#26221e'; c.fillRect(0, 0, W, 22);
    c.fillStyle = '#4a443c'; c.fillRect(0, 0, W, 1); c.fillStyle = '#0a0806'; c.fillRect(0, 22, W, 2);
    for (let i = 0; i < 6; i++) {
      const kx = 60 + i * 52;
      c.fillStyle = '#0a0806'; c.fillRect(kx - 6, 5, 12, 12);
      c.fillStyle = '#6a6258'; c.fillRect(kx - 5, 6, 10, 10);
      c.fillStyle = '#d8d0b0'; c.fillRect(kx - 1, 6, 2, 5);
    }
    // vignette: the amp is lit from the middle, the corners fall into the dark
    const gr = c.createRadialGradient(W / 2, H * 0.58, 40, W / 2, H * 0.58, W * 0.62);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    c.fillStyle = gr; c.fillRect(0, 0, W, H);
    return ampTex;
  }

  /* The developer's placeholder logo: a die (a "game" doctor's mascot) over the studio name. */
  function drawStudioCard(g, ctx, t) {
    const T = LS.Text, cx = 240;
    const a = Math.min(1, t / 0.5) * Math.min(1, (2.4 - t) / 0.4);
    ctx.globalAlpha = Math.max(0, a);
    const x = cx - 20, y = 78;
    rect(ctx, x - 2, y - 2, 44, 44, '#2a0a10'); rect(ctx, x, y, 40, 40, '#f4f0e8'); rect(ctx, x, y, 40, 3, '#ffffff');
    rect(ctx, x, y + 37, 40, 3, '#bdb6a6'); rect(ctx, x + 37, y, 3, 40, '#bdb6a6');
    for (const [px, py] of [[8, 8], [28, 8], [18, 18], [8, 28], [28, 28]]) rect(ctx, x + px, y + py, 5, 5, '#c0262e');
    rect(ctx, cx - 2, y - 14, 4, 10, '#c0262e'); rect(ctx, cx - 5, y - 11, 10, 4, '#c0262e'); // the doctor's cross
    T.shadow(ctx, 'THE DR JUEGO STUDIO', cx, 134, '#f4f0e8', 2, 'center', '#c0262e');
    T.draw(ctx, 'PRESENTS', cx, 156, '#7d6f9c', 1, 'center');
    ctx.globalAlpha = 1;
  }

  /* LAST SONG on the amp: the power LED lights up with the switch-on sound, then the logo flickers in. */
  function drawAmpCard(g, ctx, t) {
    const T = LS.Text, on = t > 0.1;
    ctx.globalAlpha = Math.min(1, t / 0.4) * Math.min(1, (2.8 - t) / 0.4);
    ctx.drawImage(ampTexture(), 0, 0);
    const led = on && (t < 0.35 || ((g.t * 24) | 0) % 9 !== 0);
    rect(ctx, 412, 30, 14, 8, '#1a0606');
    rect(ctx, 414, 32, 10, 4, led ? '#ff3b30' : '#3a0c0a');
    if (led) { ctx.globalAlpha *= 0.25; rect(ctx, 408, 28, 22, 12, '#ff3b30'); ctx.globalAlpha = Math.min(1, t / 0.4) * Math.min(1, (2.8 - t) / 0.4); }
    // the logo warms up: a few flickers, then steady
    const k = Math.max(0, Math.min(1, (t - 0.3) / 0.7)), flick = t < 1.0 && ((g.t * 30) | 0) % 3 === 0;
    ctx.globalAlpha *= flick ? 0.35 : k;
    logo(ctx, g, 108);
    ctx.globalAlpha = 1;
  }

  function drawSplash(g, ctx) {
    rect(ctx, 0, 0, LS.W, LS.H, '#000');
    const t = g.stateT;
    if (t < 2.4) drawStudioCard(g, ctx, t);
    else if (t > 2.6) drawAmpCard(g, ctx, t - 2.6);
    if (((g.t * 2) | 0) % 2 === 0) LS.Text.draw(ctx, 'ENTER - SKIP', 474, 258, '#4a3d66', 1, 'right');
  }

  // ---------------------------------------------------------------------
  // Main menu: an empty rock stage. The static set (wall, truss, boards, amps, guitar, mic) is
  // painted once; the lights, Jack and the menu are drawn every frame, pulsing with the music.
  // ---------------------------------------------------------------------
  const STAGE_FLOOR = 178;                         // y where the back wall meets the stage boards
  const CAN_X = [70, 180, 300, 410];               // the four light cans on the truss
  const STAGE_COLS = ['#ff2e4a', '#9b4dff', '#2e6bff'];   // red, violet, blue
  let stageTex = null;

  function stageTexture() {
    if (stageTex) return stageTex;
    stageTex = LS.makeCanvas(LS.W, LS.H);
    const c = stageTex.getContext('2d'), W = LS.W, H = LS.H, amp = ampTexture();
    const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

    // back wall: dark violet with curtain folds
    const wall = c.createLinearGradient(0, 0, 0, STAGE_FLOOR);
    wall.addColorStop(0, '#0c0612'); wall.addColorStop(1, '#241038');
    c.fillStyle = wall; c.fillRect(0, 0, W, STAGE_FLOOR);
    for (let x = 0; x < W; x += 10) px(x, 0, 5, STAGE_FLOOR, (x / 10) % 2 ? 'rgba(0,0,0,0.28)' : 'rgba(120,60,160,0.08)');

    // lighting truss with a can under each beam
    px(0, 8, W, 4, '#2a2630'); px(0, 20, W, 3, '#2a2630');
    for (let x = 0; x < W; x += 12) { px(x, 12, 1, 8, '#3a3540'); px(x + 6, 14, 1, 4, '#3a3540'); }
    for (const x of CAN_X) { px(x - 8, 22, 16, 10, '#14121a'); px(x - 8, 22, 16, 1, '#4a4450'); px(x - 6, 32, 12, 2, '#08060c'); }

    // stage boards in perspective, with the lip at the front edge of the back wall
    c.fillStyle = '#2b170f'; c.fillRect(0, STAGE_FLOOR, W, H - STAGE_FLOOR);
    for (let y = STAGE_FLOOR, h = 5, i = 0; y < H; y += h, h += 1.6, i++) {
      px(0, y, W, Math.max(1, Math.round(h) - 1), i % 2 ? '#3a2216' : '#33200f');
      px(0, y + Math.round(h) - 1, W, 1, '#1a0d08');
    }
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1;
    for (let k = -4; k <= 4; k++) { c.beginPath(); c.moveTo(240 + k * 22, STAGE_FLOOR); c.lineTo(240 + k * 95, H); c.stroke(); }
    px(0, STAGE_FLOOR - 3, W, 3, '#5a3622'); px(0, STAGE_FLOOR - 3, W, 1, '#8a5a38');

    // left amp stack: two cabinets cut from the grille texture
    for (const [y, h] of [[124, 48], [172, 50]]) {
      c.drawImage(amp, 40, 70, 62, h, 16, y, 62, h);
      px(14, y, 66, 2, '#4a443c'); px(14, y + h - 1, 66, 1, '#06040a'); px(14, y, 2, h, '#0a0806'); px(78, y, 2, h, '#0a0806');
    }
    for (let i = 0; i < 4; i++) { px(24 + i * 14, 127, 8, 6, '#0a0806'); px(25 + i * 14, 128, 6, 4, '#6a6258'); px(28 + i * 14, 128, 1, 3, '#d8d0b0'); }

    // a combo amp and a floor monitor around the microphone
    c.drawImage(amp, 120, 60, 40, 34, 150, 192, 40, 34);
    px(148, 192, 44, 2, '#4a443c'); px(148, 225, 44, 1, '#06040a');
    px(198, 218, 36, 7, '#14121a'); px(202, 212, 28, 6, '#0e0c14'); px(198, 218, 36, 1, '#3a3540');

    // guitar on its stand
    px(118, 218, 2, 8, '#1a1a20'); px(134, 218, 2, 8, '#1a1a20'); px(122, 214, 10, 2, '#1a1a20');
    px(122, 186, 26, 32, '#7a1018'); px(124, 188, 22, 28, '#a01824'); px(128, 200, 14, 6, '#e8e0d0'); px(130, 196, 3, 3, '#222');
    px(133, 148, 4, 40, '#3a2210'); px(131, 142, 8, 8, '#2a1608'); px(122, 186, 26, 1, '#d8505a');

    // the microphone on its stand, dead centre
    px(226, 226, 28, 2, '#2a2a30'); px(232, 223, 16, 3, '#2a2a30'); px(239, 158, 2, 66, '#34343c');
    px(236, 152, 8, 6, '#1a1a20'); px(237, 142, 6, 11, '#9a9aa4'); px(238, 143, 4, 6, '#2a2a30'); px(237, 142, 6, 1, '#d8d8e0');
    return stageTex;
  }

  /* Stage, truss lights and the light show. `beat` comes from Audio.beat: every beat the cans
     flash and fade, the colours rotate every two beats and the downbeat of each bar hits harder. */
  function drawMenuStage(g, ctx, beat, force) {   // force: 'flash' = every can at full blast, 'out' = lights off (play transition)
    ctx.drawImage(stageTexture(), 0, 0);
    if (force === 'out') return;
    const pulse = force === 'flash' ? 1 : 1 - (beat % 1), bar = force === 'flash' || Math.floor(beat) % 4 === 0, strength = (bar ? 1 : 0.62) * pulse * pulse;
    for (let i = 0; i < CAN_X.length; i++) {
      const x = CAN_X[i], col = STAGE_COLS[(Math.floor(beat / 2) + i) % STAGE_COLS.length];
      const sway = Math.sin(g.t * 0.7 + i * 1.7) * 26, a = 0.1 + 0.42 * strength;
      const gr = ctx.createLinearGradient(0, 34, 0, STAGE_FLOOR + 60);
      gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a; ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(x - 3, 34); ctx.lineTo(x + 3, 34); ctx.lineTo(x + sway + 46, STAGE_FLOOR + 60); ctx.lineTo(x + sway - 46, STAGE_FLOOR + 60); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = col;                      // the pool of light on the boards
      ctx.beginPath(); ctx.ellipse(x + sway, STAGE_FLOOR + 52, 40, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35 + 0.65 * pulse; rect(ctx, x - 5, 31, 10, 3, col);   // the lamp itself
    }
    ctx.globalAlpha = 1;
    if (bar && pulse > 0.82) { ctx.globalAlpha = 0.16 * (pulse - 0.82) / 0.18; rect(ctx, 0, 0, LS.W, LS.H, '#fff'); ctx.globalAlpha = 1; }
  }

  /* Jack by the amp stack, idling in time with the music (see menuPose in sprites.js). */
  function menuJack(g, ctx, beat) {
    dummy.kind = 'jack'; dummy.state = 'menu'; dummy.animT = g.t; dummy.beat = beat; dummy.facing = 1;
    ctx.save();
    ctx.translate(112, 244);
    ctx.scale(2, 2);
    LS.Sprites.draw(ctx, dummy, 0, 0);
    ctx.restore();
    dummy.state = 'idle';
  }

  function drawPadlock(ctx, x, y, col) {
    rect(ctx, x + 1, y, 5, 1, col); rect(ctx, x, y + 1, 1, 4, col); rect(ctx, x + 6, y + 1, 1, 4, col);
    rect(ctx, x - 1, y + 5, 9, 7, col);
  }

  function drawTitle(g, ctx) {
    const T = LS.Text, blink = ((g.t * 2.5) | 0) % 2 === 0, M = g.MENU, b = M.box;
    const beat = LS.Audio.beat(g.t);
    drawMenuStage(g, ctx, beat);
    rect(ctx, 0, 36, LS.W, 1, '#ff2e88'); rect(ctx, 0, 112, LS.W, 1, '#28dcff');
    rect(ctx, 0, 37, LS.W, 75, 'rgba(8,3,16,0.5)');
    logo(ctx, g, 50);
    T.shadow(ctx, 'A ROCKSTAR NEVER DIES. HE JUST GETS OLDER.', 240, 96, '#28dcff', 1, 'center');
    menuJack(g, ctx, beat);

    // the options, on a dark panel on the right (a click or tap on a row picks it)
    const cx = b.x + b.w / 2;
    rect(ctx, b.x, b.y + 4, b.w, M.items.length * M.rowH + 4, 'rgba(8,3,16,0.74)');
    rect(ctx, b.x, b.y + 4, b.w, 1, '#ff2e88'); rect(ctx, b.x, b.y + 8 + M.items.length * M.rowH, b.w, 1, '#28dcff');
    M.items.forEach((label, i) => {
      const sel = g.menu === i, locked = M.locked[i], y = M.rowY + i * M.rowH;
      const col = locked ? '#4a3d66' : sel ? '#ffe14a' : '#a89cc8';
      const lx = cx - (locked ? 2 : 0) - T.width(label, 2) / 2;       // left edge of the label (locked rows leave room for the padlock)
      T.shadow(ctx, label, lx, y, col, 2);
      if (locked) drawPadlock(ctx, b.x + b.w - 16, y + 1, '#7d6f9c');
      if (sel && blink) T.shadow(ctx, '>', Math.max(b.x + 3, lx - 14), y, '#ff2e88', 2);   // never outside the panel
    });
    if (g.menuMsgT > 0) T.shadow(ctx, 'UNLOCKS WITH THE CAMPAIGN', cx, 208, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'W / S MOVE   ENTER SELECT   OR TAP AN OPTION', 240, 246, '#7d6f9c', 1, 'center');
    T.draw(ctx, 'ROCK BOTTOM ARCADE SYSTEM   CREDIT 01', 240, 258, '#4a3d66', 1, 'center');
  }

  /* The play transition (game.js, G.startLaunch), 1.25 s: the drum hit sets every light off at full
     blast (0 - 0.3 s), then the lights go out and darkness falls (0.3 - 0.6 s) with Jack left in a
     single spotlight, which closes like an iris on him (0.6 - 1.25 s). The game then opens from black. */
  function drawLaunch(g, ctx) {
    const t = g.stateT, beat = LS.Audio.beat(g.t), JX = 112, JY = 190, W = LS.W, H = LS.H;
    drawMenuStage(g, ctx, beat, t < 0.3 ? 'flash' : 'out');
    if (t >= 0.3) {
      const k = clamp01((t - 0.3) / 0.3);
      ctx.globalAlpha = 0.85 * k; rect(ctx, 0, 0, W, H, '#000');            // darkness falls
      const sp = ctx.createRadialGradient(JX, JY, 10, JX, JY, 95);          // the spotlight on Jack
      sp.addColorStop(0, 'rgba(255,240,220,0.34)'); sp.addColorStop(1, 'rgba(255,240,220,0)');
      ctx.globalAlpha = k; ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    menuJack(g, ctx, beat);
    if (t < 0.3) { ctx.globalAlpha = 1 - t / 0.3; logo(ctx, g, 50); ctx.globalAlpha = 1; }   // the title goes with the music
    if (t > 0.6) {                                                                          // iris: black outside a shrinking circle
      const k = clamp01((t - 0.6) / 0.65), r = 420 * (1 - k) * (1 - k);   // starts wider than the farthest corner (about 414 px), so the black enters smoothly
      ctx.fillStyle = '#000';
      if (k >= 1) ctx.fillRect(0, 0, W, H);
      else { ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(JX, JY, r, 0, Math.PI * 2); ctx.fill('evenodd'); }
    }
  }

  function drawOptions(g, ctx) {
    const T = LS.Text, beat = LS.Audio.beat(g.t), blink = ((g.t * 2.5) | 0) % 2 === 0;
    drawMenuStage(g, ctx, beat);
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(8,3,16,0.72)');
    T.shadow(ctx, 'OPTIONS', 240, 40, '#ffe14a', 3, 'center', '#b0241e');
    g.OPTIONS_ROWS.forEach((row, i) => {
      const sel = g.opt === i, y = g.OPT.y + i * g.OPT.h;
      const label = row === 'SOUND' ? 'SOUND: ' + (LS.Audio.muted ? 'OFF' : 'ON') : row;
      T.shadow(ctx, label, 240, y, sel ? '#ffe14a' : '#a89cc8', 2, 'center');
      if (sel && blink) T.shadow(ctx, '>', 240 - T.width(label, 2) / 2 - 18, y, '#ff2e88', 2);
    });
    T.draw(ctx, 'ESC - BACK', 240, 246, '#7d6f9c', 1, 'center');
  }

  function drawCredits(g, ctx) {
    const T = LS.Text, beat = LS.Audio.beat(g.t);
    drawMenuStage(g, ctx, beat);
    rect(ctx, 0, 0, LS.W, LS.H, 'rgba(8,3,16,0.78)');
    T.shadow(ctx, 'CREDITS', 240, 30, '#ffe14a', 3, 'center', '#b0241e');
    const lines = [
      ['LAST SONG', '#ff2e88'], ['', 0],
      ['A GAME BY', '#7d6f9c'], ['THE DR JUEGO STUDIO', '#f4f0e8'], ['', 0],
      ['ALL ART AND SOUND ARE GENERATED BY CODE', '#28dcff'],
      ['HTML5 CANVAS AND WEB AUDIO', '#28dcff'],
      ['NO FRAMEWORKS. NO IMAGE FILES. NO AUDIO FILES.', '#28dcff'], ['', 0],
      ['THANKS FOR PLAYING', '#ffe14a'],
    ];
    lines.forEach(([s, col], i) => { if (s) T.shadow(ctx, s, 240, 76 + i * 14, col, 1, 'center'); });
    if (((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER TO GO BACK', 240, 246, '#ffe14a', 1, 'center');
  }

  function drawControls(g, ctx) {
    const T = LS.Text;
    backdrop(g, ctx, 0.8);
    T.shadow(ctx, 'CONTROLS', 240, 26, '#ffe14a', 3, 'center', '#b0241e');
    const rows = [
      ['MOVE', 'W A S D  /  ARROWS'], ['PUNCH', 'J'], ['KICK', 'K'], ['JUMP', 'SPACE'],
      ['BLOCK', 'I / SHIFT (HOLD)'], ['SOLO', 'L (WHEN CHARGED)'], ['START', 'ENTER'], ['PAUSE', 'ESC'], ['SOUND', 'M'],
    ];
    rows.forEach((r, i) => {
      const y = 46 + i * 13;
      T.shadow(ctx, r[0], 150, y, '#28dcff', 1, 'right');
      T.draw(ctx, '.......', 160, y, '#4a3d66');
      T.shadow(ctx, r[1], 212, y, '#f4f0e8');
    });
    T.draw(ctx, 'PUNCH X3 = COMBO.  JUMP + PUNCH/KICK = FLYING KICK', 240, 168, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'BLOCK FACING A FOE: HEAVY HITS STAGGER, A DRAINED GUARD BREAKS', 240, 180, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'KOS CHARGE THE SOLO. SMASH CRATES FOR FOOD AND POWER', 240, 192, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'JUMP OR SIDESTEP (W / S) TO DODGE SHOCKWAVES', 240, 204, '#ff9ad0', 1, 'center');
    T.draw(ctx, 'TOUCH: STICK ON THE LEFT, BUTTONS ON THE RIGHT', 240, 218, '#7d6f9c', 1, 'center');
    if (((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER TO GO BACK', 240, 232, '#ffe14a', 1, 'center');
  }

  // ---------------------------------------------------------------------
  // Intro: a 11.2 s wordless sequence (see game.js for the timeline and its sounds)
  //   0.0  black                   0.5 / 1.7  an out-of-tune guitar (a string trembles)
  //   3.2  the amp switches on     4.4  stage lights and the crowd in the dark
  //   6.0  Jack from behind        8.2  the title lands (flash), 10.7 fade out
  // ---------------------------------------------------------------------
  const BEAMS = ['#ff2e4a', '#9b4dff', '#2e6bff', '#ff2e88'];
  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  /* A thin string that trembles for a moment after each pluck: the only light in the first seconds. */
  function drawString(ctx, t) {
    for (const p of [0.5, 1.7]) {
      const d = t - p;
      if (d < 0 || d > 1.3) continue;
      const a = 1 - d / 1.3;
      for (let x = 110; x < 370; x += 2) {
        const env = Math.sin(((x - 110) / 260) * Math.PI);
        const y = 135 + Math.sin(x * 0.09 + d * 55) * 5 * a * a * env + (d < 0.15 ? Math.sin(x * 7.3 + t * 91) : 0); // a deterministic shiver: drawing never touches the game's RNG
        ctx.globalAlpha = 0.25 + 0.6 * a;
        rect(ctx, x, Math.round(y), 2, 1, '#ffd9a0');
      }
      ctx.globalAlpha = 1;
    }
  }

  /* The backline amp: a slice of the grille texture with a red power LED that comes on with its click. */
  function drawBacklineAmp(ctx, t, bright) {
    const k = clamp01((t - 3.2) / 0.6);
    ctx.globalAlpha = k * (0.55 + 0.45 * bright);
    ctx.drawImage(ampTexture(), 180, 100, 120, 86, 180, 100, 120, 86);
    rect(ctx, 180, 100, 120, 3, '#4a443c'); rect(ctx, 180, 183, 120, 3, '#0a0806');
    rect(ctx, 180, 100, 2, 86, '#0a0806'); rect(ctx, 298, 100, 2, 86, '#0a0806');
    ctx.globalAlpha = k;
    rect(ctx, 286, 106, 8, 5, '#1a0606');
    rect(ctx, 287, 107, 6, 3, ((t * 24) | 0) % 11 === 0 ? '#3a0c0a' : '#ff3b30');
    ctx.globalAlpha = k * 0.22; rect(ctx, 282, 103, 16, 11, '#ff3b30');
    ctx.globalAlpha = 1;
  }

  /* Jack seen from behind, backlit: a dark silhouette with a pink rim light, the guitar neck raised. */
  function drawJackBack(ctx, t, base) {
    const k = clamp01((t - 6.0) / 0.9), sway = Math.round(Math.sin(t * 1.6)), cx = 240 + sway;
    const raise = clamp01((t - 7.4) / 0.8) * 12;
    ctx.globalAlpha = k;
    const g = ctx.createRadialGradient(240, base - 70, 6, 240, base - 70, 130);   // the stage glow behind him
    g.addColorStop(0, 'rgba(255,170,230,0.6)'); g.addColorStop(1, 'rgba(255,170,230,0)');
    ctx.fillStyle = g; ctx.fillRect(100, base - 200, 280, 220);
    const D = '#0b0612', DD = '#050308', RIM = '#ff9ac8';
    rect(ctx, cx - 14, base - 26, 12, 26, D); rect(ctx, cx + 2, base - 26, 12, 26, D);          // legs
    rect(ctx, cx - 16, base - 5, 15, 5, DD); rect(ctx, cx + 1, base - 5, 15, 5, DD);            // boots
    rect(ctx, cx - 28, base - 70, 56, 46, D); rect(ctx, cx - 1, base - 66, 2, 42, DD);          // jacket, seam
    rect(ctx, cx - 34, base - 66, 8, 40, D);                                                    // left arm
    for (let i = 0; i < 24; i++) rect(ctx, cx - 24 + i * 2, base - 68 + Math.round(i * 1.6), 3, 3, '#2a2234'); // strap
    rect(ctx, cx - 4, base - 78, 8, 9, '#1a1018');                                              // neck
    rect(ctx, cx - 10, base - 98, 20, 22, '#120a14');                                           // head
    rect(ctx, cx - 14, base - 102, 28, 16, DD); rect(ctx, cx - 15, base - 92, 30, 24, DD);      // hair
    rect(ctx, cx + 24, base - 66, 8, 20, D);                                                    // right arm, bent...
    for (let i = 0; i < 12; i++) rect(ctx, cx + 28 + i, base - 48 - i * 2, 6, 5, D);
    for (let i = 0; i < 40; i++) rect(ctx, cx + 38 + i, Math.round(base - 62 - (i * (50 + raise)) / 40), 3, 3, '#1c1210'); // ...holding the guitar neck
    rect(ctx, cx + 76, Math.round(base - 120 - raise), 7, 10, '#1c1210');                       // headstock
    // rim light on the top edges
    ctx.globalAlpha = k * 0.9;
    rect(ctx, cx - 28, base - 70, 56, 1, RIM); rect(ctx, cx - 14, base - 102, 28, 1, RIM);
    rect(ctx, cx - 15, base - 92, 1, 24, RIM); rect(ctx, cx + 14, base - 92, 1, 24, RIM);
    ctx.globalAlpha = 1;
  }

  /* The crowd: silhouettes along the bottom edge, some with raised arms, bobbing to nothing in particular. */
  function drawCrowd(ctx, t, k) {
    ctx.globalAlpha = k;
    for (let i = 0; i < 26; i++) {
      const x = i * 19 + (i % 3) * 4 - 6, bob = Math.round(Math.sin(t * 3 + i * 1.7) * 2);
      const y = 240 + ((i * 7) % 6) + bob;
      rect(ctx, x, y, 11, 11, '#07040c'); rect(ctx, x - 5, y + 11, 21, 30, '#07040c');
      rect(ctx, x, y, 11, 1, '#5a3a7a');
      if (i % 2 === 0) { const lift = Math.round(Math.sin(t * 4 + i) * 3); rect(ctx, x - 5, y - 12 + lift, 3, 16, '#07040c'); rect(ctx, x - 5, y - 12 + lift, 3, 1, '#5a3a7a'); }
    }
    ctx.globalAlpha = 1;
  }

  function drawIntro(g, ctx) {
    const t = g.stateT;
    rect(ctx, 0, 0, LS.W, LS.H, '#000');
    drawString(ctx, t);

    // stage lights sweeping behind everything once the crowd has roared up
    const lk = clamp01((t - 4.4) / 1.6);
    if (lk > 0) {
      for (let i = 0; i < 4; i++) {
        const x0 = 70 + i * 113, sway = Math.sin(t * 0.9 + i * 1.3) * 45;
        const gr = ctx.createLinearGradient(0, 0, 0, LS.H);
        gr.addColorStop(0, BEAMS[i]); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha = 0.28 * lk * (0.7 + 0.3 * Math.sin(t * 5 + i));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + sway - 34, LS.H); ctx.lineTo(x0 + sway + 34, LS.H); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (t > 3.2) drawBacklineAmp(ctx, t, lk);
    if (t > 6.0) drawJackBack(ctx, t, 246);
    if (lk > 0) drawCrowd(ctx, t, lk);

    // the title lands with a flash
    if (t > 8.2) {
      const a = clamp01((t - 8.2) / 0.25), flash = clamp01(0.9 - (t - 8.2) * 2.6);
      ctx.globalAlpha = a;
      logo(ctx, g, 50);                       // same spot as on the title menu, so the cut is seamless
      if (flash > 0) { ctx.globalAlpha = flash; rect(ctx, 0, 0, LS.W, LS.H, '#fff'); }
      ctx.globalAlpha = 1;
    }
    if (t > 10.7) { ctx.globalAlpha = clamp01((t - 10.7) / 0.5); rect(ctx, 0, 0, LS.W, LS.H, '#000'); ctx.globalAlpha = 1; }
  }

  /* The old multi-page story, out of the flow now (?screen=story). */
  function drawStory(g, ctx) {
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
    T.draw(ctx, g.era.ending || 'THE ROAD ENDS HERE... FOR NOW', 240, 224, '#ff9ad0', 1, 'center'); // route-specific ending
    if (g.stateT > 1.5 && ((g.t * 2.5) | 0) % 2 === 0) T.shadow(ctx, 'PRESS ENTER', 240, 240, '#ffe14a', 1, 'center');
    // Same hint, colour and style as Game Over; shown with the prompt so the exit is discoverable
    if (g.stateT > 1.5) T.draw(ctx, 'ESC - TITLE', 240, 254, '#7d6f9c', 1, 'center');
  }

  R.draw = function (g, ctx) {
    ctx.imageSmoothingEnabled = false;
    switch (g.state) {
      case 'splash': drawSplash(g, ctx); break;
      case 'title': drawTitle(g, ctx); break;
      case 'options': drawOptions(g, ctx); break;
      case 'launch': drawLaunch(g, ctx); break;
      case 'credits': drawCredits(g, ctx); break;
      case 'controls': drawControls(g, ctx); break;
      case 'intro': drawIntro(g, ctx); break;
      case 'story': drawStory(g, ctx); break;
      default:
        drawWorld(g, ctx);
        LS.HUD.draw(ctx, g);
        if (g.fade > 0) { // segment transition: fade to black and back
          ctx.globalAlpha = g.fade;
          rect(ctx, 0, 0, LS.W, LS.H, '#000');
          ctx.globalAlpha = 1;
        }
        if (g.state === 'paused') drawPause(g, ctx);
        else if (g.state === 'gameover') drawGameOver(g, ctx);
        else if (g.state === 'victory') drawVictory(g, ctx);
    }
  };
})();
