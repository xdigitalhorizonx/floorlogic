// The few facts the film needs that the fixture's `story` does not carry yet, read straight
// from the site dataset (src/data/sample-data.ts) — never typed in by hand here:
//   installEnd   WO-330's install end date (the dataset books a two-day install)
//   poFreight    estimated freight per purchase order, by mat # (the app counts it in job cost)
//   poNumbers    the dataset's purchase-order numbers (JPO-####)
// Same TypeScript resolve hook as tools/export-fixture.mjs (Node 24 type stripping).
import { register } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const HOOK = `
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL && ctx.parentURL.endsWith('.ts') && !/\.[cm]?[jt]s$/.test(spec)) {
    for (const cand of [spec + '.ts', spec + '/index.ts']) {
      const u = new URL(cand, ctx.parentURL);
      if (fs.existsSync(fileURLToPath(u))) return next(u.href, ctx);
    }
  }
  return next(spec, ctx);
}`;

export async function loadStoryExtras() {
  const file = path.join(ROOT, 'src', 'data', 'sample-data.ts');
  if (!fs.existsSync(file)) throw new Error('dataset not found: ' + file);
  register('data:text/javascript,' + encodeURIComponent(HOOK), import.meta.url);
  const S = await import(pathToFileURL(file).href);
  const T = S.thread;
  const wo = T && T.workOrder, pos = T && T.jobCosts && T.jobCosts.pos;
  if (!wo || !wo.scheduledDate || !wo.scheduledEndDate) throw new Error('dataset: thread.workOrder has no scheduledDate / scheduledEndDate');
  if (!Array.isArray(pos) || !pos.length) throw new Error('dataset: thread.jobCosts.pos missing');
  return {
    seedId: `sample-data@${S.DEMO_TODAY}`,
    installStart: wo.scheduledDate,
    installEnd: wo.scheduledEndDate,
    poFreight: Object.fromEntries(pos.map((p) => [p.matNum, Number(p.freight) || 0])),
    poNumbers: pos.map((p) => p.number),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(await loadStoryExtras(), null, 1));
}
