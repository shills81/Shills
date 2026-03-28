'use strict';

/**
 * patterns.js
 * Reaction-diffusion (RD) fingerprint pattern generator for Lubies Factory Pass.
 *
 * Visual reference:
 *   The banner fills with a unique maze-like, organic winding pattern — the same
 *   labyrinthine texture produced by Turing / Gray-Scott reaction-diffusion systems.
 *   Each token gets a different pattern that is its "identity fingerprint."
 *
 * Technique:
 *   Paths are traced along the ISO-POTENTIAL CONTOUR LINES of a composite
 *   scalar field built from overlapping sine functions. The contour lines of a
 *   multi-frequency sine field produce exactly the organic, maze-like, closed-loop
 *   winding appearance of RD patterns — without needing to actually simulate
 *   reaction-diffusion equations.
 *
 *   The scalar field:
 *     Φ(x,y) = Σ sin(x·fᵢ + y·gᵢ + φᵢ)
 *
 *   Flow direction at each point = gradient of Φ rotated 90° (perpendicular
 *   to the gradient = tangent to the contour line). This keeps paths from
 *   diverging or converging, maintaining consistent ridge spacing.
 *
 *   Each token's seed produces unique fᵢ, gᵢ, φᵢ values →
 *   unique pattern, deterministically reproducible.
 */

const { randFloat } = require('../utils/hashSeed');

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate the RD fingerprint pattern as an SVG <g> element string.
 * The pattern is clipped externally by the caller's <clipPath>.
 *
 * @param {() => number} rng          Seeded RNG for this token's pattern channel.
 * @param {object}       bounds       Rectangular region to fill.
 * @param {number}       bounds.x     Left edge.
 * @param {number}       bounds.y     Top edge.
 * @param {number}       bounds.w     Width.
 * @param {number}       bounds.h     Height.
 * @param {string}       strokeColor  Ridge stroke color from palette.ridgeColor.
 * @returns {string}                  SVG <g>…</g> fragment.
 */
function generateRDPattern(rng, bounds, strokeColor) {
  const { x: bx, y: by, w: bw, h: bh } = bounds;

  // -------------------------------------------------------------------------
  // Scalar potential field — 3 sine terms, all seed-derived
  // -------------------------------------------------------------------------
  const scales = [
    0.018 + rng() * 0.014,   // s0x
    0.016 + rng() * 0.012,   // s0y
    0.022 + rng() * 0.014,   // s1x
    0.014 + rng() * 0.010,   // s1y
    0.030 + rng() * 0.012,   // s2x
    0.020 + rng() * 0.012,   // s2y
  ];
  const phases = Array.from({ length: 6 }, () => rng() * TAU);
  const weights = [1.0, 0.75, 0.45];

  // φ(px, py)
  function potential(px, py) {
    return weights[0] * Math.sin(px * scales[0] + py * scales[1] + phases[0])
         + weights[1] * Math.sin(px * scales[2] - py * scales[3] + phases[1])
         + weights[2] * Math.sin(px * scales[4] + py * scales[5] + phases[2])
         + weights[2] * Math.cos(px * scales[3] + py * scales[0] + phases[3]);
  }

  // ∇φ via finite difference → flow = rotate 90° → tangent to contour lines
  const fd = 1.2;
  function flowAngle(px, py) {
    const dpx = (potential(px + fd, py) - potential(px - fd, py)) / (2 * fd);
    const dpy = (potential(px, py + fd) - potential(px, py - fd)) / (2 * fd);
    // Rotate gradient 90° → perpendicular = contour direction
    return Math.atan2(dpx, -dpy);
  }

  // -------------------------------------------------------------------------
  // Ridge spacing and stroke width
  // -------------------------------------------------------------------------
  const spacing   = 18 + rng() * 8;   // distance between seeds → visual ridge spacing
  const sw        = (spacing * 0.50).toFixed(1);  // stroke = 50% of spacing
  const stepLen   = 4.5;              // integration step size (px)
  const maxSteps  = Math.ceil((bw + bh) * 1.4 / stepLen);

  // -------------------------------------------------------------------------
  // Seed points: regular grid on all four edges + light interior grid
  // -------------------------------------------------------------------------
  const seeds = [];

  for (let sy = by - spacing * 0.5; sy <= by + bh + spacing * 0.5; sy += spacing) {
    seeds.push([bx,        sy]);
    seeds.push([bx + bw,   sy]);
  }
  for (let sx = bx + spacing; sx < bx + bw; sx += spacing) {
    seeds.push([sx, by]);
    seeds.push([sx, by + bh]);
  }
  // Sparse interior seeds to fill gaps in dense zones
  for (let sy = by + spacing * 1.5; sy < by + bh; sy += spacing * 3) {
    for (let sx = bx + spacing * 1.5; sx < bx + bw; sx += spacing * 3) {
      seeds.push([sx, sy]);
    }
  }

  // -------------------------------------------------------------------------
  // Trace contour paths
  // -------------------------------------------------------------------------
  const pathData = [];

  for (const [sx, sy] of seeds) {
    const pts = [[sx, sy]];
    let px = sx;
    let py = sy;

    for (let s = 0; s < maxSteps; s++) {
      const a = flowAngle(px, py);
      px += Math.cos(a) * stepLen;
      py += Math.sin(a) * stepLen;

      if (px < bx - 6 || px > bx + bw + 6 || py < by - 6 || py > by + bh + 6) break;
      pts.push([px, py]);
    }

    if (pts.length < 3) continue;

    // Build smooth path using quadratic bezier through midpoints
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 2; i++) {
      const cpx = pts[i + 1][0].toFixed(1);
      const cpy = pts[i + 1][1].toFixed(1);
      const ex  = ((pts[i + 1][0] + pts[i + 2][0]) / 2).toFixed(1);
      const ey  = ((pts[i + 1][1] + pts[i + 2][1]) / 2).toFixed(1);
      d += ` Q ${cpx} ${cpy} ${ex} ${ey}`;
    }
    // Final segment to last point
    const last = pts[pts.length - 1];
    d += ` L ${last[0].toFixed(1)} ${last[1].toFixed(1)}`;
    pathData.push(d);
  }

  return (
    `<g fill="none" stroke="${strokeColor}" stroke-width="${sw}" ` +
    `stroke-linecap="round" stroke-linejoin="round">\n` +
    pathData.map(d => `  <path d="${d}"/>`).join('\n') +
    `\n</g>`
  );
}

module.exports = { generateRDPattern };
