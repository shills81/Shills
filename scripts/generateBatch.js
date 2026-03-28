'use strict';

/**
 * generateBatch.js
 * Batch metadata + SVG generation for the Lubies Factory Pass collection.
 *
 * Reads token data from a JSON input file (or generates a mock dataset),
 * then writes metadata JSON and SVG files for every token to the output directory.
 *
 * Usage:
 *   node scripts/generateBatch.js
 *   node scripts/generateBatch.js --input ./data/tokens.json --output ./output
 *   node scripts/generateBatch.js --start 1 --end 100
 *
 * The input JSON should be an array of:
 *   { tokenId: number, passData: { accessTier, status, premium, lanyard, genesis, frozen } }
 *
 * If no input file is provided, a standard mock dataset is used
 * (useful for pre-reveal preview generation or testing).
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const { generateTokenMetadata }   = require('../metadata/generator');
const { generateTokenImage }      = require('../renderer/passRenderer');
const { AccessTier, PassStatus }  = require('../metadata/traits');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args       = process.argv.slice(2);
const getArg     = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 ? args[i + 1] : null;
};

const INPUT_FILE  = getArg('--input');
const OUTPUT_DIR  = getArg('--output') || process.env.OUTPUT_DIR || './output';
const START_ID    = parseInt(getArg('--start') || '1', 10);
const END_ID      = parseInt(getArg('--end')   || '0', 10);
const CONCURRENCY = parseInt(getArg('--concurrency') || '10', 10);

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

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- Lubies Factory Pass · Batch Generator ---\n');

  // Load or build token list
  const tokens = _loadTokens();
  const total  = tokens.length;

  console.log(`Tokens to generate: ${total}`);
  console.log(`Output directory:   ${path.resolve(OUTPUT_DIR)}\n`);

  // Create output directories
  const metaDir = path.join(OUTPUT_DIR, 'metadata');
  const svgDir  = path.join(OUTPUT_DIR, 'svg');

  fs.mkdirSync(metaDir, { recursive: true });
  fs.mkdirSync(svgDir,  { recursive: true });

  let processed = 0;
  let errors    = 0;

  // Process in batches for progress reporting
  for (let i = 0; i < tokens.length; i += CONCURRENCY) {
    const batch = tokens.slice(i, i + CONCURRENCY);

    await Promise.all(batch.map(async ({ tokenId, passData }) => {
      try {
        // Metadata JSON
        const metadata = generateTokenMetadata(tokenId, passData, CONFIG);
        const metaPath = path.join(metaDir, `${tokenId}.json`);
        fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));

        // SVG
        const svg     = generateTokenImage(tokenId, passData, CONFIG);
        const svgPath = path.join(svgDir, `${tokenId}.svg`);
        fs.writeFileSync(svgPath, svg, 'utf8');

        processed++;
      } catch (err) {
        console.error(`  ERROR token ${tokenId}: ${err.message}`);
        errors++;
      }
    }));

    // Progress
    const pct = Math.round(((i + batch.length) / total) * 100);
    process.stdout.write(`\r  Progress: ${i + batch.length}/${total} (${pct}%)  `);
  }

  console.log(`\n\nDone. Generated: ${processed}  Errors: ${errors}`);
  console.log(`Metadata → ${path.join(OUTPUT_DIR, 'metadata')}`);
  console.log(`SVG      → ${path.join(OUTPUT_DIR, 'svg')}`);

  if (errors > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Token loader
// ---------------------------------------------------------------------------

function _loadTokens() {
  if (INPUT_FILE) {
    const raw = fs.readFileSync(path.resolve(INPUT_FILE), 'utf8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) throw new Error('Input file must be a JSON array.');
    return data;
  }

  // Auto-generate a mock dataset
  // In production, replace with contract read (ethers.js) or a real data export.
  const MAX_SUPPLY    = parseInt(process.env.DEPLOY_MAX_SUPPLY   || '5000', 10);
  const GENESIS_SUPPLY = parseInt(process.env.DEPLOY_GENESIS_SUPPLY || '100', 10);

  const endId = END_ID > 0 ? Math.min(END_ID, MAX_SUPPLY) : MAX_SUPPLY;

  const tokens = [];
  for (let id = START_ID; id <= endId; id++) {
    tokens.push({
      tokenId: id,
      passData: _mockPassData(id, GENESIS_SUPPLY),
    });
  }
  return tokens;
}

/**
 * Generate mock PassData for a token (mirrors contract defaults).
 * In production, read actual onchain state instead.
 */
function _mockPassData(tokenId, genesisSupply) {
  const isGenesis = tokenId <= genesisSupply;
  return {
    accessTier: isGenesis ? AccessTier.GENESIS : AccessTier.STANDARD,
    status:     PassStatus.ENABLED,
    premium:    false,
    lanyard:    false,
    genesis:    isGenesis,
    frozen:     false,
  };
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  process.exit(1);
});
