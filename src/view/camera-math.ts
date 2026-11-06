/**
 * Camera math without three.js, so the DOM map (src/ui) can share it with the
 * renderer without pulling WebGL code into the first screen.
 */
import type { BoothLayout } from '../contracts';

/**
 * Wide enough that the side devices stay discoverable on a tall phone, but
 * capped so perspective does not turn into a fish-eye (vertical fov 52..70).
 */
export function fovForAspect(aspect: number, horizontalDeg = 40): number {
  const wantHorizontal = (horizontalDeg * Math.PI) / 180;
  const v = 2 * Math.atan(Math.tan(wantHorizontal / 2) / Math.max(aspect, 0.2));
  return Math.min(70, Math.max(52, (v * 180) / Math.PI));
}

/** Layout v2 horizontal view (degrees): about three and a half columns of the middle board. */
export const V2_HORIZONTAL_FOV_DEG = 34;

/**
 * World x range of the middle board plane that the camera shows for a stand
 * position and canvas aspect (layout v2: the camera looks straight ahead).
 */
export function visibleXRange(layout: BoothLayout, standX: number, aspect: number): { minX: number; maxX: number } {
  const mid = layout.tiers[1]!;
  const depth = layout.camera.eye.z - mid.centerZ;
  const v = (fovForAspect(aspect, V2_HORIZONTAL_FOV_DEG) * Math.PI) / 180;
  const half = Math.tan(v / 2) * Math.max(aspect, 0.2) * depth;
  return { minX: standX - half, maxX: standX + half };
}
