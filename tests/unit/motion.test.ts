import { describe, expect, it } from 'vitest';
import { mountBasePose, mountedPose } from '../../src/sim/motion';
import { createShotWorld } from '../../src/sim/world';
import { tickRun } from '../../src/core/transitions';
import { BOOTH_LAYOUT, asPrizeTypeId, type PrizeRuntimeConfig, type SimEvent } from '../../src/contracts';
import { CAT, T, ballisticDir, makeRequest, newRun, runShot, send, shelfOf } from './helpers';

const cfg = (id: string): PrizeRuntimeConfig => CAT.prizes.get(asPrizeTypeId(id))!;
const slot = (id: string) => BOOTH_LAYOUT.slots.find((s) => s.slotId === id)!;
const MOVERS = ['P019', 'P024', 'P023', 'P022', 'P014', 'P046', 'P049', 'P077', 'P076'] as const;
const SLOTS = ['t0c0', 't0c1', 't0c2', 't1c0', 't1c1', 't1c2', 't2c0', 't2c1', 't2c2'] as const;

describe('mountedPose (periodic motion)', () => {
  it('every moving kind starts at its base pose and repeats after exactly one period', () => {
    for (const id of ['P019', 'P024', 'P023', 'P022']) {
      const c = cfg(id);
      const base = mountBasePose(slot('t1c1'), c);
      const m = c.motion as { periodSec: number };
      expect(mountedPose(base, c, 0).position.x).toBeCloseTo(base.position.x, 9);
      for (const t of [0.3, 1.1, 2.7]) {
        const a = mountedPose(base, c, t);
        const b = mountedPose(base, c, t + m.periodSec);
        expect(b.position.x).toBeCloseTo(a.position.x, 9);
        expect(b.position.y).toBeCloseTo(a.position.y, 9);
        // same rotation (a quaternion and its negative are the same rotation)
        const d = a.rotation.x * b.rotation.x + a.rotation.y * b.rotation.y + a.rotation.z * b.rotation.z + a.rotation.w * b.rotation.w;
        expect(Math.abs(d)).toBeCloseTo(1, 9);
      }
    }
  });

  it('slide moves sideways within its amplitude; bob only lifts; swing and spin rotate', () => {
    const slide = cfg('P023');
    const sb = mountBasePose(slot('t0c1'), slide);
    let maxDx = 0;
    for (let t = 0; t < 8; t += 0.05) maxDx = Math.max(maxDx, Math.abs(mountedPose(sb, slide, t).position.x - sb.position.x));
    expect(maxDx).toBeGreaterThan(0.04);
    expect(maxDx).toBeLessThanOrEqual((slide.motion as { amplitude: number }).amplitude + 1e-9);

    const bob = cfg('P022');
    const bb = mountBasePose(slot('t0c1'), bob);
    let maxUp = 0;
    for (let t = 0; t < 5; t += 0.05) {
      const dy = mountedPose(bb, bob, t).position.y - bb.position.y;
      expect(dy).toBeGreaterThanOrEqual(-1e-12);
      maxUp = Math.max(maxUp, dy);
    }
    expect(maxUp).toBeGreaterThan(0.02);

    const swing = cfg('P019');
    const wb = mountBasePose(slot('t0c1'), swing);
    let maxRot = 0;
    for (let t = 0; t < 5; t += 0.05) {
      const p = mountedPose(wb, swing, t);
      expect(p.position.y).toBeGreaterThanOrEqual(wb.position.y - 1e-12); // never dips into the board
      maxRot = Math.max(maxRot, Math.abs(p.rotation.z));
    }
    expect(maxRot).toBeGreaterThan(0.05);

    const spin = cfg('P024');
    const kb = mountBasePose(slot('t0c1'), spin);
    expect(mountedPose(kb, spin, 0.75).rotation.y).toBeGreaterThan(0.3);
    expect(mountedPose(kb, spin, 0.75).position).toEqual(kb.position);
  });

  it('a prize without motion never moves', () => {
    const c = cfg('P001');
    const b = mountBasePose(slot('t0c0'), c);
    expect(mountedPose(b, c, 12.3)).toEqual(b);
  });

  it('pausing keeps the phase: the motion clock does not move, so the pose does not either', () => {
    let s = newRun(1);
    s = tickRun(tickRun(s, 0.1, T), 0.1, T);
    const before = s.clocks.motionSec;
    const paused = send(s, { type: 'PAUSE', reason: 'hidden' });
    const later = tickRun(tickRun(paused, 0.1, T), 0.1, T);
    expect(later.clocks.motionSec).toBe(before);
    const c = cfg('P023');
    const base = mountBasePose(slot('t0c1'), c);
    expect(mountedPose(base, c, later.clocks.motionSec)).toEqual(mountedPose(base, c, before));
  });
});

