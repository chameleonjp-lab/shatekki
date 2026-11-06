import { beforeAll, describe, expect, it } from 'vitest';
import { bounceFactor, reflectVelocity } from '../../src/sim/collisions';
import { createShotWorld } from '../../src/sim/world';
import { BOOTH_LAYOUT, type ImpactEvent, type ShotWorld, type SimEvent } from '../../src/contracts';
import { CAT, T, ballisticDir, dirTo, makeRequest, newRun, runShot, shelfOf, unit, type TimedEvent } from './helpers';

const impacts = (evs: readonly TimedEvent[]): { t: number; e: ImpactEvent }[] =>
  evs.filter((x): x is { t: number; event: ImpactEvent } => x.event.type === 'impact').map((x) => ({ t: x.t, e: x.event }));
const ofType = <K extends SimEvent['type']>(evs: readonly TimedEvent[], k: K) =>
  evs.filter((x) => x.event.type === k).map((x) => x.event as Extract<SimEvent, { type: K }>);

describe('reflectVelocity (pure)', () => {
  it('flips the normal component scaled by restitution and damps the tangential part', () => {
    const v = { x: 3, y: -4, z: 0 };
    const out = reflectVelocity(v, { x: 0, y: 1, z: 0 }, 0.5, 0.9);
    expect(out.y).toBeCloseTo(2);
    expect(out.x).toBeCloseTo(2.7);
    expect(out.z).toBeCloseTo(0);
  });
  it('the angle of reflection follows the restitution (mirror at restitution 1, tangential kept)', () => {
    const v = unit({ x: 1, y: -1, z: 0 });
    const out = reflectVelocity(v, { x: 0, y: 1, z: 0 }, 1, 1);
    expect(out.x).toBeCloseTo(v.x);
    expect(out.y).toBeCloseTo(-v.y);
  });
  it('does nothing to a velocity already moving away', () => {
    const v = { x: 0, y: 2, z: 0 };
    expect(reflectVelocity(v, { x: 0, y: 1, z: 0 }, 0.5, 0.9)).toEqual({ x: 0, y: 2, z: 0 } as never);
  });
  it('materials differ: metal bounces more than cloth', () => {
    expect(bounceFactor('metal')).toBeGreaterThan(bounceFactor('wood'));
    expect(bounceFactor('wood')).toBeGreaterThan(bounceFactor('cloth'));
  });
});

