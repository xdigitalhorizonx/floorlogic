# Demo video tools

Films the FloorLogic app fully offline and renders the 45-second site video
(`public/video/floorlogic-demo.*`). Nothing here touches a database or the internet.

## Hard rules
- Never point this at landmarkflooring.app, floorlogicdemo.vercel.app or any Supabase project.
- The app runs on 127.0.0.1 against an in-memory Supabase stand-in (`harness/sb-stub.js`).
- Three network locks (DNS, request interception, block list). A run fails on any request to a
  forbidden host AND on any outside request that no local answer covers (see Isolation).
- Headless Chrome only, `--mute-audio`.
- Fictional data only; the "never on camera" list below stays hidden; every screenshot is checked.
- Nothing tilted (owner, 2026-10-14): drags and stamps stay level.

## Setup
1. `npm install` in this folder (puppeteer-core only; uses your installed Chrome).
2. Export the CURRENT app from the demo repo with `git show origin/main:<file>` (never check out a
   branch there) into `app-export/`: `index.html` → `demo-main-index.html`, `q.html` →
   `demo-main-q.html`, plus `l.html`, `icons.js`, `mobile.js`, `mobile.css`, `caspar.js`,
   `caspar.css`, `document-dates.js` under their own names. Or set `FL_APP_DIR` to a folder
   holding them. The current export = floorlogicdemo origin/main 80be9ee (sync of
   landmark-flooring-app dd609d2, 2026-10-14).
3. Sample data: `harness/fixture.json`, built with `node ../export-fixture.mjs --out=harness/fixture.json`
   (from the site dataset `src/data/sample-data.ts` + a film-only supporting cast; see Fixture).

## Run
Set `FL_APP_DIR=C:/dev/floorlogic/tools/video/app-export` (Git Bash: also `MSYS_NO_PATHCONV=1`,
or a `/mobile` argument gets rewritten to a Windows path).
1. `node harness/smoke.mjs` boots the app offline: must print `SMOKE OK … unknown: [], 0 page errors`
   and `ISOLATION OK` (exit 0). `node harness/qsmoke.mjs` does the same for the customer quote page
   (QT-330 on a phone, with its Approve button).
2. `node capture/screens.mjs` films reference screenshots of every key screen into `out/screens/`
   (+ `INDEX.md`): desktop 1920×1080 @1.5x, phone 390×844 @3x. It drives the story with real
   clicks/taps (customer approves on the phone → "Create WO & Invoice" → Order Materials →
   Schedule Install → Take Payment) and checks every frame. `--only=05,06b` re-shoots a few.
3. `node harness/devshot.mjs leads lead-detail/ld-16 /mobile --phone` — quick screenshots of any
   route into `out/dev/` (dev aid).
4. `node capture/run.mjs` films the stills into `capture/stills/` + `capture/manifest.json`.
   NOTE: this is the AUGUST film script; see "Remake notes" before using it on the current app.
5. `node comp/render.mjs --fps=30` renders frames into `frames/` from `comp/timeline.js`.
6. Encode (silent, 1920×1080, 30 fps):
   - MP4: `ffmpeg -framerate 30 -i frames/%05d.png -c:v libx264 -preset slow -tune animation -crf 26 -pix_fmt yuv420p -movflags +faststart -an -colorspace bt709 -color_primaries bt709 -color_trc bt709 floorlogic-demo.mp4`
   - WebM: `ffmpeg -framerate 30 -i frames/%05d.png -c:v libvpx-vp9 -crf 32 -b:v 0 -row-mt 1 -an floorlogic-demo.webm`
7. Captions: `public/video/floorlogic-demo.vtt`; chapters: `src/data/video.ts`.

The shipped 2026-10-14 MP4 used x264 `preset slow`, `tune animation`, CRF 25.6.

