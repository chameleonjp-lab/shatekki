import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { RELEASE_CATALOG } from '../../src/catalog/release-config';
import { LOCALES, UI_STRINGS, type UiKey } from '../../src/i18n';
import { createExpansionTranslator } from '../../src/i18n/expansion-text';
import { translate } from '../../src/i18n';
import { setBookEntriesFromCatalog, setBookViewModel } from '../../src/ui/set-book';

const bundle = getGameplayBundle('expanded-proposed');
const entries = setBookEntriesFromCatalog(bundle.catalog);
const text = createExpansionTranslator(
  () => 'ja',
  (k, p) => translate('ja', k as UiKey, p),
);

describe('set book with pair sets', () => {
  it('lists 100 three-kind sets and 300 pair sets, with the kind count of each', () => {
    const vm = setBookViewModel({ sets: entries, discovered: [], completedThisRun: [] }, 'ja', { expandedText: text });
    expect(vm.entries.length).toBe(400);
    expect(vm.entries.filter((e) => e.kinds === 2).length).toBe(300);
    expect(vm.entries.filter((e) => e.kinds === 3).length).toBe(100);
    expect(vm.entries.every((e) => /2|3/.test(e.kindsText))).toBe(true);
    expect(vm.filters.map((f) => [f.id, f.count])).toEqual([['all', 400], [2, 300], [3, 100]]);
  });

  it('filters by kind count and counts discoveries inside the filter', () => {
    const input = { sets: entries, discovered: ['PAIR001', 'PAIR002', 'S001'], completedThisRun: [] };
    const all = setBookViewModel(input, 'ja', { expandedText: text });
    const pair = setBookViewModel(input, 'ja', { filter: 2, expandedText: text });
    const triple = setBookViewModel(input, 'ja', { filter: 3, expandedText: text });
    expect(all.progressText).toBe(translate('ja', 'setbook.progress', { found: 3, total: 400 }));
    expect(pair.entries.length).toBe(300);
    expect(pair.entries.every((e) => e.kinds === 2)).toBe(true);
    expect(pair.progressText).toBe(translate('ja', 'setbook.progress', { found: 2, total: 300 }));
    expect(triple.entries.length).toBe(100);
    expect(triple.progressText).toBe(translate('ja', 'setbook.progress', { found: 1, total: 100 }));
  });

  it('keeps undiscovered names hidden, shows the pair hint, and reveals the name once discovered', () => {
    const vm = setBookViewModel({ sets: entries, discovered: ['PAIR001'], completedThisRun: [] }, 'ja', { filter: 2, expandedText: text });
    const found = vm.entries.find((e) => e.setId === 'PAIR001')!;
    const hidden = vm.entries.find((e) => e.setId === 'PAIR002')!;
    expect(found.title).toBe(text('exp.pair.PAIR001.name'));
    expect(found.title).not.toBe('？？？');
    expect(found.required?.length).toBe(2);
    expect(found.hint).toBeNull();
    expect(hidden.title).toBe(translate('ja', 'setbook.undiscovered'));
    expect(hidden.required).toBeNull();
    expect(hidden.hint).toBe(text('exp.pair.PAIR002.hint'));
    expect(hidden.hint).not.toBe('');
    expect(hidden.title).not.toContain(text('exp.pair.PAIR002.name'));
  });

  it('keeps sets discovered in older saves visible and unchanged', () => {
    const vm = setBookViewModel({ sets: entries, discovered: ['S001'], completedThisRun: [] }, 'ja', { expandedText: text });
    const s = vm.entries.find((e) => e.setId === 'S001')!;
    expect(s.discovered).toBe(true);
    expect(s.required?.length).toBe(3);
    expect(s.kinds).toBe(3);
  });

  it('rules-v1 book is unchanged: 100 sets, no filter', () => {
    const v1 = setBookEntriesFromCatalog(RELEASE_CATALOG);
    const vm = setBookViewModel({ sets: v1, discovered: [], completedThisRun: [] }, 'ja');
    expect(vm.entries.length).toBe(100);
    expect(vm.filters).toEqual([]);
    expect(vm.filter).toBe('all');
    // a stale filter request is ignored
    expect(setBookViewModel({ sets: v1, discovered: [], completedThisRun: [] }, 'ja', { filter: 2 }).entries.length).toBe(100);
  });

  it('has the filter and kind texts in every locale', () => {
    const keys = ['setbook.filter.all', 'setbook.filter.pair', 'setbook.filter.triple', 'setbook.kinds'] as UiKey[];
    for (const locale of LOCALES) for (const k of keys) expect(UI_STRINGS[locale][k], `${locale} ${k}`).toBeTruthy();
    for (const locale of LOCALES) expect(translate(locale, 'setbook.kinds', { n: 2 })).toMatch(/2/);
  });
});
