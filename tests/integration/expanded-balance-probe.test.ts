import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { GameController, type RulesApi } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { OFFICIAL_BUNDLE } from '../../src/app/bundle';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { createShotWorld } from '../../src/sim/world';
import {
  aimDirection,
  ballisticFor,
  corkFreeFlightPath,
  isAmmoBalanced,
  isExpandedRunState,
  isPairSetId,
  mintId,
  muzzlePosition,
  type EffectPlan,
  type GameplayBundle,
  type RunState,
  type ShotRecord,
  type Vec3,
} from '../../src/contracts';

/**
 * Expanded balance probe (EG10, evidence for C01-C05). A scripted player
 * plays whole runs through the real controller, world, effect planning and
 * settlement for the official-v1 bundle and the expanded prototype with the
 * same seeds: random stand position, random target (a prize, or for the
 * expanded bundle sometimes a background cell or the shopkeeper), a loading
 * stop near the sweet spot, a shot in the calm period, and a random answer.
 * Writes test-results/expanded-balance-probe.json. These are measurements of
 * prototype values in Node (not Safari, not a device), never targets, and a
 * dozen runs cannot fix a completion probability.
 */

const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 7919);
const LOAD_BARS = [0.85, 0.82, 0.88, 0.78, 0.9];

function aimAt(b: GameplayBundle, standX: number, target: Vec3, bulletType: RunState['bulletType']) {
  const L = b.layout;
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(b.tuning, bulletType);
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const c = path[i]!;
        return a.y + ((c.y - a.y) * (a.z - target.z)) / (a.z - c.z);
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
  return { yaw, pitch: (lo + hi) / 2 };
}

interface ShotStats {
  plans: EffectPlan[];
  records: ShotRecord[];
}

async function playRun(b: GameplayBundle, seed: number) {
  const world = await createShotWorld(b.layout, b.catalog, b.tuning);
  const stats: ShotStats = { plans: [], records: [] };
  const rules: RulesApi = {
    ...CORE_RULES,
    resolveExpandedShot: (s, rec, ctx) => {
      if (s.inFlight?.plan) stats.plans.push(s.inFlight.plan);
      stats.records.push(rec);
      return CORE_RULES.resolveExpandedShot!(s, rec, ctx);
    },
  };
  const config = { runId: mintId.run(`probe-${b.key}-${seed}`), seed, tuning: b.tuning, playerName: null };
  const initial = b.expansion ? createExpandedRun(config, { ...b, expansion: b.expansion }) : CORE_RULES.createRun(config, b.catalog);
  const c = new GameController({ rules, world, renderer: null, catalog: b.catalog, tuning: b.tuning, layout: b.layout, expansion: b.expansion }, initial);
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng ^ (rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return rng / 2 ** 32;
  };
  const cam = b.layout.camera;
  let questions = 0;
  let maxCorks = 0;
  const started = performance.now();
  for (let guard = 0; c.current.phase !== 'ended' && guard < 25; guard++) {
    const s0 = c.current;
    const roll = rand();
    let target: Vec3;
    let standX: number;
    const cells = b.layout.backgroundCells ?? [];
    if (b.expansion && roll < 0.1) {
      const body = b.layout.shopkeeper.find((p) => p.part === 'body')!.box.center;
      standX = cam.standMaxX;
      target = { x: body.x, y: 1.1, z: body.z + 0.1 };
    } else if (b.expansion && roll < 0.3 && cells.length > 0) {
      const cell = cells[Math.floor(rand() * cells.length)]!;
      standX = Math.min(cam.standMaxX, Math.max(cam.standMinX, cell.box.center.x));
      target = { x: cell.box.center.x + (rand() < 0.5 ? -0.12 : 0.12), y: cell.box.center.y - 0.05, z: cell.box.center.z };
    } else {
      const pick = s0.shelf.prizes[Math.floor(rand() * s0.shelf.prizes.length)]!;
      standX = Math.min(cam.standMaxX, Math.max(cam.standMinX, pick.pose.position.x + (rand() - 0.5) * 0.3));
      target = pick.pose.position;
    }
    c.dispatch({ type: 'SET_POSITION', x: standX });
    c.dispatch({ type: 'CONFIRM_POSITION' });
    const bar = LOAD_BARS[Math.floor(rand() * LOAD_BARS.length)]!;
    const period = b.tuning.loading.barPeriodSec * (isExpandedRunState(c.current) ? c.current.expansion.next.modifiers.loadPeriodMult : 1);
    let left = (bar * period) / 2;
    while (left > 1e-9) {
      const dt = Math.min(0.05, left);
      c.frame(dt);
      left -= dt;
    }
    c.dispatch({ type: 'STOP_LOAD' });
    const s1 = c.current;
    const bt = isExpandedRunState(s1) ? (s1.expansion.next.modifiers.bulletType ?? s1.bulletType) : s1.bulletType;
    c.dispatch({ type: 'AIM', ...aimAt(b, s1.standX, target, bt) });
    for (let i = 0; i < 5; i++) c.frame(0.1);
    if (!c.dispatch({ type: 'FIRE' })) throw new Error(`FIRE rejected in ${s1.phase}`);
    for (let i = 0; i < 6000 && c.current.phase === 'resolving'; i++) {
      if (c.awaitingAnswer) {
        const f = c.current.inFlight!;
        questions += 1;
        c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: f.shotId, questionId: f.plan!.question!.questionId, choice: rand() < 0.5 ? 'A' : 'B' });
        continue;
      }
      c.frame(1 / 60);
      maxCorks = Math.max(maxCorks, world.frame().projectiles.length);
    }
    if (c.current.phase === 'resolving') throw new Error('a shot never settled');
  }
  const end = c.current;
  world.dispose();
  const kindOf = (fx: string | null) => (fx && b.expansion ? (b.expansion.effects.get(fx as never)?.operation.kind ?? 'unknown') : '-');
  const effects: Record<string, { applied: number; notApplicable: number }> = {};
  for (const p of stats.plans)
    for (const e of p.processed) {
      const k = `${e.source.kind}:${kindOf(e.effectId)}`;
      effects[k] ??= { applied: 0, notApplicable: 0 };
      effects[k]![e.outcome === 'applied' ? 'applied' : 'notApplicable'] += 1;
    }
  const intents = stats.plans.reduce((n, p) => n + p.transforms.length, 0);
  const applied = stats.records.reduce((n, r) => n + (r.appliedTransforms?.length ?? 0), 0);
  const deferredAtShot = stats.records.reduce((n, r) => n + (r.deferredTransforms?.length ?? 0), 0);
  return {
    seed,
    score: end.score,
    shots: end.shotsFired,
    prizes: end.collected.length,
    trioSets: end.completedSets.filter((id) => !isPairSetId(id)).length,
    pairSets: end.completedSets.filter((id) => isPairSetId(id)).length,
    bonusAmmo: end.bonusAmmoTotal,
    ammoLost: end.ammoLostTotal ?? 0,
    questions,
    cellsUsed: end.expansion?.cells.filter((x) => x.used).length ?? 0,
    transformIntents: intents,
    transformsApplied: applied,
    transformsDeferredAtShotEnd: deferredAtShot,
    maxCorks,
    ammoBalanced: isAmmoBalanced(end, b.tuning.initialAmmo),
    effects,
    wallMs: Math.round(performance.now() - started),
  };
}

