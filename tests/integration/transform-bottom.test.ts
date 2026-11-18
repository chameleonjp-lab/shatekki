import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { planFlightEnd } from '../../src/core/effect-plan';
import { resolveExpandedShot } from '../../src/core/expanded-settlement';
import { reduceGame } from '../../src/core/transitions';
import { applyFrame, createSceneGraph } from '../../src/view';
import { BOOTH_LAYOUT_V2, type RunState, type ShotRequest, mintId, asPrizeTypeId, type CollisionShape, type EffectRequestId, type MotionSpec, type PrizeInstanceState } from '../../src/contracts';
import { spawnPrize } from '../../src/core/replenish';
import { prizeAabb } from '../../src/core/shapes';
import { createShotWorld } from '../../src/sim/world';
import { CAT, T, toAiming } from '../unit/helpers';
import { expandedCtx, harmlessRequest, planFor, runExpanded, straightAt } from './expanded-helpers';

const box = (x: number, y: number): CollisionShape => ({ kind: 'box', halfExtents: { x, y, z: 0.06 } });
const oldId = asPrizeTypeId('P001');
const newId = asPrizeTypeId('P002');
const newShape = box(0.17, 0.075);
const oldMotion: MotionSpec = { type: 'swing', amplitudeRad: 0.35, periodSec: 2 };
const slot = BOOTH_LAYOUT_V2.slots[24]!;
const tuning = { ...T, shelfSlotCount: 36 };
function catalog(motion: MotionSpec) {
  const prizes = new Map(CAT.prizes);
  prizes.set(oldId, { ...prizes.get(oldId)!, motion, shape: box(0.04, 0.04) });
  prizes.set(newId, { ...prizes.get(newId)!, motion: { type: 'none' }, shape: newShape });
  return { ...CAT, prizes };
}
const shelf = (prizes: readonly PrizeInstanceState[]) => ({ prizes, deferredSlots: [], nextInstanceNumber: 3 });
describe('supported-bottom transform in the physics world', () => {
  it('changes shape at the barrier, preserves old swing, bottom and phase after a saved restore', async () => {
    const cat = catalog(oldMotion);
    const world = await createShotWorld(BOOTH_LAYOUT_V2, cat, tuning, { transformPolicy: 'preserve-supported-bottom' });
    const prize = spawnPrize(cat, oldId, slot, 1, 0);
    world.syncShelf(shelf([prize]), 0);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), {
      makePlan: b => planFor(b, [{ requestId: 'swap' as EffectRequestId, instanceId: prize.instanceId, candidateTypeIds: [newId] }]),
    });
    const after = run.record.remainingPrizes[0]!;
    expect(after.typeId).toBe(newId);
    expect(after.motionAnchor?.motionTypeId).toBe(oldId);
    const resumed = await createShotWorld(BOOTH_LAYOUT_V2, cat, tuning, { transformPolicy: 'preserve-supported-bottom' });
    resumed.syncShelf(JSON.parse(JSON.stringify(shelf([after]))), run.record.simTimeSec);
    const before = run.barriers[0]!.prizes[0]!.pose;
    const oldBox = prizeAabb(cat.prizes.get(oldId)!.shape, before);
    const bottom = oldBox.center.y - oldBox.halfExtents.y;
    for (let k = 0; k < 240; k++) {
      const p = world.step(1 / 60).frame.prizes[0]!;
      const q = resumed.step(1 / 60).frame.prizes[0]!;
      const bounds = prizeAabb(newShape, p);
      expect(bounds.center.y - bounds.halfExtents.y).toBeCloseTo(bottom, 5);
      expect(q.position.x).toBeCloseTo(p.position.x, 5);
      expect(q.position.y).toBeCloseTo(p.position.y, 5);
      expect(q.rotation.z).toBeCloseTo(p.rotation.z, 5);
    }
    const graph = createSceneGraph({layout: BOOTH_LAYOUT_V2, resolvePrize: id => cat.prizes.get(id)!});
    applyFrame(graph, resumed.frame());
    const mesh = graph.prizes.get(prize.instanceId)!;
    expect(mesh.typeId).toBe(newId);
    expect(mesh.mesh.position.toArray()).toEqual(Object.values(resumed.frame().prizes[0]!.position));
    expect(mesh.proxy.position.toArray()).toEqual(mesh.mesh.position.toArray());
    graph.dispose();
    world.dispose();
    resumed.dispose();
  });
});

it('defers an empty slot occupied by a non-series kind and refills it once after the blocker is shot away', async () => {
  const bundle = getGameplayBundle('expanded-proposed');
  const ctx = { ...bundle, expansion: bundle.expansion!, transformPolicy: 'preserve-supported-bottom' as const };
  const world = await createShotWorld(ctx.layout, ctx.catalog, ctx.tuning, ctx);
  const series = [...ctx.expansion.series.values()][0]!;
  const cfg = [...ctx.catalog.prizes.values()].find(p => !series.typeIds.includes(p.typeId) && p.motion.type === 'none')!;
  const initial = createExpandedRun({ runId: mintId.run('blocked-slot'), seed: 42, tuning: ctx.tuning, playerName: null }, ctx);
  const blocker = spawnPrize(ctx.catalog, cfg.typeId, slot, 1, 0);
  const target = { ...blocker.pose.position, z: slot.spawnBase.z + 0.11 };
  let state: RunState = {
    ...initial,
    expansion: { ...initial.expansion, assortmentSeries: series.seriesId },
    shelf: {
      prizes: [{ ...blocker, hp: 1, homeSlot: ctx.layout.slots[25]!.slotId, pose: { ...blocker.pose, position: target } }],
      deferredSlots: [slot.slotId], nextInstanceNumber: 2,
    },
  };
  function play(request: ShotRequest): void {
    world.syncShelf(state.shelf, state.clocks.motionSec);
    state = reduceGame(toAiming(state), { type: 'FIRE' }, ctx);
    const result = runExpanded(world, request, { ...expandedCtx(), runId: state.runId }, {
      makePlan: barrier => {
        state = planFlightEnd(state, barrier, ctx);
        return state.inFlight!.plan!;
      },
    });
    state = resolveExpandedShot(state, result.record, ctx).state;
  }
  play(harmlessRequest());
  expect(state.shelf.deferredSlots).toEqual([slot.slotId]);
  expect(state.shelf.nextInstanceNumber).toBe(2);
  play(straightAt({ ...target, z: target.z - 0.25 }, target, 2));
  expect(state.shelf.deferredSlots).toEqual([]);
  expect(state.shelf.prizes.filter(p => p.homeSlot === slot.slotId)).toHaveLength(1);
  expect(state.shelf.prizes.every(p => series.typeIds.includes(p.typeId))).toBe(true);
  const afterRefill = state.shelf.nextInstanceNumber;
  play(harmlessRequest(3));
  expect(state.shelf.nextInstanceNumber).toBe(afterRefill);
  world.dispose();
});
