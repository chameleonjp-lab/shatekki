import { expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { computeWeights, createDrawState } from '../../src/catalog/draw';
import { completedSetsFor } from '../../src/catalog/sets';
import { mintId, type PrizeTypeId } from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';

const candidate = getGameplayBundle('expanded-next');
const catalog = candidate.catalog;
const expansion = candidate.expansion!;

it('AC02, AC20, CH-AC06–09: every shipped pair and trio completes once with exactly its members', () => {
  expect(catalog.rulesVersion).toBe('rules-v2-proposed-r006');
  const pairKeys = new Set<string>();
  const pairKinds = new Set<PrizeTypeId>();
  const oldSets = getGameplayBundle('official-v1').catalog.sets;
  for (const [id, set] of catalog.sets) {
    const kinds = set.requiredTypeIds;
    expect(kinds.every(kind => catalog.prizes.has(kind))).toBe(true);
    expect(new Set(kinds).size).toBe(kinds.length);
    if (oldSets.has(id)) {
      expect(set).toEqual(oldSets.get(id));
    } else {
      expect(kinds).toHaveLength(2);
      kinds.forEach(kind => pairKinds.add(kind));
      pairKeys.add([...kinds].sort().join('/'));
    }
    expect(completedSetsFor(catalog, new Set(kinds.slice(1)), [])).not.toContain(id);
    expect(completedSetsFor(catalog, new Set([...kinds].reverse()), [])).toContain(id);
    expect(completedSetsFor(catalog, new Set(kinds), [id])).not.toContain(id);
  }
  expect(oldSets.size).toBe(100);
  expect(catalog.sets.size).toBe(400);
  expect(pairKeys.size).toBe(300);
  expect(pairKinds.size).toBe(100);
});

it('CH-AC11,13,18,20: both choices have distinct real effect pools and new runs start with complete bags', () => {
  expect(catalog.rulesVersion).toBe('rules-v2-proposed-r006');
  for (const q of expansion.questions.values()) {
    const groups = [q.choices.A, q.choices.B].map(choice => expansion.groups.get(choice.groupId)!);
    const [a, b] = groups.map(g => [...new Set(g.effectIds)].sort());
    expect(a).not.toEqual(b);
    for (const g of groups) {
      expect(g.effectIds.length).toBeGreaterThan(0);
      expect(g.effectIds.every(id => expansion.effects.has(id))).toBe(true);
    }
  }
  for (const series of expansion.series.values()) {
    expect(series.typeIds.every(id => catalog.prizes.has(id))).toBe(true);
  }
  const starts = [42, 117].map(seed => createExpandedRun({ runId: mintId.run(`qa-${seed}`), seed, playerName: null, tuning: candidate.tuning }, { ...candidate, expansion }));
  for (const state of starts) {
    expect(state.ammo).toBe(10);
    expect(state.score).toBe(0);
    expect(state.completedSets).toEqual([]);
    expect(new Set(state.shelf.prizes.map(p => p.homeSlot)).size).toBe(36);
    expect(new Set(state.expansion.questionOrder)).toEqual(new Set(expansion.questions.keys()));
    expect(state.expansion.questionOrder).toHaveLength(200);
    expect(state.expansion.cells.every(cell => !cell.used && expansion.effects.has(cell.effectId))).toBe(true);
    expect(state.expansion.cells).toHaveLength(36);
  }
  expect(starts[0]!.expansion.questionOrder).not.toEqual(starts[1]!.expansion.questionOrder);
});

it('AC12: r006 keeps repeats possible while correcting tier and kind bias on the 36-slot shelf', () => {
  const { tuning } = candidate;
  const neutral = { ...tuning, draw: { ...tuning.draw, recentPenalty: 1 } };
  const countRecent = (seed: number, settings: typeof tuning) => {
    const run = createExpandedRun({ runId: mintId.run('draw-' + seed), seed, playerName: null, tuning: settings },
      { ...candidate, tuning: settings, expansion });
    const ids = run.shelf.prizes.map(p => p.typeId);
    expect(ids).toHaveLength(36);
    return ids.filter((id, i) => ids.slice(Math.max(0, i - settings.draw.historyWindow), i).includes(id)).length;
  };
  let penalized = 0, unpenalized = 0;
  for (let i = 1; i <= 24; i++) {
    penalized += countRecent(i * 7919, tuning);
    unpenalized += countRecent(i * 7919, neutral);
  }
  expect(penalized).toBeGreaterThan(0);
  expect(penalized).toBeLessThan(unpenalized);

  const pool = [...catalog.prizes.values()];
  const easy = pool.find(p => p.difficulty === 'easy')!.typeId;
  const shelf = Array<PrizeTypeId>(36).fill(easy);
  const weights = computeWeights(catalog, createDrawState(7919), shelf, tuning);
  const unseenEasy = weights.find(w => w.typeId !== easy && catalog.prizes.get(w.typeId)!.difficulty === 'easy')!;
  const hard = weights.find(w => catalog.prizes.get(w.typeId)!.difficulty === 'hard')!;
  expect(weights.every(w => w.weight > 0)).toBe(true);
  expect(hard.weight).toBeGreaterThan(unseenEasy.weight);
  expect(weights.find(w => w.typeId === easy)!.weight).toBeCloseTo(unseenEasy.weight * tuning.draw.recentPenalty);
  console.info('r006/24 seeds', { penalized, unpenalized, hard: hard.weight, unseenEasy: unseenEasy.weight });
});
