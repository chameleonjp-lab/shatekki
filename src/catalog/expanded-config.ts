/**
 * Builds the checked ExpansionCatalog from raw data (D34-D37, plan EG01).
 *
 * Every definition is `valueStatus: 'prototype'`. Text lives in i18n keys; the
 * `_ja` source texts stay in the data files (EG09 writes the 15-language
 * content). The pair set's theme column is a designer note and is never used
 * as the in-game hint.
 */
import type {
  EffectDef,
  EffectGroupDef,
  EffectGroupId,
  EffectId,
  EffectOperation,
  ExpansionCatalog,
  ExpansionLimits,
  ExpansionProfile,
  ExpansionStatusSummary,
  PrizeTypeId,
  QuestionDef,
  QuestionId,
  RuntimeCatalog,
  SeriesDef,
  SeriesId,
  SetId,
  SetRuntimeConfig,
  ValueStatus,
} from '../contracts';
import { validateExpansionData, type RawExpansionData } from './expansion-validate';

type Obj = Record<string, any>; // validated by validateExpansionData before use

export const expKey = {
  question: (id: string) => `exp.q.${id}`,
  choice: (id: string, c: 'A' | 'B') => `exp.q.${id}.${c}`,
  effectName: (id: string) => `exp.fx.${id}.name`,
  effectResult: (id: string) => `exp.fx.${id}.result`,
  group: (id: string) => `exp.group.${id}`,
  seriesLabel: (id: string) => `exp.series.${id}.label`,
  seriesSymbol: (id: string) => `exp.series.${id}.symbol`,
  pairName: (id: string) => `exp.pair.${id}.name`,
  pairHint: (id: string) => `exp.pair.${id}.hint`,
} as const;

export class ExpansionDataError extends Error {
  constructor(readonly errors: readonly { readonly targetId: string; readonly reason: string }[]) {
    super(`expanded gameplay data is invalid (${errors.length}): ${JSON.stringify(errors.slice(0, 5))}`);
    this.name = 'ExpansionDataError';
  }
}

export interface ExpansionBuild {
  readonly expansion: ExpansionCatalog;
  /** The base catalog plus PAIR001-PAIR300, rulesVersion from the profile. */
  readonly catalog: RuntimeCatalog;
}

function freezeMap<K, V>(m: Map<K, V>): ReadonlyMap<K, V> {
  return Object.freeze(m);
}

/** Validates and builds. Throws ExpansionDataError listing every problem. */
export function buildExpandedCatalog(base: RuntimeCatalog, raw: unknown): ExpansionCatalog {
  return buildExpansion(base, raw).expansion;
}

