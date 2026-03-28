'use strict';

/**
 * qa/run.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Lubies Factory Pass — QA suite entry point.
 *
 * Runs three suites in sequence:
 *
 *   1. RENDERER — generates SVG passes for every combination of:
 *        • 5 built-in synthetic PFP images (zero setup, always runs)
 *        • any real images dropped into  qa/pfps/
 *        × 5 token configurations (Genesis, Builder, Standard, Partner, Special)
 *        + 1 no-PFP pass (placeholder silhouette)
 *
 *   2. SMOKE    — sanity-checks the SVG output (non-empty, correct dims,
 *                 contains expected elements)
 *
 *   3. CONTRACT — runs the Hardhat test suite (skipped if --no-contract)
 *
 * Output
 *   qa/results/
 *     index.html          visual preview grid of every generated pass
 *     passes/             individual .svg files
 *     qa-report.json      machine-readable result summary
 *
 * Usage
 *   npm run qa                  full suite
 *   npm run qa -- --no-contract renderer + smoke only (fast)
 *   npm run qa -- --filter ape  only run PFPs whose name contains "ape"
 *   npm run qa -- --token 1     only run token config with tokenId=1
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();

const fs            = require('fs');
const path          = require('path');
const { execSync }  = require('child_process');

const { generateTokenImage }    = require('../renderer/passRenderer');
const { loadPFP, loadPFPSync }  = require('../utils/pfpEmbed');
const { TOKEN_CONFIGS, SYNTHETIC_PFPS } = require('./fixtures');

// ─── CLI flags ────────────────────────────────────────────────────────────────

const argv        = process.argv.slice(2);
const hasFlag     = f => argv.includes(f);
const getFlag     = (f, def = null) => { const i = argv.indexOf(f); return i !== -1 ? (argv[i + 1] ?? true) : def; };

const RUN_CONTRACT = !hasFlag('--no-contract');
const FILTER_PFP   = (getFlag('--filter') || '').toLowerCase();
const FILTER_TOKEN = getFlag('--token') ? Number(getFlag('--token')) : null;

// ─── Paths ────────────────────────────────────────────────────────────────────

const QA_DIR      = __dirname;
const PFPS_DIR    = path.join(QA_DIR, 'pfps');
const RESULTS_DIR = path.join(QA_DIR, 'results');
const PASSES_DIR  = path.join(RESULTS_DIR, 'passes');

const RENDER_CONFIG = { salt: 'lubies-factory-pass-v1' };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log  = (...a) => console.log(...a);
const ok   = msg    => log(`  \x1b[32m✓\x1b[0m  ${msg}`);
const fail = msg    => log(`  \x1b[31m✗\x1b[0m  ${msg}`);
const info = msg    => log(`  \x1b[36m·\x1b[0m  ${msg}`);
const head = msg    => log(`\n\x1b[1m${msg}\x1b[0m`);

// ─── Load real PFPs from qa/pfps/ ─────────────────────────────────────────────

async function loadRealPFPs() {
  if (!fs.existsSync(PFPS_DIR)) return [];
  const EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp']);
  const files = fs.readdirSync(PFPS_DIR)
    .filter(f => EXTS.has(path.extname(f).toLowerCase()))
    .sort();

  const loaded = [];
  for (const file of files) {
    try {
      const pfp = await loadPFP(path.join(PFPS_DIR, file));
      loaded.push(pfp);
    } catch {
      loaded.push(loadPFPSync(path.join(PFPS_DIR, file)));
    }
  }
  return loaded;
}

// ─── Suite 1: Renderer ────────────────────────────────────────────────────────

async function suiteRenderer(realPFPs) {
  head('SUITE 1 — Renderer');

  fs.mkdirSync(PASSES_DIR, { recursive: true });

  // Apply filters
  const tokenConfigs = FILTER_TOKEN
    ? TOKEN_CONFIGS.filter(c => c.tokenId === FILTER_TOKEN)
    : TOKEN_CONFIGS;

  const allPFPs = [
    ...SYNTHETIC_PFPS,
    ...realPFPs,
  ].filter(p => !FILTER_PFP || p.name.toLowerCase().includes(FILTER_PFP));

  const passes = [];
  let passed = 0;
  let failed = 0;

  // No-PFP placeholder pass (first token config only, once)
  if (!FILTER_PFP) {
    const cfg  = tokenConfigs[0];
    const slug = `placeholder_token${cfg.tokenId}`;
    try {
      const svg  = generateTokenImage(cfg.tokenId, cfg.passData, RENDER_CONFIG, null);
      const file = `${slug}.svg`;
      fs.writeFileSync(path.join(PASSES_DIR, file), svg, 'utf8');
      ok(`${slug}`);
      passes.push({ slug, file, pfpLabel: 'Placeholder silhouette', configLabel: cfg.label, tokenId: cfg.tokenId });
      passed++;
    } catch (e) {
      fail(`${slug} — ${e.message}`);
      failed++;
    }
  }

  // PFP × token config matrix
  for (const pfp of allPFPs) {
    for (const cfg of tokenConfigs) {
      const slug = `${pfp.name.replace(/[^a-z0-9_-]/gi, '_')}_token${cfg.tokenId}`;
      try {
        const svg  = generateTokenImage(cfg.tokenId, cfg.passData, RENDER_CONFIG, pfp);
        const file = `${slug}.svg`;
        fs.writeFileSync(path.join(PASSES_DIR, file), svg, 'utf8');
        ok(`${slug}`);
        passes.push({ slug, file, pfpLabel: pfp.name, configLabel: cfg.label, tokenId: cfg.tokenId });
        passed++;
      } catch (e) {
        fail(`${slug} — ${e.message}`);
        failed++;
      }
    }
  }

  log(`\n  ${passed} passed  ${failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`);
  return { passes, passed, failed };
}

// ─── Suite 2: Smoke tests ─────────────────────────────────────────────────────

function suiteSmoke(passes) {
  head('SUITE 2 — Smoke');

  let passed = 0;
  let failed = 0;

  const checks = [
    { name: 'Non-empty SVG',       fn: svg => svg.length > 500 },
    { name: 'Has <svg> root',      fn: svg => svg.includes('<svg ') },
    { name: 'Has viewBox 560×760', fn: svg => svg.includes('viewBox="0 0 560 760"') },
    { name: 'Has RD pattern path', fn: svg => svg.includes('<path d="M ') },
    { name: 'Has FACTORY text',    fn: svg => svg.includes('FACTORY') },
    { name: 'Has divider stripe',  fn: svg => svg.includes('rect') },
    { name: 'Has Lubies logo',     fn: svg => svg.includes('#E05A3A') },
  ];

  for (const { file, slug } of passes) {
    const svgPath = path.join(PASSES_DIR, file);
    if (!fs.existsSync(svgPath)) { fail(`${slug} — file missing`); failed++; continue; }
    const svg = fs.readFileSync(svgPath, 'utf8');

    let allOk = true;
    for (const check of checks) {
      if (!check.fn(svg)) {
        fail(`${slug} — failed: ${check.name}`);
        allOk = false;
        failed++;
      }
    }
    if (allOk) { ok(slug); passed++; }
  }

  log(`\n  ${passed} passed  ${failed > 0 ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`);
  return { passed, failed };
}

// ─── Suite 3: Contract ────────────────────────────────────────────────────────

function suiteContract() {
  head('SUITE 3 — Contract (Hardhat)');
  try {
    execSync('npx hardhat test', {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    return { passed: true };
  } catch {
    fail('Hardhat test run failed — see output above');
    return { passed: false };
  }
}

// ─── HTML Report ──────────────────────────────────────────────────────────────

function writeReport(passes, results) {
  // Group cards by PFP name
  const groups = {};
  for (const p of passes) {
    if (!groups[p.pfpLabel]) groups[p.pfpLabel] = [];
    groups[p.pfpLabel].push(p);
  }

  const sections = Object.entries(groups).map(([label, cards]) => {
    const items = cards.map(c => `
      <figure class="card">
        <img src="passes/${c.file}" alt="${c.slug}" loading="lazy"/>
        <figcaption>${c.configLabel}</figcaption>
      </figure>`).join('');
    return `<section><h2>${label}</h2><div class="row">${items}</div></section>`;
  });

  const date     = new Date().toISOString().slice(0,16).replace('T',' ');
  const total    = results.renderer.passed + results.renderer.failed;
  const smokePct = Math.round(results.smoke.passed / Math.max(results.smoke.passed + results.smoke.failed, 1) * 100);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Lubies Factory Pass · QA Report</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    body{background:#09090e;color:#d0d0d0;font-family:'Courier New',Courier,monospace;padding:32px 24px}
    h1{font-size:1.3rem;letter-spacing:4px;color:#c9a84c;text-transform:uppercase;margin-bottom:4px}
    .meta{font-size:.75rem;color:#555;margin-bottom:12px}
    .badges{display:flex;gap:10px;margin-bottom:36px;flex-wrap:wrap}
    .badge{padding:4px 12px;border-radius:4px;font-size:.72rem;letter-spacing:1px;font-weight:700}
    .badge.ok{background:#14291a;color:#4ade80;border:1px solid #1f4429}
    .badge.warn{background:#291414;color:#f87171;border:1px solid #441f1f}
    .badge.info{background:#0e1a29;color:#60a5fa;border:1px solid #1a2e44}
    section{margin-bottom:40px}
    h2{font-size:.85rem;letter-spacing:2px;color:#c9a84c;text-transform:uppercase;margin-bottom:14px;
       padding-bottom:6px;border-bottom:1px solid #1f1f2a}
    .row{display:flex;flex-wrap:wrap;gap:16px}
    .card{background:#111118;border:1px solid #1e1e2a;border-radius:10px;overflow:hidden;
          width:180px;flex-shrink:0;transition:transform .15s,border-color .15s}
    .card:hover{transform:translateY(-2px);border-color:#c9a84c55}
    .card img{display:block;width:100%;height:auto}
    figcaption{padding:7px 10px 9px;font-size:.68rem;color:#888;line-height:1.4}
    footer{margin-top:48px;font-size:.7rem;color:#333;border-top:1px solid #1a1a22;padding-top:16px}
  </style>
</head>
<body>
  <h1>Lubies Factory Pass</h1>
  <p class="meta">QA Report · ${date} UTC</p>
  <div class="badges">
    <span class="badge ${results.renderer.failed === 0 ? 'ok' : 'warn'}">
      Renderer  ${results.renderer.passed}/${total}
    </span>
    <span class="badge ${results.smoke.failed === 0 ? 'ok' : 'warn'}">
      Smoke  ${smokePct}%
    </span>
    ${results.contract
      ? `<span class="badge ${results.contract.passed ? 'ok' : 'warn'}">Contract ${results.contract.passed ? 'PASS' : 'FAIL'}</span>`
      : `<span class="badge info">Contract skipped</span>`}
  </div>
  ${sections.join('\n  ')}
  <footer>Generated by qa/run.js · Lubies Factory Pass v1</footer>
</body>
</html>`;

  const htmlPath = path.join(RESULTS_DIR, 'index.html');
  fs.writeFileSync(htmlPath, html, 'utf8');

  // JSON summary
  const jsonPath = path.join(RESULTS_DIR, 'qa-report.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ date, results, passes: passes.map(p => p.slug) }, null, 2));

  return htmlPath;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('\n\x1b[1m\x1b[33m━━  Lubies Factory Pass · QA Suite  ━━\x1b[0m');

  // Load real PFPs from qa/pfps/
  const realPFPs = await loadRealPFPs();
  info(`Synthetic PFPs: ${SYNTHETIC_PFPS.length}`);
  info(`Real PFPs in qa/pfps/: ${realPFPs.length}`);
  if (FILTER_PFP)   info(`Filter: --filter ${FILTER_PFP}`);
  if (FILTER_TOKEN) info(`Filter: --token ${FILTER_TOKEN}`);

  // Suite 1
  const { passes, passed: rPass, failed: rFail } = await suiteRenderer(realPFPs);

  // Suite 2
  const { passed: sPass, failed: sFail } = suiteSmoke(passes);

  // Suite 3
  const contractResult = RUN_CONTRACT ? suiteContract() : null;

  // Report
  const results = {
    renderer: { passed: rPass, failed: rFail },
    smoke:    { passed: sPass, failed: sFail },
    contract: contractResult,
  };
  const htmlPath = writeReport(passes, results);

  head('Results');
  ok(`Preview grid → ${htmlPath}`);
  ok(`SVG files    → ${PASSES_DIR}`);
  ok(`JSON report  → ${path.join(RESULTS_DIR, 'qa-report.json')}`);

  const anyFail = rFail > 0 || sFail > 0 || (contractResult && !contractResult.passed);
  if (anyFail) {
    log('\n\x1b[31m  QA FAILED — see output above\x1b[0m\n');
    process.exit(1);
  } else {
    log('\n\x1b[32m  QA PASSED\x1b[0m\n');
  }
}

main().catch(err => {
  console.error('\nFatal:', err);
  process.exit(1);
});
