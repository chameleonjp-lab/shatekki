/**
 * Prize / set names and set hints by id. Ids are the only identity; the
 * displayed text never feeds back into logic. ja and en are provided now; the
 * other 13 languages fall back to English (listed follow-up, never faked).
 */
import candidates from '../../data/catalog-candidates.json';
import type { Locale } from './locales';
import { PRIZE_NAMES_EN, SET_NAMES_EN } from './content-en';
import { SET_HINTS, HINT_IS_PROTOTYPE } from './hints';

export { HINT_IS_PROTOTYPE };

/** Locales whose prize/set names and hints are written (everything else shows English). */
export const CONTENT_LOCALES_DONE: readonly Locale[] = ['ja', 'en'];

const PRIZE_JA = new Map<string, string>(candidates.prizes.map((p) => [p.id, p.name_ja]));
const SET_JA = new Map<string, string>(candidates.sets.map((s) => [s.id, s.name_ja]));

export const PRIZE_IDS: readonly string[] = candidates.prizes.map((p) => p.id);
export const SET_IDS: readonly string[] = candidates.sets.map((s) => s.id);

export function prizeName(locale: Locale, id: string): string {
  if (locale === 'ja') return PRIZE_JA.get(id) ?? id;
  return PRIZE_NAMES_EN[id] ?? PRIZE_JA.get(id) ?? id;
}

export function setName(locale: Locale, id: string): string {
  if (locale === 'ja') return SET_JA.get(id) ?? id;
  return SET_NAMES_EN[id] ?? SET_JA.get(id) ?? id;
}

export function setHint(locale: Locale, id: string): string {
  const h = SET_HINTS[id];
  if (!h) return '';
  return locale === 'ja' ? h[0] : h[1];
}

export function contentCoverage(): { complete: readonly Locale[]; followUp: readonly Locale[] } {
  const all: readonly Locale[] = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];
  return { complete: CONTENT_LOCALES_DONE, followUp: all.filter((l) => !CONTENT_LOCALES_DONE.includes(l)) };
}
