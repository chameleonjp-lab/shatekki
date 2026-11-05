import { describe, expect, it } from 'vitest';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { createRun } from '../../src/core/state';
import { aimToDirection } from '../../src/core/aim';
import { createShotWorld } from '../../src/sim/world';
import { applyFrame, createSceneGraph, updateAim } from '../../src/view';
import { aimDirection as viewAimDirection } from '../../src/view/aim';
import {
  BOOTH_LAYOUT,
  aimDirection,
  ballisticFor,
  mintId,
  muzzlePosition,
  type ImpactEvent,
  type LoadResult,
  type ShotId,
} from '../../src/contracts';

// AC06 evidence (automated, Node): the reticle drawn by the view is where the
// sim's cork first touches something. Same shelf, same aim, same ballistics.

const T = PROTOTYPE_TUNING;
const load: LoadResult = { barValue: 0.5, tier: 'normal', damageMultiplier: 1, pushMultiplier: 1 };

describe('aim convention is one function shared by core, sim and view', () => {
  it.each([
    [0, 0, 0],
    [0.3, 0.12, -0.05],
    [-0.45, -0.2, 0.25],
  ])('standX=%f yaw=%f pitch=%f gives identical directions', (standX, yaw, pitch) => {
    const c = aimDirection(BOOTH_LAYOUT, standX, { yaw, pitch });
    const core = aimToDirection(standX, { yaw, pitch }, BOOTH_LAYOUT);
    const view = viewAimDirection(BOOTH_LAYOUT, standX, { yaw, pitch });
    expect(core).toEqual(c);
    expect(view.x).toBeCloseTo(c.x, 12);
    expect(view.y).toBeCloseTo(c.y, 12);
    expect(view.z).toBeCloseTo(c.z, 12);
  });
});

describe('reticle point equals the first cork contact (gravity included)', () => {
  const aims: Array<[number, number, number]> = [
    [0, 0, -0.12], // bottom tier
    [0, 0, 0.02], // middle tier
    [0.2, -0.1, 0.16], // upper tier, to the side
    [-0.3, 0.25, 0.1], // toward the side wall
    [0.4, 0.05, 0.28], // high on the back wall
  ];

  it.each(aims)('standX=%f yaw=%f pitch=%f', async (standX, yaw, pitch) => {
    const world = await createShotWorld(BOOTH_LAYOUT, PROTOTYPE_CATALOG, T);
    const run = createRun({ runId: mintId.run('parity'), seed: 11, tuning: T, playerName: null }, PROTOTYPE_CATALOG);
    world.syncShelf(run.shelf, run.clocks.motionSec);
    const graph = createSceneGraph({
      layout: BOOTH_LAYOUT,
      resolvePrize: (typeId) => {
        const p = PROTOTYPE_CATALOG.prizes.get(typeId)!;
        return { shape: p.shape, modelKey: p.modelKey, material: p.material };
      },
    });
    applyFrame(graph, world.frame());
    const aim = { yaw, pitch };
    const ballistic = ballisticFor(T, 'standard');
    const reticle = updateAim(graph, { phase: 'aiming', standX, effectiveAim: aim, ballistic });

    const shotId = 's01' as ShotId;
    world.fire(
      { shotId, origin: muzzlePosition(BOOTH_LAYOUT, standX), direction: aimDirection(BOOTH_LAYOUT, standX, aim), load, bulletType: 'standard' },
      { runId: run.runId, chooseTransform: () => null },
    );
    let first: ImpactEvent | null = null;
    for (let i = 0; i < 600 && !first; i++) {
      const step = world.step(1 / 120);
      first = (step.frame.events.find((e) => e.type === 'impact') as ImpactEvent | undefined) ?? null;
    }
    world.dispose();
    expect(first).not.toBeNull();
    expect(reticle.hit).toBe(true);
    const d = Math.hypot(first!.point.x - reticle.point.x, first!.point.y - reticle.point.y, first!.point.z - reticle.point.z);
    // Tolerance: cork radius (1.1 cm) + visual meshes sit slightly inside the colliders + sampling.
    expect(d).toBeLessThan(0.05);
  });
});
