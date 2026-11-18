import type RAPIER from '@dimforge/rapier3d-compat';
import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { aimDirection, asPrizeTypeId, BASE_SHOT_MODIFIERS, muzzlePosition, type BackgroundCellId, type Vec3 } from '../../src/contracts';
import { spawnPrize } from '../../src/core/replenish';
import { rewardDevicesFor } from '../../src/core/rewards';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, inspectRapierWorld, planFor, runExpanded } from './expanded-helpers';

const bundle = getGameplayBundle('expanded-next');
const { layout, catalog, tuning } = bundle;
const cells = layout.backgroundCells!;
const cellIds = cells.map(cell => cell.cellId);

async function shoot(standX: number, target: Vec3, usable: readonly BackgroundCellId[]) {
  const world = await createShotWorld(layout, catalog, tuning, {
    transformPolicy: bundle.behavior!.transformPolicy,
    rewardDevices: rewardDevicesFor(bundle.expansion!.profile.rewards ?? null),
  });
  try {
    // Keep all 36 slots occupied with a known narrow prize so both clear and blocked rays are reproducible.
    const prizes = layout.slots.map((slot, i) => spawnPrize(catalog, asPrizeTypeId('P009'), slot, i + 1, 0));
    world.syncShelf({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 }, 0);
    const aim = aimAt(bundle, standX, target, 'standard');
    const request = makeRequest({ origin: muzzlePosition(layout, standX), direction: aimDirection(layout, standX, aim) });
    const run = runExpanded(world, request, expandedCtx({ usableCells: usable }), { dt: tuning.limits.fixedStepSec });
    return {
      first: run.impacts[0]?.target,
      firstNormal: run.impacts[0]?.normal,
      cells: run.impacts.flatMap(event => event.target.kind === 'cell' ? [event.target] : []),
      requests: run.barriers[0]!.requests.filter(request => request.source.kind === 'cell'),
    };
  } finally {
    world.dispose();
  }
}

it('r006 chooses one boundary cell and reflects off the same used cell when it is already marked used', async () => {
  const left = cells.find(cell => cell.cellId === 'cell-r2-c06')!;
  const boundary = { ...left.box.center, x: left.box.center.x + left.box.halfExtents.x };
  const fresh = await shoot(0, boundary, cellIds);
  expect(fresh.first).toMatchObject({ kind: 'cell', cellId: left.cellId, activated: true });
  expect(fresh.requests.map(request => request.targetId)).toEqual([left.cellId]);
  const used = await shoot(0, boundary, cellIds.filter(id => id !== left.cellId));
  expect(used.first).toMatchObject({ kind: 'cell', cellId: left.cellId, activated: false });
  expect(used.firstNormal!.z).toBeGreaterThan(0.9);
  expect(used.requests).toEqual([]);
});

it('r006 shields a back-wall cell behind a prize and reaches the opposite ends through the gaps', async () => {
  const slot = layout.slots.find(slot => slot.slotId === 'slot-r3-c06')!;
  const blocked = await shoot(slot.spawnBase.x, { ...slot.spawnBase, y: 0.9 }, cellIds);
  expect(blocked.first?.kind).toBe('prize');
  expect(blocked.cells.some(cell => cell.cellId === 'cell-r3-c06' && cell.activated)).toBe(false);

  for (const [id, stand, offset] of [
    ['cell-r1-c01', layout.camera.standMinX, 0.12],
    ['cell-r3-c12', layout.camera.standMaxX, 0.12],
  ] as const) {
    const box = cells.find(cell => cell.cellId === id)!.box;
    const clear = await shoot(stand, {
      x: box.center.x + offset, y: box.center.y, z: box.center.z + box.halfExtents.z,
    }, cellIds);
    expect(clear.first).toMatchObject({ kind: 'cell', cellId: id, activated: true });
    expect(clear.requests.map(request => request.targetId)).toEqual([id]);
  }
});

