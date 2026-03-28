'use strict';

/**
 * palettes.js
 * Color palette definitions for the Lubies Factory Pass renderer.
 *
 * Card layout (portrait 560 × 760):
 *   bannerBg    — solid fill behind the RD pattern in the top banner zone
 *   ridgeColor  — stroke color for the winding RD fingerprint lines
 *   dividerColor — the accent stripe separating banner from info panel
 *   infoBg      — near-black background for the info section
 *   accent      — primary accent (title text, tier labels, highlights)
 *   accentDim   — muted accent (secondary text, dividers, captions)
 *   text        — primary white/light text
 *   textMuted   — secondary text
 *   statusColors — per-status dot/label colors
 *   silhouetteStroke — outline color for the PFP silhouette in the banner
 */

const { PaletteMode } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// Palette definitions
// ---------------------------------------------------------------------------

const PALETTES = {

  /**
   * Midnight — deep navy banner, gold lines, gold divider.
   * The default brand aesthetic for standard passes.
   */
  [PaletteMode.MIDNIGHT]: {
    bannerBg:         '#08101e',
    ridgeColor:       '#c9a84c',
    dividerColor:     '#c9a84c',
    infoBg:           '#0b0b10',
    accent:           '#c9a84c',
    accentDim:        '#c9a84c55',
    text:             '#f5f0e8',
    textMuted:        '#f5f0e888',
    silhouetteStroke: '#c9a84c',
    silhouetteFill:   '#06090f',
    cardBorder:       '#d4c08866',
    statusColors:     _defaultStatusColors(),
    swatchColors:     ['#c9a84c', '#d4af37', '#b8943a', '#7c6020'],
  },

  /**
   * Obsidian — pure black banner, silver/white lines, silver divider.
   */
  [PaletteMode.OBSIDIAN]: {
    bannerBg:         '#0a0a0a',
    ridgeColor:       '#c8c8c8',
    dividerColor:     '#c8c8c8',
    infoBg:           '#0d0d0d',
    accent:           '#e2e2e2',
    accentDim:        '#e2e2e244',
    text:             '#ffffff',
    textMuted:        '#ffffff88',
    silhouetteStroke: '#e2e2e2',
    silhouetteFill:   '#050505',
    cardBorder:       '#cccccc44',
    statusColors:     _defaultStatusColors(),
    swatchColors:     ['#e2e2e2', '#c8c8c8', '#a0a0a0', '#707070'],
  },

  /**
   * Genesis Deep — deep purple banner, lighter purple RD lines, amber divider.
   * Reserved for Genesis tier tokens.
   */
  [PaletteMode.GENESIS_DEEP]: {
    bannerBg:         '#110022',
    ridgeColor:       '#7c3aed',
    dividerColor:     '#e8883a',
    infoBg:           '#0d0010',
    accent:           '#a855f7',
    accentDim:        '#a855f744',
    text:             '#f0e6ff',
    textMuted:        '#f0e6ff88',
    silhouetteStroke: '#a855f7',
    silhouetteFill:   '#0a0015',
    cardBorder:       '#a855f755',
    statusColors: {
      ..._defaultStatusColors(),
      ENABLED: '#c084fc',
    },
    swatchColors:     ['#a855f7', '#7c3aed', '#c084fc', '#e8883a'],
  },

  /**
   * Builder Field — deep forest green banner, teal lines, green divider.
   */
  [PaletteMode.BUILDER_FIELD]: {
    bannerBg:         '#071209',
    ridgeColor:       '#4ade80',
    dividerColor:     '#4ade80',
    infoBg:           '#080d08',
    accent:           '#6ee7b7',
    accentDim:        '#6ee7b744',
    text:             '#dcfce7',
    textMuted:        '#dcfce788',
    silhouetteStroke: '#6ee7b7',
    silhouetteFill:   '#040804',
    cardBorder:       '#4ade8044',
    statusColors: {
      ..._defaultStatusColors(),
      ENABLED: '#86efac',
    },
    swatchColors:     ['#6ee7b7', '#4ade80', '#34d399', '#059669'],
  },

  /**
   * Partner Ember — deep crimson banner, rose lines, rose divider.
   */
  [PaletteMode.PARTNER_EMBER]: {
    bannerBg:         '#12020a',
    ridgeColor:       '#f43f5e',
    dividerColor:     '#f43f5e',
    infoBg:           '#0d0208',
    accent:           '#fb7185',
    accentDim:        '#fb718544',
    text:             '#ffe4e8',
    textMuted:        '#ffe4e888',
    silhouetteStroke: '#fb7185',
    silhouetteFill:   '#0a0206',
    cardBorder:       '#f43f5e44',
    statusColors: {
      ..._defaultStatusColors(),
      ENABLED: '#fda4af',
    },
    swatchColors:     ['#fb7185', '#f43f5e', '#fda4af', '#e11d48'],
  },

  /**
   * Tier Locked — pure black banner, platinum lines.
   * Reserved for Special tier tokens.
   */
  [PaletteMode.TIER_LOCKED]: {
    bannerBg:         '#050505',
    ridgeColor:       '#d4d4d4',
    dividerColor:     '#d4d4d4',
    infoBg:           '#080808',
    accent:           '#e5e5e5',
    accentDim:        '#e5e5e533',
    text:             '#fafafa',
    textMuted:        '#fafafa77',
    silhouetteStroke: '#d4d4d4',
    silhouetteFill:   '#020202',
    cardBorder:       '#d4d4d433',
    statusColors:     _defaultStatusColors(),
    swatchColors:     ['#e5e5e5', '#d4d4d4', '#a3a3a3', '#737373'],
  },

  /**
   * Reference Derived — dynamically generated per token.
   * This entry is a fallback template; referenceDerivedPalette() overrides it.
   */
  [PaletteMode.REFERENCE_DERIVED]: {
    _dynamic:         true,
    bannerBg:         '#0a0a0a',
    ridgeColor:       '#b0b0b0',
    dividerColor:     '#b0b0b0',
    infoBg:           '#0d0d0d',
    accent:           '#d0d0d0',
    accentDim:        '#d0d0d044',
    text:             '#f0f0f0',
    textMuted:        '#f0f0f088',
    silhouetteStroke: '#b0b0b0',
    silhouetteFill:   '#050505',
    cardBorder:       '#b0b0b033',
    statusColors:     _defaultStatusColors(),
    swatchColors:     [],   // overwritten by PFP extraction at render time
  },
};

