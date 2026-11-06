import { describe, expect, it } from 'vitest';
import { createShotWorld, type ShotWorldOptions } from '../../src/sim/world';
import { TRANSFORM_OVERLAP_TOLERANCE_M, compareSubjects, planTransforms, type TransformSubject } from '../../src/sim/transform-plan';
import { spawnPrize } from '../../src/core/replenish';
import {
  BASE_SHOT_MODIFIERS,
  BOOTH_LAYOUT_V2,
  IDENTITY_QUAT,
  asPrizeTypeId,
  mintId,
  type Box3,
  type CollisionShape,
  type EffectRequestId,
  type PrizeInstanceState,
  type PrizeRuntimeConfig,
  type PrizeTypeId,
  type RuntimeCatalog,
  type TransformIntent,
  type TuningConfig,
} from '../../src/contracts';
import { CAT, T } from './helpers';
import { expandedCtx, harmlessRequest, planFor, runExpanded, straightAt } from '../integration/expanded-helpers';

const T36: TuningConfig = { ...T, shelfSlotCount: 36 };
const id = (n: number) => mintId.instance(n);
const req = (n: number) => `s01-fx${n}` as EffectRequestId;
const ty = (s: string) => asPrizeTypeId(s);

// ---------------------------------------------------------------- pure planner

const box = (hx: number, hy: number, hz: number): CollisionShape => ({ kind: 'box', halfExtents: { x: hx, y: hy, z: hz } });
const SHAPES: Record<string, CollisionShape> = {
  P001: box(0.1, 0.04, 0.08), // current
  P002: box(0.1, 0.04, 0.08), // same footprint
  P003: box(0.3, 0.04, 0.08), // wide: collides with a neighbour
  P004: box(0.1, 0.02, 0.08), // flatter
  P005: box(0.1, 0.2, 0.08), // taller
};
const shapeOf = (t: PrizeTypeId) => SHAPES[t];
const subject = (n: number, slot: string, x: number, type = 'P001', y = 0.84): TransformSubject => ({
  instanceId: id(n),
  homeSlot: slot,
  typeId: ty(type),
  pose: { position: { x, y, z: -1.75 }, rotation: IDENTITY_QUAT },
});
const intent = (n: number, request: number, ...cands: string[]): TransformIntent => ({ instanceId: id(n), requestId: req(request), candidateTypeIds: cands.map(ty) });
const floor: Box3 = { center: { x: 0, y: 0.785, z: -1.75 }, halfExtents: { x: 3, y: 0.015, z: 0.14 } }; // shelf top at y = 0.8

