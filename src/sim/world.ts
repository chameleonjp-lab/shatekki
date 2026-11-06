/**
 * The physics world (Task 05/06). Implements ShotWorld with Rapier.
 *
 * - Static booth colliders come from BOOTH_LAYOUT only.
 * - Prizes are rigid bodies; mounted moving prizes are kinematic and follow
 *   mountedPose(motionClock). They detach (become dynamic) on HP 0 or a strong
 *   impulse, and are never "held" in a way that makes settle wait for them.
 * - Corks are swept spheres (castShape) advanced in fixed steps, so a fast cork
 *   cannot tunnel through a thin board.
 * - No points are computed here. The ShotRecord reports what happened.
 * - Stages: flight -> transform (reserved transforms, decision 32) -> settle -> grace (decision 33).
 * - Devices (Task 08): each acts once per shot across the original and split corks; ordinary reflection repeats.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import type {
  AimPreview,
  AppliedTransform,
  BackgroundCellGeometry,
  BackgroundCellId,
  BarrierId,
  BoothLayout,
  DeferredTransform,

  DeviceActivation,
  DeviceKind,
  EffectPlan,
  EffectRequest,
  EventId,
  ExpansionLimits,
  FlightBarrier,
  FirstHitKey,
  ImpactTarget,
  LoadResult,
  Pose,
  PrizeFrame,
  PrizeHitRecord,
  PrizeInstanceId,
  PrizeInstanceState,
  PrizeOutcome,
  PrizeRuntimeConfig,
  PrizeTransformedEvent,
  PrizeTypeId,
  ProjectileEndReason,
  ProjectileFrame,
  RunId,
  RuntimeCatalog,
  ShelfState,
  ShopkeeperPart,
  ShotContext,
  ShotId,
  ShotRecord,
  RewardTargetGeometry,
  ShotRequest,
  ShotStage,
  ShotModifiers,
  ShotWorld,
  SimEvent,
  SimulationFrame,
  SimulationStep,
  SlotGeometry,
  SurfaceMaterial,
  TuningConfig,
  Vec3,
} from '../contracts';
import { ballisticForModifiers, mintId } from '../contracts';
import { MAX_POWER_MULTIPLIER, nextPowerMultiplier, splitVelocities, transformedHp } from '../core/gimmicks';
import { prizeAabb } from '../core/shapes';
import {
  CONTACT_DEDUPE_SEC,
  CORK_STOP_SPEED,
  GRAVITY,
  TANGENTIAL_KEEP,
  add,
  bounceFactor,
  dot,
  len,
  normalize,
  reflectVelocity,
  scale,
} from './collisions';
import { mountBasePose, mountedPose } from './motion';
import { createPrizeBody } from './prize';
import { DETACH_IMPULSE_RATIO, damageFor, impulseFor, initialSpeed, reflectionLimitFor, type Projectile, type ProjectileExpanded } from './shot';
import { planTransforms } from './transform-plan';

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

type StaticTarget =
  | { readonly t: 'surface'; readonly id: string; readonly material: SurfaceMaterial }
  | { readonly t: 'device'; readonly deviceId: ReturnType<typeof mintId.device>; readonly kind: DeviceKind }
  | { readonly t: 'shopkeeper'; readonly part: ShopkeeperPart }
  | { readonly t: 'hidden'; readonly targetId: string }
  | { readonly t: 'cell'; readonly cellId: BackgroundCellId }
  /** A5: the last-shot target, a solid disc that exists for one shot only. */
  | { readonly t: 'rewardTarget' };
type Target = StaticTarget | { readonly t: 'prize'; readonly id: PrizeInstanceId };

const SURFACE_FRICTION: Readonly<Record<SurfaceMaterial, number>> = { wood: 0.5, cloth: 0.8, paper: 0.6, metal: 0.35, plastic: 0.45 };
/** Falling = moving down faster than this (m/s). */
const FALL_SPEED = 0.4;
const NEAR_EDGE_M = 0.04;
const NUDGE = 1e-4;
const MAX_HITS_PER_STEP = 4;
const MAX_FIXED_STEPS_PER_CALL = 4000;

interface LivePrize {
  src: PrizeInstanceState;
  cfg: PrizeRuntimeConfig;
  /** Config whose periodic motion the mount keeps running (differs from cfg after an expanded kind change). */
  motionCfg: PrizeRuntimeConfig;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  hp: number;
  mounted: boolean;
  base: Pose | null;
  startX: number;
  startZ: number;
  hits: PrizeHitRecord[];
  baseFriction: number;
  hpZeroApplied: boolean;
}

interface ActiveShot {
  readonly request: ShotRequest;
  readonly context: ShotContext;
  readonly runId: RunId;
  readonly shotId: ShotId;
  elapsed: number;
  stage: ShotStage;
  projectiles: Projectile[];
  eventCounter: number;
  quietSec: number;
  settleSec: number;
  graceSec: number;
  graceUsed: boolean;
  endedByLimit: boolean;
  collected: { instanceId: PrizeInstanceId; typeId: PrizeTypeId }[];
  firstHit: FirstHitKey[];
  /** Devices that already acted in this shot, shared by the original and all split corks (decision 31). */
  usedDevices: Set<string>;
  activations: DeviceActivation[];
  transformReserved: boolean;
  transforms: PrizeTransformedEvent[];
  nextProjectileIndex: number;
  /** Expanded rules only (null = rules-v1 pipeline). */
  readonly expanded: NonNullable<ShotContext['expanded']> | null;
  readonly usableCells: ReadonlySet<BackgroundCellId>;
  readonly activatedCells: Set<BackgroundCellId>;
  readonly requests: PendingRequest[];
  /** Contact sequence inside the current fixed step (reset every step). */
  contactSeq: number;
  barrierId: BarrierId | null;
  applied: AppliedTransform[];
  deferred: DeferredTransform[];
  /** A5: best ring touched by any cork of this shot. */
  targetHit: 'center' | 'outer' | null;
}

interface PendingRequest {
  readonly source: EffectRequest['source'];
  readonly simTimeSec: number;
  readonly contactOrder: number;
  readonly targetId: string;
}

const vec = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z });

