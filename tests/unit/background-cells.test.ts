import { describe, expect, it } from 'vitest';
import { assignCells } from '../../src/core/background-cells';
import { seedRng } from '../../src/catalog/rng';
import { BOOTH_LAYOUT_V2, CELL_IDS_V2, type EffectId } from '../../src/contracts';

const EFFECTS = Array.from({ length: 100 }, (_, i) => `FX${String(i + 1).padStart(3, '0')}` as EffectId);

describe('assignCells (D37: 36 cells, independent uniform draws)', () => {
  it('assigns one effect to each of the 36 cells, unused, in the given cell order', () => {
    const { cells } = assignCells(seedRng(1), CELL_IDS_V2, EFFECTS);
    expect(cells).toHaveLength(36);
    expect(cells.map((c) => c.cellId)).toEqual(CELL_IDS_V2);
    for (const c of cells) {
      expect(EFFECTS).toContain(c.effectId);
      expect(c.used).toBe(false);
      expect(c.usedOnShot).toBeNull();
      expect(c.requestId).toBeNull();
    }
  });

  it('is deterministic per seed and the returned rng continues the stream', () => {
    const a = assignCells(seedRng(5), CELL_IDS_V2, EFFECTS);
    const b = assignCells(seedRng(5), CELL_IDS_V2, EFFECTS);
    expect(a).toEqual(b);
    expect(a.rng).not.toEqual(seedRng(5));
    expect(assignCells(seedRng(6), CELL_IDS_V2, EFFECTS).cells).not.toEqual(a.cells);
  });

  it('allows the same effect on several cells and does not force all 100 effects', () => {
    let duplicates = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const ids = assignCells(seedRng(seed), CELL_IDS_V2, EFFECTS).cells.map((c) => c.effectId);
      if (new Set(ids).size < ids.length) duplicates++;
    }
    expect(duplicates).toBeGreaterThan(0);
  });

  it('is roughly uniform over the effects (independent draws)', () => {
    const counts = new Map<string, number>();
    let rng = seedRng(99);
    const draws = 200;
    for (let i = 0; i < draws; i++) {
      const r = assignCells(rng, CELL_IDS_V2, EFFECTS);
      rng = r.rng;
      for (const c of r.cells) counts.set(c.effectId, (counts.get(c.effectId) ?? 0) + 1);
    }
    const total = draws * 36;
    for (const e of EFFECTS) {
      const share = (counts.get(e) ?? 0) / total;
      expect(share).toBeGreaterThan(0.002);
      expect(share).toBeLessThan(0.025);
    }
  });

  it('rejects an empty effect list and matches the layout cell ids', () => {
    expect(() => assignCells(seedRng(1), CELL_IDS_V2, [])).toThrow(RangeError);
    expect(BOOTH_LAYOUT_V2.backgroundCells!.map((c) => c.cellId)).toEqual(CELL_IDS_V2);
  });
});
