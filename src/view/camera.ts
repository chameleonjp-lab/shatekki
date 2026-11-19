/**
 * Portrait camera pose (Task 11). The camera never follows sway or aim:
 * it only depends on the stand position and the canvas aspect.
 */
import * as THREE from 'three';
import type { BoothLayout, Vec3 } from '../contracts';
import { V2_HORIZONTAL_FOV_DEG, fovForAspect } from './camera-math';

export { V2_HORIZONTAL_FOV_DEG, fovForAspect };

export interface CameraPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fovDeg: number;
}

/** r007: share of the aim the camera turns with, and the horizontal view (degrees). */
export const V3_YAW_FOLLOW = 0.85;
export const V3_PITCH_FOLLOW = 0.5;
export const V3_HORIZONTAL_FOV_DEG = 44;

/** Share of the stand offset the camera looks toward (0 = always shelf centre line, 1 = straight ahead). */
const LOOK_FOLLOW = 0.6;

/**
 * Layout v2 (12 columns): the camera looks straight ahead from the stand
 * position and follows it continuously, so the zero aim, the reticle and the
 * picture agree. 34 degrees of horizontal view shows about three and a half
 * columns of the middle board (0.42 m pitch) whatever the phone's aspect.
 */
export function cameraPose(layout: BoothLayout, standX: number, aspect: number, aim?: { readonly yaw: number; readonly pitch: number }): CameraPose {
  const mid = layout.tiers[1]!;
  if (layout.slotModel === 'v3-36') {
    // r007: the view turns with the player's own aim input only (never sway, power or effects):
    // the full yaw, so a side wall comes into view when aimed at, and part of the pitch.
    const eye = { x: standX, y: layout.camera.eye.y, z: layout.camera.eye.z };
    const base = { x: 0, y: mid.topY + 0.03 - eye.y, z: mid.centerZ - eye.z };
    const dist = Math.hypot(base.x, base.y, base.z);
    const yaw = (aim?.yaw ?? 0) * V3_YAW_FOLLOW;
    const pitch = Math.atan2(base.y, Math.hypot(base.x, base.z)) + (aim?.pitch ?? 0) * V3_PITCH_FOLLOW;
    const cp = Math.cos(pitch);
    return {
      eye,
      target: { x: eye.x + Math.sin(yaw) * cp * dist, y: eye.y + Math.sin(pitch) * dist, z: eye.z - Math.cos(yaw) * cp * dist },
      fovDeg: fovForAspect(aspect, V3_HORIZONTAL_FOV_DEG),
    };
  }
  if (layout.slotModel === 'v2-36') {
    return {
      eye: { x: standX, y: layout.camera.eye.y, z: layout.camera.eye.z },
      target: { x: standX, y: mid.topY + 0.03, z: mid.centerZ },
      fovDeg: fovForAspect(aspect, V2_HORIZONTAL_FOV_DEG),
    };
  }
  return {
    eye: { x: standX, y: layout.camera.eye.y, z: layout.camera.eye.z },
    target: { x: standX * LOOK_FOLLOW, y: mid.topY + 0.03, z: mid.centerZ },
    fovDeg: fovForAspect(aspect),
  };
}

export function applyCameraPose(camera: THREE.PerspectiveCamera, pose: CameraPose, aspect: number): void {
  camera.fov = pose.fovDeg;
  camera.aspect = aspect;
  camera.near = 0.05;
  camera.far = 30;
  camera.position.set(pose.eye.x, pose.eye.y, pose.eye.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}
