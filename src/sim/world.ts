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
  BoothLayout,
  DeviceActivation,
  DeviceKind,
  EventId,
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
  ShotRequest,
  ShotStage,
  ShotWorld,
  SimEvent,
  SimulationFrame,
  SimulationStep,
  SlotGeometry,
  SurfaceMaterial,
  TuningConfig,
  Vec3,
} from '../contracts';
import { mintId } from '../contracts';
import { nextPowerMultiplier, splitVelocities, transformedHp } from '../core/gimmicks';
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
import { DETACH_IMPULSE_RATIO, damageFor, impulseFor, initialSpeed, reflectionLimitFor, type Projectile } from './shot';

let rapierReady: Promise<void> | null = null;
function initRapier(): Promise<void> {
  rapierReady ??= RAPIER.init();
  return rapierReady;
}

type StaticTarget =
  | { readonly t: 'surface'; readonly id: string; readonly material: SurfaceMaterial }
  | { readonly t: 'device'; readonly deviceId: ReturnType<typeof mintId.device>; readonly kind: DeviceKind }
  | { readonly t: 'shopkeeper'; readonly part: ShopkeeperPart }
  | { readonly t: 'hidden'; readonly targetId: string };
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
}

const vec = (v: { x: number; y: number; z: number }): Vec3 => ({ x: v.x, y: v.y, z: v.z });

