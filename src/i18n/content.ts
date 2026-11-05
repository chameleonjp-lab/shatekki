/**
 * Prize / set names and set hints by id. Ids are the only identity; the
 * displayed text never feeds back into logic. ja and en come from the
 * candidate data / content-en / hints; the other 13 languages live in
 * content/<locale>.ts. Those translations are machine-produced by Claude and
 * not reviewed by native speakers (O16, see docs/design/translation-notes.md).
 */
import candidates from '../../data/catalog-candidates.json';
import type { Locale } from './locales';
import { PRIZE_NAMES_EN, SET_NAMES_EN } from './content-en';
import { SET_HINTS, HINT_IS_PROTOTYPE } from './hints';
import type { LocaleContent } from './content/types';
import { CONTENT_ES } from './content/es';
import { CONTENT_PT_BR } from './content/pt-BR';
import { CONTENT_ZH_HANS } from './content/zh-Hans';
import { CONTENT_FR } from './content/fr';
import { CONTENT_DE } from './content/de';
import { CONTENT_KO } from './content/ko';
import { CONTENT_RU } from './content/ru';
import { CONTENT_IT } from './content/it';
import { CONTENT_ZH_HANT } from './content/zh-Hant';
import { CONTENT_ID } from './content/id';
import { CONTENT_TR } from './content/tr';
import { CONTENT_VI } from './content/vi';
import { CONTENT_TH } from './content/th';

export { HINT_IS_PROTOTYPE };

/** Locales whose prize/set names and hints are written. */
export const CONTENT_LOCALES_DONE: readonly Locale[] = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];

const TRANSLATED: Readonly<Partial<Record<Locale, LocaleContent>>> = {
  es: CONTENT_ES,
  'pt-BR': CONTENT_PT_BR,
  'zh-Hans': CONTENT_ZH_HANS,
  fr: CONTENT_FR,
  de: CONTENT_DE,
  ko: CONTENT_KO,
  ru: CONTENT_RU,
  it: CONTENT_IT,
  'zh-Hant': CONTENT_ZH_HANT,
  id: CONTENT_ID,
  tr: CONTENT_TR,
  vi: CONTENT_VI,
  th: CONTENT_TH,
};

const PRIZE_JA = new Map<string, string>(candidates.prizes.map((p) => [p.id, p.name_ja]));
const SET_JA = new Map<string, string>(candidates.sets.map((s) => [s.id, s.name_ja]));

export const PRIZE_IDS: readonly string[] = candidates.prizes.map((p) => p.id);
export const SET_IDS: readonly string[] = candidates.sets.map((s) => s.id);

export function prizeName(locale: Locale, id: string): string {
  if (locale === 'ja') return PRIZE_JA.get(id) ?? id;
  return TRANSLATED[locale]?.prizes[id] ?? PRIZE_NAMES_EN[id] ?? PRIZE_JA.get(id) ?? id;
}

export function setName(locale: Locale, id: string): string {
  if (locale === 'ja') return SET_JA.get(id) ?? id;
  return TRANSLATED[locale]?.sets[id] ?? SET_NAMES_EN[id] ?? SET_JA.get(id) ?? id;
}

export function setHint(locale: Locale, id: string): string {
  const h = SET_HINTS[id];
  if (!h) return '';
  if (locale === 'ja') return h[0];
  return TRANSLATED[locale]?.hints[id] ?? h[1];
}

export function contentCoverage(): { complete: readonly Locale[]; followUp: readonly Locale[] } {
  const all: readonly Locale[] = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'];
  return { complete: CONTENT_LOCALES_DONE, followUp: all.filter((l) => !CONTENT_LOCALES_DONE.includes(l)) };
}
