/**
 * Display text for the expanded-gameplay content keys (`exp.*`, see `expKey` in
 * src/catalog/expanded-config.ts): 200 questions, 400 choices, 6 group labels,
 * 100 effect names and result lines, 20 series labels/symbols, 300 pair names
 * and hints.
 *
 * Text comes from src/i18n/expanded-content.ts: the locale, then English, then
 * the Japanese source in data/expansion-v2. All 15 locales are complete; the
 * English fallback only covers an entry a future locale leaves out. Unknown keys
 * resolve to '' so a raw key is never shown to the player.
 */
import type { Locale } from './locales';
import {
  choiceText,
  effectName,
  effectResult,
  groupLabel,
  pairHint,
  pairName,
  questionText,
  seriesLabel,
  seriesSymbol,
} from './expanded-content';

/** True for the content keys this module knows about. */
export function isExpansionKey(key: string): boolean {
  return key.startsWith('exp.');
}

const KEY = /^exp\.(q|group|fx|series|pair)\.([A-Z]+\d*)(?:\.(A|B|name|result|label|symbol|hint))?$/;

/** Text of a content key in `locale` (locale → en → ja source). Returns '' for an unknown key. */
export function expansionText(locale: Locale, key: string, params?: Readonly<Record<string, string | number>>): string {
  const m = KEY.exec(key);
  if (!m) return '';
  const [, kind, id, part] = m as unknown as [string, string, string, string | undefined];
  const out = (() => {
    switch (kind) {
      case 'q':
        return part === 'A' || part === 'B' ? choiceText(locale, id, part) : part === undefined ? questionText(locale, id) : '';
      case 'group':
        return part === undefined ? groupLabel(locale, id) : '';
      case 'fx':
        if (part === 'name') return effectName(locale, id);
        if (part === 'result') return effectResult(locale, id, typeof params?.n === 'number' ? { n: params.n } : {});
        return '';
      case 'series':
        return part === 'label' ? seriesLabel(locale, id) : part === 'symbol' ? seriesSymbol(locale, id) : '';
      case 'pair':
        return part === 'name' ? pairName(locale, id) : part === 'hint' ? pairHint(locale, id) : '';
      default:
        return '';
    }
  })();
  // The resolvers fall back to the id itself; never show a bare id as text.
  return out === id ? '' : out;
}

/**
 * One translator for the view and the question panel: UI keys go to `ui`,
 * `exp.*` content keys to {@link expansionText}. Never returns a raw key for a
 * content key (returns '' instead) so callers can hide the element.
 */
export function createExpansionTranslator(
  locale: () => Locale,
  ui: (key: string, params?: Readonly<Record<string, string | number>>) => string,
): (key: string, params?: Readonly<Record<string, string | number>>) => string {
  return (key, params) => (isExpansionKey(key) ? expansionText(locale(), key, params) : ui(key, params));
}
