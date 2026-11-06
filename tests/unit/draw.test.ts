import { describe, expect, it } from 'vitest';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { computeWeights, createDrawState, drawPrize, pickWeighted } from '../../src/catalog/draw';
import { isValidRngState, rngNext, seedRng } from '../../src/catalog/rng';
import type { DrawState, DifficultyTier, PrizeTypeId, RuntimeCatalog, TuningConfig, PrizeRuntimeConfig } from '../../src/contracts';
import { asPrizeTypeId } from '../../src/contracts';

const T = PROTOTYPE_TUNING;

function drawMany(seed: number, n: number, tuning: TuningConfig = T): PrizeTypeId[] {
  let d = createDrawState(seed);
  const visible: PrizeTypeId[] = [];
  const out: PrizeTypeId[] = [];
  for (let i = 0; i < n; i++) {
    const r = drawPrize(PROTOTYPE_CATALOG, d, visible, tuning);
    d = r.draw;
    out.push(r.typeId);
    visible.push(r.typeId);
    if (visible.length > 9) visible.shift();
  }
  return out;
}

describe('rng (xoshiro128**)', () => {
  it('is reproducible from the seed and returns values in [0,1)', () => {
    let a = seedRng(123);
    let b = seedRng(123);
    for (let i = 0; i < 1000; i++) {
      const x = rngNext(a);
      const y = rngNext(b);
      expect(x.value).toBe(y.value);
      expect(x.value).toBeGreaterThanOrEqual(0);
      expect(x.value).toBeLessThan(1);
      a = x.state;
      b = y.state;
    }
  });

  it('different seeds give different streams and state is a valid 4-word value', () => {
    expect(seedRng(1)).not.toEqual(seedRng(2));
    expect(isValidRngState(seedRng(0))).toBe(true);
    expect(isValidRngState([0, 0, 0, 0])).toBe(false);
    expect(isValidRngState([1, 2, 3])).toBe(false);
    expect(() => rngNext([0, 0, 0, 0] as never)).toThrow();
  });

  it('has a roughly uniform distribution', () => {
    let s = seedRng(7);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const r = rngNext(s);
      s = r.state;
      sum += r.value;
    }
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.01);
  });
});

describe('pickWeighted', () => {
  it('rejects empty, zero, negative, NaN and infinite weights', () => {
    expect(() => pickWeighted([], 0.5)).toThrow();
    expect(() => pickWeighted([1, 0], 0.5)).toThrow();
    expect(() => pickWeighted([1, -1], 0.5)).toThrow();
    expect(() => pickWeighted([1, Number.NaN], 0.5)).toThrow();
    expect(() => pickWeighted([1, Number.POSITIVE_INFINITY], 0.5)).toThrow();
  });
  it('rejects u outside [0,1)', () => {
    expect(() => pickWeighted([1, 1], 1)).toThrow();
    expect(() => pickWeighted([1, 1], -0.1)).toThrow();
  });
  it('picks by cumulative weight', () => {
    expect(pickWeighted([1, 1, 2], 0)).toBe(0);
    expect(pickWeighted([1, 1, 2], 0.26)).toBe(1);
    expect(pickWeighted([1, 1, 2], 0.6)).toBe(2);
    expect(pickWeighted([1, 1, 2], 0.9999999)).toBe(2);
  });
});

