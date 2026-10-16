// Writes the site's caption track and chapter list straight from the compositor timeline, so
// they always match the burned-in captions and the cut:
//   public/video/floorlogic-demo.vtt   one cue per burned-in caption (its on-screen time), the
//                                      caption's words first, then what happens on screen
//   src/data/video.ts                  chapters (whole seconds the site's player seeks to)
// Reads out/film-meta.json, which comp/render.mjs writes on every run.
//   node comp/publish-meta.mjs [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BANNED_IN_FILM } from '../capture/lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, '..', '..', '..');
const META = path.join(HERE, '..', 'out', 'film-meta.json');
const dry = process.argv.includes('--dry');
const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
const ts = (s) => { const ms = Math.round(s * 1000); const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60, r = ms % 1000; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(r).padStart(3, '0')}`; };
const sentence = (t) => (/[.!?]$|\.app$/.test(t) ? t : t + '.');      // (the URL cue keeps no full stop)

const cues = meta.cues.filter((c) => c.start != null && c.end != null).sort((a, b) => a.start - b.start);
const problems = [];
cues.forEach((c, i) => {
  if (c.end <= c.start) problems.push(`cue ${i + 1} ends before it starts`);
  if (i && c.start < cues[i - 1].end - 1e-6) problems.push(`cue ${i + 1} overlaps cue ${i}`);
  const all = [c.text, c.describe, c.count].join(' ');
  for (const re of BANNED_IN_FILM) if (re.test(all)) problems.push(`cue ${i + 1} has banned text ${re}`);
});
if (meta.duration < 30 || meta.duration > 60) problems.push(`duration ${meta.duration}s is outside 30-60 s`);
if (problems.length) { console.error('META PROBLEMS:\n  ' + problems.join('\n  ')); process.exit(1); }

const vtt = [
  'WEBVTT',
  '',
  'NOTE',
  'FloorLogic demo — descriptions. The real FloorLogic app, filmed with fictional sample data',
  '(Pinyon Flooring Co.). Each cue starts with the caption burned into the video; action counts are',
  'the real clicks, taps and dates made while filming. Written by tools/video/comp/publish-meta.mjs.',
  '',
  ...cues.flatMap((c, i) => [
    String(i + 1),
    `${ts(c.start)} --> ${ts(c.end)}`,
    [sentence(c.text), c.describe, c.count ? sentence(c.count[0].toUpperCase() + c.count.slice(1)) : ''].filter(Boolean).join(' '),
    '',
  ]),
].join('\n');

const today = new Date().toLocaleDateString('en-CA');
const secs = Math.round(meta.duration);
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const ts2 = [
  '// Demo video chapters. Times must match the rendered cut: tools/video/comp/publish-meta.mjs',
  '// writes this file from the compositor timeline (tools/video/comp/timeline.js).',
  `// Cut of ${today} (${meta.duration.toFixed(1)} s): each scene's cross-fade starts 0.38 s before its`,
  "// chapter's whole second and has settled by it.",
  'export const VIDEO = {',
  "  mp4: '/video/floorlogic-demo.mp4',",
  "  webm: '/video/floorlogic-demo.webm',",
  "  poster: '/video/floorlogic-demo-poster.jpg',",
  "  vtt: '/video/floorlogic-demo.vtt',",
  `  seconds: ${secs},`,
  '  chapters: [',
  ...meta.chapters.map((c) => `    { at: ${c.at}, label: ${q(c.label)}, detail: ${q(c.detail)} },`),
  '  ],',
  '} as const;',
  '',
].join('\n');

if (dry) { console.log(vtt); console.log(ts2); }
else {
  fs.writeFileSync(path.join(SITE, 'public', 'video', 'floorlogic-demo.vtt'), vtt);
  fs.writeFileSync(path.join(SITE, 'src', 'data', 'video.ts'), ts2);
  console.log(`wrote public/video/floorlogic-demo.vtt (${cues.length} cues) and src/data/video.ts (${meta.chapters.length} chapters, ${secs} s)`);
}
