// Rasterise SVG files with resvg (exact area-coverage anti-aliasing, transparent background).
// usage: node render.cjs jobs.json   where jobs.json = [{ "svg": "in.svg", "out": "out.png", "width": 512 } | {..., "zoom": 1} ]
// Needs @resvg/resvg-js resolvable via NODE_PATH (installed outside the site repo).
const fs = require('fs');
const { Resvg } = require('@resvg/resvg-js');

const jobs = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
for (const j of jobs) {
  const svg = j.svgText != null ? j.svgText : fs.readFileSync(j.svg, 'utf8');
  const opts = {
    background: j.background || 'rgba(0,0,0,0)',
    font: { loadSystemFonts: false },
    shapeRendering: 2, // geometricPrecision (anti-aliased)
  };
  if (j.width) opts.fitTo = { mode: 'width', value: j.width };
  else if (j.height) opts.fitTo = { mode: 'height', value: j.height };
  else if (j.zoom) opts.fitTo = { mode: 'zoom', value: j.zoom };
  const r = new Resvg(svg, opts);
  const img = r.render();
  fs.writeFileSync(j.out, img.asPng());
  process.stdout.write(`${j.out} ${img.width}x${img.height}\n`);
}
