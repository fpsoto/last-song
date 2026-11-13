/* audio.js - every sound is synthesised with the Web Audio API (no audio files).
   Includes one-shot SFX and a tiny step sequencer for the original chiptune loops. */
(function () {
  'use strict';
  const LS = window.LS;
  const A = (LS.Audio = { muted: false });

  let ctx = null, master = null, sfxBus = null, musicBus = null, distBus = null, noiseBuf = null;
  let song = null, step = 0, nextTime = 0;

  /* Create the audio graph on the first user gesture. */
  A.unlock = function () {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch (e) { ctx = null; return; }

    master = ctx.createGain();
    master.gain.value = A.muted ? 0 : 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);

    // Distortion bus for "guitar" sounds.
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = (i / 128 - 1) * 6; curve[i] = Math.tanh(x); }
    shaper.curve = curve;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const dg = ctx.createGain(); dg.gain.value = 0.22;
    distBus = ctx.createGain(); distBus.gain.value = 0.5;
    distBus.connect(shaper); shaper.connect(lp); lp.connect(dg); dg.connect(sfxBus);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  };

  function label() {
    const b = document.getElementById('mute');
    if (!b) return;
    b.textContent = A.muted ? 'SOUND OFF' : 'SOUND ON';
    b.classList.toggle('off', A.muted);
  }

  A.toggleMute = function () {
    A.muted = !A.muted;
    if (master) master.gain.setTargetAtTime(A.muted ? 0 : 0.8, ctx.currentTime, 0.02);
    label();
  };

  /* Lower the music while paused. */
  A.duck = function (on) {
    if (musicBus) musicBus.gain.setTargetAtTime(on ? 0.12 : 0.5, ctx.currentTime, 0.05);
  };

  // --- primitive voices -------------------------------------------------
  function tone(type, f0, f1, dur, vol, at, dest) {
    const t = at || ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol, ftype, freq, at, dest) {
    const t = at || ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }

  function chord(root, dur, at) {
    [1, 1.498, 2, 2.01].forEach((m) => tone('sawtooth', root * m, root * m * 0.985, dur, 0.5, at, distBus));
  }

  // --- sound effects ----------------------------------------------------
  const SFX = {
    whoosh() { noise(0.09, 0.14, 'bandpass', 1500); },
    hit() { noise(0.07, 0.4, 'lowpass', 2600); tone('square', 230, 70, 0.09, 0.22); },
    heavy() { noise(0.17, 0.55, 'lowpass', 1500); tone('sine', 160, 40, 0.24, 0.7); tone('square', 320, 60, 0.12, 0.18); },
    hurt() { tone('sawtooth', 340, 110, 0.18, 0.22); noise(0.06, 0.25, 'lowpass', 1800); },
    ko() { tone('square', 520, 60, 0.42, 0.2); noise(0.2, 0.2, 'lowpass', 900); },
    thud() { tone('sine', 95, 35, 0.16, 0.6); noise(0.05, 0.2, 'lowpass', 600); },
    select() { tone('square', 660, 660, 0.05, 0.14); },
    confirm() { const t = ctx.currentTime; [659, 784, 988, 1319].forEach((f, i) => tone('square', f, f, 0.09, 0.14, t + i * 0.06)); },
    pause() { const t = ctx.currentTime; tone('square', 880, 880, 0.07, 0.14, t); tone('square', 587, 587, 0.1, 0.14, t + 0.08); },
    go() { const t = ctx.currentTime; tone('square', 784, 784, 0.07, 0.14, t); tone('square', 1175, 1175, 0.12, 0.14, t + 0.08); },
    type() { tone('square', 1200, 1200, 0.015, 0.04); },
    jump() { tone('square', 240, 520, 0.12, 0.12); },
    pickup() { const t = ctx.currentTime; [660, 880, 1320].forEach((f, i) => tone('square', f, f, 0.07, 0.13, t + i * 0.05)); },
    ready() { const t = ctx.currentTime; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('square', f, f, 0.1, 0.13, t + i * 0.06)); tone('sawtooth', 261, 523, 0.4, 0.1); },
    smash() { noise(0.22, 0.5, 'bandpass', 900); tone('square', 190, 55, 0.14, 0.25); noise(0.1, 0.3, 'highpass', 3000); },
    clang() { noise(0.18, 0.4, 'bandpass', 2400); tone('triangle', 880, 300, 0.3, 0.25); tone('square', 140, 50, 0.12, 0.22); },
    blast() { chord(82.4, 0.9); noise(0.5, 0.5, 'lowpass', 1800); tone('sine', 110, 28, 0.6, 0.8); tone('sawtooth', 1200, 200, 0.4, 0.12); },
    warning() { const t = ctx.currentTime; for (let i = 0; i < 6; i++) tone('sawtooth', i % 2 ? 196 : 262, 0, 0.2, 0.2, t + i * 0.24); },
    bossIn() { chord(82.4, 1.6); noise(0.5, 0.3, 'lowpass', 500); tone('sine', 70, 30, 0.8, 0.7); },
    charge() { tone('sawtooth', 110, 660, 0.8, 0.16, 0, distBus); },
    riff() { chord(110, 0.7); noise(0.3, 0.35, 'highpass', 1200); },
    victory() {
      const t = ctx.currentTime;
      [[659, 0], [659, 0.14], [659, 0.28], [784, 0.42], [988, 0.62], [880, 0.86], [988, 1.0], [1319, 1.2]]
        .forEach(([f, d]) => tone('square', f, f, d > 1.1 ? 0.7 : 0.16, 0.15, t + d));
      chord(164.8, 1.4, t + 1.2);
    },
    defeat() {
      const t = ctx.currentTime;
      [392, 370, 330, 294, 247, 165].forEach((f, i) => tone('triangle', f, f * 0.97, i === 5 ? 0.9 : 0.26, 0.3, t + i * 0.24));
    },
  };

  A.sfx = function (name) {
    if (!ctx || ctx.state !== 'running' || !SFX[name]) return;
    try { SFX[name](); } catch (e) { /* never let a sound break the game */ }
  };

  // --- music sequencer --------------------------------------------------
  /* song = { bpm, root (Hz), bass:[semitones|null], lead:[...], kick:'x...', snare, hat } */
  A.playMusic = function (s) {
    song = s || null;
    step = 0;
    nextTime = ctx ? ctx.currentTime + 0.08 : 0;
    A.duck(false);
  };
  A.stopMusic = function () { song = null; };

  const semi = (root, n) => root * Math.pow(2, n / 12);

  function scheduleStep(i, t, d) {
    const s = song;
    const b = s.bass[i % s.bass.length];
    if (b !== null && b !== undefined) tone('square', semi(s.root, b), 0, d * 0.95, 0.11, t, musicBus);
    const l = s.lead[i % s.lead.length];
    if (l !== null && l !== undefined) {
      tone('sawtooth', semi(s.root * 4, l), 0, d * 1.8, 0.06, t, musicBus);
      tone('square', semi(s.root * 4, l) * 1.005, 0, d * 1.8, 0.035, t, musicBus);
    }
    const k = i % 16;
    if (s.kick[k] === 'x') tone('sine', 150, 45, 0.12, 0.55, t, musicBus);
    if (s.snare[k] === 'x') { noise(0.11, 0.22, 'highpass', 1400, t, musicBus); tone('triangle', 210, 120, 0.07, 0.2, t, musicBus); }
    if (s.hat[k] === 'x') noise(0.03, 0.07, 'highpass', 7000, t, musicBus);
  }

  /* Called every frame: schedules the notes that fall inside a short look-ahead window. */
  A.update = function () {
    if (!ctx || !song || ctx.state !== 'running') return;
    const d = 60 / song.bpm / 4; // one 16th note
    if (nextTime < ctx.currentTime - 0.2) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.12) {
      try { scheduleStep(step, nextTime, d); } catch (e) { /* ignore */ }
      nextTime += d;
      step++;
    }
  };
})();
