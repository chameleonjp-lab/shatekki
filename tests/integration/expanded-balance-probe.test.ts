import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { OFFICIAL_BUNDLE } from '../../src/app/bundle';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { SEEDS, playRun } from '../helpers/scripted-player';

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
