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
import type { AimAngles, BallisticSpec, BoothLayout, Vec3 } from '../contracts';
import { aimDirection as sharedAimDirection, corkFreeFlightPath, muzzlePosition as sharedMuzzle, aimTargetPosition as sharedAimTarget } from '../contracts';

export function muzzlePosition(layout: BoothLayout, standX: number): Vec3 {
  return sharedMuzzle(layout, standX);
}

export function aimTargetPosition(layout: BoothLayout, standX: number): Vec3 {
  return sharedAimTarget(layout, standX);
}

/** Unit direction of the shot for the given stand position and effective aim (src/contracts/aim.ts). */
export function aimDirection(layout: BoothLayout, standX: number, aim: AimAngles): THREE.Vector3 {
  const d = sharedAimDirection(layout, standX, aim);
  return new THREE.Vector3(d.x, d.y, d.z);
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
 * First point where the cork's flight path meets any of `targets`
 * (collision-proxy boxes and visible prize meshes). With `ballistic`, the
 * path is the same gravity-affected free flight the sim integrates, so the
 * reticle shows where the cork really lands (no hidden offset either way).
 * Without it, a straight ray is used.
 */
export function computeReticle(
  layout: BoothLayout,
  standX: number,
  aim: AimAngles,
  targets: readonly THREE.Object3D[],
  maxDistance = 6,
  ballistic?: BallisticSpec,
): ReticleResult {
  const m = muzzlePosition(layout, standX);
  const origin = new THREE.Vector3(m.x, m.y, m.z);
  const direction = aimDirection(layout, standX, aim);
  const objs = targets as THREE.Object3D[];
  if (!ballistic) {
    raycaster.set(origin, direction);
    raycaster.near = 0;
    raycaster.far = maxDistance;
    const h = raycaster.intersectObjects(objs, true)[0];
    if (!h) {
      return { origin, direction, point: origin.clone().addScaledVector(direction, maxDistance), distance: maxDistance, hit: false, normal: null };
    }
    return { origin, direction, point: h.point.clone(), distance: h.distance, hit: true, normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null };
  }
  const maxSec = maxDistance / Math.max(0.1, ballistic.speed);
  const pts = corkFreeFlightPath(m, { x: direction.x, y: direction.y, z: direction.z }, ballistic, maxSec);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const seg = new THREE.Vector3();
  let travelled = 0;
  // Sample every 2 fixed steps (≈ 9 cm at 11 m/s); thin boards are still caught because each segment is a ray.
  for (let i = 0; i < pts.length - 1; i += 2) {
    const p0 = pts[i]!;
    const p1 = pts[Math.min(i + 2, pts.length - 1)]!;
    a.set(p0.x, p0.y, p0.z);
    b.set(p1.x, p1.y, p1.z);
    seg.subVectors(b, a);
    const len = seg.length();
    if (len <= 1e-9) break;
    raycaster.set(a, seg.clone().divideScalar(len));
    raycaster.near = 0;
    raycaster.far = len;
    const h = raycaster.intersectObjects(objs, true)[0];
    if (h) {
      return {
        origin,
        direction,
        point: h.point.clone(),
        distance: travelled + h.distance,
        hit: true,
        normal: h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : null,
      };
    }
    travelled += len;
  }
  const last = pts[pts.length - 1]!;
  return { origin, direction, point: new THREE.Vector3(last.x, last.y, last.z), distance: travelled, hit: false, normal: null };
}
