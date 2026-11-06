/**
 * Post-settlement presentation classification (Task 12, AC27).
 *
 * Pure function of the CONFIRMED ShotSummary. It is only ever called from
 * `present()`, which runs after settlement, so a shot that succeeds late by a
 * reflection is never labelled a miss early. It affects presentation only.
 *
 * Prototype thresholds (valueStatus: prototype, to be tuned by the user):
 *   NEAR_MISS_DISPLACEMENT_M  horizontal travel of an uncollected, hit prize
 *   (or `endedNearEdge` from the sim record) that counts as "惜しい".
 */
import type { ShotSummary } from '../contracts';

export type ShotClass = 'success' | 'nearMiss' | 'miss' | 'neutral';

export const NEAR_MISS_DISPLACEMENT_M = 0.04;

export function classifyShot(s: ShotSummary): ShotClass {
  const l = s.ledger;
  const penalty = l.nominalPenalty > 0;
  const gain = l.trickPoints + l.setPoints + l.firstHitPoints;
  if (s.collected.length > 0 || gain > 0 || s.bonusAmmoGranted > 0 || s.newlyCompletedSets.length > 0) return 'success';
  if (s.devicesActivated.length > 0 && !penalty) return 'success';
  for (const o of s.prizeOutcomes) {
    if (o.collected || o.hits.length === 0) continue;
    if (o.endedNearEdge || o.displacement >= NEAR_MISS_DISPLACEMENT_M) return 'nearMiss';
  }
  if (penalty || s.touchedFirstHitTargets.length > 0 || s.devicesActivated.length > 0) return 'neutral';
  return 'miss';
}
