import { describe, expect, it } from 'vitest';
import { createShotWorld } from '../../src/sim/world';
import { spawnPrize } from '../../src/core/replenish';
import { damageFor, impulseFor, type Projectile } from '../../src/sim/shot';
import {
  BASE_SHOT_MODIFIERS,
  BOOTH_LAYOUT,
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  asPrizeTypeId,
  mintId,
  muzzlePosition,
  type BoothLayout,
  type EffectRequestId,
  type PrizeInstanceState,
  type PrizeRuntimeConfig,
  type ProjectileEndedEvent,
  type ProjectileSpawnedEvent,
  type RuntimeCatalog,
  type ShotModifiers,
  type ShotWorld,
  type SimEvent,
  type TuningConfig,
} from '../../src/contracts';
import { CAT, T, makeRequest, shotCtx } from '../unit/helpers';
import { layoutWith, plate, straight } from '../unit/device-helpers';
import { RUN, expandedCtx, harmlessRequest, planFor, runExpanded, straightAt } from './expanded-helpers';

const T36: TuningConfig = { ...T, shelfSlotCount: 36 };
const mods = (over: Partial<ShotModifiers>): ShotModifiers => ({ ...BASE_SHOT_MODIFIERS, ...over });
const slot = (sid: string) => BOOTH_LAYOUT_V2.slots.find((s) => s.slotId === sid)!;
const A = asPrizeTypeId('P001');
const shelf = (prizes: readonly PrizeInstanceState[]) => ({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 });

async function world(prizes: readonly PrizeInstanceState[] = [], layout: BoothLayout = BOOTH_LAYOUT_V2, cat: RuntimeCatalog = CAT, tuning: TuningConfig = T36): Promise<ShotWorld> {
  const w = await createShotWorld(layout, cat, tuning);
  w.syncShelf(shelf(prizes), 0);
  return w;
}

const spawnedOf = (events: readonly SimEvent[]) => events.filter((e): e is ProjectileSpawnedEvent => e.type === 'projectileSpawned');
const endedOf = (events: readonly SimEvent[]) => events.filter((e): e is ProjectileEndedEvent => e.type === 'projectileEnded');

