'use strict';

/**
 * exportBundle.js
 * Export a complete asset bundle for a single Lubies Factory Pass token.
 *
 * Produces:
 *   output/tokens/<tokenId>/
 *     <tokenId>.json       — metadata JSON
 *     <tokenId>.svg        — SVG master
 *     <tokenId>.prompt     — generation prompt export (for AI render tools)
 *     <tokenId>_thumb.svg  — cropped thumbnail (square, 540×540)
 *
 * If `sharp` is installed, also produces:
 *     <tokenId>.png        — rasterized PNG (856×540)
 *     <tokenId>_thumb.png  — thumbnail PNG (540×540)
 *
 * Usage:
 *   node scripts/exportBundle.js --token 420
 *   node scripts/exportBundle.js --token 1 --output ./output
 *   node scripts/exportBundle.js --token 1 --freeze
 *
 * Flags:
 *   --token    <id>     (required) Token ID to export.
 *   --output   <dir>   Output root directory. Default: ./output
 *   --freeze           Mark output as frozen (writes a .frozen sentinel file).
 *   --tier     <n>     Override access tier for preview (0-4).
 *   --status   <n>     Override status for preview (0-4).
 *   --premium          Set premium flag.
 *   --lanyard          Set lanyard flag.
 *   --genesis          Set genesis flag.
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const { generateTokenMetadata }   = require('../metadata/generator');
const { generateTokenImage }      = require('../renderer/passRenderer');
const { generateTokenTraitsOnly } = require('../metadata/generator');
const { AccessTier, PassStatus, TierLabel, StatusLabel } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args    = process.argv.slice(2);
const getFlag = (flag, def = null) => {
  const i = args.indexOf(flag);
  return i !== -1 ? (args[i + 1] || true) : def;
};
const hasFlag = (flag) => args.includes(flag);

const TOKEN_ID   = parseInt(getFlag('--token') || '0', 10);
const OUTPUT_DIR = getFlag('--output') || process.env.OUTPUT_DIR || './output';
const FREEZE     = hasFlag('--freeze');

if (!TOKEN_ID || TOKEN_ID < 1) {
  console.error('Error: --token <id> is required (must be >= 1)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CONFIG = {
  imageBaseURI:     process.env.METADATA_IMAGE_BASE_URI     || 'ipfs://PENDING_IMAGE_CID/',
  animationBaseURI: process.env.METADATA_ANIMATION_BASE_URI || 'ipfs://PENDING_SVG_CID/',
  externalUrl:      process.env.METADATA_EXTERNAL_URL       || 'https://lubies.xyz',
  includeAnimation: true,
  salt:             'lubies-factory-pass-v1',
};

const GENESIS_SUPPLY = parseInt(process.env.DEPLOY_GENESIS_SUPPLY || '100', 10);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n--- Lubies Factory Pass · Token Bundle Export ---`);
  console.log(`Token ID: ${TOKEN_ID}\n`);

  // Build PassData from CLI flags or defaults
  const isGenesis = TOKEN_ID <= GENESIS_SUPPLY;
  const passData  = {
    accessTier: parseInt(getFlag('--tier') || (isGenesis ? AccessTier.GENESIS : AccessTier.STANDARD), 10),
    status:     parseInt(getFlag('--status') || PassStatus.ENABLED, 10),
    premium:    hasFlag('--premium'),
    lanyard:    hasFlag('--lanyard'),
    genesis:    hasFlag('--genesis') || isGenesis,
    frozen:     FREEZE,
  };

  console.log('Pass data:');
  console.log(`  Access Tier:  ${TierLabel[passData.accessTier] || passData.accessTier}`);
  console.log(`  Status:       ${StatusLabel[passData.status] || passData.status}`);
  console.log(`  Premium:      ${passData.premium}`);
  console.log(`  Lanyard:      ${passData.lanyard}`);
  console.log(`  Genesis:      ${passData.genesis}`);
  console.log('');

  // Output directory for this token
  const tokenDir = path.join(OUTPUT_DIR, 'tokens', String(TOKEN_ID));
  fs.mkdirSync(tokenDir, { recursive: true });

  // ---------------------------------------------------------------------------
  // 1. Metadata JSON
  // ---------------------------------------------------------------------------
  const metadata     = generateTokenMetadata(TOKEN_ID, passData, CONFIG);
  const metadataPath = path.join(tokenDir, `${TOKEN_ID}.json`);
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
  console.log(`✓ Metadata JSON → ${metadataPath}`);

  // ---------------------------------------------------------------------------
  // 2. SVG master
  // ---------------------------------------------------------------------------
  const svg     = generateTokenImage(TOKEN_ID, passData, CONFIG);
  const svgPath = path.join(tokenDir, `${TOKEN_ID}.svg`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  console.log(`✓ SVG master    → ${svgPath}`);

  // ---------------------------------------------------------------------------
  // 3. Prompt export
  // ---------------------------------------------------------------------------
  const traits      = generateTokenTraitsOnly(TOKEN_ID, passData, CONFIG);
  const promptText  = _buildPromptExport(TOKEN_ID, metadata, traits);
  const promptPath  = path.join(tokenDir, `${TOKEN_ID}.prompt`);
  fs.writeFileSync(promptPath, promptText, 'utf8');
  console.log(`✓ Prompt export → ${promptPath}`);

  // ---------------------------------------------------------------------------
  // 4. Thumbnail SVG (square crop 540×540, centered)
  // ---------------------------------------------------------------------------
  const thumbSvg  = _buildThumbSVG(svg);
  const thumbPath = path.join(tokenDir, `${TOKEN_ID}_thumb.svg`);
  fs.writeFileSync(thumbPath, thumbSvg, 'utf8');
  console.log(`✓ Thumbnail SVG → ${thumbPath}`);

  // ---------------------------------------------------------------------------
  // 5. PNG (optional — requires sharp)
  // ---------------------------------------------------------------------------
  await _tryRasterize(svg, thumbSvg, TOKEN_ID, tokenDir);

  // ---------------------------------------------------------------------------
  // 6. Freeze sentinel
  // ---------------------------------------------------------------------------
  if (FREEZE) {
    const frozenPath = path.join(tokenDir, `${TOKEN_ID}.frozen`);
    fs.writeFileSync(frozenPath, JSON.stringify({
      tokenId:   TOKEN_ID,
      frozenAt:  new Date().toISOString(),
      metadataHash: _sha256(JSON.stringify(metadata)),
      svgHash:      _sha256(svg),
    }, null, 2));
    console.log(`✓ Freeze record → ${frozenPath}`);
  }

  console.log(`\nBundle complete: ${tokenDir}\n`);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _buildPromptExport(tokenId, metadata, traits) {
  const paddedId = String(tokenId).padStart(4, '0');
  const attrLines = metadata.attributes
    .map(a => `  ${a.trait_type}: ${a.value}`)
    .join('\n');

  return [
    `LUBIES FACTORY PASS — Token #${paddedId}`,
    `Generated: ${new Date().toISOString()}`,
    ``,
    `== IDENTITY ==`,
    `Name:        ${metadata.name}`,
    `Description: ${metadata.description}`,
    ``,
    `== TRAITS ==`,
    attrLines,
    ``,
    `== RENDER RECIPE ==`,
    `Pattern Mode:    ${traits.patternMode}`,
    `Palette Mode:    ${traits.paletteMode}`,
    `Silhouette Mode: ${traits.silhouetteMode}`,
    ``,
    `== VISUAL PROMPT ==`,
    `A brand-locked Lubies Factory identity pass card rendered as a dark, premium SVG.`,
    `Palette: ${traits.paletteMode}. Pattern: ${traits.patternMode}.`,
    `Tier: ${traits.accessTier}. Status: ${traits.status}.`,
    `${traits.genesis === 'True' ? 'Genesis edition. ' : ''}${traits.premium === 'True' ? 'Premium holographic finish.' : ''}`,
    `Deterministic fingerprint ridge pattern centered-right on card.`,
    `Monospace typography. Industrial pass aesthetic. No random elements.`,
  ].join('\n');
}

function _buildThumbSVG(fullSvg) {
  // Wrap in a viewport that crops to a 540×540 square centered on the card
  const offsetX = (856 - 540) / 2;  // 158
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${offsetX} 0 540 540" width="540" height="540">`,
    `  <g transform="translate(-${offsetX}, 0)">`,
    `    ${fullSvg}`,
    `  </g>`,
    `</svg>`,
  ].join('\n');
}

async function _tryRasterize(svg, thumbSvg, tokenId, tokenDir) {
  try {
    const sharp = require('sharp');

    const pngBuf = await sharp(Buffer.from(svg, 'utf8')).png().toBuffer();
    const pngPath = path.join(tokenDir, `${tokenId}.png`);
    fs.writeFileSync(pngPath, pngBuf);
    console.log(`✓ PNG preview   → ${pngPath}`);

    const thumbBuf = await sharp(Buffer.from(thumbSvg, 'utf8'))
      .resize(540, 540)
      .png()
      .toBuffer();
    const thumbPngPath = path.join(tokenDir, `${tokenId}_thumb.png`);
    fs.writeFileSync(thumbPngPath, thumbBuf);
    console.log(`✓ PNG thumbnail → ${thumbPngPath}`);

  } catch {
    console.log(`  (PNG skipped — install 'sharp' for PNG output: npm i sharp)`);
  }
}

function _sha256(str) {
  const { createHash } = require('crypto');
  return createHash('sha256').update(str, 'utf8').digest('hex');
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
