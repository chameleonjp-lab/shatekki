/**
 * Plan T2/T3/T4b: the ammo rewards A1-A10 on the real run start, rules entry and settlement.
 * Prototype values from data/expansion-v2/rewards.json (r002 trial: A1, A5; r003 full: all ten).
 */
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { CORE_RULES } from '../../src/app/rules';
import type { RulesContext } from '../../src/app/controller';
import { createExpandedRun } from '../../src/core/expanded-run';
import { planFlightEnd } from '../../src/core/effect-plan';
import { resolveExpandedShot } from '../../src/core/expanded-settlement';
import { validateRunState } from '../../src/core/session';
import {
  BAG_COLUMNS,
  TARGET_AIM,
  TARGET_Z,
  bestShotOf,
  placeBag,
  targetGeometryAt,
  targetOffer,
} from '../../src/core/rewards';
import {
  aimDirection,
  asPrizeTypeId,
  isAmmoBalanced,
  mintId,
  slotRowColumn,
  type ExpandedRunState,
  type GameCommand,
  type GameplayBundle,
  type PrizeInstanceState,
  type RewardContacts,
  type RunState,
  type ShotRecord,
} from '../../src/contracts';
import { syntheticRecord } from './helpers';
import { barrierOf, cellRequest, deviceRequest } from './expanded-helpers';

const full = getGameplayBundle('expanded-full');
const trial = getGameplayBundle('expanded-trial');
const ctxOf = (b: GameplayBundle): RulesContext => ({ tuning: b.tuning, catalog: b.catalog, layout: b.layout, expansion: b.expansion });
const planCtx = (b: GameplayBundle) => ({ tuning: b.tuning, catalog: b.catalog, layout: b.layout, expansion: b.expansion! });

function start(b: GameplayBundle, seed = 7): ExpandedRunState {
  return createExpandedRun({ runId: mintId.run('run-rewards'), seed, tuning: b.tuning, playerName: null }, { catalog: b.catalog, tuning: b.tuning, layout: b.layout, expansion: b.expansion! });
}
const send = (b: GameplayBundle, s: RunState, c: GameCommand): ExpandedRunState => CORE_RULES.reduceGame(s, c, ctxOf(b)) as ExpandedRunState;

/** Set the run to `ammo` corks left with `bonus` already added (balanced), phase position. */
function at(s: ExpandedRunState, ammo: number, bonus: number): ExpandedRunState {
  const shots = 10 + bonus - ammo;
  return { ...s, ammo, bonusAmmoTotal: bonus, shotsFired: shots, ledger: Array.from({ length: shots }, (_, i) => ({ shotId: mintId.shot(i + 1), scoreBefore: 0, prizePoints: 0, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0, appliedPenalty: 0, scoreAfter: 0, items: [] })) };
}

function fire(b: GameplayBundle, s: ExpandedRunState): ExpandedRunState {
  const loading = send(b, s, { type: 'CONFIRM_POSITION' });
  const aiming = send(b, loading, { type: 'STOP_LOAD' });
  return send(b, aiming, { type: 'FIRE' });
}

/** Plan the barrier (with optional requests) and confirm the shot with what the sim reported. */
function settleShot(b: GameplayBundle, flying: ExpandedRunState, opts: { collect?: readonly string[]; contacts?: Partial<RewardContacts>; requests?: ReturnType<typeof deviceRequest>[]; record?: Partial<ShotRecord> } = {}) {
  const planned = planFlightEnd(flying, barrierOf(flying, { requests: opts.requests ?? [] }), planCtx(b)) as ExpandedRunState;
  const contacts: RewardContacts = { targetHit: null, chimeAfterReflection: false, seesawInstances: [], piggyDeposit: false, ...opts.contacts };
  const rec = syntheticRecord(planned, opts.collect ?? [], { barrierId: planned.inFlight!.plan!.barrierId, rewardContacts: contacts, ...opts.record });
  return resolveExpandedShot(planned, rec, planCtx(b));
}

const bagOf = (s: ExpandedRunState) => s.expansion.rewards!.bag!.instanceId;
const notBag = (s: ExpandedRunState, n = 1) => s.shelf.prizes.filter((p) => p.instanceId !== bagOf(s)).slice(0, n).map((p) => p.instanceId);

