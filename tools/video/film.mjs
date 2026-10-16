// The whole film, end to end (see README "Film the site video"):
//   FL_APP_DIR=C:/dev/floorlogic/tools/video/app-export node film.mjs
// 1. harness/smoke.mjs + harness/qsmoke.mjs   the offline app boots (desktop + customer page)
// 2. capture/run.mjs                          films the current app → capture/stills + manifest
// 3. comp/render.mjs                          renders frames/ with per-frame QA (out/frame-qa.json)
// 4. comp/encode.mjs                          MP4 + WebM + poster → public/video, out/contact-sheet.png
// 5. comp/publish-meta.mjs                    captions (.vtt) + chapters (src/data/video.ts)
// Stops at the first step that fails. Zero network: every step runs on 127.0.0.1 only.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const steps = [
  ['harness/smoke.mjs'], ['harness/qsmoke.mjs'],
  ['capture/run.mjs'],
  ['comp/render.mjs', '--fps=30'],
  ['comp/encode.mjs'],
  ['comp/publish-meta.mjs'],
];
for (const [script, ...args] of steps) {
  console.log(`\n=== ${script} ${args.join(' ')}`);
  const r = spawnSync(process.execPath, [path.join(HERE, script), ...args], { cwd: HERE, stdio: 'inherit', env: process.env });
  if (r.status !== 0) { console.log(`\nFILM STOPPED: ${script} exited ${r.status}`); process.exit(r.status || 1); }
}
console.log('\nFILM DONE — public/video/floorlogic-demo.{mp4,webm,-poster.jpg,vtt} + src/data/video.ts');
