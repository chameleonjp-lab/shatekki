/** Projectile state and damage / impulse formulas (Task 05, shot-pipeline.md §2). */
import type { BulletType, LoadResult, ProjectileId, TuningConfig, Vec3 } from '../contracts';
import { ballisticFor } from '../contracts';

/**
 * Expanded rules (EG05): settings fixed at FIRE, shared by the original cork,
 * launch corks and every split child. Absent = rules-v1 behaviour.
 */
export interface ProjectileExpanded {
  /** Collider / castShape radius (also reported in frames). */
  readonly radius: number;
  /** Downward acceleration in m/s^2 (GRAVITY x gravityScale x gravityMult). */
  readonly gravity: number;
  /** Real launch speed: the damage/impulse decay is relative to this, so a speed change is not counted twice. */
  readonly launchSpeed: number;
  readonly damageMult: number;
  readonly pushMult: number;
  readonly restitutionMult: number;
  /** Reflection limit after bullet type, extra reflections and the clamp. */
  readonly reflectionLimit: number;
  readonly splitSpreadMult: number;
  /** 1 / launch count: damage and push are divided among launched corks; children keep it. */
  readonly share: number;
  /** min(maxPower, plate x new multiplier) cap. */
  readonly maxPowerMultiplier: number;
}

export interface Projectile {
  readonly id: ProjectileId;
  readonly generation: number;
  position: Vec3;
  velocity: Vec3;
  readonly bulletType: BulletType;
  powerMultiplier: number;
  reflections: number;
  /** Seconds since the shot started when this cork was spawned. */
  readonly spawnedAtSec: number;
  ended: boolean;
  /** target key -> sim time of the last contact (dedupe of continuing contacts). */
  readonly lastContact: Map<string, number>;
  readonly x?: ProjectileExpanded;
}

export function reflectionLimitFor(p: Pick<Projectile, 'bulletType' | 'x'>, tuning: TuningConfig): number {
  if (p.x) return p.x.reflectionLimit;
  return tuning.limits.maxReflectionsPerCork + tuning.bulletTypes[p.bulletType].extraReflections;
}

export function initialSpeed(bulletType: BulletType, tuning: TuningConfig): number {
  return ballisticFor(tuning, bulletType).speed;
}

/** damage = baseDamage x load x bullet x power x (speed / initial speed), speed ratio capped at 1. */
export function damageFor(
  speed: number,
  p: Pick<Projectile, 'bulletType' | 'powerMultiplier' | 'x'>,
  load: LoadResult,
  tuning: TuningConfig,
): number {
  if (p.x) {
    const ratio = Math.min(1, speed / p.x.launchSpeed);
    const power = Math.min(p.x.maxPowerMultiplier, p.powerMultiplier * p.x.damageMult) * p.x.share;
    return tuning.cork.baseDamage * load.damageMultiplier * tuning.bulletTypes[p.bulletType].damage * power * ratio;
  }
  const ratio = Math.min(1, speed / initialSpeed(p.bulletType, tuning));
  return tuning.cork.baseDamage * load.damageMultiplier * tuning.bulletTypes[p.bulletType].damage * p.powerMultiplier * ratio;
}

/** impulse (N·s) = baseImpulse x load x bullet x power x (speed / initial speed). */
export function impulseFor(
  speed: number,
  p: Pick<Projectile, 'bulletType' | 'powerMultiplier' | 'x'>,
  load: LoadResult,
  tuning: TuningConfig,
): number {
  if (p.x) {
    const ratio = Math.min(1, speed / p.x.launchSpeed);
    const power = Math.min(p.x.maxPowerMultiplier, p.powerMultiplier * p.x.pushMult) * p.x.share;
    return tuning.cork.baseImpulse * load.pushMultiplier * tuning.bulletTypes[p.bulletType].push * power * ratio;
  }
  const ratio = Math.min(1, speed / initialSpeed(p.bulletType, tuning));
  return tuning.cork.baseImpulse * load.pushMultiplier * tuning.bulletTypes[p.bulletType].push * p.powerMultiplier * ratio;
}

/** An impulse at least this many times baseImpulse tears a mounted prize off its mount (prototype). */
export const DETACH_IMPULSE_RATIO = 1.2;