describe('rules versions (plan T2)', () => {
  it('keeps r001 untouched and gives the trial and full versions their own rules numbers', () => {
    expect(getGameplayBundle('expanded-proposed').catalog.rulesVersion).toBe('rules-v2-proposed-r001');
    expect(getGameplayBundle('expanded-proposed').expansion!.profile.rewards).toBeUndefined();
    expect(trial.catalog.rulesVersion).toBe('rules-v2-proposed-r002');
    expect(trial.expansion!.profile.rewards!.enabled).toEqual(['A1', 'A5']);
    expect(full.catalog.rulesVersion).toBe('rules-v2-proposed-r003');
    expect(full.expansion!.profile.rewards!.enabled).toHaveLength(10);
    expect(start(getGameplayBundle('expanded-proposed')).expansion.rewards).toBeUndefined();
  });
});

describe('A1 bag', () => {
  it('ties the bag to the easiest front-center prize of the starting shelf', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = start(trial, seed);
      const bag = s.shelf.prizes.find((p) => p.instanceId === bagOf(s))!;
      const rc = slotRowColumn(bag.homeSlot)!;
      expect(rc.row, `seed ${seed}`).toBe(3);
      expect(BAG_COLUMNS).toContain(rc.column);
      const front = s.shelf.prizes.filter((p) => slotRowColumn(p.homeSlot)!.row === 3 && BAG_COLUMNS.includes(slotRowColumn(p.homeSlot)!.column));
      expect(bag.maxHp).toBe(Math.min(...front.map((p) => p.maxHp)));
    }
  });

  it('swaps once with the reserved slot when no front-center prize was drawn: counts, kinds and the draw stay', () => {
    const s = start(trial, 3);
    const without = { ...s.shelf, prizes: s.shelf.prizes.filter((p) => !(slotRowColumn(p.homeSlot)!.row === 3 && BAG_COLUMNS.includes(slotRowColumn(p.homeSlot)!.column))) };
    const placed = placeBag(without, trial.catalog, trial.layout);
    expect(placed.shelf.prizes).toHaveLength(without.prizes.length);
    expect(placed.shelf.prizes.map((p) => p.typeId).sort()).toEqual(without.prizes.map((p) => p.typeId).sort());
    const bag = placed.shelf.prizes.find((p) => p.instanceId === placed.instanceId)!;
    expect(bag.homeSlot).toBe('slot-r3-c06');
  });

  it('pays +2 when that very instance is won, once; a refill never carries the bag', () => {
    const s = fire(trial, start(trial));
    const r = settleShot(trial, s, { collect: [bagOf(s)] });
    const st = r.state as ExpandedRunState;
    expect(r.summary.rewards).toEqual([{ id: 'A1', key: `bag:${bagOf(s)}`, shotNumber: 1, offered: 2, granted: 2 }]);
    expect(st.ammo).toBe(11);
    expect(st.bonusAmmoTotal).toBe(2);
    expect(isAmmoBalanced(st, 10)).toBe(true);
    expect(st.expansion.rewards!.bag!.used).toBe(true);
    // the refilled prize in the same slot has no bag
    const again = settleShot(trial, fire(trial, st), { collect: notBag(st) });
    expect(again.summary.rewards).toEqual([]);
  });
});

