/**
 * Validation of the expanded-gameplay raw data (D34-D37, plan EG01).
 *
 * The raw shape is what scripts/expansion/extract-appendices.mjs writes to
 * data/expansion-v2/*.json. Every value is a proposal (prototype). Errors are
 * collected, never thrown, in the same `{ targetId, reason }` form as
 * src/catalog/validate.ts.
 */
import type { CatalogValidationError, RuntimeCatalog } from '../contracts';
import { isEffectGroupId, isEffectId, isPairSetId, isPrizeTypeId, isQuestionId, isSeriesId, EFFECT_GROUP_IDS, EFFECT_OPERATION_KINDS, HINT_KINDS } from '../contracts';

export const EXPECTED_PAIR_COUNT = 300;
export const EXPECTED_QUESTION_COUNT = 200;
export const EXPECTED_EFFECT_COUNT = 100;
export const EXPECTED_SERIES_COUNT = 20;
export const MIN_SERIES_TYPES = 3;

export interface RawExpansionData {
  readonly pairSets: unknown;
  readonly questions: unknown;
  readonly groups: unknown;
  readonly effects: unknown;
  readonly series: unknown;
  readonly profile: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9A-Fa-f]{6}$/;
const BULLET_TYPES = ['standard', 'heavy', 'bouncy'];

const RANGE_KEYS = ['damagePushMult', 'speedMult', 'gravityMult', 'restitutionMult', 'swayMult', 'loadPeriodMult', 'radiusMult', 'reflections', 'splitSpreadMult'] as const;