export function buildExpansion(base: RuntimeCatalog, raw: unknown): ExpansionBuild {
  const errors = validateExpansionData(base, raw);
  if (errors.length > 0) throw new ExpansionDataError(errors);
  const data = raw as RawExpansionData & Obj;
  const p = data.profile as Obj;
  const profile: ExpansionProfile = Object.freeze({
    rulesVersion: p.rulesVersion as string,
    valueStatus: 'prototype' as ValueStatus,
    slotCount: 36 as const,
    cellCount: 36 as const,
    pairSetBonusScore: p.pairSetBonusScore as number,
    tierTargets: Object.freeze({ easy: p.tierTargets.easy, normal: p.tierTargets.normal, hard: p.tierTargets.hard }),
    limits: Object.freeze(JSON.parse(JSON.stringify(p.limits))) as ExpansionLimits,
  });

  const sets = new Map(base.sets);
  const pairSetIds: SetId[] = [];
  for (const pair of data.pairSets as Obj[]) {
    const setId = pair.id as SetId;
    const [a, b] = pair.prizeIds as PrizeTypeId[];
    const cfg: SetRuntimeConfig = Object.freeze({
      setId,
      requiredTypeIds: Object.freeze([a!, b!]) as unknown as readonly [PrizeTypeId, PrizeTypeId],
      bonusScore: profile.pairSetBonusScore,
      hintKey: expKey.pairHint(setId),
      valueStatus: 'prototype' as ValueStatus,
    });
    sets.set(setId, cfg);
    pairSetIds.push(setId);
  }
  pairSetIds.sort();
  const catalog: RuntimeCatalog = Object.freeze({ rulesVersion: profile.rulesVersion, prizes: base.prizes, sets: freezeMap(sets) });

  const questions = new Map<QuestionId, QuestionDef>();
  for (const q of data.questions as Obj[]) {
    const questionId = q.id as QuestionId;
    questions.set(
      questionId,
      Object.freeze({
        questionId,
        textKey: expKey.question(q.id),
        choices: Object.freeze({
          A: Object.freeze({ groupId: q.A.group as EffectGroupId, textKey: expKey.choice(q.id, 'A') }),
          B: Object.freeze({ groupId: q.B.group as EffectGroupId, textKey: expKey.choice(q.id, 'B') }),
        }),
      }),
    );
  }
  const groups = new Map<EffectGroupId, EffectGroupDef>();
  for (const g of data.groups as Obj[]) {
    const groupId = g.id as EffectGroupId;
    groups.set(groupId, Object.freeze({ groupId, effectIds: Object.freeze([...(g.effectIds as EffectId[])]), labelKey: expKey.group(g.id) }));
  }
  const effects = new Map<EffectId, EffectDef>();
  for (const e of data.effects as Obj[]) {
    const effectId = e.id as EffectId;
    effects.set(
      effectId,
      Object.freeze({
        effectId,
        operation: deepFreeze(e.operation) as EffectOperation,
        timing: e.timing,
        nameKey: expKey.effectName(e.id),
        resultKey: expKey.effectResult(e.id),
        valueStatus: 'prototype' as ValueStatus,
      }),
    );
  }
  const series = new Map<SeriesId, SeriesDef>();
  for (const s of data.series as Obj[]) {
    const seriesId = s.id as SeriesId;
    const typeIds = [...new Set(s.prizeIds as PrizeTypeId[])].sort();
    series.set(
      seriesId,
      Object.freeze({
        seriesId,
        typeIds: Object.freeze(typeIds),
        color: (s.color as string).toUpperCase(),
        symbolKey: expKey.seriesSymbol(s.id),
        labelKey: expKey.seriesLabel(s.id),
      }),
    );
  }

  const expansion: ExpansionCatalog = Object.freeze({
    profile,
    pairSetIds: Object.freeze(pairSetIds),
    questions: freezeMap(questions),
    groups: freezeMap(groups),
    effects: freezeMap(effects),
    series: freezeMap(series),
  });
  return { expansion, catalog };
}

function deepFreeze<T>(v: T): T {
  if (typeof v === 'object' && v !== null) {
    for (const k of Object.keys(v)) deepFreeze((v as Obj)[k]);
    Object.freeze(v);
  }
  return v;
}

const ORDER: Record<ValueStatus, number> = { prototype: 0, proposed: 1, approved: 2 };

/**
 * Status of everything the expansion adds: every pair set, every effect and the
 * profile. An approved rules-v1 catalog underneath never makes this approved.
 */
export function expansionStatusSummary(expansion: ExpansionCatalog, catalog: RuntimeCatalog): ExpansionStatusSummary {
  const counts: Record<ValueStatus, number> = { prototype: 0, proposed: 0, approved: 0 };
  counts[expansion.profile.valueStatus]++;
  for (const id of expansion.pairSetIds) counts[catalog.sets.get(id)?.valueStatus ?? 'prototype']++;
  for (const e of expansion.effects.values()) counts[e.valueStatus]++;
  let overall: ValueStatus = 'approved';
  for (const s of ['prototype', 'proposed', 'approved'] as const) if (counts[s] > 0 && ORDER[s] < ORDER[overall]) overall = s;
  return { overall, counts };
}
