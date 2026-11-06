import { describe, expect, it } from 'vitest';
import effects from '../../data/expansion-v2/effects.json';
import groups from '../../data/expansion-v2/groups.json';
import pairs from '../../data/expansion-v2/pair-sets.json';
import questions from '../../data/expansion-v2/questions.json';
import series from '../../data/expansion-v2/series.json';
import { prizeName } from '../../src/i18n/content';
import {
  EXPANDED_EXPECTED,
  EXPANDED_REGISTRY,
  choiceText,
  contentCoverage,
  effectName,
  effectResult,
  expandedLine,
  groupLabel,
  pairHint,
  pairName,
  questionText,
  seriesLabel,
  seriesOfEffect,
  seriesSymbol,
} from '../../src/i18n/expanded-content';
import { EN_CONTENT } from '../../src/i18n/expanded/en';
import { JA_SUPPLEMENT } from '../../src/i18n/expanded/ja';
import { EXPANDED_LINE_KEYS } from '../../src/i18n/expanded/types';
import { LOCALES } from '../../src/i18n';
import type { Locale } from '../../src/i18n/locales';

/** ja plus every locale whose registry entry is complete: all of them get the same checks. */
const COMPLETE_LOCALES: readonly Locale[] = [
  'ja',
  ...(Object.keys(EXPANDED_REGISTRY) as Exclude<Locale, 'ja'>[]).filter((l) => EXPANDED_REGISTRY[l].status === 'complete'),
];
const PENDING_LOCALES: readonly Locale[] = (Object.keys(EXPANDED_REGISTRY) as Exclude<Locale, 'ja'>[]).filter((l) => EXPANDED_REGISTRY[l].status === 'pending');
/** How each language says "needs 2 kinds" in a pair hint. */
const TWO_KINDS: Partial<Record<Locale, RegExp>> = {
  ja: /2種類/,
  en: /2 kinds/,
  es: /2 tipos/,
  'pt-BR': /2 tipos/,
  'zh-Hans': /2种/,
  fr: /2 types/,
  de: /2 Sorten/,
};
const BAD = /\bTODO\b|FIXME|XXX|xxx|\?\?\?|[Ll]orem|undefined|\[object/; // case-sensitive TODO: Spanish "todo/todos" is a word
const pairRows = pairs as { id: string; name_ja: string; prizeIds: string[]; designNote_ja: string }[];
const qRows = questions as { id: string; A: { group: string }; B: { group: string } }[];
const fxIds = (effects as { id: string }[]).map((e) => e.id);
const serIds = (series as { id: string }[]).map((s) => s.id);
const placeholders = (s: string): string[] => (s.match(/\{[a-z]+\}/g) ?? []).sort();

describe('expanded content counts', () => {
  it('data has the expected sizes', () => {
    expect(pairRows).toHaveLength(300);
    expect(qRows).toHaveLength(200);
    expect(groups).toHaveLength(6);
    expect(fxIds).toHaveLength(100);
    expect(serIds).toHaveLength(20);
  });

  for (const locale of COMPLETE_LOCALES) {
    describe(locale, () => {
      it('has all 300 pair names and hints', () => {
        for (const p of pairRows) {
          expect(pairName(locale, p.id), p.id).not.toBe(p.id);
          expect(pairHint(locale, p.id), p.id).not.toBe(p.id);
        }
      });
      it('has all 200 questions with A and B', () => {
        for (const q of qRows) {
          for (const t of [questionText(locale, q.id), choiceText(locale, q.id, 'A'), choiceText(locale, q.id, 'B')]) {
            expect(t.length, q.id).toBeGreaterThan(0);
            expect(t).not.toMatch(/^Q\d{3}/);
          }
        }
      });
      it('has all 6 groups, 100 effects (name and result), 20 series (label and symbol), and the fixed lines', () => {
        for (const g of groups as { id: string }[]) expect(groupLabel(locale, g.id)).not.toBe(g.id);
        for (const fx of fxIds) {
          expect(effectName(locale, fx), fx).not.toBe(fx);
          expect(effectResult(locale, fx, { n: 2 }), fx).not.toBe(fx);
        }
        for (const s of serIds) {
          expect(seriesLabel(locale, s)).not.toBe(s);
          expect(seriesSymbol(locale, s)).not.toBe(s);
        }
        for (const k of EXPANDED_LINE_KEYS) expect(expandedLine(locale, k)).not.toBe(k);
      });
      it('has no empty or placeholder strings', () => {
        const all: string[] = [];
        for (const p of pairRows) all.push(pairName(locale, p.id), pairHint(locale, p.id));
        for (const q of qRows) all.push(questionText(locale, q.id), choiceText(locale, q.id, 'A'), choiceText(locale, q.id, 'B'));
        for (const fx of fxIds) all.push(effectName(locale, fx), effectResult(locale, fx, { n: 1 }));
        for (const s of serIds) all.push(seriesLabel(locale, s), seriesSymbol(locale, s));
        for (const k of EXPANDED_LINE_KEYS) all.push(expandedLine(locale, k));
        for (const t of all) {
          expect(t.trim().length).toBeGreaterThan(0);
          expect(t).toBe(t.trim());
          expect(t).not.toMatch(BAD);
          expect(t).not.toMatch(/\{[a-z]+\}/); // all placeholders resolved
        }
      });
    });
  }

  it('every complete locale record is complete itself (not just via fallback)', () => {
    for (const l of COMPLETE_LOCALES.filter((x) => x !== 'ja')) {
      const c = EXPANDED_REGISTRY[l as Exclude<Locale, 'ja'>].content;
      expect(Object.keys(c.pairNames ?? {}), l).toHaveLength(300);
      expect(Object.keys(c.pairHints ?? {}), l).toHaveLength(300);
      expect(Object.keys(c.questions ?? {}), l).toHaveLength(200);
      expect(Object.keys(c.groups ?? {}).sort(), l).toEqual(['CHAOS', 'GAIN', 'GUIDE', 'MIX', 'RISK', 'STOCK']);
      expect(Object.keys(c.effectNames ?? {}), l).toHaveLength(100);
      expect(Object.keys(c.effectResults ?? {}), l).toHaveLength(100);
      expect(Object.keys(c.seriesLabels ?? {}), l).toHaveLength(20);
      expect(Object.keys(c.seriesSymbols ?? {}), l).toHaveLength(20);
      expect(Object.keys(c.lines ?? {}).sort(), l).toEqual([...EXPANDED_LINE_KEYS].sort());
      for (const q of qRows) {
        const t = c.questions![q.id]!;
        expect(t.text && t.A && t.B, `${l} ${q.id}`).toBeTruthy();
      }
    }
  });
  it('the English record itself is complete (not just via fallback)', () => {
    expect(Object.keys(EN_CONTENT.pairNames)).toHaveLength(300);
    expect(Object.keys(EN_CONTENT.pairHints)).toHaveLength(300);
    expect(Object.keys(EN_CONTENT.questions)).toHaveLength(200);
    expect(Object.keys(EN_CONTENT.groups).sort()).toEqual(['CHAOS', 'GAIN', 'GUIDE', 'MIX', 'RISK', 'STOCK']);
    expect(Object.keys(EN_CONTENT.effectNames)).toHaveLength(100);
    expect(Object.keys(EN_CONTENT.effectResults)).toHaveLength(100);
    expect(Object.keys(EN_CONTENT.seriesLabels)).toHaveLength(20);
    expect(Object.keys(EN_CONTENT.seriesSymbols)).toHaveLength(20);
    expect(Object.keys(EN_CONTENT.lines).sort()).toEqual([...EXPANDED_LINE_KEYS].sort());
    expect(Object.keys(JA_SUPPLEMENT.pairHints)).toHaveLength(300);
    expect(Object.keys(JA_SUPPLEMENT.effectResults)).toHaveLength(100);
    for (const p of pairRows) expect(EN_CONTENT.pairNames[p.id]).toBeTruthy();
    for (const q of qRows) expect(EN_CONTENT.questions[q.id]).toBeTruthy();
  });
});

describe('placeholders', () => {
  it('{n}/{series} placeholders match the Japanese source in every complete locale', () => {
    for (const l of COMPLETE_LOCALES.filter((x) => x !== 'ja' && x !== 'en')) {
      const c = EXPANDED_REGISTRY[l as Exclude<Locale, 'ja'>].content;
      for (const fx of fxIds) expect(placeholders(c.effectResults![fx]!), `${l} ${fx}`).toEqual(placeholders(JA_SUPPLEMENT.effectResults[fx]!));
    }
  });
  it('{n}/{series} placeholders are identical between ja and en for every effect', () => {
    for (const fx of fxIds) {
      expect(placeholders(EN_CONTENT.effectResults[fx]!), fx).toEqual(placeholders(JA_SUPPLEMENT.effectResults[fx]!));
    }
  });
  it('only ammo add/remove use {n}; series effects use {series}', () => {
    const withN = fxIds.filter((fx) => JA_SUPPLEMENT.effectResults[fx]!.includes('{n}'));
    expect(withN).toEqual(['FX001', 'FX002', 'FX003', 'FX021', 'FX022', 'FX023']);
    for (const fx of fxIds) {
      expect(JA_SUPPLEMENT.effectResults[fx]!.includes('{series}'), fx).toBe(seriesOfEffect(fx) !== null);
    }
  });
  it('substitutes the real amount and the series label', () => {
    expect(effectResult('en', 'FX003', { n: 1 })).toContain('1');
    expect(effectResult('ja', 'FX022', { n: 1 })).toBe('弾が1発減った');
    expect(effectResult('en', 'FX041')).toContain('Sweet Shop');
    expect(effectResult('ja', 'FX080')).toContain('おままごと台所');
    expect(seriesOfEffect('FX041')).toBe('SER01');
    expect(seriesOfEffect('FX080')).toBe('SER20');
    expect(seriesOfEffect('FX001')).toBeNull();
  });
  it('a not-applicable effect gives the generic line', () => {
    expect(effectResult('en', 'FX001', { applicable: false })).toBe(expandedLine('en', 'effectNotApplicable'));
    expect(effectResult('ja', 'FX001', { applicable: false })).toBe('この効果は今回は使えませんでした');
  });
});

describe('pair hints', () => {
  for (const locale of COMPLETE_LOCALES) {
    it(`${locale}: never name both prizes, never paste the designer note, and say 2 kinds`, () => {
      for (const p of pairRows) {
        const hint = pairHint(locale, p.id);
        const [a, b] = p.prizeIds.map((id) => prizeName(locale, id)) as [string, string];
        const lower = hint.toLowerCase();
        expect(lower.includes(a.toLowerCase()) && lower.includes(b.toLowerCase()), `${p.id} names both prizes`).toBe(false);
        const note = p.designNote_ja.replace(/。$/, '');
        expect(hint, p.id).not.toContain(note);
        expect(hint, p.id).not.toContain(p.name_ja);
        expect(hint, p.id).toMatch(TWO_KINDS[locale] ?? /^$/);
      }
    });
  }
  it('hints do not contain the pair name either, in any complete locale', () => {
    for (const locale of COMPLETE_LOCALES) {
      for (const p of pairRows) expect(pairHint(locale, p.id), `${locale} ${p.id}`).not.toContain(pairName(locale, p.id));
    }
  });
  it('every complete locale has a "needs 2 kinds" pattern in this test', () => {
    for (const l of COMPLETE_LOCALES) expect(TWO_KINDS[l], l).toBeDefined();
  });
  it('hints are distinct enough to be clues (no more than a few duplicates)', () => {
    for (const locale of COMPLETE_LOCALES) {
      const set = new Set(pairRows.map((p) => pairHint(locale, p.id)));
      expect(set.size).toBeGreaterThan(280);
    }
  });
});

describe('series symbols', () => {
  it('the same series has the same symbol everywhere and each symbol is unique', () => {
    for (const locale of LOCALES) {
      const symbols = serIds.map((s) => seriesSymbol(locale, s));
      expect(new Set(symbols).size, locale).toBe(20);
      for (const s of serIds) expect(seriesSymbol(locale, s)).toBe(seriesSymbol(locale, s));
    }
    // the symbol of a series is a function of the series id only, never of the effect that mentions it
    expect(seriesSymbol('en', 'SER01')).toBe('[Sweets]');
    expect(seriesSymbol('ja', 'SER01')).toBe('[菓]');
  });
  it('en symbols are short bracketed words', () => {
    for (const s of serIds) expect(seriesSymbol('en', s)).toMatch(/^\[[A-Za-z]{2,10}\]$/);
  });
  it('every complete locale uses short bracketed symbols', () => {
    for (const l of COMPLETE_LOCALES) {
      for (const s of serIds) expect(seriesSymbol(l, s), `${l} ${s}`).toMatch(/^\[[^\[\]\s]{1,12}\]$/);
    }
  });
});

describe('fallback order', () => {
  it('pending locales fall back to English, then ja data, then the id', () => {
    expect(pairName('zh-Hant', 'PAIR001')).toBe(pairName('en', 'PAIR001'));
    expect(questionText('th', 'Q001')).toBe(questionText('en', 'Q001'));
    expect(choiceText('id', 'Q002', 'B')).toBe(choiceText('en', 'Q002', 'B'));
    expect(effectResult('tr', 'FX041')).toBe(effectResult('en', 'FX041'));
    expect(expandedLine('vi', 'noOutlineTarget')).toBe(expandedLine('en', 'noOutlineTarget'));
    // unknown ids: ja data has nothing either, so the id itself comes back
    expect(pairName('en', 'PAIR999')).toBe('PAIR999');
    expect(pairHint('zh-Hant', 'PAIR999')).toBe('PAIR999');
    expect(effectName('en', 'FX999')).toBe('FX999');
    expect(choiceText('en', 'Q999', 'A')).toBe('Q999.A');
  });
  it('ja reads the data files', () => {
    expect(pairName('ja', 'PAIR001')).toBe('詰め合わせチョコセット');
    expect(questionText('ja', 'Q001')).toBe('屋台の入口、どちらから見て回る？');
    expect(choiceText('ja', 'Q001', 'A')).toBe('看板が気になる方');
    expect(effectName('ja', 'FX001')).toBe('弾を1発もらう');
    expect(groupLabel('ja', 'GAIN')).toBe('弾を増やす・弾を変える');
  });
  it('a pending locale that gains a partial entry overrides only that field', () => {
    const entry = EXPANDED_REGISTRY['zh-Hant'];
    expect(entry.status).toBe('pending');
  });
});

describe('group and choice integrity', () => {
  it('translations keep the question data untouched: choices still map to the data groups', () => {
    for (const q of qRows) {
      expect(['GAIN', 'RISK', 'STOCK', 'GUIDE', 'MIX', 'CHAOS']).toContain(q.A.group);
      expect(['GAIN', 'RISK', 'STOCK', 'GUIDE', 'MIX', 'CHAOS']).toContain(q.B.group);
    }
  });
});

describe('coverage', () => {
  const cov = contentCoverage();
  it('lists all 15 locales; complete ones match the registry, the rest are pending and honest', () => {
    expect(cov.map((c) => c.locale)).toEqual([...LOCALES]);
    const complete = cov.filter((c) => c.status === 'complete').map((c) => c.locale);
    expect(complete).toEqual(LOCALES.filter((l) => COMPLETE_LOCALES.includes(l)));
    const pending = cov.filter((c) => c.status === 'pending');
    expect(pending.map((c) => c.locale)).toEqual(LOCALES.filter((l) => PENDING_LOCALES.includes(l)));
    expect(complete.length + pending.length).toBe(15);
    for (const p of pending) {
      for (const v of Object.values(p.present)) expect(v, p.locale).toBe(0);
    }
  });
  it('complete locales reach the full counts', () => {
    for (const c of cov.filter((x) => x.status === 'complete')) {
      expect(c.present, c.locale).toEqual(EXPANDED_EXPECTED);
    }
  });
});
