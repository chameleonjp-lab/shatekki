/**
 * Expanded run creation (D34-D37, plan EG03). Builds on createRun (rules-v1
 * shelf draw with the bundle's layout and 36 slots) and adds the expansion
 * state: 36 cells, the 200 questions shuffled once, empty reservations.
 * The cell, question and effect streams are independent of the prize draw
 * (`state.draw`) so later redraw/recheck code never shifts another stream.
 */
import type { BoothLayout, ExpandedRunState, ExpansionCatalog, ExpansionRunState, RunConfig, RuntimeCatalog, TuningConfig } from '../contracts';
import { BASE_SHOT_MODIFIERS, EXPANDED_RUN_STATE_SCHEMA_VERSION } from '../contracts';
import { rngNext, seedRng, type RngState } from '../catalog/rng';
import { assignCells } from './background-cells';
import { createRun, lowestStatus } from './state';
import { initialRewards } from './rewards';

export interface ExpandedBundleInput {
  readonly catalog: RuntimeCatalog;
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  readonly expansion: ExpansionCatalog;
}

const salt = (seed: number, k: number): number => (Math.trunc(seed) ^ k) | 0;

/** Fisher-Yates over the ids as given (callers pass them in id order). Returns the new order and rng. */
export function shuffleOnce<T>(rng: RngState, items: readonly T[]): { readonly items: readonly T[]; readonly rng: RngState } {
  const out = [...items];
  let state = rng;
  for (let i = out.length - 1; i >= 1; i--) {
    const r = rngNext(state);
    state = r.state;
    const j = Math.min(i, Math.floor(r.value * (i + 1)));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return { items: out, rng: state };
}

export function createExpandedRun(config: RunConfig, bundle: ExpandedBundleInput): ExpandedRunState {
  const { catalog, layout, expansion } = bundle;
  const cellGeoms = layout.backgroundCells;
  if (!cellGeoms || cellGeoms.length === 0) throw new RangeError('expanded run needs a layout with background cells');
  const base = createRun({ ...config, tuning: bundle.tuning }, catalog, layout);

  const effectIds = [...expansion.effects.keys()].sort();
  const cells = assignCells(seedRng(salt(config.seed, 0x5bd1e995)), cellGeoms.map((c) => c.cellId), effectIds);
  const questionIds = [...expansion.questions.keys()].sort();
  const questions = shuffleOnce(seedRng(salt(config.seed, 0x1b873593)), questionIds);
  const effectsRng = seedRng(salt(config.seed, 0x2545f491));
  // Rewards (r002+): the A1 bag and the A9 order, each from its own choice; the draw RNG never moves.
  const rewardCfg = expansion.profile.rewards;
  const withRewards = rewardCfg ? initialRewards(base.shelf, config.seed, rewardCfg, catalog, layout) : null;

  const exp: ExpansionRunState = {
    cells: cells.cells,
    questionOrder: questions.items,
    questionCursor: 0,
    next: { modifiers: BASE_SHOT_MODIFIERS, hint: null },
    active: null,
    assortmentSeries: null,
    outlineSeries: null,
    deferredTransforms: [],
    rng: {
      cells: cells.rng as ExpansionRunState['rng']['cells'],
      questions: questions.rng as ExpansionRunState['rng']['questions'],
      effects: effectsRng as ExpansionRunState['rng']['effects'],
    },
    ...(withRewards ? { rewards: withRewards.rewards } : {}),
  };
  return {
    ...base,
    ...(withRewards ? { shelf: withRewards.shelf } : {}),
    schemaVersion: EXPANDED_RUN_STATE_SCHEMA_VERSION,
    rulesVersion: expansion.profile.rulesVersion,
    valueStatus: lowestStatus(base.valueStatus, expansion.profile.valueStatus),
    ammoLostTotal: 0,
    expansion: exp,
  };
}
