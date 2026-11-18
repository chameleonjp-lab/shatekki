import { aimDirection, ballisticFor, corkFreeFlightPath, muzzlePosition, type Vec3, type GameplayBundle, type RunState } from '../../src/contracts';

export function aimAt(b: GameplayBundle, standX: number, target: Vec3, bulletType: RunState['bulletType']) {
  const L = b.layout;
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(b.tuning, bulletType);
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const c = path[i]!;
        return a.y + ((c.y - a.y) * (a.z - target.z)) / (a.z - c.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}