describe('A5 last-shot target', () => {
  it('appears only with one cork left, and offers what the room allows (room 0/1/2/3)', () => {
    const s = start(trial);
    expect(targetOffer(at(s, 2, 0), trial.expansion!.profile.rewards!, trial.tuning)).toBeNull();
    expect(targetOffer(at(s, 1, 10), trial.expansion!.profile.rewards!, trial.tuning)).toBeNull();
    expect(targetOffer(at(s, 1, 9), trial.expansion!.profile.rewards!, trial.tuning)).toEqual({ outer: 1, center: 1 });
    expect(targetOffer(at(s, 1, 8), trial.expansion!.profile.rewards!, trial.tuning)).toEqual({ outer: 1, center: 2 });
    expect(targetOffer(at(s, 1, 7), trial.expansion!.profile.rewards!, trial.tuning)).toEqual({ outer: 1, center: 3 });
  });

  it('is fixed when the stand is confirmed and used by that FIRE', () => {
    const s = send(trial, at(start(trial), 1, 0), { type: 'SET_POSITION', x: 1.1 });
    const loading = send(trial, s, { type: 'CONFIRM_POSITION' });
    const t = loading.expansion.rewards!.target!;
    expect(t.forShot).toBe(10);
    expect(t.geometry).toEqual(targetGeometryAt(trial.layout, trial.tuning, 1.1));
    expect(t.offered).toEqual({ outer: 1, center: 3 });
    const flying = send(trial, send(trial, loading, { type: 'STOP_LOAD' }), { type: 'FIRE' });
    expect(flying.expansion.rewards!.targetUsed).toBe(true);
    expect(flying.expansion.rewards!.target).toEqual(t);
  });

  it('missing the target but winning the bag gives +2 and the game goes on; missing both ends it', () => {
    const base = at(start(trial), 1, 0);
    const flying = fire(trial, base);
    const bagWin = settleShot(trial, flying, { collect: [bagOf(base)] });
    expect(bagWin.state.phase).toBe('position');
    expect(bagWin.state.ammo).toBe(2);
    expect(bagWin.summary.runEnded).toBe(false);
    const st = bagWin.state as ExpandedRunState;
    expect(st.expansion.rewards!.target).toBeNull();
    // back to one cork later: the target never comes back in this game
    const later = { ...st, ammo: 1, shotsFired: st.shotsFired + 1, ledger: [...st.ledger, { ...st.ledger.at(-1)!, shotId: mintId.shot(st.shotsFired + 1), scoreBefore: st.score, scoreAfter: st.score, prizePoints: 0, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0, appliedPenalty: 0, items: [] }] } as ExpandedRunState;
    expect(targetOffer(later, trial.expansion!.profile.rewards!, trial.tuning)).toBeNull();

    const bothMiss = settleShot(trial, flying, { collect: notBag(base) });
    expect(bothMiss.state.phase).toBe('ended');
    expect(bothMiss.state.ammo).toBe(0);
    expect(bothMiss.summary.rewards).toEqual([]);
  });

  it('center pays the offered amount; outer pays its own; with room 2 the center shows and pays 2', () => {
    const center = settleShot(trial, fire(trial, at(start(trial), 1, 8)), { contacts: { targetHit: 'center' } });
    expect(center.summary.rewards).toEqual([{ id: 'A5', key: 'target:center', shotNumber: 18, offered: 2, granted: 2 }]);
    expect(center.state.ammo).toBe(2);
    const outer = settleShot(trial, fire(trial, at(start(trial), 1, 0)), { contacts: { targetHit: 'outer' } });
    expect(outer.summary.rewards![0]).toMatchObject({ id: 'A5', key: 'target:outer', offered: 1, granted: 1 });
  });

  it('when a +2 plate of the same shot already used the room, the target shows its offer but pays 0', () => {
    const flying = fire(trial, at(start(trial), 1, 8));
    const r = settleShot(trial, flying, { contacts: { targetHit: 'center' }, requests: [deviceRequest(flying.inFlight!.shotId, 1, 'dev-ammo-1', 'ammo')] });
    const plate = r.summary.effects!.find((e) => e.source.kind === 'device')!;
    expect(plate.ammoDelta).toBe(2);
    expect(r.summary.rewards).toEqual([{ id: 'A5', key: 'target:center', shotNumber: 18, offered: 2, granted: 0 }]);
    expect(r.state.ammo).toBe(2);
    expect(r.state.bonusAmmoTotal).toBe(10);
    expect(isAmmoBalanced(r.state, 10)).toBe(true);
  });
});

describe('the plan example: 1 cork left, 9 already added; old +2 plate, A1 and A7 in one shot', () => {
  it('the plate takes the last room (+1), A1 and A7 give 0, the game goes on with 1 cork', () => {
    const base = at(start(full), 1, 9);
    const flying = fire(full, base);
    const r = settleShot(full, flying, { collect: [bagOf(base), ...notBag(base)], requests: [deviceRequest(flying.inFlight!.shotId, 1, 'dev-ammo-1', 'ammo')] });
    expect(r.summary.effects!.find((e) => e.source.kind === 'device')).toMatchObject({ ammoDelta: 1, ammoRequested: 2 });
    expect(r.summary.rewards!.map((o) => [o.id, o.offered, o.granted])).toEqual([
      ['A1', 2, 0],
      ['A6', 2, 0],
      ['A7', 1, 0],
    ]);
    expect(r.state.ammo).toBe(1);
    expect(r.state.phase).toBe('position');
    expect(r.state.bonusAmmoTotal).toBe(10);
    expect(isAmmoBalanced(r.state, 10)).toBe(true);
    // met and used: nothing is owed later
    const st = r.state as ExpandedRunState;
    expect(st.expansion.rewards!.bag!.used).toBe(true);
    expect(st.expansion.rewards!.stampsReached).toEqual([2]);
  });
});

