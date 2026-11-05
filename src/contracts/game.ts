/**
 * Game state & command contract (Task 02, owner: Opus).
 *
 * RunState is plain serializable data (no class instances, no Maps) so the
 * confirmed state between shots can be checkpointed (decision 24) and compared
 * in tests. Physics bodies live in src/sim and are rebuilt from RunState.
 */
import type { PrizeInstanceId, PrizeTypeId, RunId, SetId, ShotId, SlotId, DeviceId } from './ids';
import type { Pose, Vec3 } from './geometry';
import type { BulletType, CollectedPrize, ScoreLedgerEntry } from './events';
import type { ShopkeeperPart } from './layout';
import type { ValueStatus } from './catalog';

export const RUN_STATE_SCHEMA_VERSION = 1;

// ------------------------------------------------------------------ tuning

/** Loading (装填) quality tiers. Values are prototype (O09). */
export type LoadTier = 'perfect' | 'good' | 'normal' | 'weak';

export interface LoadTierSpec {
  readonly tier: LoadTier;
  /** Max |barValue - sweetSpot| for this tier (checked in order perfect → weak). */
  readonly maxDistance: number;
  readonly damageMultiplier: number;
  readonly pushMultiplier: number;
}

/**
 * Every tunable number in one place. All prototype unless the user approves
 * (open items O03, O05, O07, O08, O09, O12). Tests may pass their own values.
 */
export interface TuningConfig {
  readonly valueStatus: ValueStatus;
  readonly initialAmmo: number; // decided: 10
  readonly maxBonusAmmoTotal: number; // decided: 10
  readonly shelfSlotCount: number; // decided: 9
  readonly loading: {
    readonly barPeriodSec: number;
    readonly sweetSpot: number;
    readonly tiers: readonly LoadTierSpec[];
  };
  readonly aim: {
    /** Seconds after aiming starts before the sway begins to grow. */
    readonly calmSec: number;
    readonly baseAmplitudeRad: number;
    readonly growthRadPerSec: number;
    readonly maxAmplitudeRad: number;
    readonly bpmStart: number;
    readonly bpmMax: number;
    readonly bpmRisePerSec: number;
  };
  readonly cork: {
    readonly radius: number;
    readonly massKg: number;
    readonly speed: number;
    readonly baseDamage: number;
    /** Impulse (N·s) given to a prize per unit push multiplier. */
    readonly baseImpulse: number;
    readonly restitution: number;
    readonly gravityScale: number;
  };
  readonly bulletTypes: Readonly<Record<BulletType, { readonly damage: number; readonly push: number; readonly speed: number; readonly restitution: number; readonly extraReflections: number }>>;
  readonly limits: {
    readonly maxReflectionsPerCork: number;
    readonly maxSplitGeneration: number;
    readonly maxSimultaneousCorks: number;
    readonly maxFlightSec: number;
    /** decision 33: finite grace for prizes already falling when a limit is hit. Never re-extended. */
    readonly fallGraceSec: number;
    readonly settleLinearSpeed: number;
    readonly settleAngularSpeed: number;
    readonly settleHoldSec: number;
    readonly maxSettleSec: number;
    readonly fixedStepSec: number;
  };
  readonly devices: {
    readonly splitSpreadRad: number;
    readonly powerMultiplier: number;
    readonly penaltyPoints: number;
    readonly ammoBonus: number; // decided: +2
    readonly bulletTypeCycle: readonly BulletType[];
  };
  readonly hpZero: {
    /** When HP is 0, pushes are multiplied by this (倒れやすくなる, decision 06). */
    readonly pushMultiplier: number;
    readonly frictionMultiplier: number;
  };
  readonly scoring: {
    readonly shopkeeperPoints: Readonly<Record<ShopkeeperPart, number>>;
    readonly hiddenTargetPoints: number;
    /** Trick bonuses (O03). Chain = per extra prize collected in the same shot. */
    readonly chainBonusPerExtraPrize: number;
    readonly reflectionCollectBonus: number;
    readonly splitCollectBonus: number;
  };
  readonly draw: {
    /** How many recent draws reduce the weight of the same kind (O05). */
    readonly historyWindow: number;
    /** Weight multiplier for a kind drawn within the window (0 < x < 1, never 0). */
    readonly recentPenalty: number;
    /** Target count of each difficulty tier among the 9 visible prizes. */
    readonly tierTargets: Readonly<Record<'easy' | 'normal' | 'hard', number>>;
  };
}

// ------------------------------------------------------------------- state

export type Phase =
  | 'position' // 立ち位置を選ぶ
  | 'loading' // 弾を込める (moving bar)
  | 'aiming' // 狙う (sway)
  | 'resolving' // 撃った後: flight / contact / transform / falls (no player input except pause)
  | 'ended' // last shot settled with 0 ammo
  | 'abandoned'; // decision 27: the in-flight shot was lost by reload; never ranked

