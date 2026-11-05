// Draws the app icons (deep blue night, a golden light, a small green hill) as PNG and SVG.
// Run: node tools/make-icons.js
import fs from 'node:fs';
import zlib from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function pixel(x, y, s) {
  const u = x / s, v = y / s;
  let r = 18, g = 26, b = 51;
  const d = Math.hypot(u - 0.5, v - 0.42);
  const glow = Math.max(0, 1 - d / 0.42);
  r += (255 - r) * glow * glow * 0.8; g += (230 - g) * glow * glow * 0.8; b += (160 - b) * glow * glow * 0.6;
  if (d < 0.16) { r = 255; g = 236; b = 170; }
  const hill = 0.78 - 0.12 * Math.cos((u - 0.5) * Math.PI);
  if (v > hill) { r = 92; g = 158; b = 89; }
  return [r | 0, g | 0, b | 0];
}

function png(size) {
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) raw.set(pixel(x, y, size), y * (size * 3 + 1) + 1 + x * 3);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

fs.mkdirSync('icons', { recursive: true });
for (const s of [192, 512]) fs.writeFileSync(`icons/icon-${s}.png`, png(s));
fs.writeFileSync('icons/icon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<defs><radialGradient id="g" cx=".5" cy=".42" r=".42"><stop offset="0" stop-color="#ffe6a0"/><stop offset="1" stop-color="#121a33"/></radialGradient></defs>
<rect width="64" height="64" rx="12" fill="#121a33"/><rect width="64" height="64" rx="12" fill="url(#g)"/>
<circle cx="32" cy="27" r="10" fill="#ffecaa"/><path d="M0 50 Q32 34 64 50 V64 H0Z" fill="#5c9e59"/></svg>
`);
console.log('icons written');
