/**
 * Catalog contract (Task 02, owner: Opus).
 *
 * Two layers are kept apart on purpose:
 *  1. Candidate data (data/catalog-candidates.json): names and set
 *     combinations taken from the source document. `null` there means
 *     "not decided", never 0 HP / 0 points.
 *  2. Runtime config (src/catalog/runtime-config.ts, Task 13): every value the
 *     game needs to run, each marked with a ValueStatus. Prototype values must
 *     not be sent to the official ranking (plan §"試作値").
 */
import type { PrizeTypeId, SetId } from './ids';
import type { Vec3 } from './geometry';

// ---------------------------------------------------------------- candidates

export interface PrizeCandidate {
  readonly id: string;
  readonly name_ja: string;
  readonly status: string;
  readonly hit_points: number | null;
  readonly base_score: number | null;
  readonly mass: number | null;
  readonly model: string | null;
}

export interface SetCandidate {
  readonly id: string;
  readonly name_ja: string;
  readonly category_ja: string;
  readonly status: string;
  readonly required_prize_ids: readonly string[];
  readonly required_count_each: number;
  readonly bonus_score: number | null;
  readonly hint_ja: string | null;
}

export interface CandidateCatalog {
  readonly document_version: string;
  readonly status: string;
  readonly prizes: readonly PrizeCandidate[];
  readonly sets: readonly SetCandidate[];
}

export interface CatalogValidationError {
  /** Offending prize/set id, or "$" for the document itself. */
  readonly targetId: string;
  readonly reason: string;
}

export interface CatalogValidationResult {
  readonly valid: boolean;
  readonly errors: readonly CatalogValidationError[];
  /** Present only when valid. Narrowed from unknown input. */
  readonly catalog?: CandidateCatalog;
}

// ------------------------------------------------------------------- runtime

/**
 * prototype: chosen for play-testing by Claude (試作). Not for official ranking.
 * proposed:  recommended to the user with evidence (handoff to ChatGPT), awaiting approval.
 * approved:  the user adopted it (recorded in docs/decision-log.md or a later record).
 */
export type ValueStatus = 'prototype' | 'proposed' | 'approved';

export type PrizeMaterial = 'paper' | 'plastic' | 'wood' | 'cloth' | 'metal' | 'glass' | 'ceramic' | 'rubber';
export type DifficultyTier = 'easy' | 'normal' | 'hard';

/** Physics shape of a prize, centered on its center of volume. Bottom of the shape = -half height. */
export type CollisionShape =
  | { readonly kind: 'box'; readonly halfExtents: Vec3 }
  | { readonly kind: 'cylinder'; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: 'capsule'; readonly radius: number; readonly halfHeight: number }
  | { readonly kind: 'ball'; readonly radius: number };

/** Periodic motion while the prize is mounted (decision 10). Driven by the sim, never by the view. */
export type MotionSpec =
  | { readonly type: 'none' }
  | { readonly type: 'slide'; readonly amplitude: number; readonly periodSec: number }
  | { readonly type: 'spin'; readonly periodSec: number }
  | { readonly type: 'swing'; readonly amplitudeRad: number; readonly periodSec: number }
  | { readonly type: 'bob'; readonly amplitude: number; readonly periodSec: number };

export interface PrizeRuntimeConfig {
  readonly typeId: PrizeTypeId;
  readonly shape: CollisionShape;
  readonly massKg: number;
  /** Center-of-mass offset from the shape center (higher = topples easier). */
  readonly centerOfMass: Vec3;
  readonly friction: number;
  readonly restitution: number;
  /** Maximum durability. HP 0 makes it easier to topple; it does NOT collect it (decision 06). */
  readonly maxHp: number;
  readonly baseScore: number;
  readonly material: PrizeMaterial;
  readonly difficulty: DifficultyTier;
  readonly motion: MotionSpec;
  /** Visual archetype key used by src/view (no gameplay meaning). */
  readonly modelKey: string;
  readonly valueStatus: ValueStatus;
}

export interface SetRuntimeConfig {
  readonly setId: SetId;
  /**
   * Distinct prize types, each needed once: three for S001-S100 (decision 11),
   * two for the expanded PAIR001-PAIR300 (D34).
   */
  readonly requiredTypeIds: readonly [PrizeTypeId, PrizeTypeId] | readonly [PrizeTypeId, PrizeTypeId, PrizeTypeId];
  readonly bonusScore: number;
  /** i18n key of the hint shown while undiscovered (decision 15). */
  readonly hintKey: string;
  readonly valueStatus: ValueStatus;
}

export interface RuntimeCatalog {
  /** Identifies the rule/value set. Changes whenever any score-relevant value changes. */
  readonly rulesVersion: string;
  readonly prizes: ReadonlyMap<PrizeTypeId, PrizeRuntimeConfig>;
  readonly sets: ReadonlyMap<SetId, SetRuntimeConfig>;
}

/** Lowest status across all values; 'prototype' if any value is prototype. */
export function catalogValueStatus(c: RuntimeCatalog): ValueStatus {
  const order: Record<ValueStatus, number> = { prototype: 0, proposed: 1, approved: 2 };
  let min: ValueStatus = 'approved';
  for (const p of c.prizes.values()) if (order[p.valueStatus] < order[min]) min = p.valueStatus;
  for (const s of c.sets.values()) if (order[s.valueStatus] < order[min]) min = s.valueStatus;
  return min;
}
