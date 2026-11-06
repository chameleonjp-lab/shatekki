/**
 * Scoring of one settled shot (Task 09). Pure: turns what the sim recorded
 * into ledger items and a ScoreLedgerEntry. Nothing here looks at the screen.
 *
 * Trick values are PROTOTYPE (O03), in TuningConfig.scoring.
 */
import type {
  CollectedPrize,
  FirstHitKey,
  LedgerItem,
  PrizeOutcome,
  RuntimeCatalog,
  ScoreLedgerEntry,
  ShotId,
  TuningConfig,
} from '../contracts';

export function prizeItems(collectedNow: readonly CollectedPrize[], catalog: RuntimeCatalog): LedgerItem[] {
  return collectedNow.map((c) => {
    const cfg = catalog.prizes.get(c.typeId);
    if (!cfg) throw new RangeError(`unknown prize type ${c.typeId}`);
    return { kind: 'prize', refId: c.instanceId, points: cfg.baseScore };
  });
}

/**
 * Chain: per extra prize collected in the same shot (decision 29 counts instances).
 * Reflection / split: a collected prize that was touched by a cork that had
 * reflected before touching it (reflectionIndex > 0) or by a split cork
 * (generation >= 1). Only prizes collected in this shot are paid.
 */
export function trickItems(
  collectedNow: readonly CollectedPrize[],
  outcomes: readonly PrizeOutcome[],
  shotId: ShotId,
  tuning: TuningConfig,
): LedgerItem[] {
  const items: LedgerItem[] = [];
  const s = tuning.scoring;
  if (collectedNow.length > 1 && s.chainBonusPerExtraPrize > 0) {
    items.push({ kind: 'trick', refId: `chain:${shotId}`, points: (collectedNow.length - 1) * s.chainBonusPerExtraPrize });
  }
  for (const c of collectedNow) {
    const o = outcomes.find((x) => x.instanceId === c.instanceId);
    if (!o) continue;
    if (s.reflectionCollectBonus > 0 && o.hits.some((h) => h.reflectionIndex > 0)) {
      items.push({ kind: 'trick', refId: `reflection:${c.instanceId}`, points: s.reflectionCollectBonus });
    }
    if (s.splitCollectBonus > 0 && o.hits.some((h) => h.generation >= 1)) {
      items.push({ kind: 'trick', refId: `split:${c.instanceId}`, points: s.splitCollectBonus });
    }
  }
  return items;
}

/** Decision 18: only the first hit per part / target per run scores; repeats inside the shot count once. */
export function firstHitItems(
  candidates: readonly FirstHitKey[],
  alreadyScored: readonly string[],
  tuning: TuningConfig,
): { readonly items: LedgerItem[]; readonly keys: string[] } {
  const seen = new Set<string>(alreadyScored);
  const items: LedgerItem[] = [];
  const keys: string[] = [];
  for (const key of candidates) {
    if (seen.has(key)) continue;
    seen.add(key);
    if (key.startsWith('shopkeeper:')) {
      const part = key.slice('shopkeeper:'.length) as keyof TuningConfig['scoring']['shopkeeperPoints'];
      const points = tuning.scoring.shopkeeperPoints[part];
      if (points === undefined) continue;
      keys.push(key);
      items.push({ kind: 'shopkeeper', refId: part, points });
    } else if (key.startsWith('hidden:')) {
      keys.push(key);
      items.push({ kind: 'hidden', refId: key.slice('hidden:'.length), points: tuning.scoring.hiddenTargetPoints });
    }
  }
  return { items, keys };
}

/**
 * Decision 28: gains and the nominal penalty of the shot are combined first,
 * then the floor of 0 is applied. appliedPenalty is what actually reduced the
 * score; the rest of the nominal penalty is dropped, never carried over.
 */
export function buildLedgerEntry(shotId: ShotId, scoreBefore: number, items: readonly LedgerItem[]): ScoreLedgerEntry {
  const sum = (kinds: readonly LedgerItem['kind'][]): number => items.filter((i) => kinds.includes(i.kind)).reduce((a, i) => a + i.points, 0);
  const prizePoints = sum(['prize']);
  const trickPoints = sum(['trick']);
  const setPoints = sum(['set']);
  const firstHitPoints = sum(['shopkeeper', 'hidden']);
  const nominalPenalty = sum(['penalty']);
  const gains = prizePoints + trickPoints + setPoints + firstHitPoints;
  const scoreAfter = Math.max(0, scoreBefore + gains - nominalPenalty);
  return {
    shotId,
    scoreBefore,
    prizePoints,
    trickPoints,
    setPoints,
    firstHitPoints,
    nominalPenalty,
    appliedPenalty: scoreBefore + gains - scoreAfter,
    scoreAfter,
    items: [...items],
  };
}
