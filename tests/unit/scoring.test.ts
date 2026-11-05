import { describe, expect, it } from 'vitest';
import { resolveShot } from '../../src/core/settlement';
import { finalResult } from '../../src/core/result';
import { completedSetsFor } from '../../src/catalog/sets';
import { spawnPrize } from '../../src/core/replenish';
import {
  BOOTH_LAYOUT,
  asPrizeTypeId,
  asSetId,
  isLedgerEntryConsistent,
  isOfficialRankingEligible,
  mintId,
  type DeviceActivation,
  type DeviceKind,
  type PrizeHitRecord,
  type PrizeInstanceState,
  type PrizeOutcome,
  type RunState,
  type RuntimeCatalog,
  type SetRuntimeConfig,
  type ShotRecord,
  type TuningConfig,
} from '../../src/contracts';
import { CAT, T, fired, newRun, syntheticRecord } from './helpers';

const tid = asPrizeTypeId;
const slots = BOOTH_LAYOUT.slots;

/** A catalog whose prizes all score `points` and whose sets are exactly `sets` (each worth `bonus`). */
function catalogOf(sets: readonly (readonly [string, string, string, string])[], bonus = 100, points?: number): RuntimeCatalog {
  const prizes = points === undefined ? CAT.prizes : new Map([...CAT.prizes].map(([k, v]) => [k, { ...v, baseScore: points }]));
  const m = new Map<ReturnType<typeof asSetId>, SetRuntimeConfig>();
  for (const [id, a, b, c] of sets) {
    m.set(asSetId(id), { setId: asSetId(id), requiredTypeIds: [tid(a), tid(b), tid(c)], bonusScore: bonus, hintKey: `set.${id}.hint`, valueStatus: 'prototype' });
  }
  return { ...CAT, prizes, sets: m };
}

/** Put a shelf with exactly these (type, id number) pairs in the first slots. Each call must use fresh id numbers. */
function withShelf(s: RunState, cat: RuntimeCatalog, entries: readonly (readonly [string, number])[]): RunState {
  const prizes: PrizeInstanceState[] = entries.map(([type, n], i) => spawnPrize(cat, tid(type), slots[i]!, n, 0));
  return { ...s, shelf: { prizes, deferredSlots: [], nextInstanceNumber: 9000 } };
}
const idOf = (n: number): string => mintId.instance(n);

interface Shot {
  readonly collect: readonly number[];
  readonly over?: Partial<ShotRecord>;
}
/** Fire from a position-phase state and settle a synthetic record. */
function play(s: RunState, cat: RuntimeCatalog, shot: Shot, tuning: TuningConfig = T) {
  const f = fired(s);
  const rec = syntheticRecord(
    f,
    shot.collect.map(idOf),
    shot.over,
  );
  return resolveShot(f, rec, cat, tuning);
}
const hit = (generation: number, reflectionIndex: number): PrizeHitRecord => ({ projectileId: mintId.projectile(mintId.shot(1), generation), generation, reflectionIndex, damage: 1 });
const outcome = (n: number, type: string, hits: PrizeHitRecord[]): PrizeOutcome => ({ instanceId: mintId.instance(n), typeId: tid(type), hits, collected: true, displacement: 0, endedNearEdge: false });
const act = (id: string, kind: DeviceKind): DeviceActivation => ({ deviceId: mintId.device(id), kind, projectileId: mintId.projectile(mintId.shot(1), 0) });

const SETS = [['S001', 'P001', 'P002', 'P003']] as const;
const cat1 = catalogOf(SETS, 100, 10);

