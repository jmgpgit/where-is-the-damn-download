#!/usr/bin/env node
/**
 * Draw the extension's icons: a white download arrow dropping into a tray, on
 * an opaque green tile.
 *
 *   node tools/icons.mjs                     write icons/icon-{16,32,48,128}.png
 *   node tools/icons.mjs --out /tmp/preview  try it somewhere else
 *
 * Every size is drawn at its own scale rather than downscaled from 128px, so
 * bars stay whole pixels at 16px. Shapes live on a 128-unit grid with edges on
 * multiples of 8, which divides evenly into all four sizes.
 *
 * No dependencies: arithmetic plus node:zlib. The tile is opaque because MV3
 * cannot serve a different icon per browser theme, and a bare glyph on
 * transparency disappears against either the light or the dark toolbar.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SIZES = [16, 32, 48, 128];
/** Samples per pixel per axis. */
const SS = 4;

const TILE = [31, 111, 58, 255]; // green: "here is the download"
const INK = [255, 255, 255, 255];

// --- shapes: point -> inside?, in the 128-unit design grid -------------------

const rect = (x, y, w, h) => (px, py) => px >= x && px < x + w && py >= y && py < y + h;

const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || px >= x + w || py < y || py >= y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r);
  const cy = Math.min(Math.max(py, y + r), y + h - r);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
};

const pill = (x, y, w, h) => roundRect(x, y, w, h, h / 2);

const polygon = (points) => (px, py) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

const union =
  (...shapes) =>
  (px, py) =>
    shapes.some((s) => s(px, py));

/** Arrow shaft, arrow head, tray underneath. */
const glyph = union(
  rect(52, 16, 24, 44),
  polygon([
    [28, 56],
    [100, 56],
    [64, 96],
  ]),
  pill(20, 104, 88, 16)
);

// --- rasteriser --------------------------------------------------------------

function render(size) {
  const scale = 128 / size;
  const px = new Uint8Array(size * size * 4);
  // Corner radius rounded to whole pixels at this size so the curve starts on
  // a pixel edge.
  const tile = roundRect(0, 0, 128, 128, Math.round(24 / scale) * scale);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inTile = 0;
      let inMark = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const gx = (x + (sx + 0.5) / SS) * scale;
          const gy = (y + (sy + 0.5) / SS) * scale;
          if (tile(gx, gy)) inTile += 1;
          if (glyph(gx, gy)) inMark += 1;
        }
      }
      const total = SS * SS;
      const tileA = inTile / total;
      const markA = (inMark / total) * tileA;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        px[i + c] = Math.round(TILE[c] * (1 - markA) + INK[c] * markA);
      }
      px[i + 3] = Math.round(tileA * 255);
    }
  }
  return px;
}

// --- PNG ---------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png(pixels, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha

  // One filter byte (0, "no filter") per scanline; deflate handles flat art.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(pixels.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- main --------------------------------------------------------------------

/**
 * The Chrome Web Store listing icon is 128x128 with the artwork inset to 96x96
 * and the remaining 16px on each side transparent. The manifest icon is the
 * same size and full-bleed, so it is the wrong file for the listing: uploading
 * it gets the tile cropped or padded again by the store.
 */
function storeIcon() {
  const art = render(96);
  const out = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 96; y += 1) {
    for (let x = 0; x < 96; x += 1) {
      const from = (y * 96 + x) * 4;
      const to = ((y + 16) * 128 + (x + 16)) * 4;
      for (let c = 0; c < 4; c += 1) out[to + c] = art[from + c];
    }
  }
  return out;
}

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 && args[outIdx + 1] ? args[outIdx + 1] : join(HERE, '..', 'icons');

mkdirSync(out, { recursive: true });
for (const size of SIZES) {
  writeFileSync(join(out, `icon-${size}.png`), png(render(size), size));
  console.log(`  icon-${size}.png`);
}

// Store artwork lives outside icons/, which build.mjs copies wholesale into the
// package; a listing image has no business shipping to users.
const docs = join(HERE, '..', 'docs');
mkdirSync(docs, { recursive: true });
writeFileSync(join(docs, 'store-icon-128.png'), png(storeIcon(), 128));
console.log('  docs/store-icon-128.png (Chrome listing icon, 96x96 artwork padded to 128)');
