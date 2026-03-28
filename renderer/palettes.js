'use strict';

/**
 * palettes.js
 * Color palette definitions for the Lubies Factory Pass renderer.
 *
 * Each palette is keyed by its PaletteMode string and defines:
 *   bg0, bg1          — gradient start/end for card background
 *   accent            — primary accent color (borders, labels, highlights)
 *   accentDim         — muted version of accent (secondary text, dividers)
 *   text              — primary text color
 *   textMuted         — secondary text color
 *   statusColors      — per-status indicator colors
 *   fingerprint       — fingerprint ridge stroke color + opacity
 *   grain             — noise texture overlay opacity
 *   topBar            — header bar fill color + opacity
 *   bottomBar         — footer bar fill color + opacity
 *   border            — card border color + opacity
 *   lanyardColor      — lanyard/hole accent color
 */

const { PaletteMode } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// Palette definitions
// ---------------------------------------------------------------------------

const PALETTES = {

  /**
   * Midnight — deep navy to black, warm gold accents.
   * The default brand-locked aesthetic for standard passes.
   */
  [PaletteMode.MIDNIGHT]: {
    bg0:         '#0a0a14',
    bg1:         '#141428',
    accent:      '#c9a84c',
    accentDim:   '#c9a84c66',
    text:        '#f5f0e8',
    textMuted:   '#f5f0e899',
    fingerprint: { color: '#c9a84c', opacity: 0.11 },
    grain:       0.04,
    topBar:      { color: '#000000', opacity: 0.28 },
    bottomBar:   { color: '#000000', opacity: 0.32 },
    border:      { color: '#c9a84c', opacity: 0.25 },
    lanyardColor: '#c9a84c',
    statusColors: _defaultStatusColors(),
  },

  /**
   * Obsidian — pure blacks and charcoal, silver-white accents.
   * Clean, editorial.
   */
  [PaletteMode.OBSIDIAN]: {
    bg0:         '#111111',
    bg1:         '#1c1c1c',
    accent:      '#e8e8e8',
    accentDim:   '#e8e8e855',
    text:        '#ffffff',
    textMuted:   '#ffffff88',
    fingerprint: { color: '#ffffff', opacity: 0.09 },
    grain:       0.05,
    topBar:      { color: '#000000', opacity: 0.35 },
    bottomBar:   { color: '#000000', opacity: 0.38 },
    border:      { color: '#ffffff', opacity: 0.18 },
    lanyardColor: '#e8e8e8',
    statusColors: {
      ...(_defaultStatusColors()),
      ENABLED: '#f0f0f0',
    },
  },

  /**
   * Genesis Deep — dark violet to near-black, electric purple accents.
   * Reserved for Genesis tier tokens.
   */
  [PaletteMode.GENESIS_DEEP]: {
    bg0:         '#0d0020',
    bg1:         '#1a0040',
    accent:      '#a855f7',
    accentDim:   '#a855f755',
    text:        '#f0e6ff',
    textMuted:   '#f0e6ff88',
    fingerprint: { color: '#a855f7', opacity: 0.14 },
    grain:       0.04,
    topBar:      { color: '#05000f', opacity: 0.40 },
    bottomBar:   { color: '#05000f', opacity: 0.45 },
    border:      { color: '#a855f7', opacity: 0.35 },
    lanyardColor: '#c084fc',
    statusColors: {
      ...(_defaultStatusColors()),
      ENABLED: '#c084fc',
    },
  },

  /**
   * Builder Field — deep forest green, bronze/amber accents.
   * For Builder tier passes.
   */
  [PaletteMode.BUILDER_FIELD]: {
    bg0:         '#0a1a0f',
    bg1:         '#1a3020',
    accent:      '#6ee7b7',
    accentDim:   '#6ee7b755',
    text:        '#dcfce7',
    textMuted:   '#dcfce799',
    fingerprint: { color: '#6ee7b7', opacity: 0.12 },
    grain:       0.04,
    topBar:      { color: '#050f08', opacity: 0.32 },
    bottomBar:   { color: '#050f08', opacity: 0.36 },
    border:      { color: '#6ee7b7', opacity: 0.25 },
    lanyardColor: '#86efac',
    statusColors: {
      ...(_defaultStatusColors()),
      ENABLED: '#86efac',
    },
  },

  /**
   * Partner Ember — deep burgundy to near-black, rose-gold accents.
   * For Partner tier passes.
   */
  [PaletteMode.PARTNER_EMBER]: {
    bg0:         '#1a0008',
    bg1:         '#2d0015',
    accent:      '#fb7185',
    accentDim:   '#fb718555',
    text:        '#ffe4e8',
    textMuted:   '#ffe4e899',
    fingerprint: { color: '#fb7185', opacity: 0.12 },
    grain:       0.04,
    topBar:      { color: '#0f0004', opacity: 0.35 },
    bottomBar:   { color: '#0f0004', opacity: 0.38 },
    border:      { color: '#fb7185', opacity: 0.28 },
    lanyardColor: '#fda4af',
    statusColors: {
      ...(_defaultStatusColors()),
      ENABLED: '#fda4af',
    },
  },

  /**
   * Tier Locked — used for Special tier.
   * Pure black, platinum/white accents. Deliberately restrained.
   */
  [PaletteMode.TIER_LOCKED]: {
    bg0:         '#080808',
    bg1:         '#101010',
    accent:      '#d4d4d4',
    accentDim:   '#d4d4d444',
    text:        '#fafafa',
    textMuted:   '#fafafa77',
    fingerprint: { color: '#ffffff', opacity: 0.08 },
    grain:       0.06,
    topBar:      { color: '#000000', opacity: 0.50 },
    bottomBar:   { color: '#000000', opacity: 0.55 },
    border:      { color: '#d4d4d4', opacity: 0.22 },
    lanyardColor: '#e5e5e5',
    statusColors: _defaultStatusColors(),
  },

  /**
   * Reference Derived — seed-generated palette.
   * This entry acts as a template; the actual colors are computed at render time
   * by referenceDerivedPalette() below and injected over this template.
   */
  [PaletteMode.REFERENCE_DERIVED]: {
    _dynamic: true,  // signal to renderer to call referenceDerivedPalette()
    // Fallback if dynamic generation fails
    bg0:         '#0a0a0a',
    bg1:         '#181818',
    accent:      '#b0b0b0',
    accentDim:   '#b0b0b055',
    text:        '#f0f0f0',
    textMuted:   '#f0f0f088',
    fingerprint: { color: '#b0b0b0', opacity: 0.10 },
    grain:       0.04,
    topBar:      { color: '#000000', opacity: 0.30 },
    bottomBar:   { color: '#000000', opacity: 0.33 },
    border:      { color: '#b0b0b0', opacity: 0.20 },
    lanyardColor: '#c0c0c0',
    statusColors: _defaultStatusColors(),
  },
};

