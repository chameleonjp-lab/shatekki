import { describe, expect, it, vi } from 'vitest';
import { GameController, type RulesApi } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import {
  BASE_SHOT_MODIFIERS,
  BOOTH_LAYOUT,
  asPrizeTypeId,
  cellIdOf,
  mintId,
  type EffectPlan,
  type ExpansionRunState,
  type FlightBarrier,
  type QuestionId,
  type RunState,
  type ShotContext,
  type ShotRecord,
  type ShotRequest,
  type ShotWorld,
  type SimulationFrame,
  type SimulationStep,
} from '../../src/contracts';
import { CAT, T, newRun, toAiming } from './helpers';

// Expanded rules in the controller (EG05/EG08): barrier → plan → (question →
// one answer) → resume once → record. Fake world and fake planning rules; the
// real effect planning is tested in src/core.

const emptyFrame: SimulationFrame = { simTimeSec: 0, shotId: null, stage: null, prizes: [], projectiles: [], events: [] };
const Q = 'Q005' as QuestionId;

function expansion(): ExpansionRunState {
  return {
    cells: [
      { cellId: cellIdOf(1, 1), effectId: 'FX001' as never, used: false, usedOnShot: null, requestId: null },
      { cellId: cellIdOf(1, 2), effectId: 'FX050' as never, used: true, usedOnShot: mintId.shot(1), requestId: null },
    ],
    questionOrder: [Q],
    questionCursor: 0,
    next: { modifiers: { ...BASE_SHOT_MODIFIERS, speedMult: 1.2 }, hint: null },
    active: null,
    assortmentSeries: null,
    outlineSeries: null,
    deferredTransforms: [],
    rng: { cells: [1, 2, 3, 4], questions: [1, 2, 3, 4], effects: [1, 2, 3, 4] },
  };
}

const expandedRun = (): RunState => ({ ...newRun(11), schemaVersion: 2, ammoLostTotal: 0, expansion: expansion() });

function planFor(state: RunState, barrier: FlightBarrier, question: boolean): EffectPlan {
  return {
    barrierId: barrier.barrierId,
    shotId: barrier.shotId,
    processed: [],
    transforms: [],
    question: question ? { questionId: Q, cursor: 0, answer: null } : null,
    rng: state.expansion!.rng,
    projection: {} as EffectPlan['projection'],
    complete: !question,
  };
}

const fakeRules: RulesApi = {
  ...CORE_RULES,
  planFlightEnd: (state, barrier) => ({
    ...state,
    inFlight: { ...state.inFlight!, stage: barrier.shopkeeperHit ? 'question' : 'postEffects', barrier, plan: planFor(state, barrier, barrier.shopkeeperHit) },
  }),
  answerShopkeeper: (state, cmd) => {
    const plan = state.inFlight?.plan;
    if (!plan?.question || plan.question.answer || cmd.shotId !== state.inFlight!.shotId || cmd.questionId !== plan.question.questionId) return state;
    return { ...state, inFlight: { ...state.inFlight!, stage: 'postEffects', plan: { ...plan, question: { ...plan.question, answer: cmd.choice }, complete: true } } };
  },
  resolveExpandedShot: (state, record) => ({
    state: { ...state, phase: 'position', inFlight: null, expansion: { ...state.expansion!, active: null } },
    summary: { shotId: record.shotId } as never,
  }),
};

