import { describe, expect, it } from 'vitest';
import candidates from '../../data/catalog-candidates.json';
import { LOCALES } from '../../src/i18n';
import type { Locale } from '../../src/i18n';
import { CONTENT_LOCALES_DONE, PRIZE_IDS, SET_IDS, contentCoverage, prizeName, setHint, setName } from '../../src/i18n/content';

const NON_JA = LOCALES.filter((l) => l !== 'ja');
const NON_EN_JA = LOCALES.filter((l) => l !== 'ja' && l !== 'en');
const KANA = /[぀-ヿㇰ-ㇿｦ-ﾟ]/;
const HAN = /[㐀-鿿豈-﫿]/;
const HANGUL = /[가-힯ᄀ-ᇿ]/;
const CYRILLIC = /[Ѐ-ӿ]/;
const THAI = /[฀-๿]/;
// Case-sensitive on purpose: Spanish/Portuguese "todo/todos" is a normal word.
const PLACEHOLDER = /\b(TODO|TBD|FIXME|XXX)\b|lorem ipsum|[Pp]laceholder|\?\?\?/;

/**
 * Entries allowed to equal the English text because the word is the normal
 * local spelling. Key: `${locale}:${id}`. Kept deliberately tiny.
 */
const SAME_AS_EN_ALLOWED: ReadonlySet<string> = new Set<string>([
  // "Kendama" is the international loanword for the Japanese toy; the Latin-script
  // locales keep this spelling (the other scripts transliterate it).
  ...(['es', 'pt-BR', 'fr', 'de', 'it', 'id', 'tr', 'vi'] as const).map((l) => `${l}:P025`),
]);

function allTexts(loc: Locale): string[] {
  const texts: string[] = [];
  for (const id of PRIZE_IDS) texts.push(prizeName(loc, id));
  for (const id of SET_IDS) texts.push(setName(loc, id), setHint(loc, id));
  return texts;
}

describe('translated content, all 15 locales', () => {
  it('ids are exactly P001-P100 and S001-S100, matching the candidate data', () => {
    expect(PRIZE_IDS).toEqual(Array.from({ length: 100 }, (_, i) => `P${String(i + 1).padStart(3, '0')}`));
    expect(SET_IDS).toEqual(Array.from({ length: 100 }, (_, i) => `S${String(i + 1).padStart(3, '0')}`));
    expect(candidates.prizes.map((p) => p.id)).toEqual(PRIZE_IDS);
  });

  it('every locale is complete and the follow-up list is empty', () => {
    expect([...CONTENT_LOCALES_DONE].sort()).toEqual([...LOCALES].sort());
    expect(contentCoverage().followUp).toEqual([]);
  });

  it('every locale has 100 prize + 100 set + 100 hint non-empty entries', () => {
    for (const loc of LOCALES) {
      for (const id of PRIZE_IDS) expect(prizeName(loc, id).trim().length, `${loc} ${id}`).toBeGreaterThan(0);
      for (const id of SET_IDS) {
        expect(setName(loc, id).trim().length, `${loc} ${id}`).toBeGreaterThan(0);
        expect(setHint(loc, id).trim().length, `${loc} hint ${id}`).toBeGreaterThan(0);
      }
    }
  });

  it('no non-English locale reuses the English text (except the justified allow-list)', () => {
    for (const loc of NON_EN_JA) {
      for (const id of PRIZE_IDS) {
        if (SAME_AS_EN_ALLOWED.has(`${loc}:${id}`)) continue;
        expect(prizeName(loc, id), `${loc} ${id}`).not.toBe(prizeName('en', id));
      }
      for (const id of SET_IDS) {
        if (!SAME_AS_EN_ALLOWED.has(`${loc}:${id}`)) expect(setName(loc, id), `${loc} ${id}`).not.toBe(setName('en', id));
        expect(setHint(loc, id), `${loc} hint ${id}`).not.toBe(setHint('en', id));
      }
    }
  });

  it('no Japanese kana outside ja; no Han characters outside zh-Hans/zh-Hant', () => {
    for (const loc of NON_JA) {
      for (const t of allTexts(loc)) {
        expect(t, `${loc}: ${t}`).not.toMatch(KANA);
        if (loc !== 'zh-Hans' && loc !== 'zh-Hant') expect(t, `${loc}: ${t}`).not.toMatch(HAN);
      }
    }
  });

  it('scripts match the language', () => {
    const sample = (loc: Locale): string => [prizeName(loc, 'P001'), setName(loc, 'S001'), setHint(loc, 'S001')].join('');
    expect(sample('ko')).toMatch(HANGUL);
    expect(sample('ru')).toMatch(CYRILLIC);
    expect(sample('th')).toMatch(THAI);
    expect(sample('zh-Hans')).toMatch(HAN);
    expect(sample('zh-Hant')).toMatch(HAN);
    for (const loc of ['es', 'pt-BR', 'fr', 'de', 'it', 'id', 'tr', 'vi'] as const) {
      for (const t of allTexts(loc)) {
        expect(t, `${loc}: ${t}`).not.toMatch(HANGUL);
        expect(t, `${loc}: ${t}`).not.toMatch(CYRILLIC);
        expect(t, `${loc}: ${t}`).not.toMatch(THAI);
      }
    }
  });

  it('zh-Hans and zh-Hant differ for most entries', () => {
    let differ = 0;
    let total = 0;
    for (const id of PRIZE_IDS) {
      total++;
      if (prizeName('zh-Hans', id) !== prizeName('zh-Hant', id)) differ++;
    }
    for (const id of SET_IDS) {
      total += 2;
      if (setName('zh-Hans', id) !== setName('zh-Hant', id)) differ++;
      if (setHint('zh-Hans', id) !== setHint('zh-Hant', id)) differ++;
    }
    expect(differ / total).toBeGreaterThan(0.5);
  });

  it('no placeholder text, stray whitespace or newlines', () => {
    for (const loc of LOCALES) {
      for (const t of allTexts(loc)) {
        expect(t, `${loc}: ${t}`).not.toMatch(PLACEHOLDER);
        expect(t, `${loc}: ${t}`).toBe(t.trim());
        expect(t, `${loc}: ${t}`).not.toMatch(/[\r\n]/);
      }
    }
  });

  it('names are unique within a locale; hints never contain the set name', () => {
    for (const loc of LOCALES) {
      expect(new Set(PRIZE_IDS.map((id) => prizeName(loc, id))).size, `${loc} prizes`).toBe(100);
      expect(new Set(SET_IDS.map((id) => setName(loc, id))).size, `${loc} sets`).toBe(100);
      for (const id of SET_IDS) {
        expect(setHint(loc, id).toLowerCase(), `${loc} hint ${id}`).not.toContain(setName(loc, id).toLowerCase());
      }
    }
  });
});
