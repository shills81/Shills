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

// ---------------------------------------------------------------------------
// Card geometry constants
// ---------------------------------------------------------------------------

const CARD = {
  width:        560,
  height:       760,
  rx:           36,
  bannerH:      424,   // banner zone height
  dividerH:     12,    // divider stripe height
  get dividerY()      { return this.bannerH; },
  get dividerBottom() { return this.bannerH + this.dividerH; },
  get infoY()         { return this.dividerBottom; },
  get infoH()         { return this.height - this.dividerBottom; },
  // Info section padding
  infoLeft:     36,
  infoRight:    524,
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

  return _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData });
}

// ---------------------------------------------------------------------------
// SVG composition
// ---------------------------------------------------------------------------

function _composeSVG({ id, paddedId, traits, palette, rdPattern, statusColor, pfpData }) {
  const p    = palette;
  const cp   = `banner-clip-${id}`;    // clipPath id — unique per token
  const fid  = `pfp-filter-${id}`;     // filter id for PFP silhouette

  // Silhouette filter def + image element (only when pfpData is provided)
  const pfpDefs    = pfpData ? _silhouetteFilterDef(fid, p)   : '';
  const pfpElement = pfpData ? _embeddedPFP(pfpData, fid)     : _silhouette(p);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CARD.width} ${CARD.height}" width="${CARD.width}" height="${CARD.height}" role="img" aria-label="Lubies Factory Pass #${paddedId}">

  <defs>
    <!-- Banner clip: rounded top, square bottom -->
    <clipPath id="${cp}">
      <path d="M ${CARD.rx},0 L ${CARD.width - CARD.rx},0 Q ${CARD.width},0 ${CARD.width},${CARD.rx} L ${CARD.width},${CARD.bannerH} L 0,${CARD.bannerH} L 0,${CARD.rx} Q 0,0 ${CARD.rx},0 Z"/>
    </clipPath>
    ${pfpDefs}
  </defs>

  <!-- 1. Card base fill (info panel color behind everything) -->
  <rect width="${CARD.width}" height="${CARD.height}" rx="${CARD.rx}" fill="${p.infoBg}"/>

  <!-- ── BANNER ── -->
  <!-- 3. Banner background -->
  <rect x="0" y="0" width="${CARD.width}" height="${CARD.bannerH}" fill="${p.bannerBg}" clip-path="url(#${cp})"/>

  <!-- 4. RD fingerprint pattern -->
  <g clip-path="url(#${cp})">
    ${rdPattern}
  </g>

  <!-- 5. PFP silhouette -->
  <g clip-path="url(#${cp})">
    ${pfpElement}
  </g>

  <!-- ── DIVIDER ── -->
  <!-- 6. Accent stripe -->
  <rect x="0" y="${CARD.dividerY}" width="${CARD.width}" height="${CARD.dividerH}" fill="${p.dividerColor}"/>

  <!-- ── INFO PANEL ── -->
  <!-- 8. FACTORY PASS title -->
  ${_infoTitle(p)}

  <!-- 9. Data rows -->
  ${_infoRows(paddedId, traits, p, statusColor)}

  <!-- 11. Color code grid (genesis / premium) -->
  ${(traits.genesis === 'True' || traits.premium === 'True') ? _colorGrid(id, p) : ''}

  <!-- 12. Logo row -->
  ${_logoRow(p)}

  <!-- ── LANYARD INDICATOR ── -->
  ${traits.lanyard === 'True' ? _lanyardIndicator(p) : ''}

  <!-- 2. Card border -->
  <rect x="1.5" y="1.5" width="${CARD.width - 3}" height="${CARD.height - 3}" rx="${CARD.rx - 1}" fill="none" stroke="${p.cardBorder}" stroke-width="3"/>

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
 * Build an SVG <filter> that:
 *  1. Dilates the source alpha → glow/outline ring in silhouetteStroke color.
 *  2. Remaps all RGB channels to silhouetteFill while preserving alpha.
 *  3. Merges outline (bottom) + silhouette fill (top).
 *
 * @param {string} filterId
 * @param {object} p  Palette
 * @returns {string}  SVG <filter>…</filter> element.
 */
