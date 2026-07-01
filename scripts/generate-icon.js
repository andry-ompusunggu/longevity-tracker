/**
 * Generate app icons for Longevity Tracker.
 * Design: 5-color wheel (pillar wedges) on dark background.
 * Pure Node.js — zero dependencies.
 *
 * Run: node scripts/generate-icon.js
 */

const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const SIZE = 512;
const HALF = SIZE / 2;
const ASSETS_DIR = path.join(__dirname, '..', 'assets');

// Pillar colors (RGB)
const PILLARS = [
  [143, 92, 246],   // Sleep — Purple
  [16, 185, 129],   // Fasting — Green
  [239, 68, 68],    // Muscle — Red
  [249, 115, 22],   // VO2 — Orange
  [6, 182, 212],    // Brain — Cyan
];
const NUM_PILLARS = PILLARS.length;
const SEGMENT_ANGLE = (2 * Math.PI) / NUM_PILLARS;

// ─── CRC32 ────────────────────────────────────────────────────────────────────

function makeCRC32Table() {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
}
const CRC_TABLE = makeCRC32Table();

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ─── PNG Chunks ───────────────────────────────────────────────────────────────

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tb = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([tb, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcData));
  return Buffer.concat([len, tb, data, crc]);
}

function buildPNG(pixels, w, h) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rowSize = 1 + w * 4;
  const raw = Buffer.alloc(h * rowSize);
  for (let y = 0; y < h; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * rowSize + 1 + x * 4;
      raw[di] = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// ─── Blend helpers ────────────────────────────────────────────────────────────

function lerp(a, b, t) {
  return Math.round(a + (b - a) * Math.max(0, Math.min(1, t)));
}

function blendRGBA(dst, r, g, b, a) {
  const alpha = a / 255;
  dst[0] = Math.round(dst[0] * (1 - alpha) + r * alpha);
  dst[1] = Math.round(dst[1] * (1 - alpha) + g * alpha);
  dst[2] = Math.round(dst[2] * (1 - alpha) + b * alpha);
  dst[3] = Math.min(255, dst[3] + Math.round((255 - dst[3]) * alpha));
}

// ─── Generate main icon pixels ───────────────────────────────────────────────

function makeMainIcon() {
  const p = new Uint8Array(SIZE * SIZE * 4);
  const outerR = SIZE * 0.44;
  const innerR = SIZE * 0.18;
  const centerDotR = SIZE * 0.055;
  const aaWidth = 4; // anti-alias softness in pixels

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const dx = x - HALF, dy = y - HALF;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background: dark charcoal
      p[idx] = 26; p[idx + 1] = 26; p[idx + 2] = 26; p[idx + 3] = 255;

      // Is this pixel in or near the ring?
      const ringInner = innerR - aaWidth;
      const ringOuter = outerR + aaWidth;

      if (dist >= ringInner && dist <= ringOuter) {
        // Smooth distance for anti-aliasing
        const innerBlend = Math.max(0, Math.min(1, (dist - (innerR - aaWidth)) / aaWidth));
        const outerBlend = Math.max(0, Math.min(1, ((outerR + aaWidth) - dist) / aaWidth));
        const ringAlpha = Math.min(innerBlend, outerBlend);

        if (ringAlpha > 0) {
          // Determine wedge color with smoothed boundaries
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;

          // Normalized position within a segment [0, 1)
          const segRaw = angle / SEGMENT_ANGLE;
          const segFloor = Math.floor(segRaw);
          const segPos = segRaw - segFloor; // 0..1 within this segment
          const ci0 = segFloor % NUM_PILLARS;
          const ci1 = (segFloor + 1) % NUM_PILLARS;

          // Smooth step at segment boundaries (0.08 = ~5 degrees of blend)
          const blendWidth = 0.08;
          let segBlend;
          if (segPos < blendWidth) {
            segBlend = 1 - segPos / blendWidth; // blend toward previous color
          } else if (segPos > 1 - blendWidth) {
            segBlend = (segPos - (1 - blendWidth)) / blendWidth; // blend toward next color
          } else {
            segBlend = 0; // pure current color
          }

          let r, g, b;
          if (segBlend > 0) {
            // Blend between ci0 and ci1 at boundaries
            const c0 = PILLARS[ci0], c1 = PILLARS[ci1];
            r = lerp(c0[0], c1[0], segBlend);
            g = lerp(c0[1], c1[1], segBlend);
            b = lerp(c0[2], c1[2], segBlend);
          } else {
            const c = PILLARS[ci0];
            r = c[0]; g = c[1]; b = c[2];
          }

          // Blend pillar color over dark background using ringAlpha
          const bg = [26, 26, 26];
          p[idx] = lerp(bg[0], r, ringAlpha);
          p[idx + 1] = lerp(bg[1], g, ringAlpha);
          p[idx + 2] = lerp(bg[2], b, ringAlpha);
          p[idx + 3] = 255;
        }
      }

      // Center dot: white
      if (dist < centerDotR) {
        const dotBlend = Math.max(0, Math.min(1, (centerDotR - dist) / aaWidth));
        blendRGBA(p.subarray(idx, idx + 4), 255, 255, 255, Math.round(255 * dotBlend));
      }
    }
  }
  return p;
}

