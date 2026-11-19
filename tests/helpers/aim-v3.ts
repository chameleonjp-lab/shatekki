/** Aim solving for layout v3 (r007): any target point, walls included (not a test file). */
import { aimDirection, ballisticFor, corkFreeFlightPath, muzzlePosition, type GameplayBundle, type Vec3 } from '../../src/contracts';

/**
 * Requested yaw/pitch (inside the layout limits, or null) whose free flight passes through `target`.
 * The horizontal heading is exact; the pitch is solved with gravity along that heading.
 */
export function aimThrough(b: GameplayBundle, standX: number, target: Vec3): { yaw: number; pitch: number } | null {
  const L = b.layout;
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const horiz = Math.hypot(target.x - muzzle.x, target.z - muzzle.z);
  const spec = ballisticFor(b.tuning, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      const da = Math.hypot(path[i - 1]!.x - muzzle.x, path[i - 1]!.z - muzzle.z);
      const db = Math.hypot(path[i]!.x - muzzle.x, path[i]!.z - muzzle.z);
      if (db >= horiz) {
        const a = path[i - 1]!;
        const c = path[i]!;
        return a.y + ((c.y - a.y) * (horiz - da)) / Math.max(1e-9, db - da);
      }
    }
    return -Infinity;
  };
  let lo = L.camera.pitchMin;
  let hi = L.camera.pitchMax;
  if (yAt(hi) < target.y || yAt(lo) > target.y) return null;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  const aim = { yaw, pitch: (lo + hi) / 2 };
  return Math.abs(aim.yaw) <= L.camera.yawLimit + 1e-9 ? aim : null;
}
