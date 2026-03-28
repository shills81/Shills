'use strict';

/**
 * passRenderer.js
 * SVG pass renderer for the Lubies Factory Pass — portrait badge format.
 *
 * Card dimensions: 560 × 760 px (portrait, ~3:4 ratio)
 *
 * Visual layer order (bottom → top):
 *
 *   CARD SHELL
 *     1. Card background (infoBg, full card)
 *     2. Thin cream card border
 *
 *   BANNER ZONE  (0 → CARD.bannerH)
 *     3. Banner background fill (bannerBg)
 *     4. RD fingerprint pattern (winding contour lines, clipped to banner)
 *     5. PFP silhouette (dark filled shapes + accent outline, clipped to banner)
 *
 *   DIVIDER      (CARD.bannerH → CARD.dividerBottom)
 *     6. Colored accent stripe (dividerColor)
 *
 *   INFO PANEL   (CARD.dividerBottom → CARD.height)
 *     7. Info background (infoBg, already from card fill)
 *     8. "FACTORY PASS" title
 *     9. STATUS / TOKEN / ID rows + divider lines
 *    10. Access tier label
 *    11. Color code grid (Genesis/premium tokens only)
 *    12. Lubies logo mark + MFMB fingerprint mark (bottom row)
 *
 *   LANYARD (optional)
 *    13. D-ring indicator at top-center (if lanyard=true)
 */

const { resolvePalette }     = require('./palettes');
const { generateRDPattern }  = require('./patterns');
const { generateTokenTraits } = require('../metadata/traits');
const { rngForToken }         = require('../utils/hashSeed');
const { PassStatus }          = require('../metadata/traits');
const { fingerprintLogo, lubiesLLogo } = require('./logos');

// ---------------------------------------------------------------------------
// Card geometry constants
// ---------------------------------------------------------------------------

const CARD = {
  width:     560,
  height:    760,
  rx:        34,         // outer corner radius
  brd:       13,         // cream frame border width
  brdColor:  '#cbb99a', // cream/tan frame colour (matches reference)
  bannerH:   412,        // y where banner ends (from card top, incl. border)
  dividerH:  3,          // thin gold line
  get irx()         { return this.rx - this.brd; },          // inner rx: 21
  get ix()          { return this.brd; },                    // inner x: 13
  get iy()          { return this.brd; },                    // inner y: 13
  get iw()          { return this.width  - this.brd * 2; }, // inner w: 534
  get ih()          { return this.height - this.brd * 2; }, // inner h: 734
  get dividerY()    { return this.bannerH; },
  get dividerBottom(){ return this.bannerH + this.dividerH; },
  get infoY()       { return this.dividerBottom; },
  get infoH()       { return this.height - this.dividerBottom; },
  get infoLeft()    { return this.ix + 22; },                // 35
  get infoRight()   { return this.width - this.ix - 22; },  // 525
};

// ---------------------------------------------------------------------------
// Main entry: generateTokenImage
// ---------------------------------------------------------------------------

/**
 * Generate the complete SVG string for a Lubies Factory Pass token.
 *
 * @param {number|bigint} tokenId
 * @param {object}        passData   Onchain PassData fields.
 * @param {object}        [config]
 * @param {string}        [config.salt]
 * @param {object|null}   [pfpData]  Optional PFP from loadPFP(). When provided,
 *                                   the image is embedded in the banner with a
 *                                   palette-matched silhouette filter.
 * @returns {string}  Complete SVG document string.
 */
function generateTokenImage(tokenId, passData, config = {}, pfpData = null) {
  const id     = Number(tokenId);
  const traits = generateTokenTraits(tokenId, passData, config);

  const paletteRng = rngForToken(tokenId, 'palette', config.salt);
  const palette    = resolvePalette(traits.paletteMode, paletteRng);

  // PFP swatches take priority over palette defaults
  const swatches = (pfpData && pfpData.swatches && pfpData.swatches.length >= 3)
    ? pfpData.swatches
    : (palette.swatchColors || []);

  // Ridge colour: pick the most vibrant swatch from the PFP, or fall back to
  // the palette's ridgeColor.  This makes every pass's pattern uniquely coloured
  // by its source image.
  const ridgeColor = swatches.length > 0
    ? _mostVibrantSwatch(swatches, palette.ridgeColor)
    : palette.ridgeColor;

  // Always ensure the ridge colour has enough contrast against the dark banner.
  // Boost lightness to a minimum of 55% so rings are always visible.
  const visibleRidgeColor = _ensureMinLightness(ridgeColor, 0.55);

  // Whorl center aligned with the PFP subject (centre of the banner area)
  const bannerCenter = { cx: CARD.width / 2, cy: CARD.bannerH / 2 };

  const patternRng = rngForToken(tokenId, 'pattern', config.salt);
  const rdPattern  = generateRDPattern(
    patternRng,
    { x: 0, y: 0, w: CARD.width, h: CARD.bannerH },
    visibleRidgeColor,
    bannerCenter,
  );

  const paddedId    = String(id).padStart(4, '0');
  const statusColor = _statusColor(traits._status, palette);

  return _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData, swatches });
}

