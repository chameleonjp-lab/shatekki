/**
 * Aim math shared by the reticle, the gun model and (proposed) the sim.
 *
 * Convention (proposal for Opus to move into src/contracts so sim and view
 * cannot drift): the zero aim points from the muzzle to `aimTarget`
 * (both with x = stand position). Positive yaw turns toward +x (the player's
 * right), positive pitch tilts up. Angles are applied to the zero-aim heading
 * and elevation, so (0, 0) is exactly muzzle -> aimTarget.
 */
import * as THREE from 'three';
import type { AimAngles, BoothLayout, Vec3 } from '../contracts';

export function muzzlePosition(layout: BoothLayout, standX: number): Vec3 {
  return { x: standX, y: layout.camera.muzzle.y, z: layout.camera.muzzle.z };
}

export function aimTargetPosition(layout: BoothLayout, standX: number): Vec3 {
  return { x: standX, y: layout.camera.aimTarget.y, z: layout.camera.aimTarget.z };
}

/** Unit direction of the shot for the given stand position and effective aim. */
export function aimDirection(layout: BoothLayout, standX: number, aim: AimAngles): THREE.Vector3 {
  const m = muzzlePosition(layout, standX);
  const t = aimTargetPosition(layout, standX);
  const base = new THREE.Vector3(t.x - m.x, t.y - m.y, t.z - m.z).normalize();
  const az = Math.atan2(base.x, -base.z) + aim.yaw;
  const el = Math.asin(base.y) + aim.pitch;
  const ce = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce);
}

export interface ReticleResult {
  readonly origin: THREE.Vector3;
  readonly direction: THREE.Vector3;
  readonly point: THREE.Vector3;
  readonly distance: number;
  /** false when the ray met nothing and the point is a fallback at `maxDistance`. */
  readonly hit: boolean;
  readonly normal: THREE.Vector3 | null;
}

const raycaster = new THREE.Raycaster();

/**
 * First point where the straight aim ray meets any of `targets`
 * (collision-proxy boxes and visible prize meshes). No hidden offset:
 * the point lies exactly on origin + direction * distance.
 */
export function computeReticle(
  layout: BoothLayout,
  standX: number,
  aim: AimAngles,
  targets: readonly THREE.Object3D[],
  maxDistance = 6,
): ReticleResult {
  const m = muzzlePosition(layout, standX);
  const origin = new THREE.Vector3(m.x, m.y, m.z);
  const direction = aimDirection(layout, standX, aim);
  raycaster.set(origin, direction);
  raycaster.near = 0;
  raycaster.far = maxDistance;
  const hits = raycaster.intersectObjects(targets as THREE.Object3D[], true);
  const h = hits[0];
  if (!h) {
    return { origin, direction, point: origin.clone().addScaledVector(direction, maxDistance), distance: maxDistance, hit: false, normal: null };
  }
  return { origin, direction, point: h.point.clone(), distance: h.distance, hit: true, normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null };
}
