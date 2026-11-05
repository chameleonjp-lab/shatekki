/** Pure geometry helpers for prize shapes (no physics engine). */
import type { Box3, CollisionShape, Pose, Vec3 } from '../contracts';

/** Half height of the shape's bounding box (distance from center to bottom). */
export function shapeHalfHeight(shape: CollisionShape): number {
  switch (shape.kind) {
    case 'box':
      return shape.halfExtents.y;
    case 'cylinder':
      return shape.halfHeight;
    case 'capsule':
      return shape.halfHeight + shape.radius;
    case 'ball':
      return shape.radius;
  }
}

/** Half extents of the axis-aligned bounding box of the unrotated shape. */
export function shapeLocalHalfExtents(shape: CollisionShape): Vec3 {
  switch (shape.kind) {
    case 'box':
      return shape.halfExtents;
    case 'cylinder':
      return { x: shape.radius, y: shape.halfHeight, z: shape.radius };
    case 'capsule':
      return { x: shape.radius, y: shape.halfHeight + shape.radius, z: shape.radius };
    case 'ball':
      return { x: shape.radius, y: shape.radius, z: shape.radius };
  }
}

/** Conservative world AABB of a posed shape (rotated bounding box, then axis-aligned). */
export function prizeAabb(shape: CollisionShape, pose: Pose): Box3 {
  const h = shapeLocalHalfExtents(shape);
  const { x, y, z, w } = pose.rotation;
  // absolute value of the rotation matrix
  const r00 = Math.abs(1 - 2 * (y * y + z * z));
  const r01 = Math.abs(2 * (x * y - z * w));
  const r02 = Math.abs(2 * (x * z + y * w));
  const r10 = Math.abs(2 * (x * y + z * w));
  const r11 = Math.abs(1 - 2 * (x * x + z * z));
  const r12 = Math.abs(2 * (y * z - x * w));
  const r20 = Math.abs(2 * (x * z - y * w));
  const r21 = Math.abs(2 * (y * z + x * w));
  const r22 = Math.abs(1 - 2 * (x * x + y * y));
  return {
    center: pose.position,
    halfExtents: {
      x: r00 * h.x + r01 * h.y + r02 * h.z,
      y: r10 * h.x + r11 * h.y + r12 * h.z,
      z: r20 * h.x + r21 * h.y + r22 * h.z,
    },
  };
}

/** Strict overlap of two AABBs (touching faces do not overlap; eps shrinks both). */
export function boxesOverlap(a: Box3, b: Box3, eps = 1e-6): boolean {
  return (
    Math.abs(a.center.x - b.center.x) < a.halfExtents.x + b.halfExtents.x - eps &&
    Math.abs(a.center.y - b.center.y) < a.halfExtents.y + b.halfExtents.y - eps &&
    Math.abs(a.center.z - b.center.z) < a.halfExtents.z + b.halfExtents.z - eps
  );
}
