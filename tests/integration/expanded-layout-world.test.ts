import { describe, expect, it } from 'vitest';
import { createShotWorld } from '../../src/sim/world';
import { spawnPrize } from '../../src/core/replenish';
import {
  BASE_SHOT_MODIFIERS,
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  aimDirection,
  asPrizeTypeId,
  ballisticFor,
  corkFreeFlightPath,
  mintId,
  muzzlePosition,
  type BackgroundCellId,
  type BoothLayout,
  type DeviceKind,
  type ImpactEvent,
  type PrizeInstanceState,
  type ShotContext,
  type ShotRecord,
  type ShotWorld,
  type TuningConfig,
  type Vec3,
} from '../../src/contracts';
import { CAT, T, makeRequest } from '../unit/helpers';

// EG03 evidence: background-cell contacts in the real world (layout v2).

const T36: TuningConfig = { ...T, shelfSlotCount: 36, draw: { ...T.draw, tierTargets: { easy: 12, normal: 16, hard: 8 } } };
const SMALL = asPrizeTypeId('P009'); // narrow, 20 cm tall

function smallShelf(skipSlots: readonly string[] = []): PrizeInstanceState[] {
  return BOOTH_LAYOUT_V2.slots.filter((s) => !skipSlots.includes(s.slotId)).map((s, i) => spawnPrize(CAT, SMALL, s, i + 1, 0));
}

async function makeWorld(layout: BoothLayout = BOOTH_LAYOUT_V2, prizes: readonly PrizeInstanceState[] = smallShelf(), tuning: TuningConfig = T36): Promise<ShotWorld> {
  const world = await createShotWorld(layout, CAT, tuning);
  world.syncShelf({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 }, 0);
  return world;
}