function _silhouetteFilterDef(filterId, p) {
  // Parse silhouetteFill into r/g/b [0–1] for feColorMatrix
  const rgb = _hexToRGB01(p.silhouetteFill);

  return `
    <!-- PFP silhouette filter: outline + palette-fill -->
    <filter id="${filterId}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
      <!-- 1. Dilate alpha to create outline shape -->
      <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="dilated"/>
      <!-- 2. Flood outline color -->
      <feFlood flood-color="${p.silhouetteStroke}" flood-opacity="0.95" result="outlineFlood"/>
      <!-- 3. Clip flood to dilated outline -->
      <feComposite in="outlineFlood" in2="dilated" operator="in" result="outline"/>
      <!-- 4. Remap source graphic RGB → silhouetteFill, keep alpha -->
      <feColorMatrix in="SourceGraphic" type="matrix"
        values="0 0 0 0 ${rgb.r.toFixed(4)}
                0 0 0 0 ${rgb.g.toFixed(4)}
                0 0 0 0 ${rgb.b.toFixed(4)}
                0 0 0 1 0"
        result="filled"/>
      <!-- 5. Layer: outline under filled silhouette -->
      <feMerge>
        <feMergeNode in="outline"/>
        <feMergeNode in="filled"/>
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
  const y0 = CARD.dividerBottom + 52;  // "FACTORY" baseline
  const y1 = y0 + 48;                  // "PASS" baseline
  return `
  <text x="${CARD.infoLeft}" y="${y0}"
        font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        font-size="40" font-weight="900" fill="${p.accent}"
        letter-spacing="2" text-rendering="geometricPrecision">FACTORY</text>
  <text x="${CARD.infoLeft}" y="${y1}"
        font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif"
        font-size="40" font-weight="900" fill="${p.accent}"
        letter-spacing="2" text-rendering="geometricPrecision">PASS</text>`;
}

function _infoRows(paddedId, traits, p, statusColor) {
  const rowY = [
    CARD.dividerBottom + 154,   // STATUS
    CARD.dividerBottom + 206,   // TOKEN
    CARD.dividerBottom + 258,   // ID N°
  ];
  const labelFont = `font-family="'Courier New', Courier, monospace" font-size="13" font-weight="700" fill="${p.textMuted}" letter-spacing="2"`;
  const valueFont = `font-family="'Courier New', Courier, monospace" font-size="15" font-weight="400" fill="${p.text}" letter-spacing="1"`;
  const lineColor = p.accentDim;

  // Divider lines above each row
  function divider(y) {
    return `<line x1="${CARD.infoLeft}" y1="${y - 18}" x2="${CARD.infoRight}" y2="${y - 18}" stroke="${lineColor}" stroke-width="0.75"/>`;
  }

  const statusDot = `<circle cx="${CARD.infoLeft}" cy="${rowY[0] - 5}" r="5" fill="${statusColor}"/>`;

  return `
  ${divider(rowY[0])}
  ${statusDot}
  <text x="${CARD.infoLeft + 14}" y="${rowY[0]}" ${labelFont}>STATUS :</text>
  <text x="${CARD.infoLeft + 122}" y="${rowY[0]}" ${valueFont}>${traits.status.toUpperCase()}</text>

  ${divider(rowY[1])}
  <text x="${CARD.infoLeft}" y="${rowY[1]}" ${labelFont}>TOKEN :</text>
  <text x="${CARD.infoLeft + 106}" y="${rowY[1]}" ${valueFont}># ${paddedId}</text>

  ${divider(rowY[2])}
  <text x="${CARD.infoLeft}" y="${rowY[2]}" ${labelFont}>ID N° :</text>
  <text x="${CARD.infoLeft + 106}" y="${rowY[2]}" ${valueFont}>${traits.edition}</text>`;
}

// ---------------------------------------------------------------------------
// Color code grid (Genesis / Premium indicator)
// ---------------------------------------------------------------------------

function _colorGrid(id, p) {
  // 3 × 3 grid of accent-tinted squares in top-right of info panel
  const colors = [
    p.accent, p.accentDim, p.accent,
    p.accentDim, p.ridgeColor, p.accentDim,
    p.accent, p.accentDim, p.accent,
  ];
  const gridX  = CARD.infoRight - 72;
  const gridY  = CARD.dividerBottom + 12;
  const cell   = 22;
  const gap    = 3;
  const pieces = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = gridX + col * (cell + gap);
      const cy = gridY + row * (cell + gap);
      pieces.push(`<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" rx="3" fill="${colors[row * 3 + col]}" opacity="0.75"/>`);
    }
  }
  return `<g>${pieces.join('')}</g>`;
}