describe('next-shot reservation on the last cork', () => {
  it('stays only when a reward keeps the game going', () => {
    const cell = 'cell-r1-c01' as never;
    const withFast = (s: ExpandedRunState) => ({ ...s, expansion: { ...s.expansion, cells: s.expansion.cells.map((c) => (c.cellId === cell ? { ...c, effectId: 'FX011' as never } : c)) } });
    const base = withFast(at(start(trial), 1, 0));
    const flying = fire(trial, base);
    const req = [cellRequest(flying.inFlight!.shotId, 1, cell)];
    const kept = settleShot(trial, flying, { collect: [bagOf(base)], requests: req }).state as ExpandedRunState;
    expect(kept.expansion.next.modifiers.speedMult).toBeGreaterThan(1);
    const dropped = settleShot(trial, flying, { collect: [], requests: req }).state as ExpandedRunState;
    expect(dropped.phase).toBe('ended');
    expect(dropped.expansion.next.modifiers.speedMult).toBe(1);
  });
});

describe('A6, A7, A8 (plan T4b)', () => {
  it('one shot from 1 prize to 4: A6 once (2), A7 once (+2 for 3 or more)', () => {
    const s0 = start(full, 11);
    const first = settleShot(full, fire(full, s0), { collect: notBag(s0) }).state as ExpandedRunState;
    expect(first.collected).toHaveLength(1);
    const r = settleShot(full, fire(full, first), { collect: notBag(first, 3) });
    expect(r.summary.rewards!.filter((o) => o.id === 'A6').map((o) => o.key)).toEqual(['stamp:2']);
    expect(r.summary.rewards!.filter((o) => o.id === 'A7')).toEqual([{ id: 'A7', key: 'multi:3', shotNumber: 2, offered: 2, granted: 2 }]);
  });

  it('a pair and a three-kind set completed together pay one voucher: +2', () => {
    const s0 = start(full, 12);
    // shelf kinds: PAIR001 = P001 + P002; S001 needs three kinds from its config
    const s001 = full.catalog.sets.get('S001' as never)!.requiredTypeIds;
    const kinds = ['P001', 'P002', ...s001];
    const prizes = s0.shelf.prizes.map((p, i): PrizeInstanceState => (i < kinds.length && p.instanceId !== bagOf(s0) ? { ...p, typeId: asPrizeTypeId(kinds[i]!), drawnTypeId: asPrizeTypeId(kinds[i]!) } : p));
    const s = { ...s0, shelf: { ...s0.shelf, prizes } };
    const ids = s.shelf.prizes.slice(0, kinds.length).filter((p) => p.instanceId !== bagOf(s0)).map((p) => p.instanceId);
    const r = settleShot(full, fire(full, s), { collect: ids });
    expect(r.summary.newlyCompletedSets.length).toBeGreaterThanOrEqual(2);
    const vouchers = r.summary.rewards!.filter((o) => o.id === 'A8');
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0]!.offered).toBe(2);
  });
});

describe('A9 order (= E2)', () => {
  it('is offered before the first shot; met on the 3rd shot pays +2; a 4th shot is too late', () => {
    const s0 = start(full, 13);
    const order = s0.expansion.rewards!.order!;
    expect(order.status).toBe('offered');
    expect(s0.shelf.prizes.some((p) => p.typeId === order.typeId)).toBe(true);
    const accepted = send(full, s0, { type: 'ORDER', accept: true });
    expect(accepted.expansion.rewards!.order!.status).toBe('accepted');
    // a second answer is ignored
    expect(send(full, accepted, { type: 'ORDER', accept: false })).toBe(accepted);
    const miss = (s: ExpandedRunState) => settleShot(full, fire(full, s), { collect: [] }).state as ExpandedRunState;
    const s2 = miss(miss(accepted));
    const ofKind = s2.shelf.prizes.find((p) => p.typeId === order.typeId)!.instanceId;
    const met = settleShot(full, fire(full, s2), { collect: [ofKind] });
    expect(met.summary.rewards!.find((o) => o.id === 'A9')).toMatchObject({ offered: 2, granted: 2, shotNumber: 3 });
    expect((met.state as ExpandedRunState).expansion.rewards!.order).toMatchObject({ status: 'done', doneOnShot: 3 });

    const s3 = miss(s2);
    expect(s3.expansion.rewards!.order!.status).toBe('expired');
    const late = s3.shelf.prizes.find((p) => p.typeId === order.typeId);
    if (late) expect(settleShot(full, fire(full, s3), { collect: [late.instanceId] }).summary.rewards!.some((o) => o.id === 'A9')).toBe(false);
  });

  it('an order not answered before the first shot is declined, with no penalty', () => {
    const s = settleShot(full, fire(full, start(full, 14)), { collect: [] }).state as ExpandedRunState;
    expect(s.expansion.rewards!.order!.status).toBe('declined');
    expect(s.score).toBe(0);
    expect(send(full, s, { type: 'ORDER', accept: true })).toBe(s);
  });
});