/** Impact surface id of the A5 target (the view and sounds treat it as a paper surface). */
export const REWARD_TARGET_SURFACE_ID = 'reward-target';
const REWARD_TARGET_HALF_THICKNESS = 0.006;

/** Proposed expanded limits (effects appendix 3.2); the bundle may pass its own. */
export interface ShotWorldOptions {
  readonly limits?: Pick<ExpansionLimits, 'reflections' | 'maxPowerMultiplier'>;
}
export const DEFAULT_EXPANDED_SHOT_LIMITS: NonNullable<ShotWorldOptions['limits']> = { reflections: { min: 4, max: 10 }, maxPowerMultiplier: MAX_POWER_MULTIPLIER };

type KindChangeInfo = Omit<PrizeTransformedEvent, 'type' | 'eventId' | 'shotId'>;

export async function createShotWorld(layout: BoothLayout, catalog: RuntimeCatalog, tuning: TuningConfig, options: ShotWorldOptions = {}): Promise<ShotWorld> {
  await initRapier();
  const xLimits = options.limits ?? DEFAULT_EXPANDED_SHOT_LIMITS;
  const fixedDt = tuning.limits.fixedStepSec;
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = fixedDt;

  const targets = new Map<number, Target>();
  const live = new Map<PrizeInstanceId, LivePrize>();
  const slotById = new Map<string, SlotGeometry>(layout.slots.map((s) => [s.slotId, s]));
  const corkShape = new RAPIER.Ball(tuning.cork.radius);
  const ballCache = new Map<number, RAPIER.Ball>();
  const ballFor = (radius: number): RAPIER.Ball => {
    let b = ballCache.get(radius);
    if (!b) ballCache.set(radius, (b = new RAPIER.Ball(radius)));
    return b;
  };
  const IDENT = { x: 0, y: 0, z: 0, w: 1 };

  // ---- static colliders (from the layout only)
  const fixedBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const addStatic = (box: { center: Vec3; halfExtents: Vec3 }, friction: number, target: StaticTarget) => {
    const c = world.createCollider(
      RAPIER.ColliderDesc.cuboid(box.halfExtents.x, box.halfExtents.y, box.halfExtents.z)
        .setTranslation(box.center.x, box.center.y, box.center.z)
        .setFriction(friction)
        .setRestitution(0),
      fixedBody,
    );
    targets.set(c.handle, target);
  };
  for (const s of layout.surfaces) addStatic(s.box, SURFACE_FRICTION[s.material], { t: 'surface', id: s.id, material: s.material });
  for (const d of layout.devices) addStatic(d.box, SURFACE_FRICTION.metal, { t: 'device', deviceId: d.deviceId, kind: d.kind });
  for (const p of layout.shopkeeper) addStatic(p.box, SURFACE_FRICTION.cloth, { t: 'shopkeeper', part: p.part });
  for (const h of layout.hiddenTargets) addStatic(h.box, SURFACE_FRICTION.wood, { t: 'hidden', targetId: h.targetId });
  // Layout v2: thin solid boxes on the back wall. Real surfaces (corks reflect, prizes in front block them).
  const cellGeoms: readonly BackgroundCellGeometry[] = [...(layout.backgroundCells ?? [])].sort((a, b) => (a.cellId < b.cellId ? -1 : 1));
  for (const c of cellGeoms) addStatic(c.box, SURFACE_FRICTION.wood, { t: 'cell', cellId: c.cellId });
  /** One cell per contact: the cell whose face contains the point (boundary tolerance, then lowest id). */
  const CELL_EDGE_EPS = 1e-6;
  const cellAtPoint = (pt: Vec3, hitCell: BackgroundCellId): BackgroundCellId => {
    for (const c of cellGeoms) {
      const b = c.box;
      if (Math.abs(pt.x - b.center.x) <= b.halfExtents.x + CELL_EDGE_EPS && Math.abs(pt.y - b.center.y) <= b.halfExtents.y + CELL_EDGE_EPS) return c.cellId;
    }
    return hitCell;
  };

  // ---- A5: the target collider exists only while its shot flies
  let rewardTargetCollider: RAPIER.Collider | null = null;
  const removeRewardTarget = (): void => {
    if (!rewardTargetCollider) return;
    targets.delete(rewardTargetCollider.handle);
    world.removeCollider(rewardTargetCollider, false);
    rewardTargetCollider = null;
  };
  const addRewardTarget = (g: RewardTargetGeometry): void => {
    removeRewardTarget();
    // A thin cylinder whose axis points at the player (+z): rotate the y-axis cylinder 90° about x.
    const half = Math.SQRT1_2;
    const c = world.createCollider(
      RAPIER.ColliderDesc.cylinder(REWARD_TARGET_HALF_THICKNESS, g.outerRadius)
        .setTranslation(g.center.x, g.center.y, g.center.z)
        .setRotation({ x: half, y: 0, z: 0, w: half })
        .setFriction(SURFACE_FRICTION.paper)
        .setRestitution(0),
      fixedBody,
    );
    targets.set(c.handle, { t: 'rewardTarget' });
    rewardTargetCollider = c;
  };

  // ---- state
  let simTime = 0;
  let motionClock = 0;
  let acc = 0;
  let active: ActiveShot | null = null;
  let pending: SimEvent[] = [];
  let justCollected: PrizeFrame[] = [];
  let finished: ShotRecord | null = null;
  let disposed = false;

  const emit = (build: (id: EventId, shotId: ShotId) => SimEvent): void => {
    if (!active) return;
    pending.push(build(mintId.event(active.shotId, active.eventCounter++), active.shotId));
  };

  const prizeFrame = (p: LivePrize): PrizeFrame => {
    const t = p.body.translation();
    const r = p.body.rotation();
    return {
      instanceId: p.src.instanceId,
      typeId: p.src.typeId,
      position: vec(t),
      rotation: { x: r.x, y: r.y, z: r.z, w: r.w },
      hp: p.hp,
      maxHp: p.src.maxHp,
      mounted: p.mounted,
      collected: false,
      ...(p.src.motionTypeId !== undefined ? { motionTypeId: p.src.motionTypeId } : {}),
    };
  };

  const projectileFrames = (): ProjectileFrame[] =>
    (active?.projectiles ?? [])
      .filter((p) => !p.ended)
      .map((p): ProjectileFrame => ({
        projectileId: p.id,
        position: p.position,
        velocity: p.velocity,
        bulletType: p.bulletType,
        powerMultiplier: p.powerMultiplier,
        ...(p.x ? { radius: p.x.radius } : {}),
      }));

  const buildFrame = (events: readonly SimEvent[]): SimulationFrame => ({
    simTimeSec: simTime,
    shotId: active?.shotId ?? null,
    stage: active?.stage ?? null,
    prizes: [...[...live.values()].map(prizeFrame), ...justCollected],
    projectiles: projectileFrames(),
    events,
  });

  // ---- prizes
  const removeLive = (p: LivePrize) => {
    targets.delete(p.collider.handle);
    world.removeRigidBody(p.body);
    live.delete(p.src.instanceId);
  };

  const clearPrizes = () => {
    for (const p of [...live.values()]) removeLive(p);
    justCollected = [];
  };

  const refreshQueries = () => {
    world.step(); // Rapier updates its scene-query structures during step()
  };

  const syncShelf = (shelf: ShelfState, motionSec: number): void => {
    if (active) throw new Error('syncShelf while a shot is in progress');
    clearPrizes();
    motionClock = motionSec;
    for (const src of shelf.prizes) {
      if (src.collected) continue;
      const cfg = catalog.prizes.get(src.typeId);
      if (!cfg) throw new RangeError(`unknown prize type ${src.typeId}`);
      const slot = slotById.get(src.homeSlot);
      const motionCfg = (src.motionTypeId !== undefined ? catalog.prizes.get(src.motionTypeId) : undefined) ?? cfg;
      const mounted = src.mounted && motionCfg.motion.type !== 'none' && slot !== undefined;
      const base = mounted ? mountBasePose(slot!, motionCfg) : null;
      const pose = mounted ? mountedPose(base!, motionCfg, motionSec) : src.pose;
      const { body, collider } = createPrizeBody(world, cfg, pose, mounted);
      targets.set(collider.handle, { t: 'prize', id: src.instanceId });
      const lp: LivePrize = {
        src,
        cfg,
        motionCfg,
        body,
        collider,
        hp: src.hp,
        mounted,
        base,
        startX: pose.position.x,
        startZ: pose.position.z,
        hits: [],
        baseFriction: cfg.friction,
        hpZeroApplied: false,
      };
      if (src.hp <= 0) applyHpZero(lp);

      live.set(src.instanceId, lp);
    }
    refreshQueries();
    for (const p of live.values()) if (!p.mounted) p.body.sleep();
  };

  function applyHpZero(p: LivePrize): void {
    if (p.hpZeroApplied) return;
    p.hpZeroApplied = true;
    p.collider.setFriction(p.baseFriction * tuning.hpZero.frictionMultiplier);
  }

  const detach = (p: LivePrize): void => {
    if (!p.mounted) return;
    p.mounted = false;
    p.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
  };

  const updateMounted = (): void => {
    for (const p of live.values()) {
      if (!p.mounted || !p.base) continue;
      const pose = mountedPose(p.base, p.motionCfg, motionClock);
      p.body.setNextKinematicTranslation(pose.position);
      p.body.setNextKinematicRotation(pose.rotation);
    }
  };

  // ---- cork hits
  const targetImpact = (t: Target, activated: boolean): ImpactTarget => {
    switch (t.t) {
      case 'surface':
        return { kind: 'surface', surfaceId: t.id, material: t.material };
      case 'device':
        return { kind: 'device', deviceId: t.deviceId, deviceKind: t.kind, activated };
      case 'shopkeeper':
        return { kind: 'shopkeeper', part: t.part };
      case 'hidden':
        return { kind: 'hidden', targetId: t.targetId };
      case 'cell':
        return { kind: 'cell', cellId: t.cellId, activated };
      case 'rewardTarget':
        // Reported as a paper surface so sounds and views need no new kind; points never come from it.
        return { kind: 'surface', surfaceId: REWARD_TARGET_SURFACE_ID, material: 'paper' };
      case 'prize': {
        const p = live.get(t.id)!;
        return { kind: 'prize', instanceId: t.id, typeId: p.src.typeId, material: p.cfg.material };
      }
    }
  };
  const targetKey = (t: Target): string => {
    switch (t.t) {
      case 'surface':
        return `s:${t.id}`;
      case 'device':
        return `d:${t.deviceId}`;
      case 'shopkeeper':
        return `k:${t.part}`;
      case 'hidden':
        return `h:${t.targetId}`;
      case 'cell':
        return `c:${t.cellId}`;
      case 'rewardTarget':
        return 't:reward';
      case 'prize':
        return `p:${t.id}`;
    }
  };
  const targetMaterial = (t: Target): SurfaceMaterial | PrizeRuntimeConfig['material'] => {
    switch (t.t) {
      case 'surface':
        return t.material;
      case 'device':
        return 'metal';
      case 'shopkeeper':
        return 'cloth';
      case 'hidden':
      case 'cell':
        return 'wood';
      case 'rewardTarget':
        return 'paper';
      case 'prize':
        return live.get(t.id)!.cfg.material;
    }
  };

  const endProjectile = (a: ActiveShot, p: Projectile, reason: ProjectileEndReason): void => {
    if (p.ended) return;
    p.ended = true;
    if (reason === 'reflectionLimit' || reason === 'timeLimit') a.endedByLimit = true;
    emit((eventId, shotId) => ({ type: 'projectileEnded', eventId, shotId, projectileId: p.id, reason, position: p.position }));
  };

  const hitPrize = (a: ActiveShot, p: Projectile, lp: LivePrize, point: Vec3, speed: number, dir: Vec3): void => {
    const load: LoadResult = a.request.load;
    const damage = damageFor(speed, p, load, tuning);
    const hpBefore = lp.hp;
    lp.hp = Math.max(0, lp.hp - damage);
    const hpZero = lp.hp <= 0;
    lp.hits.push({ projectileId: p.id, generation: p.generation, reflectionIndex: p.reflections, damage });
    emit((eventId, shotId) => ({
      type: 'prizeDamaged',
      eventId,
      shotId,
      instanceId: lp.src.instanceId,
      hpBefore,
      hpAfter: lp.hp,
      maxHp: lp.src.maxHp,
    }));
    if (hpZero) applyHpZero(lp);
    let impulse = impulseFor(speed, p, load, tuning);
    if (hpZero) impulse *= tuning.hpZero.pushMultiplier;
    if (lp.mounted && (hpZero || impulse >= tuning.cork.baseImpulse * DETACH_IMPULSE_RATIO)) detach(lp);
    if (!lp.mounted) lp.body.applyImpulseAtPoint(scale(dir, impulse), point, true);
  };

  const onCorkHit = (a: ActiveShot, p: Projectile, hitTarget: Target, hitNormal: Vec3, hitTimeSec: number): void => {
    const speed = len(p.velocity);
    const dir = normalize(p.velocity);
    let n = normalize(hitNormal);
    if (len(n) === 0 || dot(n, p.velocity) > 0) n = len(n) === 0 ? scale(dir, -1) : scale(n, -1);
    const point = add(p.position, scale(n, -(p.x?.radius ?? tuning.cork.radius)));
    const target: Target = hitTarget.t === 'cell' ? { t: 'cell', cellId: cellAtPoint(point, hitTarget.cellId) } : hitTarget;
    const key = targetKey(target);
    const last = p.lastContact.get(key);
    const continuing = last !== undefined && simTime - last <= CONTACT_DEDUPE_SEC;
    p.lastContact.set(key, simTime);

    let splitNow = false;
    if (!continuing) {
      const reflectionIndex = p.reflections;
      const activated =
        (target.t === 'device' && !a.usedDevices.has(target.deviceId)) ||
        (target.t === 'cell' && a.usableCells.has(target.cellId) && !a.activatedCells.has(target.cellId));
      emit((eventId, shotId) => ({
        type: 'impact',
        eventId,
        runId: a.runId,
        shotId,
        projectileId: p.id,
        target: targetImpact(target, activated),
        point,
        normal: n,
        speed,
        reflectionIndex,
      }));
      if (target.t === 'device' && activated) splitNow = activateDevice(a, p, target.deviceId, target.kind, hitTimeSec);
      if (target.t === 'cell' && activated) {
        a.activatedCells.add(target.cellId);
        recordRequest(a, { kind: 'cell', cellId: target.cellId }, hitTimeSec, target.cellId);
      }
      if (target.t === 'prize') hitPrize(a, p, live.get(target.id)!, point, speed, dir);
      if (target.t === 'rewardTarget') {
        // The target faces the player: the ring is the distance from its center in the x-y plane.
        const g = a.expanded?.rewardTarget;
        if (g) {
          const d = Math.hypot(point.x - g.center.x, point.y - g.center.y);
          const ring = d <= g.centerRadius + 1e-6 ? 'center' : 'outer';
          if (a.targetHit !== 'center') a.targetHit = ring;
        }
      }
      if (target.t === 'shopkeeper') a.firstHit.push(`shopkeeper:${target.part}`);
      if (target.t === 'hidden') a.firstHit.push(`hidden:${target.targetId}`);
    }

    const bullet = tuning.bulletTypes[p.bulletType];
    const e = tuning.cork.restitution * bullet.restitution * bounceFactor(targetMaterial(target)) * (p.x ? p.x.restitutionMult : 1);
    p.velocity = reflectVelocity(p.velocity, n, e, TANGENTIAL_KEEP);
    p.position = add(p.position, scale(n, NUDGE));
    if (!continuing) p.reflections += 1;
    const wouldStop = len(p.velocity) < CORK_STOP_SPEED;
    const wouldHitLimit = p.reflections >= reflectionLimitFor(p, tuning);
    if (splitNow && !wouldStop && !wouldHitLimit && splitCork(a, p, n)) return;
    if (wouldStop) endProjectile(a, p, 'stopped');
    else if (wouldHitLimit) endProjectile(a, p, 'reflectionLimit');
  };

  /** Expanded rules: remember a post-flight request; ids and final order are fixed at the barrier. */
  const recordRequest = (a: ActiveShot, source: EffectRequest['source'], simTimeSec: number, targetId: string): void => {
    a.requests.push({ source, simTimeSec, contactOrder: a.contactSeq++, targetId });
  };

  /** Record the activation and apply what happens at once. Returns true when the cork should split. */
  const activateDevice = (a: ActiveShot, p: Projectile, deviceId: DeviceActivation['deviceId'], kind: DeviceKind, hitTimeSec: number): boolean => {
    a.usedDevices.add(deviceId);
    a.activations.push({ deviceId, kind, projectileId: p.id });
    emit((eventId, shotId) => ({ type: 'deviceActivated', eventId, shotId, deviceId, deviceKind: kind, projectileId: p.id }));
    switch (kind) {
      case 'power':
        p.powerMultiplier = nextPowerMultiplier(p.powerMultiplier, tuning);
        return false;
      case 'transform':
        a.transformReserved = true; // applied after the flight ends (decision 32)
        if (a.expanded) recordRequest(a, { kind: 'device', deviceId, deviceKind: kind }, hitTimeSec, deviceId);
        return false;
      case 'split':
        return true;
      default:
        // penalty / ammo / bulletType: the run applies them at settlement (expanded: as post-flight requests)
        if (a.expanded) recordRequest(a, { kind: 'device', deviceId, deviceKind: kind }, hitTimeSec, deviceId);
        return false;
    }
  };

  /** Replace `p` by two corks (generation + 1). Ammo is untouched. False when the limits forbid it. */
  const splitCork = (a: ActiveShot, p: Projectile, normal: Vec3): boolean => {
    const alive = a.projectiles.filter((q) => !q.ended && q !== p).length;
    if (p.generation >= tuning.limits.maxSplitGeneration || alive + 2 > tuning.limits.maxSimultaneousCorks) return false;
    endProjectile(a, p, 'split'); // replaced, not a limit; the spawn events carry parentId
    const [va, vb] = splitVelocities(p.velocity, normal, p.x ? tuning.devices.splitSpreadRad * p.x.splitSpreadMult : tuning.devices.splitSpreadRad);
    for (const velocity of [va, vb]) {
      const child: Projectile = {
        id: mintId.projectile(a.shotId, a.nextProjectileIndex++),
        generation: p.generation + 1,
        position: p.position,
        velocity,
        bulletType: p.bulletType,
        powerMultiplier: p.powerMultiplier,
        reflections: p.reflections,
        spawnedAtSec: p.spawnedAtSec,
        ended: false,
        lastContact: new Map(p.lastContact),
        ...(p.x ? { x: p.x } : {}),
      };
      a.projectiles.push(child);
      emit((eventId, shotId) => ({
        type: 'projectileSpawned',
        eventId,
        shotId,
        projectileId: child.id,
        parentId: p.id,
        generation: child.generation,
        position: child.position,
        velocity: child.velocity,
        bulletType: child.bulletType,
      }));
    }
    return true;
  };

  const inBounds = (v: Vec3): boolean => {
    const b = layout.activeBounds;
    return (
      Math.abs(v.x - b.center.x) <= b.halfExtents.x &&
      Math.abs(v.y - b.center.y) <= b.halfExtents.y &&
      Math.abs(v.z - b.center.z) <= b.halfExtents.z
    );
  };

  const stepProjectile = (a: ActiveShot, p: Projectile, dt: number): void => {
    if (a.elapsed - p.spawnedAtSec >= tuning.limits.maxFlightSec) return endProjectile(a, p, 'timeLimit');
    p.velocity = { ...p.velocity, y: p.velocity.y - (p.x ? p.x.gravity : GRAVITY * tuning.cork.gravityScale) * dt };
    let remaining = dt;
    for (let i = 0; i < MAX_HITS_PER_STEP && remaining > 1e-9 && !p.ended; i++) {
      const hit = world.castShape(p.position, IDENT, p.velocity, p.x ? ballFor(p.x.radius) : corkShape, 0, remaining, false);
      if (!hit) {
        p.position = add(p.position, scale(p.velocity, remaining));
        remaining = 0;
        break;
      }
      const toi = Math.min(remaining, Math.max(0, hit.time_of_impact));
      p.position = add(p.position, scale(p.velocity, toi));
      remaining -= toi;
      const target = targets.get(hit.collider.handle);
      if (!target) {
        p.position = add(p.position, scale(p.velocity, remaining));
        break;
      }
      onCorkHit(a, p, target, vec(hit.normal1), a.elapsed - remaining);
    }
    if (!p.ended && !inBounds(p.position)) endProjectile(a, p, 'outOfBounds');
  };

  // ---- shot lifecycle
  const setStage = (a: ActiveShot, stage: ShotStage): void => {
    a.stage = stage;
    emit((eventId, shotId) => ({ type: 'shotStage', eventId, shotId, stage }));
  };

  const detectCollections = (a: ActiveShot): void => {
    for (const p of [...live.values()]) {
      const y = p.body.translation().y;
      if (!(y < layout.collectBelowY)) continue;
      const frame = { ...prizeFrame(p), collected: true };
      a.collected.push({ instanceId: p.src.instanceId, typeId: p.src.typeId });
      justCollected.push(frame);
      emit((eventId, shotId) => ({ type: 'prizeReachedCollection', eventId, shotId, instanceId: p.src.instanceId, typeId: p.src.typeId }));
      // keep its outcome for the record, then take it out of the world (no re-judgement by bouncing)
      outcomes.set(p.src.instanceId, outcomeOf(p, true));
      removeLive(p);
    }
  };

  const outcomes = new Map<PrizeInstanceId, PrizeOutcome>();

  const nearEdge = (p: LivePrize): boolean => {
    const t = p.body.translation();
    const r = p.body.rotation();
    const box = prizeAabb(p.cfg.shape, { position: vec(t), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } });
    const bottom = box.center.y - box.halfExtents.y;
    for (const tier of layout.tiers) {
      if (Math.abs(bottom - tier.topY) > 0.04) continue;
      if (Math.abs(t.x) > tier.halfWidth + 0.05) continue;
      const toFront = tier.centerZ + tier.depth / 2 - t.z;
      const toSide = tier.halfWidth - Math.abs(t.x);
      return toFront >= 0 && toSide >= 0 && Math.min(toFront, toSide) <= NEAR_EDGE_M;
    }
    return false;
  };

  const outcomeOf = (p: LivePrize, collected: boolean): PrizeOutcome => {
    const t = p.body.translation();
    return {
      instanceId: p.src.instanceId,
      typeId: p.src.typeId,
      hits: p.hits,
      collected,
      displacement: Math.hypot(t.x - p.startX, t.z - p.startZ),
      endedNearEdge: collected ? false : nearEdge(p),
    };
  };

  const isQuiet = (): boolean => {
    for (const p of live.values()) {
      if (p.mounted || p.body.isSleeping()) continue;
      if (len(p.body.linvel()) >= tuning.limits.settleLinearSpeed) return false;
      if (len(p.body.angvel()) >= tuning.limits.settleAngularSpeed) return false;
    }
    return true;
  };
  const anyFalling = (): boolean => {
    for (const p of live.values()) if (!p.mounted && p.body.linvel().y < -FALL_SPEED) return true;
    return false;
  };

  const finishShot = (a: ActiveShot): void => {
    const remaining: PrizeInstanceState[] = [];
    for (const p of live.values()) {
      const t = p.body.translation();
      const r = p.body.rotation();
      if (p.hits.length > 0 || Math.hypot(t.x - p.startX, t.z - p.startZ) > 0.01) outcomes.set(p.src.instanceId, outcomeOf(p, false));
      remaining.push({
        ...p.src,
        hp: p.hp,
        pose: { position: vec(t), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } },
        mounted: p.mounted,
        collected: false,
      });
      if (!p.mounted) {
        p.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
        p.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
        p.body.sleep();
      }
    }
    finished = {
      runId: a.runId,
      shotId: a.shotId,
      collected: a.collected,
      prizeOutcomes: [...outcomes.values()],
      deviceActivations: a.activations,
      firstHitCandidates: a.firstHit,
      transforms: a.transforms,
      endedByLimit: a.endedByLimit,
      remainingPrizes: remaining,
      simTimeSec: a.elapsed,
      ...(a.expanded && a.barrierId ? { barrierId: a.barrierId, appliedTransforms: a.applied, deferredTransforms: a.deferred } : {}),
      ...(a.expanded?.rewards ? { rewardContacts: { targetHit: a.targetHit, chimeAfterReflection: false, seesawInstances: [], piggyDeposit: false } } : {}),
    };
    outcomes.clear();
    removeRewardTarget();
    active = null;
  };

  /** Decision 32: after the flight, before settlement. Never collected or mounted prizes. */
  const applyTransform = (a: ActiveShot): void => {
    if (!a.transformReserved) return;
    const candidates: PrizeInstanceState[] = [...live.values()]
      .filter((p) => !p.mounted)
      .map((p) => {
        const t = p.body.translation();
        const r = p.body.rotation();
        return { ...p.src, hp: p.hp, pose: { position: vec(t), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }, mounted: false, collected: false };
      });
    const choice = a.context.chooseTransform(candidates);
    if (!choice) return;
    const lp = live.get(choice.instanceId);
    const newCfg = catalog.prizes.get(choice.toTypeId);
    if (!lp || lp.mounted || !newCfg || newCfg.typeId === lp.src.typeId) return;
    const fromTypeId = lp.src.typeId;
    const hpBefore = lp.hp;
    const maxHpBefore = lp.src.maxHp;
    const hpAfter = transformedHp(hpBefore, maxHpBefore, newCfg.maxHp);
    const t = lp.body.translation();
    const r = lp.body.rotation();
    const rotation = { x: r.x, y: r.y, z: r.z, w: r.w };
    const lin = lp.body.linvel();
    const ang = lp.body.angvel();
    // keep the bottom of the bounding box where it was, so a new shape neither sinks into nor floats above the board
    const oldHalf = prizeAabb(lp.cfg.shape, { position: vec(t), rotation }).halfExtents.y;
    const newHalf = prizeAabb(newCfg.shape, { position: vec(t), rotation }).halfExtents.y;
    const position = { x: t.x, y: t.y + (newHalf - oldHalf), z: t.z };
    targets.delete(lp.collider.handle);
    world.removeRigidBody(lp.body);
    const { body, collider } = createPrizeBody(world, newCfg, { position, rotation }, false);
    body.setLinvel(lin, true);
    body.setAngvel(ang, true);
    targets.set(collider.handle, { t: 'prize', id: lp.src.instanceId });
    lp.body = body;
    lp.collider = collider;
    lp.cfg = newCfg;
    lp.src = { ...lp.src, typeId: newCfg.typeId, maxHp: newCfg.maxHp };
    lp.hp = hpAfter;
    lp.baseFriction = newCfg.friction;
    lp.hpZeroApplied = false;
    if (hpAfter <= 0) applyHpZero(lp);
    emit((eventId, shotId) => {
      const ev: PrizeTransformedEvent = {
        type: 'prizeTransformed',
        eventId,
        shotId,
        instanceId: lp.src.instanceId,
        fromTypeId,
        toTypeId: newCfg.typeId,
        hpBefore,
        maxHpBefore,
        hpAfter,
        maxHpAfter: newCfg.maxHp,
      };
      a.transforms.push(ev);
      return ev;
    });
  };

  // ---- expanded rules: flight-end barrier (EG05)
  let frozen: FlightBarrier | null = null;
  let barrierToReturn: FlightBarrier | null = null;

  const shelfStateOf = (p: LivePrize): PrizeInstanceState => {
    const t = p.body.translation();
    const r = p.body.rotation();
    return { ...p.src, hp: p.hp, pose: { position: vec(t), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }, mounted: p.mounted, collected: false };
  };

  /** The last cork disappeared: stop here, hand the contacts to the core, change nothing else. */
  const enterBarrier = (a: ActiveShot): void => {
    setStage(a, 'transform'); // waiting for the effects; the frozen world does not advance
    const sorted = [...a.requests].sort((x, y) => x.simTimeSec - y.simTimeSec || x.contactOrder - y.contactOrder || (x.targetId < y.targetId ? -1 : x.targetId > y.targetId ? 1 : 0));
    const requests: EffectRequest[] = sorted.map((r, i) => ({
      requestId: `${a.shotId}-hit${i}` as EffectRequest['requestId'],
      source: r.source,
      simTimeSec: r.simTimeSec,
      contactOrder: r.contactOrder,
      targetId: r.targetId,
      effectId: null,
    }));
    const parts: ShopkeeperPart[] = [];
    for (const k of a.firstHit) if (k.startsWith('shopkeeper:')) {
      const part = k.slice('shopkeeper:'.length) as ShopkeeperPart;
      if (!parts.includes(part)) parts.push(part);
    }
    const prizes = [...live.values()].map(shelfStateOf);
    const barrier: FlightBarrier = {
      runId: a.runId,
      shotId: a.shotId,
      barrierId: mintId.barrier(a.shotId),
      requests,
      shopkeeperHit: parts.length > 0,
      shopkeeperParts: parts,
      collectedDuringFlight: a.collected.map((c) => ({ ...c })),
      prizes,
      motion: [...live.values()].map((p) => ({ instanceId: p.src.instanceId, linvel: vec(p.body.linvel()), angvel: vec(p.body.angvel()) })),
      simTimeSec: a.elapsed,
    };
    a.barrierId = barrier.barrierId;
    frozen = barrier;
    barrierToReturn = barrier;
  };

  /** Change the kind of a live prize: pose (Y included), velocities, mount state and motion phase stay. */
  const retype = (lp: LivePrize, newCfg: PrizeRuntimeConfig): KindChangeInfo => {
    const fromTypeId = lp.src.typeId;
    const hpBefore = lp.hp;
    const maxHpBefore = lp.src.maxHp;
    const hpAfter = transformedHp(hpBefore, maxHpBefore, newCfg.maxHp);
    const t = lp.body.translation();
    const r = lp.body.rotation();
    const lin = lp.body.linvel();
    const ang = lp.body.angvel();
    targets.delete(lp.collider.handle);
    world.removeRigidBody(lp.body);
    const { body, collider } = createPrizeBody(world, newCfg, { position: vec(t), rotation: { x: r.x, y: r.y, z: r.z, w: r.w } }, lp.mounted);
    if (!lp.mounted) {
      body.setLinvel(lin, true);
      body.setAngvel(ang, true);
    }
    targets.set(collider.handle, { t: 'prize', id: lp.src.instanceId });
    lp.body = body;
    lp.collider = collider;
    lp.cfg = newCfg;
    lp.src = { ...lp.src, typeId: newCfg.typeId, maxHp: newCfg.maxHp, motionTypeId: lp.src.motionTypeId ?? lp.src.drawnTypeId };
    lp.hp = hpAfter;
    lp.baseFriction = newCfg.friction;
    lp.hpZeroApplied = false;
    if (hpAfter <= 0) applyHpZero(lp);
    return { instanceId: lp.src.instanceId, fromTypeId, toTypeId: newCfg.typeId, hpBefore, maxHpBefore, hpAfter, maxHpAfter: newCfg.maxHp };
  };

  const resumeAfterEffects = (plan: EffectPlan): boolean => {
    const a = active;
    const b = frozen;
    if (!a || !b || plan.complete !== true || plan.barrierId !== b.barrierId || plan.shotId !== b.shotId || a.shotId !== b.shotId) return false;
    frozen = null;
    const result = planTransforms({
      prizes: [...live.values()].map((p) => ({ instanceId: p.src.instanceId, homeSlot: p.src.homeSlot, typeId: p.src.typeId, pose: shelfStateOf(p).pose })),
      intents: plan.transforms,
      shapeOf: (typeId) => catalog.prizes.get(typeId)?.shape,
      obstacles: layout.surfaces.map((s) => s.box),
    });
    for (const ch of result.applied) {
      const lp = live.get(ch.instanceId);
      const newCfg = catalog.prizes.get(ch.toTypeId);
      if (!lp || !newCfg) continue;
      const info = retype(lp, newCfg);
      a.applied.push({ instanceId: ch.instanceId, requestId: ch.requestId, fromTypeId: ch.fromTypeId, toTypeId: ch.toTypeId });
      emit((eventId, shotId) => {
        const ev: PrizeTransformedEvent = { type: 'prizeTransformed', eventId, shotId, ...info };
        a.transforms.push(ev);
        return ev;
      });
    }
    a.deferred.push(...result.deferred);
    a.quietSec = 0;
    setStage(a, 'settle');
    return true;
  };

  const advanceStage = (a: ActiveShot, dt: number): void => {
    if (a.stage === 'flight') {
      if (a.projectiles.every((p) => p.ended)) {
        if (a.expanded) return enterBarrier(a);
        setStage(a, 'transform');
        applyTransform(a);
        a.quietSec = 0;
        setStage(a, 'settle');
      }
      return;
    }
    if (isQuiet()) a.quietSec += dt;
    else a.quietSec = 0;
    if (a.quietSec >= tuning.limits.settleHoldSec) return finishShot(a);
    if (a.stage === 'settle') {
      a.settleSec += dt;
      if (a.settleSec >= tuning.limits.maxSettleSec) {
        a.endedByLimit = true;
        if (!a.graceUsed && anyFalling()) {
          a.graceUsed = true;
          a.graceSec = 0;
          setStage(a, 'grace');
        } else finishShot(a);
      }
    } else if (a.stage === 'grace') {
      a.graceSec += dt;
      if (a.graceSec >= tuning.limits.fallGraceSec) finishShot(a);
    }
  };

  const fixedStep = (): void => {
    simTime += fixedDt;
    motionClock += fixedDt;
    updateMounted();
    const a = active;
    if (a) {
      a.contactSeq = 0;
      a.elapsed += fixedDt;
      if (a.stage === 'flight') for (const p of [...a.projectiles]) if (!p.ended) stepProjectile(a, p, fixedDt);
    }
    world.step();
    if (a && active === a) {
      detectCollections(a);
      advanceStage(a, fixedDt);
    }
  };

  // ---- expanded rules: shot settings fixed at FIRE
  const validateModifiers = (m: ShotModifiers): void => {
    const positive = [m.speedMult, m.radiusMult, m.damageMult, m.pushMult, m.restitutionMult, m.splitSpreadMult];
    if (!positive.every((v) => Number.isFinite(v) && v > 0) || !Number.isFinite(m.gravityMult) || m.gravityMult < 0 || !Number.isFinite(m.extraReflections)) {
      throw new RangeError('invalid shot modifiers');
    }
    if (![1, 2, 3].includes(m.launch.count) || !Number.isFinite(m.launch.spreadRad)) throw new RangeError('invalid launch settings');
  };

  const rotateY = (v: Vec3, angle: number): Vec3 => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
  };

  /** The corks created at the muzzle: one (rules-v1 or count 1) or 2/3 generation-1 corks sharing the damage. */
  const launchCorks = (request: ShotRequest, d: Vec3, m: ShotModifiers | null): Projectile[] => {
    if (!m) {
      return [
        {
          id: mintId.projectile(request.shotId, 0),
          generation: 0,
          position: request.origin,
          velocity: scale(d, initialSpeed(request.bulletType, tuning)),
          bulletType: request.bulletType,
          powerMultiplier: 1,
          reflections: 0,
          spawnedAtSec: 0,
          ended: false,
          lastContact: new Map(),
        },
      ];
    }
    const spec = ballisticForModifiers(tuning, request.bulletType, m);
    const baseLimit = tuning.limits.maxReflectionsPerCork + tuning.bulletTypes[spec.bulletType].extraReflections + m.extraReflections;
    const x: ProjectileExpanded = {
      radius: spec.corkRadius ?? tuning.cork.radius,
      gravity: spec.gravity,
      launchSpeed: spec.speed,
      damageMult: m.damageMult,
      pushMult: m.pushMult,
      restitutionMult: m.restitutionMult,
      reflectionLimit: Math.max(xLimits.reflections.min, Math.min(xLimits.reflections.max, baseLimit)),
      splitSpreadMult: m.splitSpreadMult,
      share: 1 / m.launch.count,
      maxPowerMultiplier: xLimits.maxPowerMultiplier,
    };
    const s = m.launch.spreadRad;
    const dirs = m.launch.count === 1 ? [d] : m.launch.count === 2 ? [rotateY(d, s), rotateY(d, -s)] : [d, rotateY(d, s), rotateY(d, -s)];
    return dirs.map((dir, i) => ({
      id: mintId.projectile(request.shotId, i),
      generation: m.launch.count === 1 ? 0 : 1,
      position: request.origin,
      velocity: scale(dir, spec.speed),
      bulletType: spec.bulletType,
      powerMultiplier: 1,
      reflections: 0,
      spawnedAtSec: 0,
      ended: false,
      lastContact: new Map(),
      x,
    }));
  };

  // ---- FX098: read-only first-contact estimate
  const previewFirstContact = (request: ShotRequest, m: ShotModifiers): AimPreview => {
    if (disposed) throw new Error('world disposed');
    const dir = normalize(request.direction);
    if (len(dir) === 0 || !Number.isFinite(dir.x + dir.y + dir.z)) throw new RangeError('invalid shot direction');
    validateModifiers(m);
    const spec = ballisticForModifiers(tuning, request.bulletType, m);
    const radius = spec.corkRadius ?? tuning.cork.radius;
    const shape = ballFor(radius);
    let pos = request.origin;
    let vel = scale(dir, spec.speed);
    const points: Vec3[] = [pos];
    const steps = Math.max(1, Math.ceil(tuning.limits.maxFlightSec / fixedDt));
    for (let i = 0; i < steps; i++) {
      vel = { ...vel, y: vel.y - spec.gravity * fixedDt };
      const hit = world.castShape(pos, IDENT, vel, shape, 0, fixedDt, false);
      if (hit) {
        const toi = Math.min(fixedDt, Math.max(0, hit.time_of_impact));
        pos = add(pos, scale(vel, toi));
        points.push(pos);
        const target = targets.get(hit.collider.handle);
        if (!target) return { points, firstHitTargetId: null, approximate: true };
        const n = normalize(vec(hit.normal1));
        const contact = add(pos, scale(len(n) === 0 ? scale(dir, -1) : n, -radius));
        return { points, firstHitTargetId: targetIdOf(target, contact), approximate: true };
      }
      pos = add(pos, scale(vel, fixedDt));
      points.push(pos);
      if (!inBounds(pos)) break;
    }
    return { points, firstHitTargetId: null, approximate: true };
  };

  const targetIdOf = (t: Target, contact: Vec3): string => {
    switch (t.t) {
      case 'surface':
        return t.id;
      case 'device':
        return t.deviceId;
      case 'shopkeeper':
        return `shopkeeper:${t.part}`;
      case 'hidden':
        return `hidden:${t.targetId}`;
      case 'cell':
        return cellAtPoint(contact, t.cellId);
      case 'rewardTarget':
        return REWARD_TARGET_SURFACE_ID;
      case 'prize':
        return t.id;
    }
  };

  const fire = (request: ShotRequest, context: ShotContext): void => {
    if (active) throw new Error('a shot is already in progress');
    const d = normalize(request.direction);
    if (len(d) === 0 || !Number.isFinite(d.x + d.y + d.z)) throw new RangeError('invalid shot direction');
    if (context.expanded) validateModifiers(context.expanded.modifiers);
    outcomes.clear();
    justCollected = [];
    for (const p of live.values()) {
      p.hits = [];
      const t = p.body.translation();
      p.startX = t.x;
      p.startZ = t.z;
    }
    const a: ActiveShot = {
      request,
      context,
      runId: context.runId,
      shotId: request.shotId,
      elapsed: 0,
      stage: 'flight',
      projectiles: [],
      eventCounter: 0,
      quietSec: 0,
      settleSec: 0,
      graceSec: 0,
      graceUsed: false,
      endedByLimit: false,
      collected: [],
      firstHit: [],
      usedDevices: new Set(),
      activations: [],
      transformReserved: false,
      transforms: [],
      nextProjectileIndex: 1,
      expanded: context.expanded ?? null,
      usableCells: new Set(context.expanded?.usableCells ?? []),
      activatedCells: new Set(),
      requests: [],
      contactSeq: 0,
      barrierId: null,
      applied: [],
      deferred: [],
      targetHit: null,
    };
    active = a;
    if (context.expanded?.rewardTarget) addRewardTarget(context.expanded.rewardTarget);
    else removeRewardTarget();
    const corks = launchCorks(request, d, context.expanded?.modifiers ?? null);
    for (const proj of corks) a.projectiles.push(proj);
    a.nextProjectileIndex = corks.length;
    emit((eventId, shotId) => ({ type: 'shotStage', eventId, shotId, stage: 'flight' }));
    for (const proj of corks) {
      emit((eventId, shotId) => ({
        type: 'projectileSpawned',
        eventId,
        shotId,
        projectileId: proj.id,
        parentId: null,
        generation: proj.generation,
        position: proj.position,
        velocity: proj.velocity,
        bulletType: proj.bulletType,
      }));
    }
  };

  const step = (dtSec: number): SimulationStep => {
    if (disposed) throw new Error('world disposed');
    if (frozen) {
      // frozen at the flight-end barrier: nothing advances and the time spent here is not added later
      return { frame: buildFrame([]), record: null, barrier: null };
    }
    if (Number.isFinite(dtSec) && dtSec > 0) acc += dtSec;
    let n = 0;
    while (acc >= fixedDt - 1e-9 && n < MAX_FIXED_STEPS_PER_CALL) {
      acc -= fixedDt;
      n += 1;
      fixedStep();
      if (barrierToReturn) {
        acc = 0; // the rest of this call is not simulated, now or later
        break;
      }
    }
    if (n >= MAX_FIXED_STEPS_PER_CALL) acc = 0;
    const record = finished;
    finished = null;
    const barrier = barrierToReturn;
    barrierToReturn = null;
    const frame = buildFrame(pending);
    pending = [];
    justCollected = [];
    return { frame, record, barrier };
  };

  return {
    syncShelf,
    fire,
    step,
    frame: () => buildFrame([]),
    resumeAfterEffects,
    previewFirstContact,
    get shotInProgress() {
      return active !== null;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      world.free();
    },
  };
}