function fakeWorld(shopkeeperHit: boolean) {
  let shot: ShotRequest | null = null;
  let frozen = false;
  let resumed = 0;
  let afterResume = 0;
  const world: ShotWorld & { contexts: ShotContext[]; stepCalls: number[]; plans: EffectPlan[] } = {
    contexts: [],
    stepCalls: [],
    plans: [],
    syncShelf: vi.fn(),
    fire(req, ctx) {
      shot = req;
      this.contexts.push(ctx);
    },
    step(dt): SimulationStep {
      this.stepCalls.push(dt);
      if (!shot) return { frame: emptyFrame, record: null, barrier: null };
      if (!frozen && resumed === 0) {
        frozen = true;
        const barrier: FlightBarrier = {
          runId: mintId.run('r'),
          shotId: shot.shotId,
          barrierId: mintId.barrier(shot.shotId),
          requests: [],
          shopkeeperHit,
          shopkeeperParts: shopkeeperHit ? ['hat'] : [],
          collectedDuringFlight: [],
          prizes: [],
          motion: [],
          simTimeSec: 1,
        };
        return { frame: emptyFrame, record: null, barrier };
      }
      if (frozen) return { frame: emptyFrame, record: null, barrier: null };
      afterResume += 1;
      if (afterResume < 2) return { frame: emptyFrame, record: null, barrier: null };
      const record: ShotRecord = {
        runId: mintId.run('r'),
        shotId: shot.shotId,
        collected: [{ instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001') }],
        prizeOutcomes: [],
        deviceActivations: [],
        firstHitCandidates: [],
        transforms: [],
        endedByLimit: false,
        remainingPrizes: [],
        simTimeSec: 2,
        barrierId: mintId.barrier(shot.shotId),
      };
      shot = null;
      return { frame: emptyFrame, record, barrier: null };
    },
    frame: () => emptyFrame,
    resumeAfterEffects(plan) {
      if (!frozen) return false;
      frozen = false;
      resumed += 1;
      this.plans.push(plan);
      return true;
    },
    previewFirstContact: () => ({ points: [], firstHitTargetId: null, approximate: true }),
    get shotInProgress() {
      return shot !== null;
    },
    dispose: vi.fn(),
  };
  return world;
}

function setup(shopkeeperHit: boolean) {
  const world = fakeWorld(shopkeeperHit);
  const settled = vi.fn();
  const c = new GameController({ rules: fakeRules, world, renderer: null, catalog: CAT, tuning: T, layout: BOOTH_LAYOUT, onShotSettled: settled }, toAiming(expandedRun()));
  expect(c.dispatch({ type: 'FIRE' })).toBe(true);
  return { c, world, settled };
}

describe('expanded controller: FIRE hands the shot its fixed settings', () => {
  it('passes the active modifiers and only the unused cells to the world', () => {
    const { world, c } = setup(false);
    expect(world.contexts).toHaveLength(1);
    expect(world.contexts[0]!.expanded?.modifiers.speedMult).toBe(1.2);
    expect(world.contexts[0]!.expanded?.usableCells).toEqual([cellIdOf(1, 1)]);
    expect(c.current.expansion?.active?.modifiers.speedMult).toBe(1.2);
  });

  it('shows used cells with their effect and hides unused ones', () => {
    const { c } = setup(false);
    expect(c.viewState().expansion?.cells).toEqual([
      { cellId: cellIdOf(1, 1), used: false, effectId: null },
      { cellId: cellIdOf(1, 2), used: true, effectId: 'FX050' },
    ]);
  });
});

describe('expanded controller: barrier without a question resumes at once', () => {
  it('plans once, resumes once, settles once', () => {
    const { c, world, settled } = setup(false);
    c.frame(1 / 60); // barrier
    expect(c.current.inFlight?.stage).toBe('postEffects');
    expect(world.plans).toHaveLength(1);
    for (let i = 0; i < 4; i++) c.frame(1 / 60);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(c.current.phase).toBe('position');
  });
});

describe('expanded controller: waiting for the shopkeeper answer', () => {
  it('advances nothing while waiting and does not carry the waited time over', () => {
    const { c, world } = setup(true);
    c.frame(1 / 60);
    expect(c.awaitingAnswer).toBe(true);
    expect(c.viewState().expansion?.question).toEqual({ shotId: c.current.inFlight!.shotId, questionId: Q, answer: null });
    const calls = world.stepCalls.length;
    const clocks = c.current.clocks;
    for (let i = 0; i < 50; i++) c.frame(0.1);
    expect(world.stepCalls.length).toBe(calls);
    expect(c.current.clocks).toEqual(clocks);
    expect(world.plans).toHaveLength(0);
    // Skipping the presentation never answers.
    c.dispatch({ type: 'SKIP_PRESENTATION' });
    expect(c.awaitingAnswer).toBe(true);
  });

  it('rejects answers while paused, for another shot or question, and a second answer; resumes once', () => {
    const { c, world, settled } = setup(true);
    c.frame(1 / 60);
    const shotId = c.current.inFlight!.shotId;
    c.dispatch({ type: 'PAUSE', reason: 'hidden' });
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: Q, choice: 'A' })).toBe(false);
    c.dispatch({ type: 'RESUME', reason: 'hidden' });
    // 'hidden' also added 'manual'; the answer must not lift it.
    expect(c.current.pauseReasons).toEqual(['manual']);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: Q, choice: 'A' })).toBe(false);
    c.dispatch({ type: 'RESUME', reason: 'manual' });
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: mintId.shot(9), questionId: Q, choice: 'A' })).toBe(false);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: 'Q006', choice: 'A' })).toBe(false);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: Q, choice: 'B', effectId: 'FX003' })).toBe(false);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: Q, choice: 'B' })).toBe(true);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId, questionId: Q, choice: 'A' })).toBe(false);
    expect(world.plans).toHaveLength(1);
    expect(world.plans[0]!.question?.answer).toBe('B');
    expect(c.awaitingAnswer).toBe(false);
    for (let i = 0; i < 4; i++) c.frame(1 / 60);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('rules-v1 controllers never accept an answer', () => {
    const world = fakeWorld(true);
    const c = new GameController({ rules: CORE_RULES, world, renderer: null, catalog: CAT, tuning: T, layout: BOOTH_LAYOUT }, toAiming(newRun(12)));
    c.dispatch({ type: 'FIRE' });
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: c.current.inFlight!.shotId, questionId: Q, choice: 'A' })).toBe(false);
    expect(c.viewState().expansion).toBeUndefined();
  });
});