describe('sets (decisions 11-14, AC20, AC21)', () => {
  it('completes across shots in any order, scoring once; collected items are not consumed', () => {
    let s = withShelf(newRun(1), cat1, [['P003', 1], ['P001', 2]]);
    let r = play(s, cat1, { collect: [1] });
    expect(r.summary.newlyCompletedSets).toEqual([]);
    s = withShelf(r.state, cat1, [['P002', 3], ['P001', 4]]);
    r = play(s, cat1, { collect: [4] }); // a second P001: 2 instances, still 1 type
    expect(r.state.collected).toHaveLength(2);
    expect(r.state.collectedTypeIds).toHaveLength(2);
    expect(r.summary.newlyCompletedSets).toEqual([]);
    s = withShelf(r.state, cat1, [['P002', 5]]);
    r = play(s, cat1, { collect: [5] });
    expect(r.summary.newlyCompletedSets).toEqual(['S001']);
    expect(r.summary.ledger.setPoints).toBe(100);
    expect(r.state.completedSets).toEqual(['S001']);
    // later collections of the same kinds never score the set again
    s = withShelf(r.state, cat1, [['P001', 6], ['P002', 7], ['P003', 8]]);
    r = play(s, cat1, { collect: [6, 7, 8] });
    expect(r.summary.newlyCompletedSets).toEqual([]);
    expect(r.summary.ledger.setPoints).toBe(0);
    expect(r.state.completedSets).toEqual(['S001']);
  });

  it('three of the same kind never substitute for three kinds', () => {
    let s = withShelf(newRun(1), cat1, [['P001', 1], ['P001', 2], ['P001', 3]]);
    const r = play(s, cat1, { collect: [1, 2, 3] });
    expect(r.state.collected).toHaveLength(3);
    expect(r.state.collectedTypeIds).toEqual(['P001']);
    expect(r.state.completedSets).toEqual([]);
    s = r.state;
  });

  it('one collected kind may complete several sets, and several sets in one shot each score once', () => {
    const cat = catalogOf([['S001', 'P001', 'P002', 'P003'], ['S002', 'P001', 'P002', 'P004'], ['S003', 'P005', 'P006', 'P007']], 50, 10);
    const s = withShelf(newRun(1), cat, [['P001', 1], ['P002', 2], ['P003', 3], ['P004', 4]]);
    const r = play(s, cat, { collect: [1, 2, 3, 4] });
    expect(r.summary.newlyCompletedSets).toEqual(['S001', 'S002']);
    expect(r.summary.ledger.setPoints).toBe(100);
    expect(r.summary.ledger.items.filter((i) => i.kind === 'set').map((i) => i.refId)).toEqual(['S001', 'S002']);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
  });

  it('completedSetsFor is pure, order-free and skips already completed sets', () => {
    const cat = catalogOf([['S001', 'P001', 'P002', 'P003'], ['S002', 'P003', 'P002', 'P009']], 10);
    expect(completedSetsFor(cat, new Set([tid('P003'), tid('P001'), tid('P002')]), [])).toEqual(['S001']);
    expect(completedSetsFor(cat, new Set([tid('P003'), tid('P001'), tid('P002')]), [asSetId('S001')])).toEqual([]);
    expect(completedSetsFor(cat, new Set([tid('P001'), tid('P002')]), [])).toEqual([]);
  });

  it('uses the kind at collection time (a transformed prize counts as its new kind)', () => {
    const s = withShelf(newRun(1), cat1, [['P009', 1], ['P002', 2], ['P003', 3]]);
    const f = fired(s);
    const rec = syntheticRecord(f, ['i0002', 'i0003']);
    const transformedCollected = { instanceId: mintId.instance(1), typeId: tid('P001') };
    const r = resolveShot(f, { ...rec, collected: [transformedCollected, ...rec.collected], remainingPrizes: rec.remainingPrizes.filter((p) => p.instanceId !== 'i0001') }, cat1, T);
    expect(r.summary.newlyCompletedSets).toEqual(['S001']);
    expect(r.state.collected[0]!.typeId).toBe('P001');
  });
});

