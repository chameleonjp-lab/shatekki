import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { aimDirection, asPrizeTypeId, muzzlePosition, type BackgroundCellId, type Vec3 } from '../../src/contracts';
import { spawnPrize } from '../../src/core/replenish';
import { rewardDevicesFor } from '../../src/core/rewards';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

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
