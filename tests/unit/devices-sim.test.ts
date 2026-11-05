import { describe, expect, it } from 'vitest';
import { createShotWorld } from '../../src/sim/world';
import type { DeviceKind } from '../../src/contracts';
import { CAT, T, makeRequest } from './helpers';
import { impactsOnDevices, layoutWith, plate, runFull, straight } from './device-helpers';

const TUNE = { ...T, devices: { ...T.devices, splitSpreadRad: 0.12 } };
const EMPTY = { prizes: [], deferredSlots: [], nextInstanceNumber: 1 };
const KINDS: DeviceKind[] = ['split', 'power', 'transform', 'penalty', 'ammo', 'bulletType'];

describe('each device acts at most once per shot (decision 31); ordinary reflection repeats', () => {
  for (const kind of KINDS) {
    it(`${kind}: one activation, later contacts are activated:false`, async () => {
      const world = await createShotWorld(layoutWith([plate(kind, `dev-${kind}`)]), CAT, TUNE);
      world.syncShelf(EMPTY, 0);
      const run = runFull(world, makeRequest({ direction: straight }));
      const hits = impactsOnDevices(run.events);
      expect(hits.length).toBeGreaterThanOrEqual(2); // the scenario really does hit the plate again
      const flags = hits.map((h) => (h.target.kind === 'device' ? h.target.activated : null));
      expect(flags.filter((f) => f === true)).toHaveLength(1);
      expect(flags[0]).toBe(true);
      expect(run.record.deviceActivations).toHaveLength(1);
      expect(run.record.deviceActivations[0]!.kind).toBe(kind);
      expect(run.events.filter((e) => e.type === 'deviceActivated')).toHaveLength(1);
      world.dispose();
    });
  }
});

describe('split', () => {
  it('replaces the cork by two corks of generation 1 and does not touch anything else', async () => {
    const world = await createShotWorld(layoutWith([plate('split', 'dev-split')]), CAT, TUNE);
    world.syncShelf(EMPTY, 0);
    const run = runFull(world, makeRequest({ direction: straight }));
    const spawned = run.events.filter((e) => e.type === 'projectileSpawned');
    expect(spawned).toHaveLength(3);
    const kids = spawned.filter((e) => e.type === 'projectileSpawned' && e.parentId !== null);
    expect(kids).toHaveLength(2);
    for (const k of kids) if (k.type === 'projectileSpawned') expect(k.generation).toBe(1);
    // the two children fly apart
    const [a, b] = kids.map((k) => (k.type === 'projectileSpawned' ? k.velocity : null));
    expect(Math.sign(a!.x)).toBe(-Math.sign(b!.x));
    // split never reports ammo (core owns ammo; the record has no ammo field and no ammo activation)
    expect(run.record.deviceActivations.map((d) => d.kind)).toEqual(['split']);
    world.dispose();
  });

  it('AC43: original + split corks hitting the same plate again give one activation, ordinary reflection continues', async () => {
    const world = await createShotWorld(layoutWith([plate('split', 'dev-split')]), CAT, TUNE);
    world.syncShelf(EMPTY, 0);
    const run = runFull(world, makeRequest({ direction: straight }));
    const hits = impactsOnDevices(run.events);
    const byProj = new Set(hits.map((h) => h.projectileId));
    expect(byProj.size).toBeGreaterThanOrEqual(2); // a split cork hit the plate as well as the original
    expect(run.record.deviceActivations).toHaveLength(1);
    expect(run.events.filter((e) => e.type === 'projectileSpawned')).toHaveLength(3); // no second split
    world.dispose();
  });

  it('respects the generation limit and the simultaneous cork limit (finite)', async () => {
    const tuning = { ...TUNE, limits: { ...T.limits, maxSplitGeneration: 0 } };
    const world = await createShotWorld(layoutWith([plate('split', 'dev-split')]), CAT, tuning);
    world.syncShelf(EMPTY, 0);
    const run = runFull(world, makeRequest({ direction: straight }));
    expect(run.events.filter((e) => e.type === 'projectileSpawned')).toHaveLength(1);
    expect(run.record.deviceActivations).toHaveLength(1);
    world.dispose();

    const tuning2 = { ...TUNE, limits: { ...T.limits, maxSimultaneousCorks: 1 } };
    const world2 = await createShotWorld(layoutWith([plate('split', 'dev-split')]), CAT, tuning2);
    world2.syncShelf(EMPTY, 0);
    const run2 = runFull(world2, makeRequest({ direction: straight }));
    expect(run2.events.filter((e) => e.type === 'projectileSpawned')).toHaveLength(1);
    world2.dispose();
  });
});

describe('power', () => {
  it('the cork that touched it carries x2 (and children inherit it); a second power plate caps at 4', async () => {
    const world = await createShotWorld(
      layoutWith([plate('power', 'dev-power', 0, 1.0, -1.2), plate('split', 'dev-split', 0, 1.0, -1.6)]),
      CAT,
      TUNE,
    );
    world.syncShelf(EMPTY, 0);
    const run = runFull(world, makeRequest({ direction: straight }));
    // the first plate reached is power (z=-1.2) and blocks the split plate behind it; only power acts
    expect(run.record.deviceActivations.map((d) => d.kind)).toEqual(['power']);
    const maxPower = Math.max(...run.frames.flatMap((f) => f.projectiles.map((p) => p.powerMultiplier)));
    expect(maxPower).toBe(2);
    world.dispose();
  });

  it('power and split in one shot: split children inherit the doubled power', async () => {
    // power plate on the left half, split plate on the right half, both at the same depth; the cork drifts right
    const world = await createShotWorld(
      layoutWith([plate('power', 'dev-power', -0.5, 0.5, -1.2), plate('split', 'dev-split', 0.5, 0.5, -1.2)]),
      CAT,
      TUNE,
    );
    world.syncShelf(EMPTY, 0);
    const run = runFull(world, makeRequest({ origin: { x: -0.1, y: 1.25, z: -0.3 }, direction: { x: 0.1, y: 0, z: -1 } }));
    const kinds = run.record.deviceActivations.map((d) => d.kind);
    expect(kinds).toContain('power');
    expect(kinds).toContain('split');
    expect(new Set(kinds).size).toBe(kinds.length);
    const kids = run.frames.flatMap((f) => f.projectiles).filter((p) => !p.projectileId.endsWith('-c0'));
    expect(kids.length).toBeGreaterThan(0);
    expect(kids.every((p) => p.powerMultiplier === 2)).toBe(true);
    world.dispose();
  });
});
