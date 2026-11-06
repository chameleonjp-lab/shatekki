/** Locale ids (the 15 common-spec ids) and resolution: saved → browser → English. */
export const LOCALES = ['ja', 'en', 'es', 'pt-BR', 'zh-Hans', 'fr', 'de', 'ko', 'ru', 'it', 'zh-Hant', 'id', 'tr', 'vi', 'th'] as const;
export type Locale = (typeof LOCALES)[number];

/** Names shown in the language picker, each in its own language (never translated). */
export const LOCALE_NATIVE_NAMES: Readonly<Record<Locale, string>> = {
  ja: '日本語',
  en: 'English',
  es: 'Español',
  'pt-BR': 'Português (Brasil)',
  'zh-Hans': '简体中文',
  fr: 'Français',
  de: 'Deutsch',
  ko: '한국어',
  ru: 'Русский',
  it: 'Italiano',
  'zh-Hant': '繁體中文',
  id: 'Bahasa Indonesia',
  tr: 'Türkçe',
  vi: 'Tiếng Việt',
  th: 'ไทย',
};

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

/** Map one BCP-47 tag from the browser to one of our ids, or null. */
export function matchBrowserTag(tag: string): Locale | null {
  const parts = tag.trim().replace(/_/g, '-').split('-');
  const lang = (parts[0] ?? '').toLowerCase();
  const rest = parts.slice(1).map((p) => p.toLowerCase());
  if (lang === 'zh') {
    if (rest.includes('hant') || rest.some((r) => r === 'tw' || r === 'hk' || r === 'mo')) return 'zh-Hant';
    return 'zh-Hans';
  }
  if (lang === 'pt') return 'pt-BR';
  if (lang === 'in') return 'id';
  const direct: Readonly<Record<string, Locale>> = {
    ja: 'ja', en: 'en', es: 'es', fr: 'fr', de: 'de', ko: 'ko', ru: 'ru', it: 'it', id: 'id', tr: 'tr', vi: 'vi', th: 'th',
  };
  return direct[lang] ?? null;
}

export function resolveLocale(input: { readonly saved: string | null | undefined; readonly browser: readonly string[] }): Locale {
  if (isLocale(input.saved)) return input.saved;
  for (const tag of input.browser) {
    const m = matchBrowserTag(tag);
    if (m) return m;
  }
  return 'en';
}