const mean = (xs: number[]) => xs.reduce((a, x) => a + x, 0) / Math.max(1, xs.length);
const pct = (xs: number[], p: number) => [...xs].sort((a, x) => a - x)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
const dist = (xs: number[]) => ({ mean: +mean(xs).toFixed(2), p10: pct(xs, 0.1), p50: pct(xs, 0.5), p90: pct(xs, 0.9) });

describe('expanded balance probe (prototype values, scripted player, Node)', () => {
  it('plays the same seeds with official-v1 and the expanded prototype and records the distribution', async () => {
    const expanded = getGameplayBundle('expanded-proposed');
    const report: Record<string, unknown> = {
      note: 'Measurements of prototype values with a scripted player in Node/Rapier. Not Safari, not a device, not targets.',
      seeds: SEEDS,
    };
    for (const b of [OFFICIAL_BUNDLE, expanded]) {
      const runs = [];
      for (const seed of SEEDS) runs.push(await playRun(b, seed));
      for (const r of runs) {
        expect(r.ammoBalanced, `${b.key} seed ${r.seed}`).toBe(true);
        // Expanded effects may remove ammo (FX021-023), so count the shots plus the ammo really lost.
        expect(r.shots + r.ammoLost).toBeGreaterThanOrEqual(b.tuning.initialAmmo);
        expect(r.shots).toBeLessThanOrEqual(20);
        expect(r.score).toBeGreaterThanOrEqual(0);
        expect(r.maxCorks).toBeLessThanOrEqual(b.tuning.limits.maxSimultaneousCorks);
      }
      const effectTotals: Record<string, { applied: number; notApplicable: number }> = {};
      for (const r of runs)
        for (const [k, v] of Object.entries(r.effects)) {
          effectTotals[k] ??= { applied: 0, notApplicable: 0 };
          effectTotals[k]!.applied += v.applied;
          effectTotals[k]!.notApplicable += v.notApplicable;
        }
      report[b.key] = {
        rulesVersion: b.catalog.rulesVersion,
        runs: runs.length,
        prizesPerRun: dist(runs.map((r) => r.prizes)),
        scorePerRun: dist(runs.map((r) => r.score)),
        shotsPerRun: dist(runs.map((r) => r.shots)),
        trioSetsPerRun: +mean(runs.map((r) => r.trioSets)).toFixed(2),
        pairSetsPerRun: +mean(runs.map((r) => r.pairSets)).toFixed(2),
        runsWithAnySet: runs.filter((r) => r.trioSets + r.pairSets > 0).length,
        questionsPerRun: +mean(runs.map((r) => r.questions)).toFixed(2),
        cellsUsedPerRun: +mean(runs.map((r) => r.cellsUsed)).toFixed(2),
        transforms: {
          intents: runs.reduce((n, r) => n + r.transformIntents, 0),
          applied: runs.reduce((n, r) => n + r.transformsApplied, 0),
          deferredAtShotEnd: runs.reduce((n, r) => n + r.transformsDeferredAtShotEnd, 0),
        },
        effects: effectTotals,
        wallMsPerRun: dist(runs.map((r) => r.wallMs)),
        perRun: runs.map(({ effects: _e, ...rest }) => rest),
      };
    }
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/expanded-balance-probe.json', JSON.stringify(report, null, 2));
    expect(report['expanded-proposed']).toBeDefined();
  }, 600_000);
});
