/**
 * Player-facing text for the expanded gameplay (D34-D37, plan EG09).
 * Keys are the stable ids from `expKey` (src/catalog/expanded-config.ts): the
 * resolver never changes an id, a number, a probability or which effect a choice
 * leads to - only the words shown.
 */
import type { Locale } from '../locales';

export interface ExpandedQuestionText {
  readonly text: string;
  readonly A: string;
  readonly B: string;
}

/** Fixed one-off lines. */
export const EXPANDED_LINE_KEYS = [
  /** The chosen group had no usable effect right now. */
  'noApplicableEffect',
  /** Generic: an effect was drawn but could not change anything. */
  'effectNotApplicable',
  /** FX061-080 target series has no prize on the board at the moment. */
  'noOutlineTarget',
  /** FX090-092 may leave a prize temporarily outside the shelf series. */
  'sideEffectTemporaryOutsideSeries',
] as const;
export type ExpandedLineKey = (typeof EXPANDED_LINE_KEYS)[number];

export interface ExpandedLocaleContent {
  /** PAIR001-PAIR300 */
  readonly pairNames: Readonly<Record<string, string>>;
  /** PAIR001-PAIR300: gentle clue, says it needs 2 kinds, names neither prize. */
  readonly pairHints: Readonly<Record<string, string>>;
  /** Q001-Q200 */
  readonly questions: Readonly<Record<string, ExpandedQuestionText>>;
  /** GAIN, RISK, STOCK, GUIDE, MIX, CHAOS: short label next to a choice. */
  readonly groups: Readonly<Record<string, string>>;
  /** FX001-FX100 */
  readonly effectNames: Readonly<Record<string, string>>;
  /** FX001-FX100: one short line after the effect was applied. `{n}` = real amount, `{series}` = series label. */
  readonly effectResults: Readonly<Record<string, string>>;
  /** SER01-SER20 */
  readonly seriesLabels: Readonly<Record<string, string>>;
  /** SER01-SER20: short symbol such as "[Sweets]". */
  readonly seriesSymbols: Readonly<Record<string, string>>;
  readonly lines: Readonly<Record<ExpandedLineKey, string>>;
}

/** Japanese keeps its source texts in data/expansion-v2; only what the data lacks is written here. */
export type JapaneseSupplement = Pick<ExpandedLocaleContent, 'pairHints' | 'effectResults' | 'lines'>;

/** A locale whose translation is not done yet: any subset, filled in later. */
export interface PartialExpandedContent {
  readonly pairNames?: Readonly<Record<string, string>>;
  readonly pairHints?: Readonly<Record<string, string>>;
  readonly questions?: Readonly<Record<string, ExpandedQuestionText>>;
  readonly groups?: Readonly<Record<string, string>>;
  readonly effectNames?: Readonly<Record<string, string>>;
  readonly effectResults?: Readonly<Record<string, string>>;
  readonly seriesLabels?: Readonly<Record<string, string>>;
  readonly seriesSymbols?: Readonly<Record<string, string>>;
  readonly lines?: Readonly<Partial<Record<ExpandedLineKey, string>>>;
}

/** Only a `pending` locale may carry partial content; a `complete` one must carry everything. */
export type ExpandedLocaleEntry =
  | { readonly status: 'complete'; readonly content: ExpandedLocaleContent }
  | { readonly status: 'pending'; readonly content: PartialExpandedContent };

export type ExpandedRegistry = Readonly<Record<Exclude<Locale, 'ja'>, ExpandedLocaleEntry>>;

export const EXPANDED_COUNTS = {
  pairs: 300,
  questions: 200,
  groups: 6,
  effects: 100,
  series: 20,
} as const;