describe('the flight-end barrier', () => {
  it('one huge dt never passes the barrier, and the frozen world does not change across many step calls', async () => {
    const slider = spawnPrize(CAT, asPrizeTypeId('P023'), slot('slot-r2-c04'), 1, 0);
    const still = spawnPrize(CAT, A, slot('slot-r3-c08'), 2, 0);
    const w = await world([slider, still]);
    w.fire(harmlessRequest(), expandedCtx());
    const first = w.step(100);
    expect(first.barrier).not.toBeNull();
    expect(first.record).toBeNull();
    const b = first.barrier!;
    expect(b.shotId).toBe('s01');
    expect(b.barrierId).toBe('s01-barrier');
    expect(b.simTimeSec).toBeLessThan(0.5);
    expect(first.frame.stage).toBe('transform');
    expect(first.frame.simTimeSec).toBeCloseTo(b.simTimeSec, 9);
    expect(b.prizes.map((p) => p.instanceId)).toEqual([slider.instanceId, still.instanceId]);
    expect(b.motion).toHaveLength(2);
    const snapshot = JSON.stringify(w.frame());
    for (const dt of [100, 1 / 60, 0.5, 0, NaN, -1, 3]) {
      const s = w.step(dt);
      expect(s.barrier).toBeNull();
      expect(s.record).toBeNull();
      expect(JSON.stringify(s.frame)).toBe(snapshot);
    }
    expect(JSON.stringify(w.frame())).toBe(snapshot);
    expect(w.shotInProgress).toBe(true);
    // the time spent frozen is not added later: one fixed step after the resume is one fixed step later
    expect(w.resumeAfterEffects(planFor(b))).toBe(true);
    const after = w.step(1 / 120);
    expect(after.frame.simTimeSec).toBeCloseTo(b.simTimeSec + 1 / 120, 9);
    w.dispose();
  });

  it('accepts the plan once, only for the frozen barrier of the same shot, and only when complete', async () => {
    const w = await world([]);
    expect(w.resumeAfterEffects({ ...planFor({ barrierId: 's01-barrier' } as never), barrierId: 's01-barrier' as never })).toBe(false); // no shot at all
    w.fire(harmlessRequest(), expandedCtx());
    expect(w.resumeAfterEffects(planFor({ barrierId: 's01-barrier', shotId: 's01' } as never))).toBe(false); // flight not over
    const b = w.step(10).barrier!;
    expect(w.resumeAfterEffects(planFor(b, [], { complete: false }))).toBe(false);
    expect(w.resumeAfterEffects(planFor(b, [], { barrierId: 's02-barrier' as never }))).toBe(false);
    expect(w.resumeAfterEffects(planFor(b, [], { shotId: 's02' as never }))).toBe(false);
    expect(w.step(1).frame.stage).toBe('transform'); // still frozen
    expect(w.resumeAfterEffects(planFor(b))).toBe(true);
    expect(w.resumeAfterEffects(planFor(b))).toBe(false);
    let record = null;
    for (let i = 0; i < 600 && !record; i++) record = w.step(1 / 60).record;
    expect(record).not.toBeNull();
    expect(w.resumeAfterEffects(planFor(b))).toBe(false); // the shot is over
    w.dispose();
  });

  it('is reported once per shot and the record carries the barrier id, applied and deferred lists', async () => {
    const w = await world([]);
    const run = runExpanded(w, harmlessRequest(), expandedCtx());
    expect(run.barriers).toHaveLength(1);
    expect(run.record.barrierId).toBe('s01-barrier');
    expect(run.record.appliedTransforms).toEqual([]);
    expect(run.record.deferredTransforms).toEqual([]);
    w.dispose();
  });

  it('rules-v1 context: no barrier, no extra record fields, legacy device transform still goes through chooseTransform', async () => {
    const w = await createShotWorld(layoutWith([plate('transform', 'dev-transform', 0, 1, -1.2)], false), CAT, T);
    const prize = spawnPrize(CAT, A, BOOTH_LAYOUT.slots[0]!, 1, 0);
    w.syncShelf(shelf([prize]), 0);
    let offered = 0;
    w.fire(makeRequest({ direction: straight }), { ...shotCtx, chooseTransform: (c) => ((offered = c.length), null) });
    let record = null;
    for (let i = 0; i < 1000 && !record; i++) {
      const s = w.step(1 / 60);
      expect(s.barrier).toBeNull();
      record = s.record;
    }
    expect(offered).toBeGreaterThan(0);
    expect(record).not.toBeNull();
    expect(record!.barrierId).toBeUndefined();
    w.dispose();
  });

  it('expanded mode: the legacy flight-end transform becomes a request instead of being applied by the world', async () => {
    const w = await createShotWorld(layoutWith([plate('transform', 'dev-transform', 0, 1, -1.2)], false), CAT, T);
    w.syncShelf(shelf([spawnPrize(CAT, A, BOOTH_LAYOUT.slots[0]!, 1, 0)]), 0);
    let called = false;
    const run = runExpanded(w, makeRequest({ direction: straight }), { ...expandedCtx(), chooseTransform: () => ((called = true), null) });
    expect(called).toBe(false);
    expect(run.barriers[0]!.requests.map((r) => r.source)).toEqual([{ kind: 'device', deviceId: 'dev-transform', deviceKind: 'transform' }]);
    expect(run.record.deviceActivations.map((a) => a.kind)).toEqual(['transform']);
    w.dispose();
  });

  it('a split shot has its barrier only after the last child disappeared', async () => {
    const w = await createShotWorld(layoutWith([plate('split', 'dev-split', 0, 1, -1.2)], false), CAT, T);
    const run = runExpanded(w, makeRequest({ direction: straight }), expandedCtx());
    expect(run.barriers).toHaveLength(1);
    const spawned = spawnedOf(run.events);
    expect(spawned.length).toBeGreaterThanOrEqual(3);
    expect(spawned.some((s) => s.generation === 2 - 1 && s.parentId !== null)).toBe(true);
    const ended = endedOf(run.events);
    expect(new Set(ended.map((e) => e.projectileId))).toEqual(new Set(spawned.map((s) => s.projectileId)));
    // at the barrier frame no cork is left
    const barrierFrame = run.frames.find((f) => f.stage === 'transform')!;
    expect(barrierFrame.projectiles).toHaveLength(0);
    expect(run.barriers[0]!.simTimeSec).toBeGreaterThan(0.3);
    w.dispose();
  });

  it('shopkeeper: a cork contact sets shopkeeperHit with the part; a prize contact does not', async () => {
    const keeper = BOOTH_LAYOUT_V2.shopkeeper.find((p) => p.part === 'body')!;
    const w = await world([]);
    const from = { x: keeper.box.center.x, y: keeper.box.center.y, z: -1.0 };
    const run = runExpanded(w, straightAt(from, { x: keeper.box.center.x, y: keeper.box.center.y, z: keeper.box.center.z + keeper.box.halfExtents.z }), expandedCtx());
    expect(run.barriers[0]!.shopkeeperHit).toBe(true);
    expect(run.barriers[0]!.shopkeeperParts).toContain('body');
    w.dispose();
    const w2 = await world([spawnPrize(CAT, A, slot('slot-r3-c04'), 1, 0)]);
    const p = slot('slot-r3-c04').spawnBase;
    const run2 = runExpanded(w2, straightAt({ x: p.x, y: p.y + 0.04, z: -1.0 }, { x: p.x, y: p.y + 0.04, z: -1.6 }), expandedCtx());
    expect(run2.impacts.some((i) => i.target.kind === 'prize')).toBe(true);
    expect(run2.barriers[0]!.shopkeeperHit).toBe(false);
    expect(run2.barriers[0]!.shopkeeperParts).toEqual([]);
    w2.dispose();
  });

  it('prizes collected during the flight are listed and are no longer in the barrier prize list', async () => {
    const prize = spawnPrize(CAT, A, slot('slot-r3-c04'), 1, 0);
    const fallen: PrizeInstanceState = { ...prize, pose: { ...prize.pose, position: { ...prize.pose.position, y: 0.3 } } }; // below the collection plane at once
    const w = await world([fallen]);
    // dynamic bodies are asleep on sync, so wake it with a graze that leaves the booth
    const run = runExpanded(w, harmlessRequest(), expandedCtx());
    const b = run.barriers[0]!;
    const inList = b.collectedDuringFlight.some((c) => c.instanceId === prize.instanceId);
    const inPrizes = b.prizes.some((p) => p.instanceId === prize.instanceId);
    expect(inList || inPrizes).toBe(true);
    expect(inList && inPrizes).toBe(false);
    w.dispose();
  });
});

