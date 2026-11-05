/** Projectile state and damage / impulse formulas (Task 05, shot-pipeline.md §2). */
import type { BulletType, LoadResult, ProjectileId, TuningConfig, Vec3 } from '../contracts';

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
}

export function reflectionLimitFor(p: Pick<Projectile, 'bulletType'>, tuning: TuningConfig): number {
  return tuning.limits.maxReflectionsPerCork + tuning.bulletTypes[p.bulletType].extraReflections;
}

export function initialSpeed(bulletType: BulletType, tuning: TuningConfig): number {
  return tuning.cork.speed * tuning.bulletTypes[bulletType].speed;
}

/** damage = baseDamage x load x bullet x power x (speed / initial speed), speed ratio capped at 1. */
export function damageFor(
  speed: number,
  p: Pick<Projectile, 'bulletType' | 'powerMultiplier'>,
  load: LoadResult,
  tuning: TuningConfig,
): number {
  const ratio = Math.min(1, speed / initialSpeed(p.bulletType, tuning));
  return tuning.cork.baseDamage * load.damageMultiplier * tuning.bulletTypes[p.bulletType].damage * p.powerMultiplier * ratio;
}

/** impulse (N·s) = baseImpulse x load x bullet x power x (speed / initial speed). */
export function impulseFor(
  speed: number,
  p: Pick<Projectile, 'bulletType' | 'powerMultiplier'>,
  load: LoadResult,
  tuning: TuningConfig,
): number {
  const ratio = Math.min(1, speed / initialSpeed(p.bulletType, tuning));
  return tuning.cork.baseImpulse * load.pushMultiplier * tuning.bulletTypes[p.bulletType].push * p.powerMultiplier * ratio;
}

/** An impulse at least this many times baseImpulse tears a mounted prize off its mount (prototype). */
export const DETACH_IMPULSE_RATIO = 1.2;
