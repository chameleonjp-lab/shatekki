/**
 * Periodic prize motion (Task 06, decision 10). Pure functions of the prize's
 * mount base pose and `clocks.motionSec`; no physics, no wall clock. Because
 * the phase is only a function of motionSec, pausing (which stops motionSec)
 * keeps the phase exactly (AC13/AC36).
 */
import type { CollisionShape, Pose, PrizeRuntimeConfig, Quat, SlotGeometry } from '../contracts';
import { IDENTITY_QUAT, quatFromAxisAngle } from '../contracts';
import { shapeHalfHeight, shapeLocalHalfExtents } from '../core/shapes';

/** Where a prize sits when mounted at rest: bottom center on the board top of its slot. */
export function mountBasePose(slot: SlotGeometry, config: PrizeRuntimeConfig): Pose {
  return {
    position: { x: slot.spawnBase.x, y: slot.spawnBase.y + shapeHalfHeight(config.shape), z: slot.spawnBase.z },
    rotation: IDENTITY_QUAT,
  };
}

function qmul(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/**
 * Pose of a mounted prize at `motionSec`. At motionSec 0 every motion starts at
 * the base pose. Never moves below the board top (bob only lifts; swing hangs
 * from the top; the lowest corner is lifted so it does not dip into the shelf).
 */
export function mountedPose(base: Pose, config: PrizeRuntimeConfig, motionSec: number): Pose {
  const m = config.motion;
  const shape: CollisionShape = config.shape;
  switch (m.type) {
    case 'none':
      return base;
    case 'slide': {
      const dx = m.amplitude * Math.sin((2 * Math.PI * motionSec) / m.periodSec);
      return { position: { ...base.position, x: base.position.x + dx }, rotation: base.rotation };
    }
    case 'bob': {
      const dy = m.amplitude * 0.5 * (1 - Math.cos((2 * Math.PI * motionSec) / m.periodSec));
      return { position: { ...base.position, y: base.position.y + dy }, rotation: base.rotation };
    }
    case 'spin': {
      const a = (2 * Math.PI * motionSec) / m.periodSec;
      return { position: base.position, rotation: qmul(quatFromAxisAngle(0, 1, 0, a), base.rotation) };
    }
    case 'swing': {
      const theta = m.amplitudeRad * Math.sin((2 * Math.PI * motionSec) / m.periodSec);
      const hh = shapeHalfHeight(shape);
      const hw = shapeLocalHalfExtents(shape).x;
      // pendulum hanging from the top-center of the prize
      const dx = hh * Math.sin(theta);
      const dy = hh * (1 - Math.cos(theta)) + hw * Math.abs(Math.sin(theta));
      return {
        position: { x: base.position.x + dx, y: base.position.y + dy, z: base.position.z },
        rotation: qmul(quatFromAxisAngle(0, 0, 1, theta), base.rotation),
      };
    }
  }
}

export function isMoving(config: PrizeRuntimeConfig): boolean {
  return config.motion.type !== 'none';
}
