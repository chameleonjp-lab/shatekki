/**
 * The r007 text lookup the whole game uses: r007 words (af.*) from their own table, the
 * renamed effects (FX012/013/035/036 as power-zone effects) by their definition's key, and
 * everything else from the expanded translator. Other versions get `base` unchanged.
 */
import type { ExpansionCatalog } from '../contracts';
import type { Locale } from '../i18n/locales';
import { afText, isAfKey } from '../i18n/stall-speech';
import { effectKeyOverrides } from '../i18n/effect-keys';

export type TextFn = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export function aimFirstTranslator(locale: () => Locale, base: TextFn, expansion: ExpansionCatalog | null): TextFn {
  if (!expansion?.profile.aimFirst) return base;
  const renamed = effectKeyOverrides(expansion);
  return (key, params) => {
    const k = renamed.get(key) ?? key;
    return isAfKey(k) ? afText(locale(), k, params) : base(k, params);
  };
}