// ---------------------------------------------------------------------------
// Reference-derived dynamic palette
// ---------------------------------------------------------------------------

/**
 * Generate a palette from the token's seeded RNG.
 * Produces a harmonious dark palette with a unique accent hue.
 *
 * @param {() => number} rng
 * @returns {object}
 */
function referenceDerivedPalette(rng) {
  const hue  = Math.floor(rng() * 360);
  const sat  = 50 + Math.floor(rng() * 30);
  const bgl  = 4 + Math.floor(rng() * 4);    // banner bg: very dark 4-8%
  const rl   = 40 + Math.floor(rng() * 25);   // ridge color L: 40-65%
  const al   = 58 + Math.floor(rng() * 22);   // accent L: 58-80%

  const bannerBg         = hsl(hue, sat, bgl);
  const ridgeColor       = hsl(hue, sat + 10, rl);
  const accent           = hsl(hue, sat + 10, al);
  const infoBg           = hsl(hue, 15, 5);

  // Derive 4 hue-matched swatches spanning light → dark for static fallback
  const swatchColors = [
    hsl(hue, sat + 10, al),
    hsl(hue, sat + 5,  al - 12),
    hsl(hue, sat,      rl),
    hsl(hue, sat - 10, rl - 12),
  ];

  return {
    bannerBg,
    ridgeColor,
    dividerColor:     accent,
    infoBg,
    accent,
    accentDim:        accent + '44',
    text:             '#f5f5f5',
    textMuted:        '#f5f5f588',
    silhouetteStroke: accent,
    silhouetteFill:   hsl(hue, sat, 2),
    cardBorder:       accent + '44',
    statusColors:     _defaultStatusColors(),
    swatchColors,
  };
}

// ---------------------------------------------------------------------------
// Palette resolver
// ---------------------------------------------------------------------------

/**
 * Resolve the active palette for a token.
 *
 * @param {string} paletteMode
 * @param {() => number} rng  Used only if palette is dynamic.
 * @returns {object}
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
    PENDING:  '#6b7280',
    ENABLED:  '#4ade80',
    DISABLED: '#f87171',
    UPGRADED: '#60a5fa',
    REVOKED:  '#f43f5e',
  };
}

module.exports = {
  PALETTES,
  resolvePalette,
  referenceDerivedPalette,
};
