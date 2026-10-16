// Encode the rendered frames into the site's video files, the poster and a QA contact sheet.
//   node comp/encode.mjs
// Reads frames/f#####.png (comp/render.mjs) and out/film-meta.json (fps, poster time).
// Writes public/video/floorlogic-demo.mp4 (H.264, faststart, silent), floorlogic-demo.webm
// (VP9, two-pass, silent), floorlogic-demo-poster.jpg, and out/contact-sheet.png (12 evenly
// spaced frames of the encoded MP4) + out/film-probe.txt (ffprobe of every output).
// Fails if the MP4 is over 9 MB, the poster over 160 KB, or a file is not 1920×1080 / 30 fps / silent.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(HERE, '..');
const PUB = path.resolve(VIDEO, '..', '..', 'public', 'video');
const FRAMES = path.join(VIDEO, 'frames');
const OUT = path.join(VIDEO, 'out');
const meta = JSON.parse(fs.readFileSync(path.join(OUT, 'film-meta.json'), 'utf8'));
const FPS = meta.fps || 30;
const nFrames = fs.readdirSync(FRAMES).filter((f) => /^f\d{5}\.png$/.test(f)).length;
if (nFrames !== Math.round(meta.duration * FPS)) throw new Error(`frames/ holds ${nFrames} frames; the cut needs ${Math.round(meta.duration * FPS)} (run comp/render.mjs first)`);
const ff = (args) => execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' });
const probe = (f) => execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size,bit_rate:stream=codec_type,codec_name,profile,width,height,r_frame_rate,pix_fmt', '-of', 'default=nw=1', f], { encoding: 'utf8' });
const input = ['-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.png')];
const tags = ['-pix_fmt', 'yuv420p', '-an', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
const mp4 = path.join(PUB, 'floorlogic-demo.mp4'), webm = path.join(PUB, 'floorlogic-demo.webm'), poster = path.join(PUB, 'floorlogic-demo-poster.jpg');

console.log('MP4 (x264 slow, tune animation, CRF 25.5, faststart)…');
ff([...input, '-c:v', 'libx264', '-preset', 'slow', '-tune', 'animation', '-crf', '25.5', ...tags, '-movflags', '+faststart', mp4]);
console.log('WebM (VP9 two-pass, CRF 36)…');
const vp9 = ['-c:v', 'libvpx-vp9', '-crf', '36', '-b:v', '0', '-row-mt', '1', '-tile-columns', '2', '-auto-alt-ref', '1', '-lag-in-frames', '25'];
const passlog = path.join(OUT, 'vp9log');
ff([...input, ...vp9, ...tags, '-pass', '1', '-passlogfile', passlog, '-f', 'null', '-']);
ff([...input, ...vp9, ...tags, '-pass', '2', '-passlogfile', passlog, webm]);

// Poster: the timeline's poster frame, JPEG, the best quality that fits 160 KB.
const pf = path.join(FRAMES, `f${String(Math.round(meta.poster * FPS)).padStart(5, '0')}.png`);
let q = 3;
do { ff(["-i", pf, "-q:v", String(q), poster]); } while (fs.statSync(poster).size > 160e3 && ++q <= 12);

// Contact sheet: 12 evenly spaced frames of the encoded MP4, time-stamped.
const sheetDir = path.join(OUT, 'sheet');
fs.rmSync(sheetDir, { recursive: true, force: true });
fs.mkdirSync(sheetDir, { recursive: true });
const font = 'C\\:/Windows/Fonts/segoeuib.ttf';
for (let i = 0; i < 12; i++) {
  const t = ((i + 0.5) * meta.duration / 12).toFixed(2);
  ff(['-ss', t, '-i', mp4, '-frames:v', '1', '-vf', `scale=640:360,drawtext=fontfile='${font}':text='${t}s':x=10:y=h-34:fontsize=22:fontcolor=white:box=1:boxcolor=0x02315Bcc:boxborderw=6`, path.join(sheetDir, `c_${String(i).padStart(2, '0')}.png`)]);
}
ff(['-i', path.join(sheetDir, 'c_%02d.png'), '-vf', 'tile=4x3:padding=8:margin=8:color=0xF3F8FD', '-frames:v', '1', path.join(OUT, 'contact-sheet.png')]);

// Checks + a probe report.
const report = [mp4, webm, poster].map((f) => `== ${path.basename(f)} (${fs.statSync(f).size} bytes)\n${probe(f)}`).join('\n');
fs.writeFileSync(path.join(OUT, 'film-probe.txt'), report);
const problems = [];
if (fs.statSync(mp4).size > 9e6) problems.push(`MP4 is ${fs.statSync(mp4).size} bytes (> 9 MB)`);
if (fs.statSync(poster).size > 160e3) problems.push(`poster is ${fs.statSync(poster).size} bytes (> 160 KB)`);
for (const f of [mp4, webm]) {
  const p = probe(f);
  if (/codec_type=audio/.test(p)) problems.push(`${path.basename(f)} has an audio track`);
  if (!/width=1920/.test(p) || !/height=1080/.test(p)) problems.push(`${path.basename(f)} is not 1920×1080`);
  if (!/r_frame_rate=30\/1/.test(p)) problems.push(`${path.basename(f)} is not 30 fps`);
  const d = +(p.match(/duration=([\d.]+)/) || [])[1];
  if (!(Math.abs(d - meta.duration) < 0.05)) problems.push(`${path.basename(f)} lasts ${d}s, the cut ${meta.duration}s`);
}
const head = fs.readFileSync(mp4).subarray(0, 4096);
const moov = head.indexOf('moov'), mdat = fs.readFileSync(mp4).indexOf('mdat');
if (!(moov > 0 && moov < mdat)) problems.push('MP4 is not faststart (moov must come before mdat)');
console.log(report);
if (problems.length) { console.log('ENCODE CHECKS FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`ENCODE OK — poster q${q}, contact sheet ${path.join(OUT, 'contact-sheet.png')}`);
