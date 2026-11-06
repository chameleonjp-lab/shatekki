/**
 * Adapter from the Game modules (src/core) to the controller's RulesApi
 * (owner: Opus). Keeps the controller independent of module layout.
 */
import type { RulesApi } from './controller';
import { createRun } from '../core/state';
import { reduceGame, tickRun } from '../core/transitions';
import { effectiveAim } from '../core/aim';
import { loadingBarValue } from '../core/loading';
import { resolveShot } from '../core/settlement';
import { createTransformChooser } from '../core/gimmicks';

export const CORE_RULES: RulesApi = {
  createRun: (config, catalog) => createRun(config, catalog),
  reduceGame: (state, command, ctx) => reduceGame(state, command, { tuning: ctx.tuning, layout: ctx.layout }),
  tickRun: (state, dt, tuning) => tickRun(state, dt, tuning),
  effectiveAim: (state, tuning) => effectiveAim(state, tuning),
  loadingBarValue: (state, tuning) => loadingBarValue(state.clocks.loadingSec, tuning),
  resolveShot: (state, record, catalog, tuning) => resolveShot(state, record, catalog, tuning),
  // Prototype transform rule (O08): deterministic from (seed, shotId).
  transformChooser: (state, catalog) => createTransformChooser(state, catalog),
};
