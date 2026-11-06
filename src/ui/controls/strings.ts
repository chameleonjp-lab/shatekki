/**
 * Control strings now come from src/i18n (15 languages). `t(key)` uses the
 * locale last set with setControlsLocale (default ja). JA_CONTROLS keeps the
 * Japanese table for tests and key discovery. Logic must never branch on text.
 */
import { JA } from '../../i18n/locales/ja';
import { translate, type Locale, type UiKey } from '../../i18n';

const PREFIXES = ['hint.', 'btn.', 'hud.', 'load.', 'aria.'];
const SYMBOLS: Readonly<Record<string, string>> = { 'btn.left': '◀', 'btn.right': '▶' };

export const JA_CONTROLS: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(JA).filter(([k]) => PREFIXES.some((p) => k.startsWith(p)) || k === 'rotate' || k === 'prototype')),
  ...SYMBOLS,
};

let current: Locale = 'ja';
export function setControlsLocale(locale: Locale): void {
  current = locale;
}

export function t(key: string): string {
  const sym = SYMBOLS[key];
  if (sym !== undefined) return sym;
  if (key in JA) return translate(current, key as UiKey);
  return key;
}