/** Aim angles (relative to the zero aim) that make a free-flight cork pass through `target`. */
export function solveAim(standX: number, target: Vec3, tuning: TuningConfig = T36): { yaw: number; pitch: number } {
  const muzzle = muzzlePosition(BOOTH_LAYOUT_V2, standX);
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z));
  const spec = ballisticFor(tuning, 'standard');
  const yAtTarget = (pitch: number): number => {
    const dir = aimDirection(BOOTH_LAYOUT_V2, standX, { yaw, pitch });
    const path = corkFreeFlightPath(muzzle, dir, spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        const k = (a.z - target.z) / (a.z - b.z);
        return a.y + (b.y - a.y) * k;
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (yAtTarget(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

const cellGeom = (id: BackgroundCellId) => BOOTH_LAYOUT_V2.backgroundCells!.find((c) => c.cellId === id)!;
/** A point on the cell face, `dx` beside the cell centre. */
const cellPoint = (id: BackgroundCellId, dx: number, dy = 0): Vec3 => {
  const c = cellGeom(id);
  return { x: c.box.center.x + dx, y: c.box.center.y + dy, z: c.box.center.z + c.box.halfExtents.z };
};

interface Outcome {
  readonly impacts: ImpactEvent[];
  readonly record: ShotRecord;
}

function fireAt(world: ShotWorld, standX: number, target: Vec3, usable: readonly BackgroundCellId[] | null, tuning: TuningConfig = T36): Outcome {
  const shot = 1;
  const aim = solveAim(standX, target, tuning);
  const request = makeRequest({ origin: muzzlePosition(BOOTH_LAYOUT_V2, standX), direction: aimDirection(BOOTH_LAYOUT_V2, standX, aim) }, shot);
  const ctx: ShotContext = {
    runId: mintId.run('run-eg03'),
    chooseTransform: () => null,
    ...(usable ? { expanded: { modifiers: BASE_SHOT_MODIFIERS, usableCells: usable } } : {}),
  };
  world.fire(request, ctx);
  const impacts: ImpactEvent[] = [];
  for (let i = 0; i < 3000; i++) {
    const step = world.step(1 / 60);
    for (const e of step.frame.events) if (e.type === 'impact') impacts.push(e);
    if (step.record) return { impacts, record: step.record };
  }
  throw new Error('shot did not finish');
}

const cellImpacts = (o: Outcome) => o.impacts.filter((e) => e.target.kind === 'cell');
const activatedCells = (o: Outcome) => cellImpacts(o).filter((e) => e.target.kind === 'cell' && e.target.activated);

describe('background cells on the real back wall', () => {
  it.each([
    ['cell-r1-c01', -2.35, 0.12],
    ['cell-r3-c12', 2.35, 0.12],
    ['cell-r2-c06', 0, 0.12],
    ['cell-r1-c12', 2.35, -0.12],
  ] as const)('a cork aimed between prizes at %s activates exactly that cell once', async (id, standX, dx) => {
    const world = await makeWorld();
    const out = fireAt(world, standX, cellPoint(id as BackgroundCellId, dx), CELL_IDS_V2);
    const first = out.impacts[0]!;
    expect(first.target.kind).toBe('cell');
    const act = activatedCells(out);
    expect(act).toHaveLength(1);
    expect(act[0]!.target).toMatchObject({ kind: 'cell', cellId: id, activated: true });
    world.dispose();
  });

  it('a cell behind a prize is not activated through the prize', async () => {
    const world = await makeWorld();
    // row 3 cell, straight behind the narrow prize standing on the bottom board in the same column
    const id = 'cell-r3-c06' as BackgroundCellId;
    const prize = BOOTH_LAYOUT_V2.slots.find((s) => s.slotId === 'slot-r3-c06')!;
    const target = { x: prize.spawnBase.x, y: 0.9, z: prize.spawnBase.z };
    const out = fireAt(world, prize.spawnBase.x, target, CELL_IDS_V2);
    expect(out.impacts[0]!.target.kind).toBe('prize');
    expect(activatedCells(out).filter((e) => e.target.kind === 'cell' && e.target.cellId === id)).toHaveLength(0);
    world.dispose();
  });

  it('a used cell reflects without activating', async () => {
    const world = await makeWorld();
    const id = 'cell-r2-c03' as BackgroundCellId;
    const usable = CELL_IDS_V2.filter((c) => c !== id);
    const out = fireAt(world, -0.84, cellPoint(id, 0.12), usable);
    const touches = cellImpacts(out).filter((e) => e.target.kind === 'cell' && e.target.cellId === id);
    expect(touches.length).toBeGreaterThanOrEqual(1);
    expect(touches.every((e) => e.target.kind === 'cell' && !e.target.activated)).toBe(true);
    expect(activatedCells(out)).toHaveLength(0);
    // the cork really bounced: its speed after the contact points away from the wall
    expect(touches[0]!.normal.z).toBeGreaterThan(0.9);
    world.dispose();
  });

  it('rules-v1 style context (no expanded) never activates cells but still reports the contact', async () => {
    const world = await makeWorld();
    const out = fireAt(world, 0, cellPoint('cell-r2-c06' as BackgroundCellId, 0.12), null);
    expect(cellImpacts(out).length).toBeGreaterThanOrEqual(1);
    expect(activatedCells(out)).toHaveLength(0);
    world.dispose();
  });

  it('a contact on the boundary of two cells activates exactly one (the lowest id), and the same shot again is deterministic', async () => {
    const run = async () => {
      const world = await makeWorld();
      const left = cellGeom('cell-r2-c06' as BackgroundCellId);
      const boundaryX = left.box.center.x + left.box.halfExtents.x;
      const out = fireAt(world, 0, { x: boundaryX, y: left.box.center.y, z: left.box.center.z }, CELL_IDS_V2);
      world.dispose();
      return out;
    };
    const a = await run();
    const act = activatedCells(a);
    expect(act).toHaveLength(1);
    expect(act[0]!.target).toMatchObject({ cellId: 'cell-r2-c06' });
    const b = await run();
    expect(activatedCells(b).map((e) => e.target)).toEqual(act.map((e) => e.target));
  });

  it('a second contact with the same activated cell in one shot only reflects', async () => {
    // a mirror directly in front of the muzzle sends the cork back to the same cell
    const layout: BoothLayout = {
      ...BOOTH_LAYOUT_V2,
      surfaces: [...BOOTH_LAYOUT_V2.surfaces, { id: 'mirror', box: { center: { x: 0, y: 1.25, z: -0.1 }, halfExtents: { x: 3, y: 1.5, z: 0.02 } }, material: 'metal', reflective: true }],
    };
    const floaty: TuningConfig = { ...T36, cork: { ...T36.cork, gravityScale: 0.05, restitution: 1 } };
    const world = await makeWorld(layout, [], floaty);
    const out = fireAt(world, 0, cellPoint('cell-r2-c06' as BackgroundCellId, 0), CELL_IDS_V2, floaty);
    const perCell = new Map<string, boolean[]>();
    for (const e of cellImpacts(out)) if (e.target.kind === 'cell') perCell.set(e.target.cellId, [...(perCell.get(e.target.cellId) ?? []), e.target.activated]);
    const repeated = [...perCell.values()].filter((v) => v.length >= 2);
    expect(repeated.length).toBeGreaterThanOrEqual(1);
    for (const v of perCell.values()) expect(v.filter(Boolean).length).toBeLessThanOrEqual(1);
    for (const v of repeated) expect(v.slice(1).every((x) => !x)).toBe(true);
    world.dispose();
  });
});

describe('left-end devices still activate in layout v2', () => {
  it.each(['split', 'power', 'bulletType', 'penalty'] as DeviceKind[])('a shot at the %s plate activates it', async (kind) => {
    const dev = BOOTH_LAYOUT_V2.devices.find((d) => d.kind === kind)!;
    const world = await makeWorld(BOOTH_LAYOUT_V2, []);
    const target = { x: dev.box.center.x, y: dev.box.center.y, z: dev.box.center.z + dev.box.halfExtents.z };
    const out = fireAt(world, -2.35, target, CELL_IDS_V2);
    expect(out.record.deviceActivations.map((a) => a.kind)).toContain(kind);
    const aim = solveAim(-2.35, target);
    // reachable inside the camera limits from the leftmost stand position
    expect(Math.abs(aim.yaw)).toBeLessThanOrEqual(BOOTH_LAYOUT_V2.camera.yawLimit);
    expect(aim.pitch).toBeGreaterThanOrEqual(BOOTH_LAYOUT_V2.camera.pitchMin);
    expect(aim.pitch).toBeLessThanOrEqual(BOOTH_LAYOUT_V2.camera.pitchMax);
    world.dispose();
  });

  it('end-column cells are reachable within the camera aim limits', () => {
    for (const [id, standX] of [
      ['cell-r1-c01', -2.35],
      ['cell-r3-c01', -2.35],
      ['cell-r1-c12', 2.35],
      ['cell-r3-c12', 2.35],
    ] as const) {
      const aim = solveAim(standX, cellPoint(id as BackgroundCellId, standX < 0 ? 0.12 : -0.12));
      expect(Math.abs(aim.yaw)).toBeLessThanOrEqual(BOOTH_LAYOUT_V2.camera.yawLimit);
      expect(aim.pitch).toBeGreaterThanOrEqual(BOOTH_LAYOUT_V2.camera.pitchMin);
      expect(aim.pitch).toBeLessThanOrEqual(BOOTH_LAYOUT_V2.camera.pitchMax);
    }
  });
});

