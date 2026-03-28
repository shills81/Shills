'use strict';

/**
 * qa/fixtures.js
 * Test token configurations and built-in synthetic PFP images.
 *
 * Synthetic PFPs are self-contained SVG data URIs — no files needed.
 * Real PFPs are loaded from qa/pfps/ automatically.
 */

const { AccessTier, PassStatus } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// Token configs
// ---------------------------------------------------------------------------

const TOKEN_CONFIGS = [
  {
    id:       'genesis-premium',
    label:    'Genesis · Premium · Lanyard',
    tokenId:  1,
    passData: { accessTier: AccessTier.GENESIS,  status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: true,  frozen: false },
  },
  {
    id:       'builder-standard',
    label:    'Builder · Standard',
    tokenId:  42,
    passData: { accessTier: AccessTier.BUILDER,  status: PassStatus.ENABLED,  premium: false, lanyard: false, genesis: false, frozen: false },
  },
  {
    id:       'standard-lanyard',
    label:    'Standard · Lanyard',
    tokenId:  420,
    passData: { accessTier: AccessTier.STANDARD, status: PassStatus.ENABLED,  premium: false, lanyard: true,  genesis: false, frozen: false },
  },
  {
    id:       'partner-upgraded',
    label:    'Partner · Upgraded',
    tokenId:  999,
    passData: { accessTier: AccessTier.PARTNER,  status: PassStatus.UPGRADED, premium: true,  lanyard: false, genesis: false, frozen: false },
  },
  {
    id:       'special-locked',
    label:    'Special · Locked',
    tokenId:  100,
    passData: { accessTier: AccessTier.SPECIAL,  status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: false, frozen: false },
  },
];

// ---------------------------------------------------------------------------
// Synthetic PFPs  — pure SVG, no files needed
// Each is a simple colored shape that exercises a different composition case.
// ---------------------------------------------------------------------------

function _svgDataURI(svgContent) {
  const b64 = Buffer.from(svgContent, 'utf8').toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}

// 1. Square — dark gradient portrait (simulates a dark-skinned figure)
const SYNTHETIC_DARK_PORTRAIT = _svgDataURI(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="45%" r="55%">
      <stop offset="0%" stop-color="#4a3728"/>
      <stop offset="100%" stop-color="#1a0f0a"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="#1a0f0a"/>
  <!-- body -->
  <ellipse cx="256" cy="420" rx="160" ry="120" fill="#2d1f16"/>
  <!-- head -->
  <ellipse cx="256" cy="240" rx="100" ry="115" fill="url(#bg)"/>
  <!-- neck -->
  <rect x="226" y="340" width="60" height="50" fill="#3a2518"/>
</svg>`);

// 2. Wide landscape — tests cover-fit on a 16:9 shape
const SYNTHETIC_LANDSCAPE = _svgDataURI(`
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a1628"/>
      <stop offset="100%" stop-color="#1a3a6e"/>
    </linearGradient>
  </defs>
  <rect width="800" height="450" fill="url(#sky)"/>
  <!-- hills -->
  <ellipse cx="200" cy="450" rx="320" ry="160" fill="#0d1f0d"/>
  <ellipse cx="600" cy="450" rx="280" ry="140" fill="#142814"/>
  <!-- moon -->
  <circle cx="650" cy="80" r="40" fill="#d4c870" opacity="0.9"/>
</svg>`);

// 3. Bright face — high-contrast, tests silhouette remapping of light colors
const SYNTHETIC_BRIGHT_FACE = _svgDataURI(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <rect width="512" height="512" fill="#e8d5b0"/>
  <!-- hair -->
  <ellipse cx="256" cy="180" rx="115" ry="130" fill="#2c1a0e"/>
  <!-- face -->
  <ellipse cx="256" cy="260" rx="95" ry="110" fill="#f0c898"/>
  <!-- eyes -->
  <ellipse cx="222" cy="248" rx="12" ry="10" fill="#1a0a00"/>
  <ellipse cx="290" cy="248" rx="12" ry="10" fill="#1a0a00"/>
  <!-- body -->
  <path d="M 96,512 C 96,400 156,360 256,350 C 356,360 416,400 416,512 Z" fill="#3a5a8a"/>
</svg>`);

// 4. Pixel art — tests low-res hard-edge image in banner
const SYNTHETIC_PIXEL = _svgDataURI(`
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" shape-rendering="crispEdges">
  <rect width="128" height="128" fill="#2b2d3a"/>
  <!-- hat -->
  <rect x="36" y="12" width="56" height="8" fill="#111"/>
  <rect x="44" y="8"  width="40" height="12" fill="#1a1a1a"/>
  <!-- head -->
  <rect x="44" y="20" width="40" height="36" fill="#e8b87c"/>
  <!-- eyes -->
  <rect x="52" y="30" width="8"  height="8"  fill="#111"/>
  <rect x="68" y="30" width="8"  height="8"  fill="#111"/>
  <!-- body -->
  <rect x="32" y="56" width="64" height="48" fill="#3a5a9a"/>
  <!-- arms -->
  <rect x="16" y="56" width="16" height="32" fill="#3a5a9a"/>
  <rect x="96" y="56" width="16" height="32" fill="#3a5a9a"/>
</svg>`);

// 5. Abstract / no-face — tests non-portrait content
const SYNTHETIC_ABSTRACT = _svgDataURI(`
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
  <defs>
    <radialGradient id="c1" cx="30%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#7c3aed"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="c2" cx="70%" cy="70%" r="50%">
      <stop offset="0%" stop-color="#e05a3a"/>
      <stop offset="100%" stop-color="#050510" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="#050510"/>
  <rect width="512" height="512" fill="url(#c1)"/>
  <rect width="512" height="512" fill="url(#c2)"/>
  <circle cx="256" cy="256" r="80" fill="none" stroke="#c9a84c" stroke-width="3" opacity="0.6"/>
  <circle cx="256" cy="256" r="130" fill="none" stroke="#c9a84c" stroke-width="1.5" opacity="0.3"/>
  <circle cx="256" cy="256" r="180" fill="none" stroke="#c9a84c" stroke-width="1" opacity="0.15"/>
</svg>`);

const SYNTHETIC_PFPS = [
  { name: 'synthetic-dark-portrait',  dataURI: SYNTHETIC_DARK_PORTRAIT,  width: 512, height: 512,  mimeType: 'image/svg+xml' },
  { name: 'synthetic-landscape',      dataURI: SYNTHETIC_LANDSCAPE,      width: 800, height: 450,  mimeType: 'image/svg+xml' },
  { name: 'synthetic-bright-face',    dataURI: SYNTHETIC_BRIGHT_FACE,    width: 512, height: 512,  mimeType: 'image/svg+xml' },
  { name: 'synthetic-pixel-art',      dataURI: SYNTHETIC_PIXEL,          width: 128, height: 128,  mimeType: 'image/svg+xml' },
  { name: 'synthetic-abstract',       dataURI: SYNTHETIC_ABSTRACT,       width: 512, height: 512,  mimeType: 'image/svg+xml' },
];

module.exports = { TOKEN_CONFIGS, SYNTHETIC_PFPS };
