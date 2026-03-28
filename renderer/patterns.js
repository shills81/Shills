'use strict';

/**
 * patterns.js
 * Reaction-diffusion fingerprint pattern — tight ridge version.
 *
 * Traces iso-potential contour lines of a composite sine field.
 * Thin strokes (2-3px), high frequency, dense seeding → produces
 * the tight winding fingerprint maze seen in the reference passes.
 */

const TAU = Math.PI * 2;

function generateRDPattern(rng, bounds, strokeColor) {
  const { x: bx, y: by, w: bw, h: bh } = bounds;

  // ── Scalar field — higher frequency than before for tighter ridges ──
  const scales = [
    0.038 + rng() * 0.018,   // s0x
    0.030 + rng() * 0.016,   // s0y
    0.048 + rng() * 0.020,   // s1x
    0.028 + rng() * 0.014,   // s1y
    0.060 + rng() * 0.020,   // s2x
    0.040 + rng() * 0.016,   // s2y
    0.022 + rng() * 0.012,   // s3x  (extra term for complexity)
    0.052 + rng() * 0.018,   // s3y
  ];
  const phases  = Array.from({ length: 8 }, () => rng() * TAU);
  const weights = [1.0, 0.80, 0.55, 0.35];

  function potential(px, py) {
    return weights[0] * Math.sin(px * scales[0] + py * scales[1] + phases[0])
         + weights[1] * Math.sin(px * scales[2] - py * scales[3] + phases[1])
         + weights[2] * Math.sin(px * scales[4] + py * scales[5] + phases[2])
         + weights[3] * Math.cos(px * scales[6] + py * scales[7] + phases[3])
         + weights[3] * Math.sin(px * scales[1] - py * scales[0] + phases[4]);
  }

  // Flow = gradient of φ rotated 90° → traces contour lines
  const fd = 1.0;
  function flowAngle(px, py) {
    const dpx = (potential(px + fd, py) - potential(px - fd, py)) / (2 * fd);
    const dpy = (potential(px, py + fd) - potential(px, py - fd)) / (2 * fd);
    return Math.atan2(dpx, -dpy);
  }

  // ── Tight spacing, thin strokes ──
  const spacing  = 11 + rng() * 5;        // tighter ridge spacing (11–16px)
  const sw       = (2.2 + rng() * 1.0).toFixed(1);  // thin stroke (2.2–3.2px)
  const stepLen  = 3.0;                    // smaller integration step
  const maxSteps = Math.ceil((bw + bh) * 1.6 / stepLen);

  // ── Dense seed grid: edges + full interior ──
  const seeds = [];

  // All four edges
  for (let sy = by; sy <= by + bh; sy += spacing) {
    seeds.push([bx, sy]);
    seeds.push([bx + bw, sy]);
  }
  for (let sx = bx; sx <= bx + bw; sx += spacing) {
    seeds.push([sx, by]);
    seeds.push([sx, by + bh]);
  }
  // Full interior grid (denser than before)
  for (let sy = by + spacing; sy < by + bh; sy += spacing * 2) {
    for (let sx = bx + spacing; sx < bx + bw; sx += spacing * 2) {
      seeds.push([sx, sy]);
    }
  }

  // ── Trace paths ──
  const pathData = [];

  for (const [sx, sy] of seeds) {
    const pts = [[sx, sy]];
    let px = sx;
    let py = sy;

    for (let s = 0; s < maxSteps; s++) {
      const a = flowAngle(px, py);
      px += Math.cos(a) * stepLen;
      py += Math.sin(a) * stepLen;
      if (px < bx - 8 || px > bx + bw + 8 || py < by - 8 || py > by + bh + 8) break;
      pts.push([px, py]);
    }

    if (pts.length < 4) continue;

    // Smooth path via quadratic bezier through midpoints
    let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 2; i++) {
      const cpx = pts[i + 1][0].toFixed(1);
      const cpy = pts[i + 1][1].toFixed(1);
      const ex  = ((pts[i + 1][0] + pts[i + 2][0]) / 2).toFixed(1);
      const ey  = ((pts[i + 1][1] + pts[i + 2][1]) / 2).toFixed(1);
      d += ` Q ${cpx} ${cpy} ${ex} ${ey}`;
    }
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
