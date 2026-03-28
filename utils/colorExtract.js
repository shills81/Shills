'use strict';

/**
 * colorExtract.js
 * Dominant color extraction for Lubies Factory Pass PFP palette swatches.
 *
 * Uses k-means++ clustering on a downsampled RGB thumbnail.
 * Very dark pixels (luminance < 40/255) are skipped — they blend into the
 * card's near-black background and aren't useful as swatches.
 *
 * @param {Buffer}  imageBuffer  Raw image bytes (PNG, JPEG, WebP, …)
 * @param {object}  [opts]
 * @param {number}  [opts.count=5]  Colors to return (clamped to 3–6).
 * @returns {Promise<string[]>}     #rrggbb hex strings, most-dominant first.
 */
async function extractPalette(imageBuffer, { count = 5 } = {}) {
  let sharp;
  try { sharp = require('sharp'); }
  catch { return _fallbackSwatches(count); }

  count = Math.max(3, Math.min(6, count));

  const SIZE = 64;
  let data;
  try {
    ({ data } = await sharp(imageBuffer)
      .resize(SIZE, SIZE, { fit: 'cover' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true }));
  } catch {
    return _fallbackSwatches(count);
  }

  // Collect non-dark pixels
  const pixels = [];
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (0.299 * r + 0.587 * g + 0.114 * b >= 40) {
      pixels.push([r, g, b]);
    }
  }
  if (pixels.length < count * 4) return _fallbackSwatches(count);

  const centers = _kMeans(pixels, count, 15);
  const hexColors = centers.map(([r, g, b]) => _hex(r, g, b));
  const unique = _deduplicate(hexColors, 28);

  // Pad back up to `count` if dedup removed too many
  const fallback = _fallbackSwatches(count);
  while (unique.length < count) unique.push(fallback[unique.length]);

  return unique.slice(0, count);
}

// ---------------------------------------------------------------------------
// k-means++ clustering
// ---------------------------------------------------------------------------

/**
 * k-means++ clustering on RGB pixel array.
 * Returns `k` [r, g, b] centers sorted by cluster population (largest first).
 *
 * @param {number[][]} pixels
 * @param {number}     k
 * @param {number}     maxIter
 * @returns {number[][]}
 */
function _kMeans(pixels, k, maxIter = 15) {
  // k-means++ seed: each new center chosen with probability ∝ dist² from nearest
  const centers = [pixels[Math.floor(Math.random() * pixels.length)]];
  while (centers.length < k) {
    const dists  = pixels.map(px => {
      let minD = Infinity;
      for (const c of centers) { const d = _dist2(px, c); if (d < minD) minD = d; }
      return minD;
    });
    const total  = dists.reduce((a, b) => a + b, 0);
    let   rnd    = Math.random() * total;
    let   chosen = pixels[pixels.length - 1];
    for (let i = 0; i < pixels.length; i++) {
      rnd -= dists[i];
      if (rnd <= 0) { chosen = pixels[i]; break; }
    }
    centers.push(chosen);
  }

  const assignments = new Int32Array(pixels.length);
  const counts      = new Int32Array(k);

  for (let iter = 0; iter < maxIter; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let best = 0, bestD = _dist2(pixels[i], centers[0]);
      for (let j = 1; j < k; j++) {
        const d = _dist2(pixels[i], centers[j]);
        if (d < bestD) { bestD = d; best = j; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;

    // Recompute centers
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    counts.fill(0);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      counts[c]++;
    }
    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centers[j] = [
          sums[j][0] / counts[j],
          sums[j][1] / counts[j],
          sums[j][2] / counts[j],
        ];
      }
    }
  }

  // Sort by cluster size descending
  return centers
    .map((c, i) => ({ c, n: counts[i] }))
    .sort((a, b) => b.n - a.n)
    .map(x => x.c);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _dist2(a, b) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function _hex(r, g, b) {
  return '#' + [r, g, b]
    .map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
    .join('');
}

/** Remove colors that are perceptually too close (Euclidean < threshold in 0–255 space). */
function _deduplicate(hexColors, threshold) {
  const result = [];
  for (const color of hexColors) {
    const [r, g, b] = _parseHex(color);
    const tooClose = result.some(other => {
      const [or, og, ob] = _parseHex(other);
      return Math.sqrt((r - or) ** 2 + (g - og) ** 2 + (b - ob) ** 2) < threshold;
    });
    if (!tooClose) result.push(color);
  }
  return result;
}

function _parseHex(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function _fallbackSwatches(count) {
  return ['#c9a84c', '#7c3aed', '#f43f5e', '#4ade80', '#1e88e5', '#e2e2e2'].slice(0, count);
}

module.exports = { extractPalette };