describe('planTransforms (pure)', () => {
  it('orders by slot row, column, then instance id', () => {
    const list: TransformSubject[] = [subject(3, 'slot-r2-c01', 0), subject(2, 'slot-r1-c05', 1), subject(1, 'slot-r1-c02', 2), subject(4, 'slot-r1-c02', 3)];
    expect([...list].sort(compareSubjects).map((s) => s.instanceId)).toEqual([id(1), id(4), id(2), id(3)]);
    const r = planTransforms({
      prizes: list,
      intents: [intent(3, 1, 'P002'), intent(2, 2, 'P002'), intent(1, 3, 'P002'), intent(4, 4, 'P002')],
      shapeOf,
      obstacles: [],
    });
    expect(r.applied.map((a) => a.instanceId)).toEqual([id(1), id(4), id(2), id(3)]);
  });

  it('takes the first fitting candidate in the fixed order', () => {
    const r = planTransforms({
      prizes: [subject(1, 'slot-r3-c01', 0), subject(2, 'slot-r3-c02', 0.3)],
      intents: [intent(1, 1, 'P003', 'P004', 'P002')],
      shapeOf,
      obstacles: [floor],
    });
    // P003 (0.3 wide) overlaps the neighbour at x = 0.3, so the next candidate P004 is taken
    expect(r.applied).toEqual([{ instanceId: id(1), requestId: req(1), fromTypeId: ty('P001'), toTypeId: ty('P004') }]);
    expect(r.deferred).toEqual([]);
  });

  it('defers the whole intent, with the same candidate order, when nothing fits', () => {
    const r = planTransforms({
      prizes: [subject(1, 'slot-r3-c01', 0), subject(2, 'slot-r3-c02', 0.3)],
      intents: [intent(1, 7, 'P003', 'P005')],
      shapeOf,
      obstacles: [floor],
    });
    expect(r.applied).toEqual([]);
    expect(r.deferred).toEqual([{ instanceId: id(1), requestId: req(7), candidateTypeIds: [ty('P003'), ty('P005')] }]);
  });

  it('keeps Y: a taller shape would sink into the board and is deferred, a flatter one floats and is accepted', () => {
    const base = { prizes: [subject(1, 'slot-r3-c01', 0)], shapeOf, obstacles: [floor] };
    expect(planTransforms({ ...base, intents: [intent(1, 1, 'P005')] }).deferred).toHaveLength(1);
    expect(planTransforms({ ...base, intents: [intent(1, 1, 'P004')] }).applied).toHaveLength(1);
  });

  it('uses one shared tolerance for resting contact', () => {
    expect(TRANSFORM_OVERLAP_TOLERANCE_M).toBeGreaterThan(0);
    // a different-shape candidate inside the tolerance is accepted, beyond it rejected
    const wide = (depth: number) =>
      planTransforms({
        prizes: [subject(1, 'slot-r3-c01', 0), subject(2, 'slot-r3-c02', 0.4 - depth)],
        intents: [intent(1, 1, 'P003')],
        shapeOf,
        obstacles: [],
      });
    expect(wide(TRANSFORM_OVERLAP_TOLERANCE_M * 0.5).applied).toHaveLength(1);
    expect(wide(TRANSFORM_OVERLAP_TOLERANCE_M * 3).deferred).toHaveLength(1);
  });

  it('an earlier accepted new shape blocks a later prize; the current shape of an unprocessed prize blocks too', () => {
    // 1 (left) and 2 (right) both want to become wide; 1 goes first and is accepted, 2 then collides with it
    const r = planTransforms({
      prizes: [subject(1, 'slot-r3-c01', 0), subject(2, 'slot-r3-c02', 0.8)],
      intents: [intent(1, 1, 'P003'), intent(2, 2, 'P003')],
      shapeOf,
      obstacles: [],
    });
    expect(r.applied.map((a) => a.instanceId)).toEqual([id(1), id(2)]);
    const close = planTransforms({
      prizes: [subject(1, 'slot-r3-c01', 0), subject(2, 'slot-r3-c02', 0.5)],
      intents: [intent(1, 1, 'P003'), intent(2, 2, 'P003')],
      shapeOf,
      obstacles: [],
    });
    // 0.3 + 0.3 = 0.6 > 0.5 spacing: the second finds the first's wide shape in the way
    expect(close.applied.map((a) => a.instanceId)).toEqual([id(1)]);
    expect(close.deferred.map((d) => d.instanceId)).toEqual([id(2)]);
  });

  it('several intents for one instance: only the final one counts; unknown instances are ignored; same kind is a no-op', () => {
    const r = planTransforms({
      prizes: [subject(1, 'slot-r3-c01', 0)],
      intents: [intent(1, 1, 'P004'), intent(1, 2, 'P002'), intent(9, 3, 'P002')],
      shapeOf,
      obstacles: [],
    });
    expect(r.applied).toEqual([{ instanceId: id(1), requestId: req(2), fromTypeId: ty('P001'), toTypeId: ty('P002') }]);
    const same = planTransforms({ prizes: [subject(1, 'slot-r3-c01', 0)], intents: [intent(1, 1, 'P001')], shapeOf, obstacles: [] });
    expect(same).toEqual({ applied: [], deferred: [] });
  });
});

// ---------------------------------------------------------------- in the world

function catalogWithTwins(): RuntimeCatalog {
  const a = CAT.prizes.get(ty('P001'))!;
  const mk = (typeId: string, over: Partial<PrizeRuntimeConfig>): [PrizeTypeId, PrizeRuntimeConfig] => [ty(typeId), { ...a, typeId: ty(typeId), ...over }];
  const slide = CAT.prizes.get(ty('P023'))!; // a mounted slider
  return {
    ...CAT,
    prizes: new Map([
      ...CAT.prizes,
      mk('P998', { maxHp: 20 }), // same shape, other max HP
      mk('P997', { maxHp: 20, shape: box(0.11, 0.02, 0.08) }), // flatter
      mk('P996', { maxHp: 20, shape: box(0.11, 0.2, 0.08) }), // taller
      [ty('P995'), { ...slide, typeId: ty('P995'), maxHp: 30, motion: { type: 'none' } as never }], // slider shape, no motion
    ]),
  };
}

const slot = (sid: string) => BOOTH_LAYOUT_V2.slots.find((s) => s.slotId === sid)!;
const shelfOf = (prizes: PrizeInstanceState[]) => ({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 });

async function worldWith(cat: RuntimeCatalog, prizes: PrizeInstanceState[], tuning: TuningConfig = T36, options: ShotWorldOptions = {}) {
  const world = await createShotWorld(BOOTH_LAYOUT_V2, cat, tuning, options);
  world.syncShelf(shelfOf(prizes), 0);
  return world;
}

