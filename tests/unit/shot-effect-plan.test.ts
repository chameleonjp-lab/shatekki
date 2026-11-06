import { describe, expect, it } from 'vitest';
import { answerShopkeeper, planFlightEnd, type ExpandedPlanContext } from '../../src/core/effect-plan';
import { nextPendingQuestion } from '../../src/core/questions';
import { BASE_SHOT_MODIFIERS, isExpandedRunState, mintId, type AnswerShopkeeperCommand, type ExpandedRunState, type QuestionId, type RunState } from '../../src/contracts';
import { EXP, PLAN_CTX, SHOT1, barrierOf, cellRequest, deviceRequest, expandedRun, inFlight, withCellEffect } from './expanded-helpers';
import { createRun } from '../../src/core/state';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../../src/catalog/release-config';

const CELL1 = 'cell-r1-c01' as never;
const CELL2 = 'cell-r1-c02' as never;

const planned = (s: ExpandedRunState, b = barrierOf(s), ctx: ExpandedPlanContext = PLAN_CTX): ExpandedRunState => planFlightEnd(s, b, ctx) as ExpandedRunState;
const planOf = (s: RunState) => s.inFlight!.plan!;

function ctxWithGroups(groups: Record<string, string[]>): ExpandedPlanContext {
  const g = new Map(EXP.groups);
  for (const [id, ids] of Object.entries(groups)) g.set(id as never, { ...EXP.groups.get(id as never)!, effectIds: ids as never });
  return { ...PLAN_CTX, expansion: { ...EXP, groups: g } };
}
/** Put a question whose choice A draws from `group` at the front of the bag. */
function askingGroupA(state: ExpandedRunState, group: string): { state: ExpandedRunState; questionId: QuestionId } {
  const q = [...EXP.questions.values()].find((d) => d.choices.A.groupId === group)!;
  const order = [q.questionId, ...state.expansion.questionOrder.filter((x) => x !== q.questionId)];
  return { state: { ...state, expansion: { ...state.expansion, questionOrder: order } }, questionId: q.questionId };
}
const answer = (_s: RunState, questionId: QuestionId, choice: 'A' | 'B' = 'A', shotId = SHOT1): AnswerShopkeeperCommand => ({ type: 'ANSWER_SHOPKEEPER', shotId, questionId, choice });
const hitBarrier = (s: ExpandedRunState, over = {}) => barrierOf(s, { shopkeeperHit: true, shopkeeperParts: ['hat'], ...over });

