'use strict';

/**
 * passRenderer.js
 * SVG pass renderer for the Lubies Factory Pass.
 *
 * Produces a deterministic, token-unique SVG for each pass.
 * The same tokenId + passData always produces the same SVG output.
 *
 * Card dimensions: 856 × 540 (standard ID card 1.586:1 ratio at 100px/mm scale)
 *
 * Visual layer order (bottom → top):
 *   1. Background gradient
 *   2. Grain/noise texture overlay
 *   3. Identity fingerprint pattern (subtle, behind content)
 *   4. Top header bar
 *   5. Header content (wordmark, monogram)
 *   6. Lanyard indicator (if enabled)
 *   7. Main content (pass number, tier, status, edition)
 *   8. Bottom bar
 *   9. Bottom bar content
 *  10. Premium holographic overlay (if premium)
 *  11. Card border
 *
 * All functions are pure — no file I/O happens here.
 * Use scripts/exportBundle.js for disk output.
 */

const { resolvePalette }            = require('./palettes');
const { generateFingerprintGroup }  = require('./patterns');
const { generateTokenTraits }       = require('../metadata/traits');
const { rngForToken }               = require('../utils/hashSeed');

// ---------------------------------------------------------------------------
// Card geometry constants
// ---------------------------------------------------------------------------

const CARD = {
  width:   856,
  height:  540,
  rx:      32,
  // Fingerprint pattern center — offset right to leave left content clean
  fpCx:    580,
  fpCy:    280,
};

// ---------------------------------------------------------------------------
// Main entry: generateTokenImage
// ---------------------------------------------------------------------------

/**
 * Generate the complete SVG string for a Lubies Factory Pass token.
 *
 * @param {number|bigint} tokenId   ERC721 token ID.
 * @param {object}        passData  Onchain PassData fields.
 * @param {object}        [config]  Optional overrides.
 * @param {string}        [config.salt]  Generation salt.
 * @returns {string}               Complete SVG document string.
 */
function generateTokenImage(tokenId, passData, config = {}) {
  const id     = Number(tokenId);
  const traits = generateTokenTraits(tokenId, passData, config);

  // Seeded RNG for palette resolution (reference-derived palettes)
  const paletteRng  = rngForToken(tokenId, 'palette', config.salt);
  const palette     = resolvePalette(traits.paletteMode, paletteRng);

  // Separate RNG for fingerprint — keeps fingerprint independent of palette resolution
  const patternRng  = rngForToken(tokenId, 'pattern', config.salt);

  const fingerprintGroup = generateFingerprintGroup(
    patternRng,
    traits.patternMode,
    { cx: CARD.fpCx, cy: CARD.fpCy },
    palette.fingerprint.color,
    palette.fingerprint.opacity,
  );

  const statusColor = _statusColor(traits._status, palette);
  const paddedId    = String(id).padStart(4, '0');

  return _composeSVG({
    id,
    paddedId,
    traits,
    palette,
    fingerprintGroup,
    statusColor,
  });
}

// ---------------------------------------------------------------------------
// SVG composition
// ---------------------------------------------------------------------------

