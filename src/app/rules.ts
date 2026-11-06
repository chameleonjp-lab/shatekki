/**
 * Adapter from the Game modules (src/core) to the controller's RulesApi
 * (owner: Opus). Keeps the controller independent of module layout.
 */
import type { RulesApi, RulesContext } from './controller';
import type { ExpandedPlanContext } from '../core/effect-plan';
import { answerShopkeeper, planFlightEnd } from '../core/effect-plan';
import { resolveExpandedShot } from '../core/expanded-settlement';
import { createRun } from '../core/state';
import { reduceGame, tickRun } from '../core/transitions';
import { effectiveAim } from '../core/aim';
import { loadingBarValue, loadPeriodMultiplierFor } from '../core/loading';
import { resolveShot } from '../core/settlement';
import { createTransformChooser } from '../core/gimmicks';

export const CORE_RULES: RulesApi = {
  createRun: (config, catalog) => createRun(config, catalog),
  reduceGame: (state, command, ctx) => reduceGame(state, command, { tuning: ctx.tuning, layout: ctx.layout }),
  tickRun: (state, dt, tuning) => tickRun(state, dt, tuning),
  effectiveAim: (state, tuning) => effectiveAim(state, tuning),
  loadingBarValue: (state, tuning) => loadingBarValue(state.clocks.loadingSec, tuning, loadPeriodMultiplierFor(state)),
  resolveShot: (state, record, catalog, tuning) => resolveShot(state, record, catalog, tuning),
  // Prototype transform rule (O08): deterministic from (seed, shotId).
  transformChooser: (state, catalog) => createTransformChooser(state, catalog),
  // Expanded rules (D34-D37). Without an expansion catalog these never change a rules-v1 run.
  planFlightEnd: (state, barrier, ctx) => (ctx.expansion ? planFlightEnd(state, barrier, expandedCtx(ctx)) : state),
  answerShopkeeper: (state, command, ctx) => (ctx.expansion ? answerShopkeeper(state, command, expandedCtx(ctx)) : state),
  resolveExpandedShot: (state, record, ctx) => resolveExpandedShot(state, record, expandedCtx(ctx)),
};

function expandedCtx(ctx: RulesContext): ExpandedPlanContext {
  if (!ctx.expansion) throw new Error('expanded rules need the expansion catalog of the same bundle');
  return { tuning: ctx.tuning, catalog: ctx.catalog, layout: ctx.layout, expansion: ctx.expansion };
}