// ---------------------------------------------------------------------------
// SVG composition
// ---------------------------------------------------------------------------

function _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData, swatches }) {
  const p   = palette;
  const cp  = `banner-clip-${id}`;   // banner clip region
  const gid = `banner-fade-${id}`;   // bottom-fade gradient

  // Banner clipPath: inner rounded top corners, straight bottom edge
  const bcp = [
    `M ${CARD.ix + CARD.irx},${CARD.iy}`,
    `L ${CARD.ix + CARD.iw - CARD.irx},${CARD.iy}`,
    `Q ${CARD.ix + CARD.iw},${CARD.iy} ${CARD.ix + CARD.iw},${CARD.iy + CARD.irx}`,
    `L ${CARD.ix + CARD.iw},${CARD.bannerH}`,
    `L ${CARD.ix},${CARD.bannerH}`,
    `L ${CARD.ix},${CARD.iy + CARD.irx}`,
    `Q ${CARD.ix},${CARD.iy} ${CARD.ix + CARD.irx},${CARD.iy} Z`,
  ].join(' ');

  const { width: iw, height: ih } = pfpData || {};
  const fit = pfpData ? _fitPFPInBanner(iw, ih) : null;

  // Outline filter — works on ANY opaque image: finds bright subject pixels
  // via luminanceToAlpha, dilates to create a halo, subtracts original bright
  // area → just the border ring, colors it with the palette accent.
  const oid = `outline-${id}`;
  const outlineDef = pfpData ? _luminanceOutlineFilterDef(oid, p) : '';

  const pfpLayer = pfpData
    // ── Full-color PFP base + luminance-derived accent outline on top
    ? `<!-- PFP full-color base -->
  <g clip-path="url(#${cp})">
    ${_embeddedPFPRaw(pfpData)}
  </g>
  <!-- Accent outline ring extracted from subject luminance -->
  <g clip-path="url(#${cp})">
    ${_embeddedPFPOutline(pfpData, fit, oid)}
  </g>`
    // ── Placeholder silhouette when no PFP supplied
    : `<!-- Placeholder silhouette -->
  <g clip-path="url(#${cp})">
    ${_silhouette(p)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.width} ${CARD.height}" width="${CARD.width}" height="${CARD.height}" role="img" aria-label="Lubies Factory Pass #${paddedId}">

  <defs>
    <clipPath id="${cp}"><path d="${bcp}"/></clipPath>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.infoBg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${p.infoBg}" stop-opacity="0.92"/>
    </linearGradient>
    ${outlineDef}
  </defs>

  <!-- ── CARD SHELL ── -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}" fill="${CARD.brdColor}"/>
  <rect x="${CARD.ix}" y="${CARD.iy}" width="${CARD.iw}" height="${CARD.ih}"
        rx="${CARD.irx}" fill="${p.infoBg}"/>

  <!-- ── BANNER ── -->
  <!-- 1. Dark banner base -->
  <rect x="${CARD.ix}" y="${CARD.iy}" width="${CARD.iw}" height="${CARD.bannerH - CARD.iy}"
        fill="${p.bannerBg}" clip-path="url(#${cp})"/>

  <!-- 2. PFP layer (duotone base, or duotone + subject silhouette) -->
  ${pfpLayer}

  <!-- 3. Fingerprint pattern overlay -->
  <g clip-path="url(#${cp})" opacity="0.72">
    ${rdPattern}
  </g>

  <!-- Bottom fade into info panel -->
  <rect x="${CARD.ix}" y="${CARD.bannerH - 90}" width="${CARD.iw}" height="90"
        fill="url(#${gid})" clip-path="url(#${cp})"/>

  <!-- ── DIVIDER ── thin gold line -->
  <rect x="${CARD.ix}" y="${CARD.dividerY}" width="${CARD.iw}" height="${CARD.dividerH}"
        fill="${p.dividerColor}"/>

  <!-- ── INFO PANEL ── -->
  ${_infoTitle(p)}
  ${_infoRows(paddedId, traits, p, statusColor)}
  ${_colorGrid(swatches)}
  ${_logoRow(p, id)}

  <!-- ── LANYARD INDICATOR ── -->
  ${traits.lanyard === 'True' ? _lanyardIndicator(p) : ''}

</svg>`.trim();
}

