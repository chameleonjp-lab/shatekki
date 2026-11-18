import type RAPIER from '@dimforge/rapier3d-compat';
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { planFlightEnd, type ExpandedPlanContext } from '../../src/core/effect-plan';
import { resolveExpandedShot } from '../../src/core/expanded-settlement';
import { reduceGame, tickRun } from '../../src/core/transitions';
import { translate, type UiKey } from '../../src/i18n';
import { expandedLine } from '../../src/i18n/expanded-content';
import { effectResultsModel } from '../../src/ui/effect-results';
import { applyFrame, createSceneGraph } from '../../src/view';
import { BOOTH_LAYOUT_V2, type RunState, type ShotWorld, type ShotRequest, mintId, asPrizeTypeId, type CollisionShape, type EffectRequestId, type MotionSpec, type PrizeInstanceState } from '../../src/contracts';
import { replenish, spawnPrize } from '../../src/core/replenish';
import { rewardDevicesFor } from '../../src/core/rewards';
import { mountBasePose, mountedPoseForShape } from '../../src/sim/motion';
import { prizeAabb } from '../../src/core/shapes';
import { createShotWorld } from '../../src/sim/world';
import { CAT, T } from '../unit/helpers';
import { expandedCtx, harmlessRequest, inspectRapierWorld, planFor, runExpanded, straightAt } from './expanded-helpers';

const box = (x: number, y: number): CollisionShape => ({ kind: 'box', halfExtents: { x, y, z: 0.06 } });
const oldId = asPrizeTypeId('P001');
const newId = asPrizeTypeId('P002');
const wideBox = box(0.17, 0.075);
const oldMotion: MotionSpec = { type: 'swing', amplitudeRad: 0.35, periodSec: 2 };
const slot = BOOTH_LAYOUT_V2.slots[24]!;
const tuning = { ...T, shelfSlotCount: 36 };
function catalog(motion: MotionSpec) {
  const prizes = new Map(CAT.prizes);
  prizes.set(oldId, { ...prizes.get(oldId)!, motion, shape: box(0.04, 0.04) });
  prizes.set(newId, { ...prizes.get(newId)!, motion: { type: 'none' }, shape: wideBox });
  return { ...CAT, prizes };
}
const shelf = (prizes: readonly PrizeInstanceState[]) => ({ prizes, deferredSlots: [], nextInstanceNumber: 3 });
const candidate = getGameplayBundle('expanded-next');
const candidateOptions = {
  transformPolicy: candidate.behavior!.transformPolicy,
  rewardDevices: rewardDevicesFor(candidate.expansion!.profile.rewards ?? null),
};

function playShot(world: ShotWorld, initial: RunState, request: ShotRequest, ctx: ExpandedPlanContext) {
  let state = reduceGame(initial, { type: 'CONFIRM_POSITION' }, ctx);
  const sweetSpotSec = ctx.tuning.loading.barPeriodSec * ctx.tuning.loading.sweetSpot / 2;
  const chargeTicks = Math.round(sweetSpotSec * 60);
  for (let i = 0; i < chargeTicks; i++) state = tickRun(state, 1 / 60, ctx.tuning);
  state = reduceGame(state, { type: 'STOP_LOAD' }, ctx);
  state = reduceGame(state, { type: 'FIRE' }, ctx);
  world.syncShelf(state.shelf, state.clocks.motionSec);
  const run = runExpanded(world, { ...request, load: state.load! }, { ...expandedCtx(), runId: state.runId }, {
    makePlan: barrier => {
      state = planFlightEnd(state, barrier, ctx);
      return state.inFlight!.plan!;
    },
  });
  return { ...run, ...resolveExpandedShot(state, run.record, ctx) };
}

