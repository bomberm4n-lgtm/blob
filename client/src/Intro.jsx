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
// Saturated color themes; one is picked at random each time the intro plays. The logo follows the same colors.
const PALETTES = [
  { o: '#0b3a5c', b: '#4fc8ff', s: '#1f9ee8', h: '#dff6ff', e: '#0b3a5c', logoEdge: '#061a2c' }, // blue
  { o: '#5c0b14', b: '#ff4d5e', s: '#d6203a', h: '#ffd6db', e: '#5c0b14', logoEdge: '#2a0509' }, // red
  { o: '#5c470b', b: '#ffd93d', s: '#f0a800', h: '#fff7c8', e: '#5c470b', logoEdge: '#2a2005' }, // yellow
  { o: '#0b5c2e', b: '#3dff8a', s: '#12c25c', h: '#d6ffe6', e: '#0b5c2e', logoEdge: '#05291a' }, // green
];

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
    const H = 285; // higher internal resolution = smaller, crisper characters on a full-screen scene
    let W = 213;
    const resize = () => { W = Math.max(220, Math.round((H * window.innerWidth) / window.innerHeight)); cv.width = W; cv.height = H; ctx.imageSmoothingEnabled = false; };
    resize();
    window.addEventListener('resize', resize);

    const P = PALETTES[Math.floor(Math.random() * PALETTES.length)];
    const slime = sprite(SLIME, P);
    const slimeBlink = sprite(SLIME, P, true);
    // Soft glow sprite (radial, pre-rendered once) used to make the slime luminous.
    const glowSpr = document.createElement('canvas');
    glowSpr.width = glowSpr.height = 64;
    { const g = glowSpr.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, P.b + 'cc'); grd.addColorStop(0.45, P.b + '55'); grd.addColorStop(1, P.b + '00'); g.fillStyle = grd; g.fillRect(0, 0, 64, 64); }
    const r = rng(7);
    const stars = Array.from({ length: 260 }, () => ({ x: r(), y: r() * 0.62, p: r() * 6.28, s: r() < 0.15 ? 2 : 1 }));
    const parts = Array.from({ length: 28 }, (_, i) => { const a = Math.PI + (i / 27) * Math.PI + (r() - 0.5) * 0.3; const sp = 30 + r() * 60; return { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 10, c: null, ci: i % 4, s: r() < 0.3 ? 2 : 1 }; });
    const sparkles = Array.from({ length: 26 }, () => ({ x: r(), y: r(), t0: 2.9 + r() * 2.2, life: 0.4 + r() * 0.5 }));

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

    // Plain full moon at ~70% opacity with thin clouds drifting in front, so it feels behind the clouds.
    const drawMoon = (mx, my, R, t) => {
      for (let y = -R - 5; y <= R + 5; y++) for (let x = -R - 5; x <= R + 5; x++) {
        const d = Math.hypot(x, y);
        if (d > R && d <= R + 5 && (x + y) % 2 === 0) { ctx.globalAlpha = 0.12 * (1 - (d - R) / 5); px(mx + x, my + y, 1, 1, '#dfe8ff'); }
      }
      ctx.globalAlpha = 0.7;
      for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R) continue;
        const u = x / R, v = y / R;
        let col = u + v > 0.8 ? '#b9c2d6' : u + v < -0.9 ? '#ffffff' : '#e4eaf6';
        for (const [cu, cv, cr] of [[-0.35, -0.4, 0.2], [0.3, -0.5, 0.12], [0.45, 0.2, 0.17], [-0.5, 0.35, 0.12], [0.05, 0.55, 0.1], [-0.05, -0.05, 0.08]])
          if ((u - cu) ** 2 + (v - cv) ** 2 < cr * cr) col = (u - cu) + (v - cv) < 0 ? '#c3cbdc' : '#d3dae8';
        px(mx + x, my + y, 1, 1, col);
      }
      // Clouds passing in front of the moon.
      for (const [dy, len, speed, off, alpha] of [[-8, 70, 6, 0, 0.55], [6, 54, 9, 40, 0.45], [16, 80, 4, 90, 0.35]]) {
        const cx0 = ((t * speed + off) % (2 * R + len + 40)) - R - len - 20 + mx;
        ctx.globalAlpha = alpha;
        for (let i = 0; i < len; i++) {
          const thick = Math.round(2 + 2 * Math.sin((i / len) * Math.PI) + Math.sin(i / 3));
          px(cx0 + i, my + dy - thick / 2, 1, thick, '#2a2c4a');
        }
      }
      ctx.globalAlpha = 1;
    };

    const start = performance.now();
    let raf;
    const frame = (now) => {
      const t = (now - start) / 1000;
      const groundY = Math.round(H * 0.73);
      const cx = Math.round(W / 2);

      // Screen shake after the impact.
      const shakeT = t - 1.29;
      const shake = shakeT > 0 && shakeT < 0.45 ? (1 - shakeT / 0.45) * 3 : 0;
      ctx.setTransform(1, 0, 0, 1, Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;

      // Sky: dithered bands from deep navy to teal.
      const bands = ['#05060f', '#080a18', '#0c0e21', '#10132b', '#151834', '#1b1c3c', '#221f42'];
      bands.forEach((col, i) => px(-4, (i * groundY) / bands.length - 4, W + 8, groundY / bands.length + 8, col));
      for (let i = 1; i < bands.length; i++) { const y = Math.round((i * groundY) / bands.length); for (let x = (i % 2) - 4; x < W + 4; x += 2) px(x, y - 1, 1, 1, bands[i]); }

      // Twinkling stars.
      stars.forEach((s) => { const a = 0.5 + 0.5 * Math.sin(t * 3 + s.p); if (a > 0.25) { ctx.globalAlpha = a; px(s.x * W, s.y * H, s.s, s.s, s.s > 1 ? '#fff6c2' : '#ffffff'); } });
      ctx.globalAlpha = 1;
      // Creepy monster moon: glowing angry eyes, furrowed brows, jagged grin, craters, orange aura.
      drawMoon(W - 70, 52 + Math.round(Math.sin(t * 1.3) * 1.5), 27, t);

      // Parallax hills.
      const hill = (off, amp, base, col, speed) => { for (let x = -4; x < W + 4; x++) { const hgt = Math.round(base + amp * Math.sin((x + t * speed + off) / 17) + amp * 0.5 * Math.sin((x + t * speed + off) / 7)); px(x, groundY - hgt, 1, hgt + 1, col); } };
      hill(0, 13, 48, '#14142b', 4);
      hill(90, 10, 26, '#1d1b38', 9);

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
      if (t >= 0.3) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 4);
        const gx = cx, gy = Math.round(y + sh - dh / 2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.55 * pulse;
        ctx.drawImage(glowSpr, gx - dw * 1.4, gy - dh * 1.6, dw * 2.8, dh * 3.2);
        // light spilling on the grass
        ctx.globalAlpha = 0.35 * pulse;
        ctx.drawImage(glowSpr, gx - dw * 1.6, groundY - 6, dw * 3.2, 14);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = 0.35; px(cx - Math.round(dw * 0.4), groundY - 1, Math.round(dw * 0.8), 2, '#000'); ctx.globalAlpha = 1;
      if (t >= 0.3) ctx.drawImage(blink ? slimeBlink : slime, cx - Math.round(dw / 2), Math.round(y + sh - dh), dw, dh);

      // Impact: shockwave ring + pixel dust.
      if (shakeT > 0 && shakeT < 0.5) {
        const rad = 4 + shakeT * 90; ctx.globalAlpha = 1 - shakeT / 0.5;
        for (let a = 0; a < 64; a++) { const an = (a / 64) * Math.PI; px(cx + Math.cos(an) * rad, groundY - Math.sin(an) * rad * 0.35, 1, 1, P.h); px(cx - Math.cos(an) * rad, groundY - Math.sin(an) * rad * 0.35, 1, 1, P.h); }
        ctx.globalAlpha = 1;
      }
      if (shakeT > 0 && shakeT < 0.9) parts.forEach((p) => { const k = shakeT; ctx.globalAlpha = 1 - k / 0.9; px(cx + p.vx * k, groundY - 2 + p.vy * k + 120 * k * k, p.s, p.s, [P.b, P.h, P.s, '#ffffff'][p.ci]); });
      ctx.globalAlpha = 1;

      // Logo letters drop in on each note.
      const scale = 3, word = ['B', 'L', 'O', 'B'], step = 5 * scale + 2 * scale;
      const totalW = word.length * step - 2 * scale;
      const lx0 = Math.round(cx - totalW / 2), ly = Math.round(H * 0.33);
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
          return gy < rows * 0.35 ? P.h : gy < rows * 0.7 ? P.b : P.s;
        }, P.logoEdge);
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
