'use strict';

/**
 * localBgRemoval.js
 * Background removal using corner color sampling — no API, no AI, offline.
 *
 * Samples the image corners and edges to determine the background color, then
 * builds an alpha mask that makes background-like pixels transparent.
 *
 * Works well for:
 *   • NFT PFPs with flat or simple gradient backgrounds
 *   • CryptoPunks, Bored Apes, pixel art, cartoon illustrations
 *
 * Less reliable for:
 *   • Complex outdoor / indoor photo backgrounds
 *   • Backgrounds that share colors with the subject
 *
 * @param {Buffer} imageBuffer   Source image (JPEG, PNG, WebP, etc.)
 * @param {object} [opts]
 * @param {number} [opts.tolerance=55]     Color-distance threshold (0–255).
 *                                          Higher = removes more background.
 * @param {number} [opts.edgeSoftness=2]   Gaussian blur radius for soft edges.
 * @param {number} [opts.sampleGrid=5]     NxN sampling grid on each edge band.
 * @returns {Promise<Buffer>}  PNG buffer with transparent background
 */
async function removeBackgroundLocal(imageBuffer, {
  tolerance   = 55,
  edgeSoftness = 2,
  sampleGrid  = 5,
} = {}) {
  const sharp = require('sharp');

  const { width, height } = await sharp(imageBuffer).metadata();
  if (!width || !height) throw new Error('Cannot read image dimensions');

  // ── Raw RGBA pixels ───────────────────────────────────────────────────────
  const raw    = await sharp(imageBuffer).ensureAlpha().raw().toBuffer();
  const pixels = new Uint8Array(raw);
  const stride = 4;   // RGBA

  const getPixel = (x, y) => {
    x = Math.max(0, Math.min(width - 1, Math.round(x)));
    y = Math.max(0, Math.min(height - 1, Math.round(y)));
    const i = (y * width + x) * stride;
    return [pixels[i], pixels[i + 1], pixels[i + 2]];
  };

  // ── Sample background color from all four edge bands ──────────────────────
  // Use a thin border strip (5% of dimension) on all sides.
  const bw = Math.max(2, Math.floor(width  * 0.05));
  const bh = Math.max(2, Math.floor(height * 0.05));

  const samples = [];
  const step = Math.max(1, Math.floor(1 / sampleGrid));

  for (let gx = 0; gx < sampleGrid; gx++) {
    for (let gy = 0; gy < sampleGrid; gy++) {
      const fx = gx / (sampleGrid - 1);
      const fy = gy / (sampleGrid - 1);
      // Top band
      samples.push(getPixel(fx * (width - 1), fy * bh));
      // Bottom band
      samples.push(getPixel(fx * (width - 1), height - 1 - fy * bh));
      // Left band
      samples.push(getPixel(fx * bw, fy * (height - 1)));
      // Right band
      samples.push(getPixel(width - 1 - fx * bw, fy * (height - 1)));
    }
  }

  // Weighted average of sampled colors
  const bgR = samples.reduce((s, p) => s + p[0], 0) / samples.length;
  const bgG = samples.reduce((s, p) => s + p[1], 0) / samples.length;
  const bgB = samples.reduce((s, p) => s + p[2], 0) / samples.length;

  // ── Build alpha mask ───────────────────────────────────────────────────────
  // For each pixel: compute color distance to bg → smooth ramp around tolerance
  const mask = Buffer.alloc(width * height);
  const halfT = tolerance * 0.4;

  for (let i = 0; i < width * height; i++) {
    const idx  = i * stride;
    const r    = pixels[idx], g = pixels[idx + 1], b = pixels[idx + 2];
    const dist = Math.sqrt((r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2);
    // Ramp: 0 at (tolerance-halfT), 255 at (tolerance+halfT)
    const alpha = Math.min(255, Math.max(0, (dist - (tolerance - halfT)) / (halfT * 2) * 255));
    mask[i] = Math.round(alpha);
  }

  // ── Soften mask edges ─────────────────────────────────────────────────────
  const softMask = await sharp(mask, { raw: { width, height, channels: 1 } })
    .blur(edgeSoftness)
    .raw()
    .toBuffer();

  // ── Apply mask to original image ──────────────────────────────────────────
  const result = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const srcIdx = i * stride;
    const dstIdx = i * 4;
    result[dstIdx]     = pixels[srcIdx];
    result[dstIdx + 1] = pixels[srcIdx + 1];
    result[dstIdx + 2] = pixels[srcIdx + 2];
    result[dstIdx + 3] = softMask[i];
  }

  return sharp(result, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

module.exports = { removeBackgroundLocal };
