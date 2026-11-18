import { mkdirSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GAMEPLAY_BUNDLE_KEYS, REWARD_IDS } from '../../src/contracts';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { playRun, SEEDS } from '../helpers/scripted-player';

describe('24-seed comparison of each actual build policy', () => {
  for (const key of GAMEPLAY_BUNDLE_KEYS) {
    it(`plays ${key} to finite settlement with the same scripted inputs`, async () => {
      const bundle = getGameplayBundle(key);
      const runs = [];
      for (const seed of SEEDS) {
        const run = await playRun(bundle, seed);
        expect(run.ammoBalanced, String(seed)).toBe(true);
        expect(run.shots).toBeLessThanOrEqual(20);
        expect(run.shotSeconds).toBeGreaterThan(0);
        expect(run.maxCorks).toBeLessThanOrEqual(bundle.tuning.limits.maxSimultaneousCorks);
        runs.push(run);
      }
      const sources = Object.fromEntries(REWARD_IDS.map(id => {
        if (!bundle.expansion?.profile.rewards?.enabled.includes(id)) return [id, null];
        const outcomes = runs.flatMap(r => r.rewards.filter(o => o.id === id));
        return [id, {
          eligibleShots: runs.reduce((n, r) => n + (r.attempts[id] ?? 0), 0),
          triggers: outcomes.length,
          offered: outcomes.reduce((n, o) => n + o.offered, 0),
          granted: outcomes.reduce((n, o) => n + o.granted, 0),
          capped: outcomes.filter(o => o.granted < o.offered).length,
        }];
      }));
      mkdirSync('test-results/balance', { recursive: true });
      writeFileSync(`test-results/balance/${key}.json`, JSON.stringify({
        rulesVersion: bundle.catalog.rulesVersion, policy: bundle.behavior ?? 'legacy', sources, runs,
      }, null, 2));
      expect(runs.map(r => r.seed)).toEqual(SEEDS);
    }, 600_000);
  }
});
