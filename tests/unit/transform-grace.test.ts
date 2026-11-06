import { describe, expect, it } from 'vitest';
import { createShotWorld } from '../../src/sim/world';
import {
  BOOTH_LAYOUT,
  asPrizeTypeId,
  type PrizeInstanceState,
  type PrizeRuntimeConfig,
  type RuntimeCatalog,
  type ShotContext,
  type SimEvent,
} from '../../src/contracts';
import { spawnPrize } from '../../src/core/replenish';
import { CAT, T, ballisticDir, makeRequest, shotCtx } from './helpers';
import { layoutWith, plate, runFull, straight } from './device-helpers';

const A = asPrizeTypeId('P001'); // flat box, 8 cm tall
const B = asPrizeTypeId('P002'); // replaced below by a top-heavy twin of A with maxHp 20

function catalogWithTwin(): RuntimeCatalog {
  const a = CAT.prizes.get(A)!;
  const twin: PrizeRuntimeConfig = { ...a, typeId: B, maxHp: 20, centerOfMass: { x: 0, y: 0, z: 0.05 } };
  return { ...CAT, prizes: new Map([...CAT.prizes, [A, { ...a, maxHp: 8 }], [B, twin]]) };
}

const slotGeom = (id: string) => BOOTH_LAYOUT.slots.find((s) => s.slotId === id)!;

/** Prize of type A on tier 0 whose centre is 5 mm inside the front (player side) edge. */
function edgePrize(cat: RuntimeCatalog, hp: number): PrizeInstanceState {
  const base = spawnPrize(cat, A, slotGeom('t0c0'), 1, 0);
  const frontEdgeZ = BOOTH_LAYOUT.tiers[0]!.centerZ + BOOTH_LAYOUT.tiers[0]!.depth / 2;
  return { ...base, hp, pose: { ...base.pose, position: { ...base.pose.position, z: frontEdgeZ - 0.005 } } };
}

const stageOrder = (events: readonly SimEvent[]) =>
  events.filter((e) => e.type === 'shotStage' || e.type === 'prizeTransformed' || e.type === 'prizeReachedCollection').map((e) => (e.type === 'shotStage' ? `stage:${e.stage}` : e.type));

