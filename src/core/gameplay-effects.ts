/**
 * The 100 gameplay effects as a closed set of operations (plan EG04,
 * requirements §6.2, effects appendix §3-§4). Pure: an operation is applied to
 * a *working copy* (EffectWork) and nothing here touches the DOM, the physics
 * world or the confirmed ledger. Effects never start other effects or questions.
 *
 * Randomness: only `seriesAssortment` draws (one shuffled candidate order per
 * target prize, drawn once when the request is first processed). Checking
 * whether an operation is applicable never consumes the PRNG.
 */
import type {
  BulletType,
  EffectOperation,
  EffectRequestId,
  ExpansionCatalog,
  ExpansionLimits,
  PrizeInstanceId,
  PrizeInstanceState,
  PrizeTypeId,
  SeriesId,
  ShotModifiers,
  ShotModifierPatch,
  ShotReservation,
  TransformIntent,
  PlannedOutcome,
  TuningConfig,
} from '../contracts';
import { BASE_SHOT_MODIFIERS } from '../contracts';
import type { RngState } from '../catalog/rng';
import { shuffled } from './expansion-rng';
import { seriesDef, sortPrizesByBoardOrder } from './series';

/** What a plan may change while it is only provisional. */
export interface EffectWork {
  readonly ammo: number;
  readonly bonusAmmoTotal: number;
  readonly ammoLostTotal: number;
  readonly bulletType: BulletType;
  readonly next: ShotReservation;
  readonly assortmentSeries: SeriesId | null;
  readonly outlineSeries: SeriesId | null;
  readonly penaltyPoints: number;
  /** At most one per instance; the latest request wins. */
  readonly transforms: readonly TransformIntent[];
  /** The effects PRNG stream. */
  readonly rng: RngState;
}

/** Read-only facts an effect may look at. */
export interface EffectEnv {
  readonly tuning: TuningConfig;
  readonly expansion: ExpansionCatalog;
  /** Includes the shot being planned (FIRE already consumed its cork). */
  readonly shotsFired: number;
  /** Uncollected prizes as of the flight-end barrier (all 36 slots, also off-screen). */
  readonly prizes: readonly PrizeInstanceState[];
  /** Kind of the last prize confirmed collected in an EARLIER shot. */
  readonly lastCollectedTypeId: PrizeTypeId | null;
}

export interface EffectApplication {
  readonly work: EffectWork;
  readonly outcome: PlannedOutcome;
  /** Why it did not apply, e.g. "ammoAtMostOne", "noTarget", "noAmmoRoom". */
  readonly reason: string | null;
  /** Real ammo change after caps (+ added, - removed, 0). */
  readonly ammoDelta: number;
  readonly targets: readonly PrizeInstanceId[];
}

export const EMPTY_RESERVATION: ShotReservation = Object.freeze({ modifiers: BASE_SHOT_MODIFIERS, hint: null });

// -------------------------------------------------------------- ammo rules

/**
 * Real amount of ammo an "add" can give: min(requested, bonus room, firing room).
 * Firing room = (initialAmmo + maxBonusAmmoTotal - shotsFired) - ammo.
 */
export function realAmmoAdd(requested: number, w: Pick<EffectWork, 'ammo' | 'bonusAmmoTotal'>, shotsFired: number, tuning: TuningConfig): number {
  const bonusRoom = tuning.maxBonusAmmoTotal - w.bonusAmmoTotal;
  const firingRoom = tuning.initialAmmo + tuning.maxBonusAmmoTotal - shotsFired - w.ammo;
  return Math.max(0, Math.min(Math.trunc(requested), bonusRoom, firingRoom));
}

/** Real amount an "remove" takes: only when ammo >= 2, and at least 1 stays. */
export function realAmmoRemove(requested: number, ammo: number): number {
  return ammo >= 2 ? Math.max(0, Math.min(Math.trunc(requested), ammo - 1)) : 0;
}

/** Apply an ammo grant (effect or legacy plate) to the working copy. */
export function withAmmoAdded(work: EffectWork, requested: number, shotsFired: number, tuning: TuningConfig): { work: EffectWork; delta: number } {
  const delta = realAmmoAdd(requested, work, shotsFired, tuning);
  return { work: delta === 0 ? work : { ...work, ammo: work.ammo + delta, bonusAmmoTotal: work.bonusAmmoTotal + delta }, delta };
}

// ------------------------------------------------------ transform targeting