describe('tricks (O03, prototype)', () => {
  const sc = T.scoring;
  it('chain bonus per extra prize in the same shot; maxChain counts instances (decision 29)', () => {
    const cat = catalogOf([], 0, 10);
    const s = withShelf(newRun(1), cat, [['P001', 1], ['P002', 2], ['P003', 3]]);
    const r = play(s, cat, { collect: [1, 2, 3] });
    expect(r.summary.chainCount).toBe(3);
    expect(r.summary.ledger.trickPoints).toBe(2 * sc.chainBonusPerExtraPrize);
    expect(r.state.maxChain).toBe(3);
    const r2 = play(withShelf(r.state, cat, [['P004', 4]]), cat, { collect: [4] });
    expect(r2.summary.ledger.trickPoints).toBe(0);
    expect(r2.state.maxChain).toBe(3); // max over shots
  });

  it('reflection and split collect bonuses depend on the hits of the collected prize', () => {
    const cat = catalogOf([], 0, 10);
    const s = withShelf(newRun(1), cat, [['P001', 1], ['P002', 2], ['P003', 3]]);
    const r = play(s, cat, {
      collect: [1, 2, 3],
      over: {
        prizeOutcomes: [outcome(1, 'P001', [hit(0, 0)]), outcome(2, 'P002', [hit(0, 1)]), outcome(3, 'P003', [hit(1, 2)])],
      },
    });
    const refs = r.summary.ledger.items.filter((i) => i.kind === 'trick').map((i) => i.refId);
    expect(refs).toContain('reflection:i0002');
    expect(refs).toContain('reflection:i0003');
    expect(refs).toContain('split:i0003');
    expect(refs).not.toContain('reflection:i0001');
    expect(refs).not.toContain('split:i0002');
    expect(r.summary.ledger.trickPoints).toBe(2 * sc.chainBonusPerExtraPrize + 2 * sc.reflectionCollectBonus + sc.splitCollectBonus);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
  });

  it('tricks are paid only for prizes collected in this shot', () => {
    const cat = catalogOf([], 0, 10);
    const s = withShelf(newRun(1), cat, [['P001', 1], ['P002', 2]]);
    const r = play(s, cat, { collect: [1], over: { prizeOutcomes: [outcome(2, 'P002', [hit(1, 1)])] } });
    expect(r.summary.ledger.trickPoints).toBe(0);
  });
});

describe('first hits (decision 18)', () => {
  const cat = catalogOf([], 0, 10);
  it('score once per run per part/target; reactions may repeat; repeats inside one shot count once', () => {
    let s = withShelf(newRun(1), cat, [['P001', 1]]);
    let r = play(s, cat, { collect: [], over: { firstHitCandidates: ['shopkeeper:hat', 'shopkeeper:hat', 'hidden:hidden-cat'] } });
    expect(r.summary.ledger.firstHitPoints).toBe(T.scoring.shopkeeperPoints.hat + T.scoring.hiddenTargetPoints);
    expect(r.state.firstHitsScored).toEqual(['shopkeeper:hat', 'hidden:hidden-cat']);
    s = withShelf(r.state, cat, [['P001', 2]]);
    r = play(s, cat, { collect: [], over: { firstHitCandidates: ['shopkeeper:hat', 'shopkeeper:fan'] } });
    expect(r.summary.ledger.firstHitPoints).toBe(T.scoring.shopkeeperPoints.fan);
    expect(r.state.firstHitsScored).toHaveLength(3);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
    expect(r.summary.ledger.items.map((i) => [i.kind, i.refId])).toEqual([['shopkeeper', 'fan']]);
  });
});

describe('ledger (decision 28, AC24)', () => {
  const pen100: TuningConfig = { ...T, devices: { ...T.devices, penaltyPoints: 100 } };
  const cat = catalogOf([], 0, 20);

  it('combines gains and nominal penalty, then floors at 0: 50 + 20 - 100 -> 0 (applied 70), then +30 -> 30', () => {
    const s0 = { ...withShelf(newRun(1), cat, [['P001', 1]]), score: 50 };
    const r = play(s0, cat, { collect: [1], over: { deviceActivations: [act('dev-penalty-1', 'penalty')] } }, pen100);
    const e = r.summary.ledger;
    expect([e.scoreBefore, e.prizePoints, e.nominalPenalty, e.appliedPenalty, e.scoreAfter]).toEqual([50, 20, 100, 70, 0]);
    expect(isLedgerEntryConsistent(e)).toBe(true);
    expect(r.state.score).toBe(0);
    const cat30 = catalogOf([], 0, 30);
    const r2 = play(withShelf(r.state, cat30, [['P002', 2]]), cat30, { collect: [2] }, pen100);
    expect(r2.summary.ledger.scoreAfter).toBe(30); // nothing carried over
    expect(r2.summary.ledger.appliedPenalty).toBe(0);
  });

  it('a penalty with enough score is applied in full and shown as a penalty item', () => {
    const s0 = { ...withShelf(newRun(1), cat, [['P001', 1]]), score: 200 };
    const r = play(s0, cat, { collect: [], over: { deviceActivations: [act('dev-penalty-1', 'penalty')] } });
    const e = r.summary.ledger;
    expect([e.nominalPenalty, e.appliedPenalty, e.scoreAfter]).toEqual([T.devices.penaltyPoints, T.devices.penaltyPoints, 200 - T.devices.penaltyPoints]);
    expect(e.items).toEqual([{ kind: 'penalty', refId: 'dev-penalty-1', points: T.devices.penaltyPoints }]);
  });

  it('score never goes negative from a zero start, and every entry in a long run is consistent', () => {
    const s0 = withShelf(newRun(1), cat, [['P001', 1]]);
    const r = play(s0, cat, { collect: [], over: { deviceActivations: [act('dev-penalty-1', 'penalty')] } });
    expect(r.state.score).toBe(0);
    expect(r.summary.ledger.appliedPenalty).toBe(0);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
  });
});