export function validateExpansionData(base: RuntimeCatalog, raw: unknown): CatalogValidationError[] {
  const errors: CatalogValidationError[] = [];
  const err = (targetId: string, reason: string) => {
    errors.push({ targetId, reason });
  };
  if (!isObj(raw)) return [{ targetId: '$', reason: 'expansion data is not an object' }];
  const data = raw as Record<string, unknown>;

  // ---- profile -----------------------------------------------------------
  const profile = data.profile;
  let limits: Record<string, unknown> | null = null;
  if (!isObj(profile)) err('profile', 'profile is not an object');
  else {
    if (typeof profile.rulesVersion !== 'string' || profile.rulesVersion.length === 0) err('profile', 'rulesVersion must be a non-empty string');
    else if (profile.rulesVersion === base.rulesVersion) err('profile', 'rulesVersion must differ from the base catalog rulesVersion');
    if (profile.valueStatus !== 'prototype') err('profile', "valueStatus must be 'prototype' (the appendix values are proposals, C01-C05 not adopted)");
    if (profile.slotCount !== 36) err('profile', 'slotCount must be 36');
    if (profile.cellCount !== 36) err('profile', 'cellCount must be 36');
    if (!isFiniteNum(profile.pairSetBonusScore) || profile.pairSetBonusScore < 0) err('profile', 'pairSetBonusScore must be a finite number >= 0');
    const tt = profile.tierTargets;
    if (!isObj(tt) || !(['easy', 'normal', 'hard'] as const).every((k) => Number.isInteger(tt[k]) && (tt[k] as number) >= 0)) err('profile', 'tierTargets must hold non-negative integers for easy/normal/hard');
    else if ((tt.easy as number) + (tt.normal as number) + (tt.hard as number) !== 36) err('profile', 'tierTargets must sum to 36');
    if (!isObj(profile.limits)) err('profile', 'limits is not an object');
    else {
      limits = profile.limits;
      for (const k of RANGE_KEYS) {
        const r = limits[k];
        if (!isObj(r) || !isFiniteNum(r.min) || !isFiniteNum(r.max) || r.min <= 0 || r.min > r.max) err('profile', `limits.${k} must be {min,max} with 0 < min <= max`);
      }
      if (!isFiniteNum(limits.maxPowerMultiplier) || limits.maxPowerMultiplier <= 0) err('profile', 'limits.maxPowerMultiplier must be a finite number > 0');
      if (!isFiniteNum(limits.maxSwayAmplitudeRad) || limits.maxSwayAmplitudeRad <= 0) err('profile', 'limits.maxSwayAmplitudeRad must be a finite number > 0');
    }
  }
  const limitsOk = limits !== null && errors.every((e) => e.targetId !== 'profile');

  // ---- pair sets -----------------------------------------------------------
  const pairIds = new Set<string>();
  const unordered = new Set<string>();
  const covered = new Set<string>();
  if (!Array.isArray(data.pairSets)) err('pairSets', 'pairSets must be an array');
  else {
    if (data.pairSets.length !== EXPECTED_PAIR_COUNT) err('pairSets', `expected ${EXPECTED_PAIR_COUNT} pair sets, got ${data.pairSets.length}`);
    data.pairSets.forEach((p: unknown, i: number) => {
      if (!isObj(p)) return err(`pairSets[${i}]`, 'pair set is not an object');
      const id = p.id;
      if (!isPairSetId(id)) return err(`pairSets[${i}]`, `invalid pair set id: ${String(id)}`);
      if (pairIds.has(id)) err(id, 'duplicate pair set id');
      pairIds.add(id);
      if (typeof p.name_ja !== 'string' || p.name_ja.length === 0) err(id, 'name_ja must be a non-empty string');
      if (!(p.designNote_ja === undefined || typeof p.designNote_ja === 'string')) err(id, 'designNote_ja must be a string');
      const ids = p.prizeIds;
      if (!Array.isArray(ids) || ids.length !== 2) return err(id, 'prizeIds must have exactly 2 entries');
      let ok = true;
      for (const t of ids) {
        if (typeof t !== 'string' || !isPrizeTypeId(t)) {
          err(id, `prize id is not a prize type id: ${String(t)}`);
          ok = false;
        } else if (!base.prizes.has(t)) {
          err(id, `prize does not exist: ${t}`);
          ok = false;
        }
      }
      if (!ok) return;
      if (ids[0] === ids[1]) return err(id, 'prizeIds must be two distinct prizes');
      const key = [...(ids as string[])].sort().join('+');
      if (unordered.has(key)) err(id, `duplicate pair (order ignored): ${key}`);
      unordered.add(key);
      for (const t of ids as string[]) covered.add(t);
    });
    for (const t of base.prizes.keys()) if (!covered.has(t)) err(t, 'prize appears in no pair set');
  }

  // ---- series ---------------------------------------------------------------
  const seriesIds = new Set<string>();
  if (!Array.isArray(data.series)) err('series', 'series must be an array');
  else {
    if (data.series.length !== EXPECTED_SERIES_COUNT) err('series', `expected ${EXPECTED_SERIES_COUNT} series, got ${data.series.length}`);
    data.series.forEach((s: unknown, i: number) => {
      if (!isObj(s)) return err(`series[${i}]`, 'series is not an object');
      const id = s.id;
      if (!isSeriesId(id)) return err(`series[${i}]`, `invalid series id: ${String(id)}`);
      if (seriesIds.has(id)) err(id, 'duplicate series id');
      seriesIds.add(id);
      if (typeof s.name_ja !== 'string' || s.name_ja.length === 0) err(id, 'name_ja must be a non-empty string');
      if (typeof s.color !== 'string' || !HEX.test(s.color)) err(id, 'color must be #RRGGBB');
      if (typeof s.symbol_ja !== 'string' || s.symbol_ja.length === 0) err(id, 'symbol_ja must be a non-empty string');
      const ids = s.prizeIds;
      if (!Array.isArray(ids)) return err(id, 'prizeIds must be an array');
      for (const t of ids) if (typeof t !== 'string' || !isPrizeTypeId(t) || !base.prizes.has(t)) err(id, `prize does not exist: ${String(t)}`);
      if (new Set(ids).size !== ids.length) err(id, 'prizeIds must be distinct');
      if (new Set(ids).size < MIN_SERIES_TYPES) err(id, `a series needs at least ${MIN_SERIES_TYPES} distinct prizes`);
    });
  }

  // ---- effects --------------------------------------------------------------
  const effectIds = new Set<string>();
  if (!Array.isArray(data.effects)) err('effects', 'effects must be an array');
  else {
    if (data.effects.length !== EXPECTED_EFFECT_COUNT) err('effects', `expected ${EXPECTED_EFFECT_COUNT} effects, got ${data.effects.length}`);
    data.effects.forEach((e: unknown, i: number) => {
      if (!isObj(e)) return err(`effects[${i}]`, 'effect is not an object');
      const id = e.id;
      if (!isEffectId(id)) return err(`effects[${i}]`, `invalid effect id: ${String(id)}`);
      if (effectIds.has(id)) err(id, 'duplicate effect id');
      effectIds.add(id);
      if (typeof e.name_ja !== 'string' || e.name_ja.length === 0) err(id, 'name_ja must be a non-empty string');
      if (e.timing !== 'afterFlight' && e.timing !== 'nextShot') err(id, "timing must be 'afterFlight' or 'nextShot'");
      if (e.valueStatus !== undefined && e.valueStatus !== 'prototype') err(id, "an effect may not claim a status other than 'prototype'");
      validateOperation(id, e.operation, limitsOk ? limits : null, seriesIds, err);
    });
  }

  // ---- groups -----------------------------------------------------------------
  const groupIds = new Set<string>();
  if (!Array.isArray(data.groups)) err('groups', 'groups must be an array');
  else {
    if (data.groups.length !== EFFECT_GROUP_IDS.length) err('groups', `expected ${EFFECT_GROUP_IDS.length} groups, got ${data.groups.length}`);
    data.groups.forEach((g: unknown, i: number) => {
      if (!isObj(g)) return err(`groups[${i}]`, 'group is not an object');
      const id = g.id;
      if (!isEffectGroupId(id)) return err(`groups[${i}]`, `invalid group id: ${String(id)}`);
      if (groupIds.has(id)) err(id, 'duplicate group id');
      groupIds.add(id);
      if (typeof g.label_ja !== 'string' || g.label_ja.length === 0) err(id, 'label_ja must be a non-empty string');
      const list = g.effectIds;
      if (!Array.isArray(list) || list.length === 0) return err(id, 'effectIds must be a non-empty array');
      if (new Set(list).size !== list.length) err(id, 'effectIds must be distinct');
      for (const f of list) if (typeof f !== 'string' || !effectIds.has(f)) err(id, `group references an unknown effect: ${String(f)}`);
    });
    for (const g of EFFECT_GROUP_IDS) if (!groupIds.has(g)) err(g, 'group is missing');
  }

  // ---- questions ----------------------------------------------------------------
  const questionIds = new Set<string>();
  if (!Array.isArray(data.questions)) err('questions', 'questions must be an array');
  else {
    if (data.questions.length !== EXPECTED_QUESTION_COUNT) err('questions', `expected ${EXPECTED_QUESTION_COUNT} questions, got ${data.questions.length}`);
    data.questions.forEach((q: unknown, i: number) => {
      if (!isObj(q)) return err(`questions[${i}]`, 'question is not an object');
      const id = q.id;
      if (!isQuestionId(id)) return err(`questions[${i}]`, `invalid question id: ${String(id)}`);
      if (questionIds.has(id)) err(id, 'duplicate question id');
      questionIds.add(id);
      if (typeof q.text_ja !== 'string' || q.text_ja.length === 0) err(id, 'text_ja must be a non-empty string');
      const groupsOf: string[] = [];
      for (const c of ['A', 'B'] as const) {
        const ch = q[c];
        if (!isObj(ch)) return err(id, `choice ${c} is not an object`);
        if (typeof ch.text_ja !== 'string' || ch.text_ja.length === 0) err(id, `choice ${c} text_ja must be a non-empty string`);
        if (typeof ch.group !== 'string' || !groupIds.has(ch.group)) err(id, `choice ${c} group does not exist: ${String(ch.group)}`);
        else groupsOf.push(ch.group);
      }
      if (groupsOf.length === 2 && groupsOf[0] === groupsOf[1]) err(id, 'choices A and B must use different effect groups');
    });
  }

  // ---- series refs of effects need the series list; checked in validateOperation ----
  return errors;
}

