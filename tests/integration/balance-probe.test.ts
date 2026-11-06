import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { createRun } from '../../src/core/state';
import { reduceGame, tickRun } from '../../src/core/transitions';
import { resolveShot } from '../../src/core/settlement';
import { createTransformChooser } from '../../src/core/gimmicks';
import { createShotWorld } from '../../src/sim/world';
import {
  BOOTH_LAYOUT,
  aimDirection,
  ballisticFor,
  isLedgerEntryConsistent,
  mintId,
  muzzlePosition,
  type RunState,
} from '../../src/contracts';

/**
 * Balance probe (Task 17, evidence for O01/O03/O07/O09). A scripted player
 * aims at the centre of a random prize on the shelf (gravity compensated,
 * stops loading at a chosen bar value, fires during the calm period), plays
 * whole runs through core + sim, and writes test-results/balance-probe.json.
 * Numbers describe the PROTOTYPE values; they are measurements, not targets.
 */

const T = PROTOTYPE_TUNING;
const ctx = { tuning: T, layout: BOOTH_LAYOUT };

type Skill = 'skilled' | 'casual';
const LOAD_TARGET: Record<Skill, readonly number[]> = {
  // bar values the scripted player stops at (sweet spot 0.85)
  skilled: [0.85, 0.83, 0.88, 0.8, 0.86, 0.9],
  casual: [0.85, 0.72, 0.6, 0.95, 0.5, 0.78],
};

function aimAt(state: RunState, target: { x: number; y: number; z: number }) {
  const m = muzzlePosition(BOOTH_LAYOUT, state.standX);
  const zero = aimDirection(BOOTH_LAYOUT, state.standX, { yaw: 0, pitch: 0 });
  const dx = target.x - m.x;
  const dz = target.z - m.z;
  const horiz = Math.hypot(dx, dz);
  const spec = ballisticFor(T, state.bulletType);
  const t = horiz / spec.speed;
  const drop = 0.5 * spec.gravity * t * t;
  const yaw = Math.atan2(dx, -dz) - Math.atan2(zero.x, -zero.z);
  const pitch = Math.atan2(target.y + drop - m.y, horiz) - Math.asin(zero.y);
  return { yaw, pitch };
}

async function playRun(seed: number, skill: Skill) {
  const world = await createShotWorld(BOOTH_LAYOUT, PROTOTYPE_CATALOG, T);
  let s = createRun({ runId: mintId.run(`probe-${skill}-${seed}`), seed, tuning: T, playerName: null }, PROTOTYPE_CATALOG);
  world.syncShelf(s.shelf, s.clocks.motionSec);
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng ^ (rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return rng / 2 ** 32;
  };
  let guard = 0;
  let chains = 0;
  while (s.phase !== 'ended' && guard++ < 25) {
    const stand = (rand() - 0.5) * 0.8;
    s = reduceGame(s, { type: 'SET_POSITION', x: stand }, ctx);
    s = reduceGame(s, { type: 'CONFIRM_POSITION' }, ctx);
    const targets = LOAD_TARGET[skill];
    const bar = targets[Math.floor(rand() * targets.length)]!;
    const loadSec = (bar * T.loading.barPeriodSec) / 2;
    s = tickRun(s, loadSec, T); // < MAX_TICK_SEC chunks are applied below
    while (s.clocks.loadingSec + 1e-9 < loadSec) s = tickRun(s, Math.min(0.1, loadSec - s.clocks.loadingSec), T);
    s = reduceGame(s, { type: 'STOP_LOAD' }, ctx);
    const candidates = s.shelf.prizes;
    const pick = candidates[Math.floor(rand() * candidates.length)]!;
    s = reduceGame(s, { type: 'AIM', ...aimAt(s, pick.pose.position) }, ctx);
    for (let i = 0; i < 6; i++) s = tickRun(s, 0.1, T); // 0.6 s: inside the calm period
    s = reduceGame(s, { type: 'FIRE' }, ctx);
    world.fire(s.inFlight!.request, { runId: s.runId, chooseTransform: createTransformChooser(s, PROTOTYPE_CATALOG) });
    let rec = null;
    for (let i = 0; i < 4000 && !rec; i++) rec = world.step(1 / 60).record;
    const r = resolveShot(s, rec!, PROTOTYPE_CATALOG, T);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
    chains = Math.max(chains, r.summary.chainCount);
    s = r.state;
    if (s.phase === 'position') world.syncShelf(s.shelf, s.clocks.motionSec);
  }
  world.dispose();
  return { score: s.score, shots: s.shotsFired, prizes: s.collected.length, sets: s.completedSets.length, maxChain: chains, bonus: s.bonusAmmoTotal };
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => {
  const v = [...xs].sort((a, b) => a - b);
  return v[Math.min(v.length - 1, Math.floor(p * v.length))] ?? 0;
};

describe('balance probe (prototype values, scripted players)', () => {
  it('plays whole runs for two scripted skill levels and records the distribution', async () => {
    const report: Record<string, unknown> = { rulesVersion: PROTOTYPE_CATALOG.rulesVersion, note: 'measurement of prototype values; not targets' };
    for (const skill of ['skilled', 'casual'] as const) {
      const runs = [];
      for (let seed = 1; seed <= 12; seed++) runs.push(await playRun(seed * 7919, skill));
      for (const r of runs) {
        expect(r.shots).toBeGreaterThanOrEqual(10);
        expect(r.shots).toBeLessThanOrEqual(20);
        expect(r.score).toBeGreaterThanOrEqual(0);
      }
      const prizes = runs.map((r) => r.prizes);
      const scores = runs.map((r) => r.score);
      report[skill] = {
        runs: runs.length,
        prizesPerRun: { mean: +mean(prizes).toFixed(2), p10: pct(prizes, 0.1), p50: pct(prizes, 0.5), p90: pct(prizes, 0.9) },
        scorePerRun: { mean: +mean(scores).toFixed(1), p10: pct(scores, 0.1), p50: pct(scores, 0.5), p90: pct(scores, 0.9) },
        setsPerRun: +mean(runs.map((r) => r.sets)).toFixed(2),
        maxChainSeen: Math.max(...runs.map((r) => r.maxChain)),
        bonusAmmoRuns: runs.filter((r) => r.bonus > 0).length,
        perRun: runs,
      };
    }
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/balance-probe.json', JSON.stringify(report, null, 2));
    expect(report.skilled).toBeDefined();
  }, 300_000);
});