describe('A10 lanterns', () => {
  it('lights a zone by the slot a prize first stood in (4|5 and 8|9 borders), pays +3 once all three are lit', () => {
    const s0 = start(full, 15);
    const inCol = (s: ExpandedRunState, col: number) => s.shelf.prizes.find((p) => slotRowColumn(p.homeSlot)!.column === col && p.instanceId !== bagOf(s0))!.instanceId;
    const a = settleShot(full, fire(full, s0), { collect: [inCol(s0, 4)] }).state as ExpandedRunState;
    expect(a.expansion.rewards!.lanternsLit).toEqual([0]);
    const b = settleShot(full, fire(full, a), { collect: [inCol(a, 9)] }).state as ExpandedRunState;
    expect(b.expansion.rewards!.lanternsLit).toEqual([0, 2]);
    const c = settleShot(full, fire(full, b), { collect: [inCol(b, 5)] });
    expect((c.state as ExpandedRunState).expansion.rewards!.lanternsLit).toEqual([0, 1, 2]);
    expect(c.summary.rewards!.find((o) => o.id === 'A10')).toMatchObject({ offered: 3, granted: 3 });
  });
});

describe('target geometry (A5, both stand ends)', () => {
  it('sits on a reachable aim at the left end, the center and the right end', () => {
    const cam = trial.layout.camera;
    expect(Math.abs(TARGET_AIM.yaw)).toBeLessThan(cam.yawLimit);
    expect(TARGET_AIM.pitch).toBeGreaterThan(cam.pitchMin);
    for (const x of [cam.standMinX, 0, cam.standMaxX]) {
      const g = targetGeometryAt(trial.layout, trial.tuning, x);
      expect(g.center.z).toBeCloseTo(TARGET_Z, 6);
      // in front of the bottom board and above the floor, near the stand
      expect(g.center.y).toBeGreaterThan(0.6);
      expect(g.center.y).toBeLessThan(1.3);
      expect(Math.abs(g.center.x - x)).toBeLessThan(0.3);
      expect(aimDirection(trial.layout, x, TARGET_AIM).z).toBeLessThan(0);
    }
  });
});

describe('saves, E1 best shot', () => {
  it('a confirmed run with rewards passes the save check; a reward paid twice does not', () => {
    const s = start(trial);
    const r = settleShot(trial, fire(trial, s), { collect: [bagOf(s)] }).state as ExpandedRunState;
    expect(validateRunState(r, trial.catalog, trial.tuning, trial.layout, trial.expansion)).toBeNull();
    const rw = r.expansion.rewards!;
    const forged = { ...r, expansion: { ...r.expansion, rewards: { ...rw, outcomes: [...rw.outcomes, rw.outcomes[0]!] } } };
    expect(validateRunState(forged, trial.catalog, trial.tuning, trial.layout, trial.expansion)).toBe('a reward was paid twice');
    const r001 = getGameplayBundle('expanded-proposed');
    expect(validateRunState(r, r001.catalog, r001.tuning, r001.layout, r001.expansion)).not.toBeNull();
  });

  it('best shot: most prizes, then most points really added, then the earlier shot; none when nothing was won', () => {
    const e = (n: number, before: number, after: number, sets = 0) => ({ shotId: `s${String(n).padStart(2, '0')}`, scoreBefore: before, scoreAfter: after, items: Array.from({ length: sets }, () => ({ kind: 'set' })) });
    const c = (n: number, k: number) => Array.from({ length: k }, () => ({ shotId: `s${String(n).padStart(2, '0')}` }));
    expect(bestShotOf({ ledger: [e(1, 0, 0), e(2, 0, 0)], collected: [] })).toBeNull();
    expect(bestShotOf({ ledger: [e(1, 0, 30), e(2, 30, 90, 1), e(3, 90, 140)], collected: [...c(1, 2), ...c(2, 2), ...c(3, 1)] })).toEqual({ shotNumber: 2, prizes: 2, points: 60, sets: 1 });
    expect(bestShotOf({ ledger: [e(1, 0, 40), e(2, 40, 80)], collected: [...c(1, 1), ...c(2, 1)] })!.shotNumber).toBe(1);
  });
});