function _composeSVG({ id, paddedId, traits, palette, fingerprintGroup, statusColor }) {
  const p = palette;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.width} ${CARD.height}" width="${CARD.width}" height="${CARD.height}" role="img" aria-label="Lubies Factory Pass #${paddedId}">

  <defs>
    ${_defs(id, p, traits)}
  </defs>

  <!-- 1. Background -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}" fill="url(#bg-${id})"/>

  <!-- 2. Grain texture -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}" fill="url(#grain-${id})" opacity="${p.grain}"/>

  <!-- 3. Identity fingerprint pattern -->
  ${fingerprintGroup}

  <!-- 4. Top header bar -->
  <rect x="0" y="0" width="${CARD.width}" height="76" rx="${CARD.rx}" ry="0"
        fill="${p.topBar.color}" fill-opacity="${p.topBar.opacity}"/>
  <rect x="0" y="${CARD.rx}" width="${CARD.width}" height="${76 - CARD.rx}"
        fill="${p.topBar.color}" fill-opacity="${p.topBar.opacity}"/>

  <!-- 5. Header content -->
  ${_header(p)}

  <!-- 6. Lanyard indicator -->
  ${traits.lanyard === 'True' ? _lanyardIndicator(p) : ''}

  <!-- 7. Main content -->
  ${_mainContent(paddedId, traits, p, statusColor)}

  <!-- 8–9. Bottom bar -->
  ${_bottomBar(id, paddedId, traits, p)}

  <!-- 10. Premium holographic overlay -->
  ${traits.premium === 'True' ? _holoOverlay(id) : ''}

  <!-- 11. Card border -->
  <rect x="1" y="1" width="${CARD.width - 2}" height="${CARD.height - 2}" rx="${CARD.rx - 1}"
        fill="none" stroke="${p.border.color}" stroke-width="1"
        stroke-opacity="${p.border.opacity}"/>

</svg>`.trim();
}

// ---------------------------------------------------------------------------
// SVG <defs>
// ---------------------------------------------------------------------------

function _defs(id, p, traits) {
  const grainId = `grain-${id}`;
  const bgId    = `bg-${id}`;
  const holoId  = `holo-${id}`;

  return `
    <linearGradient id="${bgId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="${p.bg0}"/>
      <stop offset="100%" stop-color="${p.bg1}"/>
    </linearGradient>

    <filter id="${grainId}" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4"
                    stitchTiles="stitch" result="noise"/>
      <feColorMatrix type="saturate" values="0" in="noise" result="grey"/>
      <feBlend in="SourceGraphic" in2="grey" mode="multiply" result="blend"/>
      <feComposite in="blend" in2="SourceGraphic" operator="in"/>
    </filter>

    <pattern id="${grainId}" x="0" y="0" width="200" height="200" patternUnits="userSpaceOnUse">
      <rect width="200" height="200" fill="transparent"/>
      <filter id="fnoise-${id}">
        <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="4" stitchTiles="stitch"/>
        <feColorMatrix type="saturate" values="0"/>
      </filter>
      <rect width="200" height="200" filter="url(#fnoise-${id})" opacity="1"/>
    </pattern>

    ${traits.premium === 'True' ? `
    <linearGradient id="${holoId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%"   stop-color="#ff0080" stop-opacity="0.12"/>
      <stop offset="16%"  stop-color="#ff8000" stop-opacity="0.08"/>
      <stop offset="33%"  stop-color="#ffff00" stop-opacity="0.10"/>
      <stop offset="50%"  stop-color="#00ff80" stop-opacity="0.12"/>
      <stop offset="66%"  stop-color="#0080ff" stop-opacity="0.10"/>
      <stop offset="83%"  stop-color="#8000ff" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#ff0080" stop-opacity="0.12"/>
    </linearGradient>
    <linearGradient id="${holoId}-shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%"   stop-color="#ffffff" stop-opacity="0.07"/>
      <stop offset="40%"  stop-color="#ffffff" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.00"/>
    </linearGradient>` : ''}
  `;
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function _header(p) {
  return `
  <!-- Wordmark -->
  <text x="44" y="42" font-family="'Courier New', Courier, monospace"
        font-size="14" font-weight="700" fill="${p.accent}"
        letter-spacing="5" text-rendering="geometricPrecision">LUBIES</text>
  <text x="44" y="62" font-family="'Courier New', Courier, monospace"
        font-size="11" font-weight="400" fill="${p.accentDim}"
        letter-spacing="7.5" text-rendering="geometricPrecision">FACTORY</text>

  <!-- LF monogram (top-right) -->
  <g transform="translate(806, 38)">
    <polygon points="0,-18 15.6,9 -15.6,9"
             fill="none" stroke="${p.accent}" stroke-width="1.4" opacity="0.85"/>
    <text x="0" y="5.5" font-family="'Courier New', Courier, monospace"
          font-size="10" font-weight="700" fill="${p.accent}"
          text-anchor="middle" letter-spacing="0.5">LF</text>
  </g>`;
}

// ---------------------------------------------------------------------------
// Lanyard
// ---------------------------------------------------------------------------

function _lanyardIndicator(p) {
  return `
  <!-- Lanyard indicator -->
  <circle cx="428" cy="10" r="9"
          fill="${p.bg0}" stroke="${p.lanyardColor}"
          stroke-width="1.5" opacity="0.9"/>
  <line x1="428" y1="19" x2="428" y2="50"
        stroke="${p.lanyardColor}" stroke-width="1.5" opacity="0.5"/>`;
}

// ---------------------------------------------------------------------------
// Main content
// ---------------------------------------------------------------------------

function _mainContent(paddedId, traits, p, statusColor) {
  const tierBadgeWidth = _tierBadgeWidth(traits.accessTier);

  return `
  <!-- Pass number -->
  <text x="50" y="195" font-family="'Courier New', Courier, monospace"
        font-size="68" font-weight="700" fill="${p.text}"
        letter-spacing="-2" text-rendering="geometricPrecision">#${paddedId}</text>

  <!-- Pass type label -->
  <text x="52" y="232" font-family="'Courier New', Courier, monospace"
        font-size="12" font-weight="400" fill="${p.accent}"
        letter-spacing="5.5" text-rendering="geometricPrecision">FACTORY PASS</text>

  <!-- Horizontal rule -->
  <line x1="50" y1="256" x2="420" y2="256"
        stroke="${p.accent}" stroke-width="0.5" opacity="0.35"/>

  <!-- Access tier badge -->
  <rect x="50" y="272" width="${tierBadgeWidth}" height="26" rx="13"
        fill="${p.accent}" fill-opacity="0.12"
        stroke="${p.accent}" stroke-width="0.75" stroke-opacity="0.7"/>
  <text x="${50 + tierBadgeWidth / 2}" y="289"
        font-family="'Courier New', Courier, monospace"
        font-size="10" font-weight="600" fill="${p.accent}"
        text-anchor="middle" letter-spacing="2.5"
        text-rendering="geometricPrecision">${traits.accessTier.toUpperCase()}</text>

  <!-- Status indicator -->
  <circle cx="52" cy="330" r="5" fill="${statusColor}"/>
  <text x="66" y="335" font-family="'Courier New', Courier, monospace"
        font-size="11" font-weight="400" fill="${p.textMuted}"
        letter-spacing="2" text-rendering="geometricPrecision">${traits.status.toUpperCase()}</text>

  <!-- Edition label -->
  <text x="50" y="392" font-family="'Courier New', Courier, monospace"
        font-size="10" font-weight="400" fill="${p.textMuted}"
        letter-spacing="3.5" text-rendering="geometricPrecision">EDITION</text>
  <text x="50" y="420" font-family="'Courier New', Courier, monospace"
        font-size="24" font-weight="700" fill="${p.text}"
        letter-spacing="3" text-rendering="geometricPrecision">${traits.edition}</text>

  <!-- Genesis marker -->
  ${traits.genesis === 'True' ? `
  <text x="50" y="456" font-family="'Courier New', Courier, monospace"
        font-size="9" font-weight="600" fill="${p.accent}"
        letter-spacing="4" text-rendering="geometricPrecision" opacity="0.75">◆ GENESIS</text>` : ''}

  <!-- Premium marker -->
  ${traits.premium === 'True' ? `
  <text x="160" y="456" font-family="'Courier New', Courier, monospace"
        font-size="9" font-weight="600" fill="${p.accent}"
        letter-spacing="4" text-rendering="geometricPrecision" opacity="0.75">◈ PREMIUM</text>` : ''}`;
}

// ---------------------------------------------------------------------------
// Bottom bar
// ---------------------------------------------------------------------------

function _bottomBar(id, paddedId, traits, p) {
  return `
  <!-- Bottom bar background -->
  <rect x="0" y="492" width="${CARD.width}" height="48" rx="0" ry="0"
        fill="${p.bottomBar.color}" fill-opacity="${p.bottomBar.opacity}"/>
  <rect x="0" y="${540 - CARD.rx}" width="${CARD.width}" height="${CARD.rx}"
        fill="${p.bottomBar.color}" fill-opacity="${p.bottomBar.opacity}" rx="${CARD.rx}"/>

  <!-- Bottom left: token ID + collection -->
  <text x="50" y="522" font-family="'Courier New', Courier, monospace"
        font-size="9" font-weight="400" fill="${p.accent}"
        letter-spacing="3" opacity="0.65" text-rendering="geometricPrecision">LUBIES FACTORY PASS · TOKEN ${paddedId}</text>

  <!-- Bottom right: lanyard / pattern indicators -->
  <text x="${CARD.width - 50}" y="522"
        font-family="'Courier New', Courier, monospace"
        font-size="9" font-weight="400" fill="${p.textMuted}"
        text-anchor="end" letter-spacing="2" opacity="0.55"
        text-rendering="geometricPrecision">${_bottomRightLine(traits)}</text>`;
}

// ---------------------------------------------------------------------------
// Premium holographic overlay
// ---------------------------------------------------------------------------

function _holoOverlay(id) {
  return `
  <!-- Holographic shimmer -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}"
        fill="url(#holo-${id})" pointer-events="none"/>
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}"
        fill="url(#holo-${id}-shine)" pointer-events="none"/>`;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _statusColor(status, palette) {
  const map = {
    0: palette.statusColors.PENDING,
    1: palette.statusColors.ENABLED,
    2: palette.statusColors.DISABLED,
    3: palette.statusColors.UPGRADED,
    4: palette.statusColors.REVOKED,
  };
  return map[status] || palette.statusColors.PENDING;
}

function _tierBadgeWidth(tierLabel) {
  const lengths = {
    Standard: 110,
    Builder:  104,
    Partner:  108,
    Genesis:  112,
    Special:  106,
  };
  return lengths[tierLabel] || 110;
}

function _bottomRightLine(traits) {
  const parts = [];
  if (traits.lanyard === 'True') parts.push('LANYARD');
  parts.push(traits.patternMode.toUpperCase());
  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/**
 * Generate a Base64-encoded data URI for the SVG (for inline use).
 *
 * @param {number|bigint} tokenId
 * @param {object}        passData
 * @param {object}        [config]
 * @returns {string}  data:image/svg+xml;base64,...
 */
function generateTokenImageDataURI(tokenId, passData, config = {}) {
  const svg = generateTokenImage(tokenId, passData, config);
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

module.exports = {
  generateTokenImage,
  generateTokenImageDataURI,
  CARD,
};