// ─── Make foreground (transparent bg, just the ring) ──────────────────────────

function makeForeground() {
  const p = new Uint8Array(SIZE * SIZE * 4);
  const outerR = SIZE * 0.44;
  const innerR = SIZE * 0.18;
  const centerDotR = SIZE * 0.055;
  const aaWidth = 4;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const dx = x - HALF, dy = y - HALF;
      const dist = Math.sqrt(dx * dx + dy * dy);
      p[idx + 3] = 0; // transparent by default

      if (dist >= innerR - aaWidth && dist <= outerR + aaWidth) {
        const innerBlend = Math.max(0, Math.min(1, (dist - (innerR - aaWidth)) / aaWidth));
        const outerBlend = Math.max(0, Math.min(1, ((outerR + aaWidth) - dist) / aaWidth));
        const ringAlpha = Math.min(innerBlend, outerBlend);

        if (ringAlpha > 0.01) {
          let angle = Math.atan2(dy, dx);
          if (angle < 0) angle += 2 * Math.PI;
          const segRaw = angle / SEGMENT_ANGLE;
          const segFloor = Math.floor(segRaw);
          const segPos = segRaw - segFloor;
          const ci0 = segFloor % NUM_PILLARS;
          const ci1 = (segFloor + 1) % NUM_PILLARS;
          const blendWidth = 0.08;
          let segBlend;
          if (segPos < blendWidth) segBlend = 1 - segPos / blendWidth;
          else if (segPos > 1 - blendWidth) segBlend = (segPos - (1 - blendWidth)) / blendWidth;
          else segBlend = 0;

          let r, g, b;
          if (segBlend > 0) {
            r = lerp(PILLARS[ci0][0], PILLARS[ci1][0], segBlend);
            g = lerp(PILLARS[ci0][1], PILLARS[ci1][1], segBlend);
            b = lerp(PILLARS[ci0][2], PILLARS[ci1][2], segBlend);
          } else {
            r = PILLARS[ci0][0]; g = PILLARS[ci0][1]; b = PILLARS[ci0][2];
          }

          p[idx] = r; p[idx + 1] = g; p[idx + 2] = b;
          p[idx + 3] = Math.round(255 * ringAlpha);
        }
      }

      // Center dot
      if (dist < centerDotR) {
        const dotBlend = Math.max(0, Math.min(1, (centerDotR - dist) / aaWidth));
        const da = Math.round(255 * dotBlend);
        p[idx] = lerp(p[idx], 255, dotBlend);
        p[idx + 1] = lerp(p[idx + 1], 255, dotBlend);
        p[idx + 2] = lerp(p[idx + 2], 255, dotBlend);
        p[idx + 3] = Math.min(255, p[idx + 3] + da);
      }
    }
  }
  return p;
}

// ─── Make monochrome (white ring on transparent) ──────────────────────────────

