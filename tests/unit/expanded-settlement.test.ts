import { describe, expect, it } from 'vitest';
import { answerShopkeeper, planFlightEnd } from '../../src/core/effect-plan';
import { resolveExpandedShot } from '../../src/core/expanded-settlement';
import { BASE_SHOT_MODIFIERS, isAmmoBalanced, isLedgerEntryConsistent, mintId, type ExpandedRunState, type QuestionId, type RunState, type ShotRecord } from '../../src/contracts';
import { createRun } from '../../src/core/state';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../../src/catalog/release-config';
import { syntheticRecord } from './helpers';
import { EXP, PLAN_CTX, SHOT1, barrierOf, bundle, cellRequest, deviceRequest, expandedRun, inFlight, tid, withCellEffect, withKinds } from './expanded-helpers';

const CELL1 = 'cell-r1-c01' as never;
const iid = (i: number) => mintId.instance(i + 1); // prize at shelf index i

/** A run that already fired `fired` corks (balanced), then the next cork is in flight. */
function flying(seed: number, fired = 0, setup: (s: ExpandedRunState) => ExpandedRunState = (s) => s): ExpandedRunState {
  const run = expandedRun(seed);
  return inFlight(setup({ ...run, shotsFired: fired, ammo: bundle.tuning.initialAmmo - fired }));
}
const plan = (s: ExpandedRunState, over = {}): ExpandedRunState => planFlightEnd(s, barrierOf(s, over), PLAN_CTX) as ExpandedRunState;
function ask(s: ExpandedRunState, over = {}): ExpandedRunState {
  return plan(s, { shopkeeperHit: true, shopkeeperParts: ['hat'], ...over });
}
const answerA = (s: RunState): ExpandedRunState => answerShopkeeper(s, { type: 'ANSWER_SHOPKEEPER', shotId: SHOT1, questionId: s.inFlight!.plan!.question!.questionId as QuestionId, choice: 'A' }, PLAN_CTX) as ExpandedRunState;
const settle = (s: RunState, collect: readonly number[] = [], over: Partial<ShotRecord> = {}) => resolveExpandedShot(s, syntheticRecord(s, collect.map(iid), { barrierId: s.inFlight!.plan!.barrierId, ...over }), PLAN_CTX);

