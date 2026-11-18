import RAPIER from '@dimforge/rapier3d-compat';
import { mintId, type PrizeContactEvent, type PrizeInstanceId, type ShotId, type TuningConfig, type Vec3 } from '../contracts';
import { len } from './collisions';

interface PrizeBody {
  readonly collider: RAPIER.Collider;
  readonly body: RAPIER.RigidBody;
}

interface NewContact {
  readonly first: number;
  readonly second: number;
  readonly a: PrizeInstanceId;
  readonly b: PrizeInstanceId | null;
}

/** Rapier can announce a pair slightly before it applies an impulse. Keep it until impact or separation. */
export function observePrizeContacts(
  world: RAPIER.World,
  limits: TuningConfig['limits'],
  member: (collider: number) => PrizeInstanceId | null | undefined, // null = shelf, undefined = other
) {
  const queue = new RAPIER.EventQueue(true);
  const moving = new Set<number>();
  const waiting = new Map<string, NewContact>();
  let sequence = 0;

  function beforeStep(prizes: Iterable<PrizeBody>): void {
    moving.clear();
    for (const { body, collider } of prizes) {
      if (!body.isSleeping() && (len(body.linvel()) >= limits.settleLinearSpeed || len(body.angvel()) >= limits.settleAngularSpeed))
        moving.add(collider.handle);
    }
  }

  function afterStep(shotId: ShotId, emit: (event: PrizeContactEvent) => void): void {
    queue.drainCollisionEvents((first, second, started) => {
      const key = first < second ? `${first}|${second}` : `${second}|${first}`;
      if (!started) {
        waiting.delete(key);
        return;
      }
      if (!moving.has(first) && !moving.has(second)) return;
      const one = member(first), two = member(second);
      if (one === undefined || two === undefined || (one === null && two === null)) return;
      const [a, b] = two !== null && (one === null || two < one) ? [two, one] : [one!, two];
      waiting.set(key, { first, second, a, b });
    });
    for (const [key, contact] of waiting) {
      const first = world.getCollider(contact.first), second = world.getCollider(contact.second);
      if (!first || !second) {
        waiting.delete(key);
        continue;
      }
      let impulse = 0;
      let point: Vec3 | null = null;
      world.contactPair(first, second, manifold => {
        if (manifold.numSolverContacts() === 0) return;
        let applied = 0;
        for (let i = 0; i < manifold.numContacts(); i++) applied += manifold.contactImpulse(i);
        if (applied <= 0) return;
        impulse += applied;
        point ??= manifold.solverContactPoint(0);
      });
      if (!point || impulse <= 0) continue;
      emit({ type: 'prizeContact', eventId: mintId.prizeContact(shotId, sequence++), shotId, a: contact.a, b: contact.b, point, impulse });
      waiting.delete(key);
    }
  }

  return { queue, beforeStep, afterStep, startShot() { waiting.clear(); sequence = 0; } };
}
