/**
 * Prize draw (Task 03, decisions 03/04). Weighted random draw over ALL kinds
 * with replacement:
 *   weight = tierFactor(tier of kind) * (kind seen recently ? recentPenalty : 1)
 * - tierFactor pulls the 9 visible prizes toward `tierTargets` by deficit.
 * - recent = within the last `historyWindow` draws or currently visible.
 * - weights are always finite and > 0: the same kind may reappear (no ban),
 *   and nothing steers the draw toward completing a set (unapproved).
 */
import type { DifficultyTier, DrawState, PrizeTypeId, RuntimeCatalog, TuningConfig } from '../contracts';
import { rngNext, seedRng } from './rng';

/** Prototype: each missing prize of a tier multiplies its weight by this (and each surplus divides). */
export const TIER_BALANCE_BASE = 1.8;
const MAX_DEFICIT = 4;

export function createDrawState(seed: number): DrawState {
  return { rng: seedRng(seed), history: [], drawCount: 0 };
}

export interface WeightedKind {
  readonly typeId: PrizeTypeId;
  readonly weight: number;
}

export function computeWeights(
  catalog: RuntimeCatalog,
  draw: DrawState,
  visibleTypeIds: readonly PrizeTypeId[],
  tuning: TuningConfig,
): WeightedKind[] {
  const { historyWindow, recentPenalty, tierTargets } = tuning.draw;
  if (!(recentPenalty > 0 && recentPenalty <= 1) || !Number.isFinite(recentPenalty)) {
    throw new RangeError('recentPenalty must be in (0, 1]');
  }
  if (catalog.prizes.size === 0) throw new RangeError('catalog has no prizes');

  const counts: Record<DifficultyTier, number> = { easy: 0, normal: 0, hard: 0 };
  for (const id of visibleTypeIds) {
    const p = catalog.prizes.get(id);
    if (p) counts[p.difficulty]++;
  }
  const tierFactor = (tier: DifficultyTier): number => {
    const deficit = Math.max(-MAX_DEFICIT, Math.min(MAX_DEFICIT, tierTargets[tier] - counts[tier]));
    return Math.pow(TIER_BALANCE_BASE, deficit);
  };

  const recent = new Set<PrizeTypeId>(draw.history.slice(-historyWindow));
  for (const id of visibleTypeIds) recent.add(id);

  const out: WeightedKind[] = [];
  for (const p of catalog.prizes.values()) {
    out.push({ typeId: p.typeId, weight: tierFactor(p.difficulty) * (recent.has(p.typeId) ? recentPenalty : 1) });
  }
  return out;
}

/** Index chosen by cumulative weight for u in [0,1). Rejects invalid weights. */
export function pickWeighted(weights: readonly number[], u: number): number {
  if (weights.length === 0) throw new RangeError('no weights');
  if (!(u >= 0 && u < 1)) throw new RangeError('u must be in [0, 1)');
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || !(w > 0)) throw new RangeError(`invalid weight: ${w}`);
    total += w;
  }
  if (!Number.isFinite(total)) throw new RangeError('weight total overflow');
  const target = u * total;
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i]!;
    if (target < acc) return i;
  }
  return weights.length - 1;
}

export function drawPrize(
  catalog: RuntimeCatalog,
  draw: DrawState,
  visibleTypeIds: readonly PrizeTypeId[],
  tuning: TuningConfig,
): { readonly typeId: PrizeTypeId; readonly draw: DrawState } {
  const weighted = computeWeights(catalog, draw, visibleTypeIds, tuning);
  const r = rngNext(draw.rng);
  const idx = pickWeighted(
    weighted.map((w) => w.weight),
    r.value,
  );
  const typeId = weighted[idx]!.typeId;
  const history = [...draw.history, typeId].slice(-Math.max(1, tuning.draw.historyWindow));
  return { typeId, draw: { rng: r.state, history, drawCount: draw.drawCount + 1 } };
}
