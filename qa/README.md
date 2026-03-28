# QA Suite

One command runs everything.

```bash
npm run qa
```

Then open `qa/results/index.html` in a browser.

---

## What it runs

| Suite | What it does |
|-------|-------------|
| **Renderer** | Generates an SVG pass for every PFP × every token config |
| **Smoke** | Checks each SVG is valid, has correct dimensions, contains expected elements |
| **Contract** | Runs the full Hardhat unit test suite |

---

## Commands

```bash
npm run qa             # full suite (renderer + smoke + contract tests)
npm run qa:fast        # renderer + smoke only, skips Hardhat (fast)

# filters
npm run qa -- --filter ape      # only PFPs whose filename contains "ape"
npm run qa -- --token 1         # only the Genesis token config
npm run qa -- --no-contract     # same as qa:fast
```

---

## Adding your own PFP images

1. Drop any `.jpg`, `.png`, or `.webp` into `qa/pfps/`
2. Run `npm run qa`

That's it. The suite auto-discovers everything in that folder.

```
qa/
  pfps/
    ape.png          ← drop images here
    portrait.jpg
    my-pfp.webp
```

The suite runs each image against all 5 token configurations:

| Config | Token ID | Tier | Notes |
|--------|----------|------|-------|
| Genesis · Premium | 1 | Genesis | lanyard, premium, gold palette |
| Builder · Standard | 42 | Builder | green palette |
| Standard · Lanyard | 420 | Standard | lanyard ring |
| Partner · Upgraded | 999 | Partner | upgraded status, rose palette |
| Special · Locked | 100 | Special | platinum palette |

---

## Zero-config test images

5 synthetic SVG images are built into the suite — it runs without any files in `qa/pfps/`.
They cover: dark portrait, wide landscape, bright face, pixel art, abstract composition.

---

## Output

```
qa/results/
  index.html        ← open this in a browser
  qa-report.json    ← machine-readable summary
  passes/
    synthetic-dark-portrait_token1.svg
    synthetic-dark-portrait_token42.svg
    ...
    ape_token1.svg
    ...
```