describe('supported-bottom transform in the physics world', () => {
  it.each([
    { label: 'wide box', cat: catalog(oldMotion), oldKind: oldId, newKind: newId, settings: tuning,
      options: { transformPolicy: 'preserve-supported-bottom' as const } },
    { label: 'r006', cat: candidate.catalog, oldKind: asPrizeTypeId('P019'), newKind: asPrizeTypeId('P001'),
      settings: candidate.tuning, options: candidateOptions },
  ])('$label changes shape at the barrier and preserves the old swing, bottom and phase after restore', async ({ cat, oldKind, newKind, settings, options }) => {
    const world = await createShotWorld(BOOTH_LAYOUT_V2, cat, settings, options);
    const source = cat.prizes.get(oldKind)!;
    const target = cat.prizes.get(newKind)!;
    if (source.motion.type !== 'swing') throw new Error('requires a swinging source');
    const prize = { ...spawnPrize(cat, oldKind, slot, 1, 0), hp: 1 };
    world.syncShelf(shelf([prize]), 0);
    const run = runExpanded(world, harmlessRequest(), expandedCtx(), {
      makePlan: b => planFor(b, [{ requestId: 'swap' as EffectRequestId, instanceId: prize.instanceId, candidateTypeIds: [newKind] }]),
    });
    const after = run.record.remainingPrizes[0]!;
    expect(run.barriers[0]!.prizes[0]!.typeId).toBe(oldKind);
    expect(after.typeId).toBe(newKind);
    expect(run.record.appliedTransforms).toHaveLength(1);
    expect(after.hp).toBe(Math.round(target.maxHp / source.maxHp));
    expect(after.motionAnchor?.motionTypeId).toBe(oldKind);
    const resumed = await createShotWorld(BOOTH_LAYOUT_V2, cat, settings, options);
    resumed.syncShelf(JSON.parse(JSON.stringify(shelf([after]))), run.record.simTimeSec);
    const before = run.barriers[0]!.prizes[0]!.pose;
    const oldBox = prizeAabb(source.shape, before);
    const bottom = oldBox.center.y - oldBox.halfExtents.y;
    expect(Math.abs(bottom - slot.spawnBase.y)).toBeLessThan(0.01);
    const rotations: number[] = [];
    const periodTicks = Math.round(source.motion.periodSec * 60);
    for (let k = 0; k < 2 * periodTicks; k++) {
      const idle = world.step(1 / 60);
      expect(idle.record).toBeNull();
      expect(idle.frame.events).toEqual([]);
      expect(idle.frame.prizes).toHaveLength(1);
      const p = idle.frame.prizes[0]!;
      rotations.push(p.rotation.z);
      const q = resumed.step(1 / 60).frame.prizes[0]!;
      const bounds = prizeAabb(target.shape, p);
      expect(bounds.center.y - bounds.halfExtents.y).toBeCloseTo(bottom, 5);
      expect(q.position.x).toBeCloseTo(p.position.x, 5);
      expect(q.position.y).toBeCloseTo(p.position.y, 5);
      expect(q.rotation.z).toBeCloseTo(p.rotation.z, 5);
    }
    expect(Math.max(...rotations) - Math.min(...rotations)).toBeGreaterThan(0.2);
    for (let i = 0; i < periodTicks; i++) expect(rotations[i + periodTicks]).toBeCloseTo(rotations[i]!, 5);
    const graph = createSceneGraph({layout: BOOTH_LAYOUT_V2, resolvePrize: id => cat.prizes.get(id)!});
    applyFrame(graph, resumed.frame());
    const mesh = graph.prizes.get(prize.instanceId)!;
    expect(mesh.typeId).toBe(newKind);
    expect(mesh.mesh.position.toArray()).toEqual(Object.values(resumed.frame().prizes[0]!.position));
    expect(mesh.proxy.position.toArray()).toEqual(mesh.mesh.position.toArray());
    graph.dispose();
    world.dispose();
    resumed.dispose();
  });
});