// ---------------------------------------------------------------------------
// Logo row (bottom of info panel)
// ---------------------------------------------------------------------------

function _logoRow(p) {
  const y     = CARD.height - 46;   // logo baseline
  const size  = 36;
  const gap   = 8;
  const lx    = CARD.infoLeft;       // Lubies logo x
  const mx    = lx + size + gap;    // MFMB logo x

  return `
  <!-- Lubies logo mark -->
  ${_lubiesLogo(lx, y - size, size, p)}
  <!-- MFMB fingerprint mark -->
  ${_mfmbLogo(mx, y - size, size, p)}`;
}

// ---------------------------------------------------------------------------
// Lubies logo mark  (coral rounded square + white script loop)
// ---------------------------------------------------------------------------

/**
 * SVG approximation of the Lubies logo mark.
 * Coral rounded square with a white script loop-and-tail form.
 *
 * @param {number} x    Top-left x of the bounding square.
 * @param {number} y    Top-left y of the bounding square.
 * @param {number} size Width/height of the bounding square.
 * @param {object} p    Palette (unused — logo always uses brand orange).
 */
function _lubiesLogo(x, y, size, p) {
  const s = size / 36;  // scale factor relative to 36px design grid

  // Work in a local 36×36 coordinate space, then transform
  return `
  <g transform="translate(${x}, ${y}) scale(${s.toFixed(4)})">
    <!-- Background: Lubies coral orange -->
    <rect x="0" y="0" width="36" height="36" rx="6.5" fill="#E05A3A"/>
    <!-- White script form: loop with enclosed space and lower-right tail -->
    <path d="M 24,4 C 18,3 10,6 7,13 C 4,20 5,28 10,32 C 15,36 23,36 28,31 C 33,26 33,18 28,13 C 24,9 17,9 14,14 C 11,19 12,26 16,29 C 20,32 26,31 28,26 M 28,26 C 31,29 34,33 35,36"
          fill="none" stroke="white" stroke-width="5.5"
          stroke-linecap="round" stroke-linejoin="round"/>
  </g>`;
}

// ---------------------------------------------------------------------------
// MFMB (MyFace MyBrand) fingerprint mark
// ---------------------------------------------------------------------------

/**
 * SVG approximation of the MFMB/fingerprint logo mark.
 * Rounded square with a miniature RD/fingerprint pattern inside.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} size
 * @param {object} p  Palette — uses accent color for mini ridges.
 */
function _mfmbLogo(x, y, size, p) {
  const s = size / 36;

  return `
  <g transform="translate(${x}, ${y}) scale(${s.toFixed(4)})">
    <!-- Background: dark (same as card info bg) -->
    <rect x="0" y="0" width="36" height="36" rx="6.5" fill="${p.infoBg}" stroke="${p.accent}" stroke-width="1.5"/>
    <!-- Mini fingerprint maze — simplified 3-path approximation -->
    <g fill="none" stroke="${p.accent}" stroke-width="2" stroke-linecap="round">
      <path d="M 3,18 C 3,10 10,4 18,4 C 26,4 33,10 33,18 C 33,26 26,32 18,32 C 12,32 7,28 7,22 C 7,16 12,12 18,12 C 22,12 26,15 26,19 C 26,23 23,26 18,26 C 14,26 12,23 12,19 C 12,15 15,13 18,14"/>
      <path d="M 3,10 C 6,5 12,2 18,2 C 28,2 35,9 35,18"/>
      <path d="M 3,26 C 5,30 10,34 16,35"/>
    </g>
  </g>`;
}

// ---------------------------------------------------------------------------
// Lanyard indicator
// ---------------------------------------------------------------------------

function _lanyardIndicator(p) {
  const cx = CARD.width / 2;
  return `
  <!-- Lanyard D-ring indicator -->
  <ellipse cx="${cx}" cy="14" rx="14" ry="10"
           fill="none" stroke="${p.dividerColor}" stroke-width="3" opacity="0.9"/>
  <line x1="${cx}" y1="24" x2="${cx}" y2="44"
        stroke="${p.dividerColor}" stroke-width="3" opacity="0.6"/>`;
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
