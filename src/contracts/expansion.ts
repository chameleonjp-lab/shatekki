/**
 * Expanded gameplay contract (D34-D37, plan EG01, owner: Opus).
 *
 * Everything here is used only by a GameplayBundle whose `expansion` is not
 * null. The default bundle (official-v1, rules-v1) has `expansion: null` and
 * keeps the old 9-slot / three-prize-set behaviour unchanged.
 *
 * Effects are data, never code: each EffectDef carries one EffectOperation
 * from a closed vocabulary, and src/core decides what an operation does.
 * All values from the appendices are proposals (試作) until the user adopts
 * them (open items C01-C05); `valueStatus` records that.
 */
import type { BackgroundCellId, BarrierId, DeviceId, EffectGroupId, EffectId, EffectRequestId, PrizeInstanceId, PrizeTypeId, QuestionId, RunId, SeriesId, SetId, ShotId } from './ids';
import type { Vec3 } from './geometry';
import type { RuntimeCatalog, ValueStatus } from './catalog';
import type { BoothLayout, DeviceKind, ShopkeeperPart } from './layout';
import type { BulletType } from './events';
import type { PrizeInstanceState, TuningConfig } from './game';

// ------------------------------------------------------------------ bundle

/** Selection name of a rule bundle. Not a save/rules version: saves use catalog.rulesVersion. */
export type GameplayBundleKey = 'official-v1' | 'expanded-proposed';
export const GAMEPLAY_BUNDLE_KEYS: readonly GameplayBundleKey[] = ['official-v1', 'expanded-proposed'];
/** The bundle every public entry point uses unless a build-time switch for internal testing says otherwise. */
export const DEFAULT_GAMEPLAY_BUNDLE_KEY: GameplayBundleKey = 'official-v1';

/** One consistent set of rules handed to start, restore, physics, view and persistence alike. */
export interface GameplayBundle {
  readonly key: GameplayBundleKey;
  readonly catalog: RuntimeCatalog;
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  /** null for official-v1 (no questions, cells, series or pair sets). */
  readonly expansion: ExpansionCatalog | null;
}

// ------------------------------------------------------------- definitions

export type QuestionChoice = 'A' | 'B';
export const QUESTION_CHOICES: readonly QuestionChoice[] = ['A', 'B'];

export interface QuestionChoiceDef {
  /** The lottery group drawn from when this choice is picked. A and B never share a group. */
  readonly groupId: EffectGroupId;
  /** i18n key of the choice wording. */
  readonly textKey: string;
}

export interface QuestionDef {
  readonly questionId: QuestionId;
  /** i18n key of the question wording. */
  readonly textKey: string;
  readonly choices: Readonly<Record<QuestionChoice, QuestionChoiceDef>>;
}

export interface EffectGroupDef {
  readonly groupId: EffectGroupId;
  /** Registered candidates in FX order. Applicability is checked at answer time. */
  readonly effectIds: readonly EffectId[];
  /** i18n key of the short description shown next to a choice (e.g. "good or bad"). */
  readonly labelKey: string;
}

export interface SeriesDef {
  readonly seriesId: SeriesId;
  /** Distinct member kinds (≥ 3), in P-number order. A kind may belong to several series. */
  readonly typeIds: readonly PrizeTypeId[];
  /** Outline colour proposal, "#RRGGBB". Always shown together with the symbol and label. */
  readonly color: string;
  readonly symbolKey: string;
  readonly labelKey: string;
}

/** Next-shot hint shown on top of the normal HUD (FX093-FX100). One at a time; the latest wins. */
export type HintKind =
  | 'hpRatio' // FX093
  | 'oneMissing' // FX094
  | 'notCollectedThisRun' // FX095
  | 'duplicates' // FX096
  | 'motionPeriod' // FX097
  | 'aimPreview' // FX098
  | 'trajectory' // FX099
  | 'angleTicks'; // FX100
export const HINT_KINDS: readonly HintKind[] = ['hpRatio', 'oneMissing', 'notCollectedThisRun', 'duplicates', 'motionPeriod', 'aimPreview', 'trajectory', 'angleTicks'];

export type LaunchCount = 1 | 2 | 3;

/**
 * Bullet settings for one shot (the original cork and every split child use
 * the same values). Multipliers are relative to the normal computation;
 * 1 / 0 / null mean "unchanged".
 */
