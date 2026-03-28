'use strict';

/**
 * patterns.js
 * Fingerprint whorl pattern — concentric oval ridges radiating from a center.
 *
 * Generates streamlines that follow the iso-contours of:
 *   φ(x,y) = √((x−cx)² + (y−cy)²·ar²) + organic_perturbation(x,y)
 *
 * Iso-contours are concentric ovals with organic wobble, matching the
 * Lubies fingerprint logo aesthetic: tight ridges, flowing curves, single origin.
 */

const TAU = Math.PI * 2;

function generateRDPattern(rng, bounds, strokeColor) {
  const { x: bx, y: by, w: bw, h: bh } = bounds;

  // ── Whorl center: randomised in the inner band of the banner ──
  const cx = bx + bw * (0.38 + rng() * 0.24);   // 38–62% across
  const cy = by + bh * (0.28 + rng() * 0.38);   // 28–66% down

  // Oval aspect ratio (< 1 = horizontally stretched, > 1 = vertically stretched)
  const ar = 0.70 + rng() * 0.50;

  // Organic perturbation — gives the fingerprint its natural, non-mechanical look
  const f1  = 0.020 + rng() * 0.016;
  const f2  = 0.014 + rng() * 0.012;
  const f3  = 0.032 + rng() * 0.014;
  const ph  = Array.from({ length: 6 }, () => rng() * TAU);
  const amp = 16 + rng() * 24;   // pixel amplitude of ridge wobble

  // ── Scalar potential: radial distance + multi-frequency distortion ──
  function potential(px, py) {
    const dx = px - cx;
    const dy = (py - cy) * ar;
    const r  = Math.sqrt(dx * dx + dy * dy);
    return r
      + amp        * Math.sin(px * f1  + py * f2  + ph[0])
      + amp * 0.55 * Math.sin(-px * f2 + py * f1  + ph[1])
      + amp * 0.35 * Math.cos(px * f3  - py * f2  + ph[2])
      + amp * 0.22 * Math.sin(px * f2  + py * f3  + ph[3]);
  }

  // ── Flow = gradient of φ rotated 90° → traces iso-contour lines ──
  const fd = 1.0;
  function flowAngle(px, py) {
    const dpx = (potential(px + fd, py) - potential(px - fd, py)) / (2 * fd);
    const dpy = (potential(px, py + fd) - potential(px, py - fd)) / (2 * fd);
    return Math.atan2(dpx, -dpy);
  }

  // ── Stroke style: thin, tightly spaced ──
  const spacing  = 9 + rng() * 5;                        // 9–14 px between ridges
  const sw       = (1.4 + rng() * 0.9).toFixed(1);       // 1.4–2.3 px stroke
  const stepLen  = 2.5;
  const maxSteps = Math.ceil((bw + bh) * 2.0 / stepLen);

  // ── Seeds: edges + interior grid ──
  const seeds = [];
  for (let sy = by; sy <= by + bh; sy += spacing) {
    seeds.push([bx, sy]);
    seeds.push([bx + bw, sy]);
  }
  for (let sx = bx; sx <= bx + bw; sx += spacing) {
    seeds.push([sx, by]);
    seeds.push([sx, by + bh]);
  }
  for (let sy = by + spacing; sy < by + bh; sy += spacing * 1.8) {
    for (let sx = bx + spacing; sx < bx + bw; sx += spacing * 1.8) {
      seeds.push([sx, sy]);
    }
  }

  // ── Trace paths ──
  const pathData = [];
  for (const [sx, sy] of seeds) {
    const pts = [[sx, sy]];
    let px = sx, py = sy;

    for (let s = 0; s < maxSteps; s++) {
      const a = flowAngle(px, py);
      px += Math.cos(a) * stepLen;
      py += Math.sin(a) * stepLen;
      if (px < bx - 10 || px > bx + bw + 10 || py < by - 10 || py > by + bh + 10) break;
      pts.push([px, py]);
    }

    if (pts.length < 4) continue;

    // Smooth via quadratic bezier through midpoints
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
