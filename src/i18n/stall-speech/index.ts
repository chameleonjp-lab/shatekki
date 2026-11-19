/**
 * r007 text lookup: UI words (af.*, the four r007 effect names) and the 100 spoken lines.
 * Fallback: locale → en → ja → the key itself. Words only: ids, numbers and the
 * condition of a line never depend on the text.
 */
import type { Locale } from '../locales';
import { AF_UI_JA, SPEECH_JA, SPEECH_LINES, type AfUiKey } from './ja';
import { AF_LOCALES } from './locales';

export { SPEECH_LINES, AF_UI_JA, SPEECH_JA };
export type { AfUiKey, SpeechCondition, SpeechCategory, SpeechLineDef } from './ja';

export interface AfLocaleContent {
  readonly ui: Partial<Record<AfUiKey, string>>;
  readonly lines: Partial<Record<string, string>>;
}

function fill(text: string, params?: Readonly<Record<string, string | number>>): string {
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

export function isAfKey(key: string): key is AfUiKey {
  return Object.hasOwn(AF_UI_JA, key);
}

/** One r007 UI string. */
export function afText(locale: Locale, key: AfUiKey, params?: Readonly<Record<string, string | number>>): string {
  const own = locale === 'ja' ? undefined : AF_LOCALES[locale]?.ui[key];
  const text = own ?? (locale === 'ja' ? undefined : AF_LOCALES.en?.ui[key]) ?? AF_UI_JA[key];
  return fill(text, params);
}

/** One spoken line by id (K001..K100). */
export function speechText(locale: Locale, id: string): string {
  if (locale === 'ja') return SPEECH_JA[id] ?? id;
  return AF_LOCALES[locale]?.lines[id] ?? AF_LOCALES.en?.lines[id] ?? SPEECH_JA[id] ?? id;
}
