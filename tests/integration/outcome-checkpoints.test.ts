import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { playRun } from '../helpers/scripted-player';
import { localizedSetShots } from '../helpers/localized-set-shots';
import { asSetId } from '../../src/contracts';

for (const [setId, expected] of Object.entries(localizedSetShots)) {
  it(`replays the preceding game and wins ${setId} on its localized layout checkpoint`, async () => {
    const bundle = getGameplayBundle('expanded-next');
    const members = bundle.catalog.sets.get(asSetId(setId))!.requiredTypeIds;
    let matched = false;
    await playRun(bundle, expected.beforeFire.seed, shot => {
      if (shot.summary.shotNumber !== expected.beforeFire.shotsFired + 1) return;
      expect({ beforeFire: shot.beforeFire, gameTick: shot.gameTick }).toEqual(expected);
      expect(shot.summary.newlyCompletedSets).toContain(setId);
      expect(shot.summary.runEnded).toBe(false);
      matched = true;
    }, members);
    expect(matched).toBe(true);
  });
}

// Repeat the complete preceding game and verify that every serialized field
// really existed before FIRE, and that the real flight has the intended outcome.
for (const [name, seed, shot, ammoBefore, ids, granted, ended] of [
  ['ended', 7919, 10, 1, [], 0, true],
  ['rescued', 403869, 17, 1, ['PAIR201', 'PAIR203', 'S061'], 2, false],
  ['capped', 593925, 20, 1, ['PAIR214', 'PAIR216', 'S065'], 0, true],
  ['deferred', 15838, 17, 4, [], 0, false],
] as const) {
  it(`${name}: reproduces shot ${shot} from seed ${seed}`, async () => {
    const stored = JSON.parse(gunzipSync(readFileSync(new URL(`../fixtures/outcomes/${name}.json.gz`, import.meta.url))).toString());
    const bundle = getGameplayBundle('expanded-next');
    let matched = false;
    await playRun(bundle, seed, ({ beforeFire, gameTick, summary }) => {
      if (summary.shotNumber !== shot) return;
      expect({ beforeFire, gameTick }).toEqual(stored);
      expect(beforeFire.ammo).toBe(ammoBefore);
      expect(beforeFire.inFlight).toBeNull();
      expect(summary.newlyCompletedSets).toEqual(ids);
      expect(summary.bonusAmmoGranted).toBe(granted);
      expect(summary.runEnded).toBe(ended);
      matched = true;
    });
    expect(matched).toBe(true);
  });
}
