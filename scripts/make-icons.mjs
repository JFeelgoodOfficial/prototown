// Generates the PWA icons (icon-192.png, icon-512.png, apple-touch-icon.png)
// without any image dependencies: pixels are drawn in a buffer and encoded as
// PNG by hand (zlib does the compression). Run once when the art changes:
//
//   node scripts/make-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

/** Isometric diamond tiles on the game's night-sky ground. */
function draw(size) {
  const px = new Uint8Array(size * size * 3);
  const set = (x, y, r, g, b) => {
    const i = (y * size + x) * 3;
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  };
  // vertical gradient background
  for (let y = 0; y < size; y++) {
    const t = y / size;
    const r = Math.round(11 + t * 5);
    const g = Math.round(18 + t * 13);
    const b = Math.round(32 + t * 24);
    for (let x = 0; x < size; x++) set(x, y, r, g, b);
  }
  // an iso tile: diamond footprint plus two side walls
  const tile = (cx, cy, w, h, depth, top, left, right) => {
    for (let dy = -h; dy <= h + depth; dy++) {
      for (let dx = -w; dx <= w; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const inTop = Math.abs(dx) / w + Math.abs(dy) / h <= 1;
        const below = dy > 0 && dy <= depth && Math.abs(dx) / w + Math.abs(dy - depth) / h <= 1;
        if (inTop) {
          set(x, y, ...top);
        } else if (below) {
          set(x, y, ...(dx < 0 ? left : right));
        }
      }
    }
  };
  const u = size / 192; // designed at 192, scaled up for larger sizes
  const w = 52 * u;
  const h = 30 * u;
  const d = 26 * u;
  // back tiles: forest green and water blue; front tile: field gold
  tile(66 * u, 74 * u, w, h, d, [58, 125, 68], [40, 88, 48], [32, 72, 40]);
  tile(126 * u, 74 * u, w, h, d, [52, 118, 166], [36, 84, 122], [30, 70, 104]);
  tile(96 * u, 116 * u, w, h, d, [214, 178, 92], [160, 128, 58], [138, 108, 46]);
  return px;
}

// --- minimal PNG encoder (8-bit RGB, no alpha) -------------------------------

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}

function encodePng(px, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    Buffer.from(px.buffer, y * size * 3, size * 3).copy(raw, y * (size * 3 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const [file, size] of [
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
  ["public/apple-touch-icon.png", 180],
]) {
  writeFileSync(file, encodePng(draw(size), size));
  console.log(`wrote ${file}`);
}
