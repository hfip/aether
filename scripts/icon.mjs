/**
 * Draws the app icon and writes the PNG sizes each target needs. Everything is
 * generated (no binary assets in git), using only Node's zlib.
 */
import zlib from 'node:zlib';
import fs from 'node:fs/promises';
import path from 'node:path';

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = -1;
  for (let i = 0; i < buffer.length; i += 1) c = crcTable[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function render(size) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const center = size / 2;
  const ringRadius = size * 0.29;
  const ringWidth = size * 0.022;
  const stars = [
    [0.30, 0.72, 0.0035], [0.72, 0.32, 0.0028], [0.66, 0.70, 0.0022], [0.34, 0.30, 0.0024],
  ];
  let offset = 0;
  for (let y = 0; y < size; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < size; x += 1) {
      const dx = x - center;
      const dy = y - center;
      const radius = Math.hypot(dx, dy);
      const t = Math.min(1, radius / (size * 0.62));
      let r = 5 + 10 * (1 - t) ** 2;
      let g = 8 + 26 * (1 - t) ** 2;
      let b = 14 + 38 * (1 - t) ** 2;

      const angle = Math.atan2(dy, dx);
      const hue = (angle + Math.PI) / (2 * Math.PI);
      const cr = 104 + (140 - 104) * hue;
      const cg = 234 + (157 - 234) * hue;
      const cb = 213 + (255 - 213) * hue;

      const distance = Math.abs(radius - ringRadius);
      if (distance < ringWidth) {
        const k = 1 - distance / ringWidth;
        r += (cr - r) * k;
        g += (cg - g) * k;
        b += (cb - b) * k;
      } else {
        const glow = Math.exp(-(((distance - ringWidth) / (size * 0.045)) ** 2));
        r = Math.min(255, r + cr * 0.35 * glow);
        g = Math.min(255, g + cg * 0.35 * glow);
        b = Math.min(255, b + cb * 0.35 * glow);
      }

      for (const [sx, sy, sr] of stars) {
        const sd = Math.hypot(x - size * sx, y - size * sy);
        if (sd < size * sr) {
          const k = 1 - sd / (size * sr);
          r = Math.min(255, r + 200 * k);
          g = Math.min(255, g + 210 * k);
          b = Math.min(255, b + 220 * k);
        }
      }

      raw[offset] = Math.round(r);
      raw[offset + 1] = Math.round(g);
      raw[offset + 2] = Math.round(b);
      raw[offset + 3] = 255;
      offset += 4;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const cache = new Map();
const iconFor = (size) => {
  if (!cache.has(size)) cache.set(size, render(size));
  return cache.get(size);
};

export async function writeWebIcons(distDir) {
  await fs.mkdir(distDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(distDir, 'icon-192.png'), iconFor(192)),
    fs.writeFile(path.join(distDir, 'icon-512.png'), iconFor(512)),
    fs.writeFile(path.join(distDir, 'apple-touch-icon.png'), iconFor(180)),
  ]);
}

export async function writeAppIcon(assetDir) {
  await fs.mkdir(assetDir, { recursive: true });
  await fs.writeFile(path.join(assetDir, 'AppIcon-1024.png'), iconFor(1024));
}
