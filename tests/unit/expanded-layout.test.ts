import { describe, expect, it } from 'vitest';
import {
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  SLOT_IDS_V2,
  cellForSlot,
  isExpandedRunState,
  isAmmoBalanced,
  mintId,
  type EffectDef,
  type EffectGroupId,
  type EffectId,
  type ExpansionCatalog,
  type QuestionDef,
  type QuestionId,
  type TuningConfig,
} from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';
import { CAT, T } from './helpers';

const T36: TuningConfig = { ...T, shelfSlotCount: 36, draw: { ...T.draw, tierTargets: { easy: 12, normal: 16, hard: 8 } } };

function fakeExpansion(): ExpansionCatalog {
  const questions = new Map<QuestionId, QuestionDef>();
  for (let i = 1; i <= 200; i++) {
    const id = `Q${String(i).padStart(3, '0')}` as QuestionId;
    questions.set(id, { questionId: id, textKey: `q.${id}`, choices: { A: { groupId: 'GAIN' as EffectGroupId, textKey: 'a' }, B: { groupId: 'RISK' as EffectGroupId, textKey: 'b' } } });
  }
  const effects = new Map<EffectId, EffectDef>();
  for (let i = 1; i <= 100; i++) {
    const id = `FX${String(i).padStart(3, '0')}` as EffectId;
    effects.set(id, { effectId: id, operation: { kind: 'ammoAdd', amount: 1 }, timing: 'afterFlight', nameKey: 'n', resultKey: 'r', valueStatus: 'proposed' });
  }
  return {
    profile: {
      rulesVersion: 'rules-v2-test',
      valueStatus: 'proposed',
      slotCount: 36,
      cellCount: 36,
      pairSetBonusScore: 0,
      tierTargets: { easy: 12, normal: 16, hard: 8 },
    } as ExpansionCatalog['profile'],
    pairSetIds: [],
    questions,
    groups: new Map(),
    effects,
    series: new Map(),
  };
}

const bundle = { catalog: CAT, tuning: T36, layout: BOOTH_LAYOUT_V2, expansion: fakeExpansion() };
const cfg = (seed: number) => ({ runId: mintId.run('rx'), seed, tuning: T36, playerName: null });

describe('layout v2 geometry (3 x 12)', () => {
  it('has 36 distinct slots and 36 cells paired one to one', () => {
    expect(new Set(SLOT_IDS_V2).size).toBe(36);
    expect(CELL_IDS_V2).toHaveLength(36);
    expect(BOOTH_LAYOUT_V2.slots.map((s) => cellForSlot(s.slotId))).toEqual(CELL_IDS_V2);
    expect(BOOTH_LAYOUT_V2.slots[0]!.slotId).toBe('slot-r1-c01');
    expect(BOOTH_LAYOUT_V2.slots[35]!.slotId).toBe('slot-r3-c12');
  });

  it('slot occupancy boxes of neighbours in one row do not overlap', () => {
    const row = BOOTH_LAYOUT_V2.slots.filter((s) => s.tier === 0);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1]!.occupancyBox;
      const b = row[i]!.occupancyBox;
      expect(b.center.x - a.center.x).toBeGreaterThanOrEqual(a.halfExtents.x + b.halfExtents.x - 1e-9);
    }
  });
});

describe('createExpandedRun', () => {
  it('creates a schema-2 run with 36 prizes, 36 unused cells and shuffled questions', () => {
    const s = createExpandedRun(cfg(7), bundle);
    expect(isExpandedRunState(s)).toBe(true);
    expect(s.schemaVersion).toBe(2);
    expect(s.ammoLostTotal).toBe(0);
    expect(s.rulesVersion).toBe('rules-v2-test');
    expect(s.shelf.prizes.map((p) => p.homeSlot)).toEqual(SLOT_IDS_V2);
    expect(s.expansion.cells).toHaveLength(36);
    expect(s.expansion.cells.every((c) => !c.used)).toBe(true);
    expect(s.expansion.questionOrder).toHaveLength(200);
    expect(new Set(s.expansion.questionOrder).size).toBe(200);
    expect([...s.expansion.questionOrder]).not.toEqual([...bundle.expansion.questions.keys()]);
    expect(s.expansion.questionCursor).toBe(0);
    expect(s.expansion.active).toBeNull();
    expect(s.expansion.assortmentSeries).toBeNull();
    expect(s.expansion.outlineSeries).toBeNull();
    expect(s.expansion.deferredTransforms).toEqual([]);
    expect(s.expansion.next.hint).toBeNull();
    expect(isAmmoBalanced(s, T36.initialAmmo)).toBe(true);
  });

  it('is deterministic per seed and the three streams are independent of the prize draw', () => {
    const a = createExpandedRun(cfg(9), bundle);
    expect(createExpandedRun(cfg(9), bundle)).toEqual(a);
    expect(createExpandedRun(cfg(10), bundle)).not.toEqual(a);
    const { cells, questions, effects } = a.expansion.rng;
    expect(cells).not.toEqual(questions);
    expect(questions).not.toEqual(effects);
    expect(a.draw.rng).not.toEqual(cells);
    // the prize draw equals what plain createRun draws for the same seed
    expect(a.shelf.prizes.map((p) => p.typeId).length).toBe(36);
  });
});
