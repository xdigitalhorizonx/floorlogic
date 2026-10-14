# Demo video tools

Films the FloorLogic app fully offline and renders the 45-second site video
(`public/video/floorlogic-demo.*`). Nothing here touches a database or the internet.

## Hard rules
- Never point this at landmarkflooring.app or any Supabase project.
- The app runs on 127.0.0.1 against an in-memory Supabase stand-in (`harness/sb-stub.js`).
- Three network locks (DNS, request interception, block list); a run fails on any leak.
- Nothing tilted (owner, 2026-10-14): drags and stamps stay level.

## Setup
1. `npm install` in this folder (puppeteer-core only; uses your installed Chrome).
2. Export the app's pages with `git show main:index.html` and `git show main:q.html`
   into `app-export/demo-main-index.html` and `app-export/demo-main-q.html`
   (or set `FL_APP_DIR` to a folder holding those two files). Never check out a branch.
3. Sample data: `harness/fixture.json` (build it with `../export-fixture.mjs`).

## Run
1. `node harness/smoke.mjs` boots the app offline; it must print `ISOLATION OK`.
2. `node capture/run.mjs` films the stills into `capture/stills/` + `capture/manifest.json`.
3. `node comp/render.mjs --fps=30` renders frames into `frames/` from `comp/timeline.js`.
4. Encode (silent, 1920×1080, 30 fps):
   - MP4: `ffmpeg -framerate 30 -i frames/%05d.png -c:v libx264 -preset slow -tune animation -crf 26 -pix_fmt yuv420p -movflags +faststart -an -colorspace bt709 -color_primaries bt709 -color_trc bt709 floorlogic-demo.mp4`
   - WebM: `ffmpeg -framerate 30 -i frames/%05d.png -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -an floorlogic-demo.webm`
5. Captions: `public/video/floorlogic-demo.vtt`; chapters: `src/data/video.ts`.

The shipped 2026-10-14 MP4 used x264 `preset slow`, `tune animation`, CRF 25.6.
When the app's code changes, update the page tweaks in `harness/server.mjs` and the
shot list in `capture/run.mjs` + `comp/timeline.js`.