describe('drawPrize', () => {
  it('is reproducible with a fixed seed', () => {
    expect(drawMany(42, 60)).toEqual(drawMany(42, 60));
    expect(drawMany(42, 60)).not.toEqual(drawMany(43, 60));
  });

  it('save / restore of the state continues identically', () => {
    let d = createDrawState(9);
    const visible: PrizeTypeId[] = [];
    for (let i = 0; i < 17; i++) {
      const r = drawPrize(PROTOTYPE_CATALOG, d, visible, T);
      d = r.draw;
      visible.push(r.typeId);
      if (visible.length > 9) visible.shift();
    }
    const restored: DrawState = JSON.parse(JSON.stringify(d));
    let a = d;
    let b = restored;
    for (let i = 0; i < 30; i++) {
      const ra = drawPrize(PROTOTYPE_CATALOG, a, visible, T);
      const rb = drawPrize(PROTOTYPE_CATALOG, b, visible, T);
      expect(rb.typeId).toBe(ra.typeId);
      a = ra.draw;
      b = rb.draw;
    }
    expect(b).toEqual(a);
    expect(a.drawCount).toBe(47);
  });

  it('keeps history to the configured window and counts draws', () => {
    const r = drawMany(5, 30);
    expect(r).toHaveLength(30);
    let d = createDrawState(5);
    for (let i = 0; i < 30; i++) d = drawPrize(PROTOTYPE_CATALOG, d, [], T).draw;
    expect(d.history.length).toBe(T.draw.historyWindow);
    expect(d.drawCount).toBe(30);
  });

  it('weights are finite, positive and never 0, even in extreme situations', () => {
    const allEasy = [...PROTOTYPE_CATALOG.prizes.values()].filter((p) => p.difficulty === 'easy').slice(0, 9).map((p) => p.typeId);
    let d = createDrawState(1);
    for (const p of allEasy) d = { ...d, history: [...d.history, p] };
    const w = computeWeights(PROTOTYPE_CATALOG, d, allEasy, T);
    expect(w).toHaveLength(100);
    for (const x of w) {
      expect(Number.isFinite(x.weight)).toBe(true);
      expect(x.weight).toBeGreaterThan(0);
    }
    // extreme tuning: strongest penalty permitted still > 0
    const w2 = computeWeights(PROTOTYPE_CATALOG, d, allEasy, { ...T, draw: { ...T.draw, recentPenalty: 1e-9 } });
    for (const x of w2) expect(x.weight).toBeGreaterThan(0);
  });

  it('rejects a recentPenalty outside (0,1] and an empty catalog', () => {
    const d = createDrawState(1);
    expect(() => drawPrize(PROTOTYPE_CATALOG, d, [], { ...T, draw: { ...T.draw, recentPenalty: 0 } })).toThrow();
    expect(() => drawPrize(PROTOTYPE_CATALOG, d, [], { ...T, draw: { ...T.draw, recentPenalty: Number.NaN } })).toThrow();
    expect(() => drawPrize({ ...PROTOTYPE_CATALOG, prizes: new Map() }, d, [], T)).toThrow();
  });

  it('the same kind can appear again (no ban), even inside the window', () => {
    // one-kind catalog: must repeat
    const only = [...PROTOTYPE_CATALOG.prizes.values()][0]!;
    const cat: RuntimeCatalog = { ...PROTOTYPE_CATALOG, prizes: new Map<PrizeTypeId, PrizeRuntimeConfig>([[only.typeId, only]]) };
    let d = createDrawState(3);
    for (let i = 0; i < 5; i++) {
      const r = drawPrize(cat, d, [only.typeId], T);
      expect(r.typeId).toBe(only.typeId);
      d = r.draw;
    }
    // real catalog: some seed produces a repeat inside the window
    let repeats = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = drawMany(seed, 60);
      for (let i = 1; i < s.length; i++) {
        if (s.slice(Math.max(0, i - T.draw.historyWindow), i).includes(s[i]!)) repeats++;
      }
    }
    expect(repeats).toBeGreaterThan(0);
  });

  it('repeat rate within the window is clearly lower than without the penalty', () => {
    // Tolerances fixed BEFORE the first run:
    //  - without penalty (x1.0) the rate is about 12/100 minus overlap; accept 0.05..0.20
    //  - with the prototype penalty (x0.25) it must be below 60% of the unpenalized rate
    const SEEDS = 40;
    const N = 60;
    const rate = (tuning: TuningConfig) => {
      let hit = 0;
      let total = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const s = drawMany(seed, N, tuning);
        for (let i = 1; i < s.length; i++) {
          total++;
          if (s.slice(Math.max(0, i - tuning.draw.historyWindow), i).includes(s[i]!)) hit++;
        }
      }
      return hit / total;
    };
    const none = rate({ ...T, draw: { ...T.draw, recentPenalty: 1 } });
    const pen = rate(T);
    expect(none).toBeGreaterThan(0.05);
    expect(none).toBeLessThan(0.2);
    expect(pen).toBeLessThan(none * 0.6);
  });

  it('balances difficulty tiers toward the targets among visible prizes', () => {
    const tierOf = (id: PrizeTypeId): DifficultyTier => PROTOTYPE_CATALOG.prizes.get(id)!.difficulty;
    const easyIds = [...PROTOTYPE_CATALOG.prizes.values()].filter((p) => p.difficulty === 'easy').map((p) => p.typeId);
    const visible = easyIds.slice(0, 9);
    // factor check: with 9 easy visible, a hard kind is clearly more likely than an easy kind
    const w = computeWeights(PROTOTYPE_CATALOG, createDrawState(1), visible, T);
    const avg = (tier: DifficultyTier) => {
      const xs = w.filter((x) => tierOf(x.typeId) === tier && !visible.includes(x.typeId));
      return xs.reduce((a, x) => a + x.weight, 0) / xs.length;
    };
    expect(avg('hard')).toBeGreaterThan(avg('easy') * 5);
    expect(avg('normal')).toBeGreaterThan(avg('easy') * 5);

    // simulation: shelf of 9 slots, random slot replaced each time; long-run mean count near targets
    const meanCounts = (tuning: TuningConfig) => {
      const sum = { easy: 0, normal: 0, hard: 0 };
      let samples = 0;
      for (let seed = 1; seed <= 20; seed++) {
        let d = createDrawState(seed);
        let shelf: PrizeTypeId[] = [...visible];
        let pick = seedRng(seed * 7919);
        for (let i = 0; i < 80; i++) {
          const rn = rngNext(pick);
          pick = rn.state;
          const idx = Math.floor(rn.value * 9);
          const rest = shelf.filter((_, j) => j !== idx);
          const r = drawPrize(PROTOTYPE_CATALOG, d, rest, tuning);
          d = r.draw;
          shelf = [...rest, r.typeId];
          if (i >= 20) {
            for (const s of shelf) sum[tierOf(s)]++;
            samples++;
          }
        }
      }
      return { easy: sum.easy / samples, normal: sum.normal / samples, hard: sum.hard / samples };
    };
    const m = meanCounts(T);
    expect(Math.abs(m.easy - 3)).toBeLessThan(1);
    expect(Math.abs(m.normal - 4)).toBeLessThan(1);
    expect(Math.abs(m.hard - 2)).toBeLessThan(1);
    // targets are really used: skew them and the counts follow
    const skew = meanCounts({ ...T, draw: { ...T.draw, tierTargets: { easy: 1, normal: 7, hard: 1 } } });
    expect(skew.normal).toBeGreaterThan(m.normal + 1);
  });

  it('does not guarantee or steer toward set completion (weights ignore collected kinds)', () => {
    const d = createDrawState(1);
    const a = computeWeights(PROTOTYPE_CATALOG, d, [], T);
    const b = computeWeights(PROTOTYPE_CATALOG, d, [], T);
    expect(a).toEqual(b);
    expect(new Set(a.map((x) => x.weight)).size).toBeLessThanOrEqual(3); // only tier factors, no per-set boost
  });
});

describe('catalog helper typing', () => {
  it('asPrizeTypeId guards', () => {
    expect(asPrizeTypeId('P001')).toBe('P001');
  });
});
