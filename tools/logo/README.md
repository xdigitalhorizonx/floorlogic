# FloorLogic logo build

Regenerates `public/brand/*.svg`, `public/favicon.svg` + `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` and `site.webmanifest` from the owner's raster, then runs QA.

Run from the repo root:

    python -I tools/logo/build.py --src "H:/My Drive/The Dead Sea Scrolls/Brand Assets/floorlogic/logos/floorlogic-logo-2026-10-source.png"

- Needs Python 3.12 (numpy, scipy, scikit-image, opencv-python, Pillow), Node 24, and Chrome for the browser cross-check.
- `potrace@2.1.8` and `@resvg/resvg-js@2.6.2` are npm-installed into `--work` (default `%TEMP%/floorlogic-logo`), never into this repo's `node_modules`.
- `--mark traced` swaps the exact 2:1 lattice mark for free polygons that follow the raster (mark IoU 0.998 vs 0.962).
- QA output lands in `--work`: IoU table (stdout + `qa-report.json`), `contact-sheet.png`, `browser-check.png`.

Files: `build.py` pipeline · `flogo.py` source analysis, lattice fit, gradients, wordmark trace, SVG writer · `qa.py` IoU, Chrome check, contact sheet · `node/*.cjs` potrace and resvg wrappers.