function makeMonochrome() {
  const p = new Uint8Array(SIZE * SIZE * 4);
  const outerR = SIZE * 0.44, innerR = SIZE * 0.18, dotR = SIZE * 0.055, aa = 4;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const dist = Math.sqrt((x - HALF) ** 2 + (y - HALF) ** 2);
      let alpha = 0;

      if (dist >= innerR - aa && dist <= outerR + aa) {
        alpha = Math.min(
          Math.max(0, Math.min(1, (dist - (innerR - aa)) / aa)),
          Math.max(0, Math.min(1, ((outerR + aa) - dist) / aa))
        );
      }
      if (dist < dotR + aa) {
        const da = Math.max(0, Math.min(1, ((dotR + aa) - dist) / aa));
        alpha = Math.max(alpha, da);
      }

      if (alpha > 0.01) {
        p[idx] = 255; p[idx + 1] = 255; p[idx + 2] = 255;
        p[idx + 3] = Math.round(255 * alpha);
      }
    }
  }
  return p;
}

// ─── Downscale with box filter for favicon ────────────────────────────────────

function downscale(src, srcW, srcH, dstW, dstH) {
  const dst = new Uint8Array(dstW * dstH * 4);
  const scaleX = srcW / dstW, scaleY = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const dstIdx = (dy * dstW + dx) * 4;
      let sumR = 0, sumG = 0, sumB = 0, sumA = 0, count = 0;
      const sy0 = Math.floor(dy * scaleY), sy1 = Math.ceil((dy + 1) * scaleY);
      const sx0 = Math.floor(dx * scaleX), sx1 = Math.ceil((dx + 1) * scaleX);

      for (let sy = sy0; sy < sy1 && sy < srcH; sy++) {
        for (let sx = sx0; sx < sx1 && sx < srcW; sx++) {
          const si = (sy * srcW + sx) * 4;
          sumR += src[si]; sumG += src[si + 1]; sumB += src[si + 2];
          sumA += src[si + 3]; count++;
        }
      }

      if (count > 0) {
        dst[dstIdx] = Math.round(sumR / count);
        dst[dstIdx + 1] = Math.round(sumG / count);
        dst[dstIdx + 2] = Math.round(sumB / count);
        dst[dstIdx + 3] = Math.round(sumA / count);
      }
    }
  }
  return dst;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  if (!fs.existsSync(ASSETS_DIR)) fs.mkdirSync(ASSETS_DIR, { recursive: true });

  console.log('Generating icon.png...');
  const mainPix = makeMainIcon();
  fs.writeFileSync(path.join(ASSETS_DIR, 'icon.png'), buildPNG(mainPix, SIZE, SIZE));

  console.log('Generating splash-icon.png...');
  fs.writeFileSync(path.join(ASSETS_DIR, 'splash-icon.png'), buildPNG(mainPix, SIZE, SIZE));

  console.log('Generating favicon.png (32x32)...');
  const fgPix = makeForeground();
  // Use foreground for favicon (transparent bg works better at small sizes)
  const fgDown = downscale(fgPix, SIZE, SIZE, 32, 32);
  fs.writeFileSync(path.join(ASSETS_DIR, 'favicon.png'), buildPNG(fgDown, 32, 32));

  console.log('Generating android-icon-foreground.png...');
  fs.writeFileSync(path.join(ASSETS_DIR, 'android-icon-foreground.png'), buildPNG(fgPix, SIZE, SIZE));

  console.log('Generating android-icon-background.png...');
  const bgPix = new Uint8Array(SIZE * SIZE * 4);
  for (let i = 0; i < SIZE * SIZE * 4; i += 4) {
    bgPix[i] = 244; bgPix[i + 1] = 244; bgPix[i + 2] = 246; bgPix[i + 3] = 255;
  }
  fs.writeFileSync(path.join(ASSETS_DIR, 'android-icon-background.png'), buildPNG(bgPix, SIZE, SIZE));

  console.log('Generating android-icon-monochrome.png...');
  const monoPix = makeMonochrome();
  fs.writeFileSync(path.join(ASSETS_DIR, 'android-icon-monochrome.png'), buildPNG(monoPix, SIZE, SIZE));

  console.log('All icons generated in assets/');
}

main();
