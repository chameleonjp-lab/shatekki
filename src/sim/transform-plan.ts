/**
 * Shape-safe kind changes at the post-flight point (D35, plan EG05).
 * Pure geometry, no physics engine and no RNG: the candidate order is fixed
 * by the planner (core) and only checked here.
 *
 * Order: prizes are processed by slot row, column, then instance id. For each
 * prize with an intent the first candidate whose new shape fits wins. A shape
 * "fits" when its bounding box overlaps neither a static obstacle (boards,
 * walls) nor any other prize by more than TRANSFORM_OVERLAP_TOLERANCE_M. The
 * other prizes are taken at their already accepted new shape if processed, at
 * their current shape otherwise. Nothing is ever moved to make room, and the
 * selected rules determine the pose and swept bounds. No fit defers the whole intent.
 */
import type {
  Box3,
  CollisionShape,
  DeferredTransform,
  EffectRequestId,
  Pose,
  PrizeInstanceId,
  PrizeTypeId,
  StaticSurface,
  TransformPolicy,
  TransformIntent,
} from '../contracts';
import { legacySlotPosition, slotRowColumn } from '../contracts';
import { candidateTransformPose, findShelfSupport, mountedBounds, rebaseMount, type TransformMount } from './transform-placement';
import { boxesOverlap, prizeAabb } from '../core/shapes';

/**
 * The one overlap tolerance for kind changes (m). Penetration of the bounding
 * boxes up to this depth counts as resting contact. PROTOTYPE; the view must
 * not apply a separate rule.
 */
export const TRANSFORM_OVERLAP_TOLERANCE_M = 0.01;

export interface TransformSubject {
  readonly instanceId: PrizeInstanceId;
  readonly homeSlot: string;
  readonly typeId: PrizeTypeId;
  readonly pose: Pose;
  readonly falling?: boolean;
  readonly mount?: TransformMount;
}

export interface AppliedKindChange {
  readonly poseAfter: Pose;
  readonly mountBaseAfter?: Pose;
  readonly instanceId: PrizeInstanceId;
  readonly requestId: EffectRequestId;
  readonly fromTypeId: PrizeTypeId;
  readonly toTypeId: PrizeTypeId;
}

export interface TransformPlanResult {
  /** In processing order (slot row, column, instance id). */
  readonly applied: readonly AppliedKindChange[];
  readonly deferred: readonly DeferredTransform[];
}

export interface TransformPlanInput {
  readonly prizes: readonly TransformSubject[];
  readonly intents: readonly TransformIntent[];
  readonly shapeOf: (typeId: PrizeTypeId) => CollisionShape | undefined;
  /** Static boards / walls (layout surfaces). */
  readonly obstacles: readonly Box3[];
  readonly tolerance?: number;
  readonly policy?: TransformPolicy;
  readonly shelves?: readonly StaticSurface[];
}

/** Row (top = 1), column, for ordering; unknown slots sort last. */
function slotKey(slotId: string): readonly [number, number] {
  const rc = slotRowColumn(slotId) ?? legacySlotPosition(slotId);
  return rc ? [rc.row, rc.column] : [99, 99];
}

export function compareSubjects(a: Pick<TransformSubject, 'homeSlot' | 'instanceId'>, b: Pick<TransformSubject, 'homeSlot' | 'instanceId'>): number {
  const [ar, ac] = slotKey(a.homeSlot);
  const [br, bc] = slotKey(b.homeSlot);
  if (ar !== br) return ar - br;
  if (ac !== bc) return ac - bc;
  return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
}

export function planTransforms(input: TransformPlanInput): TransformPlanResult {
  const tol = input.tolerance ?? TRANSFORM_OVERLAP_TOLERANCE_M;
  const policy = input.policy ?? 'preserve-center';
  const supportedBottom = policy === 'preserve-supported-bottom';
  const subjects = new Map(input.prizes.map((p) => [p.instanceId, p] as const));
  // several intents for one instance: the final one only
  const finalIntent = new Map<PrizeInstanceId, TransformIntent>();
  for (const it of input.intents) if (subjects.has(it.instanceId)) finalIntent.set(it.instanceId, it);

  const boxes = new Map<PrizeInstanceId, Box3>();
  for (const p of input.prizes) {
    const shape = input.shapeOf(p.typeId);
    if (shape) boxes.set(p.instanceId, supportedBottom && p.mount ? mountedBounds(p.mount.base, p.mount.motion, shape, p.mount.anchored) : prizeAabb(shape, p.pose));
  }

  const order = [...finalIntent.keys()].map((id) => subjects.get(id)!).sort(compareSubjects);
  const applied: AppliedKindChange[] = [];
  const deferred: DeferredTransform[] = [];

  for (const p of order) {
    const intent = finalIntent.get(p.instanceId)!;
    let chosen: PrizeTypeId | null = null;
    let chosenBox: Box3 | null = null;
    let chosenPose = p.pose;
    let mountBaseAfter: Pose | undefined;
    const oldShape = input.shapeOf(p.typeId);
    const support = supportedBottom && oldShape ? findShelfSupport(prizeAabb(oldShape, p.pose), input.shelves ?? [], tol) : null;
    for (const candidate of intent.candidateTypeIds) {
      if (candidate === p.typeId) {
        chosen = candidate; // already that kind: nothing to change, nothing to defer
        break;
      }
      const shape = input.shapeOf(candidate);
      if (!shape) continue;
      if (!oldShape) continue;
      const pose = candidateTransformPose(p, oldShape, shape, support, policy);
      const mount = supportedBottom ? p.mount : undefined;
      const base = mount && rebaseMount(mount, shape, pose);
      const box = base && mount ? mountedBounds(base, mount.motion, shape, true) : prizeAabb(shape, pose);
      if (input.obstacles.some((o) => boxesOverlap(box, o, tol))) continue;
      let clear = true;
      for (const [id, other] of boxes) {
        if (id !== p.instanceId && boxesOverlap(box, other, tol)) {
          clear = false;
          break;
        }
      }
      if (!clear) continue;
      chosen = candidate;
      chosenBox = box;
      chosenPose = pose;
      mountBaseAfter = base;
      break;
    }
    if (chosen === null) {
      deferred.push({ instanceId: p.instanceId, requestId: intent.requestId, candidateTypeIds: intent.candidateTypeIds });
    } else if (chosen !== p.typeId) {
      applied.push({ instanceId: p.instanceId, requestId: intent.requestId, fromTypeId: p.typeId, toTypeId: chosen, poseAfter: chosenPose, mountBaseAfter });
      if (chosenBox) boxes.set(p.instanceId, chosenBox);
    }
  }
  return { applied, deferred };
}
