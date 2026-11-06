/**
 * Flight-end effect plan (plan EG04, requirements §5, §6.2, §8).
 *
 * `planFlightEnd` turns the barrier the sim stopped at into ONE provisional
 * EffectPlan stored in `inFlight`: carried-over transforms first, then every
 * request in its stable order (legacy post-flight devices converted into the
 * common plan, cells with their pre-assigned effect). If the shopkeeper was hit
 * and a question remains, the stage becomes 'question'; otherwise 'postEffects'.
 *
 * `answerShopkeeper` appends exactly one entry (the answer's effect) to that
 * same plan. Earlier entries are never re-run; their chosen effects, targets,
 * candidate orders and PRNG progress are frozen in the plan.
 *
 * Nothing here changes the ledger, the collection or the confirmed ammo:
 * `resolveShot` alone turns the plan's projection into the confirmed state.
 * Neither function reads the clock, the DOM or the physics world.
 */
import type {
  AnswerShopkeeperCommand,
  BoothLayout,
  EffectPlan,
  EffectRequest,
  EffectRequestId,
  ExpansionCatalog,
  ExpandedRunState,
  FlightBarrier,
  InFlightMarker,
  PlannedEffect,
  PrizeInstanceId,
  PrizeInstanceState,
  PrizeTypeId,
  RunState,
  RuntimeCatalog,
  TransformIntent,
  TuningConfig,
} from '../contracts';
import { isExpandedRunState, mintId } from '../contracts';
import { nextIndex, shuffled } from './expansion-rng';
import { EMPTY_RESERVATION, applyOperation, inapplicableReason, withAmmoAdded, withIntent, type EffectEnv, type EffectWork } from './gameplay-effects';
import { nextBulletType } from './gimmicks';
import { groupForChoice, nextPendingQuestion } from './questions';
import { sortPrizesByBoardOrder } from './series';

export interface ExpandedPlanContext {
  readonly tuning: TuningConfig;
  readonly catalog: RuntimeCatalog;
  readonly layout: BoothLayout;
  readonly expansion: ExpansionCatalog;
}

// ------------------------------------------------------------------ helpers

function envFor(state: ExpandedRunState, barrier: FlightBarrier, ctx: ExpandedPlanContext): EffectEnv {
  return {
    tuning: ctx.tuning,
    expansion: ctx.expansion,
    shotsFired: state.shotsFired,
    prizes: barrier.prizes.filter((p) => !p.collected),
    lastCollectedTypeId: state.collected.at(-1)?.typeId ?? null,
  };
}

function plannedFrom(request: Pick<EffectRequest, 'requestId' | 'source'>, effectId: PlannedEffect['effectId'], r: { outcome: PlannedEffect['outcome']; reason: string | null; ammoDelta: number; ammoRequested?: number | undefined; targets: readonly PrizeInstanceId[] }): PlannedEffect {
  return {
    requestId: request.requestId,
    source: request.source,
    effectId,
    outcome: r.outcome,
    reason: r.reason,
    ammoDelta: r.ammoDelta,
    ...(r.ammoRequested !== undefined ? { ammoRequested: r.ammoRequested } : {}),
    targets: r.targets,
  };
}

const skipped = (request: Pick<EffectRequest, 'requestId' | 'source'>, effectId: PlannedEffect['effectId'], reason: string): PlannedEffect =>
  plannedFrom(request, effectId, { outcome: 'notApplicable', reason, ammoDelta: 0, targets: [] });

function byStableOrder(a: EffectRequest, b: EffectRequest): number {
  return a.simTimeSec - b.simTimeSec || a.contactOrder - b.contactOrder || (a.targetId < b.targetId ? -1 : a.targetId > b.targetId ? 1 : 0);
}

function projectionOf(work: EffectWork): EffectPlan['projection'] {
  return {
    ammo: work.ammo,
    bonusAmmoTotal: work.bonusAmmoTotal,
    ammoLostTotal: work.ammoLostTotal,
    bulletType: work.bulletType,
    next: work.next,
    assortmentSeries: work.assortmentSeries,
    outlineSeries: work.outlineSeries,
    penaltyPoints: work.penaltyPoints,
  };
}

function withPlan(state: ExpandedRunState, flight: InFlightMarker, barrier: FlightBarrier | undefined, plan: EffectPlan, stage: 'question' | 'postEffects'): RunState {
  return { ...state, inFlight: { ...flight, ...(barrier ? { barrier } : {}), plan, stage } };
}

// ---------------------------------------------------------- legacy devices

interface LegacyFlags {
  bulletChanged: boolean;
  readonly devicesSeen: Set<string>;
}

