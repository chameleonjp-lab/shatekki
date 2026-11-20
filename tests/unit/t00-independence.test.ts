import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { DEFAULT_GAMEPLAY_BUNDLE_KEY } from '../../src/contracts';
import { STORAGE_KEYS, expandedRunKey } from '../../src/persistence/keys';

// T00: the public 9-slot game, r006 and r007 stay separate: their own rules version, their own
// saved run and set book (keys and IndexedDB scopes are by rules version), and only the public
// version can be ranked. Nothing here switches the public build or reads old data.
describe('T00 9-slot / r006 / r007 are independent', () => {
  const v1 = getGameplayBundle('official-v1');
  const r006 = getGameplayBundle('expanded-next');
  const r007 = getGameplayBundle('expanded-aim-first');

  it('the public entry stays the 9-slot rules-v1 game', () => {
    expect(DEFAULT_GAMEPLAY_BUNDLE_KEY).toBe('official-v1');
    expect(v1.catalog.rulesVersion).toBe('rules-v1');
    expect(v1.expansion).toBeNull();
  });

  it('three different rules versions, so three different saved runs, bests and set books', () => {
    const versions = [v1, r006, r007].map((b) => b.catalog.rulesVersion);
    expect(new Set(versions).size).toBe(3);
    expect(r007.catalog.rulesVersion).toBe('rules-v2-proposed-r007');
    expect(expandedRunKey(r006.catalog.rulesVersion)).not.toBe(expandedRunKey(r007.catalog.rulesVersion));
    for (const b of [r006, r007]) expect(expandedRunKey(b.catalog.rulesVersion)).not.toBe(STORAGE_KEYS.run);
  });

  it('r006 and r007 are prototypes: an expansion is present, which turns the ranking off (src/app.ts rankingAvailable)', () => {
    expect(r006.expansion).not.toBeNull();
    expect(r007.expansion).not.toBeNull();
    // r007 changes only its own bundle: r006 keeps its own layout and controls
    expect(r006.layout).not.toBe(r007.layout);
    expect(r006.behavior?.controls).not.toBe('aim-first');
    expect(r007.behavior?.controls).toBe('aim-first');
  });
});