export type PauseReason = 'hidden' | 'landscape' | 'manual';

export interface LoadResult {
  readonly barValue: number; // 0..1, computed by the core from its own clock
  readonly tier: LoadTier;
  readonly damageMultiplier: number;
  readonly pushMultiplier: number;
}

export interface AimAngles {
  readonly yaw: number;
  readonly pitch: number;
}

export interface PrizeInstanceState {
  readonly instanceId: PrizeInstanceId;
  /** Current kind (may differ from the drawn kind after a transform). */
  readonly typeId: PrizeTypeId;
  readonly drawnTypeId: PrizeTypeId;
  readonly homeSlot: SlotId;
  readonly hp: number;
  readonly maxHp: number;
  readonly pose: Pose;
  /** True while held by its periodic mount (cannot fall by itself, AC13). */
  readonly mounted: boolean;
  readonly collected: boolean;
}

export interface ShelfState {
  /** Uncollected prizes currently in the booth (≤ 9). Collected ones are removed after settlement. */
  readonly prizes: readonly PrizeInstanceState[];
  /** Slots whose prize was collected but whose refill is postponed because they are blocked (decision 30). */
  readonly deferredSlots: readonly SlotId[];
  readonly nextInstanceNumber: number;
}

export interface DrawState {
  /** PRNG state words (serializable). */
  readonly rng: readonly [number, number, number, number];
  /** Most recent drawn kinds, newest last. */
  readonly history: readonly PrizeTypeId[];
  readonly drawCount: number;
}

/**
 * Written at FIRE before the sim runs; cleared at settlement. If a checkpoint
 * with this marker is found on reload, the run is abandoned (decision 27).
 */
export interface InFlightMarker {
  readonly shotId: ShotId;
  /** 1-based number of this shot among fired shots. */
  readonly shotNumber: number;
  readonly request: ShotRequest;
}

export interface RunState {
  readonly schemaVersion: typeof RUN_STATE_SCHEMA_VERSION;
  readonly runId: RunId;
  readonly rulesVersion: string;
  readonly valueStatus: ValueStatus;
  readonly phase: Phase;
  /** Set semantics, sorted. Paused iff non-empty. */
  readonly pauseReasons: readonly PauseReason[];
  /** 所持弾 */
  readonly ammo: number;
  /** 追加累計 (≤ maxBonusAmmoTotal) */
  readonly bonusAmmoTotal: number;
  /** 発射回数 (≤ initialAmmo + maxBonusAmmoTotal) */
  readonly shotsFired: number;
  /** Confirmed cumulative score, never negative. */
  readonly score: number;
  readonly ledger: readonly ScoreLedgerEntry[];
  readonly collected: readonly CollectedPrize[];
  /** Distinct kinds collected this run (sets use these, decision 12/13). */
  readonly collectedTypeIds: readonly PrizeTypeId[];
  readonly completedSets: readonly SetId[];
  /** Shopkeeper parts / hidden targets already scored this run (decision 18). */
  readonly firstHitsScored: readonly string[];
  readonly maxChain: number;
  readonly shelf: ShelfState;
  readonly draw: DrawState;
  /** Stand position x, carried over to the next shot. */
  readonly standX: number;
  /** Player-requested aim (the visible crosshair adds the sway on top). */
  readonly aim: AimAngles;
  readonly load: LoadResult | null;
  readonly bulletType: BulletType;
  readonly clocks: {
    readonly loadingSec: number;
    readonly aimingSec: number;
    readonly heartPhase: number;
    /** Drives periodic prize motion; advances only while not paused. */
    readonly motionSec: number;
  };
  readonly inFlight: InFlightMarker | null;
  /** Name fixed at START (null = anonymous). Changing the home field later does not affect this run. */
  readonly playerName: string | null;
  readonly seed: number;
}

// ---------------------------------------------------------------- commands

/**
 * Everything the UI may ask. There is intentionally no command to set score,
 * HP, collection, settlement, or ammo directly.
 */
export type GameCommand =
  | { readonly type: 'SET_POSITION'; readonly x: number }
  | { readonly type: 'CONFIRM_POSITION' }
  | { readonly type: 'STOP_LOAD' }
  | { readonly type: 'AIM'; readonly yaw: number; readonly pitch: number }
  | { readonly type: 'FIRE' }
  | { readonly type: 'PAUSE'; readonly reason: PauseReason }
  | { readonly type: 'RESUME'; readonly reason: PauseReason }
  | { readonly type: 'ABANDON' }
  | { readonly type: 'SKIP_PRESENTATION' };

export type GameCommandType = GameCommand['type'];
export const GAME_COMMAND_TYPES: readonly GameCommandType[] = [
  'SET_POSITION',
  'CONFIRM_POSITION',
  'STOP_LOAD',
  'AIM',
  'FIRE',
  'PAUSE',
  'RESUME',
  'ABANDON',
  'SKIP_PRESENTATION',
];