export async function createShotWorld(layout: BoothLayout, catalog: RuntimeCatalog, tuning: TuningConfig): Promise<ShotWorld> {
  await initRapier();
  const fixedDt = tuning.limits.fixedStepSec;
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = fixedDt;

  const targets = new Map<number, Target>();
  const live = new Map<PrizeInstanceId, LivePrize>();
  const slotById = new Map<string, SlotGeometry>(layout.slots.map((s) => [s.slotId, s]));
  const corkShape = new RAPIER.Ball(tuning.cork.radius);
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
    };
  };

  const projectileFrames = (): ProjectileFrame[] =>
    (active?.projectiles ?? [])
      .filter((p) => !p.ended)
      .map((p) => ({
        projectileId: p.id,
        position: p.position,
        velocity: p.velocity,
        bulletType: p.bulletType,
        powerMultiplier: p.powerMultiplier,
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
      const mounted = src.mounted && cfg.motion.type !== 'none' && slot !== undefined;
      const base = mounted ? mountBasePose(slot!, cfg) : null;
      const pose = mounted ? mountedPose(base!, cfg, motionSec) : src.pose;
      const { body, collider } = createPrizeBody(world, cfg, pose, mounted);
      targets.set(collider.handle, { t: 'prize', id: src.instanceId });
      const lp: LivePrize = {
        src,
        cfg,
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
      const pose = mountedPose(p.base, p.cfg, motionClock);
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
        return 'wood';
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

  const onCorkHit = (a: ActiveShot, p: Projectile, target: Target, hitNormal: Vec3): void => {
    const speed = len(p.velocity);
    const dir = normalize(p.velocity);
    let n = normalize(hitNormal);
    if (len(n) === 0 || dot(n, p.velocity) > 0) n = len(n) === 0 ? scale(dir, -1) : scale(n, -1);
    const point = add(p.position, scale(n, -tuning.cork.radius));
    const key = targetKey(target);
    const last = p.lastContact.get(key);
    const continuing = last !== undefined && simTime - last <= CONTACT_DEDUPE_SEC;
    p.lastContact.set(key, simTime);

    let splitNow = false;
    if (!continuing) {
      const reflectionIndex = p.reflections;
      const activated = target.t === 'device' && !a.usedDevices.has(target.deviceId);
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
      if (target.t === 'device' && activated) splitNow = activateDevice(a, p, target.deviceId, target.kind);
      if (target.t === 'prize') hitPrize(a, p, live.get(target.id)!, point, speed, dir);
      if (target.t === 'shopkeeper') a.firstHit.push(`shopkeeper:${target.part}`);
      if (target.t === 'hidden') a.firstHit.push(`hidden:${target.targetId}`);
    }

    const bullet = tuning.bulletTypes[p.bulletType];
    const e = tuning.cork.restitution * bullet.restitution * bounceFactor(targetMaterial(target));
    p.velocity = reflectVelocity(p.velocity, n, e, TANGENTIAL_KEEP);
    p.position = add(p.position, scale(n, NUDGE));
    if (!continuing) p.reflections += 1;
    const wouldStop = len(p.velocity) < CORK_STOP_SPEED;
    const wouldHitLimit = p.reflections >= reflectionLimitFor(p, tuning);
    if (splitNow && !wouldStop && !wouldHitLimit && splitCork(a, p, n)) return;
    if (wouldStop) endProjectile(a, p, 'stopped');
    else if (wouldHitLimit) endProjectile(a, p, 'reflectionLimit');
  };

  /** Record the activation and apply what happens at once. Returns true when the cork should split. */
  const activateDevice = (a: ActiveShot, p: Projectile, deviceId: DeviceActivation['deviceId'], kind: DeviceKind): boolean => {
    a.usedDevices.add(deviceId);
    a.activations.push({ deviceId, kind, projectileId: p.id });
    emit((eventId, shotId) => ({ type: 'deviceActivated', eventId, shotId, deviceId, deviceKind: kind, projectileId: p.id }));
    switch (kind) {
      case 'power':
        p.powerMultiplier = nextPowerMultiplier(p.powerMultiplier, tuning);
        return false;
      case 'transform':
        a.transformReserved = true; // applied after the flight ends (decision 32)
        return false;
      case 'split':
        return true;
      default:
        return false; // penalty / ammo / bulletType: the run applies them at settlement
    }
  };

  /** Replace `p` by two corks (generation + 1). Ammo is untouched. False when the limits forbid it. */
  const splitCork = (a: ActiveShot, p: Projectile, normal: Vec3): boolean => {
    const alive = a.projectiles.filter((q) => !q.ended && q !== p).length;
    if (p.generation >= tuning.limits.maxSplitGeneration || alive + 2 > tuning.limits.maxSimultaneousCorks) return false;
    p.ended = true; // replaced, not a limit: no projectileEnded event, the spawn events carry parentId
    const [va, vb] = splitVelocities(p.velocity, normal, tuning.devices.splitSpreadRad);
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
    p.velocity = { ...p.velocity, y: p.velocity.y - GRAVITY * tuning.cork.gravityScale * dt };
    let remaining = dt;
    for (let i = 0; i < MAX_HITS_PER_STEP && remaining > 1e-9 && !p.ended; i++) {
      const hit = world.castShape(p.position, IDENT, p.velocity, corkShape, 0, remaining, false);
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
      onCorkHit(a, p, target, vec(hit.normal1));
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
    };
    outcomes.clear();
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

  const advanceStage = (a: ActiveShot, dt: number): void => {
    if (a.stage === 'flight') {
      if (a.projectiles.every((p) => p.ended)) {
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
      a.elapsed += fixedDt;
      if (a.stage === 'flight') for (const p of [...a.projectiles]) if (!p.ended) stepProjectile(a, p, fixedDt);
    }
    world.step();
    if (a && active === a) {
      detectCollections(a);
      advanceStage(a, fixedDt);
    }
  };

  const fire = (request: ShotRequest, context: ShotContext): void => {
    if (active) throw new Error('a shot is already in progress');
    const d = normalize(request.direction);
    if (len(d) === 0 || !Number.isFinite(d.x + d.y + d.z)) throw new RangeError('invalid shot direction');
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
    };
    active = a;
    const speed = initialSpeed(request.bulletType, tuning);
    const proj: Projectile = {
      id: mintId.projectile(request.shotId, 0),
      generation: 0,
      position: request.origin,
      velocity: scale(d, speed),
      bulletType: request.bulletType,
      powerMultiplier: 1,
      reflections: 0,
      spawnedAtSec: 0,
      ended: false,
      lastContact: new Map(),
    };
    a.projectiles.push(proj);
    emit((eventId, shotId) => ({ type: 'shotStage', eventId, shotId, stage: 'flight' }));
    emit((eventId, shotId) => ({
      type: 'projectileSpawned',
      eventId,
      shotId,
      projectileId: proj.id,
      parentId: null,
      generation: 0,
      position: proj.position,
      velocity: proj.velocity,
      bulletType: proj.bulletType,
    }));
  };

  const step = (dtSec: number): SimulationStep => {
    if (disposed) throw new Error('world disposed');
    if (Number.isFinite(dtSec) && dtSec > 0) acc += dtSec;
    let n = 0;
    while (acc >= fixedDt - 1e-9 && n < MAX_FIXED_STEPS_PER_CALL) {
      acc -= fixedDt;
      n += 1;
      fixedStep();
    }
    if (n >= MAX_FIXED_STEPS_PER_CALL) acc = 0;
    const record = finished;
    finished = null;
    const frame = buildFrame(pending);
    pending = [];
    justCollected = [];
    return { frame, record };
  };

  return {
    syncShelf,
    fire,
    step,
    frame: () => buildFrame([]),
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
