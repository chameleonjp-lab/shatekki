/**
 * Resolver for the expanded gameplay's player-facing text (D34-D37, plan EG09).
 * Fallback order: locale -> en -> ja (data files + ja supplement) -> the id itself.
 * Only words change per locale: ids, numbers, probabilities and the effect a
 * choice leads to never depend on text. Machine-written, not native-reviewed.
 */
import effectsJa from '../../data/expansion-v2/effects.json';
import groupsJa from '../../data/expansion-v2/groups.json';
import pairsJa from '../../data/expansion-v2/pair-sets.json';
import questionsJa from '../../data/expansion-v2/questions.json';
import seriesJa from '../../data/expansion-v2/series.json';
import { DE_CONTENT } from './expanded/de';
import { EN_CONTENT } from './expanded/en';
import { ES_CONTENT } from './expanded/es';
import { FR_CONTENT } from './expanded/fr';
import { KO_CONTENT } from './expanded/ko';
import { PT_BR_CONTENT } from './expanded/pt-BR';
import { RU_CONTENT } from './expanded/ru';
import { ZH_HANS_CONTENT } from './expanded/zh-Hans';
import { ZH_HANT_CONTENT } from './expanded/zh-Hant';
import { ID_CONTENT } from './expanded/id';
import { TR_CONTENT } from './expanded/tr';
import { IT_CONTENT } from './expanded/it';
import { JA_SUPPLEMENT } from './expanded/ja';
import {
  EXPANDED_COUNTS,
  type ExpandedLineKey,
  type ExpandedLocaleEntry,
  type ExpandedRegistry,
  type PartialExpandedContent,
} from './expanded/types';
import type { Locale } from './locales';

const PENDING: ExpandedLocaleEntry = { status: 'pending', content: {} };

/**
 * Registry for every locale except ja (ja is the data files + supplement).
 * Locales still `pending` carry no (or partial) text and fall back to English; fill them
 * in `src/i18n/expanded/<locale>.ts` and switch their entry to `complete`.
 */
export const EXPANDED_REGISTRY: ExpandedRegistry = {
  en: { status: 'complete', content: EN_CONTENT },
  es: { status: 'complete', content: ES_CONTENT },
  'pt-BR': { status: 'complete', content: PT_BR_CONTENT },
  'zh-Hans': { status: 'complete', content: ZH_HANS_CONTENT },
  fr: { status: 'complete', content: FR_CONTENT },
  de: { status: 'complete', content: DE_CONTENT },
  ko: { status: 'complete', content: KO_CONTENT },
  ru: { status: 'complete', content: RU_CONTENT },
  it: { status: 'complete', content: IT_CONTENT },
  'zh-Hant': { status: 'complete', content: ZH_HANT_CONTENT },
  id: { status: 'complete', content: ID_CONTENT },
  tr: { status: 'complete', content: TR_CONTENT },
  vi: PENDING,
  th: PENDING,
};

interface NamedJa {
  readonly id: string;
}
function indexBy<T extends NamedJa>(rows: readonly T[]): ReadonlyMap<string, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
const PAIR_JA = indexBy(pairsJa as readonly { id: string; name_ja: string }[]);
const Q_JA = indexBy(questionsJa as readonly { id: string; text_ja: string; A: { text_ja: string }; B: { text_ja: string } }[]);
const GROUP_JA = indexBy(groupsJa as readonly { id: string; label_ja: string }[]);
const FX_JA = indexBy(effectsJa as readonly { id: string; name_ja: string }[]);
const SER_JA = indexBy(seriesJa as readonly { id: string; name_ja: string; symbol_ja: string }[]);

function partial(locale: Locale): PartialExpandedContent | undefined {
  return locale === 'ja' ? undefined : EXPANDED_REGISTRY[locale]?.content;
}
function en(): PartialExpandedContent {
  return EN_CONTENT;
}
const nonEmpty = (s: string | undefined): s is string => typeof s === 'string' && s.length > 0;

export function pairName(locale: Locale, id: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.pairNames?.[id] ?? en().pairNames?.[id];
    if (nonEmpty(t)) return t;
  }
  return PAIR_JA.get(id)?.name_ja ?? id;
}

export function pairHint(locale: Locale, id: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.pairHints?.[id] ?? en().pairHints?.[id];
    if (nonEmpty(t)) return t;
  }
  return JA_SUPPLEMENT.pairHints[id] ?? id;
}

export function questionText(locale: Locale, qid: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.questions?.[qid]?.text ?? en().questions?.[qid]?.text;
    if (nonEmpty(t)) return t;
  }
  return Q_JA.get(qid)?.text_ja ?? qid;
}

export function choiceText(locale: Locale, qid: string, choice: 'A' | 'B'): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.questions?.[qid]?.[choice] ?? en().questions?.[qid]?.[choice];
    if (nonEmpty(t)) return t;
  }
  return Q_JA.get(qid)?.[choice].text_ja ?? `${qid}.${choice}`;
}

export function groupLabel(locale: Locale, groupId: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.groups?.[groupId] ?? en().groups?.[groupId];
    if (nonEmpty(t)) return t;
  }
  return GROUP_JA.get(groupId)?.label_ja ?? groupId;
}

