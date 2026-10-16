# Demo video tools

Films the FloorLogic app fully offline and renders the 45-second site video
(`public/video/floorlogic-demo.*`). Nothing here touches a database or the internet.

## Hard rules
- Never point this at landmarkflooring.app, floorlogicdemo.vercel.app or any Supabase project.
- The app runs on 127.0.0.1 against an in-memory Supabase stand-in (`harness/sb-stub.js`).
- Three network locks (DNS, request interception, block list). A run fails on any request to a
  forbidden host AND on any outside request that no local answer covers (see Isolation).
- Headless Chrome only, `--mute-audio`. The video has no audio track.
- Fictional data only; the "never on camera" list below stays hidden; every still is checked.
- Nothing tilted (owner, 2026-10-14): no drag ghost, the APPROVED stamp is levelled (see harness).
- Never on camera in the film: the word "AI" (Caspar is "Caspar"), "Landmark", "Erick", the 855
  number, the real license number, "Casper" — plus everything in the list below.
- Nothing soft: no camera zoom may draw a still larger than its captured pixels (checked per frame).

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

## Film the site video (end to end)
Set `FL_APP_DIR=C:/dev/floorlogic/tools/video/app-export` (Git Bash: also `MSYS_NO_PATHCONV=1`,
or a `/mobile` argument gets rewritten to a Windows path), then from this folder:

    node film.mjs

It runs, and stops at the first failure (about 7 minutes in all):
1. `harness/smoke.mjs` + `harness/qsmoke.mjs` — the offline app boots (`SMOKE OK`, `QSMOKE OK`, `ISOLATION OK`).
2. `capture/run.mjs` — films the current app with real clicks/taps/keys into `capture/stills/` +
   `capture/manifest.json`; every still passes the camera checks; ends `ALL CHECKS PASSED — 82 stills`
   and `ISOLATION OK`. `--dpr=1` makes a quick low-res run for framing work (the frame QA will then
   flag upscaling — expected).
3. `comp/render.mjs --fps=30` — renders `frames/f#####.png` from `comp/timeline.js` and runs the
   frame QA on every frame (`FRAME QA OK — 1362 frames …`; details in `out/frame-qa.json`). Also
   writes `out/film-meta.json` (duration, chapters, captions, poster time). Dev aids:
   `--check-only` (QA every frame, no screenshots, ~5 s), `--only=12.5,20 --out=out/probe` (stills).
4. `comp/encode.mjs` — `public/video/floorlogic-demo.mp4` (x264 slow, tune animation, CRF 25.5,
   yuv420p, faststart, silent), `.webm` (VP9 two-pass CRF 36, silent), `-poster.jpg` (the
   timeline's poster frame, best JPEG quality under 160 KB), `out/contact-sheet.png` (12 evenly
   spaced frames of the encoded MP4), `out/film-probe.txt` (ffprobe). Fails over 9 MB / 160 KB.