const intentFor = (p: PrizeInstanceState, ...to: string[]): TransformIntent => ({ instanceId: p.instanceId, requestId: req(1), candidateTypeIds: to.map(ty) });

describe('kind changes applied by the world at the barrier', () => {
  it('HP keeps its ratio from before the change, rounded once (1/8 -> 2.5 -> 3, 3/8 -> 7.5 -> 8, 0 stays 0)', async () => {
    const cat = catalogWithTwins();
    const cases: Array<[number, number]> = [
      [1, 3],
      [3, 8],
      [0, 0],
      [8, 20],
    ];
    for (const [hp, expected] of cases) {
      const base = spawnPrize(cat, ty('P001'), slot('slot-r3-c04'), 1, 0);
      const prize = { ...base, hp, maxHp: 8 };
      const world = await worldWith({ ...cat, prizes: new Map([...cat.prizes, [ty('P001'), { ...cat.prizes.get(ty('P001'))!, maxHp: 8 }]]) }, [prize]);
      const run = runExpanded(world, harmlessRequest(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(prize, 'P998')]) });
      expect(run.record.appliedTransforms).toHaveLength(1);
      const ev = run.record.transforms[0]!;
      expect([ev.hpBefore, ev.maxHpBefore, ev.hpAfter, ev.maxHpAfter]).toEqual([hp, 8, expected, 20]);
      const after = run.record.remainingPrizes[0]!;
      expect(after.typeId).toBe('P998');
      expect(after.hp).toBe(expected);
      expect(after.maxHp).toBe(20);
      world.dispose();
    }
  });

  it('a dislodged prize keeps instance, slot, pose including Y and stays dislodged; only the kind changes', async () => {
    const cat = catalogWithTwins();
    const prize = spawnPrize(cat, ty('P001'), slot('slot-r3-c04'), 1, 0);
    const world = await worldWith(cat, [prize]);
    const flatter = runExpanded(world, harmlessRequest(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(prize, 'P997')]) });
    expect(flatter.record.appliedTransforms).toEqual([{ instanceId: prize.instanceId, requestId: req(1), fromTypeId: 'P001', toTypeId: 'P997' }]);
    const after = flatter.record.remainingPrizes[0]!;
    expect(after.instanceId).toBe(prize.instanceId);
    expect(after.homeSlot).toBe(prize.homeSlot);
    expect(after.drawnTypeId).toBe(prize.drawnTypeId);
    expect(after.mounted).toBe(false);
    // the flatter shape keeps the centre height: the prize now floats and falls to the board; at the barrier Y was unchanged
    const barrierPrize = flatter.barriers[0]!.prizes[0]!;
    expect(barrierPrize.pose.position.y).toBeCloseTo(prize.pose.position.y, 3);
    expect(after.pose.position.y).toBeCloseTo(0.8 + 0.02, 2); // it settled on the board afterwards
    world.dispose();
  });

  it('a taller shape would sink into the board: deferred with the same candidate order, nothing moves', async () => {
    const cat = catalogWithTwins();
    const prize = spawnPrize(cat, ty('P001'), slot('slot-r3-c04'), 1, 0);
    const world = await worldWith(cat, [prize]);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(prize, 'P996', 'P996')]) });
    expect(run.record.appliedTransforms).toEqual([]);
    expect(run.record.deferredTransforms).toEqual([{ instanceId: prize.instanceId, requestId: req(1), candidateTypeIds: ['P996', 'P996'] }]);
    expect(run.record.remainingPrizes[0]!.typeId).toBe('P001');
    expect(run.record.remainingPrizes[0]!.pose.position.x).toBeCloseTo(prize.pose.position.x, 4);
    expect(run.record.remainingPrizes[0]!.pose.position.y).toBeCloseTo(prize.pose.position.y, 4);
    world.dispose();
  });

  it('several intents for one instance change the shape once, to the final kind', async () => {
    const cat = catalogWithTwins();
    const prize = spawnPrize(cat, ty('P001'), slot('slot-r3-c04'), 1, 0);
    const world = await worldWith(cat, [prize]);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), {
      makePlan: (b) => planFor(b, [{ ...intentFor(prize, 'P997'), requestId: req(1) }, { ...intentFor(prize, 'P998'), requestId: req(2) }]),
    });
    expect(run.record.appliedTransforms).toEqual([{ instanceId: prize.instanceId, requestId: req(2), fromTypeId: 'P001', toTypeId: 'P998' }]);
    expect(run.record.transforms).toHaveLength(1);
    world.dispose();
  });

  it('a mounted prize stays mounted with the same phase; the old motion keeps running (motionTypeId)', async () => {
    const cat = catalogWithTwins();
    const slider = spawnPrize(cat, ty('P023'), slot('slot-r2-c04'), 1, 0);
    expect(slider.mounted).toBe(true);
    const world = await worldWith(cat, [slider]);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(slider, 'P995')]) });
    expect(run.record.appliedTransforms).toHaveLength(1);
    const after = run.record.remainingPrizes[0]!;
    expect(after.typeId).toBe('P995');
    expect(after.mounted).toBe(true);
    expect(after.motionTypeId).toBe('P023');
    // the barrier position and the first position after the resume lie on the same slide path (no jump back to the base)
    const barrierX = run.barriers[0]!.prizes[0]!.pose.position.x;
    const afterFrames = run.frames.slice(run.frames.findIndex((f) => f.simTimeSec >= run.barriers[0]!.simTimeSec) + 1);
    const nextX = afterFrames[0]!.prizes[0]!.position.x;
    expect(Math.abs(nextX - barrierX)).toBeLessThan(0.02);
    // The frames tell the view which motion the mount runs (FX097), and rules-v1 style frames carry none.
    expect(afterFrames[0]!.prizes[0]!.typeId).toBe('P995');
    expect(afterFrames[0]!.prizes[0]!.motionTypeId).toBe('P023');
    expect(run.frames[0]!.prizes[0]!.motionTypeId).toBeUndefined();
    world.dispose();
  });

  it('a transformed mounted prize survives a re-sync from its state (motionTypeId keeps the old motion)', async () => {
    const cat = catalogWithTwins();
    const slider = spawnPrize(cat, ty('P023'), slot('slot-r2-c04'), 1, 0);
    const world = await worldWith(cat, [slider]);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(slider, 'P995')]) });
    world.syncShelf(shelfOf([...run.record.remainingPrizes]), 1.0);
    const f0 = world.frame().prizes[0]!;
    expect(f0.mounted).toBe(true);
    world.step(0.5);
    const f1 = world.frame().prizes[0]!;
    expect(f1.position.x).not.toBeCloseTo(f0.position.x, 3);
    world.dispose();
  });

  it('a kind change keeps velocity: a pushed prize ends where the untouched control ends', async () => {
    const cat = catalogWithTwins();
    const prize = spawnPrize(cat, ty('P001'), slot('slot-r3-c04'), 1, 0);
    const target = prize.pose.position;
    const shotAt = () => straightAt({ x: target.x, y: target.y + 0.02, z: -1.0 }, { x: target.x, y: target.y + 0.02, z: -1.6 });
    // a limit of one reflection (test-only clamp range) ends the cork at the hit, so the barrier comes while the prize still moves
    const oneBounce: TuningConfig = { ...T36, limits: { ...T36.limits, maxReflectionsPerCork: 1 } };
    const loose: ShotWorldOptions = { limits: { reflections: { min: 1, max: 10 }, maxPowerMultiplier: 4 } };
    const control = await worldWith(cat, [prize], oneBounce, loose);
    const c = runExpanded(control, shotAt(), expandedCtx());
    const moving = c.barriers[0]!.motion.find((m) => m.instanceId === prize.instanceId)!;
    expect(Math.hypot(moving.linvel.x, moving.linvel.y, moving.linvel.z)).toBeGreaterThan(0.05);
    const world = await worldWith(cat, [prize], oneBounce, loose);
    const r = runExpanded(world, shotAt(), expandedCtx(), { makePlan: (b) => planFor(b, [intentFor(prize, 'P998')]) });
    expect(r.record.appliedTransforms).toHaveLength(1);
    const end = (rec: typeof c.record) => (rec.remainingPrizes[0] ?? { pose: { position: { x: NaN, y: NaN, z: NaN } } }).pose.position;
    expect(c.record.remainingPrizes).toHaveLength(1);
    expect(r.record.remainingPrizes).toHaveLength(1);
    expect(end(r.record).x).toBeCloseTo(end(c.record).x, 2);
    expect(end(r.record).y).toBeCloseTo(end(c.record).y, 2);
    expect(end(r.record).z).toBeCloseTo(end(c.record).z, 2);
    control.dispose();
    world.dispose();
  });

  it('modifiers do not leak into a rules-v1 style context: the same shot without expanded has no barrier', async () => {
    const cat = catalogWithTwins();
    const world = await worldWith(cat, []);
    world.fire(harmlessRequest(), { runId: mintId.run('x'), chooseTransform: () => null });
    let barrier = null;
    let record = null;
    for (let i = 0; i < 600 && !record; i++) {
      const s = world.step(1 / 60);
      barrier = barrier ?? s.barrier;
      record = s.record;
    }
    expect(barrier).toBeNull();
    expect(record).not.toBeNull();
    expect(BASE_SHOT_MODIFIERS.launch.count).toBe(1);
    world.dispose();
  });
});
