// Trace binary PNG masks (black shape on white) with potrace; emit raw curves as JSON.
// usage: node trace.cjs jobs.json out.json   jobs = { params: {...potrace opts}, files: ["a.png", ...] }
// Needs `potrace` (npm, 2.1.8) resolvable via NODE_PATH (installed outside the site repo).
const fs = require('fs');
const { Potrace } = require('potrace');

const job = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const params = Object.assign({ threshold: 128, blackOnWhite: true, turdSize: 2, alphaMax: 1, optCurve: true, optTolerance: 0.2 }, job.params || {});
const pt = (p) => [p.x, p.y];

(async () => {
  const out = [];
  for (const file of job.files) {
    const p = new Potrace(params);
    await new Promise((res, rej) => p.loadImage(file, (err) => (err ? rej(err) : res())));
    p.getPathTag(); // runs the trace
    const paths = p._pathlist.map((path) => {
      const c = path.curve;
      const segs = c.tag.map((tag, i) => (tag === 'CURVE'
        ? { t: 'C', p: [pt(c.c[i * 3]), pt(c.c[i * 3 + 1]), pt(c.c[i * 3 + 2])] }
        : { t: 'L', p: [pt(c.c[i * 3 + 1]), pt(c.c[i * 3 + 2])] }));
      return { sign: path.sign, area: path.area, start: pt(c.c[(c.n - 1) * 3 + 2]), segs };
    });
    out.push({ file, paths });
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out));
  process.stdout.write(`traced ${out.length} files\n`);
})().catch((e) => { console.error(e); process.exit(1); });