export interface ShotModifiers {
  /** null = keep the run's current bullet type. */
  readonly bulletType: BulletType | null;
  readonly damageMult: number;
  readonly pushMult: number;
  readonly speedMult: number;
  readonly gravityMult: number;
  readonly restitutionMult: number;
  readonly swayMult: number;
  readonly loadPeriodMult: number;
  readonly radiusMult: number;
  readonly splitSpreadMult: number;
  /** Added to the reflection limit (base + bullet type), then clamped to the profile range. */
  readonly extraReflections: number;
  /** Corks created at the muzzle. 2/3 corks share the damage and push of one. */
  readonly launch: { readonly count: LaunchCount; readonly spreadRad: number };
}

export const BASE_SHOT_MODIFIERS: ShotModifiers = Object.freeze({
  bulletType: null,
  damageMult: 1,
  pushMult: 1,
  speedMult: 1,
  gravityMult: 1,
  restitutionMult: 1,
  swayMult: 1,
  loadPeriodMult: 1,
  radiusMult: 1,
  splitSpreadMult: 1,
  extraReflections: 0,
  launch: Object.freeze({ count: 1 as LaunchCount, spreadRad: 0 }),
});

/** Fields an effect overwrites. Fields it does not name keep their reserved value (last one wins per field). */
export type ShotModifierPatch = { readonly [K in keyof ShotModifiers]?: ShotModifiers[K] };

/** Closed vocabulary of what an effect may do. Unknown kinds are rejected by validation. */
export type EffectOperation =
  | { readonly kind: 'ammoAdd'; readonly amount: 1 | 2 | 3 }
  /** Applies only when ammo ≥ 2 just before; keeps at least 1. */
  | { readonly kind: 'ammoRemove'; readonly amount: 1 | 2 | 3 }
  | { readonly kind: 'shotModifiers'; readonly set: ShotModifierPatch }
  /** FX082: every reserved bullet setting back to BASE_SHOT_MODIFIERS with standard bullets. */
  | { readonly kind: 'resetShotModifiers' }
  /** FX041-FX060: change every uncollected prize into the series and refill from it afterwards. */
  | { readonly kind: 'seriesAssortment'; readonly seriesId: SeriesId }
  /** FX061-FX080: outline the series (kept separately from the assortment series). */
  | { readonly kind: 'seriesOutline'; readonly seriesId: SeriesId }
  | { readonly kind: 'transformCopyType' } // FX090
  | { readonly kind: 'transformRevert' } // FX091
  | { readonly kind: 'transformToLastCollected' } // FX092
  | { readonly kind: 'hint'; readonly hint: HintKind };
export type EffectOperationKind = EffectOperation['kind'];
export const EFFECT_OPERATION_KINDS: readonly EffectOperationKind[] = [
  'ammoAdd',
  'ammoRemove',
  'shotModifiers',
  'resetShotModifiers',
  'seriesAssortment',
  'seriesOutline',
  'transformCopyType',
  'transformRevert',
  'transformToLastCollected',
  'hint',
];

/** When an effect starts to act. Both are planned at the post-flight point; 'nextShot' is reserved. */
export type EffectTiming = 'afterFlight' | 'nextShot';

export interface EffectDef {
  readonly effectId: EffectId;
  readonly operation: EffectOperation;
  readonly timing: EffectTiming;
  /** i18n keys: short name, and the result line shown after it was applied. */
  readonly nameKey: string;
  readonly resultKey: string;
  readonly valueStatus: ValueStatus;
}

/** Proposed limits for the new multipliers (effects appendix §3.2). All prototype until adopted. */
export interface ExpansionLimits {
  readonly damagePushMult: { readonly min: number; readonly max: number };
  /** min(maxPowerMultiplier, power plate × new multiplier). */
  readonly maxPowerMultiplier: number;
  readonly speedMult: { readonly min: number; readonly max: number };
  readonly gravityMult: { readonly min: number; readonly max: number };
  readonly restitutionMult: { readonly min: number; readonly max: number };
  readonly swayMult: { readonly min: number; readonly max: number };
  /** The sway amplitude after the multiplier is still clamped to this (rad). */
  readonly maxSwayAmplitudeRad: number;
  readonly loadPeriodMult: { readonly min: number; readonly max: number };
  readonly radiusMult: { readonly min: number; readonly max: number };
  readonly reflections: { readonly min: number; readonly max: number };
  readonly splitSpreadMult: { readonly min: number; readonly max: number };
}

