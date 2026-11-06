/**
 * Simulation event & shot result contract (Task 02, owner: Opus).
 *
 * Live contact (ImpactEvent, SimulationFrame) and the confirmed result
 * (ShotSummary, ScoreLedgerEntry) are separate types. The view may draw live
 * contacts immediately but must never derive points from them; only the
 * ShotSummary produced after the whole shot (flight → transform → falls →
 * settlement) carries points (requirements §7, decision 32).
 */
import type { BackgroundCellId, DeviceId, EventId, PrizeInstanceId, PrizeTypeId, ProjectileId, RunId, SetId, ShotId } from './ids';
import type { Quat, Vec3 } from './geometry';
import type { DeviceKind, ShopkeeperPart, SurfaceMaterial } from './layout';
import type { PrizeMaterial } from './catalog';
import type { FirstHitKey, PrizeOutcome } from './sim';

export const EVENTS_VERSION = 1;

export type BulletType = 'standard' | 'heavy' | 'bouncy';

export type ImpactTarget =
  | { readonly kind: 'prize'; readonly instanceId: PrizeInstanceId; readonly typeId: PrizeTypeId; readonly material: PrizeMaterial }
  | { readonly kind: 'surface'; readonly surfaceId: string; readonly material: SurfaceMaterial }
  | { readonly kind: 'device'; readonly deviceId: DeviceId; readonly deviceKind: DeviceKind; /** false when this device already fired in this shot (decision 31) */ readonly activated: boolean }
  | { readonly kind: 'shopkeeper'; readonly part: ShopkeeperPart }
  | { readonly kind: 'hidden'; readonly targetId: string }
  /** Layout v2 back-wall cell. activated=false: already used this run (ordinary reflection only). */
  | { readonly kind: 'cell'; readonly cellId: BackgroundCellId; readonly activated: boolean };

/**
 * A cork touched something. Generated for every new contact, including ones
 * outside the camera view (AC14, AC26). Not a scoring notice.
 */
export interface ImpactEvent {
  readonly type: 'impact';
  readonly eventId: EventId;
  readonly runId: RunId;
  readonly shotId: ShotId;
  readonly projectileId: ProjectileId;
  readonly target: ImpactTarget;
  readonly point: Vec3;
  readonly normal: Vec3;
  /** Cork speed just before contact (m/s). */
  readonly speed: number;
  /** Number of reflections this cork had made before this contact. */
  readonly reflectionIndex: number;
}

/** Two prizes (or a prize and the shelf) knocked into each other: chain contact, for small reactions only. */
export interface PrizeContactEvent {
  readonly type: 'prizeContact';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly a: PrizeInstanceId;
  readonly b: PrizeInstanceId | null;
  readonly point: Vec3;
  readonly impulse: number;
}

export interface ProjectileSpawnedEvent {
  readonly type: 'projectileSpawned';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly projectileId: ProjectileId;
  readonly parentId: ProjectileId | null;
  readonly generation: number;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly bulletType: BulletType;
}

/** 'split': replaced by two child corks at a split plate (children carry parentId). */
export type ProjectileEndReason = 'stopped' | 'outOfBounds' | 'reflectionLimit' | 'timeLimit' | 'split';

export interface ProjectileEndedEvent {
  readonly type: 'projectileEnded';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly projectileId: ProjectileId;
  readonly reason: ProjectileEndReason;
  readonly position: Vec3;
}

export interface DeviceActivatedEvent {
  readonly type: 'deviceActivated';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly deviceId: DeviceId;
  readonly deviceKind: DeviceKind;
  readonly projectileId: ProjectileId;
}

export interface PrizeDamagedEvent {
  readonly type: 'prizeDamaged';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly instanceId: PrizeInstanceId;
  readonly hpBefore: number;
  readonly hpAfter: number;
  readonly maxHp: number;
}

/** Live notice that a prize reached the collection zone. Points come only from ShotSummary. */
export interface PrizeReachedCollectionEvent {
  readonly type: 'prizeReachedCollection';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly instanceId: PrizeInstanceId;
  readonly typeId: PrizeTypeId;
}

export interface PrizeTransformedEvent {
  readonly type: 'prizeTransformed';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly instanceId: PrizeInstanceId;
  readonly fromTypeId: PrizeTypeId;
  readonly toTypeId: PrizeTypeId;
  readonly hpBefore: number;
  readonly maxHpBefore: number;
  readonly hpAfter: number;
  readonly maxHpAfter: number;
}

/** flight: corks moving; transform: applying reserved transforms; settle: waiting for prizes; grace: limit hit, finite fall grace (decision 33). */
export type ShotStage = 'flight' | 'transform' | 'settle' | 'grace';

export interface ShotStageEvent {
  readonly type: 'shotStage';
  readonly eventId: EventId;
  readonly shotId: ShotId;
  readonly stage: ShotStage;
}

export type SimEvent =
  | ImpactEvent
  | PrizeContactEvent
  | ProjectileSpawnedEvent
  | ProjectileEndedEvent
  | DeviceActivatedEvent
  | PrizeDamagedEvent
  | PrizeReachedCollectionEvent
  | PrizeTransformedEvent
  | ShotStageEvent;