it.each(['expanded-proposed', 'expanded-next'] as const)('%s keeps the blocker and refills its occupied slot once after collection', async key => {
  const bundle = getGameplayBundle(key);
  const ctx = { ...bundle, expansion: bundle.expansion!, transformPolicy: bundle.behavior?.transformPolicy ?? 'preserve-supported-bottom' as const };
  const world = await createShotWorld(ctx.layout, ctx.catalog, ctx.tuning, key === 'expanded-next' ? candidateOptions : {
    transformPolicy: 'preserve-supported-bottom',
  });
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
    state = playShot(world, state, request, ctx).state;
  }
  play(harmlessRequest());
  expect(state.shelf.prizes).toHaveLength(1);
  expect(state.shelf.prizes[0]).toMatchObject({ instanceId: blocker.instanceId, typeId: cfg.typeId, hp: 1 });
  expect(state.shelf.prizes[0]!.pose.position.x).toBeCloseTo(target.x, 3);
  expect(state.shelf.prizes[0]!.pose.position.z).toBeCloseTo(target.z, 3);
  expect(state.draw).toEqual(initial.draw);
  expect(state.collected).toEqual([]);
  expect(state.shelf.deferredSlots).toEqual([slot.slotId]);
  expect(state.shelf.nextInstanceNumber).toBe(2);
  play(straightAt({ ...target, z: target.z - 0.25 }, target, 2));
  expect(state.shelf.deferredSlots).toEqual([]);
  expect(state.shelf.prizes.filter(p => p.homeSlot === slot.slotId)).toHaveLength(1);
  expect(state.shelf.prizes.every(p => series.typeIds.includes(p.typeId))).toBe(true);
  expect(state.shelf.prizes.every(p => p.hp === p.maxHp && !p.collected && p.instanceId !== blocker.instanceId)).toBe(true);
  expect(state.collected.map(p => p.instanceId)).toEqual([blocker.instanceId]);
  const afterRefill = state.shelf.nextInstanceNumber;
  play(harmlessRequest(3));
  expect(state.shelf.nextInstanceNumber).toBe(afterRefill);
  expect(state.collected.map(p => p.instanceId)).toEqual([blocker.instanceId]);
  world.dispose();
});

it('r006 can refill each of its 36 slots using new full-health individuals', () => {
  const ctx = { ...candidate, expansion: candidate.expansion!, transformPolicy: candidateOptions.transformPolicy };
  const initial = createExpandedRun({ runId: mintId.run('all-slots'), seed: 42, tuning: ctx.tuning, playerName: null }, ctx);
  const slots = ctx.layout.slots.map(s => s.slotId);
  const { spawned, shelf } = replenish({
    shelf: { ...initial.shelf, prizes: [] }, newlyEmptySlots: slots, draw: initial.draw, motionSec: 0,
  }, ctx.catalog, ctx.tuning, ctx.layout);
  expect(slots).toHaveLength(36);
  expect(spawned.map(p => p.homeSlot)).toEqual(slots);
  expect(shelf.deferredSlots).toEqual([]);
  const oldIds = new Set(initial.shelf.prizes.map(p => p.instanceId));
  expect(new Set(spawned.map(p => p.instanceId)).size).toBe(36);
  expect(spawned.every(p => !oldIds.has(p.instanceId) && p.hp === ctx.catalog.prizes.get(p.typeId)!.maxHp && !p.collected)).toBe(true);
});

