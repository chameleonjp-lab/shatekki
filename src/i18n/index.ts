/**
 * i18n entry. `translate(locale, key, params)` is pure. `createI18n` holds the
 * current locale (saved in KeyValueStorage) and notifies screens. Changing the
 * locale only changes displayed text: ids, scoring and the current run are
 * untouched because nothing here knows about game state.
 */
import type { KeyValueStorage } from '../contracts';
import { JA, type UiKey } from './locales/ja';
import { EN } from './locales/en';
import { ES } from './locales/es';
import { PT_BR } from './locales/pt-BR';
import { ZH_HANS } from './locales/zh-Hans';
import { FR } from './locales/fr';
import { DE } from './locales/de';
import { KO } from './locales/ko';
import { RU } from './locales/ru';
import { IT } from './locales/it';
import { ZH_HANT } from './locales/zh-Hant';
import { ID } from './locales/id';
import { TR } from './locales/tr';
import { VI } from './locales/vi';
import { TH } from './locales/th';
import { LOCALES, isLocale, resolveLocale, type Locale } from './locales';

export { LOCALES, LOCALE_NATIVE_NAMES, isLocale, resolveLocale, matchBrowserTag, type Locale } from './locales';
export type { UiKey } from './locales/ja';
export { CONTENT_LOCALES_DONE as CONTENT_LOCALES } from './content';

export const UI_STRINGS: Readonly<Record<Locale, Readonly<Record<UiKey, string>>>> = {
  ja: JA,
  en: EN,
  es: ES,
  'pt-BR': PT_BR,
  'zh-Hans': ZH_HANS,
  fr: FR,
  de: DE,
  ko: KO,
  ru: RU,
  it: IT,
  'zh-Hant': ZH_HANT,
  id: ID,
  tr: TR,
  vi: VI,
  th: TH,
};

export type TranslateParams = Readonly<Record<string, string | number>>;

export function formatInteger(locale: Locale, n: number): string {
  const v = Number.isFinite(n) ? Math.trunc(n) : 0;
  try {
    return new Intl.NumberFormat(locale).format(v);
  } catch {
    return String(v);
  }
}

/** Never returns the raw key: a (hypothetically) missing entry falls back to English, then Japanese. */
export function translate(locale: Locale, key: UiKey, params?: TranslateParams): string {
  const raw = UI_STRINGS[locale][key] ?? EN[key] ?? JA[key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = params[name];
    if (v === undefined) return whole;
    return typeof v === 'number' ? formatInteger(locale, v) : v;
  });
}

export const LANGUAGE_STORAGE_KEY = 'shatekki.language.v1';

export interface I18n {
  readonly locale: Locale;
  t(key: UiKey, params?: TranslateParams): string;
  setLocale(next: Locale): void;
  subscribe(listener: (locale: Locale) => void): () => void;
}

export function createI18n(storage: KeyValueStorage | null, browserLanguages: readonly string[]): I18n {
  let saved: string | null = null;
  try {
    saved = storage?.getItem(LANGUAGE_STORAGE_KEY) ?? null;
  } catch {
    saved = null;
  }
  let locale: Locale = resolveLocale({ saved, browser: browserLanguages });
  const listeners = new Set<(l: Locale) => void>();
  return {
    get locale() {
      return locale;
    },
    t: (key, params) => translate(locale, key, params),
    setLocale(next) {
      if (!isLocale(next) || next === locale) return;
      locale = next;
      try {
        storage?.setItem(LANGUAGE_STORAGE_KEY, next);
      } catch {
        /* storage may be unavailable; the choice still applies for this session */
      }
      for (const l of [...listeners]) l(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const ALL_LOCALES = LOCALES;
