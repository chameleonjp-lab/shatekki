/**
 * Portrait camera pose (Task 11). The camera never follows sway or aim:
 * it only depends on the stand position and the canvas aspect.
 */
import * as THREE from 'three';
import type { BoothLayout, Vec3 } from '../contracts';

export interface CameraPose {
  readonly eye: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fovDeg: number;
}

/** Share of the stand offset the camera looks toward (0 = always shelf centre line, 1 = straight ahead). */
const LOOK_FOLLOW = 0.6;

/**
 * Wide enough that the side devices stay discoverable on a tall phone, but
 * capped so perspective does not turn into a fish-eye (vertical fov 52..70).
 */
export function fovForAspect(aspect: number, horizontalDeg = 40): number {
  const wantHorizontal = (horizontalDeg * Math.PI) / 180;
  const v = 2 * Math.atan(Math.tan(wantHorizontal / 2) / Math.max(aspect, 0.2));
  return Math.min(70, Math.max(52, (v * 180) / Math.PI));
}

/**
 * Layout v2 (12 columns): the camera looks straight ahead from the stand
 * position and follows it continuously, so the zero aim, the reticle and the
 * picture agree. 34 degrees of horizontal view shows about three and a half
 * columns of the middle board (0.42 m pitch) whatever the phone's aspect.
 */
export const V2_HORIZONTAL_FOV_DEG = 34;

export function cameraPose(layout: BoothLayout, standX: number, aspect: number): CameraPose {
  const mid = layout.tiers[1]!;
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
