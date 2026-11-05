import { describe, expect, it } from 'vitest';
import candidates from '../../data/catalog-candidates.json';
import { validateCatalog } from '../../src/catalog/validate';
import { PROTOTYPE_CATALOG, MAX_PRIZE_DEPTH, MAX_PRIZE_HEIGHT, MAX_PRIZE_WIDTH, shapeExtents } from '../../src/catalog/runtime-config';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { BOOTH_LAYOUT, catalogValueStatus } from '../../src/contracts';

const clone = () => JSON.parse(JSON.stringify(candidates)) as any;

describe('validateCatalog', () => {
  it('accepts the shipped candidates (100 prizes, 100 sets) and keeps null as null', () => {
    const r = validateCatalog(candidates);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.catalog?.prizes).toHaveLength(100);
    expect(r.catalog?.sets).toHaveLength(100);
    expect(r.catalog?.prizes[0]?.hit_points).toBeNull();
    expect(r.catalog?.prizes[0]?.base_score).toBeNull();
  });

  it('rejects non-objects and missing arrays', () => {
    expect(validateCatalog(null).valid).toBe(false);
    expect(validateCatalog('x').valid).toBe(false);
    expect(validateCatalog({ document_version: '1', status: 's' }).valid).toBe(false);
  });

  it('rejects a wrong prize or set count', () => {
    const d = clone();
    d.prizes.pop();
    expect(validateCatalog(d).valid).toBe(false);
    const e = clone();
    e.sets.pop();
    expect(validateCatalog(e).valid).toBe(false);
  });

  it('rejects duplicate prize ids and duplicate set ids', () => {
    const d = clone();
    d.prizes[1].id = 'P001';
    expect(validateCatalog(d).errors.some((e) => e.reason.includes('duplicate prize id'))).toBe(true);
    const e = clone();
    e.sets[1].id = 'S001';
    expect(validateCatalog(e).errors.some((x) => x.reason.includes('duplicate set id'))).toBe(true);
  });

  it('rejects sets that do not have exactly 3 distinct existing prizes', () => {
    const a = clone();
    a.sets[0].required_prize_ids = ['P001', 'P002'];
    expect(validateCatalog(a).valid).toBe(false);
    const b = clone();
    b.sets[0].required_prize_ids = ['P001', 'P001', 'P002'];
    expect(validateCatalog(b).errors.some((e) => e.reason.includes('distinct'))).toBe(true);
    const c = clone();
    c.sets[0].required_prize_ids = ['P001', 'P002', 'P999'];
    expect(validateCatalog(c).errors.some((e) => e.reason.includes('does not exist'))).toBe(true);
    const d = clone();
    d.sets[0].required_prize_ids = ['P001', 'P002', 'P003', 'P004'];
    expect(validateCatalog(d).valid).toBe(false);
  });

  it('rejects numeric fields that are negative or non-finite but allows null', () => {
    const a = clone();
    a.prizes[0].hit_points = -1;
    expect(validateCatalog(a).valid).toBe(false);
    const b = clone();
    b.prizes[0].mass = Number.NaN;
    expect(validateCatalog(b).valid).toBe(false);
    const c = clone();
    c.prizes[0].base_score = 0; // an explicit 0 is a value, not "undecided"
    expect(validateCatalog(c).valid).toBe(true);
  });
});

