import { describe, expect, it } from 'vitest';
import { LOCALES, resolveLocale, UI_STRINGS, translate, formatInteger, CONTENT_LOCALES } from '../../src/i18n';
import type { UiKey } from '../../src/i18n';
import {
  prizeName,
  setName,
  setHint,
  PRIZE_IDS,
  SET_IDS,
  HINT_IS_PROTOTYPE,
  contentCoverage,
} from '../../src/i18n/content';
import { JA } from '../../src/i18n/locales/ja';
import candidates from '../../data/catalog-candidates.json';

const KEYS = Object.keys(JA) as UiKey[];
const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = (s: string) => [...s.matchAll(PLACEHOLDER)].map((m) => m[1]).sort();

// Strings that may legitimately equal the English text (brand / loanwords / symbols).
const SAME_AS_EN_ALLOWED: Record<string, readonly string[]> = {
  'pt-BR': ['home.ranking', 'rank.title', 'setbook.undiscovered', 'unit.pieces'],
  it: ['result.home', 'bd.set'],
  fr: ['btn.pause', 'hud.bonus', 'rank.col.score'],
  de: ['hud.bonus', 'home.name.label', 'home.name.placeholder', 'btn.pause', 'bd.trick', 'bd.set', 'rank.col.name'],
  'zh-Hans': ['setbook.undiscovered', 'unit.pieces'],
  'zh-Hant': ['setbook.undiscovered', 'unit.pieces'],
  '*': ['app.title', 'setbook.undiscovered', 'unit.pieces', 'unit.points', 'hud.score', 'bd.total', 'rank.title', 'settings.volume'],
};

describe('locales', () => {
  it('translates the saved-run prompt and startup notices in the selected language', () => {
    expect(translate('en', 'app.resume.continue')).toBe('Continue');
    expect(translate('en', 'app.resume.title')).toBe('You have an unfinished game');
    expect(translate('ja', 'app.resume.continue')).toBe('続きから');
    expect(translate('en', 'app.restore.abandoned')).toBe('The previous game was interrupted during a shot and will not be recorded.');
  });

  it('has exactly the 15 common locales', () => {
    expect([...LOCALES]).toEqual(['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th']);
  });

  it('every key exists, is non-empty and has the same placeholders in all 15 locales', () => {
    for (const loc of LOCALES) {
      const table = UI_STRINGS[loc];
      expect(Object.keys(table).sort(), loc).toEqual([...KEYS].sort());
      for (const k of KEYS) {
        const v = table[k];
        expect(typeof v, `${loc}:${k}`).toBe('string');
        expect(v.trim().length, `${loc}:${k}`).toBeGreaterThan(0);
        expect(placeholders(v), `${loc}:${k} placeholders`).toEqual(placeholders(JA[k]));
        expect(v, `${loc}:${k} must not be a placeholder`).not.toMatch(/TODO|FIXME|XXX|lorem/i);
        expect(v, `${loc}:${k} must not show its key`).not.toBe(k);
      }
    }
  });

  it('other locales do not silently copy English UI strings', () => {
    const en = UI_STRINGS.en;
    for (const loc of LOCALES) {
      if (loc === 'en') continue;
      const allowed = new Set([...(SAME_AS_EN_ALLOWED['*'] ?? []), ...(SAME_AS_EN_ALLOWED[loc] ?? [])]);
      const same = KEYS.filter((k) => UI_STRINGS[loc][k] === en[k] && !allowed.has(k));
      expect(same, `${loc} copies English for ${same.join(',')}`).toEqual([]);
    }
  });

  it('uses the exact Japanese name-field sentence from requirements 8', () => {
    expect(UI_STRINGS.ja['home.name.explain']).toBe('名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。');
    expect(UI_STRINGS.ja['home.share']).toBe('Xでシェア');
    expect(UI_STRINGS.ja['home.ranking']).toBe('ランキング');
  });

  it('keeps scripts right: CJK/Thai/Cyrillic locales contain their script', () => {
    const has = (loc: (typeof LOCALES)[number], re: RegExp) => expect(UI_STRINGS[loc]['home.start']).toMatch(re);
    has('ja', /[぀-ヿ]/);
    has('zh-Hans', /[一-鿿]/);
    has('zh-Hant', /[一-鿿]/);
    has('ko', /[가-힯]/);
    has('ru', /[Ѐ-ӿ]/);
    has('th', /[฀-๿]/);
  });

  it('zh-Hans and zh-Hant differ (not a copy)', () => {
    const diff = KEYS.filter((k) => UI_STRINGS['zh-Hans'][k] !== UI_STRINGS['zh-Hant'][k]);
    expect(diff.length).toBeGreaterThan(KEYS.length / 3);
  });
});

