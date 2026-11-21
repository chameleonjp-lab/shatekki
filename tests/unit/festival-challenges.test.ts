import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { asPrizeTypeId, mintId, type PrizeOutcome, type ShelfState } from '../../src/contracts';
import { festivalChallengesOf } from '../../src/core/festival-challenges';
import { spawnPrize } from '../../src/core/replenish';

const { catalog, layout } = getGameplayBundle('expanded-festival');
const typeId = asPrizeTypeId('P009');
const shotId = mintId.shot(1);
const cork = mintId.projectile(shotId, 0);

it('combines direct hits and actual falls across all three tiers only in the same shot', () => {
  const slots = [0, 1, 2].map(tier => layout.slots.find(candidate => candidate.tier === tier)!);
  const shelf: ShelfState = {
    prizes: slots.map((slot, index) => spawnPrize(catalog, typeId, slot, index + 1, 0)),
    deferredSlots: [], nextInstanceNumber: 4,
  };
  const outcomes: PrizeOutcome[] = shelf.prizes.map(({ instanceId }, index) => ({
    instanceId, typeId, hits: index === 2 ? [] : [{ projectileId: cork, damage: 1, generation: 0, reflectionIndex: 0 }],
    collected: index === 2, displacement: 0, endedNearEdge: false,
  }));
  const shot = { prizeOutcomes: outcomes, collected: [{ instanceId: shelf.prizes[2]!.instanceId, typeId }] };

  expect(festivalChallengesOf(shot, shelf, layout)).toEqual(['three-shelves']);
  expect(festivalChallengesOf({ ...shot, prizeOutcomes: outcomes.slice(0, 2) }, shelf, layout)).toEqual([]);
  expect(festivalChallengesOf({ ...shot, fanTrayProjectiles: [cork] }, shelf, layout)).toEqual(['three-shelves', 'fan-tray']);
  expect(festivalChallengesOf({ ...shot, fanTrayProjectiles: [cork], collected: [] }, shelf, layout)).toEqual(['three-shelves']);
});