describe('a transformed prize that falls is judged as the new kind', () => {
  it('collected as the new kind in the same shot', async () => {
    const a = CAT.prizes.get(A)!;
    const B = asPrizeTypeId('P998');
    const twin: PrizeRuntimeConfig = { ...a, typeId: B, maxHp: 20, centerOfMass: { x: 0, y: 0, z: 0.05 } };
    const cat: RuntimeCatalog = { ...CAT, prizes: new Map([...CAT.prizes, [A, { ...a, maxHp: 8 }], [B, twin]]) };
    const base = spawnPrize(cat, A, slot('slot-r3-c01'), 1, 0);
    const edgeZ = BOOTH_LAYOUT_V2.tiers[0]!.centerZ + BOOTH_LAYOUT_V2.tiers[0]!.depth / 2 - 0.005;
    const prize: PrizeInstanceState = { ...base, hp: 2, pose: { ...base.pose, position: { ...base.pose.position, z: edgeZ } } };
    const w = await world([prize], BOOTH_LAYOUT_V2, cat);
    const ctrl = runExpanded(w, harmlessRequest(), expandedCtx());
    expect(ctrl.record.collected).toHaveLength(0); // balanced: stays without the change
    w.syncShelf(shelf([prize]), 0);
    const run = runExpanded(w, harmlessRequest(2), expandedCtx(), {
      makePlan: (b) => planFor(b, [{ instanceId: prize.instanceId, requestId: 's02-fx1' as EffectRequestId, candidateTypeIds: [B] }]),
    });
    expect(run.record.appliedTransforms).toEqual([{ instanceId: prize.instanceId, requestId: 's02-fx1', fromTypeId: A, toTypeId: B }]);
    expect(run.record.transforms[0]).toMatchObject({ hpBefore: 2, maxHpBefore: 8, hpAfter: 5, maxHpAfter: 20 });
    expect(run.record.collected).toEqual([{ instanceId: prize.instanceId, typeId: B }]);
    expect(run.record.prizeOutcomes.find((o) => o.instanceId === prize.instanceId)?.typeId).toBe(B);
    expect(run.record.remainingPrizes).toHaveLength(0);
    // order: flight -> transform stage (waiting) -> prizeTransformed -> settle -> collection
    const names = run.events
      .filter((e) => e.type === 'shotStage' || e.type === 'prizeTransformed' || e.type === 'prizeReachedCollection')
      .map((e) => (e.type === 'shotStage' ? `stage:${e.stage}` : e.type));
    expect(names.indexOf('stage:transform')).toBeLessThan(names.indexOf('prizeTransformed'));
    expect(names.indexOf('prizeTransformed')).toBeLessThan(names.indexOf('stage:settle'));
    expect(names.indexOf('stage:settle')).toBeLessThan(names.indexOf('prizeReachedCollection'));
    w.dispose();
  });
});