## What the harness serves (`harness/server.mjs`)
- `/`, `/index.html` and `/mobile` → the exported index.html (the app switches to the phone app on
  `location.pathname`, like the demo's `/mobile` rewrite); `/q.html`, `/l.html`; the app's own
  `icons.js`, `mobile.js/.css`, `caspar.js/.css`, `document-dates.js`.
- Our own `config.js`: dummy anon key; `SUPABASE_URL` = `<origin>/__supabase-offline`, so the app's
  direct edge-function calls (quote e-mail/SMS, "quote approved" notice) hit this server → 503.
- `/api/*` → 503. Logo/favicons → the new FloorLogic brand files in `public/`.
- Page tweaks in `transformIndex` / `transformQ`, each count-asserted (a run fails if the app no
  longer matches): CRLF → LF; the documents' logo (`LOGO_DATA_URI`) → the on-white lockup; the
  sidebar's old mark + wordmark → one reversed lockup image; the e-mail composer's live-demo logo
  URL → `/logo.png`; the "never on camera" style.

## Never on camera (`NEVER_ON_CAMERA_INDEX` / `_Q` in server.mjs)
Hidden: the old "Casper" assistant bubble, bug button, reminder pop-ups, Take Payment's Charge
Card tab, every Share menu (quote / WO / invoice / lead — "Erick button", e-mail, SMS, links),
quote Email/SMS buttons, Settings → Users e-mail button, the Dialpad Call Log card + its nav badge,
the phone app's Text button (texts go out over Dialpad), the "open the phone app" banner, the
sync-trouble banner, q.html's chat bubble. `tel:` / `mailto:` / maps links stay (fictional data).
Every `screens.mjs` frame is checked: no banned words (Landmark, Erick, Foundation, the 855
number, the real license number, Casper, "Charge Card", Dialpad), none of the hidden controls
visible, every phone number on screen a fictional 555-01xx / 555-05xx, every e-mail `.test`,
no old logo image.

## Isolation (`harness/browser.mjs`)
- Answered locally (never forwarded): supabase-js → the stand-in; Google Fonts → local Inter;
  `js.stripe.com/v3` → an inert script (card payments are off camera); the Open-Meteo weather
  fetch → 503 (the app shows no weather; no invented forecast).
- Anything else from outside is refused AND fails `assertClean()`; supabase / landmark /
  floorlogicdemo / vercel.app / openai / dialpad hosts fail even if only attempted.
- The stand-in answers new tables with empty results; anything it cannot do lands in
  `__flStub.unknown`, which must stay `[]`.

## Fixture (`tools/export-fixture.mjs` → `harness/fixture.json`)
- `tables`: the dataset's leads + QT-330 (draft) + the shop's supporting cast: LD-047…049 (so
  every board column holds three), 9 customers, QT-318…329, WO-318…327, IN-318…324,
  JPO-1185…1192 (with the order/receive marks on the WO lines), payments, JC-001…014, tasks,
  calendar, sticky notes, activity, stock, a starter "Main" dashboard, Marisol's sign-in. Money is
  figured with `src/lib/logic`; numbering stops at the dataset's counters (WO-327 / IN-324), so
  approvals still make WO-328 / IN-325 and WO-330 / IN-330. No real brands, no street addresses,
  555-01xx phones, `.test` e-mail.
- `story.quoteSent`: QT-330 measured and sent (Pick One floor, stairs optional, customer link);
  other `story` rows: deposit, PO quantities, job costs, the day clock.
- If `src/` is mid-edit, the export can fail to import; re-run once it builds.

## Remake notes (the current app vs the August film)
`capture/run.mjs` + `comp/timeline.js` were written for the August app. Known breaks:
- `#leads` opens the List View now; the kanban is `#leads?leadView=pipeline`.
- Approved quotes are NOT converted on load: press `#convert-approved-quote` ("Create WO &
  Invoice") then `#confirm-convert-quote` on the quote.
- Order Materials for every line moves the WO straight to Ready to Schedule (not Materials
  Ordered); PO numbers are `JPO-####` (the app's) — JPO-1193…1196 for WO-330.
- Schedule Install is one window (start + end date + installer); saving just the installer keeps
  the WO in Ready to Schedule.
- The day after the install ends the app moves the WO to Final Invoice by itself (no "Mark Job
  Complete" click); a paid-in-full invoice moves it to Ready to be Paid.
- `capture/screens.mjs` already does all of this and is the reference for the new shot list.
