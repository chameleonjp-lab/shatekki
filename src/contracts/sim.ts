/**
 * Contract between the physics world (src/sim, Game) and the run logic
 * (src/core, Game) and the app loop (src/app.ts, Opus).
 *
 * Shot pipeline (plan "先に守る処理順"):
 *   FIRE accepted & ammo consumed (core) → flight/contacts (sim) → flight ends
 *   → reserved transforms applied (sim, decision 32) → falls judged incl. the
 *   transformed prizes (sim) → finite fall grace if a limit was hit (sim,
 *   decision 33) → ShotRecord → resolveShot (core): ledger, sets, ammo, end
 *   check → replenish only if continuing (core) → checkpoint (persistence).
 */
import type { BackgroundCellId, BarrierId, DeviceId, PrizeInstanceId, PrizeTypeId, ProjectileId, RunId, ShotId } from './ids';
import type { AppliedTransform, DeferredTransform, EffectPlan, FlightBarrier, ShotModifiers } from './expansion';
import type { AimPreview } from './aim';
import type { DeviceKind, ShopkeeperPart } from './layout';
import type { BulletType, PrizeTransformedEvent, SimulationFrame } from './events';
import type { PrizeInstanceState, ShelfState, ShotRequest } from './game';

/** One cork's touch on a prize, kept for trick classification. */
export interface PrizeHitRecord {
  readonly projectileId: ProjectileId;
  readonly generation: number;
  readonly reflectionIndex: number;
  readonly damage: number;
}

export interface PrizeOutcome {
  readonly instanceId: PrizeInstanceId;
  readonly typeId: PrizeTypeId;
  readonly hits: readonly PrizeHitRecord[];
  readonly collected: boolean;
  /** Horizontal distance moved during the shot (m). For "惜しい" classification only. */
  readonly displacement: number;
  /** Ended uncollected with its center within a few cm of a board edge. For "惜しい" only. */
  readonly endedNearEdge: boolean;
}

export type FirstHitKey = `shopkeeper:${ShopkeeperPart}` | `hidden:${string}`;

export interface DeviceActivation {
  readonly deviceId: DeviceId;
  readonly kind: DeviceKind;
  readonly projectileId: ProjectileId;
}

/** Everything the sim observed in one shot. Contains no points; core turns it into a ledger. */
export interface ShotRecord {
  readonly runId: RunId;
  readonly shotId: ShotId;
  /** Collected in this shot, in collection order. Each instance at most once. */
  readonly collected: readonly { readonly instanceId: PrizeInstanceId; readonly typeId: PrizeTypeId }[];
  readonly prizeOutcomes: readonly PrizeOutcome[];
  /** Each device at most once per shot across the original and split corks (decision 31). */
  readonly deviceActivations: readonly DeviceActivation[];
  /** Every shopkeeper/hidden contact this shot (repeats included); core scores only the first per run. */
  readonly firstHitCandidates: readonly FirstHitKey[];
  readonly transforms: readonly PrizeTransformedEvent[];
  readonly endedByLimit: boolean;
  /** Uncollected prizes after the shot settled: poses, HP, mount state. */
  readonly remainingPrizes: readonly PrizeInstanceState[];
  readonly simTimeSec: number;
  /** Expanded rules: the barrier this record resumed from, and what the plan really changed. */
  readonly barrierId?: BarrierId;
  readonly appliedTransforms?: readonly AppliedTransform[];
  /** Intents whose candidates all overlapped; kept for the next post-flight point. */
  readonly deferredTransforms?: readonly DeferredTransform[];
}

export interface SimulationStep {
  readonly frame: SimulationFrame;
  /** Set once, on the step where the shot finished. */
  readonly record: ShotRecord | null;
  /**
   * Expanded rules: set once, on the fixed step where the last cork
   * disappeared. The world then stays frozen (no prize/motion/clock advance)
   * until resumeAfterEffects accepts the plan. Always null for rules-v1.
   */
  readonly barrier: FlightBarrier | null;
}

/** Supplied by core so that the transform choice uses run rules, not the view (O08). */
export type TransformChooser = (candidates: readonly PrizeInstanceState[]) => { readonly instanceId: PrizeInstanceId; readonly toTypeId: PrizeTypeId } | null;

export interface ShotContext {
  readonly runId: RunId;
  readonly chooseTransform: TransformChooser;
  /** Expanded rules only. Absent = rules-v1 pipeline (no barrier). */
  readonly expanded?: {
    /** Fixed at FIRE for the original and every split cork. */
    readonly modifiers: ShotModifiers;
    /** Cells not used yet this run; contacts with other cells are plain reflections. */
    readonly usableCells: readonly BackgroundCellId[];
  };
}

/**
 * The physics world. Not serializable; rebuild it from ShelfState after a
 * reload. The view reads frames only.
 */
export interface ShotWorld {
  /** Replace all prizes with the given shelf state (initial load, restore, after replenish). */
  syncShelf(shelf: ShelfState, motionSec: number): void;
  /** Start a shot. Throws if a shot is already in progress. */
  fire(request: ShotRequest, context: ShotContext): void;
  /** Advance by dtSec using fixed internal steps. Between shots only mounted prizes move. */
  step(dtSec: number): SimulationStep;
  /** Current frame without advancing time. */
  frame(): SimulationFrame;
  /**
   * Expanded rules: accept the plan for the barrier the world is frozen at,
   * once. Applies the final transforms (overlaps deferred) and resumes the
   * falls. Returns false (and changes nothing) for a different shot/barrier,
   * an incomplete plan, or a plan already accepted.
   */
  resumeAfterEffects(plan: EffectPlan): boolean;
  /**
   * FX098: read-only first-contact estimate with the current scene and the
   * given modifiers (≤ maxFlightSec). Must not change bodies, RNG, requests or score.
   */
  previewFirstContact(request: ShotRequest, modifiers: ShotModifiers): AimPreview;
  readonly shotInProgress: boolean;
  dispose(): void;
}

export type { BulletType };
