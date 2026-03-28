'use strict';

/**
 * testRuns.js
 * Generate test pass SVGs for every PFP in test-pfps/ across 5 token configs.
 *
 * Outputs:
 *   output/test-runs/
 *     <pfpName>_token<id>.svg   — individual pass SVGs
 *     index.html                — preview grid (all passes in a page)
 *
 * Usage:
 *   node scripts/testRuns.js
 *   node scripts/testRuns.js --output ./output
 *   node scripts/testRuns.js --pfp ./my-image.png   (single image override)
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const { generateTokenImage }  = require('../renderer/passRenderer');
const { loadPFP, loadPFPSync } = require('../utils/pfpEmbed');
const { AccessTier, PassStatus } = require('../metadata/traits');

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args    = process.argv.slice(2);
const getFlag = (flag, def = null) => { const i = args.indexOf(flag); return i !== -1 ? (args[i + 1] || true) : def; };
const OUTPUT_DIR = getFlag('--output') || process.env.OUTPUT_DIR || './output';
const SINGLE_PFP = getFlag('--pfp');

// ---------------------------------------------------------------------------
// Test token configurations
// ---------------------------------------------------------------------------

const TEST_CONFIGS = [
  {
    label:    'Genesis · Premium',
    tokenId:  1,
    passData: { accessTier: AccessTier.GENESIS,   status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: true,  frozen: false },
  },
  {
    label:    'Builder · Standard',
    tokenId:  42,
    passData: { accessTier: AccessTier.BUILDER,   status: PassStatus.ENABLED,  premium: false, lanyard: false, genesis: false, frozen: false },
  },
  {
    label:    'Standard · Lanyard',
    tokenId:  420,
    passData: { accessTier: AccessTier.STANDARD,  status: PassStatus.ENABLED,  premium: false, lanyard: true,  genesis: false, frozen: false },
  },
  {
    label:    'Partner · Upgraded',
    tokenId:  999,
    passData: { accessTier: AccessTier.PARTNER,   status: PassStatus.UPGRADED, premium: true,  lanyard: false, genesis: false, frozen: false },
  },
  {
    label:    'Special · Locked',
    tokenId:  100,
    passData: { accessTier: AccessTier.SPECIAL,   status: PassStatus.ENABLED,  premium: true,  lanyard: true,  genesis: false, frozen: false },
  },
];

const CONFIG = {
  salt: 'lubies-factory-pass-v1',
};

// ---------------------------------------------------------------------------
// Discover PFP images
// ---------------------------------------------------------------------------

function discoverPFPs() {
  if (SINGLE_PFP) {
    return [path.resolve(SINGLE_PFP)];
  }

  const pfpDir = path.resolve(__dirname, '../test-pfps');
  if (!fs.existsSync(pfpDir)) {
    console.warn(`No test-pfps/ directory found at ${pfpDir}`);
    console.warn('Running without PFPs (placeholder silhouette will be used).');
    return [];
  }

  const EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  return fs.readdirSync(pfpDir)
    .filter(f => EXTENSIONS.has(path.extname(f).toLowerCase()))
    .map(f => path.join(pfpDir, f))
    .sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n--- Lubies Factory Pass · Test Runs ---\n');

  const outDir = path.join(OUTPUT_DIR, 'test-runs');
  fs.mkdirSync(outDir, { recursive: true });

  const pfpPaths = discoverPFPs();
  console.log(`PFP images found: ${pfpPaths.length}`);
  pfpPaths.forEach(p => console.log(`  ${path.basename(p)}`));
  console.log('');

  // Build the run set: each PFP × each token config (+ one null-PFP run)
  const runs = [];

  // No-PFP run (placeholder silhouette, first config only)
  runs.push({ pfpData: null, pfpLabel: 'placeholder', config: TEST_CONFIGS[0] });

  // PFP × all configs
  for (const pfpPath of pfpPaths) {
    let pfpData;
    try {
      pfpData = await loadPFP(pfpPath);
    } catch (err) {
      console.warn(`  Failed to load ${pfpPath}: ${err.message} — using sync fallback`);
      pfpData = loadPFPSync(pfpPath);
    }
    for (const cfg of TEST_CONFIGS) {
      runs.push({ pfpData, pfpLabel: pfpData.name, config: cfg });
    }
  }

  console.log(`Generating ${runs.length} passes…\n`);

  const htmlCards = [];

  for (const { pfpData, pfpLabel, config } of runs) {
    const { tokenId, passData, label } = config;
    const slug    = `${pfpLabel.replace(/[^a-z0-9_-]/gi, '_')}_token${tokenId}`;
    const outPath = path.join(outDir, `${slug}.svg`);

    const svg = generateTokenImage(tokenId, passData, CONFIG, pfpData);
    fs.writeFileSync(outPath, svg, 'utf8');

    const relPath = path.relative(outDir, outPath);
    htmlCards.push(_htmlCard(relPath, pfpLabel, label, tokenId));
    console.log(`  ✓  ${slug}.svg`);
  }

  // Write HTML preview
  const htmlPath = path.join(outDir, 'index.html');
  fs.writeFileSync(htmlPath, _buildHTML(htmlCards), 'utf8');
  console.log(`\n✓  Preview grid → ${htmlPath}`);
  console.log(`\nDone. ${runs.length} passes generated.\n`);
}

// ---------------------------------------------------------------------------
// HTML preview builder
// ---------------------------------------------------------------------------

function _htmlCard(svgPath, pfpLabel, configLabel, tokenId) {
  return `
    <figure class="card">
      <img src="${svgPath}" alt="Token #${tokenId} — ${pfpLabel}" loading="lazy"/>
      <figcaption>
        <strong>#${tokenId}</strong> · ${configLabel}<br/>
        <em>${pfpLabel}</em>
      </figcaption>
    </figure>`;
}

function _buildHTML(cards) {
  const date = new Date().toISOString().slice(0, 16).replace('T', ' ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Lubies Factory Pass · Test Runs</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0b10;
      color: #f0f0f0;
      font-family: 'Courier New', Courier, monospace;
      padding: 32px 24px;
    }
    h1 {
      font-size: 1.4rem;
      letter-spacing: 3px;
      color: #c9a84c;
      margin-bottom: 6px;
      text-transform: uppercase;
    }
    .meta {
      font-size: 0.75rem;
      color: #666;
      margin-bottom: 32px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 24px;
    }
    .card {
      background: #131318;
      border: 1px solid #2a2a35;
      border-radius: 12px;
      overflow: hidden;
      transition: transform 0.15s ease;
    }
    .card:hover { transform: translateY(-3px); border-color: #c9a84c66; }
    .card img {
      display: block;
      width: 100%;
      height: auto;
    }
    figcaption {
      padding: 10px 14px 12px;
      font-size: 0.78rem;
      line-height: 1.6;
      color: #aaa;
    }
    figcaption strong { color: #e0d0a0; }
    figcaption em { color: #666; font-style: normal; }
  </style>
</head>
<body>
  <h1>Lubies Factory Pass</h1>
  <p class="meta">Test run · ${date} UTC · ${cards.length} passes</p>
  <div class="grid">
    ${cards.join('\n    ')}
  </div>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('\nFatal:', err);
  process.exit(1);
});