it('r006 defers overlapping travel paths, retries the same types after the blocker is shot away, and leaves the other change independent', async () => {
  const ctx = { ...candidate, expansion: candidate.expansion!, transformPolicy: candidateOptions.transformPolicy };
  const world = await createShotWorld(ctx.layout, ctx.catalog, ctx.tuning, candidateOptions);
  try {
    const sliderHome = ctx.layout.slots[4]!;
    const type = asPrizeTypeId;
    const sliderSlot = { ...sliderHome, spawnBase: { ...sliderHome.spawnBase, z: sliderHome.spawnBase.z + 0.10 } };
    const slider = { ...spawnPrize(ctx.catalog, type('P077'), sliderSlot, 1, 0), hp: 1,
      motionAnchor: { motionTypeId: type('P077'), base: mountBasePose(sliderSlot, ctx.catalog.prizes.get(type('P077'))!) } };
    const otherSlot = ctx.layout.slots[5]!;
    const neighbor = spawnPrize(ctx.catalog, type('P023'), otherSlot, 2, 0);
    const base = mountBasePose(otherSlot, ctx.catalog.prizes.get(neighbor.typeId)!);
    const position = { ...base.position, x: sliderHome.spawnBase.x + 0.235, z: sliderSlot.spawnBase.z };
    const blocker = { ...neighbor, hp: 1, motionAnchor: { motionTypeId: neighbor.typeId, base: { ...base, position } } };
    const distant = spawnPrize(ctx.catalog, type('P019'), ctx.layout.slots[8]!, 3, 0);
    const retry = { instanceId: slider.instanceId, requestId: 'sweep' as EffectRequestId, candidateTypeIds: [type('P001'), type('P006')] };
    const independent = { instanceId: distant.instanceId, requestId: 'remote' as EffectRequestId, candidateTypeIds: [type('P007')] };
    const start = createExpandedRun({ runId: mintId.run('swept'), seed: 4, tuning: ctx.tuning, playerName: null }, ctx);
    const first = playShot(world, { ...start,
      shelf: { prizes: [slider, blocker, distant], deferredSlots: [], nextInstanceNumber: 4 },
      expansion: { ...start.expansion, deferredTransforms: [retry, independent] },
    }, harmlessRequest(), ctx);
    const atBarrier = first.barriers[0]!.prizes;
    const oldPose = atBarrier.find(p => p.instanceId === slider.instanceId)!.pose;
    const neighborPose = atBarrier.find(p => p.instanceId === blocker.instanceId)!.pose;
    const neighborBox = prizeAabb(ctx.catalog.prizes.get(blocker.typeId)!.shape, neighborPose);
    for (const kind of retry.candidateTypeIds) {
      const nextBox = prizeAabb(ctx.catalog.prizes.get(kind)!.shape, oldPose);
      const gap = neighborBox.center.x - nextBox.center.x - neighborBox.halfExtents.x - nextBox.halfExtents.x;
      expect(gap).toBeGreaterThan(0.01); // the snapshot alone would have accepted either kind
      const targetShape = ctx.catalog.prizes.get(kind)!.shape;
      const sliderMotion = ctx.catalog.prizes.get(slider.typeId)!.motion;
      const neighborConfig = ctx.catalog.prizes.get(blocker.typeId)!;
      // The 3.2 s and 4 s slides repeat together after 16 s.
      let minGap = gap;
      for (let tick = 0; tick <= 16 * 60; tick++) {
        const a = mountedPoseForShape(slider.motionAnchor.base, sliderMotion, targetShape, tick / 60);
        const b = mountedPoseForShape(blocker.motionAnchor.base, neighborConfig.motion, neighborConfig.shape, tick / 60);
        minGap = Math.min(minGap, b.position.x - a.position.x - neighborBox.halfExtents.x - nextBox.halfExtents.x);
      }
      expect(minGap).toBeLessThan(-0.01);
    }
    expect(first.state.expansion!.deferredTransforms).toEqual([retry]);
    expect(effectResultsModel(first.summary, {
      t: (key, params) => translate('ja', key as UiKey, params),
      line: key => expandedLine('ja', key),
    }).deferred).toBe('1個の景品は形が合わないため、あとで変わります');
    expect(first.record.appliedTransforms?.map(p => p.instanceId)).toEqual([distant.instanceId]);
    const held = first.state.shelf.prizes.find(p => p.instanceId === slider.instanceId)!;
    expect(held).toMatchObject({ typeId: slider.typeId, hp: 1 });
    const target = first.state.shelf.prizes.find(p => p.instanceId === blocker.instanceId)!.pose.position;
    const shot = playShot(world, first.state, straightAt({ ...target, z: target.z - 0.22 }, target, 2), ctx);
    expect(shot.record.collected).toContainEqual({ instanceId: blocker.instanceId, typeId: blocker.typeId });
    expect(shot.state.expansion!.deferredTransforms).toEqual([]);
    expect(shot.record.transforms).toEqual([expect.objectContaining({
      instanceId: slider.instanceId, toTypeId: retry.candidateTypeIds[0], hpBefore: 1, maxHpBefore: 2, hpAfter: 3, maxHpAfter: 5,
    })]);
    expect(shot.state.shelf.prizes.some(p => p.instanceId === blocker.instanceId)).toBe(false);
  } finally { world.dispose(); }
});

