/**
 * Loading (装填) calculation (Task 07, calculation part). The bar value is
 * computed from the core's own loading clock, never supplied by the UI.
 */
import type { LoadResult, RunState, TuningConfig } from '../contracts';

/** Expanded rules: loading-bar period multiplier reserved for the next shot (FX037/038). 1 for rules-v1. */
export function loadPeriodMultiplierFor(state: Partial<Pick<RunState, 'expansion'>>): number {
  const m = state.expansion?.next.modifiers.loadPeriodMult;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
}

/** Triangle wave 0 → 1 → 0 with period `barPeriodSec` × periodMult; starts at 0. The sweet spot does not move. */
export function loadingBarValue(loadingSec: number, tuning: TuningConfig, periodMult = 1): number {
  const period = periodMult === 1 ? tuning.loading.barPeriodSec : tuning.loading.barPeriodSec * periodMult;
  if (!(period > 0) || !Number.isFinite(loadingSec) || loadingSec < 0) return 0;
  const phase = (loadingSec / period) % 1;
  return phase < 0.5 ? phase * 2 : 2 - phase * 2;
}

/** Classify by distance to the sweet spot; tiers are checked in order (perfect → weak). Both multipliers change together. */
export function classifyLoad(barValue: number, tuning: TuningConfig): LoadResult {
  const bar = Math.min(1, Math.max(0, Number.isFinite(barValue) ? barValue : 0));
  const dist = Math.abs(bar - tuning.loading.sweetSpot);
  const tiers = tuning.loading.tiers;
  const hit = tiers.find((t) => dist <= t.maxDistance + 1e-9) ?? tiers[tiers.length - 1];
  if (!hit) throw new RangeError('loading.tiers is empty');
  return { barValue: bar, tier: hit.tier, damageMultiplier: hit.damageMultiplier, pushMultiplier: hit.pushMultiplier };
}
