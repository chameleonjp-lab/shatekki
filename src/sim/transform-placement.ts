import type { Box3, CollisionShape, MotionSpec, Pose, PrizeTypeId, StaticSurface, TransformPolicy } from '../contracts';
import { prizeAabb, shapeLocalHalfExtents } from '../core/shapes';
import { mountedPoseForShape } from './motion';
import type { TransformSubject } from './transform-plan';

export interface TransformSupport {
  readonly surfaceId: string;
  readonly topY: number;
}

export interface TransformMount {
  readonly base: Pose;
  readonly motion: MotionSpec;
  readonly motionTypeId: PrizeTypeId;
  readonly motionSec: number;
  readonly anchored: boolean;
}

/** A mount can be lifted or overhanging, and a loose prize can rest on a shelf. */
export function findShelfSupport(box: Box3, shelves: readonly StaticSurface[], tolerance: number): TransformSupport | null {
  const bottom = box.center.y - box.halfExtents.y;
  for (const { id, box: board } of shelves) {
    const topY = board.center.y + board.halfExtents.y;
    if (Math.abs(bottom - topY) > tolerance) continue;
    if (Math.abs(box.center.x - board.center.x) >= box.halfExtents.x + board.halfExtents.x) continue;
    if (Math.abs(box.center.z - board.center.z) >= box.halfExtents.z + board.halfExtents.z) continue;
    return { surfaceId: id, topY };
  }
  return null;
}

export function candidateTransformPose(subject: TransformSubject, oldShape: CollisionShape, newShape: CollisionShape, support: TransformSupport | null, policy: TransformPolicy): Pose {
  const { pose } = subject;
  if (policy === 'preserve-center' || subject.falling || !support) return pose;
  const delta = prizeAabb(newShape, pose).halfExtents.y - prizeAabb(oldShape, pose).halfExtents.y;
  return { position: { ...pose.position, y: pose.position.y + delta }, rotation: pose.rotation };
}

/** Shift the upright mount origin so the new curve passes through the accepted pose at this exact phase. */
export function rebaseMount(mount: TransformMount, shape: CollisionShape, pose: Pose): Pose {
  const predicted = mountedPoseForShape(mount.base, mount.motion, shape, mount.motionSec);
  const base = mount.base;
  return {
    rotation: base.rotation,
    position: {
      x: base.position.x + pose.position.x - predicted.position.x,
      y: base.position.y + pose.position.y - predicted.position.y,
      z: base.position.z + pose.position.z - predicted.position.z,
    },
  };
}

/** Maximum of a |cos(t)| + b |sin(t)| over a symmetric interval. */
function peak(a: number, b: number, limit: number): number {
  const angle = Math.min(Math.abs(limit), Math.atan2(b, a));
  return a * Math.cos(angle) + b * Math.sin(angle);
}

/** Swept world box of an upright periodic mount, including extrema between the end angles. */
export function mountedBounds(base: Pose, motion: MotionSpec, shape: CollisionShape, anchored: boolean): Box3 {
  const h = shapeLocalHalfExtents(shape);
  const c = base.position;
  switch (motion.type) {
    case 'none': return prizeAabb(shape, base);
    case 'slide': return { center: c, halfExtents: { ...h, x: h.x + Math.abs(motion.amplitude) } };
    case 'bob': return { center: { ...c, y: c.y + motion.amplitude / 2 }, halfExtents: { ...h, y: h.y + Math.abs(motion.amplitude) / 2 } };
    case 'spin': {
      const radius = Math.hypot(h.x, h.z);
      return { center: c, halfExtents: { x: radius, y: h.y, z: radius } };
    }
    case 'swing': {
      const a = Math.abs(motion.amplitudeRad);
      const minY = c.y - h.y;
      // A corrected swing keeps the bottom fixed. The legacy swing lifts the pivot
      // as well; its conservative upper bound must cover that older trajectory.
      const maxY = anchored
        ? minY + 2 * peak(h.y, h.x, a)
        : c.y + h.y + 2 * h.x * Math.sin(Math.min(a, Math.PI / 2)) + 2 * h.y * Math.max(0, -Math.cos(Math.min(a, Math.PI)));
      return {
        center: { ...c, y: (minY + maxY) / 2 },
        halfExtents: { x: peak(h.x, 2 * h.y, a), y: (maxY - minY) / 2, z: h.z },
      };
    }
  }
}