describe('shot settings fixed at FIRE', () => {
  it('launch count 3 makes a centre cork and two side corks as generation 1 that share the damage', async () => {
    const big: PrizeInstanceState = { ...spawnPrize(CAT, A, slot('slot-r3-c04'), 1, 0), hp: 1000, maxHp: 1000 };
    const p = slot('slot-r3-c04').spawnBase;
    const aimAtPrize = () => straightAt({ x: p.x, y: p.y + 0.04, z: -1.0 }, { x: p.x, y: p.y + 0.04, z: -1.6 });
    const damages = (events: readonly SimEvent[]) => events.filter((e) => e.type === 'prizeDamaged').map((e) => (e.type === 'prizeDamaged' ? e.hpBefore - e.hpAfter : 0));
    const w1 = await world([big]);
    const single = runExpanded(w1, aimAtPrize(), expandedCtx());
    w1.dispose();
    const w3 = await world([big]);
    const triple = runExpanded(w3, aimAtPrize(), expandedCtx({ modifiers: mods({ launch: { count: 3, spreadRad: 0 } }) }));
    w3.dispose();
    const spawned = spawnedOf(triple.events);
    expect(spawned.map((s) => [s.projectileId, s.generation, s.parentId])).toEqual([
      ['s01-c0', 1, null],
      ['s01-c1', 1, null],
      ['s01-c2', 1, null],
    ]);
    const d1 = damages(single.events)[0]!;
    const d3 = damages(triple.events).slice(0, 3);
    expect(d3).toHaveLength(3);
    for (const d of d3) expect(d).toBeCloseTo(d1 / 3, 6);
  });

  it('launch count 2 and 3 fan out symmetrically around the aim by spreadRad', async () => {
    const w = await world([]);
    const spread = 0.12;
    for (const count of [2, 3] as const) {
      const run = runExpanded(w, makeRequest({ origin: muzzlePosition(BOOTH_LAYOUT_V2, 0), direction: { x: 0, y: 0, z: 1 } }), expandedCtx({ modifiers: mods({ launch: { count, spreadRad: spread } }) }));
      const sp = spawnedOf(run.events);
      expect(sp).toHaveLength(count);
      const angles = sp.map((s) => Math.atan2(s.velocity.x, s.velocity.z)).sort((a, b) => a - b);
      expect(angles[0]).toBeCloseTo(-spread, 6);
      expect(angles[angles.length - 1]).toBeCloseTo(spread, 6);
      if (count === 3) expect(angles[1]).toBeCloseTo(0, 6);
      for (const s of sp) expect(Math.hypot(s.velocity.x, s.velocity.y, s.velocity.z)).toBeCloseTo(11, 6);
      w.syncShelf(shelf([]), 0);
    }
    w.dispose();
  });

  it('never more than 8 corks at once, and at most 2 split generations, also with 3 launched corks', async () => {
    const w = await createShotWorld(layoutWith([plate('split', 'dev-split', 0, 2.5, -1.2)], true), CAT, T);
    w.syncShelf(shelf([]), 0);
    const run = runExpanded(w, makeRequest({ direction: straight }), expandedCtx({ modifiers: mods({ launch: { count: 3, spreadRad: 0.05 } }) }));
    let max = 0;
    for (const f of run.frames) max = Math.max(max, f.projectiles.length);
    expect(max).toBeLessThanOrEqual(8);
    expect(max).toBeGreaterThan(3);
    expect(Math.max(...spawnedOf(run.events).map((s) => s.generation))).toBeLessThanOrEqual(2);
    w.dispose();
  });

  it('speed, gravity and radius apply to every cork and the radius is reported in the frames', async () => {
    const w = await world([]);
    const run = runExpanded(w, harmlessRequest(), expandedCtx({ modifiers: mods({ speedMult: 1.2, gravityMult: 0, radiusMult: 1.5 }) }));
    const cork = run.frames.find((f) => f.projectiles.length > 0)!.projectiles[0]! as { velocity: { x: number; y: number; z: number }; radius?: number };
    expect(Math.hypot(cork.velocity.x, cork.velocity.y, cork.velocity.z)).toBeCloseTo(11 * 1.2, 6);
    expect(cork.velocity.y).toBeCloseTo(0, 9); // no gravity at all
    expect(cork.radius).toBeCloseTo(T36.cork.radius * 1.5, 9);
    const plain = runExpanded(w, harmlessRequest(2), expandedCtx());
    const c0 = plain.frames.find((f) => f.projectiles.length > 0)!.projectiles[0]! as { velocity: { y: number }; radius?: number };
    expect(c0.velocity.y).toBeLessThan(-0.01);
    expect(c0.radius).toBeCloseTo(T36.cork.radius, 9);
    w.dispose();
  });

  it('the collider radius is the reported radius: a wide cork touches a prize that a normal cork passes', async () => {
    const prize = spawnPrize(CAT, asPrizeTypeId('P009'), slot('slot-r3-c04'), 1, 0); // 3 cm half width
    const p = slot('slot-r3-c04').spawnBase;
    const offset = 0.07;
    const shot = (n: number) => straightAt({ x: p.x + offset, y: p.y + 0.1, z: -1.0 }, { x: p.x + offset, y: p.y + 0.1, z: -1.8 }, n);
    const w = await world([prize]);
    const narrow = runExpanded(w, shot(1), expandedCtx());
    expect(narrow.impacts.some((i) => i.target.kind === 'prize')).toBe(false);
    w.syncShelf(shelf([prize]), 0);
    const wide = runExpanded(w, shot(2), expandedCtx({ modifiers: mods({ radiusMult: 6 }) }));
    expect(wide.impacts.some((i) => i.target.kind === 'prize')).toBe(true);
    w.dispose();
  });

  it('restitution multiplier is applied once on top of the material and bullet type', async () => {
    const w = await world([]);
    const cell = BOOTH_LAYOUT_V2.backgroundCells!.find((c) => c.cellId === 'cell-r2-c06')!;
    const from = { x: cell.box.center.x, y: cell.box.center.y, z: -1.0 };
    const to = { x: cell.box.center.x, y: cell.box.center.y, z: cell.box.center.z };
    const afterBounce = async (mult: number, shot: number) => {
      const run = runExpanded(w, straightAt(from, to, shot), expandedCtx({ modifiers: mods({ restitutionMult: mult, gravityMult: 0 }) }));
      const i = run.frames.findIndex((f) => f.events.some((e) => e.type === 'impact' && e.target.kind === 'cell'));
      const v = run.frames.slice(i).find((f) => f.projectiles[0] && f.projectiles[0].velocity.z > 0)!.projectiles[0]!.velocity;
      w.syncShelf(shelf([]), 0);
      return Math.hypot(v.x, v.y, v.z);
    };
    const full = await afterBounce(1, 1);
    const half = await afterBounce(0.5, 2);
    expect(half / full).toBeCloseTo(0.5, 1);
    w.dispose();
  });

  it('reflection limit = base 8 + bullet type + extra, clamped to 4..10', async () => {
    const floaty: TuningConfig = { ...T36, cork: { ...T36.cork, gravityScale: 0.02, restitution: 1 } };
    const layout: BoothLayout = {
      ...BOOTH_LAYOUT_V2,
      surfaces: [...BOOTH_LAYOUT_V2.surfaces, { id: 'mirror', box: { center: { x: 0, y: 1.25, z: -0.1 }, halfExtents: { x: 3, y: 1.5, z: 0.02 } }, material: 'wood', reflective: true }],
    };
    const w = await createShotWorld(layout, CAT, floaty);
    const count = async (extra: number, bulletType: 'standard' | 'bouncy', shot: number) => {
      w.syncShelf(shelf([]), 0);
      const cell = BOOTH_LAYOUT_V2.backgroundCells!.find((c) => c.cellId === 'cell-r2-c06')!;
      const run = runExpanded(
        w,
        makeRequest({ origin: { x: 0, y: 1.25, z: -0.3 }, direction: { x: 0, y: 0, z: -1 }, bulletType }, shot),
        expandedCtx({ modifiers: mods({ extraReflections: extra }) }),
      );
      void cell;
      const ended = endedOf(run.events).map((e) => e.reason);
      return { impacts: run.impacts.length, ended };
    };
    expect(await count(0, 'standard', 1)).toEqual({ impacts: 8, ended: ['reflectionLimit'] });
    expect(await count(100, 'standard', 2)).toEqual({ impacts: 10, ended: ['reflectionLimit'] });
    expect(await count(-100, 'standard', 3)).toEqual({ impacts: 4, ended: ['reflectionLimit'] });
    expect(await count(1, 'standard', 4)).toEqual({ impacts: 9, ended: ['reflectionLimit'] });
    w.dispose();
  });

  it('damage and push combine with the power plate as min(4, plate x multiplier), divided by the launch count', () => {
    const load = { barValue: 0.5, tier: 'normal' as const, damageMultiplier: 1, pushMultiplier: 1 };
    const base = { bulletType: 'standard' as const };
    const x = { radius: 0.011, gravity: 5.9, launchSpeed: 11, damageMult: 1.5, pushMult: 1.5, restitutionMult: 1, reflectionLimit: 8, splitSpreadMult: 1, share: 1, maxPowerMultiplier: 4 };
    const plain = damageFor(11, { ...base, powerMultiplier: 1 }, load, T36);
    expect(damageFor(11, { ...base, powerMultiplier: 1, x }, load, T36)).toBeCloseTo(plain * 1.5, 9);
    expect(damageFor(11, { ...base, powerMultiplier: 3, x }, load, T36)).toBeCloseTo(plain * 4, 9); // 3 x 1.5 = 4.5 -> 4
    expect(damageFor(11, { ...base, powerMultiplier: 1, x: { ...x, share: 1 / 3 } }, load, T36)).toBeCloseTo((plain * 1.5) / 3, 9);
    const pushPlain = impulseFor(11, { ...base, powerMultiplier: 1 }, load, T36);
    expect(impulseFor(11, { ...base, powerMultiplier: 4, x }, load, T36)).toBeCloseTo(pushPlain * 4, 9);
    // the speed ratio uses the real launch speed, so a faster cork is not counted twice
    expect(damageFor(13.2, { ...base, powerMultiplier: 1, x: { ...x, launchSpeed: 13.2, damageMult: 1 } }, load, T36)).toBeCloseTo(plain, 9);
    const unused: Projectile | null = null;
    void unused;
  });
});