it('r006 reflects an original and a split-board child from the same used cell in the same fixed step', async () => {
  const world = await createShotWorld(layout, catalog, tuning, { transformPolicy: bundle.behavior!.transformPolicy,
    rewardDevices: rewardDevicesFor(bundle.expansion!.profile.rewards!), reportPrizeContacts: true });
  try {
    // Starting poses of two prizes near the upper-left corner. Every trajectory and contact comes from Rapier.
    const positions = [
      { x: -2.540563352610916, y: 1.565, z: -2.233666841089726 },
      { x: -2.582240200964734, y: 1.7358629997121169, z: -2.2200820866157303 },
    ];
    const prizes = ['P062', 'P082'].map((kind, i) => {
      const prize = spawnPrize(catalog, asPrizeTypeId(kind), layout.slots[i]!, i + 1, 0);
      return { ...prize, mounted: false, pose: { ...prize.pose, position: positions[i]! } };
    });
    world.syncShelf({ prizes, deferredSlots: [], nextInstanceNumber: 3 }, 0);
    const stand = -2.3433512056805195, aim = { yaw: -0.23466687993612143, pitch: 0.24721293860347943 };
    const request = makeRequest({ origin: muzzlePosition(layout, stand), direction: aimDirection(layout, stand, aim),
      bulletType: 'bouncy', load: { barValue: 0, tier: 'weak', damageMultiplier: 0.7, pushMultiplier: 0.75 } });
    const run = runExpanded(world, request, expandedCtx({ usableCells: cellIds, rewards: true,
      modifiers: { ...BASE_SHOT_MODIFIERS, launch: { count: 3, spreadRad: 0.175 }, speedMult: 1.2,
        gravityMult: 0.5, splitSpreadMult: 1.5, damageMult: 1.5, pushMult: 0.75 } }), { dt: tuning.limits.fixedStepSec });
    const cell = cellIds[0]!;
    const hits = run.frames.flatMap((frame, i) => frame.events.flatMap(e => e.type === 'impact' && e.target.kind === 'cell' && e.target.cellId === cell
      ? [[i + 1, e.projectileId, e.target.activated]] : []));
    expect(hits).toEqual([[21, 's01-c2', true], [30, 's01-c0', false], [30, 's01-c3', false]]);
    const launches = run.events.filter(e => e.type === 'projectileSpawned');
    expect(launches.find(e => e.projectileId === 's01-c0')?.parentId).toBeNull();
    expect(launches.find(e => e.projectileId === 's01-c3')).toMatchObject({ generation: 2, parentId: 's01-c1' });
    expect(run.barriers[0]!.requests.filter(r => r.targetId === cell)).toHaveLength(1);
  } finally { world.dispose(); }
});

it('r006 registers a falling prize touching the upper back-wall cell without activating it', async () => {
  const { world, rapier } = await inspectRapierWorld(() => createShotWorld(layout, catalog, tuning, {
    transformPolicy: bundle.behavior!.transformPolicy, rewardDevices: rewardDevicesFor(bundle.expansion!.profile.rewards!),
  }));
  try {
    const slot = layout.slots[5]!, x = slot.spawnBase.x;
    const paper = spawnPrize(catalog, asPrizeTypeId('P026'), slot, 1, 0);
    const prize = { ...paper, mounted: false, pose: { ...paper.pose, position: { ...paper.pose.position, z: -2.23 } } };
    world.syncShelf({ prizes: [prize], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const dynamic: RAPIER.Collider[] = [];
    rapier.forEachRigidBody(body => { if (body.isDynamic()) dynamic.push(body.collider(0)); });
    expect(dynamic).toHaveLength(1);
    const collider = dynamic[0]!;
    const aim = aimAt(bundle, x, prize.pose.position, 'standard');
    const request = makeRequest({ origin: muzzlePosition(layout, x), direction: aimDirection(layout, x, aim) });
    world.fire(request, expandedCtx({ usableCells: cellIds }));
    const pressed = new Set<BackgroundCellId>();
    let barriers = 0, finished = 0;
    for (let i = 0; i < 1500 && !finished; i++) {
      const result = world.step(tuning.limits.fixedStepSec);
      if (collider.isValid()) rapier.contactPairsWith(collider, other => {
        const pos = other.translation();
        const cell = cells.find(({ box }) => Math.hypot(pos.x - box.center.x, pos.y - box.center.y, pos.z - box.center.z) < 0.00001);
        if (cell) rapier.contactPair(collider, other, manifold => {
          for (let j = 0; j < manifold.numSolverContacts(); j++) {
            if (manifold.solverContactDist(j) <= 0) pressed.add(cell.cellId);
          }
        });
      });
      expect(result.frame.events.some(e => e.type === 'impact' && e.target.kind === 'cell')).toBe(false);
      if (result.barrier) {
        barriers++;
        expect(result.barrier.requests).toHaveLength(0);
        expect(world.resumeAfterEffects(planFor(result.barrier))).toBe(true);
      }
      if (result.record) finished++;
    }
    expect([...pressed]).toEqual(['cell-r1-c06']);
    expect([barriers, finished]).toEqual([1, 1]);
  } finally { world.dispose(); }
});
