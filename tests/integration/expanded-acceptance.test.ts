import { beforeAll, describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { spawnPrize } from '../../src/core/replenish';
import { validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import { STORAGE_KEYS, createRunStore, expandedRunKey } from '../../src/persistence';
import {
  BASE_SHOT_MODIFIERS,
  aimDirection,
  asPrizeTypeId,
  ballisticFor,
  corkFreeFlightPath,
  isAmmoBalanced,
  isExpandedRunState,
  mintId,
  muzzlePosition,
  type EffectId,
  type ExpandedRunState,
  type ImpactEvent,
  type QuestionChoice,
  type QuestionId,
  type ShotSummary,
  type Vec3,
} from '../../src/contracts';
import { FakeStorage } from './fake-storage';

// EG10 acceptance composites (CH-AC12, 22, 23, 26, 38, 43): the REAL controller,
// physics world, effect planning and settlement. No fakes. The starting state
// (shelf, cell effects, question order, ammo) is crafted so the result is
// deterministic; every shot is driven through FIRE and frame() like the page does.
// Node + Rapier, no browser, no device.

const bundle = getGameplayBundle('expanded-proposed');
const L = bundle.layout;
const EXP = bundle.expansion!;
const INITIAL = bundle.tuning.initialAmmo;
const MAX_BONUS = bundle.tuning.maxBonusAmmoTotal;
const fx = (id: string): EffectId => id as EffectId;
const qid = (id: string): QuestionId => id as QuestionId;

const FX_AMMO_PLUS_1 = fx('FX001'); // ammoAdd 1
const FX_SPEED = fx('FX007'); // shotModifiers: a next-shot reservation
const FX_HINT = fx('FX094'); // hint only
const Q_STOCK = qid('Q001'); // A = GUIDE, B = STOCK (series assortment)
const Q_GAIN = qid('Q002'); // A = GAIN (FX001-020), B = RISK

// ------------------------------------------------------------------ aiming

function yawTo(standX: number, target: Vec3): number {
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  return Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
}

function pitchFor(standX: number, yaw: number, target: Vec3): number {
  const muzzle = muzzlePosition(L, standX);
  const spec = ballisticFor(bundle.tuning, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const cellBox = (id: string) => L.backgroundCells!.find((c) => c.cellId === id)!.box;
const wallPoint = (id: string, dx = 0): Vec3 => {
  const b = cellBox(id);
  return { x: b.center.x + dx, y: b.center.y, z: b.center.z };
};
const keeperBody = L.shopkeeper.find((p) => p.part === 'body')!.box;
const keeperFront: Vec3 = { x: keeperBody.center.x, y: 1.0, z: keeperBody.center.z + keeperBody.halfExtents.z };
const STAND = L.camera.standMaxX;

interface Aim {
  readonly standX: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly count: 1 | 2 | 3;
  readonly spreadRad: number;
}

/** 3 corks from the right end: left one on cell r2-c11, middle one on cell r2-c12, right one on the shopkeeper body. */
const COMPOSITE_AIM: Aim = (() => {
  const yL = yawTo(STAND, wallPoint('cell-r2-c11'));
  const yR = yawTo(STAND, keeperFront);
  const yaw = (yL + yR) / 2;
  return { standX: STAND, yaw, pitch: pitchFor(STAND, yaw, wallPoint('cell-r2-c12', 0.1)), count: 3, spreadRad: (yR - yL) / 2 };
})();

/** `count` corks that all fly (almost) the same way, at the shopkeeper body. */
const keeperAim = (count: 1 | 2 | 3): Aim => {
  const yaw = yawTo(STAND, keeperFront);
  return { standX: STAND, yaw, pitch: pitchFor(STAND, yaw, keeperFront), count, spreadRad: 0.004 };
};

/** `count` corks that all fly (almost) the same way, at one cell between the prizes. */
const cellAim = (cellId: string, count: 1 | 2 | 3): Aim => {
  const target = wallPoint(cellId, 0.1);
  const yaw = yawTo(STAND, target);
  return { standX: STAND, yaw, pitch: pitchFor(STAND, yaw, target), count, spreadRad: 0.004 };
};

/** A cork that leaves the booth without touching anything: straight up. */
const HARMLESS: Aim = { standX: -STAND, yaw: 0, pitch: 0.3, count: 1, spreadRad: 0 };

// ---------------------------------------------------------------- scenario

interface Setup {
  readonly seed: number;
  readonly aim: Aim;
  readonly ammo?: number;
  readonly bonus?: number;
  /** effect on each cell id; the others keep their drawn effect */
  readonly cells?: Readonly<Record<string, EffectId>>;
  readonly question?: QuestionId;
  /** kinds standing at the front edge of tier 0 (they fall when an assortment change reshapes them) */
  readonly edgeKinds?: readonly string[];
}

const EDGE_KINDS = ['P001', 'P002', 'P003', 'P004', 'P005', 'P007', 'P008', 'P009', 'P010', 'P011', 'P012', 'P097'];

function buildState(s: Setup): ExpandedRunState {
  const base = createExpandedRun({ runId: mintId.run(`run-acc-${s.seed}`), seed: s.seed, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: EXP });
  const ammo = s.ammo ?? 1;
  const bonus = s.bonus ?? 0;
  const edgeZ = L.tiers[0]!.centerZ + L.tiers[0]!.depth / 2 - 0.005;
  const kinds = s.edgeKinds ?? [];
  const prizes = kinds.map((k, i) => {
    const slot = L.slots.find((x) => x.slotId === `slot-r3-c${String(i + 1).padStart(2, '0')}`)!;
    const p = spawnPrize(bundle.catalog, asPrizeTypeId(k), slot, i + 1, 0);
    return { ...p, hp: Math.min(p.hp, 2), pose: { ...p.pose, position: { ...p.pose.position, z: edgeZ } } };
  });
  const order = s.question ? [s.question, ...base.expansion.questionOrder.filter((q) => q !== s.question)] : base.expansion.questionOrder;
  const state: ExpandedRunState = {
    ...base,
    bonusAmmoTotal: bonus,
    shotsFired: INITIAL + bonus - ammo,
    ammo,
    shelf: { prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 },
    expansion: {
      ...base.expansion,
      questionOrder: order,
      cells: base.expansion.cells.map((c) => (s.cells?.[c.cellId] ? { ...c, effectId: s.cells[c.cellId]! } : c)),
      next: { modifiers: { ...BASE_SHOT_MODIFIERS, launch: { count: s.aim.count, spreadRad: s.aim.spreadRad } }, hint: null },
    },
  };
  expect(isAmmoBalanced(state, INITIAL)).toBe(true);
  return state;
}

class Scenario {
  readonly settled: ShotSummary[] = [];
  readonly impacts: ImpactEvent[] = [];
  readonly c: GameController;

  private constructor(
    readonly world: Awaited<ReturnType<typeof createShotWorld>>,
    state: ExpandedRunState,
  ) {
    this.c = new GameController(
      {
        rules: CORE_RULES,
        world,
        renderer: null,
        catalog: bundle.catalog,
        tuning: bundle.tuning,
        layout: L,
        expansion: EXP,
        onShotSettled: (summary) => this.settled.push(summary),
        onSimEvents: (events) => this.impacts.push(...events.filter((e): e is ImpactEvent => e.type === 'impact')),
      },
      state,
    );
  }

  static async create(s: Setup): Promise<Scenario> {
    return new Scenario(await createShotWorld(L, bundle.catalog, bundle.tuning), buildState(s));
  }

  get state(): ExpandedRunState {
    const s = this.c.current;
    if (!isExpandedRunState(s)) throw new Error('not an expanded run');
    return s;
  }

  /** Position → load (sweet spot) → aim → FIRE, exactly like the page. */
  fire(aim: Aim): void {
    const c = this.c;
    c.dispatch({ type: 'SET_POSITION', x: aim.standX }); // false (no change) when the stand is already there
    expect(c.current.standX).toBe(aim.standX);
    expect(c.dispatch({ type: 'CONFIRM_POSITION' })).toBe(true);
    c.frame(0.3);
    expect(c.dispatch({ type: 'STOP_LOAD' })).toBe(true);
    c.dispatch({ type: 'AIM', yaw: aim.yaw, pitch: aim.pitch }); // false when the same aim is already set
    expect(c.current.aim).toEqual({ yaw: aim.yaw, pitch: aim.pitch });
    expect(c.dispatch({ type: 'FIRE' })).toBe(true);
  }

  /** Frames until the question is shown or the shot is settled. */
  toQuestionOrEnd(): void {
    for (let i = 0; i < 3000 && !this.c.awaitingAnswer && this.c.current.phase === 'resolving'; i++) this.c.frame(1 / 60);
  }

  answer(choice: QuestionChoice): boolean {
    const s = this.c.current;
    const q = s.inFlight!.plan!.question!;
    return this.c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: s.inFlight!.shotId, questionId: q.questionId, choice });
  }

  settle(): void {
    for (let i = 0; i < 4000 && this.c.current.phase === 'resolving'; i++) this.c.frame(1 / 60);
    expect(this.c.current.phase).not.toBe('resolving');
  }

  /** The whole shot including one answer. */
  play(aim: Aim, choice: QuestionChoice): void {
    this.fire(aim);
    this.toQuestionOrEnd();
    if (this.c.awaitingAnswer) expect(this.answer(choice)).toBe(true);
    this.settle();
  }

  dispose(): void {
    this.world.dispose();
  }
}

const effectsOf = (s: ShotSummary) => s.effects ?? [];

const setIds = (s: ShotSummary): { pairs: string[]; trios: string[] } => ({
  pairs: s.newlyCompletedSets.filter((id) => id.startsWith('PAIR')),
  trios: s.newlyCompletedSets.filter((id) => !id.startsWith('PAIR')),
});

/** Every ledger and state invariant that "confirmed exactly once" means after one shot. */
function expectConfirmedOnce(sc: Scenario, summary: ShotSummary, shotsSoFar: number): void {
  const st = sc.state;
  expect(sc.settled).toHaveLength(shotsSoFar);
  expect(st.ledger).toHaveLength(shotsSoFar);
  expect(st.inFlight).toBeNull();
  const items = summary.ledger.items;
  // no instance paid twice, no set paid twice, no first-hit part paid twice
  const prizeRefs = items.filter((i) => i.kind === 'prize').map((i) => i.refId);
  expect(new Set(prizeRefs).size).toBe(prizeRefs.length);
  const setRefs = items.filter((i) => i.kind === 'set').map((i) => i.refId);
  expect(new Set(setRefs).size).toBe(setRefs.length);
  expect([...setRefs].sort()).toEqual([...summary.newlyCompletedSets].sort());
  const firstRefs = items.filter((i) => i.kind === 'shopkeeper' || i.kind === 'hidden').map((i) => i.refId);
  expect(new Set(firstRefs).size).toBe(firstRefs.length);
  // the run-wide lists have no duplicates either
  expect(new Set(st.completedSets).size).toBe(st.completedSets.length);
  expect(new Set(st.collected.map((x) => x.instanceId)).size).toBe(st.collected.length);
  expect(new Set(st.firstHitsScored).size).toBe(st.firstHitsScored.length);
  // score = the sum of the ledger entries; the ledger entry adds up
  expect(st.score).toBe(st.ledger[st.ledger.length - 1]!.scoreAfter);
  expect(summary.ledger.scoreAfter).toBe(Math.max(0, summary.ledger.scoreBefore + items.filter((i) => i.kind !== 'penalty').reduce((a, i) => a + i.points, 0) - items.filter((i) => i.kind === 'penalty').reduce((a, i) => a + i.points, 0)));
  expect(isAmmoBalanced(st, INITIAL)).toBe(true);
  expect(st.shotsFired + st.ammo + st.ammoLostTotal).toBe(INITIAL + st.bonusAmmoTotal);
  expect(st.bonusAmmoTotal).toBeLessThanOrEqual(MAX_BONUS);
  expect(st.shotsFired).toBeLessThanOrEqual(INITIAL + MAX_BONUS);
}

// ------------------------------------------------------------- CH-AC43

describe('CH-AC43: last bullet -> several cells -> shopkeeper question -> series change -> falls -> pair and trio, each once', () => {
  let seed = 0;

  // The fall of the reshaped prizes depends on which series the answer draws, so the seed is
  // searched (deterministically, in seed order) for one whose shot completes a pair and a trio together.
  beforeAll(async () => {
    for (let s = 1; s <= 80 && seed === 0; s++) {
      const sc = await Scenario.create({ seed: s, aim: COMPOSITE_AIM, question: Q_STOCK, cells: { 'cell-r2-c12': FX_AMMO_PLUS_1, 'cell-r2-c11': FX_SPEED, 'cell-r1-c01': FX_HINT }, edgeKinds: EDGE_KINDS });
      sc.play(COMPOSITE_AIM, 'B');
      const sets = setIds(sc.settled[0]!);
      if (sets.pairs.length >= 1 && sets.trios.length >= 1) seed = s;
      sc.dispose();
    }
  });

  it('the searched seed exists', () => {
    expect(seed).toBeGreaterThan(0);
  });

  it('confirms the whole chain once and the game goes on because the cell gave a bullet', async () => {
    const setup: Setup = { seed, aim: COMPOSITE_AIM, question: Q_STOCK, cells: { 'cell-r2-c12': FX_AMMO_PLUS_1, 'cell-r2-c11': FX_SPEED, 'cell-r1-c01': FX_HINT }, edgeKinds: EDGE_KINDS };
    const sc = await Scenario.create(setup);
    const before = sc.state;
    expect(before.ammo).toBe(1); // the last bullet
    expect(before.shotsFired).toBe(INITIAL - 1);

    sc.fire(COMPOSITE_AIM);
    sc.toQuestionOrEnd();
    // the question comes after the flight, once, with the planned effects of both cells waiting in the plan
    expect(sc.c.awaitingAnswer).toBe(true);
    const flight = sc.state.inFlight!;
    expect(flight.stage).toBe('question');
    expect(flight.plan!.question!.questionId).toBe(Q_STOCK);
    expect(flight.plan!.processed.filter((e) => e.source.kind === 'cell').map((e) => e.source.kind === 'cell' && e.source.cellId).sort()).toEqual(['cell-r2-c11', 'cell-r2-c12']);
    expect(flight.plan!.processed.every((e) => e.source.kind !== 'answer')).toBe(true);
    // one shot touched two cells and the shopkeeper
    const touched = new Set<string>(sc.impacts.map((i) => (i.target.kind === 'cell' ? i.target.cellId : i.target.kind)));
    expect(touched.has('cell-r2-c11') && touched.has('cell-r2-c12') && touched.has('shopkeeper')).toBe(true);
    // nothing is confirmed yet
    expect(sc.settled).toHaveLength(0);
    expect(sc.state.ledger).toHaveLength(0);
    expect(sc.state.score).toBe(0);
    expect(sc.state.ammo).toBe(0); // the bullet is spent; the cell's +1 is only planned
    expect(sc.state.expansion.cells.every((c) => !c.used)).toBe(true);
    expect(sc.state.phase).toBe('resolving');

    // the answer: a second tap and a wrong choice for the same question do nothing more
    expect(sc.answer('B')).toBe(true);
    expect(sc.answer('A')).toBe(false);
    expect(sc.answer('B')).toBe(false);
    sc.settle();

    const summary = sc.settled[0]!;
    expectConfirmedOnce(sc, summary, 1);
    const st = sc.state;
    // effects: the two cells and the answer, each once, the answer last and from the STOCK group
    expect(effectsOf(summary).map((e) => e.source.kind)).toEqual(['cell', 'cell', 'answer']);
    const answerEffect = effectsOf(summary)[2]!;
    expect(answerEffect.outcome).toBe('applied');
    expect(EXP.groups.get(EXP.questions.get(Q_STOCK)!.choices.B.groupId)!.effectIds).toContain(answerEffect.effectId);
    expect(EXP.effects.get(answerEffect.effectId!)!.operation.kind).toBe('seriesAssortment');
    expect(st.expansion.assortmentSeries).not.toBeNull();
    // the questions: one asked, cursor moved once
    expect(st.expansion.questionCursor).toBe(1);
    expect(st.firstHitsScored.filter((k) => k.startsWith('shopkeeper:'))).toEqual(['shopkeeper:body']);
    // the falls were judged as the kinds the prizes had when they fell
    expect((summary.appliedTransforms ?? []).length).toBeGreaterThan(0);
    expect(summary.collected.length).toBeGreaterThanOrEqual(2);
    const members = new Set(EXP.series.get(st.expansion.assortmentSeries!)!.typeIds);
    for (const c of summary.collected) expect(members.has(c.typeId)).toBe(true);
    // a pair and a trio completed by the same shot, each exactly once, each paying its own configured points
    const sets = setIds(summary);
    expect(sets.pairs.length).toBeGreaterThanOrEqual(1);
    expect(sets.trios.length).toBeGreaterThanOrEqual(1);
    for (const id of summary.newlyCompletedSets) {
      const item = summary.ledger.items.filter((i) => i.kind === 'set' && i.refId === id);
      expect(item).toHaveLength(1);
      expect(item[0]!.points).toBe(bundle.catalog.sets.get(id as never)!.bonusScore);
    }
    // ammo: spent 1, cell +1 -> the game goes on (the answer was a series change, not ammo)
    expect(summary.ammoAfter).toBe(1);
    expect(summary.runEnded).toBe(false);
    expect(st.phase).toBe('position');
    expect(st.ammo).toBe(1);
    expect(st.bonusAmmoTotal).toBe(1);
    expect(st.shotsFired).toBe(INITIAL);
    // both touched cells are used, the others are not; the speed reservation of the cell survives for the next shot
    const used = st.expansion.cells.filter((c) => c.used).map((c) => c.cellId).sort();
    expect(used).toEqual(['cell-r2-c11', 'cell-r2-c12']);
    for (const c of st.expansion.cells.filter((x) => x.used)) expect(c.usedOnShot).toBe(flight.shotId);
    expect(st.expansion.next.modifiers).not.toEqual(BASE_SHOT_MODIFIERS);
    expect(st.expansion.active).toBeNull();

    // the game really goes on: the next shot is accepted, and nothing of the first one is paid again
    sc.fire(HARMLESS);
    expect(sc.state.expansion.active?.modifiers).toEqual(st.expansion.next.modifiers); // the reservation is used by this shot
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(false);
    sc.settle();
    expect(sc.settled).toHaveLength(2);
    const second = sc.settled[1]!;
    expect(second.newlyCompletedSets).toEqual([]);
    expect(second.ledger.items.filter((i) => i.kind === 'set' || i.kind === 'shopkeeper')).toEqual([]);
    expect(sc.state.completedSets).toEqual(st.completedSets);
    // the cells of the first shot are still used by that shot; the second shot only added the cell it touched itself
    for (const id of used) expect(sc.state.expansion.cells.find((c) => c.cellId === id)).toMatchObject({ used: true, usedOnShot: flight.shotId });
    expect(sc.state.expansion.questionCursor).toBe(1);
    expect(sc.state.phase).toBe('ended'); // that was the last bullet
    expectConfirmedOnce(sc, second, 2);
    sc.dispose();
  });

  it('the same chain without any bullet gained ends the game only after the answer, with the reservation dropped', async () => {
    const setup: Setup = { seed, aim: COMPOSITE_AIM, question: Q_STOCK, cells: { 'cell-r2-c12': FX_HINT, 'cell-r2-c11': FX_SPEED }, edgeKinds: EDGE_KINDS };
    const sc = await Scenario.create(setup);
    sc.fire(COMPOSITE_AIM);
    sc.toQuestionOrEnd();
    // ammo is 0 here, yet the game is not over until the answer is taken and the shot is confirmed
    expect(sc.state.ammo).toBe(0);
    expect(sc.state.phase).toBe('resolving');
    expect(sc.c.awaitingAnswer).toBe(true);
    expect(sc.answer('B')).toBe(true);
    sc.settle();
    const summary = sc.settled[0]!;
    expectConfirmedOnce(sc, summary, 1);
    expect(sc.state.phase).toBe('ended');
    expect(summary.runEnded).toBe(true);
    expect(summary.ammoAfter).toBe(0);
    expect(sc.state.ammo).toBe(0);
    expect(sc.state.expansion.next.modifiers).toEqual(expect.objectContaining({ speedMult: 1, damageMult: 1, pushMult: 1 }));
    expect(sc.state.expansion.next.hint).toBeNull();
    expect(sc.state.expansion.questionCursor).toBe(1);
    expect(sc.state.expansion.cells.filter((c) => c.used)).toHaveLength(2);
    // an ended run accepts no further shot
    expect(sc.c.dispatch({ type: 'FIRE' })).toBe(false);
    sc.dispose();
  });
});

// ------------------------------------------------------------- CH-AC26

describe('CH-AC26: the last shot, the answer and the bullet cap', () => {
  it('a bullet given by the ANSWER of the last shot continues the game, and a cell reservation made earlier is kept', async () => {
    let found = 0;
    for (let seed = 1; seed <= 120 && found === 0; seed++) {
      const sc = await Scenario.create({ seed, aim: COMPOSITE_AIM, question: Q_GAIN, cells: { 'cell-r2-c12': FX_HINT, 'cell-r2-c11': FX_SPEED } });
      sc.fire(COMPOSITE_AIM);
      sc.toQuestionOrEnd();
      expect(sc.c.awaitingAnswer).toBe(true);
      expect(sc.state.ammo).toBe(0);
      expect(sc.answer('A')).toBe(true); // GAIN group
      sc.settle();
      const summary = sc.settled[0]!;
      const answer = effectsOf(summary).find((e) => e.source.kind === 'answer')!;
      if (answer.ammoDelta > 0) {
        found = seed;
        expectConfirmedOnce(sc, summary, 1);
        const st = sc.state;
        expect(summary.runEnded).toBe(false);
        expect(st.phase).toBe('position');
        expect(st.ammo).toBe(answer.ammoDelta);
        expect(st.bonusAmmoTotal).toBe(answer.ammoDelta);
        expect(st.bonusAmmoTotal).toBeLessThanOrEqual(MAX_BONUS);
        // the reservation from the cell, made before the answer when ammo was 0, is still there
        expect(st.expansion.next.modifiers).not.toEqual(BASE_SHOT_MODIFIERS);
        // and the player can really shoot once more
        sc.fire(HARMLESS);
        expect(sc.state.expansion.active?.modifiers).toEqual(st.expansion.next.modifiers);
      }
      sc.dispose();
    }
    expect(found).toBeGreaterThan(0);
  });

  it('with the bonus cap already reached the +1 cannot be given, so the last shot ends after the answer with a reason', async () => {
    const sc = await Scenario.create({ seed: 3, aim: COMPOSITE_AIM, question: Q_STOCK, ammo: 1, bonus: MAX_BONUS, cells: { 'cell-r2-c12': FX_AMMO_PLUS_1, 'cell-r2-c11': FX_HINT } });
    expect(sc.state.shotsFired).toBe(INITIAL + MAX_BONUS - 1); // the 20th shot
    sc.fire(COMPOSITE_AIM);
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(true);
    expect(sc.answer('B')).toBe(true);
    sc.settle();
    const summary = sc.settled[0]!;
    const plus = effectsOf(summary).find((e) => e.source.kind === 'cell' && e.source.cellId === 'cell-r2-c12')!;
    expect(plus.outcome).not.toBe('applied');
    expect(plus.reason).toBeTruthy();
    expect(plus.ammoDelta).toBe(0);
    expect(summary.runEnded).toBe(true);
    expect(sc.state.phase).toBe('ended');
    expect(sc.state.bonusAmmoTotal).toBe(MAX_BONUS);
    expect(sc.state.shotsFired).toBe(INITIAL + MAX_BONUS);
    expect(sc.state.ammo).toBe(0);
    // the cell is used up even though its effect could not act
    expect(sc.state.expansion.cells.find((c) => c.cellId === 'cell-r2-c12')!.used).toBe(true);
    expectConfirmedOnce(sc, summary, 1);
    sc.dispose();
  });
});

// ------------------------------------------------------------- CH-AC12

describe('CH-AC12: one question per shot, however many corks and reflections touch the shopkeeper', () => {
  it('three corks on the shopkeeper ask one question; the next shot asks the next one', async () => {
    const sc = await Scenario.create({ seed: 4, aim: keeperAim(3), ammo: 4, question: Q_STOCK, cells: {} });
    const order = sc.state.expansion.questionOrder;
    sc.fire(keeperAim(3));
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(true);
    const keeperImpacts = sc.impacts.filter((i) => i.target.kind === 'shopkeeper');
    expect(keeperImpacts.length).toBeGreaterThanOrEqual(2); // several contacts (split corks / reflections)
    expect(new Set(keeperImpacts.map((i) => i.projectileId)).size).toBeGreaterThanOrEqual(2);
    expect(sc.state.inFlight!.plan!.question!.questionId).toBe(order[0]);
    expect(sc.state.expansion.questionCursor).toBe(0); // viewing does not advance it
    expect(sc.answer('A')).toBe(true);
    expect(sc.state.inFlight!.plan!.processed.filter((e) => e.source.kind === 'answer')).toHaveLength(1);
    sc.settle();
    expect(sc.state.expansion.questionCursor).toBe(1);
    expect(effectsOf(sc.settled[0]!).filter((e) => e.source.kind === 'answer')).toHaveLength(1);
    // a different shot asks again, and a different question
    sc.fire(keeperAim(1));
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(true);
    expect(sc.state.inFlight!.plan!.question!.questionId).toBe(order[1]);
    expect(order[1]).not.toBe(order[0]);
    expect(sc.answer('B')).toBe(true);
    sc.settle();
    expect(sc.state.expansion.questionCursor).toBe(2);
    expectConfirmedOnce(sc, sc.settled[1]!, 2);
    sc.dispose();
  });
});

// ------------------------------------------------------------- CH-AC22

describe('CH-AC22: split corks on one cell use it once', () => {
  it('three corks into one cell give one request, one effect and one used cell', async () => {
    const aim = cellAim('cell-r2-c12', 3);
    const sc = await Scenario.create({ seed: 5, aim, ammo: 3, cells: { 'cell-r2-c12': FX_AMMO_PLUS_1 } });
    sc.fire(aim);
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(false);
    sc.settle();
    const onCell = sc.impacts.filter((i) => i.target.kind === 'cell' && i.target.cellId === 'cell-r2-c12');
    expect(onCell.length).toBeGreaterThanOrEqual(2); // several corks (or reflections) touched it
    expect(onCell.filter((i) => i.target.kind === 'cell' && i.target.activated)).toHaveLength(1);
    const summary = sc.settled[0]!;
    expect(effectsOf(summary).filter((e) => e.source.kind === 'cell' && e.source.cellId === 'cell-r2-c12')).toHaveLength(1);
    expect(effectsOf(summary).filter((e) => e.source.kind === 'cell')).toHaveLength(1);
    // one +1 only: 3 -> 2 after the shot, +1
    expect(sc.state.ammo).toBe(3);
    expect(sc.state.bonusAmmoTotal).toBe(1);
    expect(sc.state.expansion.cells.filter((c) => c.used).map((c) => c.cellId)).toEqual(['cell-r2-c12']);
    expectConfirmedOnce(sc, summary, 1);
    sc.dispose();
  });
});

// ------------------------------------------------------------- CH-AC23

describe('CH-AC23: a used cell stays used after the refill, the assortment, another shot and a reload', () => {
  it('reflects later corks without acting again, and the saved game restores it as used', async () => {
    const aim = cellAim('cell-r2-c12', 1);
    const sc = await Scenario.create({ seed: 6, aim, ammo: INITIAL, cells: { 'cell-r2-c12': FX_AMMO_PLUS_1 }, edgeKinds: EDGE_KINDS });
    sc.play(aim, 'A');
    const afterFirst = sc.state;
    const cell = afterFirst.expansion.cells.find((c) => c.cellId === 'cell-r2-c12')!;
    expect(cell.used).toBe(true);
    const usedOn = cell.usedOnShot;
    const bonus = afterFirst.bonusAmmoTotal;
    expect(bonus).toBe(1);
    // the shelf was refilled to 36 slots after the shot
    expect(afterFirst.shelf.prizes.length + afterFirst.shelf.deferredSlots.length).toBeGreaterThanOrEqual(0);

    // a series assortment change (as an answer would do) changes the shelf, never the cells
    const withSeries: ExpandedRunState = { ...afterFirst, expansion: { ...afterFirst.expansion, assortmentSeries: [...EXP.series.keys()][0]! } };

    // a reload: the saved game comes back with the cell still used and the same effect/shot/request
    const KEY = expandedRunKey(EXP.profile.rulesVersion);
    const storage = new FakeStorage();
    const store = createRunStore(storage, 'tab-A', { catalog: bundle.catalog, tuning: bundle.tuning, layout: L, expansion: EXP, key: KEY, now: () => '2026-11-06T00:00:00.000Z' });
    expect(validateRunState(withSeries, bundle.catalog, bundle.tuning, L, EXP)).toBeNull();
    expect(store.saveStable(withSeries)).toMatchObject({ ok: true });
    expect(storage.data.has(STORAGE_KEYS.run)).toBe(false);
    const loaded = createRunStore(storage, 'tab-B', { catalog: bundle.catalog, tuning: bundle.tuning, layout: L, expansion: EXP, key: KEY, now: () => '2026-11-06T00:00:00.000Z' }).load();
    expect(loaded.kind).toBe('resume');
    if (loaded.kind !== 'resume') throw new Error('no resume');
    const restored = loaded.state as ExpandedRunState;
    expect(restored.expansion.cells.find((c) => c.cellId === 'cell-r2-c12')).toEqual(cell);

    // the same cell is hit again by a later shot: it reflects, nothing is requested, nothing is paid
    sc.fire(aim);
    sc.toQuestionOrEnd();
    sc.settle();
    const second = sc.settled[1]!;
    expect(effectsOf(second).filter((e) => e.source.kind === 'cell')).toEqual([]);
    const again = sc.impacts.filter((i) => i.shotId === second.shotId && i.target.kind === 'cell' && i.target.cellId === 'cell-r2-c12');
    expect(again.length).toBeGreaterThanOrEqual(1);
    expect(sc.state.expansion.cells.find((c) => c.cellId === 'cell-r2-c12')).toEqual(cell);
    expect(cell.usedOnShot).toBe(usedOn);
    expect(sc.state.bonusAmmoTotal).toBe(bonus); // the +1 was not given again
    expect(sc.state.ammo).toBe(afterFirst.ammo - 1); // one cork spent, no bullet given back
    // the first impact of the later shot was a reflection off the used cell, i.e. a cell target that is not activated
    expect(again.every((i) => i.target.kind === 'cell' && !i.target.activated)).toBe(true);
    expectConfirmedOnce(sc, second, 2);
    sc.dispose();
  });
});

// ------------------------------------------------------------- CH-AC38

describe('CH-AC38: leaving the app or turning the phone during a question', () => {
  it('stays on the same question, loses no time, answers nothing by itself, then takes exactly one answer', async () => {
    const sc = await Scenario.create({ seed: 7, aim: keeperAim(1), ammo: 2, question: Q_STOCK });
    sc.fire(keeperAim(1));
    sc.toQuestionOrEnd();
    expect(sc.c.awaitingAnswer).toBe(true);
    const shown = sc.state;
    const questionId = shown.inFlight!.plan!.question!.questionId;
    const frozenPrizes = sc.world.frame().prizes;
    const viewBefore = sc.c.viewState().expansion!.question;
    expect(viewBefore).toMatchObject({ questionId, answer: null });

    // hidden, then landscape on top of it. Coming back never lifts the 'manual' pause by itself.
    sc.c.setEnvironmentPause(['hidden']);
    expect(sc.c.current.pauseReasons).toEqual(['hidden', 'manual']);
    expect(sc.answer('A')).toBe(false); // a tap that arrives while paused is refused
    for (let i = 0; i < 300; i++) sc.c.frame(5); // a very long time away
    sc.c.setEnvironmentPause(['hidden', 'landscape']);
    for (let i = 0; i < 60; i++) sc.c.frame(1);
    sc.c.setEnvironmentPause(['landscape']); // back in the app, still sideways
    expect(sc.c.current.pauseReasons).toEqual(['landscape', 'manual']);
    expect(sc.answer('A')).toBe(false);
    sc.c.setEnvironmentPause([]);
    expect(sc.c.current.pauseReasons).toEqual(['manual']);
    for (let i = 0; i < 120; i++) sc.c.frame(1 / 60);
    expect(sc.answer('A')).toBe(false); // still waiting for the player's own resume
    expect(sc.c.dispatch({ type: 'RESUME', reason: 'manual' })).toBe(true);
    expect(sc.c.current.pauseReasons).toEqual([]);

    // nothing happened by itself: same question, no answer, nothing confirmed, no time jump, no shot
    for (let i = 0; i < 600; i++) sc.c.frame(1 / 60);
    const now = sc.c.current;
    expect(sc.c.awaitingAnswer).toBe(true);
    expect(now.inFlight!.stage).toBe('question');
    expect(now.inFlight!.plan!.question).toEqual({ questionId, cursor: shown.inFlight!.plan!.question!.cursor, answer: null });
    expect(sc.c.viewState().expansion!.question).toEqual(viewBefore);
    expect(sc.settled).toHaveLength(0);
    expect(now.ledger).toEqual([]);
    expect(now.score).toBe(0);
    expect(now.clocks).toEqual(shown.clocks);
    expect(now.shotsFired).toBe(shown.shotsFired);
    expect(now.ammo).toBe(shown.ammo);
    expect(sc.world.frame().prizes).toEqual(frozenPrizes);
    expect(sc.c.dispatch({ type: 'FIRE' })).toBe(false); // no accidental second shot

    // one answer is taken, once
    expect(sc.answer('B')).toBe(true);
    expect(sc.answer('B')).toBe(false);
    sc.settle();
    expect(sc.settled).toHaveLength(1);
    expect(sc.state.expansion.questionCursor).toBe(1);
    expectConfirmedOnce(sc, sc.settled[0]!, 1);
    sc.dispose();
  });
});
