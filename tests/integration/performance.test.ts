import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { createRun } from '../../src/core/state';
import { createShotWorld } from '../../src/sim/world';
import { BOOTH_LAYOUT, aimDirection, ballisticFor, mintId, muzzlePosition, type BulletType, type ShotId } from '../../src/contracts';

/**
 * AC40 (Node evidence only, NOT an iPhone measurement): the heaviest shots we
 * can provoke — a bouncy cork into the split plate, and a cork bouncing along
 * the walls — must end in finite time, never tunnel, and stay cheap per step.
 * Numbers go to test-results/performance-node.json.
 */
const T = PROTOTYPE_TUNING;
const load = { barValue: 0.85, tier: 'perfect' as const, damageMultiplier: 1.5, pushMultiplier: 1.35 };

function aimTo(standX: number, target: { x: number; y: number; z: number }, bullet: BulletType) {
  const m = muzzlePosition(BOOTH_LAYOUT, standX);
  const zero = aimDirection(BOOTH_LAYOUT, standX, { yaw: 0, pitch: 0 });
  const dx = target.x - m.x;
  const dz = target.z - m.z;
  const horiz = Math.hypot(dx, dz);
  const spec = ballisticFor(T, bullet);
  const t = horiz / spec.speed;
  const drop = 0.5 * spec.gravity * t * t;
  return aimDirection(BOOTH_LAYOUT, standX, {
    yaw: Math.atan2(dx, -dz) - Math.atan2(zero.x, -zero.z),
    pitch: Math.atan2(target.y + drop - m.y, horiz) - Math.asin(zero.y),
  });
}

async function measure(name: string, standX: number, target: { x: number; y: number; z: number }, bullet: BulletType) {
  const world = await createShotWorld(BOOTH_LAYOUT, PROTOTYPE_CATALOG, T);
  const run = createRun({ runId: mintId.run(`perf-${name}`), seed: 5, tuning: T, playerName: null }, PROTOTYPE_CATALOG);
  world.syncShelf(run.shelf, run.clocks.motionSec);
  world.fire(
    { shotId: 's01' as ShotId, origin: muzzlePosition(BOOTH_LAYOUT, standX), direction: aimTo(standX, target, bullet), load, bulletType: bullet },
    { runId: run.runId, chooseTransform: () => null },
  );
  const stepMs: number[] = [];
  let maxCorks = 0;
  let impacts = 0;
  let record = null;
  for (let i = 0; i < 2000 && !record; i++) {
    const t0 = performance.now();
    const step = world.step(1 / 60);
    stepMs.push(performance.now() - t0);
    maxCorks = Math.max(maxCorks, step.frame.projectiles.length);
    impacts += step.frame.events.filter((e) => e.type === 'impact').length;
    record = step.record;
  }
  world.dispose();
  stepMs.sort((a, b) => a - b);
  return {
    name,
    finished: record !== null,
    simSec: record?.simTimeSec ?? null,
    frames: stepMs.length,
    impacts,
    maxSimultaneousCorks: maxCorks,
    devices: record?.deviceActivations.map((d) => d.kind) ?? [],
    stepMsP50: +stepMs[Math.floor(stepMs.length * 0.5)]!.toFixed(3),
    stepMsP95: +stepMs[Math.floor(stepMs.length * 0.95)]!.toFixed(3),
    stepMsMax: +stepMs[stepMs.length - 1]!.toFixed(3),
  };
}

describe('worst-case shot cost (Node, prototype values)', () => {
  it('split plate with a bouncy cork, and a wall-bouncing cork, end in finite time and stay cheap per frame', async () => {
    const split = BOOTH_LAYOUT.devices.find((d) => d.kind === 'split')!.box.center;
    const results = [
      await measure('bouncy-into-split-plate', -0.45, { ...split, z: split.z + 0.02 }, 'bouncy'),
      await measure('standard-into-split-plate', -0.45, { ...split, z: split.z + 0.02 }, 'standard'),
      await measure('bouncy-along-left-wall', -0.45, { x: -1.0, y: 1.3, z: -1.0 }, 'bouncy'),
    ];
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/performance-node.json', JSON.stringify({ note: 'Node + Rapier, 60 Hz frames of 2 fixed steps; not an iPhone measurement', results }, null, 2));
    const maxShotSec = T.limits.maxFlightSec + T.limits.maxSettleSec + T.limits.fallGraceSec;
    for (const r of results) {
      expect(r.finished, r.name).toBe(true);
      expect(r.simSec!, r.name).toBeLessThanOrEqual(maxShotSec + 1e-6);
      expect(r.maxSimultaneousCorks, r.name).toBeLessThanOrEqual(T.limits.maxSimultaneousCorks);
      // Budget for the sim on a desktop CPU: a 60 Hz frame leaves ~16.7 ms; the sim must use a small part of it.
      expect(r.stepMsP95, r.name).toBeLessThan(8);
    }
    expect(results[0]!.devices).toContain('split');
  }, 120_000);
});
