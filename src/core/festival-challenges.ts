import type { BoothLayout, FestivalChallenge, ShelfState, ShotRecord } from '../contracts';

export function festivalChallengesOf(
  shot: Pick<ShotRecord, 'prizeOutcomes' | 'collected' | 'fanTrayProjectiles'>,
  shelf: ShelfState,
  layout: BoothLayout,
): FestivalChallenge[] {
  const touched = new Set(shot.prizeOutcomes.filter(outcome => outcome.hits.length > 0 || outcome.collected).map(outcome => outcome.instanceId));
  const slotTiers = new Map(layout.slots.map(slot => [slot.slotId, slot.tier]));
  const tiers = new Set(shelf.prizes.flatMap(prize => {
    const tier = slotTiers.get(prize.homeSlot);
    return tier !== undefined && touched.has(prize.instanceId) ? [tier] : [];
  }));
  const challenges: FestivalChallenge[] = [];
  if (tiers.size === 3) challenges.push('three-shelves');
  if (shot.fanTrayProjectiles?.length && shot.collected.length) challenges.push('fan-tray');
  return challenges;
}