describe('ShotWorld corks', () => {
  let world: ShotWorld;
  beforeAll(async () => {
    world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
  });

  const muzzle = { x: 0, y: BOOTH_LAYOUT.camera.muzzle.y, z: BOOTH_LAYOUT.camera.muzzle.z };

  it('reflects off a wall with restitution, reports point and normal, and the bounce keeps going', () => {
    const run = runShot(world, makeRequest({ direction: unit({ x: 0.9, y: 0, z: -0.1 }) }), 1 / 120);
    const first = impacts(run.events)[0]!.e;
    expect(first.target.kind).toBe('surface');
    if (first.target.kind === 'surface') expect(first.target.surfaceId).toBe('right-wall');
    expect(first.normal.x).toBeCloseTo(-1, 2);
    expect(Math.abs(first.normal.y)).toBeLessThan(0.05);
    expect(first.point.x).toBeCloseTo(1.05, 1);
    expect(first.speed).toBeGreaterThan(9);
    expect(first.reflectionIndex).toBe(0);
    // after the bounce the cork heads back with speed scaled by restitution
    const spawned = ofType(run.events, 'projectileSpawned')[0]!;
    expect(spawned.velocity.x).toBeGreaterThan(9);
    const second = impacts(run.events)[1];
    expect(second).toBeDefined();
    expect(second!.e.reflectionIndex).toBe(1);
    expect(second!.e.target.kind).toBe('surface');
    // the reflected speed is e * incoming normal speed: check via the next impact's incoming speed (gravity small)
    expect(second!.e.speed).toBeLessThan(first.speed);
    expect(second!.e.speed).toBeGreaterThan(first.speed * 0.3);
  });

  it('reflected speed equals incoming normal speed times the material restitution (measured from frames)', () => {
    const measure = (direction: ReturnType<typeof unit>, surface: string) => {
      world.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
      world.fire(makeRequest({ direction }), { runId: 'r' as never, chooseTransform: () => null });
      let before: { vy: number; vz: number } | null = null;
      let after: { vy: number; vz: number } | null = null;
      for (let i = 0; i < 2000 && !after; i++) {
        const s = world.step(1 / 120);
        const p = s.frame.projectiles[0];
        const hit = s.frame.events.find((e) => e.type === 'impact' && e.target.kind === 'surface' && e.target.surfaceId === surface);
        if (hit && p) after = { vy: p.velocity.y, vz: p.velocity.z };
        else if (p) before = { vy: p.velocity.y, vz: p.velocity.z };
        if (s.record) break;
      }
      while (world.shotInProgress) world.step(1 / 60);
      return { before: before!, after: after! };
    };
    const wood = measure(unit({ x: 0, y: 0, z: -1 }), 'back-wall');
    const cloth = measure(unit({ x: 0, y: 0.5, z: -0.2 }), 'ceiling');
    const woodRatio = Math.abs(wood.after.vz / wood.before.vz);
    const clothRatio = Math.abs(cloth.after.vy / cloth.before.vy);
    expect(woodRatio).toBeCloseTo(T.cork.restitution * bounceFactor('wood'), 1);
    expect(clothRatio).toBeCloseTo(T.cork.restitution * bounceFactor('cloth'), 1);
    expect(clothRatio).toBeLessThan(woodRatio);
  });

  it('a very fast cork does not tunnel through a thin shelf board', () => {
    const fast = { ...T, cork: { ...T.cork, speed: 400 } };
    return createShotWorld(BOOTH_LAYOUT, CAT, fast).then((w) => {
      w.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
      const target = { x: 0, y: 0.8, z: -1.75 }; // top of the lowest shelf board (3 cm thick)
      const run = runShot(w, makeRequest({ direction: dirTo(muzzle, { x: 0, y: 0.795, z: -1.75 }) }), 1 / 60);
      const first = impacts(run.events)[0]!.e;
      expect(first.target.kind).toBe('surface');
      if (first.target.kind === 'surface') expect(first.target.surfaceId).toBe('shelf-0');
      expect(first.point.y).toBeGreaterThan(target.y - 0.02);
      expect(first.point.y).toBeLessThan(target.y + 0.03);
      w.dispose();
    });
  });

  it('an off-screen contact is still simulated and reported (far side, behind the view)', () => {
    const run = runShot(world, makeRequest({ direction: unit({ x: -0.95, y: 0.05, z: -0.1 }) }), 1 / 60);
    const first = impacts(run.events)[0]!.e;
    expect(first.target.kind).toBe('surface');
    expect(first.point.x).toBeLessThan(-1);
    // the cork carries on to further reflections (counter / floor / walls) instead of being dropped
    expect(impacts(run.events).length).toBeGreaterThan(1);
  });

  it('a continuing contact is not counted twice (bouncing to rest on the counter)', () => {
    const run = runShot(world, makeRequest({ direction: { x: 0, y: -1, z: 0 } }), 1 / 120);
    const imp = impacts(run.events).filter((x) => x.e.target.kind === 'surface' && x.e.target.surfaceId === 'counter');
    expect(imp.length).toBeGreaterThan(1);
    for (let i = 1; i < imp.length; i++) expect(imp[i]!.t - imp[i - 1]!.t).toBeGreaterThanOrEqual(0.05 - 1e-9);
    const ended = ofType(run.events, 'projectileEnded');
    expect(ended).toHaveLength(1);
    expect(['stopped', 'reflectionLimit']).toContain(ended[0]!.reason);
    expect(imp.length).toBeLessThanOrEqual(T.limits.maxReflectionsPerCork + 1);
  });

  it('the first contact with a device activates it (Task 08); shopkeeper / hidden contacts become first-hit candidates', () => {
    const dev = BOOTH_LAYOUT.devices.find((d) => d.kind === 'split')!;
    const toDev = ballisticDir(muzzle, { x: dev.box.center.x, y: dev.box.center.y, z: dev.box.center.z + dev.box.halfExtents.z });
    const run = runShot(world, makeRequest({ direction: toDev }), 1 / 60);
    const hit = impacts(run.events).find((x) => x.e.target.kind === 'device');
    expect(hit).toBeDefined();
    if (hit?.e.target.kind === 'device') {
      expect(hit.e.target.deviceKind).toBe('split');
      expect(hit.e.target.activated).toBe(true);
    }
    expect(run.record.deviceActivations.map((d) => d.kind)).toEqual(['split']);

    const hat = BOOTH_LAYOUT.shopkeeper.find((p) => p.part === 'hat')!;
    const run2 = runShot(world, makeRequest({ direction: ballisticDir(muzzle, hat.box.center) }), 1 / 60);
    expect(run2.record.firstHitCandidates).toContain('shopkeeper:hat');
    const hid = BOOTH_LAYOUT.hiddenTargets[1]!;
    const run3 = runShot(world, makeRequest({ direction: ballisticDir(muzzle, hid.box.center) }), 1 / 60);
    expect(run3.record.firstHitCandidates).toContain(`hidden:${hid.targetId}`);
  });
});

