import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { readFileSync } from 'node:fs';
import { environmentPauseReasons, isLandscape } from '../../src/environment';
import { BOOTH_LAYOUT } from '../../src/contracts';

describe('smoke: page environment pause reasons (decision 25)', () => {
  it('portrait and visible → no pause reason', () => {
    expect(environmentPauseReasons({ hidden: false, width: 402, height: 874 })).toEqual([]);
  });
  it('landscape → landscape reason; hidden → hidden reason', () => {
    expect(environmentPauseReasons({ hidden: false, width: 874, height: 402 })).toEqual(['landscape']);
    expect(environmentPauseReasons({ hidden: true, width: 874, height: 402 })).toEqual(['hidden', 'landscape']);
  });
  it('near-square windows are not flagged as landscape', () => {
    expect(isLandscape(800, 790)).toBe(false);
  });
});

describe('smoke: physics dependency runs in Node with the booth layout', () => {
  it('a box dropped on the bottom shelf comes to rest on it', async () => {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    world.timestep = 1 / 120;
    const t0 = BOOTH_LAYOUT.tiers[0]!;
    const shelf = BOOTH_LAYOUT.surfaces.find((s) => s.id === 'shelf-0')!;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(shelf.box.halfExtents.x, shelf.box.halfExtents.y, shelf.box.halfExtents.z).setTranslation(
        shelf.box.center.x,
        shelf.box.center.y,
        shelf.box.center.z,
      ),
    );
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, t0.topY + 0.2, t0.centerZ));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.04, 0.06, 0.03).setDensity(400), body);
    for (let i = 0; i < 240; i++) world.step();
    const y = body.translation().y;
    expect(y).toBeGreaterThan(t0.topY);
    expect(y).toBeLessThan(t0.topY + 0.07);
    expect(y).toBeGreaterThan(BOOTH_LAYOUT.collectBelowY);
    world.free();
  });
});

describe('smoke: candidate data file is readable', () => {
  it('contains 100 prize and 100 set candidates', () => {
    const data = JSON.parse(readFileSync('data/catalog-candidates.json', 'utf8')) as { prizes: unknown[]; sets: unknown[] };
    expect(data.prizes).toHaveLength(100);
    expect(data.sets).toHaveLength(100);
  });
});
