import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { playRun } from '../helpers/scripted-player';

// Repeat the complete preceding game and verify that every serialized field
// really existed before FIRE, and that the real flight has the intended outcome.
for (const [name, seed, shot, ids, granted] of [
  ['ended', 7919, 10, [], 0],
  ['rescued', 403869, 17, ['PAIR201', 'PAIR203', 'S061'], 2],
  ['capped', 593925, 20, ['PAIR214', 'PAIR216', 'S065'], 0],
] as const) {
  it(`${name}: reproduces shot ${shot} from seed ${seed}`, async () => {
    const stored = JSON.parse(gunzipSync(readFileSync(new URL(`../fixtures/outcomes/${name}.json.gz`, import.meta.url))).toString());
    const bundle = getGameplayBundle('expanded-next');
    let matched = false;
    await playRun(bundle, seed, ({ beforeFire, gameTick, summary }) => {
      if (summary.shotNumber !== shot) return;
      expect({ beforeFire, gameTick }).toEqual(stored);
      expect(beforeFire.ammo).toBe(1);
      expect(beforeFire.inFlight).toBeNull();
      expect(summary.newlyCompletedSets).toEqual(ids);
      expect(summary.bonusAmmoGranted).toBe(granted);
      expect(summary.runEnded).toBe(name !== 'rescued');
      matched = true;
    });
    expect(matched).toBe(true);
  });
}
