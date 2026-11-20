import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import type { GameplayBundleKey } from '../../src/contracts';
import { playRun, SEEDS } from '../helpers/scripted-player';

// T09: the public 9-slot game, r006 and r007 played by the same scripted player on the same 24
// seeds. A measurement for the user's decision, not a tuning: no value here changes any rule.
// Writes test-results/balance/t09-compare.json (and .md). The player is scripted (aims at a random
// prize, sometimes a cell or the shopkeeper body, the same bar targets), not a person.
const VERSIONS: readonly [label: string, key: GameplayBundleKey][] = [
  ['9枠（公開版 rules-v1）', 'official-v1'],
  ['r006（expanded-next）', 'expanded-next'],
  ['r007（expanded-aim-first）', 'expanded-aim-first'],
];

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (xs: readonly number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

describe('T09 balance comparison: 9-slot / r006 / r007, 24 seeds each', () => {
  it('plays every version to the end and writes one comparison table', async () => {
    const rows: Record<string, unknown>[] = [];
    for (const [label, key] of VERSIONS) {
      const b = getGameplayBundle(key);
      const runs = [];
      for (const seed of SEEDS) {
        const r = await playRun(b, seed);
        expect(r.ammoBalanced, `${key}/${seed}`).toBe(true);
        runs.push(r);
      }
      const faceOf = new Map((b.layout.backgroundCells ?? []).map((c) => [c.cellId as string, c.face ?? 'back']));
      const cellHits: Record<string, number> = {};
      for (const r of runs) for (const id of r.usedCellIds) cellHits[id] = (cellHits[id] ?? 0) + 1;
      const byFace: Record<string, number> = {};
      for (const [id, n] of Object.entries(cellHits)) byFace[faceOf.get(id) ?? 'back'] = (byFace[faceOf.get(id) ?? 'back'] ?? 0) + n;
      const shots = runs.map((r) => r.shots);
      rows.push({
        label,
        key,
        rulesVersion: b.catalog.rulesVersion,
        runs: runs.length,
        score: { mean: Math.round(mean(runs.map((r) => r.score))), p10: pct(runs.map((r) => r.score), 0.1), p90: pct(runs.map((r) => r.score), 0.9) },
        prizes: +mean(runs.map((r) => r.prizes)).toFixed(2),
        trioSets: +mean(runs.map((r) => r.trioSets)).toFixed(2),
        pairSets: +mean(runs.map((r) => r.pairSets)).toFixed(2),
        shots: +mean(shots).toFixed(2),
        refill: +mean(runs.map((r) => r.bonusAmmo)).toFixed(2),
        ammoLost: +mean(runs.map((r) => r.ammoLost)).toFixed(2),
        missRate: +(runs.reduce((n, r) => n + r.missShots, 0) / Math.max(1, runs.reduce((n, r) => n + r.shots, 0))).toFixed(3),
        // simulated flight time only (no menus, no human thinking time)
        flightSecPerGame: +mean(runs.map((r) => r.shotSeconds)).toFixed(1),
        cellsUsedPerGame: +mean(runs.map((r) => r.cellsUsed)).toFixed(2),
        cellCount: b.layout.backgroundCells?.length ?? 0,
        distinctCellsHitIn24: Object.keys(cellHits).length,
        cellHitsByFace: byFace,
        cellHits,
      });
    }
    mkdirSync('test-results/balance', { recursive: true });
    writeFileSync('test-results/balance/t09-compare.json', JSON.stringify({ seeds: SEEDS, rows }, null, 2));
    const md = [
      '| 版 | 平均点(10%〜90%) | 景品 | 3種セット | 2種セット | 射数 | 補充弾 | 失った弾 | 取れなかった射の割合 | 飛行秒/回 | 使ったマス/回 | 24回で当たったマス |',
      '|---|---|---|---|---|---|---|---|---|---|---|---|',
      ...rows.map((r: any) => `| ${r.label} | ${r.score.mean}（${r.score.p10}〜${r.score.p90}） | ${r.prizes} | ${r.trioSets} | ${r.pairSets} | ${r.shots} | ${r.refill} | ${r.ammoLost} | ${(r.missRate * 100).toFixed(1)}% | ${r.flightSecPerGame} | ${r.cellsUsedPerGame} | ${r.distinctCellsHitIn24}/${r.cellCount} ${JSON.stringify(r.cellHitsByFace)} |`),
    ].join('\n');
    writeFileSync('test-results/balance/t09-compare.md', md + '\n');
    expect(rows).toHaveLength(3);
  }, 1_800_000);
});