export type SimEventType = SimEvent['type'];
export const SIM_EVENT_TYPES: readonly SimEventType[] = [
  'impact',
  'prizeContact',
  'projectileSpawned',
  'projectileEnded',
  'deviceActivated',
  'prizeDamaged',
  'prizeReachedCollection',
  'prizeTransformed',
  'shotStage',
];

// ------------------------------------------------------------------- frames

export interface PrizeFrame {
  readonly instanceId: PrizeInstanceId;
  readonly typeId: PrizeTypeId;
  readonly position: Vec3;
  readonly rotation: Quat;
  readonly hp: number;
  readonly maxHp: number;
  readonly mounted: boolean;
  readonly collected: boolean;
}

export interface ProjectileFrame {
  readonly projectileId: ProjectileId;
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly bulletType: BulletType;
  readonly powerMultiplier: number;
  /** Expanded rules: the cork's real collider radius (FX083/084). Absent = tuning.cork.radius. */
  readonly radius?: number;
}

/** Read-only snapshot for drawing. The view must not write back into the sim. */
export interface SimulationFrame {
  readonly simTimeSec: number;
  readonly shotId: ShotId | null;
  readonly stage: ShotStage | null;
  readonly prizes: readonly PrizeFrame[];
  readonly projectiles: readonly ProjectileFrame[];
  /** Events produced since the previous frame, in order. */
  readonly events: readonly SimEvent[];
}

// ----------------------------------------------------------- confirmed result

export type LedgerItemKind = 'prize' | 'trick' | 'set' | 'shopkeeper' | 'hidden' | 'penalty';

export interface LedgerItem {
  readonly kind: LedgerItemKind;
  /** instanceId / setId / trick id / part / target id / device id. */
  readonly refId: string;
  /** Positive for gains; penalties are recorded as positive nominal amounts with kind 'penalty'. */
  readonly points: number;
}

/**
 * One shot's score settlement (decision 28). scoreAfter = max(0, scoreBefore + gains - nominalPenalty).
 * appliedPenalty = scoreBefore + gains - scoreAfter (may be less than nominal). Nothing carries over.
 */
export interface ScoreLedgerEntry {
  readonly shotId: ShotId;
  readonly scoreBefore: number;
  readonly prizePoints: number;
  readonly trickPoints: number;
  readonly setPoints: number;
  /** Shopkeeper parts & hidden targets, first hit per game only (decision 18). */
  readonly firstHitPoints: number;
  readonly nominalPenalty: number;
  readonly appliedPenalty: number;
  readonly scoreAfter: number;
  readonly items: readonly LedgerItem[];
}

export interface CollectedPrize {
  readonly instanceId: PrizeInstanceId;
  /** The kind at the moment it was collected (after any transform). */
  readonly typeId: PrizeTypeId;
  readonly shotId: ShotId;
}

export interface ShotSummary {
  readonly runId: RunId;
  readonly shotId: ShotId;
  /** 1-based index of this shot among fired shots. */
  readonly shotNumber: number;
  readonly collected: readonly CollectedPrize[];
  /** decision 29: number of prize instances collected in this shot. */
  readonly chainCount: number;
  readonly newlyCompletedSets: readonly SetId[];
  readonly bonusAmmoRequested: number;
  /** After the cumulative cap of 10 (decision 09). */
  readonly bonusAmmoGranted: number;
  readonly devicesActivated: readonly DeviceId[];
  readonly transforms: readonly PrizeTransformedEvent[];
  readonly ledger: ScoreLedgerEntry;
  /** Whether the reflection/time limit ended the flight and the finite fall grace was used (decision 33). */
  readonly endedByLimit: boolean;
  /**
   * Per-prize contact outcome of this shot (from the sim record). Used only to
   * classify the presentation (success / near miss / miss) AFTER settlement;
   * never for points.
   */
  readonly prizeOutcomes: readonly PrizeOutcome[];
  /** Shopkeeper parts / hidden targets touched this shot (reactions repeat; points only once per run). */
  readonly touchedFirstHitTargets: readonly FirstHitKey[];
  readonly ammoAfter: number;
  readonly runEnded: boolean;
}

/**
 * Invariant every ledger entry must satisfy (decision 28). Used by tests and
 * by persistence to reject corrupted saves. Not a scoring implementation.
 */
export function isLedgerEntryConsistent(e: ScoreLedgerEntry): boolean {
  const gains = e.prizePoints + e.trickPoints + e.setPoints + e.firstHitPoints;
  const ints = [e.scoreBefore, e.prizePoints, e.trickPoints, e.setPoints, e.firstHitPoints, e.nominalPenalty, e.appliedPenalty, e.scoreAfter];
  if (!ints.every((n) => Number.isInteger(n) && n >= 0)) return false;
  const expectedAfter = Math.max(0, e.scoreBefore + gains - e.nominalPenalty);
  if (e.scoreAfter !== expectedAfter) return false;
  if (e.appliedPenalty !== e.scoreBefore + gains - e.scoreAfter) return false;
  if (e.appliedPenalty > e.nominalPenalty) return false;
  const sum = (k: LedgerItemKind[]) => e.items.filter((i) => k.includes(i.kind)).reduce((a, i) => a + i.points, 0);
  return (
    sum(['prize']) === e.prizePoints &&
    sum(['trick']) === e.trickPoints &&
    sum(['set']) === e.setPoints &&
    sum(['shopkeeper', 'hidden']) === e.firstHitPoints &&
    sum(['penalty']) === e.nominalPenalty
  );
}