describe('ShotWorld prizes and shot lifecycle', () => {
  it('reports a prize contact point and normal on the face that was hit', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const shelf = shelfOf([['t1c1', 'P001']]); // 22x8x16 cm box
    world.syncShelf(shelf, 0);
    const p = shelf.prizes[0]!;
    const run = runShot(world, makeRequest({ direction: ballisticDir({ x: 0, y: 1.25, z: -0.3 }, p.pose.position) }), 1 / 60);
    const hit = impacts(run.events).find((x) => x.e.target.kind === 'prize')!.e;
    if (hit.target.kind === 'prize') {
      expect(hit.target.instanceId).toBe(p.instanceId);
      expect(hit.target.typeId).toBe('P001');
    }
    const frontZ = p.pose.position.z + 0.08;
    expect(hit.point.z).toBeCloseTo(frontZ, 1);
    expect(hit.normal.z).toBeGreaterThan(0.5);
    world.dispose();
  });

  it('every shot ends in finite simulation time, returns exactly one record, and corks are gone', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const limit = T.limits.maxFlightSec + T.limits.maxSettleSec + T.limits.fallGraceSec + 0.1;
    let seed = 12345;
    const rnd = () => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed / 0x100000000;
    };
    for (let i = 0; i < 12; i++) {
      world.syncShelf(newRun(i + 1).shelf, 0);
      const dir = unit({ x: (rnd() - 0.5) * 2, y: (rnd() - 0.4) * 1.2, z: -0.2 - rnd() });
      const run = runShot(world, makeRequest({ direction: dir }, i + 1), 1 / 30);
      expect(run.record.simTimeSec).toBeLessThanOrEqual(limit);
      expect(run.record.simTimeSec).toBeGreaterThan(0);
      expect(world.shotInProgress).toBe(false);
      expect(world.frame().projectiles).toHaveLength(0);
      // exactly once: further steps do not produce another record
      expect(world.step(0.1).record).toBeNull();
    }
    world.dispose();
  });

  it('fire throws while a shot is in progress', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
    const req = makeRequest({ direction: unit({ x: 0, y: 0, z: -1 }) });
    world.fire(req, { runId: 'r' as never, chooseTransform: () => null });
    expect(world.shotInProgress).toBe(true);
    expect(() => world.fire(req, { runId: 'r' as never, chooseTransform: () => null })).toThrow();
    world.dispose();
  });

  it('is deterministic: the same shelf and shot give the same record', async () => {
    const go = async () => {
      const w = await createShotWorld(BOOTH_LAYOUT, CAT, T);
      w.syncShelf(newRun(4).shelf, 0);
      const r = runShot(w, makeRequest({ direction: unit({ x: 0.02, y: 0.02, z: -1 }) }), 1 / 60);
      w.dispose();
      return r.record;
    };
    expect(await go()).toEqual(await go());
  });
});