export interface ExpansionProfile {
  /** e.g. "rules-v2-proposed-r001". Bumped whenever points, sets, effects, odds or save compatibility change. */
  readonly rulesVersion: string;
  readonly valueStatus: ValueStatus;
  readonly slotCount: 36;
  readonly cellCount: 36;
  readonly pairSetBonusScore: number;
  readonly tierTargets: Readonly<Record<'easy' | 'normal' | 'hard', number>>;
  readonly limits: ExpansionLimits;
}

/** The checked definitions added on top of the 100 prizes. Built by src/catalog/expanded-config.ts. */
export interface ExpansionCatalog {
  readonly profile: ExpansionProfile;
  /** PAIR001..PAIR300 in id order; their SetRuntimeConfig lives in the bundle's catalog.sets. */
  readonly pairSetIds: readonly SetId[];
  readonly questions: ReadonlyMap<QuestionId, QuestionDef>;
  readonly groups: ReadonlyMap<EffectGroupId, EffectGroupDef>;
  readonly effects: ReadonlyMap<EffectId, EffectDef>;
  readonly series: ReadonlyMap<SeriesId, SeriesDef>;
}

/** Counts per value status across the added definitions (to show that "approved v1" ≠ "approved expansion"). */
export interface ExpansionStatusSummary {
  readonly overall: ValueStatus;
  readonly counts: Readonly<Record<ValueStatus, number>>;
}

// ------------------------------------------------------------- run state

export interface BackgroundCellState {
  readonly cellId: BackgroundCellId;
  /** Drawn at run start, uniformly from the 100 effects, independently per cell. Hidden until used. */
  readonly effectId: EffectId;
  readonly used: boolean;
  readonly usedOnShot: ShotId | null;
  readonly requestId: EffectRequestId | null;
}

/** A transform that could not be applied because the new shape would overlap; rechecked after the next shot. */
export interface DeferredTransform {
  readonly instanceId: PrizeInstanceId;
  readonly requestId: EffectRequestId;
  /** Fixed candidate order drawn once when first planned; never redrawn on recheck. */
  readonly candidateTypeIds: readonly PrizeTypeId[];
}

/** Settings fixed for one shot: what was reserved before FIRE and is used by that shot only. */
export interface ShotReservation {
  readonly modifiers: ShotModifiers;
  readonly hint: HintKind | null;
}

export interface ExpansionRngState {
  /** Independent PRNG states per source, so redraw/recheck/view code never shifts another stream. */
  readonly cells: readonly [number, number, number, number];
  readonly questions: readonly [number, number, number, number];
  readonly effects: readonly [number, number, number, number];
}

export interface ExpansionRunState {
  /** Exactly 36, in row/column order (cell-r1-c01 … cell-r3-c12). */
  readonly cells: readonly BackgroundCellState[];
  /** The 200 questions shuffled at run start. */
  readonly questionOrder: readonly QuestionId[];
  /** Index of the next question to ask. */
  readonly questionCursor: number;
  /** Reserved for the next FIRE. Moved into `active` when FIRE is accepted. */
  readonly next: ShotReservation;
  /** Used by the shot now in flight; null between shots. */
  readonly active: ShotReservation | null;
  readonly assortmentSeries: SeriesId | null;
  readonly outlineSeries: SeriesId | null;
  /** At most one per instance; a newer valid request overwrites it; removed when collected. */
  readonly deferredTransforms: readonly DeferredTransform[];
  readonly rng: ExpansionRngState;
}

// --------------------------------------------- flight-end barrier and plan

/** Where an effect request came from. */
export type EffectSource =
  | { readonly kind: 'carryOver' } // recheck of a deferred transform
  | { readonly kind: 'device'; readonly deviceId: DeviceId; readonly deviceKind: DeviceKind }
  | { readonly kind: 'cell'; readonly cellId: BackgroundCellId }
  | { readonly kind: 'answer'; readonly questionId: QuestionId; readonly choice: QuestionChoice };

/**
 * One request to apply something after the flight, applied at most once.
 * Sorted by (simTimeSec, contactOrder, targetId); carry-overs first, the answer last.
 */
