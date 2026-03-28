# test-pfps/

Drop PFP images here to run them through the pass renderer test suite.

## Supported formats

`.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`

## How to run

```bash
node scripts/testRuns.js
```

Outputs SVGs + an HTML preview grid at `output/test-runs/index.html`.

## Single image

```bash
node scripts/testRuns.js --pfp ./path/to/image.png
```

## Test set (9 images used in development)

The development test set consisted of:

| File | Description |
|------|-------------|
| `pfp_01_mole.png` | Cartoon mole NFT avatar |
| `pfp_02_blue3d.png` | Blue 3D CGI character |
| `pfp_03_hill.jpg` | Photo — hill/landscape scene |
| `pfp_04_pixel.png` | Pixel art character |
| `pfp_05_balloon.png` | Balloon character |
| `pfp_06_donut.png` | Kawaii donut-head character (purple outfit) |
| `pfp_07_ape.png` | BAYC-style ape (bowler hat + lab coat) |
| `pfp_08_cosmic.png` | Ethereal cosmic woman with glowing eyes |
| `pfp_09_portrait.jpg` | B&W photo — bald man portrait |

## Notes

- Images are embedded as base64 data URIs directly in the SVG.
- A palette-matched silhouette filter remaps all image colors to the
  token's `silhouetteFill` with a `silhouetteStroke` outline ring.
- Install `sharp` (`npm i sharp`) for correct image dimensions in the fit
  calculation; without it, 512×512 is assumed.