/** The post-flight device kinds of rules-v1, converted into the common plan. */
function applyLegacyDevice(request: EffectRequest, work: EffectWork, env: EffectEnv, flight: InFlightMarker, flags: LegacyFlags, allKinds: readonly PrizeTypeId[]): { work: EffectWork; planned: PlannedEffect } {
  if (request.source.kind !== 'device') throw new Error('applyLegacyDevice: not a device request');
  const { deviceId, deviceKind } = request.source;
  const tuning = env.tuning;
  if (flags.devicesSeen.has(deviceId)) return { work, planned: skipped(request, null, 'deviceAlreadyUsed') }; // once per device per shot
  flags.devicesSeen.add(deviceId);
  switch (deviceKind) {
    case 'ammo': {
      const asked = tuning.devices.ammoBonus;
      const r = withAmmoAdded(work, asked, env.shotsFired, tuning);
      return { work: r.work, planned: plannedFrom(request, null, r.delta > 0 ? { outcome: 'applied', reason: null, ammoDelta: r.delta, ammoRequested: asked, targets: [] } : { outcome: 'notApplicable', reason: 'noAmmoRoom', ammoDelta: 0, ammoRequested: asked, targets: [] }) };
    }
    case 'penalty':
      return { work: { ...work, penaltyPoints: work.penaltyPoints + tuning.devices.penaltyPoints }, planned: plannedFrom(request, null, { outcome: 'applied', reason: null, ammoDelta: 0, targets: [] }) };
    case 'bulletType': {
      if (flags.bulletChanged) return { work, planned: skipped(request, null, 'bulletTypeAlreadyChanged') };
      flags.bulletChanged = true;
      return { work: { ...work, bulletType: nextBulletType(flight.request.bulletType, tuning) }, planned: plannedFrom(request, null, { outcome: 'applied', reason: null, ammoDelta: 0, targets: [] }) };
    }
    case 'transform': {
      const eligible = sortPrizesByBoardOrder(env.prizes.filter((p) => !p.collected));
      if (eligible.length === 0) return { work, planned: skipped(request, null, 'noTarget') };
      const pick = nextIndex(work.rng, eligible.length);
      const target: PrizeInstanceState = eligible[pick.index]!;
      const others = allKinds.filter((t) => t !== target.typeId);
      const order = shuffled(others, pick.state);
      const intent: TransformIntent = { instanceId: target.instanceId, requestId: request.requestId, candidateTypeIds: order.items };
      return {
        work: { ...work, transforms: withIntent(work.transforms, intent), rng: order.state },
        planned: plannedFrom(request, null, { outcome: 'applied', reason: null, ammoDelta: 0, targets: [target.instanceId] }),
      };
    }
    case 'split':
    case 'power':
      return { work, planned: skipped(request, null, 'flightOnlyDevice') }; // acted during the flight already
  }
}

// ------------------------------------------------------------ planFlightEnd

/**
 * Build the plan for the barrier. Idempotent: planning the same barrier again returns
 * `state` unchanged, so a request is applied once. Throws for structural misuse
 * (not an expanded run, no shot in flight, barrier of another shot).
 */
export function planFlightEnd(state: RunState, barrier: FlightBarrier, ctx: ExpandedPlanContext): RunState {
  if (!isExpandedRunState(state)) throw new Error('planFlightEnd: not an expanded run');
  const flight = state.inFlight;
  if (state.phase !== 'resolving' || flight === null) throw new Error('planFlightEnd: no shot in flight');
  if (flight.shotId !== barrier.shotId || state.runId !== barrier.runId) throw new Error(`planFlightEnd: barrier ${barrier.barrierId} does not belong to in-flight ${flight.shotId}`);
  if (flight.plan) return state; // already planned (same barrier or not): never plan twice

  const env = envFor(state, barrier, ctx);
  const exp = state.expansion;
  let work: EffectWork = {
    ammo: state.ammo,
    bonusAmmoTotal: state.bonusAmmoTotal,
    ammoLostTotal: state.ammoLostTotal,
    bulletType: 'standard',
    next: EMPTY_RESERVATION,
    assortmentSeries: exp.assortmentSeries,
    outlineSeries: exp.outlineSeries,
    penaltyPoints: 0,
    transforms: [],
    rng: exp.rng.effects,
  };
  const processed: PlannedEffect[] = [];
  const seen = new Set<string>();
  const livePrizeIds = new Set(env.prizes.map((p) => p.instanceId));

  // 1. carry-over: deferred transforms are rechecked before anything new; no PRNG (candidate order is fixed).
  for (const d of exp.deferredTransforms) {
    if (seen.has(d.requestId)) continue;
    seen.add(d.requestId);
    const req = { requestId: d.requestId, source: { kind: 'carryOver' } as const };
    if (!livePrizeIds.has(d.instanceId)) {
      processed.push(skipped(req, null, 'targetCollected'));
      continue;
    }
    work = { ...work, transforms: withIntent(work.transforms, { instanceId: d.instanceId, requestId: d.requestId, candidateTypeIds: d.candidateTypeIds }) };
    processed.push(plannedFrom(req, null, { outcome: 'applied', reason: null, ammoDelta: 0, targets: [d.instanceId] }));
  }

  // 2. this shot's requests in their stable order.
  const usedCells = new Set(exp.cells.filter((c) => c.used).map((c) => c.cellId));
  const legacy: LegacyFlags = { bulletChanged: false, devicesSeen: new Set() };
  const allKinds = [...ctx.catalog.prizes.keys()].sort();
  for (const request of [...barrier.requests].sort(byStableOrder)) {
    if (seen.has(request.requestId)) continue; // each request applied once
    seen.add(request.requestId);
    switch (request.source.kind) {
      case 'device': {
        const r = applyLegacyDevice(request, work, env, flight, legacy, allKinds);
        work = r.work;
        processed.push(r.planned);
        break;
      }
      case 'cell': {
        const cellId = request.source.cellId;
        const cell = exp.cells.find((c) => c.cellId === cellId);
        if (!cell) {
          processed.push(skipped(request, request.effectId, 'unknownCell'));
          break;
        }
        if (usedCells.has(cellId)) {
          processed.push(skipped(request, cell.effectId, 'cellAlreadyUsed'));
          break;
        }
        usedCells.add(cellId); // the cell is consumed even when its effect cannot act; never redrawn
        const effect = ctx.expansion.effects.get(cell.effectId);
        if (!effect) throw new RangeError(`planFlightEnd: cell ${cellId} has unknown effect ${cell.effectId}`);
        const r = applyOperation(effect.operation, request.requestId, work, env);
        work = r.work;
        processed.push(plannedFrom(request, effect.effectId, r));
        break;
      }
      case 'carryOver':
      case 'answer':
        processed.push(skipped(request, request.effectId, 'unexpectedSource')); // these never come from the sim
        break;
    }
  }

  // 3. question: only a shopkeeper hit asks, and only while the bag has one left.
  const question = barrier.shopkeeperHit ? nextPendingQuestion(exp) : null;
  const plan: EffectPlan = {
    barrierId: barrier.barrierId,
    shotId: barrier.shotId,
    processed,
    transforms: work.transforms,
    question,
    rng: { ...exp.rng, effects: work.rng },
    projection: projectionOf(work),
    complete: question === null,
  };
  return withPlan(state, flight, barrier, plan, question === null ? 'postEffects' : 'question');
}