export interface EffectRequest {
  readonly requestId: EffectRequestId;
  readonly source: EffectSource;
  readonly simTimeSec: number;
  /** Order inside one fixed step, from the sim's stable contact ordering. */
  readonly contactOrder: number;
  /** Cell id / device id / instance id the contact touched, for the final tie-break. */
  readonly targetId: string;
  /** Known for cells (pre-assigned) and answers (drawn at answer time); null for legacy device kinds. */
  readonly effectId: EffectId | null;
}

export interface PrizeMotionState {
  readonly instanceId: PrizeInstanceId;
  readonly linvel: Vec3;
  readonly angvel: Vec3;
}

/** The sim stopped at the fixed step where the last cork disappeared. Nothing was finalized yet. */
export interface FlightBarrier {
  readonly runId: RunId;
  readonly shotId: ShotId;
  readonly barrierId: BarrierId;
  /** Device (post-flight kinds) and cell contacts, in stable order. */
  readonly requests: readonly EffectRequest[];
  /** True when any cork touched a shopkeeper part in this shot (prize contacts do not count). */
  readonly shopkeeperHit: boolean;
  readonly shopkeeperParts: readonly ShopkeeperPart[];
  readonly collectedDuringFlight: readonly { readonly instanceId: PrizeInstanceId; readonly typeId: PrizeTypeId }[];
  /** Every uncollected prize: pose, HP, mount, as of the barrier. */
  readonly prizes: readonly PrizeInstanceState[];
  readonly motion: readonly PrizeMotionState[];
  readonly simTimeSec: number;
}

/** A transform to apply when the sim resumes: the first fitting candidate wins, otherwise deferred. */
export interface TransformIntent {
  readonly instanceId: PrizeInstanceId;
  readonly requestId: EffectRequestId;
  readonly candidateTypeIds: readonly PrizeTypeId[];
}

export type PlannedOutcome = 'applied' | 'notApplicable';

export interface PlannedEffect {
  readonly requestId: EffectRequestId;
  readonly source: EffectSource;
  readonly effectId: EffectId | null;
  readonly outcome: PlannedOutcome;
  /** Why it did not apply (e.g. "ammoAtMostOne", "noTarget", "noApplicableEffect"). */
  readonly reason: string | null;
  /** Real ammo change after caps (+ added, − removed, 0). */
  readonly ammoDelta: number;
  /**
   * Ammo grants only (legacy "+2" plate, FX ammo adds): the amount asked for before the caps.
   * Lets the result tell "+1 of 2" and "0 at the cap" apart from "cannot be used". Absent otherwise
   * and in saves made before it existed.
   */
  readonly ammoRequested?: number;
  readonly targets: readonly PrizeInstanceId[];
}

/** Provisional result of the plan. resolveShot alone turns it into the confirmed state. */
export interface EffectProjection {
  readonly ammo: number;
  readonly bonusAmmoTotal: number;
  readonly ammoLostTotal: number;
  readonly bulletType: BulletType;
  readonly next: ShotReservation;
  readonly assortmentSeries: SeriesId | null;
  readonly outlineSeries: SeriesId | null;
  /** Legacy penalty plate points to put in the ledger once. */
  readonly penaltyPoints: number;
}

export interface PendingQuestion {
  readonly questionId: QuestionId;
  /** Index into questionOrder that this question consumed. */
  readonly cursor: number;
  readonly answer: QuestionChoice | null;
}

export interface EffectPlan {
  readonly barrierId: BarrierId;
  readonly shotId: ShotId;
  readonly processed: readonly PlannedEffect[];
  readonly transforms: readonly TransformIntent[];
  readonly question: PendingQuestion | null;
  readonly rng: ExpansionRngState;
  readonly projection: EffectProjection;
  /** True once nothing else may be added (no question, or the answer was planned). */
  readonly complete: boolean;
}

/** The only answer command. Extra fields (effect id, points, target) are rejected by parseCommand. */
export interface AnswerShopkeeperCommand {
  readonly type: 'ANSWER_SHOPKEEPER';
  readonly shotId: ShotId;
  readonly questionId: QuestionId;
  readonly choice: QuestionChoice;
}

/** What the sim reports back for each intent after resuming. */
export interface AppliedTransform {
  readonly instanceId: PrizeInstanceId;
  readonly requestId: EffectRequestId;
  readonly fromTypeId: PrizeTypeId;
  readonly toTypeId: PrizeTypeId;
}
