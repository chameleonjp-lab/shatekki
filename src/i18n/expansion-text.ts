/**
 * Display text for the expanded-gameplay content keys (`exp.*`, see `expKey` in
 * src/catalog/expanded-config.ts): 200 questions, 400 choices, 6 group labels,
 * 100 effect names, 20 series labels/symbols, 300 pair names.
 *
 * The long content translations (13 languages) are NOT written yet. Until they
 * are, every locale reads the Japanese source from data/expansion-v2 (the
 * proposal's original wording), and a key with no source at all (e.g. effect
 * result lines, which have no Japanese source yet) resolves to ''. A missing
 * translation never shows a raw key to the player.
 */
import type { Locale } from './locales';
import questions from '../../data/expansion-v2/questions.json';
import groups from '../../data/expansion-v2/groups.json';
import effects from '../../data/expansion-v2/effects.json';
import series from '../../data/expansion-v2/series.json';
import pairSets from '../../data/expansion-v2/pair-sets.json';

let ja: Map<string, string> | null = null;

function japanese(): Map<string, string> {
  if (ja) return ja;
  const m = new Map<string, string>();
  for (const q of questions) {
    m.set(`exp.q.${q.id}`, q.text_ja);
    m.set(`exp.q.${q.id}.A`, q.A.text_ja);
    m.set(`exp.q.${q.id}.B`, q.B.text_ja);
  }
  for (const g of groups) m.set(`exp.group.${g.id}`, g.label_ja);
  for (const e of effects) m.set(`exp.fx.${e.id}.name`, e.name_ja);
  for (const s of series) {
    m.set(`exp.series.${s.id}.label`, s.name_ja);
    m.set(`exp.series.${s.id}.symbol`, s.symbol_ja);
  }
  for (const p of pairSets) m.set(`exp.pair.${p.id}.name`, p.name_ja);
  ja = m;
  return m;
}

/** True for the content keys this module knows about. */
export function isExpansionKey(key: string): boolean {
  return key.startsWith('exp.');
}

/**
 * Text of a content key in `locale`. Translations are added later; today every
 * locale falls back to the Japanese source. Returns '' when there is none.
 */
export function expansionText(_locale: Locale, key: string): string {
  return japanese().get(key) ?? '';
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
  return (key, params) => (isExpansionKey(key) ? expansionText(locale(), key) : ui(key, params));
}