5. `comp/publish-meta.mjs` — `public/video/floorlogic-demo.vtt` (one cue per burned-in caption, at
   its on-screen time: the caption's words, then what happens, then the action count) and
   `src/data/video.ts` (chapters). `--dry` prints both instead.

Other tools: `node capture/screens.mjs` (reference screenshots of every key screen into
`out/screens/` + `INDEX.md`), `node harness/devshot.mjs leads lead-detail/ld-16 /mobile --phone`
(quick screenshots of any route into `out/dev/`).

## The film (cut of 2026-10-16, 45.4 s, 6 chapters)
| Time | Chapter (site chip) | What is filmed (all real input in the current app) | Caption |
|---|---|---|---|
| 0.0–3.0 | 0:00 Leads move themselves | Pipeline tab: a survey date typed on Hannah Brooks's New card → the app moves her to Site Survey Scheduled (+ survey task) | 01 Pick a survey date — the lead moves itself · 1 click · 1 date |
| 3.0–5.6 | (same) | the /mobile phone app's Today screen: Surveys coming up lists her | 01 And it's on your phone |
| 5.6–15.6 | 0:06 Quote the job | QT-330 draft: Mark as Pick One, Show Job Area, 912, Apply → "39 Cartons = 927.03 SqFt"; scroll to the optional carpet stairs (19.33 SqYd → 14' 6" × 12' roll); QUOTE TOTAL card (Tax 8.265%, $7,571.93); Privacy Mode | 02 Type the area — whole cartons, carpet cuts and tax figured for you · 7 clicks · typed 912 |
| 15.6–23.6 | 0:16 Customer approves | q.html on a phone: tap Better, "Add to my quote" (stairs), total $8,624.70, ✓ Approve Quote → toast → APPROVED (level) | 03 They pick Better, add the stairs and approve — from their phone · 3 taps |
| 23.6–26.1 | 0:24 Work order & invoice | the office: 🔨 Create WO & Invoice → the app's confirm → Create Work Order & Invoice | 04 One click makes the work order and invoice · 2 clicks |
| 26.1–33.6 | (same) | WO-330: 📦 Order Materials → Select all → Finish (toast: 4 POs ordered → Ready to Schedule) → 📅 Schedule Install: start 10/21, end 10/22, Ruben Ortiz → Scheduled (toast) | 04 Order the materials, book the install · 9 clicks · 2 dates |
| 33.6–38.6 | 0:34 Get paid | IN-330: 💰 Take Payment (balance pre-filled $4,312.35) → Check, #2318 → Record Payment → ✓ Paid in Full → the paper's BALANCE DUE $0.00 | 05 Balance paid by check — recorded in a few clicks · 5 clicks · typed 2318 |
| 38.6–42.55 | 0:39 Know the profit | Job Costing → WO-330: metric strip (margin 38.0% before commission, profit $2,862.25 after) | 06 Estimate vs actual, margin and profit — ready when the job is · 1 click |
| 42.55–45.4 | — | end card: logo, "Start your free 14-day trial", "No credit card · No setup fee", floorlogic.vercel.app | — |

Story clock (harness time, America/Los_Angeles): Wed Oct 14 (board, phone app, quote) → Thu Oct 15
(customer approves 12:20, office converts 13:05) → Fri Oct 16 (order + schedule) → Fri Oct 23
(balance by check) → Mon Oct 26 (job costing). Off camera, between scenes, rows are written from
the dataset into the offline store while no app tab is open: the quote's Save / Mark Sent / customer
link (the app's own Share menu, off camera), the deposit paid online, deliveries (PO qty + the base
PO's $45 freight, `capture/dataset.mjs`), install supplies, the installer's bill. The app itself
moves WO-330 to Final Invoice the day after the install ends; Final Invoice is ticked off camera.

How it is built:
- **Stills**: desktop 1920×1080 CSS @2× (the closing BALANCE DUE still @3×), phones 390×797 @3× under
  a drawn status bar. Typing is a still per key. Scrolls are captured frame by frame.
- **Camera** (`comp/engine.js`): zoom ≤ each still's pixel density (2.0 desktop), shots framed from
  the measured boxes in the manifest; left edges sit on the content (not the sidebar), right edges in
  gaps between buttons; document screens share one framing so their cross-fades line up.
- **Counts** in the caption chips come only from the actions the capture recorded.
- **Captions / chapters**: written in `comp/timeline.js` (texts) and exported to the `.vtt` and
  `src/data/video.ts` by `publish-meta.mjs`, so they always match the burned-in captions.
- **Frame QA** (every rendered frame): no image drawn above its captured pixels, nothing on the stage
  turned off 0/90/180°, no keep-out box in frame (margin 6 css px).
- **Keep-out boxes** (recorded with each still by `capture/lib.mjs`): any `$-0.00` text (automatic);
  the board's stats line (0 won · Win Rate 0%); the quote's totals card in the convert scene.

Harness-side measures the film relies on (all documented in code, none changes app logic):
- `transformQ` levels q.html's APPROVED stamp (the app turns it −8°, −4° under 760 px).
- `/__harness/delay-next?path=/q.html&ms=1600`: q.html reloads 600 ms after Approve; the harness
  answers that one reload after 1.6 s (a real network takes a moment too) so the app's own
  "Quote approved!" toast can be photographed.
- The quote builder loses 16 px of scroll on each re-render (Pick One, Job Area, Apply); the capture
  scrolls it back before the next still so the stills line up (noted in the manifest).
- Chrome's date picker is never drawn headless: dates are typed as month, day, then ArrowUp on the
  year (one keystroke fills the computer's current year, so the app's onchange fires once). The run
  asserts the result; re-filming in another calendar year means changing those keys.

Found in the app while filming (reported, worked around by framing only):
- After the full payment the invoice's totals card reads **Balance Due $-0.00**: it adds tax unrounded
  (8,624.696) while payments are cents (8,624.70). The paper's own BALANCE DUE row rounds and reads
  $0.00 — the film frames that and keeps the card's value out of every frame.
- After the customer's approval the builder's QUOTE TOTAL card reads $7,860.02: it leaves out the
  optional stairs the customer added (IN-330 is $8,624.70). Kept out of frame in the convert scene,
  so the conversion's toast (which sits on that card) is not filmed; the confirm dialog names WO-330
  and IN-330 instead.
- The Order Materials window prefills PO numbers WO-330-1…4; the POs it writes are JPO-1193…1196.

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
  URL → `/logo.png`; the "never on camera" style; q.html's APPROVED stamp levelled.
- `/__harness/db.html` (the bare store page for off-camera writes) and `/__harness/delay-next`.

## Never on camera (`NEVER_ON_CAMERA_INDEX` / `_Q` in server.mjs)
Hidden: the old "Casper" assistant bubble, bug button, reminder pop-ups, Take Payment's Charge
Card tab, every Share menu (quote / WO / invoice / lead — "Erick button", e-mail, SMS, links),
quote Email/SMS buttons, Settings → Users e-mail button, the Dialpad Call Log card + its nav badge,
the phone app's Text button (texts go out over Dialpad), the "open the phone app" banner, the
sync-trouble banner, q.html's chat bubble. `tel:` / `mailto:` / maps links stay (fictional data).
Every still is checked: no banned words (Landmark, Erick, Foundation, the 855 number, the real
license number, Casper, "Charge Card", Dialpad — and for the film also "AI"), none of the hidden
controls visible, every phone number on screen a fictional 555-01xx / 555-05xx, every e-mail
`.test`, no old logo image, nothing tilted. The captions and the `.vtt` are checked for the same words.

## Isolation (`harness/browser.mjs`)
- Answered locally (never forwarded): supabase-js → the stand-in; Google Fonts → local Inter;
  `js.stripe.com/v3` → an inert script (card payments are off camera); the Open-Meteo weather
  fetch → 503 (the app shows no weather; no invented forecast).
- Anything else from outside is refused AND fails `assertClean()`; supabase / landmark /
  floorlogicdemo / vercel.app / openai / dialpad hosts fail even if only attempted.
- The stand-in answers new tables with empty results; anything it cannot do lands in
  `__flStub.unknown`, which must stay `[]` (the film run checks it at the end).

## Fixture (`tools/export-fixture.mjs` → `harness/fixture.json`)
- `tables`: the dataset's leads + QT-330 (draft) + the shop's supporting cast: LD-047…049 (so
  every board column holds three), 9 customers, QT-318…329, WO-318…327, IN-318…324,
  JPO-1185…1192 (with the order/receive marks on the WO lines), payments, JC-001…014, tasks,
  calendar, sticky notes, activity, stock, a starter "Main" dashboard, Marisol's sign-in. Money is
  figured with `src/lib/logic`; numbering stops at the dataset's counters (WO-327 / IN-324), so
  approvals still make WO-328 / IN-325 and WO-330 / IN-330. No real brands, no street addresses,
  555-01xx phones, `.test` e-mail.
- `story.quoteSent`: QT-330 measured and sent (Pick One floor, stairs optional, customer link);
  other `story` rows: deposit, PO quantities, job costs, the day clock. The film films the measuring
  itself and reads two facts the story does not carry from the dataset (`capture/dataset.mjs`):
  the install end date and the PO freight.
- `expected`: the values the app must show on camera; the capture asserts every one, and the
  captions' descriptions quote them from the manifest.
- If `src/` is mid-edit, the export (and `capture/dataset.mjs`) can fail to import; re-run once it builds.

## Notes on the current app (vs the August film)
- `#leads` opens the List View; the kanban is `#leads?leadView=pipeline`. A lead can't be dragged to
  Approved any more ("Approve the lead's quote…"); picking a survey date is what moves a New lead.
- Approved quotes are NOT converted on load: press `#convert-approved-quote` ("Create WO &
  Invoice") then `#confirm-convert-quote` on the quote.
- Order Materials for every line moves the WO straight to Ready to Schedule (not Materials
  Ordered); PO numbers are `JPO-####` (the app's) — JPO-1193…1196 for WO-330.
- Schedule Install is one window (start + end date + installer); saving just the installer keeps
  the WO in Ready to Schedule. The end date follows the start (one-day) until changed.
- The day after the install ends the app moves the WO to Final Invoice by itself (no "Mark Job
  Complete" click); a paid-in-full invoice moves it to Ready to be Paid.