describe('moving prizes in the physics world', () => {
  const movingShelf = () => shelfOf(SLOTS.map((sl, i) => [sl, MOVERS[i]!] as const), 0);

  it('after 60 s of idle time nothing is collected, nothing has fallen, and everything stays mounted in its slot', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const shelf = movingShelf();
    world.syncShelf(shelf, 0);
    const events: SimEvent[] = [];
    for (let i = 0; i < 3600; i++) events.push(...world.step(1 / 60).frame.events);
    expect(events.filter((e) => e.type === 'prizeReachedCollection')).toEqual([]);
    const frame = world.frame();
    expect(frame.prizes).toHaveLength(9);
    for (const p of frame.prizes) {
      expect(p.mounted).toBe(true);
      expect(p.collected).toBe(false);
      const home = shelf.prizes.find((x) => x.instanceId === p.instanceId)!;
      const s = slot(home.homeSlot);
      expect(Math.abs(p.position.x - s.spawnBase.x)).toBeLessThan(s.occupancyBox.halfExtents.x);
      expect(p.position.y).toBeGreaterThanOrEqual(home.pose.position.y - 1e-3);
      expect(p.position.y).toBeLessThan(home.pose.position.y + 0.1);
    }
    world.dispose();
  });

  it('the world follows motionSec: syncing with a clock value puts prizes at the matching phase', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const shelf = shelfOf([['t0c1', 'P023']]);
    const c = cfg('P023');
    const base = mountBasePose(slot('t0c1'), c);
    world.syncShelf(shelf, 1.0);
    const x = world.frame().prizes[0]!.position.x;
    expect(x).toBeCloseTo(mountedPose(base, c, 1.0).position.x, 4);
    world.step(0.5);
    expect(world.frame().prizes[0]!.position.x).toBeCloseTo(mountedPose(base, c, 1.5).position.x, 2);
    world.dispose();
  });

  it('a hard hit tears a mounted prize off its mount; a weak one does not', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf(shelfOf([['t0c1', 'P023']]), 0); // slide goldfish at t0c1
    const target = world.frame().prizes[0]!.position;
    const weak = { ...makeRequest({ direction: ballisticDir({ x: 0, y: 1.25, z: -0.3 }, target) }) };
    const weakLoad = { ...weak.load, tier: 'weak' as const, damageMultiplier: 0.7, pushMultiplier: 0.75 };
    runShot(world, { ...weak, load: weakLoad }, 1 / 60);
    // weak push (0.75 x) is under the detach threshold, HP stays above 0 -> still mounted
    expect(world.frame().prizes.find((p) => p.mounted)).toBeDefined();
    world.dispose();

    const w2 = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    w2.syncShelf(shelfOf([['t0c1', 'P023']]), 0);
    const t2 = w2.frame().prizes[0]!.position;
    runShot(w2, makeRequest({ direction: ballisticDir({ x: 0, y: 1.25, z: -0.3 }, t2) }), 1 / 60); // perfect load
    const after = w2.frame().prizes.find((p) => !p.collected);
    if (after) expect(after.mounted).toBe(false);
    w2.dispose();
  });

  it('settle never waits for the periodic mounts: a shot at an all-moving shelf still ends quickly', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf(movingShelf(), 0);
    const run = runShot(world, makeRequest({ direction: { x: 0, y: -0.05, z: -1 } }), 1 / 60);
    expect(run.record.simTimeSec).toBeLessThan(T.limits.maxFlightSec + 1.5);
    expect(run.record.endedByLimit).toBe(false);
    world.dispose();
  });
});
