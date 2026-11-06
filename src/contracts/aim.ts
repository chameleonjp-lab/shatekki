/**
 * Aim & ballistic convention shared by core (FIRE direction), sim (cork
 * flight) and view (gun pose, reticle). One implementation so the visible
 * reticle and the real shot cannot drift apart (AC06, O09).
 *
 * Zero aim points from the muzzle to `aimTarget`, both with x = stand
 * position. Positive yaw turns toward +x (player's right), positive pitch
 * tilts up; both are added to the zero-aim heading/elevation.
 */
import type { AimAngles, TuningConfig } from './game';
import type { BoothLayout } from './layout';
import type { Vec3 } from './geometry';
import type { BulletType } from './events';

export const GRAVITY_MPS2 = 9.81;

export function muzzlePosition(layout: BoothLayout, standX: number): Vec3 {
  return { x: standX, y: layout.camera.muzzle.y, z: layout.camera.muzzle.z };
}

export function aimTargetPosition(layout: BoothLayout, standX: number): Vec3 {
  return { x: standX, y: layout.camera.aimTarget.y, z: layout.camera.aimTarget.z };
}

/** Unit direction of the shot for a stand position and an (effective) aim. */
export function aimDirection(layout: BoothLayout, standX: number, aim: AimAngles): Vec3 {
  const m = muzzlePosition(layout, standX);
  const t = aimTargetPosition(layout, standX);
  const dx = t.x - m.x;
  const dy = t.y - m.y;
  const dz = t.z - m.z;
  const yaw = Math.atan2(dx, -dz) + aim.yaw;
  const pitch = Math.atan2(dy, Math.hypot(dx, dz)) + aim.pitch;
  const cp = Math.cos(pitch);
  return { x: Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
}

/** What the view needs to draw where a cork will actually go (gravity included). */
export interface BallisticSpec {
  readonly speed: number;
  /** Downward acceleration in m/s² (GRAVITY × gravityScale). */
  readonly gravity: number;
  readonly fixedStepSec: number;
  readonly bulletType: BulletType;
}

/**
 * Free-flight positions of a cork, one per fixed step, using exactly the
 * sim's integration: v.y -= g·dt, then p += v·dt. Contacts are not modelled
 * here; callers ray-cast each segment to find the first hit.
 */
export function corkFreeFlightPath(origin: Vec3, direction: Vec3, spec: BallisticSpec, maxSec: number): Vec3[] {
  const pts: Vec3[] = [origin];
  let p = origin;
  let v = { x: direction.x * spec.speed, y: direction.y * spec.speed, z: direction.z * spec.speed };
  const dt = spec.fixedStepSec;
  const n = Math.max(1, Math.ceil(maxSec / dt));
  for (let i = 0; i < n; i++) {
    v = { x: v.x, y: v.y - spec.gravity * dt, z: v.z };
    p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
    pts.push(p);
  }
  return pts;
}

/** Ballistic spec of the next cork; the sim's initial speed and gravity use the same numbers. */
export function ballisticFor(tuning: TuningConfig, bulletType: BulletType): BallisticSpec {
  return {
    speed: tuning.cork.speed * tuning.bulletTypes[bulletType].speed,
    gravity: GRAVITY_MPS2 * tuning.cork.gravityScale,
    fixedStepSec: tuning.limits.fixedStepSec,
    bulletType,
  };
}
