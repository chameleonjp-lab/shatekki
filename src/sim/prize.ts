/**
 * Prize rigid bodies (Task 06): shape, mass, center of mass, friction, mount
 * (kinematic) vs free (dynamic). Rapier details stay inside src/sim.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type { CollisionShape, Pose, PrizeRuntimeConfig, Vec3 } from '../contracts';

export interface PrizeBodyHandles {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
}

function colliderDescFor(shape: CollisionShape): RAPIER.ColliderDesc {
  switch (shape.kind) {
    case 'box':
      return RAPIER.ColliderDesc.cuboid(shape.halfExtents.x, shape.halfExtents.y, shape.halfExtents.z);
    case 'cylinder':
      return RAPIER.ColliderDesc.cylinder(shape.halfHeight, shape.radius);
    case 'capsule':
      return RAPIER.ColliderDesc.capsule(shape.halfHeight, shape.radius);
    case 'ball':
      return RAPIER.ColliderDesc.ball(shape.radius);
  }
}

/** Principal inertia of the bounding box (a good-enough prototype approximation). */
function boxInertia(shape: CollisionShape, mass: number): Vec3 {
  let hx: number, hy: number, hz: number;
  switch (shape.kind) {
    case 'box':
      ({ x: hx, y: hy, z: hz } = shape.halfExtents);
      break;
    case 'cylinder':
      [hx, hy, hz] = [shape.radius, shape.halfHeight, shape.radius];
      break;
    case 'capsule':
      [hx, hy, hz] = [shape.radius, shape.halfHeight + shape.radius, shape.radius];
      break;
    case 'ball':
      [hx, hy, hz] = [shape.radius, shape.radius, shape.radius];
      break;
  }
  const k = mass / 3;
  return { x: k * (hy * hy + hz * hz), y: k * (hx * hx + hz * hz), z: k * (hx * hx + hy * hy) };
}

export function createPrizeBody(
  world: RAPIER.World,
  config: PrizeRuntimeConfig,
  pose: Pose,
  mounted: boolean,
): PrizeBodyHandles {
  const desc = mounted ? RAPIER.RigidBodyDesc.kinematicPositionBased() : RAPIER.RigidBodyDesc.dynamic();
  desc
    .setTranslation(pose.position.x, pose.position.y, pose.position.z)
    .setRotation(pose.rotation)
    .setLinearDamping(0.05)
    .setAngularDamping(0.2)
    .setCanSleep(true);
  const body = world.createRigidBody(desc);
  const cDesc = colliderDescFor(config.shape)
    .setFriction(config.friction)
    .setRestitution(config.restitution)
    .setMassProperties(config.massKg, config.centerOfMass, boxInertia(config.shape, config.massKg), { x: 0, y: 0, z: 0, w: 1 });
  const collider = world.createCollider(cDesc, body);
  return { body, collider };
}
