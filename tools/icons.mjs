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

function pngRect(pixels, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour with alpha

  // One filter byte (0, "no filter") per scanline; deflate handles flat art.
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  const bytes = Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    bytes.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const png = (pixels, size) => pngRect(pixels, size, size);

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

/**
 * The Chrome listing's small promotional tile, 440x280.
 *
 * The store shows it at half size in places, where any text turns to mush, so
 * nothing here is text: the meaning is carried by the composition. A stack of
 * dim rows with exactly one lit green is the product in one shape — a release
 * full of files, one of them the answer. It reads the same at 220x140, which is
 * the only test that matters.
 */
const PROMO_W = 440;
const PROMO_H = 280;

const PROMO = {
  bg: [13, 17, 23],
  card: [22, 27, 34],
  edge: [48, 54, 61],
  muted: [110, 118, 129],
  green: [35, 134, 54],
  ink: [255, 255, 255],
};

function promoTile() {
  const rows = 5;
  const rowH = 34;
  const gap = 12;
  const x = 44;
  const w = PROMO_W - x * 2;
  const top = (PROMO_H - (rows * rowH + (rows - 1) * gap)) / 2;
  // Filename bars of uneven length: a real release is not a tidy list.
  const nameW = [0.64, 0.8, 0.52, 0.72, 0.46];
  const chosen = 2;

  const layers = [];
  for (let i = 0; i < rows; i += 1) {
    const y = top + i * (rowH + gap);
    const isChosen = i === chosen;
    layers.push({ shape: roundRect(x, y, w, rowH, 8), color: isChosen ? PROMO.green : PROMO.card });
    if (!isChosen) {
      layers.push({ shape: roundRect(x, y, w, rowH, 8), color: PROMO.edge, outline: 1 });
    }
    // The little square standing in for a file icon.
    layers.push({
      shape: roundRect(x + 12, y + 9, 16, 16, 3),
      color: isChosen ? PROMO.ink : PROMO.muted,
    });
    // The filename itself, as a bar. Unreadable is the point.
    layers.push({
      shape: roundRect(x + 38, y + 13, (w - 96) * nameW[i], 8, 4),
      color: isChosen ? PROMO.ink : PROMO.muted,
    });
    if (isChosen) {
      // The mark from the extension's own icon, so the two read as one product.
      const ax = x + w - 34;
      const ay = y + 8;
      layers.push({ shape: rect(ax + 6, ay, 6, 9), color: PROMO.ink });
      layers.push({
        shape: polygon([
          [ax, ay + 8],
          [ax + 18, ay + 8],
          [ax + 9, ay + 18],
        ]),
        color: PROMO.ink,
      });
      layers.push({ shape: roundRect(ax - 1, ay + 20, 20, 4, 2), color: PROMO.ink });
    }
  }

  const px = new Uint8Array(PROMO_W * PROMO_H * 4);
  for (let y = 0; y < PROMO_H; y += 1) {
    for (let x2 = 0; x2 < PROMO_W; x2 += 1) {
      const i = (y * PROMO_W + x2) * 4;
      let [r, g, b] = PROMO.bg;
      for (const layer of layers) {
        let hits = 0;
        for (let sy = 0; sy < SS; sy += 1) {
          for (let sx = 0; sx < SS; sx += 1) {
            const gx = x2 + (sx + 0.5) / SS;
            const gy = y + (sy + 0.5) / SS;
            if (!layer.shape(gx, gy)) continue;
            // An "outline" layer paints only the ring just inside its edge.
            if (layer.outline) {
              const inner = layer.shape(gx + 1.2, gy) && layer.shape(gx - 1.2, gy) &&
                layer.shape(gx, gy + 1.2) && layer.shape(gx, gy - 1.2);
              if (inner) continue;
            }
            hits += 1;
          }
        }
        const a = hits / (SS * SS);
        if (a === 0) continue;
        r = Math.round(r * (1 - a) + layer.color[0] * a);
        g = Math.round(g * (1 - a) + layer.color[1] * a);
        b = Math.round(b * (1 - a) + layer.color[2] * a);
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }
  return px;
}

/** Half size is where the store actually shows it; box-filter down and check. */
function halve(pixels, w, h) {
  const out = new Uint8Array((w / 2) * (h / 2) * 4);
  for (let y = 0; y < h / 2; y += 1) {
    for (let x = 0; x < w / 2; x += 1) {
      for (let c = 0; c < 4; c += 1) {
        const s =
          pixels[((y * 2) * w + x * 2) * 4 + c] +
          pixels[((y * 2) * w + x * 2 + 1) * 4 + c] +
          pixels[((y * 2 + 1) * w + x * 2) * 4 + c] +
          pixels[((y * 2 + 1) * w + x * 2 + 1) * 4 + c];
        out[(y * (w / 2) + x) * 4 + c] = Math.round(s / 4);
      }
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

const promo = promoTile();
writeFileSync(join(docs, 'promo-440x280.png'), pngRect(promo, PROMO_W, PROMO_H));
console.log('  docs/promo-440x280.png (Chrome small promotional tile)');
writeFileSync(join(docs, 'promo-half-preview.png'), pngRect(halve(promo, PROMO_W, PROMO_H), PROMO_W / 2, PROMO_H / 2));
console.log('  docs/promo-half-preview.png (how it reads at half size; not uploaded)');
