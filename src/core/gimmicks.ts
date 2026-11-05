/**
 * Device ("仕掛け") rules that do not need the physics engine (Task 08).
 * Pure functions used by src/sim (during the shot) and src/core/settlement
 * (after the shot). All numbers come from TuningConfig and are prototype.
 */
import type {
  BulletType,
  DeviceActivation,
  PrizeInstanceState,
  PrizeTypeId,
  RunState,
  RuntimeCatalog,
  TransformChooser,
  TuningConfig,
  Vec3,
} from '../contracts';
import { rngNext, seedRng } from '../catalog/rng';

/** Power plates never push the multiplier past this (shot-pipeline.md §3). */
export const MAX_POWER_MULTIPLIER = 4;

export function nextPowerMultiplier(current: number, tuning: TuningConfig): number {
  return Math.min(MAX_POWER_MULTIPLIER, current * tuning.devices.powerMultiplier);
}

function rotateAbout(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const d = axis.x * v.x + axis.y * v.y + axis.z * v.z;
  const cx = axis.y * v.z - axis.z * v.y;
  const cy = axis.z * v.x - axis.x * v.z;
  const cz = axis.x * v.y - axis.y * v.x;
  return {
    x: v.x * c + cx * s + axis.x * d * (1 - c),
    y: v.y * c + cy * s + axis.y * d * (1 - c),
    z: v.z * c + cz * s + axis.z * d * (1 - c),
  };
}

/**
 * The two corks that replace a cork at a split plate. `reflected` is the
 * velocity after the ordinary reflection, `normal` the unit surface normal
 * (pointing to the cork). PROTOTYPE reading of "法線の周りに±spread": a
 * rotation about the normal would leave a head-on cork unchanged, so the
 * fork is a horizontal fan (rotation about world up; about x if the cork
 * moves almost vertically). A child never points into the surface.
 */
export function splitVelocities(reflected: Vec3, normal: Vec3, spreadRad: number): readonly [Vec3, Vec3] {
  const speed = Math.hypot(reflected.x, reflected.y, reflected.z);
  const vertical = speed > 0 && Math.abs(reflected.y) > 0.99 * speed;
  const axis: Vec3 = vertical ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  const away = (v: Vec3): Vec3 => {
    const vn = v.x * normal.x + v.y * normal.y + v.z * normal.z;
    return vn >= 0 ? v : { x: v.x - 2 * vn * normal.x, y: v.y - 2 * vn * normal.y, z: v.z - 2 * vn * normal.z };
  };
  return [away(rotateAbout(reflected, axis, spreadRad)), away(rotateAbout(reflected, axis, -spreadRad))];
}

/** Decision 32: keep the HP ratio; prototype rounding is Math.round (O08). */
export function transformedHp(hp: number, maxHp: number, newMaxHp: number): number {
  if (!(maxHp > 0) || !(newMaxHp >= 0)) return 0;
  const ratio = Math.min(1, Math.max(0, hp / maxHp));
  return Math.min(newMaxHp, Math.max(0, Math.round(ratio * newMaxHp)));
}

/** The bullet type after `current` in the tuning's cycle. */
export function nextBulletType(current: BulletType, tuning: TuningConfig): BulletType {
  const cycle = tuning.devices.bulletTypeCycle;
  if (cycle.length === 0) return current;
  const i = cycle.indexOf(current);
  return cycle[(i + 1) % cycle.length]!;
}

/** Decision 09: the cumulative bonus never exceeds maxBonusAmmoTotal. */
export function grantBonusAmmo(requested: number, bonusAmmoTotal: number, tuning: TuningConfig): number {
  const room = Math.max(0, tuning.maxBonusAmmoTotal - bonusAmmoTotal);
  return Math.max(0, Math.min(Math.trunc(requested), room));
}

export interface DeviceEffects {
  readonly bonusAmmoRequested: number;
  /** One entry per activated penalty device. */
  readonly penalties: readonly { readonly deviceId: string; readonly points: number }[];
  readonly bulletTypeChanged: boolean;
}

/** What the activated devices ask of the run (split/power/transform already acted in the sim). */
export function deviceEffects(activations: readonly DeviceActivation[], tuning: TuningConfig): DeviceEffects {
  const seen = new Set<string>();
  let bonus = 0;
  const penalties: { deviceId: string; points: number }[] = [];
  let bullet = false;
  for (const a of activations) {
    if (seen.has(a.deviceId)) continue; // once per device per shot, even if a record lists it twice
    seen.add(a.deviceId);
    if (a.kind === 'ammo') bonus += tuning.devices.ammoBonus;
    else if (a.kind === 'penalty') penalties.push({ deviceId: a.deviceId, points: tuning.devices.penaltyPoints });
    else if (a.kind === 'bulletType') bullet = true;
  }
  return { bonusAmmoRequested: bonus, penalties, bulletTypeChanged: bullet };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Transform rule (PROTOTYPE, O08): the chooser is deterministic from
 * (seed, shotId). It picks uniformly among the offered prizes that are
 * uncollected and not mounted, then a target kind uniformly among the other
 * kinds of the catalog (100 in the real catalog), ordered by id.
 */
export function createTransformChooser(
  state: Pick<RunState, 'seed' | 'inFlight' | 'shotsFired'>,
  catalog: RuntimeCatalog,
): TransformChooser {
  const shotKey = state.inFlight?.shotId ?? `s${state.shotsFired + 1}`;
  const typeIds = [...catalog.prizes.keys()].sort() as PrizeTypeId[];
  return (candidates: readonly PrizeInstanceState[]) => {
    const eligible = candidates.filter((p) => !p.collected && !p.mounted).sort((a, b) => (a.instanceId < b.instanceId ? -1 : 1));
    if (eligible.length === 0) return null;
    const r1 = rngNext(seedRng((state.seed ^ hashString(shotKey)) | 0));
    const chosen = eligible[Math.min(eligible.length - 1, Math.floor(r1.value * eligible.length))]!;
    const others = typeIds.filter((t) => t !== chosen.typeId);
    if (others.length === 0) return null;
    const r2 = rngNext(r1.state);
    const toTypeId = others[Math.min(others.length - 1, Math.floor(r2.value * others.length))]!;
    return { instanceId: chosen.instanceId, toTypeId };
  };
}
