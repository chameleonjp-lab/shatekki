import { describe, expect, it } from 'vitest';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../../src/catalog/release-config';
import { catalogValueStatus, mintId } from '../../src/contracts';
import { createRun } from '../../src/core/state';

describe('first official release values', () => {
  it('starts approved rules-v1 runs with all existing prize, set, and tuning values unchanged', () => {
    expect(catalogValueStatus(RELEASE_CATALOG)).toBe('approved');
    expect(RELEASE_CATALOG.prizes.size).toBe(100);
    expect(RELEASE_CATALOG.sets.size).toBe(100);
    for (const [id, prize] of PROTOTYPE_CATALOG.prizes) {
      expect(RELEASE_CATALOG.prizes.get(id), id).toEqual({ ...prize, valueStatus: 'approved' });
      expect(prize.valueStatus, 'prototype fixtures stay separate').toBe('prototype');
    }
    for (const [id, set] of PROTOTYPE_CATALOG.sets) {
      expect(RELEASE_CATALOG.sets.get(id), id).toEqual({ ...set, valueStatus: 'approved' });
      expect(set.valueStatus, 'prototype fixtures stay separate').toBe('prototype');
    }
    expect(RELEASE_TUNING).toEqual({ ...PROTOTYPE_TUNING, valueStatus: 'approved' });
    expect(PROTOTYPE_TUNING.valueStatus).toBe('prototype');
    const run = createRun({ runId: mintId.run('release-run'), seed: 17, tuning: RELEASE_TUNING, playerName: null }, RELEASE_CATALOG);
    expect(run.valueStatus).toBe('approved');
    expect(run.rulesVersion).toBe('rules-v1');
    expect(run.ammo).toBe(10);
  });
});

describe('gameplay bundles keep the release values', () => {
  it('official-v1 bundle is the release config and the expanded catalog is prototype', async () => {
    const { getGameplayBundle } = await import('../../src/catalog/gameplay-config');
    const official = getGameplayBundle('official-v1');
    expect(official.catalog).toBe(RELEASE_CATALOG);
    expect(official.tuning).toBe(RELEASE_TUNING);
    expect(catalogValueStatus(getGameplayBundle('expanded-proposed').catalog)).toBe('prototype');
    expect(catalogValueStatus(RELEASE_CATALOG)).toBe('approved');
  });
});
