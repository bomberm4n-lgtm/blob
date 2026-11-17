// Draws the Blob pixel-art slime icon (light blue) and writes icon.png (512px), icon.ico and a favicon.
// Usage: node make-icon.cjs
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const GRID = [
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
const COLORS = {
  o: [0x1b, 0x4a, 0x5e, 255], // outline
  b: [0x8e, 0xd8, 0xf5, 255], // body
  s: [0x5c, 0xb6, 0xdf, 255], // shade
  h: [0xe6, 0xf8, 0xff, 255], // highlight
  e: [0x1b, 0x4a, 0x5e, 255], // eyes
};

function render(size) {
  const cols = GRID[0].length;
  const rows = GRID.length;
  const px = Math.floor((size * 0.9) / cols);
  const ox = Math.floor((size - cols * px) / 2);
  const oy = Math.floor((size - rows * px) / 2);
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const c = COLORS[GRID[y][x]];
      if (!c) continue;
      for (let dy = 0; dy < px; dy++) {
        for (let dx = 0; dx < px; dx++) {
          const i = ((oy + y * px + dy) * size + (ox + x * px + dx)) * 4;
          buf[i] = c[0]; buf[i + 1] = c[1]; buf[i + 2] = c[2]; buf[i + 3] = c[3];
        }
      }
    }
  }
  return buf;
}

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (b) => { let c = -1; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size) {
  const rgba = render(size);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function ico(sizes) {
  const imgs = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head[e] = s >= 256 ? 0 : s; head[e + 1] = s >= 256 ? 0 : s;
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(imgs[i].length, e + 8); head.writeUInt32LE(off, e + 12);
    off += imgs[i].length;
  });
  return Buffer.concat([head, ...imgs]);
}

const here = __dirname;
fs.writeFileSync(path.join(here, 'icon.png'), png(512));
fs.writeFileSync(path.join(here, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(here, '..', 'server', 'blob.ico'), ico([16, 24, 32, 48, 64, 128, 256]));
fs.writeFileSync(path.join(here, '..', 'client', 'public', 'favicon.png'), png(64));
fs.writeFileSync(path.join(here, '..', 'client', 'public', 'slime.png'), png(256));
console.log('icons written');

// Same slime as a crisp SVG (used as the logo inside the app).
const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('');
let rects = '';
GRID.forEach((row, y) => [...row].forEach((ch, x) => { if (COLORS[ch]) rects += `<rect x="${x}" y="${y + 1.5}" width="1.02" height="1.02" fill="${hex(COLORS[ch])}"/>`; }));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">${rects}</svg>\n`;
fs.writeFileSync(path.join(here, '..', 'client', 'public', 'blob.svg'), svg);
fs.writeFileSync(path.join(here, '..', 'server', 'blob.svg'), svg);
console.log('svg written');
