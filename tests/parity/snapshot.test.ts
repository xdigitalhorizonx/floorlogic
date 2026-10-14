/**
 * The extracted app source: every manifest item extracts and compiles, and
 * the committed snapshot still matches the live exports (when they exist).
 *
 *   UPDATE_APP_SNAPSHOT=1 npx vitest run tests/parity/snapshot.test.ts
 * rewrites fixtures/app-source.json from FLOORLOGIC_APP_EXPORT_DIR.
 */
import { describe, expect, it } from 'vitest';
import { appSource, EXPORT_DIR, exportsAvailable, extractLive, itemKey, MANIFEST, readSnapshot, SNAPSHOT_PATH, writeSnapshot } from './app-source';

describe('app source', () => {
  it.runIf(process.env.UPDATE_APP_SNAPSHOT === '1' && exportsAvailable())('writes the snapshot from the live exports', () => {
    writeSnapshot(extractLive());
    expect(readSnapshot()).not.toBeNull();
  });

  it('has every manifest item, and functions/consts compile', () => {
    const { snapshot } = appSource();
    for (const item of MANIFEST) {
      const key = itemKey(item);
      const it = snapshot.items[key];
      expect(it, key).toBeDefined();
      expect(it!.line, key).toBeGreaterThan(0);
      if ('fn' in item) {
        expect(it!.code.startsWith(`function ${item.fn}(`), key).toBe(true);
        expect(() => new Function(it!.code), key).not.toThrow();
      }
      if ('constName' in item) expect(() => new Function(it!.code), key).not.toThrow();
    }
  });

  it('exports are the expected size (28,047-line index, q.html)', () => {
    const { snapshot } = appSource();
    expect(snapshot.sources.index.lines).toBe(28048); // 28,047 lines + the final newline
    expect(snapshot.sources.q.lines).toBe(1939);
  });

  it.runIf(exportsAvailable())(`committed snapshot matches the exports in ${EXPORT_DIR}`, () => {
    const snap = readSnapshot();
    expect(snap, `missing ${SNAPSHOT_PATH} — run with UPDATE_APP_SNAPSHOT=1`).not.toBeNull();
    const live = extractLive();
    expect(snap!.sources).toEqual(live.sources);
    expect(snap!.items).toEqual(live.items);
  });
});
