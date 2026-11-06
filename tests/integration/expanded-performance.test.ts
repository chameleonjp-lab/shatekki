import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { createShotWorld } from '../../src/sim/world';
import {
  BASE_SHOT_MODIFIERS,
  aimDirection,
  ballisticForModifiers,
  corkFreeFlightPath,
  mintId,
  muzzlePosition,
  type ShotModifiers,
  type ShotRecord,
  type Vec3,
} from '../../src/contracts';
import { planFor } from './expanded-helpers';

/**
 * Expanded worst cases (EG10, Node evidence only — NOT an iPhone measurement):
 * 36 prizes and 36 cells, three launched bouncy corks with an extra
 * reflection into the split plate (up to the 8-cork cap), and a wide spread
 * along the back wall. Each shot must stop at its barrier, resume once, end
 * in finite time and never stall. Numbers go to test-results/expanded-performance-node.json.
 */
const bundle = getGameplayBundle('expanded-proposed');
const L = bundle.layout;
const T = bundle.tuning;
const load = { barValue: 0.85, tier: 'perfect' as const, damageMultiplier: 1.5, pushMultiplier: 1.35 };
const STALL_GUARD_MS = 50;

function directionTo(standX: number, target: Vec3, m: ShotModifiers): Vec3 {
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticForModifiers(T, 'standard', m);
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return aimDirection(L, standX, { yaw, pitch: (lo + hi) / 2 });
}

async function measure(name: string, standX: number, target: Vec3, modifiers: ShotModifiers) {
  const world = await createShotWorld(L, bundle.catalog, T);
  const run = createExpandedRun({ runId: mintId.run(`perf-${name}`), seed: 5, tuning: T, playerName: null }, { ...bundle, expansion: bundle.expansion! });
  world.syncShelf(run.shelf, run.clocks.motionSec);
  const bulletType = modifiers.bulletType ?? 'standard';
  world.fire(
    { shotId: mintId.shot(1), origin: muzzlePosition(L, standX), direction: directionTo(standX, target, modifiers), load, bulletType },
    { runId: run.runId, chooseTransform: () => null, expanded: { modifiers, usableCells: run.expansion.cells.map((c) => c.cellId) } },
  );
  const stepMs: number[] = [];
  let maxCorks = 0;
  let impacts = 0;
  let cellRequests = 0;
  let barriers = 0;
  let record: ShotRecord | null = null;
  for (let i = 0; i < 3000 && !record; i++) {
    const t0 = performance.now();
    const step = world.step(1 / 60);
    stepMs.push(performance.now() - t0);
    maxCorks = Math.max(maxCorks, step.frame.projectiles.length);
    impacts += step.frame.events.filter((e) => e.type === 'impact').length;
    if (step.barrier) {
      barriers += 1;
      cellRequests = step.barrier.requests.filter((r) => r.source.kind === 'cell').length;
      expect(world.resumeAfterEffects(planFor(step.barrier))).toBe(true);
    }
    record = step.record;
  }
  world.dispose();
  stepMs.sort((a, b) => a - b);
  return {
    name,
    finished: record !== null,
    barriers,
    simSec: record?.simTimeSec ?? null,
    frames: stepMs.length,
    impacts,
    cellRequests,
    maxSimultaneousCorks: maxCorks,
    devices: record?.deviceActivations.map((d) => d.kind) ?? [],
    stepMsP50: +stepMs[Math.floor(stepMs.length * 0.5)]!.toFixed(3),
    stepMsP95: +stepMs[Math.floor(stepMs.length * 0.95)]!.toFixed(3),
    stepMsMax: +stepMs[stepMs.length - 1]!.toFixed(3),
  };
}

describe('expanded worst-case shot cost (Node, prototype values)', () => {
  it('three bouncy corks into the split plate and a wide spread along the back wall end in finite time and never stall', async () => {
    const split = L.devices.find((d) => d.kind === 'split')!.box.center;
    const heavy: ShotModifiers = { ...BASE_SHOT_MODIFIERS, bulletType: 'bouncy', extraReflections: 1, radiusMult: 1.2, launch: { count: 3, spreadRad: 0.1 } };
    const wide: ShotModifiers = { ...BASE_SHOT_MODIFIERS, bulletType: 'bouncy', launch: { count: 3, spreadRad: 0.175 }, splitSpreadMult: 1.5 };
    await measure('warm-up', L.camera.standMinX, { ...split, z: split.z + 0.02 }, heavy);
    const results = [
      await measure('three-bouncy-into-split-plate', L.camera.standMinX, { ...split, z: split.z + 0.02 }, heavy),
      await measure('three-wide-into-the-middle-cells', 0, { x: 0, y: 1.0, z: -2.44 }, wide),
      await measure('single-standard-at-right-end', L.camera.standMaxX, { x: 2.31, y: 0.95, z: -2.44 }, BASE_SHOT_MODIFIERS),
    ];
    mkdirSync('test-results', { recursive: true });
    writeFileSync(
      'test-results/expanded-performance-node.json',
      JSON.stringify({ note: 'Node + Rapier, 36 prizes + 36 cells, 60 Hz frames; not an iPhone measurement', results }, null, 2),
    );
    const maxShotSec = T.limits.maxFlightSec + T.limits.maxSettleSec + T.limits.fallGraceSec;
    for (const r of results) {
      expect(r.finished, r.name).toBe(true);
      expect(r.barriers, r.name).toBe(1);
      expect(r.simSec!, r.name).toBeLessThanOrEqual(maxShotSec + 1e-6);
      expect(r.maxSimultaneousCorks, r.name).toBeLessThanOrEqual(T.limits.maxSimultaneousCorks);
      expect(r.stepMsP95, r.name).toBeLessThan(STALL_GUARD_MS);
    }
    expect(results[0]!.maxSimultaneousCorks).toBeGreaterThanOrEqual(3);
  }, 180_000);
});
