/**
 * Plan T4c: E3 souvenir shelf and E4 today's stall.
 */
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { dailySeed, jstDateOf } from '../../src/core/daily';
import { createSouvenirStore, SOUVENIR_KEY } from '../../src/persistence/souvenirs';
import { createVersionedProfileStore, STORAGE_KEYS, withKeySuffix } from '../../src/persistence';
import { souvenirModel } from '../../src/ui/souvenir-shelf';
import { translate, type UiKey } from '../../src/i18n';
import { mintId, type FinalResult, type KeyValueStorage, type PrizeTypeId } from '../../src/contracts';

function memory(): KeyValueStorage & { readonly data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const P = (s: string) => s as PrizeTypeId;
const t = (k: string, p?: Readonly<Record<string, string | number>>) => translate('ja', k as UiKey, p);

describe('E3 souvenir shelf', () => {
  it('keeps its own key, takes only kinds won in that game, one slot per kind, no duplicates on a second tap', () => {
    const st = memory();
    const s = createSouvenirStore(st);
    expect(Object.values(STORAGE_KEYS)).not.toContain(SOUVENIR_KEY);
    expect(s.place({ runId: 'r1', wonTypeIds: ['P001'], typeId: P('P002') })).toEqual({ ok: false, reason: 'notWonInThisGame' });
    const a = s.place({ runId: 'r1', wonTypeIds: ['P001', 'P002'], typeId: P('P001') });
    expect(a).toMatchObject({ ok: true, changed: true });
    expect(s.place({ runId: 'r1', wonTypeIds: ['P001', 'P002'], typeId: P('P001') })).toMatchObject({ ok: true, changed: false });
    expect(s.load().slots.filter((x) => x !== null)).toHaveLength(1);
  });

  it('a full shelf asks for the slot first; cancelling keeps all three; a chosen slot is replaced', () => {
    const s = createSouvenirStore(memory());
    const won = ['P001', 'P002', 'P003', 'P004'];
    for (const k of won.slice(0, 3)) s.place({ runId: 'r1', wonTypeIds: won, typeId: P(k) });
    expect(s.place({ runId: 'r1', wonTypeIds: won, typeId: P('P004') })).toEqual({ ok: false, reason: 'chooseSlot' });
    expect(s.load().slots.map((x) => x?.typeId)).toEqual(['P001', 'P002', 'P003']);
    expect(s.place({ runId: 'r1', wonTypeIds: won, typeId: P('P004'), slot: 1 })).toMatchObject({ ok: true, changed: true });
    expect(s.load().slots.map((x) => x?.typeId)).toEqual(['P001', 'P004', 'P003']);
  });

  it('a save failure is reported and nothing is shown as saved', () => {
    const broken: KeyValueStorage = { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => undefined };
    expect(createSouvenirStore(broken).place({ runId: 'r1', wonTypeIds: ['P001'], typeId: P('P001') })).toEqual({ ok: false, reason: 'saveFailed' });
  });

  it('an abandoned game or a game without prizes offers nothing to place', () => {
    const shelf = createSouvenirStore(memory()).load();
    expect(souvenirModel(shelf, { runId: 'r', completed: false, wonTypeIds: ['P001'] }, t, String).choices).toEqual([]);
    expect(souvenirModel(shelf, { runId: 'r', completed: true, wonTypeIds: [] }, t, String).note).toBe(t('souvenir.nothing'));
  });
});

describe('E4 today’s stall', () => {
  it('takes the Japan date: 23:59 and 00:01 are different days', () => {
    expect(jstDateOf(Date.parse('2026-11-06T14:59:00Z'))).toBe('2026-11-06');
    expect(jstDateOf(Date.parse('2026-11-06T15:01:00Z'))).toBe('2026-11-07');
  });

  it('the same date and version give the same stall whatever the run id; another day or version does not', () => {
    const b = getGameplayBundle('expanded-full');
    const v = b.catalog.rulesVersion;
    const start = (seed: number, run: string) => createExpandedRun({ runId: mintId.run(run), seed, tuning: b.tuning, playerName: null }, { catalog: b.catalog, tuning: b.tuning, layout: b.layout, expansion: b.expansion! });
    const today = dailySeed('2026-11-07', v);
    const a = start(today, 'run-a');
    const c = start(today, 'run-b');
    const pick = (s: ReturnType<typeof start>) => ({
      shelf: s.shelf.prizes.map((p) => [p.homeSlot, p.typeId]),
      cells: s.expansion.cells.map((x) => x.effectId),
      questions: s.expansion.questionOrder,
      effects: s.expansion.rng.effects,
      order: s.expansion.rewards!.order,
      bag: s.expansion.rewards!.bag,
    });
    expect(pick(c)).toEqual(pick(a));
    expect(dailySeed('2026-11-08', v)).not.toBe(today);
    expect(dailySeed('2026-11-07', 'rules-v2-proposed-r002')).not.toBe(today);
    expect(pick(start(dailySeed('2026-11-08', v), 'run-a')).shelf).not.toEqual(pick(a).shelf);
  });

  it('a daily self best and set book never touch the normal ones', () => {
    const st = memory();
    const normal = createVersionedProfileStore(st, { rulesVersion: 'rules-v2-proposed-r003' });
    const daily = createVersionedProfileStore(withKeySuffix(st, '.daily'), { rulesVersion: 'rules-v2-proposed-r003' });
    const result = { status: 'completed', rulesVersion: 'rules-v2-proposed-r003', score: 120 } as FinalResult;
    daily.recordRunEnd(result);
    daily.discoverSets(['PAIR001' as never]);
    expect(daily.load().bestScore).toBe(120);
    expect(normal.load().bestScore).toBeNull();
    expect(normal.load().discoveredSets).toEqual([]);
    expect([...st.data.keys()].every((k) => k.endsWith('.daily'))).toBe(true);
    expect(() => withKeySuffix(st, 'daily')).toThrow();
  });
});