// ---------------------------------------------------------------------------
// Reference-derived dynamic palette
// ---------------------------------------------------------------------------

/**
 * Generate a palette dynamically from the token's render seed.
 * Used when paletteMode === PaletteMode.REFERENCE_DERIVED.
 *
 * Produces a harmonious palette from a seeded hue value so every token
 * has a unique but coherent color identity.
 *
 * @param {() => number} rng  Seeded RNG (from rngForToken(id, 'palette')).
 * @returns {object}          Palette object (same shape as PALETTES entries).
 */
function referenceDerivedPalette(rng) {
  // Pick a hue in HSL — bias toward the low end (blue/teal/violet)
  // so the card always looks dark and brand-appropriate.
  const hue        = Math.floor(rng() * 360);
  const saturation = 40 + Math.floor(rng() * 30);   // 40–70%
  const lightness0 = 5  + Math.floor(rng() * 5);    // bg0: 5–10%  (very dark)
  const lightness1 = 10 + Math.floor(rng() * 8);    // bg1: 10–18%

  const accentL = 55 + Math.floor(rng() * 20);      // accent: 55–75% L
  const accentS = 60 + Math.floor(rng() * 30);      // accent: 60–90% S

  const bg0   = hsl(hue, saturation, lightness0);
  const bg1   = hsl(hue, saturation, lightness1);
  const accent = hsl(hue, accentS, accentL);

  return {
    bg0,
    bg1,
    accent,
    accentDim:   accent + '55',
    text:        '#f5f5f5',
    textMuted:   '#f5f5f599',
    fingerprint: { color: accent, opacity: 0.11 },
    grain:       0.04,
    topBar:      { color: '#000000', opacity: 0.30 },
    bottomBar:   { color: '#000000', opacity: 0.33 },
    border:      { color: accent, opacity: 0.22 },
    lanyardColor: accent,
    statusColors: _defaultStatusColors(),
  };
}

// ---------------------------------------------------------------------------
// Palette resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the active palette for a token.
 * Handles the dynamic (reference-derived) case by generating on the fly.
 *
 * @param {string} paletteMode  From traits.paletteMode.
 * @param {() => number} rng    Seeded RNG for this token (used if dynamic).
 * @returns {object}            A resolved palette object.
 */
function resolvePalette(paletteMode, rng) {
  const palette = PALETTES[paletteMode] || PALETTES[PaletteMode.MIDNIGHT];

  if (palette._dynamic) {
    return { ...palette, ...referenceDerivedPalette(rng) };
  }

  return palette;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function hsl(h, s, l) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function _defaultStatusColors() {
  return {
    PENDING:  '#6b7280',  // grey
    ENABLED:  '#4ade80',  // green
    DISABLED: '#f87171',  // red
    UPGRADED: '#60a5fa',  // blue
    REVOKED:  '#f43f5e',  // rose
  };
}

module.exports = {
  PALETTES,
  resolvePalette,
  referenceDerivedPalette,
};
