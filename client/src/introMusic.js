// Original 6-second chiptune jingle for the intro, synthesized live with Web Audio (no audio files).
// Timeline matches the intro animation: falling whistle -> landing "boing" -> one note per letter
// of "Blob" -> short melody -> final chord that fades out with the screen.

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12); // MIDI number -> Hz
const N = { G2: 43, A2: 45, C3: 48, D3: 50, F3: 53, G3: 55, C4: 60, E4: 64, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88, G6: 91, C7: 96 };

function pulseWave(ctx, duty) {
  // Fourier series of a pulse wave (the classic NES / Game Boy square channel sound).
  const n = 48;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  for (let k = 1; k < n; k++) imag[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
  return ctx.createPeriodicWave(real, imag);
}

export function playIntroMusic(volume = 0.6) {
  let ctx;
  try { ctx = new AudioContext(); } catch { return () => {}; }
  ctx.resume().catch(() => {});
  const t0 = ctx.currentTime + 0.05;
  const master = ctx.createGain();
  master.gain.value = 0.22 * volume;
  // A touch of echo makes it feel bigger without losing the 8-bit character.
  const delay = ctx.createDelay();
  delay.delayTime.value = 0.15;
  const fb = ctx.createGain();
  fb.gain.value = 0.25;
  delay.connect(fb).connect(delay);
  delay.connect(master);
  master.connect(ctx.destination);

  const duty12 = pulseWave(ctx, 0.125);
  const duty25 = pulseWave(ctx, 0.25);
  const duty50 = pulseWave(ctx, 0.5);

  // One note: wave, pitch (Hz), start (s from intro start), length, volume, optional pitch slide target.
  function tone({ wave = duty25, f, at, len, vol = 0.5, slideTo, type, echo = true, attack = 0.005, release = 0.06 }) {
    const o = ctx.createOscillator();
    if (type) o.type = type; else o.setPeriodicWave(wave);
    const g = ctx.createGain();
    const s = t0 + at;
    o.frequency.setValueAtTime(f, s);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, s + len);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(vol, s + attack);
    g.gain.setValueAtTime(vol, s + Math.max(attack, len - release));
    g.gain.linearRampToValueAtTime(0, s + len);
    o.connect(g).connect(master);
    if (echo) g.connect(delay);
    o.start(s);
    o.stop(s + len + 0.02);
  }
  function noise({ at, len, vol = 0.3, from = 4000, to = 300 }) {
    const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * len), ctx.sampleRate);
    const d = buf.getChannelData(0);
    // "Stepped" noise like the NES noise channel.
    let v = 0;
    for (let i = 0; i < d.length; i++) { if (i % 6 === 0) v = Math.random() * 2 - 1; d[i] = v; }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const flt = ctx.createBiquadFilter();
    flt.type = 'lowpass';
    const s = t0 + at;
    flt.frequency.setValueAtTime(from, s);
    flt.frequency.exponentialRampToValueAtTime(to, s + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, s);
    g.gain.exponentialRampToValueAtTime(0.001, s + len);
    src.connect(flt).connect(g).connect(master);
    src.start(s);
  }

  // 0.30–1.29 s: the slime falls (descending whistle).
  tone({ wave: duty50, f: 1800, slideTo: 260, at: 0.3, len: 0.95, vol: 0.45, release: 0.05, echo: false });
  // 1.29 s: SPLAT on the ground + squishy "boing".
  noise({ at: 1.29, len: 0.22, vol: 0.45, from: 3000, to: 200 });
  tone({ type: 'triangle', f: 160, slideTo: 55, at: 1.29, len: 0.25, vol: 0.9, echo: false });
  tone({ wave: duty12, f: 220, slideTo: 660, at: 1.33, len: 0.22, vol: 0.3 });
  // 1.56 s: small hop, 1.83 s: soft second landing.
  tone({ wave: duty12, f: 440, slideTo: 880, at: 1.5, len: 0.12, vol: 0.18 });
  tone({ type: 'triangle', f: 120, slideTo: 60, at: 1.83, len: 0.12, vol: 0.6, echo: false });

  // 1.9 s onward: one bright note per letter of "Blob".
  [N.C5, N.E5, N.G5, N.C6].forEach((n, i) => tone({ wave: duty25, f: NOTE(n), at: 2.05 + i * 0.18, len: 0.16, vol: 0.65 }));

  // 2.9–5.0 s: little melody (lead = 12.5% pulse, bass = triangle, arpeggio = 50% pulse).
  const beat = 0.15;
  const lead = [
    [N.G5, 1], [N.E5, 1], [N.G5, 1], [N.C6, 2], [N.B5, 1], [N.G5, 1], [N.A5, 1],
    [N.B5, 2], [N.D6, 2], [N.C6, 1], [N.E6, 3],
  ];
  let t = 2.9;
  for (const [n, b] of lead) { tone({ wave: duty12, f: NOTE(n), at: t, len: b * beat * 0.95, vol: 0.38 }); t += b * beat; }
  const bass = [[N.C3, 4], [N.A2, 4], [N.F3, 3], [N.G2, 3]];
  t = 2.9;
  for (const [n, b] of bass) {
    for (let k = 0; k < b; k++) tone({ type: 'triangle', f: NOTE(n), at: t + k * beat, len: beat * 0.8, vol: 0.55, echo: false, release: 0.03 });
    t += b * beat;
  }
  // Fast "chord" arpeggios, the classic chiptune trick.
  const chords = [[N.C4, N.E4, N.G4], [N.A4 - 12, N.C4, N.E4], [N.F3 + 12, N.A4 - 12, N.C4], [N.G3, N.B4 - 12, N.D5 - 12]];
  chords.forEach((ch, ci) => {
    const start = 2.9 + [0, 4, 8, 11][ci] * beat;
    const len = [4, 4, 3, 3][ci] * beat;
    for (let k = 0; k * 0.05 < len; k++) tone({ wave: duty50, f: NOTE(ch[k % 3] + 12), at: start + k * 0.05, len: 0.045, vol: 0.12, echo: false, release: 0.01 });
  });

  // 5.0 s: final C-major chord with sparkles, fading out with the screen.
  const end = 5.0;
  [N.C5, N.E5, N.G5, N.C6].forEach((n) => tone({ wave: duty25, f: NOTE(n), at: end, len: 1.0, vol: 0.18, release: 0.9 }));
  tone({ type: 'triangle', f: NOTE(N.C3), at: end, len: 1.0, vol: 0.6, release: 0.9, echo: false });
  [N.C7, N.G6, N.E6, N.C7].forEach((n, i) => tone({ wave: duty12, f: NOTE(n), at: end + 0.08 + i * 0.09, len: 0.07, vol: 0.12 }));

  let stopped = false;
  const closeTimer = setTimeout(() => ctx.close().catch(() => {}), 7000);
  return () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(closeTimer);
    // Quick fade instead of a hard cut when the intro is skipped.
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.25);
    setTimeout(() => ctx.close().catch(() => {}), 400);
  };
}
