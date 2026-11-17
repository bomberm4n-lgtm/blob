// 6-second 8-bit "title screen" intro, drawn on a low-resolution canvas so every pixel is a real big pixel.
// Timeline is synced with introMusic.js: CRT turn-on -> slime falls (whistle) -> impact at 1.29s (splat) ->
// B-L-O-B letters drop on each note -> melody with hops and sparkles -> flash + iris wipe into the app.
import { useEffect, useRef } from 'react';
import { playIntroMusic } from './introMusic';
import { voice } from './voice';

export const INTRO_MS = 6000;

const SLIME = [
  '.....oooooo.....',
  '...oobbbbbboo...',
  '..obbbbbbhhhbo..',
  '.obbbbbbbbhhbbo.',
  '.obbbbbbbbbbbbo.',
  'obbbbbbbbbbbbbbo',
  'obbbebbbbbbebbbo',
  'obbbebbbbbbebbbo',
  'obbbbbbbbbbbbbso',
  'obbbbbbbbbbbbsso',
  'osbbbbbbbbbbssso',
  '.osssssssssssso.',
  '..oooooooooooo..',
];
const SLIME_COLORS = { o: '#1b4a5e', b: '#8ed8f5', s: '#5cb6df', h: '#e6f8ff', e: '#1b4a5e' };

