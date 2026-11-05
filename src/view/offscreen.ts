/**
 * Off-screen success cue geometry (Task 12, AC26). Pure: no DOM, no WebGL.
 *
 * `offscreenIndicator` returns null when the point is inside the frame;
 * otherwise a position on the screen edge (CSS pixels, y down) and the arrow
 * angle in radians (0 = right, +PI/2 = down, CSS rotate convention).
 * The camera's matrixWorldInverse must be current (renderer updates it).
 */
import * as THREE from 'three';

export interface OffscreenIndicator {
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export const OFFSCREEN_MARGIN_PX = 28;
const v4 = new THREE.Vector4();

export function offscreenIndicator(camera: THREE.Camera, point: { x: number; y: number; z: number }, width: number, height: number): OffscreenIndicator | null {
  v4.set(point.x, point.y, point.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  let nx: number;
  let ny: number;
  if (v4.w <= 1e-6) {
    nx = -v4.x; // behind the camera: mirror so the arrow points the way to turn
    ny = -v4.y;
  } else {
    nx = v4.x / v4.w;
    ny = v4.y / v4.w;
    if (nx >= -1 && nx <= 1 && ny >= -1 && ny <= 1 && v4.z / v4.w <= 1) return null;
  }
  if (Math.abs(nx) < 1e-6 && Math.abs(ny) < 1e-6) {
    nx = 0;
    ny = -1; // exactly behind: a downward arrow
  }
  const dx = nx * (width / 2);
  const dy = -ny * (height / 2);
  const hx = Math.max(1, width / 2 - OFFSCREEN_MARGIN_PX);
  const hy = Math.max(1, height / 2 - OFFSCREEN_MARGIN_PX);
  const k = Math.min(hx / Math.max(Math.abs(dx), 1e-9), hy / Math.max(Math.abs(dy), 1e-9));
  return { x: width / 2 + dx * k, y: height / 2 + dy * k, angle: Math.atan2(dy, dx) };
}