function rangeOf(limits: Record<string, unknown>, key: string): { min: number; max: number } | null {
  const r = limits[key];
  return isObj(r) && isFiniteNum(r.min) && isFiniteNum(r.max) ? { min: r.min, max: r.max } : null;
}

const MULT_FIELDS: Readonly<Record<string, string>> = {
  damageMult: 'damagePushMult',
  pushMult: 'damagePushMult',
  speedMult: 'speedMult',
  gravityMult: 'gravityMult',
  restitutionMult: 'restitutionMult',
  swayMult: 'swayMult',
  loadPeriodMult: 'loadPeriodMult',
  radiusMult: 'radiusMult',
  splitSpreadMult: 'splitSpreadMult',
};

function validateOperation(
  id: string,
  op: unknown,
  limits: Record<string, unknown> | null,
  seriesIds: ReadonlySet<string>,
  err: (targetId: string, reason: string) => void,
): void {
  if (!isObj(op)) return err(id, 'operation is not an object');
  const kind = op.kind;
  if (typeof kind !== 'string' || !(EFFECT_OPERATION_KINDS as readonly string[]).includes(kind)) return err(id, `unknown operation kind: ${String(kind)}`);
  switch (kind) {
    case 'ammoAdd':
    case 'ammoRemove':
      if (op.amount !== 1 && op.amount !== 2 && op.amount !== 3) err(id, 'amount must be 1, 2 or 3');
      return;
    case 'seriesAssortment':
    case 'seriesOutline':
      if (typeof op.seriesId !== 'string' || !seriesIds.has(op.seriesId)) err(id, `series does not exist: ${String(op.seriesId)}`);
      return;
    case 'hint':
      if (typeof op.hint !== 'string' || !(HINT_KINDS as readonly string[]).includes(op.hint)) err(id, `unknown hint: ${String(op.hint)}`);
      return;
    case 'shotModifiers': {
      const set = op.set;
      if (!isObj(set)) return err(id, 'set is not an object');
      const keys = Object.keys(set);
      if (keys.length === 0) err(id, 'set must change at least one field');
      for (const k of keys) {
        const v = set[k];
        if (k in MULT_FIELDS) {
          if (!isFiniteNum(v)) {
            err(id, `${k} must be a finite number`);
            continue;
          }
          const r = limits ? rangeOf(limits, MULT_FIELDS[k]!) : null;
          if (r && (v < r.min || v > r.max)) err(id, `${k}=${v} is outside the profile range ${r.min}..${r.max}`);
        } else if (k === 'bulletType') {
          if (v !== null && !BULLET_TYPES.includes(v as string)) err(id, `unknown bulletType: ${String(v)}`);
        } else if (k === 'extraReflections') {
          if (!Number.isInteger(v)) err(id, 'extraReflections must be an integer');
          else if (limits) {
            const r = rangeOf(limits, 'reflections');
            if (r && Math.abs(v as number) > r.max - r.min) err(id, `extraReflections=${String(v)} is outside +-${r.max - r.min}`);
          }
        } else if (k === 'launch') {
          const l = v;
          if (!isObj(l) || (l.count !== 1 && l.count !== 2 && l.count !== 3) || !isFiniteNum(l.spreadRad) || l.spreadRad < 0 || l.spreadRad > 0.5) err(id, 'launch must be {count: 1|2|3, spreadRad: 0..0.5}');
        } else err(id, `unknown shot modifier field: ${k}`);
      }
      return;
    }
    case 'resetShotModifiers':
    case 'transformCopyType':
    case 'transformRevert':
    case 'transformToLastCollected':
      return;
  }
}