// ---------------------------------------------------------------------------
// Banner: PFP silhouette
// ---------------------------------------------------------------------------

/**
 * Generic placeholder silhouette — person with top hat.
 * Composed of simple filled shapes; all same color so they merge visually.
 * In production, replace with the actual holder's PFP image element.
 */
function _silhouette(p) {
  const cx  = CARD.width / 2;   // 280
  const sw  = 2;                 // outline stroke width

  return `
  <!-- Hat crown -->
  <path d="M ${cx - 62},${112} L ${cx - 54},${56} C ${cx - 48},${42} ${cx - 22},${36} ${cx},${36} C ${cx + 22},${36} ${cx + 48},${42} ${cx + 54},${56} L ${cx + 62},${112} Z"
        fill="${p.silhouetteFill}" stroke="${p.silhouetteStroke}" stroke-width="${sw}" stroke-linejoin="round"/>
  <!-- Hat brim -->
  <rect x="${cx - 80}" y="${108}" width="160" height="16" rx="3"
        fill="${p.silhouetteFill}" stroke="${p.silhouetteStroke}" stroke-width="${sw}"/>
  <!-- Head -->
  <ellipse cx="${cx}" cy="${184}" rx="56" ry="62"
        fill="${p.silhouetteFill}" stroke="${p.silhouetteStroke}" stroke-width="${sw}"/>
  <!-- Neck -->
  <rect x="${cx - 22}" y="${240}" width="44" height="26" rx="8"
        fill="${p.silhouetteFill}"/>
  <!-- Body / shoulders -->
  <path d="M ${cx - 110},${398} L ${cx - 112},${296} C ${cx - 110},${268} ${cx - 90},${254} ${cx - 66},${248} L ${cx - 22},${266} L ${cx + 22},${266} L ${cx + 66},${248} C ${cx + 90},${254} ${cx + 110},${268} ${cx + 112},${296} L ${cx + 110},${398} Z"
        fill="${p.silhouetteFill}" stroke="${p.silhouetteStroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

// ---------------------------------------------------------------------------
// PFP silhouette filter + embed (used when pfpData is provided)
// ---------------------------------------------------------------------------

/**
 * Embed PFP image raw — no filter, full color, cover-fit in banner.
 * The RD pattern is layered on top of this at reduced opacity.
 */
/**
 * Embed the full-color PFP image — always shows the complete subject.
 */
function _embeddedPFPRaw(pfpData) {
  const { x, y, w, h } = _fitPFPInBanner(pfpData.width, pfpData.height);
  return `<image href="${pfpData.dataURI}"
         x="${x}" y="${y}" width="${w}" height="${h}"
         preserveAspectRatio="xMidYMid meet"/>`;
}

/**
 * Second copy of the PFP with the luminance outline filter applied.
 * Renders only the accent-coloured border ring — nothing inside the subject.
 */
function _embeddedPFPOutline(pfpData, fit, filterId) {
  const x = fit ? fit.x : CARD.ix;
  const y = fit ? fit.y : CARD.iy;
  const w = fit ? fit.w : CARD.iw;
  const h = fit ? fit.h : CARD.bannerH - CARD.iy;
  return `<image href="${pfpData.dataURI}"
         x="${x}" y="${y}" width="${w}" height="${h}"
         preserveAspectRatio="xMidYMid meet"
         filter="url(#${filterId})"/>`;
}

/**
 * Luminance-based outline filter — works on ANY opaque image.
 *
 *   1. luminanceToAlpha  — bright pixels → high alpha (the "subject")
 *   2. feMorphology dilate — expand subject outward to create a halo zone
 *   3. feComposite arithmetic (halo − luma) — only the NEW border ring remains
 *   4. feFlood + feComposite — colour the ring with the palette accent
 *
 * The result is an accent-coloured outline around the bright subject,
 * placed on top of the full-color PFP base layer.
 */
function _luminanceOutlineFilterDef(filterId, p) {
  return `
    <filter id="${filterId}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <feColorMatrix type="luminanceToAlpha" result="luma"/>
      <feMorphology in="luma" operator="dilate" radius="9" result="halo"/>
      <feComposite in="halo" in2="luma" operator="arithmetic" k2="1" k3="-1" k4="0" result="ring"/>
      <feFlood flood-color="${p.silhouetteStroke}" flood-opacity="1" result="accentFill"/>
      <feComposite in="accentFill" in2="ring" operator="in"/>
    </filter>`;
}

/**
 * Fit the PFP image in the banner, centered, filling height.
 * Returns { x, y, w, h } for the <image> element.
 *
 * @param {number} imgW  Natural image width.
 * @param {number} imgH  Natural image height.
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function _fitPFPInBanner(imgW, imgH) {
  // Use the inner banner area (inside the card border) as the fit target.
  // "Contain" (meet) — scale down so the full subject is always visible;
  // the fingerprint ring pattern fills any empty space around the subject.
  const targetH = CARD.bannerH - CARD.iy;   // 399 px (inside top border)
  const targetW = CARD.iw;                   // 534 px (inside side borders)

  const scaleH = targetH / imgH;
  const scaleW = targetW / imgW;
  const scale  = Math.min(scaleH, scaleW);   // CONTAIN — never crops the subject

  const w = imgW * scale;
  const h = imgH * scale;
  // Centre horizontally in the full banner, vertically within the inner area
  const x = (CARD.width - w) / 2;
  const y = CARD.iy + (targetH - h) / 2;

  return { x: +x.toFixed(2), y: +y.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2) };
}

/**
 * Build the SVG <image> element with the silhouette filter applied.
 *
 * @param {object} pfpData   From loadPFP() / loadPFPSync().
 * @param {string} filterId
 * @returns {string}
 */
function _embeddedPFP(pfpData, filterId) {
  const { x, y, w, h } = _fitPFPInBanner(pfpData.width, pfpData.height);
  return `
  <image href="${pfpData.dataURI}"
         x="${x}" y="${y}" width="${w}" height="${h}"
         preserveAspectRatio="xMidYMid meet"
         filter="url(#${filterId})"/>`;
}

/**
 * Parse a hex color (#rrggbb or #rgb) into { r, g, b } in [0, 1].
 * Falls back to mid-grey on any parse failure.
 *
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
/**
 * From an array of #rrggbb swatches, return the one with the highest
 * perceptual vibrancy (saturation × mid-lightness score).
 * Falls back to `fallback` if no hex swatch can be parsed.
 */
function _mostVibrantSwatch(swatches, fallback) {
  let best = fallback;
  let bestScore = -1;
  for (const hex of swatches) {
    if (!hex || !hex.startsWith('#') || hex.length < 7) continue;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l   = (max + min) / 2;
    const s   = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    // Prefer high saturation, penalise very dark (l<0.2) or washed-out (l>0.85)
    const score = s * (1 - Math.abs(l - 0.5) * 1.4);
    if (score > bestScore) { bestScore = score; best = hex; }
  }
  return best;
}

/**
 * Ensure a hex colour has at least `minL` lightness (HSL).
 * Brightens the colour without changing hue/saturation.
 * Returns the original string unchanged if already bright enough or non-hex.
 */
function _ensureMinLightness(hex, minL) {
  if (!hex || !hex.startsWith('#') || hex.length < 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (l >= minL) return hex;
  // Boost: scale up all channels proportionally so new lightness = minL
  const scale = minL === 0 ? 1 : minL / Math.max(l, 0.001);
  const nr = Math.min(1, r * scale);
  const ng = Math.min(1, g * scale);
  const nb = Math.min(1, b * scale);
  return '#' + [nr, ng, nb].map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('');
}

function _hexToRGB01(hex) {
  if (!hex || !hex.startsWith('#')) return { r: 0.3, g: 0.3, b: 0.3 };
  let h = hex.slice(1);
  if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  if (h.length !== 6) return { r: 0.3, g: 0.3, b: 0.3 };
  // hsl() colors (dynamic palette) can't be parsed as hex — return near-black
  if (hex.startsWith('hsl')) return { r: 0.04, g: 0.04, b: 0.04 };
  const n = parseInt(h, 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8)  & 0xff) / 255,
    b: (n          & 0xff) / 255,
  };
}

// ---------------------------------------------------------------------------
// Info panel elements
// ---------------------------------------------------------------------------

function _infoTitle(p) {
  const brandY  = CARD.dividerBottom + 26;   // "LUBIES" brand line
  const titleY0 = CARD.dividerBottom + 52;   // "FACTORY"
  const titleY1 = titleY0 + 42;             // "PASS"
  return `
  <!-- Brand label -->
  <text x="${CARD.infoLeft}" y="${brandY}"
        font-family="'Arial', 'Helvetica Neue', sans-serif"
        font-size="11" font-weight="700" fill="${p.accentDim}"
        letter-spacing="5" text-rendering="geometricPrecision">LUBIES</text>
  <!-- Series title -->
  <text x="${CARD.infoLeft}" y="${titleY0}"
        font-family="'Arial Black', 'Impact', 'Helvetica Neue', sans-serif"
        font-size="36" font-weight="900" fill="${p.accent}"
        letter-spacing="2" text-rendering="geometricPrecision">FACTORY</text>
  <text x="${CARD.infoLeft}" y="${titleY1}"
        font-family="'Arial Black', 'Impact', 'Helvetica Neue', sans-serif"
        font-size="36" font-weight="900" fill="${p.accent}"
        letter-spacing="2" text-rendering="geometricPrecision">PASS</text>`;
}

function _infoRows(paddedId, traits, p, statusColor) {
  const base = CARD.dividerBottom + 118;
  const gap  = 48;
  const rowY = [base, base + gap, base + gap * 2];

  const labelFont = `font-family="'Arial', sans-serif" font-size="11" font-weight="700" fill="${p.textMuted}" letter-spacing="3"`;
  const valueFont = `font-family="'Arial', sans-serif" font-size="16" font-weight="400" fill="${p.text}" letter-spacing="0.5"`;
  const monoFont  = `font-family="'Courier New', 'Courier', monospace" font-size="16" font-weight="700" fill="${p.text}" letter-spacing="1"`;
  const lineColor = `${p.text}18`;
  const labelOff  = 12;   // label sits above the value line
  const valueOff  = 0;

  function row(y, label, valueEl) {
    return `
  <text x="${CARD.infoLeft}" y="${y - labelOff}" ${labelFont}>${label}</text>
  ${valueEl}
  <line x1="${CARD.infoLeft}" y1="${y + 10}" x2="${CARD.infoRight}" y2="${y + 10}" stroke="${lineColor}" stroke-width="0.75"/>`;
  }

  // Status: coloured dot + text
  const statusDot = `<circle cx="${CARD.infoLeft + 8}" cy="${rowY[0] - 5}" r="5" fill="${statusColor}"/>
  <text x="${CARD.infoLeft + 22}" y="${rowY[0]}" ${valueFont}>${traits.status.toUpperCase()}</text>`;

  return `
  ${row(rowY[0], 'STATUS', statusDot)}
  ${row(rowY[1], 'TOKEN', `<text x="${CARD.infoLeft}" y="${rowY[1]}" ${monoFont}># ${paddedId}</text>`)}
  ${row(rowY[2], 'EDITION', `<text x="${CARD.infoLeft}" y="${rowY[2]}" ${monoFont}>${traits.edition || paddedId}</text>`)}`;
}

// ---------------------------------------------------------------------------
// Color swatch pyramid — right-aligned in the info panel title zone.
// Up to 10 colours arranged in a stacked pyramid:
//   3 colours → [3]
//   4         → [2, 2]
//   5         → [3, 2]
//   6         → [3, 2, 1]
//   7         → [3, 2, 2]
//   8         → [3, 3, 2]
//   9         → [3, 3, 3]
//  10         → [4, 3, 3]
// ---------------------------------------------------------------------------

const _PYRAMID_ROWS = {
  1: [1], 2: [2], 3: [3],
  4: [2, 2], 5: [3, 2], 6: [3, 2, 1],
  7: [3, 2, 2], 8: [3, 3, 2], 9: [3, 3, 3], 10: [4, 3, 3],
};

function _colorGrid(swatches) {
  if (!swatches || swatches.length === 0) return '';
  const n    = Math.min(10, Math.max(1, swatches.length));
  const rows = _PYRAMID_ROWS[n] || [3, 3, 3];

  const cell = 16;   // swatch cell size (px)
  const gap  = 4;    // gap between cells

  // Max row width sets the right-edge alignment anchor
  const maxRowCells = Math.max(...rows);
  const maxRowW     = maxRowCells * cell + (maxRowCells - 1) * gap;

  // Top of the pyramid: aligned alongside the brand line
  const gridTop  = CARD.dividerBottom + 18;
  const gridRight = CARD.infoRight;

  const pieces = [];
  let swatchIdx = 0;

  rows.forEach((rowCount, rowIdx) => {
    const rowW = rowCount * cell + (rowCount - 1) * gap;
    const rowX = gridRight - rowW;   // right-align each row
    const rowY = gridTop + rowIdx * (cell + gap);
    for (let i = 0; i < rowCount; i++) {
      if (swatchIdx >= n) break;
      const rx = rowX + i * (cell + gap);
      pieces.push(`<rect x="${rx}" y="${rowY}" width="${cell}" height="${cell}" rx="3" fill="${swatches[swatchIdx]}"/>`);
      swatchIdx++;
    }
  });

  return `<g>${pieces.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Logo row (bottom of info panel)
// ---------------------------------------------------------------------------

function _logoRow(p, id) {
  const size = 36;
  const gap  = 8;
  // Last info row (ID N°) baseline: CARD.dividerBottom + 108 + 46*2 = 615
  const lastRowY = CARD.dividerBottom + 108 + 46 * 2;
  const y  = lastRowY - size;               // bottom of logo aligns with text baseline
  const rx = CARD.infoRight - size;         // fingerprint flush right
  const lx = rx - gap - size;               // L mark left of fingerprint

  return `
  <!-- Lubies "L" mark — bottom right, aligned with last text row -->
  ${lubiesLLogo(lx, y, size, p.accent, `l-${id}`)}
  <!-- Lubies fingerprint mark — artist original from "Lubies fingerprints.svg" -->
  ${fingerprintLogo(rx, y, size, '#eb5b44', `fp-${id}`)}`;
}

// ---------------------------------------------------------------------------
// Lanyard indicator
// ---------------------------------------------------------------------------

function _lanyardIndicator(p) {
  const cx = CARD.width / 2;
  const ty = CARD.iy + 6;  // sits inside the cream frame at the top
  return `
  <!-- Lanyard D-ring indicator -->
  <rect x="${cx - 10}" y="${ty - 2}" width="20" height="5" rx="2.5"
        fill="${CARD.brdColor}"/>
  <ellipse cx="${cx}" cy="${ty + 10}" rx="11" ry="8"
           fill="none" stroke="${CARD.brdColor}" stroke-width="4"/>`;
}

// ---------------------------------------------------------------------------
// Status color lookup
// ---------------------------------------------------------------------------

function _statusColor(status, palette) {
  const map = {
    [PassStatus.PENDING]:  palette.statusColors.PENDING,
    [PassStatus.ENABLED]:  palette.statusColors.ENABLED,
    [PassStatus.DISABLED]: palette.statusColors.DISABLED,
    [PassStatus.UPGRADED]: palette.statusColors.UPGRADED,
    [PassStatus.REVOKED]:  palette.statusColors.REVOKED,
  };
  return map[status] ?? palette.statusColors.PENDING;
}

// ---------------------------------------------------------------------------
// Convenience exports
// ---------------------------------------------------------------------------

/**
 * Generate a Base64 data URI for the SVG (for inline use or onchain embed).
 *
 * @param {number|bigint} tokenId
 * @param {object}        passData
 * @param {object}        [config]
 * @param {object|null}   [pfpData]
 * @returns {string}  data:image/svg+xml;base64,...
 */
function generateTokenImageDataURI(tokenId, passData, config = {}, pfpData = null) {
  const svg = generateTokenImage(tokenId, passData, config, pfpData);
  const b64 = Buffer.from(svg, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

module.exports = {
  generateTokenImage,
  generateTokenImageDataURI,
  CARD,
};
