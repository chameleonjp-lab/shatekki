/** Helpers for expanded-shot tests (not a test file): a minimal complete plan and a runner that resumes at the barrier. */
import { makeRequest } from '../unit/helpers';
import {
  BASE_SHOT_MODIFIERS,
  BOOTH_LAYOUT_V2,
  mintId,
  muzzlePosition,
  type RunId,
  type Vec3,
  type EffectPlan,
  type FlightBarrier,
  type ImpactEvent,
  type ShotContext,
  type ShotRecord,
  type ShotRequest,
  type ShotWorld,
  type SimEvent,
  type SimulationFrame,
  type TransformIntent,
} from '../../src/contracts';

export function planFor(barrier: FlightBarrier, transforms: readonly TransformIntent[] = [], over: Partial<EffectPlan> = {}): EffectPlan {
  return {
    barrierId: barrier.barrierId,
    shotId: barrier.shotId,
    processed: [],
    transforms,
    question: null,
    rng: { cells: [1, 2, 3, 4], questions: [1, 2, 3, 4], effects: [1, 2, 3, 4] },
    projection: {
      ammo: 5,
      bonusAmmoTotal: 0,
      ammoLostTotal: 0,
      bulletType: 'standard',
      next: { modifiers: BASE_SHOT_MODIFIERS, hint: null },
      assortmentSeries: null,
      outlineSeries: null,
      penaltyPoints: 0,
    },
    complete: true,
    ...over,
  };
}

export interface ExpandedRun {
  readonly record: ShotRecord;
  readonly barriers: FlightBarrier[];
  readonly events: SimEvent[];
  readonly frames: SimulationFrame[];
  readonly impacts: ImpactEvent[];
}

/** Fire, step in `dt` chunks, resume at the barrier with `makePlan(barrier)`, until the record arrives. */
export function runExpanded(
  world: ShotWorld,
  request: ShotRequest,
  context: ShotContext,
  opts: { dt?: number; makePlan?: (b: FlightBarrier) => EffectPlan; maxSteps?: number } = {},
): ExpandedRun {
  const dt = opts.dt ?? 1 / 60;
  world.fire(request, context);
  const barriers: FlightBarrier[] = [];
  const events: SimEvent[] = [];
  const frames: SimulationFrame[] = [];
  for (let i = 0; i < (opts.maxSteps ?? 6000); i++) {
    const step = world.step(dt);
    frames.push(step.frame);
    events.push(...step.frame.events);
    if (step.barrier) {
      barriers.push(step.barrier);
      const ok = world.resumeAfterEffects((opts.makePlan ?? planFor)(step.barrier));
      if (!ok) throw new Error('resumeAfterEffects refused the plan');
    }
    if (step.record) return { record: step.record, barriers, events, frames, impacts: events.filter((e): e is ImpactEvent => e.type === 'impact') };
  }
  throw new Error('shot did not finish');
}

export const RUN: RunId = mintId.run('run-eg05');

export function expandedCtx(over: Partial<NonNullable<ShotContext['expanded']>> = {}): ShotContext {
  return { runId: RUN, chooseTransform: () => null, expanded: { modifiers: BASE_SHOT_MODIFIERS, usableCells: [], ...over } };
}

/** A shot that leaves the booth at once: nothing is touched, the barrier comes about 0.1 s later. */
export function harmlessRequest(shot = 1): ShotRequest {
  return makeRequest({ origin: muzzlePosition(BOOTH_LAYOUT_V2, 0), direction: { x: 0, y: 0, z: 1 } }, shot);
}

/** Straight at a point (ignores gravity: use short distances or solve with the cell-test helper). */
export function straightAt(from: Vec3, to: Vec3, shot = 1): ShotRequest {
  const d = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return makeRequest({ origin: from, direction: { x: d.x / l, y: d.y / l, z: d.z / l } }, shot);
}
