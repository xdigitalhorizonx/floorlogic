// Builds the JS served in place of supabase-js: fixture + session + RPCs + the stand-in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
export function stubSource() {
  const fx = JSON.parse(fs.readFileSync(process.env.FL_FIXTURE || path.join(HERE, 'fixture.json'), 'utf8'));
  const session = fx.session || { id: 'u-film', email: 'film@pinyon.test', name: 'Film' };
  return [
    '/* offline film harness: supabase-js stand-in (no network) */',
    'window.__FL_FIXTURE = ' + JSON.stringify({ seedId: fx.seedId, tables: fx.tables }) + ';',
    'window.__FL_SESSION = ' + JSON.stringify(session) + ';',
    fs.readFileSync(path.join(HERE, 'sb-rpc.js'), 'utf8'),
    fs.readFileSync(path.join(HERE, 'sb-stub.js'), 'utf8'),
  ].join('\n');
}
