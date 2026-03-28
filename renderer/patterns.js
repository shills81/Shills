'use strict';

/**
 * patterns.js
 * Identity fingerprint pattern generator for the Lubies Factory Pass.
 *
 * Produces deterministic SVG fingerprint-style ridge patterns based on a
 * seeded RNG + pattern mode. Each token gets a unique, reproducible visual
 * identity mark that is subtly layered behind the main card content.
 *
 * Technique:
 *   Uses SVG <ellipse> elements with the `pathLength` attribute set to 360,
 *   allowing `stroke-dasharray` values to be expressed in "degree units."
 *   This makes it trivial to place gaps at specific angular positions around
 *   each ridge without complex path math.
 *
 *   Each ridge is a rotated, slightly warped ellipse with 1–3 gaps.
 *   Ridges expand outward concentrically from a core origin point.
 */

const { randFloat, randInt } = require('../utils/hashSeed');
const { PatternMode } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// Pattern configuration per mode
// ---------------------------------------------------------------------------

const PATTERN_CONFIGS = {
  [PatternMode.PROCEDURAL]: {
    ridgeCount:    { min: 18, max: 26 },
    coreRx:        { min: 14, max: 22 },
    coreRy:        { min: 9,  max: 16 },
    spreadX:       { min: 2.6, max: 3.4 },
    spreadY:       { min: 1.9, max: 2.6 },
    rotationRange: 360,
    rotWarpPerRidge: { min: -8, max: 8 },
    gapsPerRidge:  { inner: [1, 1], outer: [1, 3] },
    gapSize:       { min: 8, max: 22 },
    rxWarp:        { min: -6, max: 6 },
    ryWarp:        { min: -4, max: 4 },
  },
  [PatternMode.STRUCTURED]: {
    ridgeCount:    { min: 20, max: 28 },
    coreRx:        { min: 12, max: 18 },
    coreRy:        { min: 8,  max: 13 },
    spreadX:       { min: 2.4, max: 3.0 },
    spreadY:       { min: 1.7, max: 2.3 },
    rotationRange: 45,          // stays close to one angle — more orderly
    rotWarpPerRidge: { min: -3, max: 3 },
    gapsPerRidge:  { inner: [1, 1], outer: [2, 2] },
    gapSize:       { min: 10, max: 18 },
    rxWarp:        { min: -3, max: 3 },
    ryWarp:        { min: -2, max: 2 },
  },
  [PatternMode.RADIAL]: {
    ridgeCount:    { min: 16, max: 22 },
    coreRx:        { min: 8,  max: 14 },
    coreRy:        { min: 8,  max: 14 },   // near-circular
    spreadX:       { min: 3.0, max: 3.8 },
    spreadY:       { min: 3.0, max: 3.8 }, // uniform spread — concentric circles
    rotationRange: 180,
    rotWarpPerRidge: { min: -2, max: 2 },
    gapsPerRidge:  { inner: [2, 3], outer: [3, 5] },
    gapSize:       { min: 6, max: 14 },
    rxWarp:        { min: -2, max: 2 },
    ryWarp:        { min: -2, max: 2 },
  },
  [PatternMode.LOOP]: {
    ridgeCount:    { min: 22, max: 30 },
    coreRx:        { min: 18, max: 28 },
    coreRy:        { min: 10, max: 16 },   // tall, narrow loop
    spreadX:       { min: 2.2, max: 2.8 },
    spreadY:       { min: 1.6, max: 2.0 },
    rotationRange: 360,
    rotWarpPerRidge: { min: -6, max: 6 },
    gapsPerRidge:  { inner: [1, 1], outer: [1, 2] },
    gapSize:       { min: 5, max: 15 },
    rxWarp:        { min: -8, max: 8 },
    ryWarp:        { min: -5, max: 5 },
  },
  [PatternMode.ARCH]: {
    ridgeCount:    { min: 20, max: 26 },
    coreRx:        { min: 20, max: 30 },
    coreRy:        { min: 6,  max: 12 },   // very flat — arch-like
    spreadX:       { min: 2.8, max: 3.5 },
    spreadY:       { min: 2.0, max: 2.8 },
    rotationRange: 20,           // mostly upright
    rotWarpPerRidge: { min: -4, max: 4 },
    gapsPerRidge:  { inner: [1, 2], outer: [2, 3] },
    gapSize:       { min: 12, max: 28 },
    rxWarp:        { min: -10, max: 10 },
    ryWarp:        { min: -3,  max: 3  },
  },
};

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Generate a fingerprint-pattern SVG fragment (a <g> element string) for use
 * inside the pass card's background layer.
 *
 * @param {() => number} rng         Seeded RNG (already advanced past palette picks).
 * @param {string}       patternMode One of PatternMode values.
 * @param {object}       layout      Pass card layout parameters.
 * @param {number}       layout.cx   Horizontal center of pattern on card.
 * @param {number}       layout.cy   Vertical center of pattern on card.
 * @param {string}       color       Ridge stroke color (from palette).
 * @param {number}       opacity     Group opacity (from palette fingerprint config).
 * @returns {string}                 SVG <g>…</g> fragment.
 */
