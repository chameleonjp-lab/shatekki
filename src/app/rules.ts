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
import { reduceWithRewards } from '../core/rewards';
import { reduceFestivalCommand } from '../core/festival';
import { isAimFirstState, reduceAimFirst } from '../core/aim-first';

export const CORE_RULES: RulesApi = {
  createRun: (config, catalog) => createRun(config, catalog),
  // Rewards (r002+) wrap the core reducer: A9 accept/decline, A5 placement at the stand and its use at FIRE.
  // r007 (aim first) handles its own movement, gauge, FIRE and talk; every other version goes straight to the core reducer.
  reduceGame: (state, command, ctx) =>
    reduceFestivalCommand(state, command, ctx.expansion) ?? reduceWithRewards(state, command, { tuning: ctx.tuning, layout: ctx.layout, expansion: ctx.expansion }, (s, c) => {
      const core = (x: typeof s, y: typeof c) => reduceGame(x, y, { tuning: ctx.tuning, layout: ctx.layout });
      if (ctx.expansion?.profile.aimFirst) return reduceAimFirst(s, c, { tuning: ctx.tuning, layout: ctx.layout, catalog: ctx.catalog, expansion: ctx.expansion }, core);
      // The r007-only commands mean nothing to r001-r006 and rules-v1.
      return c.type === 'OPEN_GAUGE' || c.type === 'CANCEL_GAUGE' || c.type === 'CHOOSE_SHOPKEEPER_TALK' ? s : core(s, c);
    }),
  tickRun: (state, dt, tuning) => tickRun(state, dt, tuning),
  // r007 has no hand sway: the requested aim is the shot's aim.
  effectiveAim: (state, tuning) => (isAimFirstState(state) ? state.aim : effectiveAim(state, tuning)),
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
  return { tuning: ctx.tuning, catalog: ctx.catalog, layout: ctx.layout, expansion: ctx.expansion, transformPolicy: ctx.transformPolicy };
}