interface TwoPrizes {
  readonly target: PrizeInstanceState;
  readonly source: PrizeInstanceState;
}

/** FX090: the first two prizes (row, column, id) of different kinds; the earlier one takes the later one's kind. */
function copyPair(prizes: readonly PrizeInstanceState[]): TwoPrizes | null {
  const sorted = sortPrizesByBoardOrder(prizes.filter((p) => !p.collected));
  const first = sorted[0];
  if (!first) return null;
  const other = sorted.find((p) => p.typeId !== first.typeId);
  return other ? { target: first, source: other } : null;
}

/** FX091: the first prize whose kind is no longer the kind it was placed as. */
function revertTarget(prizes: readonly PrizeInstanceState[]): PrizeInstanceState | null {
  return sortPrizesByBoardOrder(prizes.filter((p) => !p.collected)).find((p) => p.typeId !== p.drawnTypeId) ?? null;
}

/** FX092: the first prize of a kind other than the last confirmed collected kind. */
function lastCollectedTarget(prizes: readonly PrizeInstanceState[], last: PrizeTypeId): PrizeInstanceState | null {
  return sortPrizesByBoardOrder(prizes.filter((p) => !p.collected)).find((p) => p.typeId !== last) ?? null;
}

/** Latest request wins per instance. */
export function withIntent(transforms: readonly TransformIntent[], intent: TransformIntent): TransformIntent[] {
  return [...transforms.filter((t) => t.instanceId !== intent.instanceId), intent];
}

// ----------------------------------------------------------- modifier math

const clamp = (v: number, r: { readonly min: number; readonly max: number }): number => Math.min(r.max, Math.max(r.min, v));

/** Overwrite per field (last wins), clamped to the profile limits. Unnamed fields keep their value. */
export function mergeModifiers(base: ShotModifiers, patch: ShotModifierPatch, limits: ExpansionLimits): ShotModifiers {
  const reflectSpan = limits.reflections.max - limits.reflections.min;
  const out: { -readonly [K in keyof ShotModifiers]: ShotModifiers[K] } = { ...base };
  if (patch.bulletType !== undefined) out.bulletType = patch.bulletType;
  if (patch.damageMult !== undefined) out.damageMult = clamp(patch.damageMult, limits.damagePushMult);
  if (patch.pushMult !== undefined) out.pushMult = clamp(patch.pushMult, limits.damagePushMult);
  if (patch.speedMult !== undefined) out.speedMult = clamp(patch.speedMult, limits.speedMult);
  if (patch.gravityMult !== undefined) out.gravityMult = clamp(patch.gravityMult, limits.gravityMult);
  if (patch.restitutionMult !== undefined) out.restitutionMult = clamp(patch.restitutionMult, limits.restitutionMult);
  if (patch.swayMult !== undefined) out.swayMult = clamp(patch.swayMult, limits.swayMult);
  if (patch.loadPeriodMult !== undefined) out.loadPeriodMult = clamp(patch.loadPeriodMult, limits.loadPeriodMult);
  if (patch.radiusMult !== undefined) out.radiusMult = clamp(patch.radiusMult, limits.radiusMult);
  if (patch.splitSpreadMult !== undefined) out.splitSpreadMult = clamp(patch.splitSpreadMult, limits.splitSpreadMult);
  if (patch.extraReflections !== undefined) out.extraReflections = Math.trunc(clamp(patch.extraReflections, { min: -reflectSpan, max: reflectSpan }));
  if (patch.launch !== undefined) out.launch = Object.freeze({ count: patch.launch.count, spreadRad: clamp(patch.launch.spreadRad, { min: 0, max: 0.5 }) });
  return Object.freeze(out);
}

// ------------------------------------------------------------- applicability

/**
 * null when the operation can act on `work`, otherwise the reason it cannot.
 * Pure: never consumes the PRNG. Throws for an operation kind it does not know.
 */