export function effectName(locale: Locale, fx: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.effectNames?.[fx] ?? en().effectNames?.[fx];
    if (nonEmpty(t)) return t;
  }
  return FX_JA.get(fx)?.name_ja ?? fx;
}

export function seriesLabel(locale: Locale, ser: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.seriesLabels?.[ser] ?? en().seriesLabels?.[ser];
    if (nonEmpty(t)) return t;
  }
  return SER_JA.get(ser)?.name_ja ?? ser;
}

export function seriesSymbol(locale: Locale, ser: string): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.seriesSymbols?.[ser] ?? en().seriesSymbols?.[ser];
    if (nonEmpty(t)) return t;
  }
  return SER_JA.get(ser)?.symbol_ja ?? ser;
}

export function expandedLine(locale: Locale, key: ExpandedLineKey): string {
  if (locale !== 'ja') {
    const t = partial(locale)?.lines?.[key] ?? en().lines?.[key];
    if (nonEmpty(t)) return t;
  }
  return JA_SUPPLEMENT.lines[key] ?? key;
}

/** FX041-FX060 and FX061-FX080 name the series SER01-SER20 in order. */
export function seriesOfEffect(fx: string): string | null {
  const m = /^FX(\d{3})$/.exec(fx);
  if (!m) return null;
  const n = Number(m[1]);
  if (n >= 41 && n <= 80) return `SER${String(((n - 41) % 20) + 1).padStart(2, '0')}`;
  return null;
}

export interface EffectResultParams {
  /** The real amount (e.g. shots actually added or removed) for `{n}`. */
  readonly n?: number;
  /** false: the effect changed nothing - the generic not-applicable line is returned. */
  readonly applicable?: boolean;
}

export function effectResult(locale: Locale, fx: string, params: EffectResultParams = {}): string {
  if (params.applicable === false) return expandedLine(locale, 'effectNotApplicable');
  let raw: string | undefined;
  if (locale !== 'ja') {
    const t = partial(locale)?.effectResults?.[fx] ?? en().effectResults?.[fx];
    if (nonEmpty(t)) raw = t;
  }
  raw ??= JA_SUPPLEMENT.effectResults[fx] ?? fx;
  const ser = seriesOfEffect(fx);
  return raw
    .replace(/\{n\}/g, params.n === undefined ? '' : String(params.n))
    .replace(/\{series\}/g, ser ? seriesLabel(locale, ser) : '');
}

export interface ExpandedCoverage {
  readonly locale: Locale;
  readonly status: 'complete' | 'pending';
  /** Entries present of each kind, from this locale's own text (ja: data + supplement). */
  readonly present: Readonly<Record<'pairNames' | 'pairHints' | 'questions' | 'groups' | 'effectNames' | 'effectResults' | 'seriesLabels' | 'seriesSymbols' | 'lines', number>>;
}

export const EXPANDED_EXPECTED = {
  pairNames: EXPANDED_COUNTS.pairs,
  pairHints: EXPANDED_COUNTS.pairs,
  questions: EXPANDED_COUNTS.questions,
  groups: EXPANDED_COUNTS.groups,
  effectNames: EXPANDED_COUNTS.effects,
  effectResults: EXPANDED_COUNTS.effects,
  seriesLabels: EXPANDED_COUNTS.series,
  seriesSymbols: EXPANDED_COUNTS.series,
  lines: 4,
} as const;

const count = (o: object | undefined): number => (o ? Object.values(o).filter((v) => (typeof v === 'string' ? v.length > 0 : v !== undefined)).length : 0);

/** Per-locale counts of present entries; later runs fill the pending locales. */
export function contentCoverage(): readonly ExpandedCoverage[] {
  const ja: ExpandedCoverage = {
    locale: 'ja',
    status: 'complete',
    present: {
      pairNames: PAIR_JA.size,
      pairHints: count(JA_SUPPLEMENT.pairHints),
      questions: Q_JA.size,
      groups: GROUP_JA.size,
      effectNames: FX_JA.size,
      effectResults: count(JA_SUPPLEMENT.effectResults),
      seriesLabels: SER_JA.size,
      seriesSymbols: SER_JA.size,
      lines: count(JA_SUPPLEMENT.lines),
    },
  };
  const others = (Object.keys(EXPANDED_REGISTRY) as Exclude<Locale, 'ja'>[]).map((locale): ExpandedCoverage => {
    const e = EXPANDED_REGISTRY[locale];
    const c = e.content;
    return {
      locale,
      status: e.status,
      present: {
        pairNames: count(c.pairNames),
        pairHints: count(c.pairHints),
        questions: count(c.questions),
        groups: count(c.groups),
        effectNames: count(c.effectNames),
        effectResults: count(c.effectResults),
        seriesLabels: count(c.seriesLabels),
        seriesSymbols: count(c.seriesSymbols),
        lines: count(c.lines),
      },
    };
  });
  return [ja, ...others];
}

export { type ExpandedLineKey } from './expanded/types';
