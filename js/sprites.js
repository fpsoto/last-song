/* sprites.js - procedural pixel-art characters (v2: shading, rim light, smears, more detail).

   There are no image files. Every character is a small 2D "rig":
     - a LOOK  (colours, proportions, hair style, accessories)
     - a POSE  (joint angles for torso, arms and legs)
   The rig is drawn with chunky square "stamps" at integer coordinates, which is what
   gives it a pixel-art look. Animation = interpolating between hand-authored key poses.

   Angle convention (character facing right):
     0 = limb pointing straight down, positive = rotating towards the front.
     So an arm at PI/2 points forward, at PI points straight up.

   What makes it read as a sprite instead of a puppet:
     1. two-tone shading baked into every stamp (dark edge on the back / underside)
     2. a rim light on top edges, tinted with the colour of the nearest neon
     3. animation snapped to a low frame rate (walk = 8 frames per cycle)
     4. white "smear" streaks on the fast part of each attack
     5. secondary motion: hair sway, blinking */
(function () {
  'use strict';
  const LS = window.LS;
  const S = (LS.Sprites = {});
  const sin = Math.sin, cos = Math.cos;

  // Scratch buffers: the character is drawn here first so we can post-process it.
  const BW = 160, BH = 128, OX = 80, OY = 104; // (OX, OY) = where the feet go in the buffer
  const buf = LS.makeCanvas(BW, BH), b = buf.getContext('2d');   // the sprite
  const sil = LS.makeCanvas(BW, BH), s = sil.getContext('2d');   // solid silhouette (outline / flash)
  const rim = LS.makeCanvas(BW, BH), r = rim.getContext('2d');   // top-edge highlight
  const OUTLINE = '#0d0812';

  // ---------------------------------------------------------------------
  // Looks
  // ---------------------------------------------------------------------
  /* Each colour becomes four tones: near side [base, shadow] and far side [base, shadow].
     Far-side limbs (the arm and leg behind the body) are darker so depth reads at a glance. */
  const tones = (hex) => ({ n: [hex, LS.shade(hex, 0.62)], f: [LS.shade(hex, 0.7), LS.shade(hex, 0.44)] });

  function look(o) {
    const L = Object.assign({
      thigh: 11, shin: 11, torso: 16, uarm: 8, farm: 8,
      legW: 5, armW: 4, torsoW: 10, head: 8, sleeves: true,
    }, o);
    L.t = {};
    for (const k of ['skin', 'jacket', 'shirt', 'pants', 'boots']) L.t[k] = tones(L[k]);
    L.skinD = LS.shade(L.skin, 0.76);
    L.hairHi = LS.shade(L.hair, 1.35);
    L.hairD = LS.shade(L.hair, 0.7);
    return L;
  }

  const LOOKS = (S.LOOKS = {
    // Jack Ryder: worn leather jacket, fictional band tee, tight jeans, boots, tired face,
    // and the guitar he still carries everywhere in a beat-up gig bag.
    jack: look({
      skin: '#dba077', hair: '#3d2b22', hairStyle: 'long', jacket: '#30303f', trim: '#6a6a88',
      shirt: '#a62a3a', logo: '#f2d24a', pants: '#3a5c96', boots: '#1b1513', belt: '#120e0c', buckle: '#c8c8d0',
      stubble: '#a88068', bags: true, lips: '#7a4a3c', gigbag: '#5a3a24', knee: '#6f8fc4', wrist: '#120e0c',
    }),
    // Roadie: big, dark sleeveless shirt, bandana, beard, tattoo, gaffer tape on the belt.
    roadie: look({
      skin: '#c88c60', hair: '#1c1612', hairStyle: 'bandana', bandana: '#b3261e', jacket: '#1f1f26',
      shirt: '#1f1f26', logo: '#c8c8d0', pants: '#3a3d48', boots: '#0e0e10', belt: '#7a7a82', buckle: '#d8d8e0',
      beard: '#1c1612', sleeves: false, torsoW: 12, armW: 5, legW: 6, torso: 17, tattoo: '#2a4a6a', tape: '#b8b8c0',
      wrist: '#0e0e10',
    }),
    // Groupie: huge teased hair, neon top, mini skirt, white boots, swinging handbag.
    groupie: look({
      skin: '#efc2a2', hair: '#f4d35e', hairStyle: 'big', jacket: '#e0348c', shirt: '#e0348c',
      logo: '#ffe66d', pants: '#4a2e80', skirt: '#19c8d8', boots: '#f4f4f4', lips: '#d01840',
      sleeves: false, torsoW: 8, armW: 3, legW: 4, torso: 14, bag: '#ffe14a', wrist: '#ffe14a', earring: '#ffe14a',
    }),
    // Punk: green mohawk, studded leather vest over a red tee, tartan trousers, steel-toe boots.
    punk: look({
      skin: '#e6b896', hair: '#2ee86a', hairStyle: 'mohawk', jacket: '#1a1a1f', shirt: '#c01830',
      logo: '#e8e8f0', pants: '#8a1424', boots: '#16161a', belt: '#16161a', buckle: '#d8d8e0',
      sleeves: false, studs: '#d8d8e0', earring: '#d8d8e0', lips: '#8a3a40', knee: '#14141a',
      wrist: '#d8d8e0', tattoo: '#2a4a6a', torsoW: 9, torso: 16,
    }),
    // The King of Riffs: taller, silver mane, purple coat with gold trim, shades, flares, guitar.
    king: look({
      skin: '#d6a070', hair: '#e4e4ee', hairStyle: 'mane', jacket: '#7a22b0', trim: '#f2c230',
      shirt: '#d6a070', logo: '#f2c230', pants: '#d81b60', boots: '#f2f2f2', belt: '#f2c230', buckle: '#fff3a0',
      shades: true, tails: true, guitar: true, scarf: '#f2c230', lips: '#8a4a3c', flare: true, goldEdge: true,
      thigh: 13, shin: 13, torso: 19, uarm: 10, farm: 9, torsoW: 11, head: 9,
    }),
  });

  // ---------------------------------------------------------------------
  // Drawing primitives
  // ---------------------------------------------------------------------
  /* Thick pixel line: stamps a w*w square at every step between two points.
     With a `dark` colour it runs two passes: first the whole shape in the shadow tone,
     then the base tone one pixel smaller and anchored to the top-right. What is left
     of the first pass is a one-pixel shadow along the back and the underside of the limb. */
  function stamp(c, x0, y0, x1, y1, w, color, dark) {
    const dx = x1 - x0, dy = y1 - y0;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    const h = w / 2;
    if (dark && w > 2) {
      c.fillStyle = dark;
      for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + dx * i / n - h), Math.round(y0 + dy * i / n - h), w, w);
      c.fillStyle = color;
      for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + dx * i / n - h) + 1, Math.round(y0 + dy * i / n - h), w - 1, w - 1);
    } else {
      c.fillStyle = color;
      for (let i = 0; i <= n; i++) c.fillRect(Math.round(x0 + dx * i / n - h), Math.round(y0 + dy * i / n - h), w, w);
    }
  }
  const dot = (c, x, y, w, color) => { c.fillStyle = color; c.fillRect(Math.round(x - w / 2), Math.round(y - w / 2), w, w); };

  /* Draws a leg and returns the foot position (used for the kick smear). */
  function leg(c, L, x, y, a, k, far) {
    const kx = x + L.thigh * sin(a), ky = y + L.thigh * cos(a);
    const a2 = a - k; // the knee only bends backwards
    const ax = kx + L.shin * sin(a2), ay = ky + L.shin * cos(a2);
    const side = far ? 'f' : 'n', pants = L.t.pants[side], boots = L.t.boots[side];
    stamp(c, x, y, kx, ky, L.legW, pants[0], pants[1]);
    stamp(c, kx, ky, ax, ay, L.legW - 1, pants[0], pants[1]);
    if (L.knee && !far) dot(c, kx + cos(a) * 1, ky - sin(a) * 1, 2, L.knee);       // worn-out knee
    if (L.flare) stamp(c, kx + (ax - kx) * 0.6, ky + (ay - ky) * 0.6, ax, ay, L.legW + 1, pants[0], pants[1]); // bell-bottoms
    else stamp(c, kx + (ax - kx) * 0.55, ky + (ay - ky) * 0.55, ax, ay, L.legW - 1, boots[0], boots[1]);   // boot shaft
    // The foot points perpendicular to the shin, so it follows kicks and lying poses.
    const fx = ax + cos(a2) * 3, fy = ay - sin(a2) * 3;
    stamp(c, ax, ay, fx, fy, L.legW - 1, boots[0], boots[1]);
    return { x: fx, y: fy };
  }

  /* Draws an arm and returns the hand position + forearm direction (used for held items). */
  function arm(c, L, x, y, a, e, far) {
    const ex = x + L.uarm * sin(a), ey = y + L.uarm * cos(a);
    const a2 = a + e;
    const hx = ex + L.farm * sin(a2), hy = ey + L.farm * cos(a2);
    const side = far ? 'f' : 'n', skin = L.t.skin[side];
    const sleeve = L.sleeves ? L.t.jacket[side] : skin;
    stamp(c, x, y, ex, ey, L.armW, sleeve[0], sleeve[1]);
    stamp(c, ex, ey, hx, hy, L.sleeves ? L.armW : L.armW - 1, sleeve[0], sleeve[1]);
    if (L.tattoo && !far) dot(c, x + (ex - x) * 0.55, y + (ey - y) * 0.55, 2, L.tattoo);
    if (L.wrist) dot(c, ex + (hx - ex) * 0.72, ey + (hy - ey) * 0.72, L.armW - 1, L.wrist); // cuff / wristband
    stamp(c, hx, hy, hx, hy, L.armW + 1, skin[0], skin[1]);                                   // fist
    return { x: hx, y: hy, dx: sin(a2), dy: cos(a2) };
  }

  /* Electric guitar. `club` = held by the neck like a weapon, body at the far end. */
  function guitar(c, x, y, dx, dy, club) {
    let bx = x, by = y, nx, ny;
    if (club) { bx = x + dx * 17; by = y + dy * 17; nx = x - dx * 3; ny = y - dy * 3; }
    else { nx = x + dx * 21; ny = y + dy * 21; }
    stamp(c, bx, by, nx, ny, 2, '#d9a14a');                                                 // neck
    if (!club) stamp(c, nx, ny, nx + dx * 3, ny + dy * 3, 3, '#2a1a10');                      // headstock
    stamp(c, bx - dx * 3, by - dy * 3, bx + dx * 3, by + dy * 3, 9, '#e8203a', '#8a0f22');    // body
    stamp(c, bx - dx * 1, by - dy * 1, bx + dx * 2, by + dy * 2, 5, '#ff6a5a');
    stamp(c, bx, by, bx + dx, by + dy, 2, '#f4f0e8');                                        // pickup
    dot(c, bx - dx * 3, by - dy * 3, 2, '#ffe14a');                                          // gold knob
  }

  /* Head, upright version: all the personality lives in these few pixels.
     `sway` shifts the loose hair one pixel (secondary motion), `blink` closes the eyes. */
  function headUp(c, L, cx, cy, hurt, sway, blink) {
    const hs = L.head, x0 = Math.round(cx - hs / 2), y0 = Math.round(cy - hs / 2);
    const q = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x0 + x, y0 + y, w, h); };
    const st = L.hairStyle;

    // hair that falls behind the head
    if (st === 'long') { q(-2, -1, 4, hs + 4, L.hair); q(-3 - sway, hs - 2, 3, 6, L.hair); q(-3 - sway, hs + 3, 1, 2, L.hairD); }
    if (st === 'big') { q(-4, -3, 6, hs + 7, L.hair); q(-5 - sway, 0, 2, hs + 2, L.hair); q(-4, hs + 2, 2, 2, L.hairD); }
    if (st === 'mane') { q(-3, -2, 5, hs + 8, L.hair); q(-4 - sway, 2, 3, hs + 7, L.hair); q(-4 - sway, hs + 7, 1, 2, L.hairD); }

    // face
    q(0, 0, hs, hs, L.skin);
    q(hs, 3, 1, 2, L.skin);            // nose
    q(hs - 1, 5, 1, 1, L.skinD);       // nostril shadow
    q(hs - 3, 5, 1, 1, L.skinD);       // cheek hollow (tired face)
    q(0, hs - 1, hs, 1, L.skinD);      // jaw shadow
    q(1, 3, 1, 2, L.skinD);            // ear
    if (L.stubble) q(2, hs - 3, hs - 2, 3, L.stubble);
    if (L.beard) { q(1, hs - 4, hs - 1, 5, L.beard); q(hs - 3, hs - 5, 4, 1, L.beard); }
    if (L.earring) q(1, 5, 1, 2, L.earring);

    // hair on top
    if (st === 'long') {
      q(-1, -2, hs + 1, 3, L.hair); q(hs - 3, 1, 3, 1, L.hair); q(hs - 1, -1, 2, 2, L.hair);
      q(1, -2, 4, 1, L.hairHi);
    }
    if (st === 'bandana') {
      q(-1, -1, hs + 2, 3, L.bandana); q(-3 - sway, 0, 2, 2, L.bandana); q(-3 - sway, 2, 1, 3, L.bandana);
      q(-1, 2, 2, 3, L.hair); q(1, -1, 4, 1, LS.shade(L.bandana, 1.3));
    }
    if (st === 'big') {
      q(-3, -5, hs + 5, 6, L.hair); q(-1, -6, hs, 1, L.hair); q(hs - 2, 1, 3, 2, L.hair);
      q(0, -4, 4, 1, '#fff3b0'); q(-2, -2, 2, 1, '#fff3b0'); q(hs, -3, 2, 1, L.hairD);
    }
    if (st === 'mane') {
      q(-2, -3, hs + 3, 4, L.hair); q(hs - 1, 1, 2, 2, L.hair);
      q(0, -3, 5, 1, '#ffffff');
      q(-2, 0, hs + 2, 1, L.trim); // headband
    }

    if (st === 'mohawk') {
      // shaved sides + a comb of tall spikes along the top, brighter at the tips
      q(0, -1, hs, 2, L.hairD);
      const spikes = [3, 5, 6, 7, 6, 4];
      for (let i = 0; i < spikes.length; i++) {
        q(1 + i, -spikes[i], 1, spikes[i], L.hair);
        q(1 + i, -spikes[i], 1, 1, '#d8ffe0');
      }
      q(-1, -3, 2, 3, L.hair);
    }

    // eyes
    const ex = hs - 4, ey = 3;
    if (L.shades) { q(ex - 2, ey - 1, 6, 3, '#0a0a12'); q(ex - 1, ey - 1, 2, 1, '#7a7aa0'); }
    else if (hurt || blink) q(ex, ey + 1, 3, 1, '#1a1010');
    else {
      q(ex, ey, 2, 2, '#f4f0e8'); q(ex + 1, ey, 1, 2, '#14100e');
      q(ex - 1, ey - 1, 4, 1, L.hair);          // heavy brow = permanent frown
      if (L.bags) q(ex, ey + 2, 2, 1, L.skinD); // eye bags
    }

    // mouth
    if (hurt) q(hs - 3, hs - 3, 2, 2, '#3a0c10');
    else q(hs - 3, hs - 3, 3, 1, L.lips || '#5a2a22');
  }

  /* Head for lying poses: no room for detail, just hair + face + closed eye. */
  function headLying(c, L, cx, cy, ux, uy) {
    const hs = L.head;
    stamp(c, cx + ux * 3, cy + uy * 3, cx + ux * 4, cy + uy * 4, hs + 1, L.hair, L.hairD);
    stamp(c, cx, cy, cx, cy, hs, L.skin, L.skinD);
    c.fillStyle = '#1a1010';
    c.fillRect(Math.round(cx), Math.round(cy - 3), 1, 3);
  }

  /* Motion smear: three streaks trailing behind a fast fist / foot, in direction (dx, dy). */
  function streaks(c, x, y, dx, dy) {
    const px = -dy, py = dx; // perpendicular
    [[0, 11, '#ffffff'], [-3, 7, '#ffe9a0'], [3, 7, '#ffe9a0']].forEach(([off, len, col]) => {
      const sx = x + px * off + dx * 4, sy = y + py * off + dy * 4;
      stamp(c, sx, sy, sx + dx * len, sy + dy * len, 1, col);
    });
  }

  /* Draws the whole body, facing right, with the feet at (0, 0). */
  function drawBody(c, L, P, sway, blink) {
    // Hip height is derived from the legs: whichever leg reaches lower is the one
    // standing on the floor. This makes the body crouch automatically in wide stances
    // and drop to the ground when both legs are horizontal (knocked down).
    const dropF = L.thigh * cos(P.ft) + L.shin * cos(P.ft - P.fk);
    const dropB = L.thigh * cos(P.bt) + L.shin * cos(P.bt - P.bk);
    const hx = P.ox, hy = -Math.max(dropF, dropB, 3) - 2 + P.bob;

    const ux = sin(P.lean), uy = -cos(P.lean); // unit vector along the spine (hip -> head)
    const fx = cos(P.lean), fy = sin(P.lean);  // unit vector towards the chest
    const sx = hx + ux * L.torso, sy = hy + uy * L.torso; // top of the shoulders
    const jx = sx - ux * 3, jy = sy - uy * 3;             // shoulder joint
    const lying = Math.abs(P.lean) > 0.9;
    const half = L.torsoW / 2;
    const J = L.t.jacket;

    // --- far side (darker) ---
    const handB = arm(c, L, jx - fx * 2, jy - fy * 2, P.bs, P.be, true);
    leg(c, L, hx - fx * 1.5, hy - fy * 1.5, P.bt, P.bk, true);
    if (L.tails) { // coat tails hang behind the legs and lag with the movement
      stamp(c, hx - fx * 3, hy - fy * 3, hx - fx * (6 + sway) - ux * 10, hy - fy * (6 + sway) - uy * 10, 6, J.f[0], J.f[1]);
      stamp(c, hx - fx * (8 + sway) - ux * 11, hy - fy * (8 + sway) - uy * 11, hx - fx * (8 + sway) - ux * 11, hy - fy * (8 + sway) - uy * 11, 2, L.trim);
    }
    if (L.gigbag && !lying) { // guitar in a soft case, slung across the back
      const g0x = hx - fx * (half + 1) + ux * 2, g0y = hy - fy * (half + 1) + uy * 2;
      stamp(c, g0x, g0y, g0x + ux * 9, g0y + uy * 9, 7, L.gigbag, LS.shade(L.gigbag, 0.6));
      stamp(c, g0x + ux * 10, g0y + uy * 10, g0x + ux * (L.torso + 9) + fx, g0y + uy * (L.torso + 9) + fy, 3, L.gigbag, LS.shade(L.gigbag, 0.6));
    }

    // --- near leg ---
    const footF = leg(c, L, hx + fx * 1.5, hy + fy * 1.5, P.ft, P.fk, false);
    if (L.skirt) stamp(c, hx - ux, hy - uy, hx - ux * 3, hy - uy * 3, L.torsoW + 2, L.skirt, LS.shade(L.skirt, 0.62));

    // --- torso ---
    const tx0 = hx + ux * 3, ty0 = hy + uy * 3;
    const tx1 = sx - ux * (half - 1), ty1 = sy - uy * (half - 1);
    // Two stamps give the torso a silhouette: narrow waist, broader chest and shoulders.
    const mx = (tx0 + tx1) / 2, my = (ty0 + ty1) / 2;
    stamp(c, tx0, ty0, mx, my, L.torsoW - 1, J.n[0], J.n[1]);
    stamp(c, mx, my, tx1, ty1, L.torsoW, J.n[0], J.n[1]);
    if (L.studs) for (let i = 0; i < 4; i++) dot(c, sx - ux * (1 + i * 2.5) + fx * (half - 1), sy - uy * (1 + i * 2.5) + fy * (half - 1), 1, L.studs);
    if (L.sleeves) {
      // open jacket: a strip of shirt on the chest side, one pixel of lapel left in front
      const off = half - 3;
      stamp(c, tx0 + fx * off, ty0 + fy * off, tx1 + fx * off, ty1 + fy * off, 4, L.t.shirt.n[0], L.t.shirt.n[1]);
      const ex = fx * (half - 1), ey = fy * (half - 1);
      if (L.goldEdge) stamp(c, tx0 + ex, ty0 + ey, tx1 + ex + ux * 2, ty1 + ey + uy * 2, 1, L.trim);  // gold edging
      stamp(c, tx1 + ex, ty1 + ey, tx1 + ex + ux * 2, ty1 + ey + uy * 2, 2, L.trim);                  // collar
      if (L.gigbag && !lying) stamp(c, tx0 + fx * (off + 1), ty0 + fy * (off + 1), tx1 - fx * 2 + ux, ty1 - fy * 2 + uy, 1, LS.shade(L.gigbag, 0.75)); // strap
    }
    // chest logo / chain
    const lx = hx + ux * (L.torso * 0.6) + fx * (half - 3), ly = hy + uy * (L.torso * 0.6) + fy * (half - 3);
    dot(c, lx, ly, 2, L.logo); dot(c, lx - ux * 2, ly - uy * 2, 1, L.logo);
    if (!L.sleeves) dot(c, lx - fx * 3 + ux * 2, ly - fy * 3 + uy * 2, 1, L.logo);
    if (L.belt && !lying) {
      c.fillStyle = L.belt; c.fillRect(Math.round(hx - half), Math.round(hy - 2), L.torsoW, 2);
      c.fillStyle = L.buckle; c.fillRect(Math.round(hx + half - 4), Math.round(hy - 2), 2, 2);
      if (L.tape) { c.fillStyle = L.tape; c.fillRect(Math.round(hx - half - 1), Math.round(hy - 1), 3, 4); } // roll of gaffer tape
    }
    if (L.scarf) stamp(c, sx + fx * 2, sy + fy * 2, sx + fx * (3 - sway) - ux * 9, sy + fy * (3 - sway) - uy * 9, 2, L.scarf);

    // --- head ---
    const cx = sx + ux * (L.head / 2 + 1) + fx, cy = sy + uy * (L.head / 2 + 1) + fy;
    stamp(c, sx, sy, cx, cy, 3, L.t.skin.n[0], L.t.skin.n[1]); // neck
    if (lying) headLying(c, L, cx, cy, ux, uy); else headUp(c, L, cx, cy, P.hurt > 0.5, sway, blink);

    // --- guitar on its strap (in front of the torso, behind the near arm) ---
    if (L.guitar && !P.club) guitar(c, hx + fx * 4 + ux * 5, hy + fy * 4 + uy * 5, cos(P.ga), sin(P.ga), false);

    // --- near arm + held items ---
    const hand = arm(c, L, jx + fx, jy + fy, P.fs, P.fe, false);
    if (L.guitar && P.club) {
      guitar(c, hand.x, hand.y, hand.dx, hand.dy, true);
      stamp(c, hand.x, hand.y, hand.x, hand.y, L.armW + 1, L.t.skin.n[0], L.t.skin.n[1]); // hand over the neck
    }
    if (L.bag) {
      const gx = hand.x + hand.dx * 6, gy = hand.y + hand.dy * 6;
      stamp(c, hand.x, hand.y, gx, gy, 1, '#f4f4f4');
      stamp(c, gx, gy, gx + hand.dx * 2, gy + hand.dy * 2, 6, L.bag, LS.shade(L.bag, 0.6));
      dot(c, gx, gy, 2, '#d08a1a');
    }

    // --- smears, on top of everything ---
    switch (P.fx) {
      case 'punch1': case 'haymaker': streaks(c, hand.x - 3, hand.y, -1, 0); break;
      case 'punch2': streaks(c, handB.x - 3, handB.y, -1, 0); break;
      case 'upper': streaks(c, hand.x, hand.y + 3, -0.3, 0.95); break;
      case 'bag': streaks(c, hand.x + hand.dx * 8, hand.y + hand.dy * 8 - 2, -0.7, -0.7); break;
      case 'kick': case 'jumpkick': streaks(c, footF.x - 2, footF.y + 2, -0.8, 0.6); break;
      case 'swing': streaks(c, hand.x + hand.dx * 17, hand.y + hand.dy * 17 - 3, -0.6, -0.8); break;
    }
  }

  // ---------------------------------------------------------------------
  // Poses
  // ---------------------------------------------------------------------
  /* Pose fields:
       lean   torso lean (rad)          ox   horizontal offset of the hips
       fs/fe  near arm shoulder/elbow   bs/be  far arm shoulder/elbow
       ft/fk  near leg thigh/knee       bt/bk  far leg thigh/knee
       ga     guitar neck angle         club   guitar held as a weapon
       hurt   pained face               bob    vertical offset
       fx     (set at runtime) which smear to draw */
  const BASE = { lean: 0, bob: 0, ox: 0, fs: 0, fe: 0, bs: 0, be: 0, ft: 0, fk: 0, bt: 0, bk: 0, ga: -0.7, club: 0, hurt: 0 };
  const K = (o) => Object.assign({}, BASE, o);

  function mix(a, bb, t) {
    t = LS.clamp(t, 0, 1);
    const o = {};
    for (const k in BASE) o[k] = a[k] + (bb[k] - a[k]) * t;
    o.club = t > 0.3 ? bb.club : a.club; // flags don't interpolate
    o.hurt = t < 0.6 ? a.hurt : bb.hurt;
    return o;
  }

  // Shared reaction poses
  const COMMON = {
    hurt: K({ lean: -0.42, ox: -2, fs: -0.5, fe: 0.8, bs: -1.0, be: 0.5, ft: 0.4, fk: 0.4, bt: -0.3, bk: 0.2, hurt: 1 }),
    fall: K({ lean: -1.15, fs: 1.3, fe: 0.3, bs: -2.3, be: 0.2, ft: 1.25, fk: 0.3, bt: 0.9, bk: 0.5, hurt: 1 }),
    down: K({ lean: -1.5, fs: 1.45, fe: 0, bs: -1.75, be: 0, ft: 1.5, fk: 0, bt: 1.42, bk: 0.1, hurt: 1 }),
    crouch: K({ lean: 0.6, fs: 0.4, fe: 0.9, bs: 0.2, be: 1.0, ft: 1.25, fk: 2.2, bt: 0.2, bk: 1.7 }),
  };

  // Per-character key poses. Each attack has a wind-up pose and a hit pose.
  const SETS = {
    jack: {
      rate: 10, swing: 0.6,
      guard: K({ lean: 0.1, fs: 0.55, fe: 1.6, bs: -0.1, be: 1.9, ft: 0.3, fk: 0.25, bt: -0.3, bk: 0.1 }),
      // Jump: arms up and knees tucked on the way up, legs reaching for the floor on the way down.
      jump: {
        up: K({ lean: 0.05, fs: 2.3, fe: 0.8, bs: 1.9, be: 0.9, ft: 0.95, fk: 1.5, bt: 0.2, bk: 0.8 }),
        down: K({ lean: 0.1, fs: 1.4, fe: 0.9, bs: 1.0, be: 1.0, ft: 0.35, fk: 0.2, bt: -0.35, bk: 0.1 }),
      },
      // The Last Solo: arms thrown up, then both fists slammed down into a crouch.
      special: {
        raise: K({ lean: -0.3, fs: 2.9, fe: 0.2, bs: 2.7, be: 0.3, ft: 0.35, fk: 0.1, bt: -0.35, bk: 0.1 }),
        slam: K({ lean: 0.65, fs: 0.5, fe: 0.5, bs: 0.2, be: 0.7, ft: 1.15, fk: 2.0, bt: 0.1, bk: 1.6 }),
      },
      atk: {
        jumpkick: { // flying kick: one leg shoots forward, the other tucks under
          wind: K({ lean: -0.1, fs: 1.0, fe: 1.2, bs: 0.6, be: 1.3, ft: 0.8, fk: 1.4, bt: 0.1, bk: 0.9 }),
          hit: K({ lean: -0.5, fs: -0.4, fe: 1.0, bs: -1.0, be: 0.9, ft: 1.45, fk: 0.05, bt: 0.7, bk: 1.6 }),
        },
        punch1: { // jab with the lead hand
          wind: K({ lean: -0.05, fs: -0.5, fe: 1.9, bs: 0.5, be: 1.7, ft: 0.3, fk: 0.3, bt: -0.35, bk: 0.1 }),
          hit: K({ lean: 0.3, ox: 3, fs: 1.5, fe: 0.05, bs: -0.5, be: 1.6, ft: 0.45, fk: 0.35, bt: -0.45, bk: 0 }),
        },
        punch2: { // cross with the rear hand
          wind: K({ lean: 0.05, fs: 0.6, fe: 1.7, bs: -0.7, be: 1.9, ft: 0.3, fk: 0.3, bt: -0.35, bk: 0.1 }),
          hit: K({ lean: 0.38, ox: 4, fs: 0.2, fe: 1.9, bs: 1.5, be: 0.05, ft: 0.5, fk: 0.4, bt: -0.5, bk: 0 }),
        },
        upper: { // uppercut that ends the combo
          wind: K({ lean: 0.45, fs: 0.3, fe: 0.6, bs: -0.3, be: 1.6, ft: 0.7, fk: 0.9, bt: -0.3, bk: 0.3 }),
          hit: K({ lean: -0.15, ox: 3, fs: 2.5, fe: 0.5, bs: -0.6, be: 1.2, ft: 0.25, fk: 0.1, bt: -0.3, bk: 0 }),
        },
        kick: {
          wind: K({ lean: -0.15, fs: 0.2, fe: 1.5, bs: -0.6, be: 1.2, ft: 1.1, fk: 1.7, bt: -0.05, bk: 0.05 }),
          hit: K({ lean: -0.42, ox: 2, fs: -0.3, fe: 1.0, bs: -0.9, be: 0.8, ft: 1.5, fk: 0, bt: -0.1, bk: 0 }),
        },
      },
    },
    roadie: {
      rate: 7, swing: 0.45,
      guard: K({ lean: 0.18, fs: 0.4, fe: 1.3, bs: 0, be: 1.5, ft: 0.35, fk: 0.3, bt: -0.35, bk: 0.1 }),
      atk: {
        haymaker: {
          wind: K({ lean: -0.15, fs: -1.3, fe: 1.2, bs: 0.6, be: 1.4, ft: 0.4, fk: 0.35, bt: -0.4, bk: 0.1 }),
          hit: K({ lean: 0.4, ox: 4, fs: 1.45, fe: 0.1, bs: -0.6, be: 1.2, ft: 0.55, fk: 0.45, bt: -0.5, bk: 0 }),
        },
      },
    },
    groupie: {
      rate: 12, swing: 0.5,
      guard: K({ lean: 0, fs: 0.5, fe: 2.3, bs: -0.3, be: 1.2, ft: 0.2, fk: 0.1, bt: -0.2, bk: 0.05 }),
      atk: {
        bag: { // overhead handbag swing
          wind: K({ lean: -0.2, fs: 2.9, fe: 0.3, bs: -0.4, be: 1.0, ft: 0.3, fk: 0.2, bt: -0.3, bk: 0.05 }),
          hit: K({ lean: 0.3, ox: 3, fs: 1.2, fe: 0, bs: -0.8, be: 0.8, ft: 0.45, fk: 0.35, bt: -0.45, bk: 0 }),
        },
      },
    },
    punk: {
      rate: 11, swing: 0.55,
      guard: K({ lean: 0.22, fs: 0.7, fe: 1.7, bs: -0.2, be: 1.8, ft: 0.4, fk: 0.35, bt: -0.4, bk: 0.15 }),
      atk: {
        lunge: { // deep crouch (the telegraph), then a flying shoulder charge
          wind: K({ lean: 0.65, fs: -0.9, fe: 1.0, bs: -1.2, be: 0.8, ft: 1.15, fk: 2.0, bt: 0.1, bk: 1.6 }),
          hit: K({ lean: 0.75, ox: 4, fs: 1.5, fe: 0.1, bs: 1.3, be: 0.2, ft: 0.95, fk: 0.5, bt: -0.7, bk: 0 }),
        },
      },
    },
    king: {
      rate: 7, swing: 0.2,
      guard: K({ lean: -0.06, fs: 0.9, fe: 1.1, bs: 0.35, be: 1.2, ft: 0.38, fk: 0.1, bt: -0.36, bk: 0 }),
      taunt: K({ lean: -0.18, fs: 2.9, fe: 0.1, bs: 0.3, be: 1.2, ft: 0.32, fk: 0.05, bt: -0.32, bk: 0 }),
      atk: {
        swing: { // guitar smash
          wind: K({ lean: -0.25, fs: 2.8, fe: 0.25, bs: 2.4, be: 0.4, ft: 0.4, fk: 0.3, bt: -0.42, bk: 0, club: 1 }),
          hit: K({ lean: 0.45, ox: 4, fs: 1.15, fe: 0, bs: 0.9, be: 0.3, ft: 0.6, fk: 0.5, bt: -0.55, bk: 0, club: 1 }),
        },
        chord: { // power chord: wide stance, windmill arm (animated in S.pose)
          wind: K({ lean: -0.2, fs: -2.6, fe: 0.2, bs: 1.0, be: 1.2, ft: 0.7, fk: 0.4, bt: -0.6, bk: 0, ga: -1.1 }),
          hit: K({ lean: 0.15, fs: 0.6, fe: 0.9, bs: 1.0, be: 1.0, ft: 0.75, fk: 0.5, bt: -0.62, bk: 0, ga: -0.5 }),
        },
      },
    },
  };

  /* Walk cycle generated from a phase: legs swing in opposition, the knee of the leg
     travelling forward bends, and the arms counter-swing. */
  function walk(set, p) {
    const g = set.guard, sp = sin(p), cp = cos(p);
    return Object.assign({}, g, {
      lean: g.lean + 0.05,
      ft: sp * 0.62, fk: 0.15 + 0.8 * Math.max(0, cp),
      bt: -sp * 0.62, bk: 0.15 + 0.8 * Math.max(0, -cp),
      fs: g.fs - sp * set.swing, bs: g.bs + sp * set.swing,
    });
  }

  function idle(set, t) {
    const g = set.guard, breath = sin(t * 3.2);
    return Object.assign({}, g, { bob: breath > 0.2 ? 1 : 0, fe: g.fe + (breath > 0 ? 0.08 : 0), be: g.be - (breath > 0 ? 0.06 : 0) });
  }

  const STEP = Math.PI / 4; // walk cycle snapped to 8 distinct frames, like hand-drawn sprites

  /* Picks the pose for a fighter from its state machine. */
  S.pose = function (f) {
    const set = SETS[f.kind], g = set.guard;
    const t = Math.floor(f.stateT * 30) / 30; // hold each pose for two 60 Hz frames
    switch (f.state) {
      case 'attack': {
        const d = f.atk.def, k = set.atk[d.anim];
        if (d.anim === 'chord') {
          if (t < d.fire) {
            const p = mix(g, k.wind, t / 0.2);
            p.fs = -2.6 - Math.max(0, t - 0.15) * 16; // the windmill
            return p;
          }
          if (t < d.fire + 0.35) return k.hit;
          return mix(k.hit, g, (t - d.fire - 0.35) / (d.dur - d.fire - 0.35));
        }
        // guard -> wind-up -> (snap) hit -> hold -> back to guard
        const a0 = d.active[0], a1 = d.active[1], w = a0 * 0.65;
        if (t < w) return mix(g, k.wind, (t / w) * 1.5);
        if (t < a0) return mix(k.wind, k.hit, (t - w) / (a0 - w));
        const hold = a1 + (d.dur - a1) * 0.35;
        // the smear is only shown on the first frames of the hit pose
        if (t < hold) return t < a0 + 0.07 ? Object.assign({ fx: d.anim }, k.hit) : k.hit;
        return mix(k.hit, g, (t - hold) / (d.dur - hold));
      }
      case 'hurt': return mix(COMMON.hurt, g, (t - 0.15) / 0.25);
      case 'fall': return COMMON.fall;
      case 'down':
      case 'dead': return COMMON.down;
      case 'getup':
        return t < 0.18 ? mix(COMMON.down, COMMON.crouch, t / 0.18) : mix(COMMON.crouch, g, (t - 0.18) / 0.17);
      case 'jump': // blend from the "rising" to the "falling" pose as the vertical speed flips
        return mix(set.jump.up, set.jump.down, 0.5 - f.vz / 420);
      case 'special':
        if (t < 0.5) return mix(g, set.special.raise, t / 0.4);
        if (t < 0.65) return set.special.slam;
        return mix(set.special.slam, g, (t - 0.65) / 0.35);
      case 'taunt': return set.taunt || g;
      default:
        return f.moving ? walk(set, Math.floor(f.animT * set.rate / STEP) * STEP) : idle(set, f.animT);
    }
  };

  /* Secondary motion: loose hair / coat tails trail one pixel behind the movement. */
  function swayOf(f) {
    if (f.state === 'attack') return f.stateT > f.atk.def.active[0] ? 1 : -1;
    if (f.state === 'hurt') return -1;
    if (f.moving) return Math.sin(f.animT * 10) > 0 ? 1 : 0;
    return 0;
  }

  // ---------------------------------------------------------------------
  // Public drawing API
  // ---------------------------------------------------------------------
  /* Draws a fighter with its feet at (x, y) on the given context.

     Post-processing, all done with canvas compositing (no per-pixel loops):
     - OUTLINE: a solid silhouette of the sprite ('source-in') is stamped four times,
       one pixel left/right/up/down, underneath the sprite.
     - RIM LIGHT: the silhouette tinted with `light`, minus a copy of the sprite shifted
       one pixel down ('destination-out'). Only pixels with nothing above them survive,
       i.e. the top edges of head, shoulders, arms... It is drawn after mirroring, so the
       light always comes from above no matter which way the fighter faces.
     - HIT FLASH: the silhouette recoloured white, drawn instead of the sprite. */
  S.draw = function (ctx, f, x, y, light) {
    const L = LOOKS[f.kind], P = S.pose(f);
    b.clearRect(0, 0, BW, BH);
    b.save();
    b.translate(OX, OY);
    if (f.facing < 0) b.scale(-1, 1);
    drawBody(b, L, P, swayOf(f), (f.animT % 3.4) < 0.12);
    b.restore();

    s.globalCompositeOperation = 'copy';
    s.drawImage(buf, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = OUTLINE;
    s.fillRect(0, 0, BW, BH);

    const dx = Math.round(x) - OX, dy = Math.round(y) - OY;
    ctx.drawImage(sil, dx - 1, dy);
    ctx.drawImage(sil, dx + 1, dy);
    ctx.drawImage(sil, dx, dy - 1);
    ctx.drawImage(sil, dx, dy + 1);
    if (f.flash > 0) {
      s.fillStyle = '#ffffff';
      s.fillRect(0, 0, BW, BH);
      ctx.drawImage(sil, dx, dy);
      return;
    }
    ctx.drawImage(buf, dx, dy);

    r.globalCompositeOperation = 'copy';
    r.drawImage(buf, 0, 0);
    r.globalCompositeOperation = 'source-in';
    r.fillStyle = light || '#ffe0f0';
    r.fillRect(0, 0, BW, BH);
    r.globalCompositeOperation = 'destination-out';
    r.drawImage(buf, 0, 1);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(rim, dx, dy);
    ctx.globalAlpha = 1;
  };

  /* Just the head, for HUD portraits. */
  S.head = function (ctx, kind, cx, cy) { headUp(ctx, LOOKS[kind], cx, cy, false, 0, false); };

  /* Soft pixel shadow on the floor; shrinks as the fighter leaves the ground. */
  S.shadow = function (ctx, x, y, z, wide) {
    const w = Math.max(6, (wide || 12) - z * 0.12) | 0;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(Math.round(x) - w, Math.round(y) - 1, w * 2, 3);
    ctx.fillRect(Math.round(x) - w + 3, Math.round(y) - 2, w * 2 - 6, 5);
  };
})();