export function inapplicableReason(op: EffectOperation, work: EffectWork, env: EffectEnv): string | null {
  switch (op.kind) {
    case 'ammoAdd':
      return realAmmoAdd(op.amount, work, env.shotsFired, env.tuning) > 0 ? null : 'noAmmoRoom';
    case 'ammoRemove':
      return realAmmoRemove(op.amount, work.ammo) > 0 ? null : 'ammoAtMostOne';
    case 'shotModifiers':
    case 'resetShotModifiers':
    case 'hint':
    case 'seriesOutline':
      return null;
    case 'seriesAssortment':
      seriesDef(env.expansion, op.seriesId); // throws for a series that does not exist
      return null;
    case 'transformCopyType':
      return copyPair(env.prizes) ? null : 'noTarget';
    case 'transformRevert':
      return revertTarget(env.prizes) ? null : 'noTarget';
    case 'transformToLastCollected':
      if (env.lastCollectedTypeId === null) return 'noCollectedPrize';
      return lastCollectedTarget(env.prizes, env.lastCollectedTypeId) ? null : 'noTarget';
    default:
      throw new RangeError(`unknown effect operation: ${String((op as { kind?: unknown }).kind)}`);
  }
}

// ---------------------------------------------------------------- applying

const notApplicable = (work: EffectWork, reason: string): EffectApplication => ({ work, outcome: 'notApplicable', reason, ammoDelta: 0, targets: [] });
const applied = (work: EffectWork, ammoDelta = 0, targets: readonly PrizeInstanceId[] = []): EffectApplication => ({ work, outcome: 'applied', reason: null, ammoDelta, targets });

/**
 * Apply one operation of request `requestId` to the working copy. A not-applicable
 * operation is an explicit outcome (never silently redrawn or dropped).
 */
export function applyOperation(op: EffectOperation, requestId: EffectRequestId, work: EffectWork, env: EffectEnv): EffectApplication {
  const why = inapplicableReason(op, work, env);
  if (why !== null) return notApplicable(work, why);
  switch (op.kind) {
    case 'ammoAdd': {
      const r = withAmmoAdded(work, op.amount, env.shotsFired, env.tuning);
      return applied(r.work, r.delta);
    }
    case 'ammoRemove': {
      const removed = realAmmoRemove(op.amount, work.ammo);
      return applied({ ...work, ammo: work.ammo - removed, ammoLostTotal: work.ammoLostTotal + removed }, -removed);
    }
    case 'shotModifiers': {
      const modifiers = mergeModifiers(work.next.modifiers, op.set, env.expansion.profile.limits);
      return applied({ ...work, next: { ...work.next, modifiers } });
    }
    case 'resetShotModifiers':
      return applied({ ...work, next: { ...work.next, modifiers: Object.freeze({ ...BASE_SHOT_MODIFIERS, bulletType: 'standard' as const }) } });
    case 'hint':
      return applied({ ...work, next: { ...work.next, hint: op.hint } });
    case 'seriesOutline':
      return applied({ ...work, outlineSeries: op.seriesId });
    case 'seriesAssortment': {
      const members = seriesDef(env.expansion, op.seriesId).typeIds;
      const pending = new Set(work.transforms.map((t) => t.instanceId));
      let rng = work.rng;
      let transforms: readonly TransformIntent[] = work.transforms;
      const targets: PrizeInstanceId[] = [];
      for (const p of sortPrizesByBoardOrder(env.prizes.filter((x) => !x.collected))) {
        // a prize already of a member kind (and not waiting for another change) stays as it is
        if (!pending.has(p.instanceId) && members.includes(p.typeId)) continue;
        const s = shuffled(members, rng);
        rng = s.state;
        transforms = withIntent(transforms, { instanceId: p.instanceId, requestId, candidateTypeIds: s.items });
        targets.push(p.instanceId);
      }
      return applied({ ...work, assortmentSeries: op.seriesId, transforms, rng }, 0, targets);
    }
    case 'transformCopyType': {
      const pair = copyPair(env.prizes)!;
      const intent: TransformIntent = { instanceId: pair.target.instanceId, requestId, candidateTypeIds: [pair.source.typeId] };
      return applied({ ...work, transforms: withIntent(work.transforms, intent) }, 0, [pair.target.instanceId]);
    }
    case 'transformRevert': {
      const t = revertTarget(env.prizes)!;
      const intent: TransformIntent = { instanceId: t.instanceId, requestId, candidateTypeIds: [t.drawnTypeId] };
      return applied({ ...work, transforms: withIntent(work.transforms, intent) }, 0, [t.instanceId]);
    }
    case 'transformToLastCollected': {
      const t = lastCollectedTarget(env.prizes, env.lastCollectedTypeId!)!;
      const intent: TransformIntent = { instanceId: t.instanceId, requestId, candidateTypeIds: [env.lastCollectedTypeId!] };
      return applied({ ...work, transforms: withIntent(work.transforms, intent) }, 0, [t.instanceId]);
    }
  }
}