function generateFingerprintGroup(rng, patternMode, layout, color, opacity) {
  const cfg = PATTERN_CONFIGS[patternMode] || PATTERN_CONFIGS[PatternMode.PROCEDURAL];
  const { cx, cy } = layout;

  const ridgeCount   = randInt(rng, cfg.ridgeCount.min, cfg.ridgeCount.max);
  const coreRx       = randFloat(rng, cfg.coreRx.min, cfg.coreRx.max);
  const coreRy       = randFloat(rng, cfg.coreRy.min, cfg.coreRy.max);
  const spreadX      = randFloat(rng, cfg.spreadX.min, cfg.spreadX.max);
  const spreadY      = randFloat(rng, cfg.spreadY.min, cfg.spreadY.max);
  const baseRotation = randFloat(rng, 0, cfg.rotationRange);
  const strokeWidth  = randFloat(rng, 1.0, 1.6).toFixed(2);

  const ellipses = [];

  for (let i = 0; i < ridgeCount; i++) {
    const rx = coreRx + i * spreadX + randFloat(rng, cfg.rxWarp.min, cfg.rxWarp.max);
    const ry = coreRy + i * spreadY + randFloat(rng, cfg.ryWarp.min, cfg.ryWarp.max);

    if (rx <= 0 || ry <= 0) continue;

    const rot = baseRotation + randFloat(rng, cfg.rotWarpPerRidge.min, cfg.rotWarpPerRidge.max) * i;

    // Determine number of gaps — inner ridges have fewer
    const gapRange = i < 6 ? cfg.gapsPerRidge.inner : cfg.gapsPerRidge.outer;
    const numGaps  = randInt(rng, gapRange[0], gapRange[1]);

    // Generate non-overlapping gap positions (in 0–360 "degrees" on pathLength)
    const gaps = _generateGaps(rng, numGaps, cfg.gapSize);

    const dashArray = _dashArrayFromGaps(gaps);

    // Individual stroke-dashoffset to shift the pattern start per ridge
    const dashOffset = randFloat(rng, 0, 360).toFixed(1);

    ellipses.push(
      `<g transform="translate(${cx.toFixed(1)},${cy.toFixed(1)}) rotate(${rot.toFixed(2)})">` +
      `<ellipse cx="0" cy="0" rx="${rx.toFixed(2)}" ry="${ry.toFixed(2)}"` +
      ` fill="none"` +
      ` stroke="${color}"` +
      ` stroke-width="${strokeWidth}"` +
      ` pathLength="360"` +
      ` stroke-dasharray="${dashArray}"` +
      ` stroke-dashoffset="${dashOffset}"` +
      `/></g>`
    );
  }

  return (
    `<g opacity="${opacity.toFixed(3)}">\n  ` +
    ellipses.join('\n  ') +
    `\n</g>`
  );
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Generate `count` non-overlapping gaps on a 0–360 circle.
 * Returns sorted array of { start, size } objects.
 *
 * @param {() => number} rng
 * @param {number} count
 * @param {{ min: number, max: number }} sizeRange
 * @returns {Array<{ start: number, size: number }>}
 */
function _generateGaps(rng, count, sizeRange) {
  const gaps = [];
  const total = 360;
  // Simple approach: divide circle into `count` sectors and place a gap in each
  const sectorSize = total / count;

  for (let i = 0; i < count; i++) {
    const size  = randFloat(rng, sizeRange.min, sizeRange.max);
    // Gap starts at a random point within this sector
    const sectorStart = i * sectorSize;
    const maxStart = sectorStart + sectorSize - size;
    const start = maxStart > sectorStart
      ? randFloat(rng, sectorStart, maxStart)
      : sectorStart;

    gaps.push({ start, size });
  }

  return gaps.sort((a, b) => a.start - b.start);
}

/**
 * Convert a list of gaps into an SVG stroke-dasharray value string.
 * The ellipse must use `pathLength="360"` for the values to make sense.
 *
 * @param {Array<{ start: number, size: number }>} gaps  Sorted by start.
 * @returns {string}
 */
function _dashArrayFromGaps(gaps) {
  if (!gaps.length) return '360';  // solid — no gaps

  const parts = [];
  let pos = 0;

  for (const gap of gaps) {
    const filled = gap.start - pos;
    if (filled > 0) parts.push(filled.toFixed(1));
    if (gap.size  > 0) parts.push('0', gap.size.toFixed(1));
    pos = gap.start + gap.size;
  }

  // Remaining filled section to close the loop
  const remaining = 360 - pos;
  if (remaining > 0) parts.push(remaining.toFixed(1));

  // Compact: remove pairs of "0 X" where X is a gap — replace with single gap
  // Actually the format is: [fill gap fill gap ...] so just join
  return parts.filter((_, i) => parts[i] !== '0' || (i > 0 && parts[i - 1] !== undefined)).join(' ');
}

module.exports = {
  generateFingerprintGroup,
  PATTERN_CONFIGS,
};