describe('resolveExpandedShot', () => {
  it('confirms a plain shot: score, collection, refill to 36, in-flight cleared, ammo balanced', () => {
    const s = plan(flying(1));
    const r = settle(s, [0]);
    const st = r.state as ExpandedRunState;
    expect(st.phase).toBe('position');
    expect(st.inFlight).toBeNull();
    expect(st.collected).toHaveLength(1);
    expect(st.shelf.prizes).toHaveLength(36);
    expect(st.score).toBe(st.ledger[0]!.scoreAfter);
    expect(isLedgerEntryConsistent(st.ledger[0]!)).toBe(true);
    expect(isAmmoBalanced(st, 10)).toBe(true);
    expect(st.expansion.active).toBeNull();
    expect(r.summary.runEnded).toBe(false);
    // The summary repeats what the plan did (for the result lines), and nothing more.
    expect(r.summary.effects).toEqual(s.inFlight!.plan!.processed);
    expect(r.summary.appliedTransforms).toEqual([]);
    expect(r.summary.deferredTransforms).toEqual([]);
  });

  it('pair sets score once from their own config (50) through the shared scoring', () => {
    const s = plan(flying(2, 0, (x) => withKinds(x, { 0: 'P001', 1: 'P002' })));
    const r = settle(s, [0, 1]);
    expect(r.summary.newlyCompletedSets).toEqual(['PAIR001']);
    expect(r.summary.ledger.setPoints).toBe(50);
    expect(r.state.completedSets).toEqual(['PAIR001']);
    // same kinds collected again later: no second set score
    const again = flying(2, 1, (x) => ({ ...withKinds(x, { 0: 'P001', 1: 'P002' }), completedSets: r.state.completedSets, collectedTypeIds: r.state.collectedTypeIds }));
    const r2 = settle(plan(again), [0, 1]);
    expect(r2.summary.newlyCompletedSets).toEqual([]);
  });

  it('a transformed prize counts as the kind it has when collected', () => {
    const s = plan(flying(2, 0, (x) => withKinds(x, { 0: 'P001', 1: 'P003' })));
    const rec = syntheticRecord(s, [iid(0)], { barrierId: s.inFlight!.plan!.barrierId, collected: [{ instanceId: iid(0), typeId: tid('P001') }, { instanceId: iid(1), typeId: tid('P002') }] });
    const r = resolveExpandedShot(s, rec, PLAN_CTX);
    expect(r.state.collectedTypeIds).toEqual(['P001', 'P002']);
    expect(r.summary.newlyCompletedSets).toEqual(['PAIR001']);
  });

  it('takes ammo, bonus and ammoLostTotal from the projection and keeps the save invariant', () => {
    const add = plan(withCellEffect(flying(3), CELL1, 'FX003'), { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const a = settle(add).state as ExpandedRunState;
    expect([a.ammo, a.bonusAmmoTotal, a.ammoLostTotal, a.shotsFired]).toEqual([12, 3, 0, 1]);
    expect(isAmmoBalanced(a, 10)).toBe(true);
    const rem = plan(withCellEffect(flying(3), CELL1, 'FX022'), { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const b = settle(rem).state as ExpandedRunState;
    expect([b.ammo, b.bonusAmmoTotal, b.ammoLostTotal]).toEqual([7, 0, 2]);
    expect(isAmmoBalanced(b, 10)).toBe(true);
  });

  it('marks the cells used (also when the effect could not act) and leaves the others', () => {
    const s0 = withCellEffect(withCellEffect(flying(4, 9), CELL1, 'FX021'), 'cell-r1-c02' as never, 'FX005');
    const s = plan(s0, { requests: [cellRequest(SHOT1, 1, CELL1), cellRequest(SHOT1, 2, 'cell-r1-c02' as never)] });
    expect(s.inFlight!.plan!.processed[0]).toMatchObject({ outcome: 'notApplicable', reason: 'ammoAtMostOne' }); // 1 cork -> 0 corks: none to drop
    const st = settle(s).state as ExpandedRunState;
    const used = st.expansion.cells.filter((c) => c.used);
    expect(used.map((c) => c.cellId)).toEqual(['cell-r1-c01', 'cell-r1-c02']);
    expect(used[0]).toMatchObject({ usedOnShot: SHOT1, requestId: mintId.effectRequest(SHOT1, 1) });
    expect(st.expansion.cells.filter((c) => !c.used)).toHaveLength(34);
  });

  it('ends the game only when the final ammo is 0, and a final answer of +1 continues with the reservation kept', () => {
    // last cork, boost from a cell, answer FX001 -> 1 cork left, boost kept
    const ctx = { ...PLAN_CTX, expansion: { ...EXP, groups: new Map(EXP.groups).set('GAIN' as never, { ...EXP.groups.get('GAIN' as never)!, effectIds: ['FX001'] as never }) } };
    const q = [...EXP.questions.values()].find((d) => d.choices.A.groupId === 'GAIN')!.questionId;
    const base = withCellEffect(flying(5, 9), CELL1, 'FX005');
    const s0 = { ...base, expansion: { ...base.expansion, questionOrder: [q, ...base.expansion.questionOrder.filter((x) => x !== q)] } };
    const p = planFlightEnd(s0, barrierOf(s0, { shopkeeperHit: true, requests: [cellRequest(SHOT1, 1, CELL1)] }), ctx);
    expect(p.inFlight!.plan!.projection.ammo).toBe(0);
    const a = answerShopkeeper(p, { type: 'ANSWER_SHOPKEEPER', shotId: SHOT1, questionId: q, choice: 'A' }, ctx);
    const r = resolveExpandedShot(a, syntheticRecord(a, [], { barrierId: a.inFlight!.plan!.barrierId }), ctx);
    const st = r.state as ExpandedRunState;
    expect(st.phase).toBe('position');
    expect(st.ammo).toBe(1);
    expect(st.expansion.next.modifiers.damageMult).toBe(1.5);
    expect(st.expansion.questionCursor).toBe(1);
    expect(isAmmoBalanced(st, 10)).toBe(true);
    // without the answer's cork the run ends and the reservation is dropped
    const e = settle(plan(withCellEffect(flying(5, 9), CELL1, 'FX005'), { requests: [cellRequest(SHOT1, 1, CELL1)] }));
    expect(e.state.phase).toBe('ended');
    expect(e.summary.runEnded).toBe(true);
    expect((e.state as ExpandedRunState).expansion.next).toEqual({ modifiers: BASE_SHOT_MODIFIERS, hint: null });
    expect(isAmmoBalanced(e.state, 10)).toBe(true);
  });

  it('moves the reservation to next, clears active, and takes the question cursor only when a question was asked', () => {
    const s0 = withCellEffect(flying(6, 0, (x) => ({ ...x, expansion: { ...x.expansion, active: { modifiers: BASE_SHOT_MODIFIERS, hint: 'hpRatio' } } })), CELL1, 'FX093');
    const noQ = settle(plan(s0, { requests: [cellRequest(SHOT1, 1, CELL1)] })).state as ExpandedRunState;
    expect(noQ.expansion.active).toBeNull();
    expect(noQ.expansion.next.hint).toBe('hpRatio');
    expect(noQ.expansion.questionCursor).toBe(0);
    const withQ = settle(answerA(ask(s0))).state as ExpandedRunState;
    expect(withQ.expansion.questionCursor).toBe(1);
  });

  it('uses the plan rng and series, and replaces deferred transforms (dropping collected prizes)', () => {
    const s0 = withCellEffect(flying(7), CELL1, 'FX061');
    const s = plan(s0, { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const keep = { instanceId: iid(5), requestId: mintId.effectRequest(SHOT1, 9), candidateTypeIds: [tid('P090')] };
    const gone = { instanceId: iid(0), requestId: mintId.effectRequest(SHOT1, 8), candidateTypeIds: [tid('P091')] };
    const st = settle(s, [0], { deferredTransforms: [keep, gone] }).state as ExpandedRunState;
    expect(st.expansion.deferredTransforms).toEqual([keep]);
    expect(st.expansion.outlineSeries).toBe('SER01');
    expect(st.expansion.rng).toEqual(s.inFlight!.plan!.rng);
    const none = settle(s, [], {}).state as ExpandedRunState;
    expect(none.expansion.deferredTransforms).toEqual([]); // the record's deferred list replaces the old one
  });

  it('refills only from the assortment series while one is active', () => {
    const s0 = withCellEffect(flying(8), CELL1, 'FX059'); // SER19 light meals: P093, P094, P095
    const s = plan(s0, { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const st = settle(s, [0, 1, 2]).state as ExpandedRunState;
    expect(st.expansion.assortmentSeries).toBe('SER19');
    const fresh = st.shelf.prizes.filter((p) => Number(p.instanceId.slice(1)) > 36);
    expect(fresh).toHaveLength(3);
    for (const p of fresh) expect(['P093', 'P094', 'P095']).toContain(p.typeId);
    expect(st.shelf.prizes).toHaveLength(36);
  });

  it('puts legacy penalty plates into the ledger once each, from the plan', () => {
    const s = plan(flying(9), { requests: [deviceRequest(SHOT1, 1, 'dev-p', 'penalty', 1), deviceRequest(SHOT1, 2, 'dev-p', 'penalty', 2)] });
    const r = settle(s, [0]);
    expect(r.summary.ledger.nominalPenalty).toBe(bundle.tuning.devices.penaltyPoints);
    expect(r.summary.ledger.items.filter((i) => i.kind === 'penalty')).toHaveLength(1);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
    expect(r.state.score).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and does not mutate its input', () => {
    const s = plan(withCellEffect(flying(10), CELL1, 'FX041'), { requests: [cellRequest(SHOT1, 1, CELL1)] });
    const before = JSON.stringify(s);
    const a = settle(s, [0, 1]);
    expect(JSON.stringify(s)).toBe(before);
    expect(JSON.stringify(settle(s, [0, 1]))).toBe(JSON.stringify(a));
  });

  it('refuses an unfinished plan, a record of another barrier or shot, and rules-v1 runs', () => {
    const asking = ask(flying(11));
    expect(() => settle(asking)).toThrow(/not complete/);
    const done = plan(flying(11));
    expect(() => resolveExpandedShot(done, syntheticRecord(done, [], { barrierId: mintId.barrier(mintId.shot(2)) }), PLAN_CTX)).toThrow(/barrier/);
    expect(() => resolveExpandedShot(done, { ...syntheticRecord(done, []), shotId: mintId.shot(2) }, PLAN_CTX)).toThrow(/does not match/);
    const notPlanned = flying(11);
    expect(() => resolveExpandedShot(notPlanned, syntheticRecord(notPlanned, []), PLAN_CTX)).toThrow();
    const v1 = createRun({ runId: mintId.run('v1'), seed: 1, tuning: RELEASE_TUNING, playerName: null }, RELEASE_CATALOG);
    expect(() => resolveExpandedShot(v1, syntheticRecord(inFlight(expandedRun(1)), []), PLAN_CTX)).toThrow(/not an expanded run/);
  });
});