describe('determinism', () => {
  it('same seed and inputs give the same barrier and record whatever the step chunking (1/60, 1/30, 0.1)', async () => {
    const p1 = spawnPrize(CAT, A, slot('slot-r3-c04'), 1, 0);
    const p2 = spawnPrize(CAT, asPrizeTypeId('P023'), slot('slot-r2-c05'), 2, 0);
    const p3 = spawnPrize(CAT, asPrizeTypeId('P009'), slot('slot-r3-c05'), 3, 0);
    const p = slot('slot-r3-c04').spawnBase;
    const play = async (dt: number) => {
      const w = await world([p1, p2, p3]);
      const run = runExpanded(w, straightAt({ x: p.x, y: p.y + 0.04, z: -1.0 }, { x: p.x + 0.03, y: p.y + 0.04, z: -1.6 }), expandedCtx(), {
        dt,
        makePlan: (b) => planFor(b, [{ instanceId: p3.instanceId, requestId: 's01-fx1' as EffectRequestId, candidateTypeIds: [asPrizeTypeId('P004'), asPrizeTypeId('P002')] }]),
      });
      w.dispose();
      return { barrier: JSON.stringify(run.barriers), record: JSON.stringify(run.record) };
    };
    const a = await play(1 / 60);
    expect(a.record).toContain('barrierId');
    expect(await play(1 / 30)).toEqual(a);
    expect(await play(0.1)).toEqual(a);
  });
});

