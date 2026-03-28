'use strict';

/**
 * patterns.js
 * Fingerprint whorl pattern — concentric oval ridges matching the Lubies
 * fingerprint logo aesthetic.
 *
 * Generates closed oval paths that radiate outward from a whorl center,
 * each with subtle organic perturbation so the ridges look hand-drawn and
 * alive rather than mechanical.
 *
 * Visual reference: the Lubies fingerprint logo (FP_PNG in logos.js)
 *   — tight concentric rings, uniform stroke weight, ~10-13 px spacing
 *   — slightly oval (not perfectly circular), whorl center near middle
 *   — each ridge a single smooth closed loop
 */

const TAU = Math.PI * 2;

/**
 * @param {function} rng        — seeded random, returns [0,1)
 * @param {object}   bounds     — { x, y, w, h } banner rectangle
 * @param {string}   strokeColor
 * @param {object}   [center]   — optional { cx, cy } absolute whorl center; defaults to near-center of bounds
 * @returns {string}            SVG <g> element containing all ridge paths
 */
function generateRDPattern(rng, bounds, strokeColor, center) {
  const { x: bx, y: by, w: bw, h: bh } = bounds;

  // ── Whorl center ─────────────────────────────────────────────────────────────
  // If caller provides an explicit center (e.g. aligned with PFP subject),
  // use it with a small random drift for organic feel.
  // Otherwise default to near-center of the banner.
  const driftX = bw * (rng() * 0.06 - 0.03);   // ±3% drift
  const driftY = bh * (rng() * 0.06 - 0.03);
  const cx = center ? center.cx + driftX : bx + bw * (0.42 + rng() * 0.16);
  const cy = center ? center.cy + driftY : by + bh * (0.38 + rng() * 0.24);

  // Oval aspect ratio: < 1 = horizontally wider, > 1 = vertically taller
  const ar = 0.72 + rng() * 0.36;   // 0.72–1.08

  // ── Organic perturbation ─────────────────────────────────────────────────────
  // Low-frequency angular distortion (varies per ridge angle, not per pixel)
  // This gives the "natural hand-drawn fingerprint" wobble
  const nHarmonics = 6;
  const harmAmp  = Array.from({ length: nHarmonics }, (_, i) =>
    (7 + rng() * 9) / (i + 1)      // amplitude falls off with harmonic #
  );
  const harmPh   = Array.from({ length: nHarmonics }, () => rng() * TAU);

  // Slow spatial drift — very subtle positional offset so adjacent rings
  // don't sit exactly parallel (adds the slight irregularity of a real print)
  const driftAmp = 2.5 + rng() * 2.5;
  const driftFx  = 0.012 + rng() * 0.008;
  const driftFy  = 0.009 + rng() * 0.007;
  const driftPh  = rng() * TAU;

  // ── Ring parameters ───────────────────────────────────────────────────────────
  // Match the fingerprint logo's visual density:
  //   Logo 144 px → ~5 rings in 144 px → spacing ≈ 22-26 px
  //   Scaled to banner: keep spacing in the same pixel-density range
  const spacing = 11 + rng() * 3;           // 11–14 px  (tight like the logo)
  const sw      = (1.6 + rng() * 0.7).toFixed(2);  // 1.6–2.3 px stroke weight

  // Points per ring — enough for a smooth closed curve at banner scale
  const STEPS = 240;

  // Max radial distance needed to guarantee coverage beyond all banner corners
  const cornerDist = Math.max(
    Math.hypot(bx - cx, by - cy),
    Math.hypot(bx + bw - cx, by - cy),
    Math.hypot(bx - cx, by + bh - cy),
    Math.hypot(bx + bw - cx, by + bh - cy),
  );
  const maxR = cornerDist + spacing;

  // ── Build ring paths ──────────────────────────────────────────────────────────
  const pathData = [];

  for (let r = spacing * 0.4; r <= maxR; r += spacing) {
    const pts = [];

    for (let i = 0; i <= STEPS; i++) {
      const theta = (i / STEPS) * TAU;
      const cosT  = Math.cos(theta);
      const sinT  = Math.sin(theta);

      // Base oval point
      let px = cx + r * cosT;
      let py = cy + (r / ar) * sinT;

      // Angular perturbation: sum of harmonics (distorts the ring shape)
      let angPerturb = 0;
      for (let h = 0; h < nHarmonics; h++) {
        angPerturb += harmAmp[h] * Math.sin((h + 1) * theta + harmPh[h]);
      }

      // Spatial drift (position-based, very low frequency)
      const drift = driftAmp * Math.sin(px * driftFx + py * driftFy + driftPh);

      // Apply perturbation radially (pushes ridge in/out from center)
      const pertR    = angPerturb + drift;
      const radialAng = Math.atan2(py - cy, px - cx);
      px += pertR * Math.cos(radialAng);
      py += pertR * Math.sin(radialAng);

      pts.push([px, py]);
    }

    // Skip rings that are entirely outside the banner (with padding)
    const pad = 30;
    const anyVisible = pts.some(
      ([px, py]) => px >= bx - pad && px <= bx + bw + pad &&
                    py >= by - pad && py <= by + bh + pad
    );
    if (!anyVisible) continue;

    // Smooth closed path using quadratic bézier through midpoints
    // (same technique as the original, gives the logo's flowing curves)
    let d = `M ${((pts[0][0] + pts[STEPS][0]) / 2).toFixed(1)} ${((pts[0][1] + pts[STEPS][1]) / 2).toFixed(1)}`;
    for (let i = 0; i < STEPS; i++) {
      const cpx = pts[i][0].toFixed(1);
      const cpy = pts[i][1].toFixed(1);
      const ex  = ((pts[i][0] + pts[i + 1][0]) / 2).toFixed(1);
      const ey  = ((pts[i][1] + pts[i + 1][1]) / 2).toFixed(1);
      d += ` Q ${cpx} ${cpy} ${ex} ${ey}`;
    }
    d += ' Z';

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