const BIG = {
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};
const SMALL = {
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'], O: ['###', '#.#', '#.#', '#.#', '###'], I: ['###', '.#.', '.#.', '.#.', '###'],
  C: ['###', '#..', '#..', '#..', '###'], E: ['###', '#..', '##.', '#..', '###'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'], T: ['###', '.#.', '.#.', '.#.', '.#.'], S: ['###', '#..', '###', '..#', '###'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'], N: ['#.#', '###', '###', '###', '#.#'], '·': ['...', '...', '.#.', '...', '...'],
  ' ': ['...', '...', '...', '...', '...'],
};
const TAGLINE = 'VOICE · CHAT · SCREEN SHARE';

const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const easeOutBack = (x) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2;
const easeInQuad = (x) => x * x;

// Small deterministic random so the scene looks the same every time.
function rng(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

function sprite(grid, colors, blink = false) {
  const c = document.createElement('canvas');
  c.width = grid[0].length; c.height = grid.length;
  const x = c.getContext('2d');
  grid.forEach((row, y) => [...row].forEach((ch, i) => {
    let col = colors[ch];
    if (blink && ch === 'e') col = y === 7 ? colors.e : colors.b;
    if (col) { x.fillStyle = col; x.fillRect(i, y, 1, 1); }
  }));
  return c;
}

export default function Intro({ onDone }) {
  const ref = useRef();
  const doneRef = useRef(false);

  useEffect(() => playIntroMusic(voice.settings.soundVolume ?? 0.6), []);

  useEffect(() => {
    const cv = ref.current;
    const ctx = cv.getContext('2d');
    const H = 120;
    let W = 213;
    const resize = () => { W = Math.max(100, Math.round((H * window.innerWidth) / window.innerHeight)); cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false; };
    resize();
    window.addEventListener('resize', resize);

    const slime = sprite(SLIME, SLIME_COLORS);
    const slimeBlink = sprite(SLIME, SLIME_COLORS, true);
    const r = rng(7);
    const stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.62, p: r() * 6.28, s: r() < 0.15 ? 2 : 1 }));
    const parts = Array.from({ length: 28 }, (_, i) => { const a = Math.PI + (i / 27) * Math.PI + (r() - 0.5) * 0.3; const sp = 30 + r() * 60; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, c: ['#8ed8f5', '#e6f8ff', '#5cb6df', '#ffffff'][i % 4], s: r() < 0.3 ? 2 : 1 }; });
    const sparkles = Array.from({ length: 22 }, () => ({ x: r(), y: r(), t0: 2.9 + r() * 2.2, life: 0.4 + r() * 0.5 }));

    const px = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
    const glyph = (g, x, y, scale, fill, outline) => {
      const rows = g.length, cols = g[0].length;
      const on = (yy, xx) => g[yy]?.[xx] === '#';
      if (outline) for (let gy = -1; gy <= rows; gy++) for (let gx = -1; gx <= cols; gx++) {
        if (on(gy, gx)) continue;
        if ([[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]].some(([a, b]) => on(gy + a, gx + b))) px(x + gx * scale, y + gy * scale, scale, scale, outline);
      }
      g.forEach((row, gy) => [...row].forEach((ch, gx) => { if (ch === '#') px(x + gx * scale, y + gy * scale, scale, scale, typeof fill === 'function' ? fill(gx, gy, rows) : fill); }));
    };

    const start = performance.now();
    let raf;
    const frame = (now) => {
      const t = (now - start) / 1000;
      const groundY = Math.round(H * 0.7);
      const cx = Math.round(W / 2);

      // Screen shake after the impact.
      const shakeT = t - 1.29;
      const shake = shakeT > 0 && shakeT < 0.45 ? (1 - shakeT / 0.45) * 3 : 0;
      ctx.setTransform(1, 0, 0, 1, Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Sky: dithered bands from deep navy to teal.
      const bands = ['#070b18', '#0a1124', '#0d1730', '#10203d', '#13294a', '#173458', '#1b4064'];
      bands.forEach((col, i) => px(-4, (i * groundY) / bands.length - 4, W + 8, groundY / bands.length + 8, col));
      for (let i = 1; i < bands.length; i++) { const y = Math.round((i * groundY) / bands.length); for (let x = (i % 2) - 4; x < W + 4; x += 2) px(x, y - 1, 1, 1, bands[i]); }

      // Twinkling stars.
      stars.forEach((s) => { const a = 0.5 + 0.5 * Math.sin(t * 3 + s.p); if (a > 0.25) { ctx.globalAlpha = a; px(s.x * W, s.y * H, s.s, s.s, s.s > 1 ? '#fff6c2' : '#ffffff'); } });
      ctx.globalAlpha = 1;
      // Pixel moon.
      const mx = W - 34, my = 14;
      for (let y = -7; y <= 7; y++) for (let x = -7; x <= 7; x++) if (x * x + y * y <= 49) px(mx + x, my + y, 1, 1, (x + 3) ** 2 + (y - 2) ** 2 <= 9 ? '#d9e3f0' : '#f4f7ff');

      // Parallax hills.
      const hill = (off, amp, base, col, speed) => { for (let x = -4; x < W + 4; x++) { const hgt = Math.round(base + amp * Math.sin((x + t * speed + off) / 17) + amp * 0.5 * Math.sin((x + t * speed + off) / 7)); px(x, groundY - hgt, 1, hgt + 1, col); } };
      hill(0, 6, 22, '#16324c', 4);
      hill(90, 5, 12, '#1d4766', 9);

      // Ground: grass tiles + dirt.
      for (let x = -4; x < W + 4; x += 8) { px(x, groundY, 8, 3, '#3ecf8e'); px(x + 2, groundY + 1, 2, 1, '#7fe8b8'); px(x, groundY + 3, 8, H - groundY, '#2a1c14'); px(x + 4, groundY + 7, 2, 2, '#3b2a1e'); px(x + 1, groundY + 12, 2, 2, '#3b2a1e'); }

      // Slime: fall (0.3-1.29), impact squash, small bounce, then hops on the beat.
      const sw = 16 * 2, sh = 13 * 2;
      let y = groundY - sh, scX = 1, scY = 1;
      if (t < 0.3) y = -60;
      else if (t < 1.29) y = -sh + groundY * easeInQuad((t - 0.3) / 0.99);
      else if (t < 1.5) { const k = (t - 1.29) / 0.21; scX = 1.4 - 0.4 * k; scY = 0.6 + 0.4 * k; }
      else if (t < 1.83) { const k = (t - 1.5) / 0.33; y -= Math.sin(k * Math.PI) * 12; scX = 0.92 + 0.08 * k; scY = 1.1 - 0.1 * k; }
      else if (t < 1.95) { const k = (t - 1.83) / 0.12; scX = 1.15 - 0.15 * k; scY = 0.85 + 0.15 * k; }
      else if (t > 2.9 && t < 5) { const ph = ((t - 2.9) % 0.6) / 0.6; y -= Math.max(0, Math.sin(ph * Math.PI)) * 5; const sq = ph < 0.12 ? 1 - ph / 0.12 : 0; scX = 1 + 0.12 * sq; scY = 1 - 0.12 * sq; }
      // Afterimage trail while falling.
      if (t > 0.3 && t < 1.29) for (let k = 3; k >= 1; k--) { const tt = t - k * 0.04; if (tt < 0.3) continue; const yy = -sh + groundY * easeInQuad((tt - 0.3) / 0.99); ctx.globalAlpha = 0.18 * (4 - k); ctx.drawImage(slime, cx - sw / 2, Math.round(yy), sw, sh); }
      ctx.globalAlpha = 1;
      const blink = (t > 2.55 && t < 2.68) || (t > 4.25 && t < 4.38);
      const dw = Math.round(sw * scX), dh = Math.round(sh * scY);
      ctx.globalAlpha = 0.35; px(cx - Math.round(dw * 0.4), groundY - 1, Math.round(dw * 0.8), 2, '#000'); ctx.globalAlpha = 1;
      if (t >= 0.3) ctx.drawImage(blink ? slimeBlink : slime, cx - Math.round(dw / 2), Math.round(y + sh - dh), dw, dh);

      // Impact: shockwave ring + pixel dust.
      if (shakeT > 0 && shakeT < 0.5) {
        const rad = 4 + shakeT * 90; ctx.globalAlpha = 1 - shakeT / 0.5;
        for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI; px(cx + Math.cos(an) * rad, groundY - Math.sin(an) * rad * 0.35, 1, 1, '#e6f8ff'); px(cx - Math.cos(an) * rad, groundY - Math.sin(an) * rad * 0.35, 1, 1, '#e6f8ff'); }
        ctx.globalAlpha = 1;
      }
      if (shakeT > 0 && shakeT < 0.9) parts.forEach((p) => { const k = shakeT; ctx.globalAlpha = 1 - k / 0.9; px(cx + p.vx * k, groundY - 2 + p.vy * k + 120 * k * k, p.s, p.s, p.c); });
      ctx.globalAlpha = 1;

      // Logo letters drop in on each note.
      const scale = W >= 150 ? 4 : 3, word = ['B', 'L', 'O', 'B'], step = 5 * scale + 2 * scale;
      const totalW = word.length * step - 2 * scale;
      const lx0 = Math.round(cx - totalW / 2), ly = Math.round(H * 0.08);
      const flash = t > 5 && t < 5.12;
      const shine = t > 2.95 && t < 3.55 ? (t - 2.95) / 0.6 : t > 4.4 && t < 5 ? (t - 4.4) / 0.6 : -1;
      word.forEach((ch, i) => {
        const t0 = 2.02 + i * 0.18;
        if (t < t0) return;
        const k = clamp((t - t0) / 0.38);
        const yy = ly - (1 - easeOutBack(k)) * 40;
        const x = lx0 + i * step;
        glyph(BIG[ch], x, yy, scale, flash ? '#ffffff' : (gx, gy, rows) => {
          const d = shine >= 0 ? Math.abs((x + gx * scale - lx0) / totalW - (shine * 1.6 - 0.3) + gy * 0.04) : 1;
          if (d < 0.07) return '#ffffff';
          return gy < rows * 0.35 ? '#e6f8ff' : gy < rows * 0.7 ? '#8ed8f5' : '#5cb6df';
        }, '#0b1a2a');
      });

      // Tagline typed out, with a blinking cursor.
      if (t > 2.9) {
        const n = Math.min(TAGLINE.length, Math.floor((t - 2.9) / 0.045));
        const cw = 4, tw = TAGLINE.length * cw;
        const tx = Math.round(cx - tw / 2), ty = Math.round(ly + 7 * scale + 6);
        for (let i = 0; i < n; i++) glyph(SMALL[TAGLINE[i]] || SMALL[' '], tx + i * cw, ty, 1, '#3ecf8e', null);
        if (Math.floor(t * 4) % 2 === 0) px(tx + n * cw, ty, 3, 5, '#3ecf8e');
      }

      // Sparkles around the logo during the melody.
      sparkles.forEach((sp) => {
        const k = (t - sp.t0) / sp.life;
        if (k < 0 || k > 1) return;
        const sxp = Math.round(cx - totalW / 2 - 12 + sp.x * (totalW + 24)), syp = Math.round(ly - 8 + sp.y * (7 * scale + 30));
        const arm = k < 0.5 ? 1 + Math.round(k * 4) : 3 - Math.round((k - 0.5) * 4);
        ctx.globalAlpha = 1 - Math.abs(k - 0.5);
        px(sxp, syp, 1, 1, '#fff6c2');
        for (let a = 1; a <= arm; a++) { px(sxp + a, syp, 1, 1, '#ffd23f'); px(sxp - a, syp, 1, 1, '#ffd23f'); px(sxp, syp + a, 1, 1, '#ffd23f'); px(sxp, syp - a, 1, 1, '#ffd23f'); }
      });
      ctx.globalAlpha = 1;

      // Scanlines for the CRT feel.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.12;
      for (let yy = 0; yy < H; yy += 2) px(0, yy, W, 1, '#000');
      ctx.globalAlpha = 1;

      // CRT turn-on: everything starts as a thin white line that opens up.
      if (t < 0.35) {
        const k = clamp(t / 0.35);
        const open = Math.round((H * easeInQuad(k)) / 2);
        px(0, 0, W, H / 2 - open, '#000'); px(0, H / 2 + open, W, H / 2 - open + 1, '#000');
        ctx.globalAlpha = 1 - k; px(0, H / 2 - Math.max(1, open), W, Math.max(2, open * 2), '#ffffff'); ctx.globalAlpha = 1;
      }

      // Iris wipe: a pixel circle opens from the slime and reveals the app underneath.
      if (t > 5.15) {
        const k = clamp((t - 5.15) / 0.8);
        const rad = easeInQuad(k) * Math.hypot(W, H);
        const icx = cx, icy = groundY - sh / 2;
        ctx.globalCompositeOperation = 'destination-out';
        for (let yy = Math.max(0, Math.floor(icy - rad)); yy < Math.min(H, Math.ceil(icy + rad)); yy++) {
          const half = Math.sqrt(Math.max(0, rad * rad - (yy + 0.5 - icy) ** 2));
          px(icx - half, yy, Math.round(half * 2), 1, '#000');
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      if (t * 1000 >= INTRO_MS) { if (!doneRef.current) { doneRef.current = true; onDone(); } return; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [onDone]);

  const skip = () => { if (!doneRef.current) { doneRef.current = true; onDone(); } };
  return (
    <div className="intro intro-pixel" onClick={skip} title="Click to skip">
      <canvas ref={ref} className="intro-canvas" />
    </div>
  );
}