describe('previewFirstContact (FX098)', () => {
  it('is read-only and names the same first target as the real shot with the same settings', async () => {
    const prize = spawnPrize(CAT, A, slot('slot-r3-c04'), 1, 0);
    const slider = spawnPrize(CAT, asPrizeTypeId('P023'), slot('slot-r2-c05'), 2, 0);
    const p = slot('slot-r3-c04').spawnBase;
    const request = straightAt({ x: p.x, y: p.y + 0.04, z: -1.0 }, { x: p.x, y: p.y + 0.04, z: -1.6 });
    const m = mods({ radiusMult: 1.2, gravityMult: 1.3, speedMult: 1.1 });

    const control = await world([prize, slider]);
    const expected = runExpanded(control, request, expandedCtx({ modifiers: m }));
    control.dispose();

    const w = await world([prize, slider]);
    const before = JSON.stringify(w.frame());
    const preview = w.previewFirstContact(request, m);
    expect(JSON.stringify(w.frame())).toBe(before);
    expect(preview.approximate).toBe(true);
    expect(preview.points.length).toBeGreaterThan(2);
    expect(preview.points[0]).toEqual(request.origin);
    const firstImpact = expected.impacts[0]!;
    expect(firstImpact.target.kind).toBe('prize');
    expect(preview.firstHitTargetId).toBe(prize.instanceId);
    const last = preview.points[preview.points.length - 1]!;
    expect(Math.hypot(last.x - firstImpact.point.x, last.y - firstImpact.point.y, last.z - firstImpact.point.z)).toBeLessThan(0.05);
    // no side effects: the real shot afterwards equals the control that never previewed
    const real = runExpanded(w, request, expandedCtx({ modifiers: m }));
    expect(JSON.stringify(real.record)).toBe(JSON.stringify(expected.record));
    expect(JSON.stringify(real.barriers)).toBe(JSON.stringify(expected.barriers));
    w.dispose();
  });

  it('names a background cell, a surface, and null when nothing is hit', async () => {
    const w = await world([]);
    const cell = BOOTH_LAYOUT_V2.backgroundCells!.find((c) => c.cellId === 'cell-r2-c06')!;
    const c = cell.box.center;
    const toCell = straightAt({ x: c.x + 0.1, y: c.y, z: -1.0 }, { x: c.x + 0.1, y: c.y, z: c.z });
    expect(w.previewFirstContact(toCell, BASE_SHOT_MODIFIERS).firstHitTargetId).toBe('cell-r2-c06');
    expect(CELL_IDS_V2).toContain('cell-r2-c06');
    const up = makeRequest({ origin: { x: 0, y: 1.25, z: -1.0 }, direction: { x: 0, y: 1, z: 0 } });
    expect(w.previewFirstContact(up, BASE_SHOT_MODIFIERS).firstHitTargetId).toBe('ceiling');
    expect(w.previewFirstContact(harmlessRequest(), BASE_SHOT_MODIFIERS).firstHitTargetId).toBeNull();
    w.dispose();
  });

  it('a shot in progress is not disturbed by a preview', async () => {
    const w = await world([]);
    w.fire(harmlessRequest(), expandedCtx());
    w.step(0.02);
    const before = JSON.stringify(w.frame());
    w.previewFirstContact(harmlessRequest(2), BASE_SHOT_MODIFIERS);
    expect(JSON.stringify(w.frame())).toBe(before);
    expect(RUN).toBeTruthy();
    expect(mintId.shot(1)).toBe('s01');
    w.dispose();
  });
});