describe('prototype runtime catalog', () => {
  const slot = BOOTH_LAYOUT.slots[0]!;

  it('covers all 100 prizes and 100 sets, all marked prototype', () => {
    expect(PROTOTYPE_CATALOG.prizes.size).toBe(100);
    expect(PROTOTYPE_CATALOG.sets.size).toBe(100);
    expect(catalogValueStatus(PROTOTYPE_CATALOG)).toBe('prototype');
    expect(PROTOTYPE_TUNING.valueStatus).toBe('prototype');
  });

  it('uses the candidate set membership exactly (3 distinct existing prizes)', () => {
    for (const c of candidates.sets) {
      const s = [...PROTOTYPE_CATALOG.sets.values()].find((x) => x.setId === c.id)!;
      expect([...s.requiredTypeIds]).toEqual(c.required_prize_ids);
      expect(new Set(s.requiredTypeIds).size).toBe(3);
      for (const t of s.requiredTypeIds) expect(PROTOTYPE_CATALOG.prizes.has(t)).toBe(true);
      expect(s.hintKey).toBe(`set.${c.id}.hint`);
      expect(s.bonusScore).toBeGreaterThan(0);
    }
  });

  it('every prize has finite positive values and fits the slot occupancy box', () => {
    for (const p of PROTOTYPE_CATALOG.prizes.values()) {
      expect(Number.isFinite(p.massKg) && p.massKg > 0, p.typeId).toBe(true);
      expect(p.maxHp).toBeGreaterThanOrEqual(1);
      expect(p.baseScore).toBeGreaterThan(0);
      expect(p.friction).toBeGreaterThan(0);
      expect(p.restitution).toBeGreaterThanOrEqual(0);
      expect(p.modelKey).toBe(p.typeId);
      expect(p.valueStatus).toBe('prototype');
      const e = shapeExtents(p.shape);
      expect(e.w, p.typeId).toBeLessThanOrEqual(MAX_PRIZE_WIDTH);
      expect(e.h, p.typeId).toBeLessThanOrEqual(MAX_PRIZE_HEIGHT);
      expect(e.d, p.typeId).toBeLessThanOrEqual(MAX_PRIZE_DEPTH);
      expect(e.h, p.typeId).toBeGreaterThanOrEqual(0.02);
      // keep the layout constants honest
      expect(MAX_PRIZE_WIDTH / 2).toBeLessThanOrEqual(slot.occupancyBox.halfExtents.x);
      expect(MAX_PRIZE_HEIGHT / 2).toBeLessThanOrEqual(slot.occupancyBox.halfExtents.y);
      expect(MAX_PRIZE_DEPTH / 2).toBeLessThanOrEqual(slot.occupancyBox.halfExtents.z);
    }
  });

  it('has 8-12 moving prizes whose motion stays inside the slot', () => {
    const moving = [...PROTOTYPE_CATALOG.prizes.values()].filter((p) => p.motion.type !== 'none');
    expect(moving.length).toBeGreaterThanOrEqual(8);
    expect(moving.length).toBeLessThanOrEqual(12);
    const types = new Set(moving.map((p) => p.motion.type));
    for (const t of ['slide', 'spin', 'swing', 'bob']) expect(types.has(t as never)).toBe(true);
    for (const p of moving) {
      const e = shapeExtents(p.shape);
      const m = p.motion;
      if (m.type === 'slide') expect(e.w / 2 + m.amplitude, p.typeId).toBeLessThanOrEqual(slot.occupancyBox.halfExtents.x);
      if (m.type === 'bob') expect(e.h + m.amplitude, p.typeId).toBeLessThanOrEqual(MAX_PRIZE_HEIGHT + 0.001);
      if ('periodSec' in m) expect(m.periodSec).toBeGreaterThan(0);
    }
    const byId = (id: string) => [...PROTOTYPE_CATALOG.prizes.values()].find((p) => p.typeId === id)!;
    expect(byId('P019').motion.type).toBe('swing'); // 風鈴
    expect(byId('P024').motion.type).toBe('spin'); // こま
    expect(byId('P023').motion.type).toBe('slide'); // 金魚
    expect(byId('P022').motion.type).toBe('bob'); // ヨーヨー風船
  });

  it('has a reasonable difficulty spread for tier balancing', () => {
    const count = { easy: 0, normal: 0, hard: 0 };
    for (const p of PROTOTYPE_CATALOG.prizes.values()) count[p.difficulty]++;
    for (const k of ['easy', 'normal', 'hard'] as const) {
      expect(count[k], k).toBeGreaterThanOrEqual(15);
    }
  });
});