describe('same instance is scored once (AC09)', () => {
  const cat = catalogOf([], 0, 10);
  it('a duplicate collection entry in one record and a replay in a later shot add nothing', () => {
    const s = withShelf(newRun(1), cat, [['P001', 1], ['P002', 2]]);
    const f = fired(s);
    const rec = syntheticRecord(f, ['i0001']);
    const dup = { ...rec, collected: [...rec.collected, ...rec.collected] };
    const r = resolveShot(f, dup, cat, T);
    expect(r.state.collected).toHaveLength(1);
    expect(r.summary.ledger.prizePoints).toBe(10);
    expect(r.summary.chainCount).toBe(1);
    const s2 = withShelf(r.state, cat, [['P003', 3]]);
    const f2 = fired(s2);
    const rec2 = { ...syntheticRecord(f2, ['i0003']), collected: [{ instanceId: mintId.instance(1), typeId: tid('P001') }, { instanceId: mintId.instance(3), typeId: tid('P003') }] };
    const r2 = resolveShot(f2, rec2, cat, T);
    expect(r2.state.collected.map((c) => c.instanceId)).toEqual(['i0001', 'i0003']);
    expect(r2.summary.ledger.prizePoints).toBe(10);
  });
});

describe('ammo, devices and the end of the run (AC15, AC17, AC18, AC42)', () => {
  const cat = catalogOf([], 0, 10);
  it('split never changes ammo or shots fired (AC15)', () => {
    const s = withShelf(newRun(1), cat, [['P001', 1]]);
    const f = fired(s);
    const r = resolveShot(f, syntheticRecord(f, [], { deviceActivations: [act('dev-split-1', 'split')] }), cat, T);
    expect(r.summary.ammoAfter).toBe(9);
    expect(r.state.ammo).toBe(9);
    expect(r.state.shotsFired).toBe(1);
    expect(r.summary.bonusAmmoRequested).toBe(0);
    expect(r.summary.devicesActivated).toEqual(['dev-split-1']);
  });

  it('bonus ammo: cumulative 8 -> +2 -> 10 -> a further +2 grants 0 (AC17)', () => {
    const base = { ...withShelf(newRun(1), cat, [['P001', 1]]), bonusAmmoTotal: 8, ammo: 5 };
    const r = play(base, cat, { collect: [], over: { deviceActivations: [act('dev-ammo-1', 'ammo')] } });
    expect([r.summary.bonusAmmoRequested, r.summary.bonusAmmoGranted]).toEqual([2, 2]);
    expect(r.state.bonusAmmoTotal).toBe(10);
    expect(r.state.ammo).toBe(5 - 1 + 2);
    const r2 = play({ ...withShelf(r.state, cat, [['P001', 2]]) }, cat, { collect: [], over: { deviceActivations: [act('dev-ammo-1', 'ammo')] } });
    expect([r2.summary.bonusAmmoRequested, r2.summary.bonusAmmoGranted]).toEqual([2, 0]);
    expect(r2.state.bonusAmmoTotal).toBe(10);
  });

  it('shots fired never exceed 20 even when every shot earns the bonus', () => {
    let s = withShelf(newRun(1), cat, [['P001', 1]]);
    let n = 10;
    let guard = 0;
    while (s.phase !== 'ended' && guard++ < 40) {
      s = withShelf(s, cat, [['P001', (n += 1)]]);
      s = play(s, cat, { collect: [], over: { deviceActivations: [act('dev-ammo-1', 'ammo')] } }).state;
    }
    expect(s.phase).toBe('ended');
    expect(s.shotsFired).toBe(20);
    expect(s.bonusAmmoTotal).toBe(10);
    expect(s.ammo).toBe(0);
    expect(s.ledger).toHaveLength(20);
  });

  it('the last shot that earns +2 continues (AC18); one that does not, ends', () => {
    const last = { ...withShelf(newRun(1), cat, [['P001', 1]]), ammo: 1, shotsFired: 9 };
    const cont = play(last, cat, { collect: [], over: { deviceActivations: [act('dev-ammo-1', 'ammo')] } });
    expect(cont.summary.runEnded).toBe(false);
    expect(cont.state.phase).toBe('position');
    expect(cont.state.ammo).toBe(2);
    const end = play(last, cat, { collect: [] });
    expect(end.summary.runEnded).toBe(true);
    expect(end.state.phase).toBe('ended');
  });

  it('AC42: last shot -> split -> ammo +2 -> collect -> two sets -> the run continues and everything is in the result', () => {
    const cat2 = catalogOf([['S001', 'P001', 'P002', 'P003'], ['S002', 'P001', 'P002', 'P004']], 50, 10);
    const last = { ...withShelf(newRun(1), cat2, [['P001', 1], ['P002', 2], ['P003', 3], ['P004', 4]]), ammo: 1, shotsFired: 9 };
    const r = play(last, cat2, {
      collect: [1, 2, 3, 4],
      over: {
        deviceActivations: [act('dev-split-1', 'split'), act('dev-ammo-1', 'ammo')],
        prizeOutcomes: [outcome(1, 'P001', [hit(1, 1)]), outcome(2, 'P002', []), outcome(3, 'P003', []), outcome(4, 'P004', [])],
      },
    });
    expect(r.summary.runEnded).toBe(false);
    expect(r.state.ammo).toBe(2);
    expect(r.summary.newlyCompletedSets).toEqual(['S001', 'S002']);
    expect(r.state.completedSets).toEqual(['S001', 'S002']);
    expect(r.summary.ledger.setPoints).toBe(100);
    expect(r.summary.chainCount).toBe(4);
    expect(r.state.collected).toHaveLength(4);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
    // the next (final) shot ends the run and the result carries everything
    let s = withShelf(r.state, cat2, [['P001', 20]]);
    s = play(s, cat2, { collect: [] }).state;
    s = withShelf(s, cat2, [['P001', 21]]);
    s = play(s, cat2, { collect: [] }).state;
    expect(s.phase).toBe('ended');
    const res = finalResult(s);
    expect(res.status).toBe('completed');
    expect(res.completedSets).toEqual(['S001', 'S002']);
    expect(res.collected).toHaveLength(4);
    expect(res.score).toBe(s.score);
  });

  it('bullet type device changes only the next shot (cycle), then it returns to standard', () => {
    const s = withShelf(newRun(1), cat, [['P001', 1]]);
    const r = play(s, cat, { collect: [], over: { deviceActivations: [act('dev-bullet-1', 'bulletType')] } });
    expect(r.state.bulletType).toBe('heavy');
    const r2 = play(withShelf(r.state, cat, [['P001', 2]]), cat, { collect: [] });
    expect(r2.state.bulletType).toBe('standard');
  });

  it('transform events pass through to the summary', () => {
    const s = withShelf(newRun(1), cat, [['P001', 1]]);
    const ev = { type: 'prizeTransformed' as const, eventId: mintId.event(mintId.shot(1), 1), shotId: mintId.shot(1), instanceId: mintId.instance(1), fromTypeId: tid('P001'), toTypeId: tid('P005'), hpBefore: 2, maxHpBefore: 8, hpAfter: 5, maxHpAfter: 20 };
    const r = play(s, cat, { collect: [], over: { transforms: [ev] } });
    expect(r.summary.transforms).toEqual([ev]);
  });
});

describe('finalResult', () => {
  it('reports completed / abandoned runs and rejects a run still in progress', () => {
    const s = newRun(1);
    expect(() => finalResult(s)).toThrow();
    const ended: RunState = { ...s, phase: 'ended', score: 40 };
    const res = finalResult(ended);
    expect(res.status).toBe('completed');
    expect(res.score).toBe(40);
    expect(res.valueStatus).toBe('prototype');
    expect(isOfficialRankingEligible(res)).toBe(false); // prototype values never reach the official ranking
    const ab = finalResult({ ...s, phase: 'abandoned' });
    expect(ab.status).toBe('abandoned');
    expect(isOfficialRankingEligible({ ...ab, valueStatus: 'approved', playerName: 'x' })).toBe(false);
  });
});