describe('planFlightEnd', () => {
  it('without a shopkeeper hit the plan is complete at once (stage postEffects, no question)', () => {
    const s = inFlight(expandedRun(1));
    const p = planned(s);
    expect(p.inFlight!.stage).toBe('postEffects');
    expect(planOf(p)).toMatchObject({ complete: true, question: null, processed: [], transforms: [] });
    expect(p.inFlight!.barrier).toBeDefined();
    expect(planOf(p).projection).toMatchObject({ ammo: s.ammo, bonusAmmoTotal: 0, ammoLostTotal: 0, penaltyPoints: 0, bulletType: 'standard' });
    expect(planOf(p).projection.next).toEqual({ modifiers: BASE_SHOT_MODIFIERS, hint: null });
  });

  it('a shopkeeper hit pauses at stage question with the next question of the bag and does not consume it', () => {
    const s = inFlight(expandedRun(2));
    const p = planned(s, hitBarrier(s));
    expect(p.inFlight!.stage).toBe('question');
    expect(planOf(p).complete).toBe(false);
    expect(planOf(p).question).toEqual({ questionId: s.expansion.questionOrder[0], cursor: 0, answer: null });
    expect(p.expansion.questionCursor).toBe(0); // consumed at confirmation, not here
  });

  it('does not change the input state, the confirmed ledger, the score or the cells', () => {
    const s = withCellEffect(inFlight(expandedRun(2)), CELL1, 'FX005');
    const before = JSON.stringify(s);
    const p = planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    expect(JSON.stringify(s)).toBe(before);
    expect(p.ledger).toBe(s.ledger);
    expect(p.score).toBe(s.score);
    expect(p.expansion.cells).toBe(s.expansion.cells);
    expect(p.expansion.rng).toBe(s.expansion.rng);
    expect(p.ammo).toBe(s.ammo);
  });

  it('planning the same state twice gives identical plans and an already planned state is returned as is', () => {
    const s = withCellEffect(inFlight(expandedRun(2)), CELL1, 'FX041');
    const b = barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const a1 = planned(s, b);
    const a2 = planned(s, b);
    expect(JSON.stringify(a2)).toBe(JSON.stringify(a1));
    expect(planFlightEnd(a1, b, PLAN_CTX)).toBe(a1);
  });

  it('cell requests use the pre-assigned effect, never redraw, and are recorded by cell id', () => {
    const s = withCellEffect(withCellEffect(inFlight(expandedRun(4)), CELL1, 'FX005'), CELL2, 'FX021');
    const p = planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1), cellRequest(SHOT1, 2, CELL2)] }));
    const plan = planOf(p);
    expect(plan.processed.map((e) => [e.source.kind, e.effectId, e.outcome])).toEqual([
      ['cell', 'FX005', 'applied'],
      ['cell', 'FX021', 'applied'],
    ]);
    expect(plan.projection.next.modifiers.damageMult).toBe(1.5);
    expect(plan.projection.ammo).toBe(s.ammo - 1);
    expect(plan.projection.ammoLostTotal).toBe(1);
    expect(plan.rng.effects).toEqual(s.expansion.rng.effects); // no draw was needed
  });

  it('a used cell, or the same cell twice, acts once', () => {
    let s = withCellEffect(inFlight(expandedRun(4)), CELL1, 'FX021');
    const dup = planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1, 1), cellRequest(SHOT1, 2, CELL1, 2)] }));
    expect(planOf(dup).processed.map((e) => e.outcome)).toEqual(['applied', 'notApplicable']);
    expect(planOf(dup).processed[1]!.reason).toBe('cellAlreadyUsed');
    expect(planOf(dup).projection.ammo).toBe(s.ammo - 1);
    s = { ...s, expansion: { ...s.expansion, cells: s.expansion.cells.map((c) => (c.cellId === CELL1 ? { ...c, used: true, usedOnShot: mintId.shot(0), requestId: mintId.effectRequest(mintId.shot(0), 1) } : c)) } };
    const used = planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    expect(planOf(used).processed[0]).toMatchObject({ outcome: 'notApplicable', reason: 'cellAlreadyUsed' });
    expect(planOf(used).projection.ammo).toBe(s.ammo);
  });

  it('the same request id is applied only once', () => {
    const s = withCellEffect(inFlight(expandedRun(4)), CELL1, 'FX021');
    const r = cellRequest(SHOT1, 1, CELL1);
    const p = planned(s, barrierOf(s, { requests: [r, r] }));
    expect(planOf(p).processed).toHaveLength(1);
  });

  it('requests are processed in (time, contact order, target id) order whatever the input order', () => {
    const s = withCellEffect(withCellEffect(inFlight(expandedRun(4)), CELL1, 'FX005'), CELL2, 'FX004');
    const late = { ...cellRequest(SHOT1, 1, CELL1), simTimeSec: 0.9 };
    const early = { ...cellRequest(SHOT1, 2, CELL2), simTimeSec: 0.3 };
    const p = planned(s, barrierOf(s, { requests: [late, early] }));
    expect(planOf(p).processed.map((e) => e.effectId)).toEqual(['FX004', 'FX005']);
    expect(planOf(p).projection.next.modifiers.damageMult).toBe(1.5); // the later request wins per field
  });

  describe('legacy post-flight devices share the common plan', () => {
    it('the +2 ammo plate shares the cumulative cap (bonus 9 gives +1)', () => {
      const s0 = inFlight(expandedRun(6));
      const s = { ...s0, bonusAmmoTotal: 9, shotsFired: 1, ammo: 4 };
      const p = planned(s, barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-ammo', 'ammo')] }));
      expect(planOf(p).projection).toMatchObject({ ammo: 5, bonusAmmoTotal: 10 });
      expect(planOf(p).processed[0]).toMatchObject({ outcome: 'applied', ammoDelta: 1 });
    });
    it('plate and cell +ammo share one cap: plate +2 then FX003 at bonus 8', () => {
      const s0 = withCellEffect(inFlight(expandedRun(6)), CELL1, 'FX003');
      const s = { ...s0, bonusAmmoTotal: 8 };
      const p = planned(s, barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-ammo', 'ammo'), cellRequest(SHOT1, 2, CELL1)] }));
      expect(planOf(p).processed.map((e) => e.ammoDelta)).toEqual([2, 0]);
      expect(planOf(p).projection.bonusAmmoTotal).toBe(10);
    });
    it('a penalty plate goes to projection.penaltyPoints once per device', () => {
      const s = inFlight(expandedRun(6));
      const p = planned(s, barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-pen', 'penalty', 1), { ...deviceRequest(SHOT1, 2, 'dev-pen', 'penalty', 2) }, deviceRequest(SHOT1, 3, 'dev-pen2', 'penalty', 3)] }));
      expect(planOf(p).projection.penaltyPoints).toBe(2 * PLAN_CTX.tuning.devices.penaltyPoints);
    });
    it('a bullet type plate advances the bullet type once, as in rules-v1', () => {
      const s = inFlight(expandedRun(6));
      const p = planned(s, barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-b1', 'bulletType', 1), deviceRequest(SHOT1, 2, 'dev-b2', 'bulletType', 2)] }));
      expect(planOf(p).projection.bulletType).toBe('heavy'); // standard -> heavy
      expect(planOf(p).processed[1]).toMatchObject({ outcome: 'notApplicable', reason: 'bulletTypeAlreadyChanged' });
    });
    it('a transform plate becomes a TransformIntent with a fixed candidate order from the effects stream', () => {
      const s = inFlight(expandedRun(6));
      const b = barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-tr', 'transform')] });
      const p = planned(s, b);
      const plan = planOf(p);
      expect(plan.transforms).toHaveLength(1);
      const intent = plan.transforms[0]!;
      expect(intent.candidateTypeIds).toHaveLength(99);
      expect(intent.candidateTypeIds).not.toContain(s.shelf.prizes.find((x) => x.instanceId === intent.instanceId)!.typeId);
      expect(plan.rng.effects).not.toEqual(s.expansion.rng.effects);
      expect(JSON.stringify(planned(s, b))).toBe(JSON.stringify(p));
    });
    it('split and power plates only act in flight', () => {
      const s = inFlight(expandedRun(6));
      const p = planned(s, barrierOf(s, { requests: [deviceRequest(SHOT1, 1, 'dev-s', 'split')] }));
      expect(planOf(p).processed[0]).toMatchObject({ outcome: 'notApplicable', reason: 'flightOnlyDevice' });
    });
  });

  describe('carried-over transforms', () => {
    it('are rechecked first, with their fixed candidate order and without using the PRNG', () => {
      const s0 = withCellEffect(inFlight(expandedRun(7)), CELL1, 'FX005');
      const target = s0.shelf.prizes[3]!;
      const gone = s0.shelf.prizes[4]!;
      const deferred = [
        { instanceId: target.instanceId, requestId: mintId.effectRequest(mintId.shot(0), 7), candidateTypeIds: [target.typeId, 'P090' as never] },
        { instanceId: gone.instanceId, requestId: mintId.effectRequest(mintId.shot(0), 8), candidateTypeIds: ['P091' as never] },
      ];
      const s = { ...s0, expansion: { ...s0.expansion, deferredTransforms: deferred } };
      const b = barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)], prizes: s.shelf.prizes.filter((x) => x.instanceId !== gone.instanceId) });
      const plan = planOf(planned(s, b));
      expect(plan.processed.map((e) => [e.source.kind, e.outcome, e.reason])).toEqual([
        ['carryOver', 'applied', null],
        ['carryOver', 'notApplicable', 'targetCollected'],
        ['cell', 'applied', null],
      ]);
      expect(plan.transforms).toEqual([{ instanceId: target.instanceId, requestId: deferred[0]!.requestId, candidateTypeIds: deferred[0]!.candidateTypeIds }]);
      expect(plan.rng.effects).toEqual(s.expansion.rng.effects);
    });

    it('a new request for the same prize overwrites the carried-over one', () => {
      const s0 = withCellEffect(inFlight(expandedRun(7)), CELL1, 'FX041');
      const target = s0.shelf.prizes[0]!;
      const s = { ...s0, expansion: { ...s0.expansion, deferredTransforms: [{ instanceId: target.instanceId, requestId: mintId.effectRequest(mintId.shot(0), 1), candidateTypeIds: ['P090' as never] }] } };
      const plan = planOf(planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)] })));
      const mine = plan.transforms.filter((t) => t.instanceId === target.instanceId);
      expect(mine).toHaveLength(1);
      expect(mine[0]!.requestId).toBe(mintId.effectRequest(SHOT1, 1));
    });
  });

  it('next-shot reservations from cells are kept even when ammo is 0 before the answer', () => {
    const s0 = withCellEffect(inFlight(expandedRun(9)), CELL1, 'FX005');
    const s = { ...s0, ammo: 0, shotsFired: 10 };
    const p = planned(s, hitBarrier(s, { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    expect(planOf(p).projection.ammo).toBe(0);
    expect(planOf(p).projection.next.modifiers.damageMult).toBe(1.5);
    expect(p.phase).toBe('resolving'); // planning never ends the game
  });

  it('active and next reservations are kept apart', () => {
    const s0 = withCellEffect(inFlight(expandedRun(9)), CELL1, 'FX017');
    const active = { modifiers: { ...BASE_SHOT_MODIFIERS, damageMult: 1.25 }, hint: null } as const;
    const s = { ...s0, expansion: { ...s0.expansion, active } };
    const p = planned(s, barrierOf(s, { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    expect(p.expansion.active).toBe(active);
    expect(planOf(p).projection.next.modifiers).toMatchObject({ bulletType: 'heavy', damageMult: 1 });
  });

  it('misuse throws: rules-v1 run, nothing in flight, barrier of another shot', () => {
    const v1 = createRun({ runId: mintId.run('v1'), seed: 1, tuning: RELEASE_TUNING, playerName: null }, RELEASE_CATALOG);
    expect(() => planFlightEnd(v1, barrierOf(inFlight(expandedRun(1))), PLAN_CTX)).toThrow();
    const idle = expandedRun(1);
    expect(() => planFlightEnd(idle, { ...barrierOf(inFlight(idle)) }, PLAN_CTX)).toThrow();
    const s = inFlight(expandedRun(1));
    expect(() => planFlightEnd(s, { ...barrierOf(s), shotId: mintId.shot(2) }, PLAN_CTX)).toThrow();
  });

  it('exhausted question bag asks nothing', () => {
    const s0 = inFlight(expandedRun(1));
    const s = { ...s0, expansion: { ...s0.expansion, questionCursor: 200 } };
    const p = planned(s, hitBarrier(s));
    expect(planOf(p).question).toBeNull();
    expect(p.inFlight!.stage).toBe('postEffects');
  });
});

describe('answerShopkeeper', () => {
  const asked = (seed = 3) => {
    const s = inFlight(expandedRun(seed));
    const p = planned(s, hitBarrier(s));
    return { s, p, q: planOf(p).question!.questionId };
  };

  it('accepts one answer, appends exactly one entry to the same plan and moves to postEffects', () => {
    const cellState = withCellEffect(inFlight(expandedRun(3)), CELL1, 'FX005');
    const p = planned(cellState, hitBarrier(cellState, { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    const q = planOf(p).question!.questionId;
    const before = planOf(p);
    const a = answerShopkeeper(p, answer(p, q, 'A'), PLAN_CTX) as ExpandedRunState;
    expect(a).not.toBe(p);
    const after = planOf(a);
    expect(a.inFlight!.stage).toBe('postEffects');
    expect(after.complete).toBe(true);
    expect(after.question).toEqual({ ...before.question, answer: 'A' });
    expect(after.processed).toHaveLength(before.processed.length + 1);
    expect(after.processed.slice(0, before.processed.length)).toEqual(before.processed); // earlier entries are not re-run
    const entry = after.processed.at(-1)!;
    expect(entry.source).toEqual({ kind: 'answer', questionId: q, choice: 'A' });
    const group = EXP.groups.get(EXP.questions.get(q)!.choices.A.groupId)!;
    expect(group.effectIds).toContain(entry.effectId);
    expect(a.inFlight!.barrier).toBe(p.inFlight!.barrier);
    expect(isExpandedRunState(a)).toBe(true);
  });

  it('a second answer, a stale shotId or questionId, and a wrong stage are rejected (same state object)', () => {
    const { p, q } = asked();
    const a = answerShopkeeper(p, answer(p, q), PLAN_CTX);
    expect(answerShopkeeper(a, answer(a, q, 'B'), PLAN_CTX)).toBe(a);
    expect(answerShopkeeper(p, answer(p, q, 'A', mintId.shot(2)), PLAN_CTX)).toBe(p);
    const other = [...EXP.questions.keys()].find((x) => x !== q)!;
    expect(answerShopkeeper(p, answer(p, other), PLAN_CTX)).toBe(p);
    const noHit = planned(inFlight(expandedRun(3)));
    expect(answerShopkeeper(noHit, answer(noHit, q), PLAN_CTX)).toBe(noHit);
    const idle = expandedRun(3);
    expect(answerShopkeeper(idle, answer(idle, q), PLAN_CTX)).toBe(idle);
  });

  it('is rejected while paused and accepted again after resuming', () => {
    const { p, q } = asked();
    const paused = { ...p, pauseReasons: ['hidden' as const] };
    expect(answerShopkeeper(paused, answer(paused, q), PLAN_CTX)).toBe(paused);
    const resumed = { ...paused, pauseReasons: [] };
    expect(answerShopkeeper(resumed, answer(resumed, q), PLAN_CTX)).not.toBe(resumed);
  });

  it('is rejected for a rules-v1 run', () => {
    const v1 = createRun({ runId: mintId.run('v1'), seed: 1, tuning: RELEASE_TUNING, playerName: null }, RELEASE_CATALOG);
    expect(answerShopkeeper(v1, answer(v1, 'Q001' as QuestionId), PLAN_CTX)).toBe(v1);
  });

  it('the same seed gives the same plan; another seed differs', () => {
    const run = (seed: number) => {
      const { p, q } = asked(seed);
      return JSON.stringify(planOf(answerShopkeeper(p, answer(p, q, 'B'), PLAN_CTX)));
    };
    expect(run(3)).toBe(run(3));
    const many = new Set(Array.from({ length: 12 }, (_, i) => run(20 + i)));
    expect(many.size).toBeGreaterThan(6);
  });

  it('draws uniformly among the applicable effects of the chosen group (A and B differ)', () => {
    const { p, q } = asked(14);
    const groupA = EXP.questions.get(q)!.choices.A.groupId;
    const groupB = EXP.questions.get(q)!.choices.B.groupId;
    expect(groupA).not.toBe(groupB);
    const a = planOf(answerShopkeeper(p, answer(p, q, 'A'), PLAN_CTX)).processed.at(-1)!;
    const b = planOf(answerShopkeeper(p, answer(p, q, 'B'), PLAN_CTX)).processed.at(-1)!;
    expect(EXP.groups.get(groupA)!.effectIds).toContain(a.effectId);
    expect(EXP.groups.get(groupB)!.effectIds).toContain(b.effectId);
  });

  it('every effect of a group can be reached, roughly uniformly', () => {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= 400; seed++) {
      const s0 = inFlight(expandedRun(seed));
      const { state, questionId } = askingGroupA(s0, 'GAIN');
      const p = planned(state, hitBarrier(state));
      const e = planOf(answerShopkeeper(p, answer(p, questionId, 'A'), PLAN_CTX)).processed.at(-1)!;
      counts.set(e.effectId!, (counts.get(e.effectId!) ?? 0) + 1);
    }
    expect(counts.size).toBe(20);
    for (const n of counts.values()) expect(n).toBeGreaterThan(5); // expected 20 each
  });

  it('with no applicable effect the entry is notApplicable/noApplicableEffect, in the same group, and not redrawn', () => {
    const ctx = ctxWithGroups({ GAIN: ['FX021'] }); // only "drop 1 ammo"
    const s0 = inFlight(expandedRun(3));
    const s = { ...s0, ammo: 1 };
    const { state, questionId } = askingGroupA(s, 'GAIN');
    const p = planned(state, hitBarrier(state), ctx);
    const a = answerShopkeeper(p, answer(p, questionId), ctx);
    const entry = planOf(a).processed.at(-1)!;
    expect(entry).toMatchObject({ outcome: 'notApplicable', reason: 'noApplicableEffect', effectId: null, ammoDelta: 0 });
    expect(planOf(a).rng.effects).toEqual(planOf(p).rng.effects); // no draw was spent
    expect(planOf(a).projection.ammo).toBe(1);
    expect(a.inFlight!.stage).toBe('postEffects');
  });

  it('applicability is judged on the projected state after the earlier requests', () => {
    // 3 corks left, the cell removes 2 (-> 1); the answer group only holds "drop 1", which is no longer applicable.
    const ctx = ctxWithGroups({ GAIN: ['FX021'] });
    const s0 = withCellEffect(inFlight(expandedRun(3)), CELL1, 'FX022');
    const { state, questionId } = askingGroupA({ ...s0, ammo: 3 }, 'GAIN');
    const p = planned(state, hitBarrier(state, { requests: [cellRequest(SHOT1, 1, CELL1)] }), ctx);
    expect(planOf(p).projection.ammo).toBe(1);
    const entry = planOf(answerShopkeeper(p, answer(p, questionId), ctx)).processed.at(-1)!;
    expect(entry.reason).toBe('noApplicableEffect');
    // with 4 corks the same group acts: 4 - 2 = 2 -> drop 1 -> 1
    const { state: s4, questionId: q4 } = askingGroupA({ ...s0, ammo: 4 }, 'GAIN');
    const p4 = planned(s4, hitBarrier(s4, { requests: [cellRequest(SHOT1, 1, CELL1)] }), ctx);
    const e4 = planOf(answerShopkeeper(p4, answer(p4, q4), ctx));
    expect(e4.processed.at(-1)).toMatchObject({ effectId: 'FX021', outcome: 'applied', ammoDelta: -1 });
    expect(e4.projection).toMatchObject({ ammo: 1, ammoLostTotal: 3 });
  });

  it('an earlier next-shot boost with 0 corks left survives a final answer that gives +1', () => {
    const ctx = ctxWithGroups({ GAIN: ['FX001'] });
    const s0 = withCellEffect(inFlight(expandedRun(3)), CELL1, 'FX005');
    const { state, questionId } = askingGroupA({ ...s0, ammo: 0, shotsFired: 10 }, 'GAIN');
    const p = planned(state, hitBarrier(state, { requests: [cellRequest(SHOT1, 1, CELL1)] }), ctx);
    expect(planOf(p).projection).toMatchObject({ ammo: 0 });
    const a = answerShopkeeper(p, answer(p, questionId), ctx);
    expect(planOf(a).projection).toMatchObject({ ammo: 1, bonusAmmoTotal: 1 });
    expect(planOf(a).projection.next.modifiers.damageMult).toBe(1.5);
    expect(planOf(a).processed.at(-1)).toMatchObject({ effectId: 'FX001', ammoDelta: 1 });
  });

  it('the answer can overwrite an earlier reservation of the same field (last wins)', () => {
    const ctx = ctxWithGroups({ GAIN: ['FX004'] });
    const s0 = withCellEffect(inFlight(expandedRun(3)), CELL1, 'FX005');
    const { state, questionId } = askingGroupA(s0, 'GAIN');
    const p = planned(state, hitBarrier(state, { requests: [cellRequest(SHOT1, 1, CELL1)] }), ctx);
    const a = answerShopkeeper(p, answer(p, questionId), ctx);
    expect(planOf(a).projection.next.modifiers.damageMult).toBe(1.25);
  });

  it('answer request ids never collide with the barrier request ids', () => {
    const s0 = withCellEffect(inFlight(expandedRun(3)), CELL1, 'FX005');
    const p = planned(s0, hitBarrier(s0, { requests: [cellRequest(SHOT1, 1, CELL1), cellRequest(SHOT1, 2, CELL2)] }));
    const q = planOf(p).question!.questionId;
    const ids = planOf(answerShopkeeper(p, answer(p, q), PLAN_CTX)).processed.map((e) => e.requestId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('viewing the pending question again never advances any random stream', () => {
    const { p } = asked();
    const rngBefore = JSON.stringify([p.expansion.rng, planOf(p).rng]);
    for (let i = 0; i < 10; i++) {
      nextPendingQuestion(p.expansion);
      planFlightEnd(p, p.inFlight!.barrier!, PLAN_CTX); // re-planning returns the same state
    }
    expect(JSON.stringify([p.expansion.rng, planOf(p).rng])).toBe(rngBefore);
  });

  it('a series answer fixes the candidate orders in the plan; the confirmed order is the planned one', () => {
    const ctx = ctxWithGroups({ STOCK: ['FX043'] });
    const s0 = inFlight(expandedRun(3));
    const { state, questionId } = askingGroupA(s0, 'STOCK');
    const p = planned(state, hitBarrier(state), ctx);
    const a = answerShopkeeper(p, answer(p, questionId), ctx);
    const plan = planOf(a);
    expect(plan.projection.assortmentSeries).toBe('SER03');
    expect(plan.transforms.length).toBeGreaterThan(0);
    expect(plan.rng.effects).not.toEqual(planOf(p).rng.effects);
    // answering again must not redraw
    expect(answerShopkeeper(a, answer(a, questionId), ctx)).toBe(a);
  });
});