it('r006 changes a moving prize directly to the final type with one HP rounding and preserved physical velocities', async () => {
  // Read the actual body at the barrier, before another timestep applies gravity or friction.
  const { world, rapier } = await inspectRapierWorld(() =>
    createShotWorld(candidate.layout, candidate.catalog, candidate.tuning, candidateOptions));
  try {
    const source = { ...spawnPrize(candidate.catalog, asPrizeTypeId('P017'), candidate.layout.slots[4]!, 1, 0), hp: 2 };
    const middle = asPrizeTypeId('P078'), final = asPrizeTypeId('P001');
    const request: ShotRequest = {
      shotId: mintId.shot(1), origin: { x: -0.542862247582525, y: 1.25, z: -0.3 },
      direction: { x: -0.044602102293905946, y: 0.2517893506265385, z: -0.9667537304722593 },
      bulletType: 'standard', load: { barValue: 0.85, tier: 'perfect', damageMultiplier: 1.5, pushMultiplier: 1.35 },
    };
    world.syncShelf(shelf([source]), 0);
    world.fire(request, expandedCtx());
    const dt = candidate.tuning.limits.fixedStepSec;
    let tick = world.step(dt);
    for (let i = 0; i < 600 && !tick.barrier; i++) tick = world.step(dt);
    const before = tick.barrier!.prizes[0]!;
    const motion = tick.barrier!.motion[0]!;
    expect(Math.hypot(motion.linvel.x, motion.linvel.y, motion.linvel.z)).toBeGreaterThan(0.2);
    expect(Math.hypot(motion.angvel.x, motion.angvel.y, motion.angvel.z)).toBeGreaterThan(2);
    const firstId = mintId.effectRequest(request.shotId, 0);
    const lastId = mintId.effectRequest(request.shotId, 1);
    expect(world.resumeAfterEffects(planFor(tick.barrier!, [
      { instanceId: source.instanceId, requestId: firstId, candidateTypeIds: [middle] },
      { instanceId: source.instanceId, requestId: lastId, candidateTypeIds: [final] },
    ]))).toBe(true);
    const physical = world.frame().prizes[0]!;
    expect(physical).toMatchObject({ instanceId: source.instanceId, typeId: final, mounted: false, hp: 1 });
    expect(physical.position.x).toBeCloseTo(before.pose.position.x, 6);
    expect(physical.position.z).toBeCloseTo(before.pose.position.z, 6);
    expect(physical.rotation).toEqual(before.pose.rotation);
    const dynamic: RAPIER.RigidBody[] = [];
    rapier.forEachRigidBody(body => { if (body.isDynamic()) dynamic.push(body); });
    expect(dynamic).toHaveLength(1);
    expect(dynamic[0]!.linvel()).toMatchObject(motion.linvel);
    expect(dynamic[0]!.angvel()).toMatchObject(motion.angvel);

    for (let i = 0; i < 1500 && !tick.record; i++) tick = world.step(dt);
    const record = tick.record!;
    expect(record.appliedTransforms).toEqual([{ instanceId: source.instanceId, requestId: lastId, fromTypeId: source.typeId, toTypeId: final }]);
    expect(record.transforms).toHaveLength(1);
    const middleHp = candidate.catalog.prizes.get(middle)!.maxHp;
    expect(Math.round(before.hp / before.maxHp * middleHp)).toBe(0);
    expect(Math.round(before.hp / before.maxHp * physical.maxHp)).toBe(1);
    expect(record.collected).toHaveLength(0);
    expect(record.remainingPrizes[0]).toMatchObject({ homeSlot: source.homeSlot, mounted: false, typeId: final, hp: 1 });
  } finally { world.dispose(); }
});
