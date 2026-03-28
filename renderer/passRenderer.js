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

  const patternRng = rngForToken(tokenId, 'pattern', config.salt);
  const rdPattern  = generateRDPattern(
    patternRng,
    { x: 0, y: 0, w: CARD.width, h: CARD.bannerH },
    palette.ridgeColor,
  );

  const paddedId    = String(id).padStart(4, '0');
  const statusColor = _statusColor(traits._status, palette);

  // PFP swatches take priority; fall back to palette's static swatchColors
  const swatches = (pfpData && pfpData.swatches && pfpData.swatches.length >= 3)
    ? pfpData.swatches
    : (palette.swatchColors || []);

  return _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData, swatches });
}

// ---------------------------------------------------------------------------
// SVG composition
// ---------------------------------------------------------------------------

function _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData, swatches }) {
  const p   = palette;
  const cp  = `banner-clip-${id}`;   // banner clip region
  const gid = `banner-fade-${id}`;   // bottom-fade gradient
  const fid = `pfp-filter-${id}`;    // silhouette filter

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

  // Silhouette filter works on ALL image types (opaque JPEG/WebP/PNG).
  // Uses a blur-glow approach instead of SourceAlpha so it doesn't need
  // image transparency to produce an accent outline.
  const pfpFilterDef = pfpData ? _silhouetteFilterDef(fid, p) : '';

  const silhouetteLayer = pfpData
    ? `<!-- PFP silhouette: RGB crushed to dark fill, accent glow outline via blur -->
  <g clip-path="url(#${cp})">
    ${_embeddedPFP(pfpData, fid)}
  </g>`
    : `<!-- Placeholder silhouette -->
  <g clip-path="url(#${cp})">
    ${_silhouette(p)}
  </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.width} ${CARD.height}" width="${CARD.width}" height="${CARD.height}" role="img" aria-label="Lubies Factory Pass #${paddedId}">

  <defs>
    <clipPath id="${cp}"><path d="${bcp}"/></clipPath>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${p.infoBg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${p.infoBg}" stop-opacity="0.88"/>
    </linearGradient>
    ${pfpFilterDef}
  </defs>

  <!-- ── CARD SHELL ── -->
  <!-- Cream/tan frame (the physical badge border) -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}" fill="${CARD.brdColor}"/>
  <!-- Dark inner content area -->
  <rect x="${CARD.ix}" y="${CARD.iy}" width="${CARD.iw}" height="${CARD.ih}"
        rx="${CARD.irx}" fill="${p.infoBg}"/>

  <!-- ── BANNER ── -->
  <!-- 1. Banner background fill -->
  <rect x="${CARD.ix}" y="${CARD.iy}" width="${CARD.iw}" height="${CARD.bannerH - CARD.iy}"
        fill="${p.bannerBg}" clip-path="url(#${cp})"/>

  <!-- 2. PFP silhouette: dark-crushed image with accent glow outline -->
  ${silhouetteLayer}

  <!-- 3. RD pattern on top — visible across the full banner -->
  <g clip-path="url(#${cp})">
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
function _embeddedPFPRaw(pfpData) {
  const { x, y, w, h } = _fitPFPInBanner(pfpData.width, pfpData.height);
  return `<image href="${pfpData.dataURI}"
         x="${x}" y="${y}" width="${w}" height="${h}"
         preserveAspectRatio="xMidYMid slice"/>`;
}

/**
 * Build an SVG <filter> that:
 *  1. Dilates the source alpha → glow/outline ring in silhouetteStroke color.
 *  2. Remaps all RGB channels to silhouetteFill while preserving alpha.
 *  3. Merges outline (bottom) + silhouette fill (top).
 *
 * @param {string} filterId
 * @param {object} p  Palette
 * @returns {string}  SVG <filter>…</filter> element.
 */
/**
 * Build a silhouette filter that works on ALL image types including opaque
 * JPEGs and WebPs (not just transparent PNGs).
 *
 * Approach:
 *  1. Crush all RGB to silhouetteFill (near-black) — the dark silhouette shape.
 *  2. Edge-detect on the ORIGINAL image via blur-difference — gives bright pixels
 *     wherever colors change (character outline + features). This works for opaque
 *     photos because we're comparing original vs blurred original, not using alpha.
 *  3. Map edge brightness → accent stroke color with alpha from edge intensity.
 *  4. Merge: dark silhouette base + accent-coloured edge lines on top.
 */
function _silhouetteFilterDef(filterId, p) {
  const fill   = _hexToRGB01(p.silhouetteFill);
  const stroke = _hexToRGB01(p.silhouetteStroke);

  return `
    <filter id="${filterId}" x="-5%" y="-5%" width="110%" height="110%" color-interpolation-filters="sRGB">
      <!-- 1. Dark silhouette: crush all RGB to near-black fill -->
      <feColorMatrix in="SourceGraphic" type="matrix"
        values="0 0 0 0 ${fill.r.toFixed(3)}
                0 0 0 0 ${fill.g.toFixed(3)}
                0 0 0 0 ${fill.b.toFixed(3)}
                0 0 0 1 0"
        result="silh"/>
      <!-- 2. Edge detection: blur the original, take absolute difference -->
      <!--    feBlend "difference" = |src - blurred| → bright at colour boundaries -->
      <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="srcBlur"/>
      <feBlend in="SourceGraphic" in2="srcBlur" mode="difference" result="edges"/>
      <!-- 3. Map edge intensity → accent colour, alpha driven by edge strength -->
      <feColorMatrix in="edges" type="matrix"
        values="0 0 0 0 ${stroke.r.toFixed(3)}
                0 0 0 0 ${stroke.g.toFixed(3)}
                0 0 0 0 ${stroke.b.toFixed(3)}
                7 7 7 0 -0.15"
        result="accentEdges"/>
      <!-- 4. Dark silhouette base + accent edge lines on top -->
      <feMerge>
        <feMergeNode in="silh"/>
        <feMergeNode in="accentEdges"/>
      </feMerge>
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
  const targetH = CARD.bannerH;
  const targetW = CARD.width;

  const scaleH = targetH / imgH;
  const scaleW = targetW / imgW;
  const scale  = Math.max(scaleH, scaleW);  // cover, not contain

  const w = imgW * scale;
  const h = imgH * scale;
  const x = (targetW - w) / 2;
  const y = (targetH - h) / 2;

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
         preserveAspectRatio="xMidYMid slice"
         filter="url(#${filterId})"/>`;
}

/**
 * Parse a hex color (#rrggbb or #rgb) into { r, g, b } in [0, 1].
 * Falls back to mid-grey on any parse failure.
 *
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
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
  const y0 = CARD.dividerBottom + 44;
  const y1 = y0 + 40;
  return `
  <text x="${CARD.infoLeft}" y="${y0}"
        font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        font-size="34" font-weight="900" fill="${p.accent}"
        letter-spacing="3" text-rendering="geometricPrecision">FACTORY</text>
  <text x="${CARD.infoLeft}" y="${y1}"
        font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        font-size="34" font-weight="900" fill="${p.accent}"
        letter-spacing="3" text-rendering="geometricPrecision">PASS</text>`;
}

function _infoRows(paddedId, traits, p, statusColor) {
  const base = CARD.dividerBottom + 108;
  const gap  = 46;
  const rowY = [base, base + gap, base + gap * 2];

  const labelFont = `font-family="'Arial', sans-serif" font-size="15" font-weight="700" fill="${p.text}" letter-spacing="1"`;
  const valueFont = `font-family="'Arial', sans-serif" font-size="15" font-weight="400" fill="${p.text}" letter-spacing="0"`;
  const lineColor = `${p.text}22`;

  function divider(y) {
    return `<line x1="${CARD.infoLeft}" y1="${y + 14}" x2="${CARD.infoRight}" y2="${y + 14}" stroke="${lineColor}" stroke-width="1"/>`;
  }

  return `
  <text x="${CARD.infoLeft}" y="${rowY[0]}" ${labelFont}>STATUS :</text>
  <text x="${CARD.infoLeft + 110}" y="${rowY[0]}" ${valueFont}>${traits.status.toUpperCase()}</text>
  ${divider(rowY[0])}

  <text x="${CARD.infoLeft}" y="${rowY[1]}" ${labelFont}>TOKEN :</text>
  <text x="${CARD.infoLeft + 110}" y="${rowY[1]}" ${valueFont}># ${paddedId}</text>
  ${divider(rowY[1])}

  <text x="${CARD.infoLeft}" y="${rowY[2]}" ${labelFont}>ID N° :</text>
  <text x="${CARD.infoLeft + 110}" y="${rowY[2]}" ${valueFont}>${traits.edition || paddedId}</text>`;
}

// ---------------------------------------------------------------------------
// Color swatch strip — single row, right-aligned in the info panel title zone.
// Shows 3–6 colors extracted from the PFP (or palette defaults for static themes).
// ---------------------------------------------------------------------------

function _colorGrid(swatches) {
  if (!swatches || swatches.length === 0) return '';
  const n     = Math.max(3, Math.min(6, swatches.length));
  const cell  = 18;
  const gap   = 4;
  const gridW = n * cell + (n - 1) * gap;
  const gridX = CARD.infoRight - gridW;
  // Vertically centred alongside the "FACTORY / PASS" title block
  const gridY = CARD.dividerBottom + 43;

  const pieces = swatches.slice(0, n).map((color, i) => {
    const cx = gridX + i * (cell + gap);
    return `<rect x="${cx}" y="${gridY}" width="${cell}" height="${cell}" rx="3" fill="${color}"/>`;
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