describe('transform (decision 32, AC44)', () => {
  // the device is a narrow plate on the right, the prize sits at the left of tier 0
  const dev = plate('transform', 'dev-transform', 0.7, 0.2, -1.2);
  const fireAtPlate = () => makeRequest({ origin: { x: 0.7, y: 1.25, z: -0.3 }, direction: straight });

  it('control: without a transform the balanced prize stays on the shelf', async () => {
    const cat = catalogWithTwin();
    const world = await createShotWorld(layoutWith([dev], false), cat, T);
    world.syncShelf({ prizes: [edgePrize(cat, 2)], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const run = runFull(world, fireAtPlate(), { ...shotCtx, chooseTransform: () => null });
    expect(run.record.deviceActivations.map((d) => d.kind)).toEqual(['transform']);
    expect(run.record.transforms).toHaveLength(0);
    expect(run.record.collected).toHaveLength(0);
    expect(run.record.remainingPrizes).toHaveLength(1);
    world.dispose();
  });

  it('applies after the flight ends and before settlement; HP 2/8 -> max 20 -> 5; the transformed prize falling in the same shot counts', async () => {
    const cat = catalogWithTwin();
    const world = await createShotWorld(layoutWith([dev], false), cat, T);
    const prize = edgePrize(cat, 2);
    expect(prize.maxHp).toBe(8);
    world.syncShelf({ prizes: [prize], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    let offered: PrizeInstanceState[] = [];
    const ctx: ShotContext = {
      ...shotCtx,
      chooseTransform: (c) => {
        offered = [...c];
        return { instanceId: prize.instanceId, toTypeId: B };
      },
    };
    const run = runFull(world, fireAtPlate(), ctx);
    expect(offered.map((p) => p.instanceId)).toEqual([prize.instanceId]);
    expect(run.record.transforms).toHaveLength(1);
    const t = run.record.transforms[0]!;
    expect([t.fromTypeId, t.toTypeId]).toEqual([A, B]);
    expect([t.hpBefore, t.maxHpBefore, t.hpAfter, t.maxHpAfter]).toEqual([2, 8, 5, 20]);
    // order: flight -> transform stage -> prizeTransformed -> settle -> (fall) collection
    const order = stageOrder(run.events);
    expect(order.indexOf('stage:transform')).toBeLessThan(order.indexOf('prizeTransformed'));
    expect(order.indexOf('prizeTransformed')).toBeLessThan(order.indexOf('stage:settle'));
    expect(order.indexOf('stage:settle')).toBeLessThan(order.indexOf('prizeReachedCollection'));
    expect(order.indexOf('stage:flight')).toBeLessThan(order.indexOf('stage:transform'));
    // the new shape/centre of mass made it tip off the edge and it is collected in this same shot, as the new kind
    expect(run.record.collected).toEqual([{ instanceId: prize.instanceId, typeId: B }]);
    expect(run.record.prizeOutcomes.find((o) => o.instanceId === prize.instanceId)?.typeId).toBe(B);
    expect(run.record.remainingPrizes).toHaveLength(0);
    world.dispose();
  });

  it('never offers collected or mounted prizes; an unknown or same-type choice is ignored', async () => {
    const cat = catalogWithTwin();
    const world = await createShotWorld(layoutWith([dev], false), cat, T);
    const fish = [...cat.prizes.values()].find((p) => p.motion.type !== 'none')!;
    const mounted = spawnPrize(cat, fish.typeId, slotGeom('t1c1'), 2, 0);
    expect(mounted.mounted).toBe(true);
    const normal = { ...edgePrize(cat, 8), instanceId: spawnPrize(cat, A, slotGeom('t0c1'), 3, 0).instanceId };
    world.syncShelf({ prizes: [mounted, normal], deferredSlots: [], nextInstanceNumber: 4 }, 0);
    let offered: string[] = [];
    const ctx: ShotContext = {
      ...shotCtx,
      chooseTransform: (c) => {
        offered = c.map((p) => p.instanceId);
        return { instanceId: normal.instanceId, toTypeId: A }; // same type: ignored
      },
    };
    const run = runFull(world, fireAtPlate(), ctx);
    expect(offered).toEqual([normal.instanceId]);
    expect(run.record.transforms).toHaveLength(0);
    world.dispose();
  });

  it('a second transform plate in the same shot does not transform twice', async () => {
    const cat = catalogWithTwin();
    const world = await createShotWorld(layoutWith([dev]), cat, T);
    const prize = edgePrize(cat, 8);
    world.syncShelf({ prizes: [prize], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    let calls = 0;
    const run = runFull(world, fireAtPlate(), {
      ...shotCtx,
      chooseTransform: () => {
        calls += 1;
        return null;
      },
    });
    expect(calls).toBe(1);
    expect(run.record.deviceActivations).toHaveLength(1);
    world.dispose();
  });
});

describe('fall grace (decision 33, AC45, AC19)', () => {
  /** A prize at the back edge of the top tier; one cork knocks it off and the reflection limit ends the flight at once. */
  const backEdgePrize = (cat: RuntimeCatalog): PrizeInstanceState => {
    const base = spawnPrize(cat, A, slotGeom('t2c1'), 1, 0);
    const tier = BOOTH_LAYOUT.tiers[2]!;
    const backEdgeZ = tier.centerZ - tier.depth / 2;
    return { ...base, pose: { ...base.pose, position: { ...base.pose.position, z: backEdgeZ + 0.01 } } };
  };
  const toPrize = (p: PrizeInstanceState) => {
    const muzzle = { x: 0, y: BOOTH_LAYOUT.camera.muzzle.y, z: BOOTH_LAYOUT.camera.muzzle.z };
    const target = { x: p.pose.position.x, y: p.pose.position.y + 0.05, z: p.pose.position.z + 0.08 };
    return makeRequest({ direction: ballisticDir(muzzle, target) });
  };
  const tuned = (over: Partial<typeof T.limits>) => ({ ...T, limits: { ...T.limits, maxReflectionsPerCork: 1, maxSettleSec: 0.2, ...over } });

  it('a prize already falling when the limit is hit is still collected within the grace', async () => {
    const tuning = tuned({ fallGraceSec: 1.5 });
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, tuning);
    const p = backEdgePrize(CAT);
    world.syncShelf({ prizes: [p], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const run = runFull(world, toPrize(p));
    expect(run.record.endedByLimit).toBe(true);
    expect(run.events.some((e) => e.type === 'shotStage' && e.stage === 'grace')).toBe(true);
    expect(run.record.collected.map((c) => c.instanceId)).toEqual([p.instanceId]);
    world.dispose();
  });

  it('with a tiny grace the shot still ends in finite time, once, without collecting the slow faller', async () => {
    const tuning = tuned({ fallGraceSec: 0.02 });
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, tuning);
    const p = backEdgePrize(CAT);
    world.syncShelf({ prizes: [p], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const run = runFull(world, toPrize(p));
    const graces = run.events.filter((e) => e.type === 'shotStage' && e.stage === 'grace');
    expect(graces.length).toBeLessThanOrEqual(1);
    expect(run.record.simTimeSec).toBeLessThanOrEqual(tuning.limits.maxFlightSec + tuning.limits.maxSettleSec + tuning.limits.fallGraceSec + 0.1);
    expect(run.record.collected).toHaveLength(0);
    world.dispose();
  });

  it('the total time of any shot never exceeds maxFlight + maxSettle + grace (never re-extended)', async () => {
    const tuning = tuned({ fallGraceSec: 1.2, maxSettleSec: 0.3 });
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, tuning);
    const p = backEdgePrize(CAT);
    world.syncShelf({ prizes: [p], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const run = runFull(world, toPrize(p));
    expect(run.events.filter((e) => e.type === 'shotStage' && e.stage === 'grace').length).toBeLessThanOrEqual(1);
    expect(run.record.simTimeSec).toBeLessThanOrEqual(tuning.limits.maxFlightSec + tuning.limits.maxSettleSec + tuning.limits.fallGraceSec + 0.1);
    world.dispose();
  });
});
