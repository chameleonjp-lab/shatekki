/**
 * Set completion (Task 09; decisions 11-14). Pure and order-free: a set is
 * complete when its three distinct required kinds are all among the kinds
 * collected so far in this run. Collected kinds are never consumed, so one
 * kind may complete several sets; a set that is already completed in this run
 * is not returned again (it scores once per run).
 */
import type { PrizeTypeId, RuntimeCatalog, SetId } from '../contracts';

export function completedSetsFor(
  catalog: RuntimeCatalog,
  collectedTypeIds: ReadonlySet<PrizeTypeId>,
  alreadyCompleted: readonly SetId[],
): SetId[] {
  const done = new Set<SetId>(alreadyCompleted);
  const out: SetId[] = [];
  for (const set of catalog.sets.values()) {
    if (done.has(set.setId)) continue;
    if (set.requiredTypeIds.every((t) => collectedTypeIds.has(t))) out.push(set.setId);
  }
  return out.sort();
}