export type CommandParseResult =
  | { readonly ok: true; readonly command: GameCommand }
  | { readonly ok: false; readonly reason: string };

const PAUSE_REASONS: readonly PauseReason[] = ['hidden', 'landscape', 'manual'];

function hasOnlyKeys(o: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(o).every((k) => keys.includes(k));
}

/**
 * Narrow untrusted input (UI events, tests) into a GameCommand. Unknown types,
 * extra fields (e.g. {type:'FIRE', score: 999}) and non-finite numbers are rejected.
 */
export function parseCommand(input: unknown): CommandParseResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, reason: 'not an object' };
  const o = input as Record<string, unknown>;
  const t = o.type;
  if (typeof t !== 'string' || !(GAME_COMMAND_TYPES as readonly string[]).includes(t)) {
    return { ok: false, reason: `unknown command type: ${String(t)}` };
  }
  const type = t as GameCommandType;
  switch (type) {
    case 'SET_POSITION': {
      if (!hasOnlyKeys(o, ['type', 'x'])) return { ok: false, reason: 'unexpected fields' };
      if (typeof o.x !== 'number' || !Number.isFinite(o.x)) return { ok: false, reason: 'x must be finite' };
      return { ok: true, command: { type, x: o.x } };
    }
    case 'AIM': {
      if (!hasOnlyKeys(o, ['type', 'yaw', 'pitch'])) return { ok: false, reason: 'unexpected fields' };
      if (typeof o.yaw !== 'number' || !Number.isFinite(o.yaw) || typeof o.pitch !== 'number' || !Number.isFinite(o.pitch)) {
        return { ok: false, reason: 'yaw/pitch must be finite' };
      }
      return { ok: true, command: { type, yaw: o.yaw, pitch: o.pitch } };
    }
    case 'PAUSE':
    case 'RESUME': {
      if (!hasOnlyKeys(o, ['type', 'reason'])) return { ok: false, reason: 'unexpected fields' };
      if (typeof o.reason !== 'string' || !(PAUSE_REASONS as readonly string[]).includes(o.reason)) {
        return { ok: false, reason: 'invalid pause reason' };
      }
      return { ok: true, command: { type, reason: o.reason as PauseReason } };
    }
    case 'CONFIRM_POSITION':
    case 'STOP_LOAD':
    case 'FIRE':
    case 'ABANDON':
    case 'SKIP_PRESENTATION': {
      if (!hasOnlyKeys(o, ['type'])) return { ok: false, reason: 'unexpected fields' };
      return { ok: true, command: { type } };
    }
  }
}

// ------------------------------------------------------- run config & result

export interface RunConfig {
  readonly runId: RunId;
  readonly seed: number;
  readonly tuning: TuningConfig;
  /** Name fixed at start; empty/whitespace → null (anonymous, never ranked). */
  readonly playerName: string | null;
}

export interface FinalResult {
  readonly runId: RunId;
  readonly rulesVersion: string;
  readonly valueStatus: ValueStatus;
  readonly status: 'completed' | 'abandoned';
  readonly score: number;
  readonly shotsFired: number;
  readonly collected: readonly CollectedPrize[];
  readonly completedSets: readonly SetId[];
  readonly maxChain: number;
  readonly ledger: readonly ScoreLedgerEntry[];
  readonly playerName: string | null;
}

/**
 * A completed run may be sent to the official ranking only if it completed,
 * has a name fixed at start, and uses no prototype values (plan: 試作値のまま
 * 正式ランキングへ送らない). Abandoned runs are never sent (decision 27).
 */
export function isOfficialRankingEligible(r: FinalResult): boolean {
  return r.status === 'completed' && r.playerName !== null && r.valueStatus === 'approved';
}

// --------------------------------------------------------------- checkpoint

export const CHECKPOINT_SCHEMA_VERSION = 1;

export interface Checkpoint {
  readonly schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
  readonly savedAtIso: string;
  readonly runId: RunId;
  readonly rulesVersion: string;
  /** Number of shots whose result is confirmed in `state`. */
  readonly confirmedShots: number;
  /** State at a stable point: position/loading/aiming between shots, or ended. */
  readonly state: RunState;
}

// ----------------------------------------------------- function signatures

/** Small helper types for the planned functions (implemented in src/core, src/sim, src/catalog). */
export type DeviceUseSet = ReadonlySet<DeviceId>;
/** What the sim needs to fly one shot. direction is a unit vector computed from the effective aim at FIRE. */
export interface ShotRequest {
  readonly shotId: ShotId;
  readonly origin: Vec3;
  readonly direction: Vec3;
  readonly load: LoadResult;
  readonly bulletType: BulletType;
}
export type PrizeKindRef = { readonly instanceId: PrizeInstanceId; readonly typeId: PrizeTypeId };