describe('resolveLocale', () => {
  it('saved setting wins over the browser', () => {
    expect(resolveLocale({ saved: 'de', browser: ['ja-JP'] })).toBe('de');
  });
  it('invalid saved value is ignored', () => {
    expect(resolveLocale({ saved: 'xx', browser: ['fr-CA'] })).toBe('fr');
    expect(resolveLocale({ saved: null, browser: ['fr-CA'] })).toBe('fr');
  });
  it('falls back to English', () => {
    expect(resolveLocale({ saved: null, browser: ['sv-SE', 'fi'] })).toBe('en');
    expect(resolveLocale({ saved: null, browser: [] })).toBe('en');
  });
  it('maps browser tags to our ids', () => {
    expect(resolveLocale({ saved: null, browser: ['zh-CN'] })).toBe('zh-Hans');
    expect(resolveLocale({ saved: null, browser: ['zh-TW'] })).toBe('zh-Hant');
    expect(resolveLocale({ saved: null, browser: ['zh-HK'] })).toBe('zh-Hant');
    expect(resolveLocale({ saved: null, browser: ['zh-Hant-TW'] })).toBe('zh-Hant');
    expect(resolveLocale({ saved: null, browser: ['pt-PT'] })).toBe('pt-BR');
    expect(resolveLocale({ saved: null, browser: ['pt'] })).toBe('pt-BR');
    expect(resolveLocale({ saved: null, browser: ['en-GB'] })).toBe('en');
    expect(resolveLocale({ saved: null, browser: ['in'] })).toBe('id');
    expect(resolveLocale({ saved: null, browser: ['ja'] })).toBe('ja');
  });
  it('uses the first supported language in the list', () => {
    expect(resolveLocale({ saved: null, browser: ['sv', 'ko-KR', 'ja'] })).toBe('ko');
  });
});

describe('translate', () => {
  it('interpolates and formats numbers per locale', () => {
    expect(translate('ja', 'home.best', { score: 12345 })).toBe('自己ベスト：12,345点');
    expect(translate('en', 'home.best', { score: 1234 })).toBe('Best: 1,234 pts');
  });
  it('never returns the raw key', () => {
    for (const loc of LOCALES) for (const k of KEYS) expect(translate(loc, k, { n: 1, score: 1, rank: 1, found: 1, total: 1, nominal: 1, applied: 1, prizes: 1, sets: 1, chain: 1 })).not.toBe(k);
  });
  it('formatInteger is locale aware and tolerant', () => {
    expect(formatInteger('en', 1234567)).toBe('1,234,567');
    expect(formatInteger('en', Number.NaN)).toBe('0');
  });
});

describe('content (100 prizes, 100 sets, 100 hints)', () => {
  it('ja names come from the candidate data and cover all ids', () => {
    expect(PRIZE_IDS).toHaveLength(100);
    expect(SET_IDS).toHaveLength(100);
    for (const p of candidates.prizes) expect(prizeName('ja', p.id)).toBe(p.name_ja);
    for (const s of candidates.sets) expect(setName('ja', s.id)).toBe(s.name_ja);
  });
  it('ja and en exist and are non-empty for every id', () => {
    for (const loc of CONTENT_LOCALES) {
      for (const id of PRIZE_IDS) expect(prizeName(loc, id).trim().length, `${loc} ${id}`).toBeGreaterThan(0);
      for (const id of SET_IDS) {
        expect(setName(loc, id).trim().length, `${loc} ${id}`).toBeGreaterThan(0);
        expect(setHint(loc, id).trim().length, `${loc} hint ${id}`).toBeGreaterThan(0);
      }
    }
  });
  it('en names are real English, not copies of Japanese', () => {
    for (const id of PRIZE_IDS) expect(prizeName('en', id)).not.toMatch(/[぀-ヿ一-鿿]/);
    for (const id of SET_IDS) {
      expect(setName('en', id)).not.toMatch(/[぀-ヿ一-鿿]/);
      expect(setHint('en', id)).not.toMatch(/[぀-ヿ一-鿿]/);
    }
  });
  it('hints never contain the set name (they point to the theme without naming the set)', () => {
    for (const s of candidates.sets) {
      expect(setHint('ja', s.id)).not.toContain(s.name_ja);
    }
  });
  it('hints are marked prototype (hint_ja is null in the candidate data, O02)', () => {
    expect(HINT_IS_PROTOTYPE).toBe(true);
    expect(candidates.sets.every((s) => s.hint_ja === null)).toBe(true);
  });
  it('all 15 locales are covered, no follow-up (see i18n-content.test.ts)', () => {
    const cov = contentCoverage();
    expect(cov.complete).toHaveLength(15);
    expect(cov.followUp).toHaveLength(0);
  });
  it('changing language does not change ids (ids are stable keys)', () => {
    expect(PRIZE_IDS[0]).toBe('P001');
    expect(SET_IDS[99]).toBe('S100');
  });
});