// ------------------------------------------------------- answerShopkeeper

/** The smallest unused request number after the barrier's own requests (ids never collide). */
function answerRequestId(shotId: FlightBarrier['shotId'], plan: EffectPlan): EffectRequestId {
  const taken = new Set<string>(plan.processed.map((p) => p.requestId));
  let n = plan.processed.length + 1;
  while (taken.has(mintId.effectRequest(shotId, n))) n += 1;
  return mintId.effectRequest(shotId, n);
}

/**
 * Accept the one answer of the pending question. Returns the SAME state object when
 * the command is rejected: wrong stage, stale shot or question, already answered, or paused.
 */
export function answerShopkeeper(state: RunState, command: AnswerShopkeeperCommand, ctx: ExpandedPlanContext): RunState {
  if (!isExpandedRunState(state)) return state;
  const flight = state.inFlight;
  if (state.phase !== 'resolving' || flight === null || flight.stage !== 'question') return state;
  const plan = flight.plan;
  const barrier = flight.barrier;
  if (!plan || !barrier || plan.complete || plan.question === null || plan.question.answer !== null) return state;
  if (state.pauseReasons.length > 0) return state; // a paused game does not take answers
  if (command.shotId !== flight.shotId || command.shotId !== plan.shotId || command.questionId !== plan.question.questionId) return state;
  if (command.choice !== 'A' && command.choice !== 'B') return state;

  const group = groupForChoice(ctx.expansion, plan.question.questionId, command.choice);
  const env = envFor(state, barrier, ctx);
  let work: EffectWork = {
    ...plan.projection,
    transforms: plan.transforms,
    rng: plan.rng.effects,
  };

  // Applicability is judged on the projected state after the earlier requests; listing never draws.
  const applicable = group.effectIds.filter((id) => {
    const def = ctx.expansion.effects.get(id);
    return def !== undefined && inapplicableReason(def.operation, work, env) === null;
  });

  const requestId = answerRequestId(flight.shotId, plan);
  const request = { requestId, source: { kind: 'answer', questionId: plan.question.questionId, choice: command.choice } as const };
  let entry: PlannedEffect;
  if (applicable.length === 0) {
    entry = skipped(request, null, 'noApplicableEffect'); // never moved to another group, never redrawn
  } else {
    const pick = nextIndex(work.rng, applicable.length);
    work = { ...work, rng: pick.state };
    const effect = ctx.expansion.effects.get(applicable[pick.index]!)!;
    const r = applyOperation(effect.operation, requestId, work, env);
    work = r.work;
    entry = plannedFrom(request, effect.effectId, r);
  }

  const next: EffectPlan = {
    ...plan,
    processed: [...plan.processed, entry],
    transforms: work.transforms,
    question: { ...plan.question, answer: command.choice },
    rng: { ...plan.rng, effects: work.rng },
    projection: projectionOf(work),
    complete: true,
  };
  return withPlan(state, flight, undefined, next, 'postEffects');
}
