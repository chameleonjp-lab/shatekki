import RAPIER from '@dimforge/rapier3d-compat';
import { expect, it, vi } from 'vitest';
import { GameController } from '../../src/app/controller';
import { PersistedSession } from '../../src/app/persisted-session';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { completedSetsFor } from '../../src/catalog/sets';
import {
  asPrizeTypeId, isAmmoBalanced, mintId, type EffectId, type ExpandedRunState, type ImpactEvent,
  type LedgerItem, type ShotSummary, type SimEvent,
} from '../../src/contracts';
import type { PersistedRecord } from '../../src/contracts/persistence';
import * as checkpointDatabase from '../../src/persistence/checkpoint-database';
import { createExpandedRun } from '../../src/core/expanded-run';
import { spawnPrize } from '../../src/core/replenish';
import { rewardDevicesFor } from '../../src/core/rewards';
import { buildLedgerEntry, prizeItems } from '../../src/core/scoring';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { createShotWorld } from '../../src/sim/world';

const bundle = getGameplayBundle('expanded-next');
const { catalog, layout, tuning, expansion, behavior } = bundle;
const step = tuning.limits.fixedStepSec;
const scope = { mode: 'normal', rulesVersion: catalog.rulesVersion } as const;

function lastCork(): ExpandedRunState {
  const initial = createExpandedRun({ seed: 7919, runId: mintId.run('split-grace'), tuning, playerName: null },
    { ...bundle, expansion: expansion! });
  // At the left end of the upper shelf two touching prizes straddle its corner.
  // The third, a ball near the front, rolls over the edge after the others fall.
  const prizes = [
    { kind: 'P062', x: -2.54, y: 1.565, z: -2.22 },
    { kind: 'P082', x: -2.63, y: 1.70, z: -2.27 },
    { kind: 'P085', x: -2.2883271184237675, y: 1.585, z: -1.9878032453544439 },
  ].map(({ kind, x, y, z }, i) => {
    const p = spawnPrize(catalog, asPrizeTypeId(kind), layout.slots[i]!, i + 1, 0);
    return { ...p, mounted: false, pose: { ...p.pose, position: { x, y, z } } };
  });
  const collected = ['P086', 'P087'].map((kind, i) => ({
    instanceId: mintId.instance(i + 4), typeId: asPrizeTypeId(kind), shotId: mintId.shot(i + 1),
  }));
  const collectedTypeIds = collected.map(p => p.typeId);
  const completedSets = completedSetsFor(catalog, new Set(collectedTypeIds), []);
  let score = 0;
  const ledger = Array.from({ length: 10 }, (_, i) => {
    const shotId = mintId.shot(i + 1);
    const items: LedgerItem[] = prizeItems(collected.filter(p => p.shotId === shotId), catalog);
    if (i === 1) for (const set of completedSets) items.push({ kind: 'set', refId: set, points: catalog.sets.get(set)!.bonusScore });
    const entry = buildLedgerEntry(shotId, score, items);
    score = entry.scoreAfter;
    return entry;
  });
  return {
    ...initial, score, ledger, shotsFired: 10, bonusAmmoTotal: 1, ammo: 1, maxChain: 1,
    collected, collectedTypeIds, completedSets, shelf: { prizes, nextInstanceNumber: 6, deferredSlots: [] },
    expansion: {
      ...initial.expansion,
      // An earlier last-shot target granted one cork. No new target is offered on this shot.
      rewards: { ...initial.expansion.rewards!, targetUsed: true,
        outcomes: [{ id: 'A5', key: 'target:outer', shotNumber: 10, offered: 1, granted: 1 }] },
      cells: initial.expansion.cells.map(c => c.cellId === 'cell-r1-c01' ? { ...c, effectId: 'FX001' as EffectId } : c),
      next: { ...initial.expansion.next, modifiers: { ...initial.expansion.next.modifiers,
        launch: { count: 3, spreadRad: 0.175 }, damageMult: 1.5, pushMult: 1.5, extraReflections: -2 } },
    },
  };
}

async function play(skip: boolean) {
  const initial = lastCork();
  const db = checkpointDatabase.memoryDatabase();
  const record: PersistedRecord = {
    scope, token: { runId: initial.runId, revision: 1, ownerEpoch: 1 }, ownerId: 'prior-player',
    state: initial, gameTick: 0, lastSummary: null, lastFreshSets: [], ammoBeforeShot: initial.ammo,
    result: null, selfBestBefore: null, newBest: false, resultViewOpen: false,
  };
  await db.transact('readwrite', ['runs', 'profiles'], async tx => {
    tx.put('runs', JSON.stringify(['normal', initial.rulesVersion, '']), record);
    tx.put('profiles', JSON.stringify(['book', 'normal', initial.rulesVersion]),
      { discoveredSets: initial.completedSets, legacyBestScore: null });
  });
  const factory = vi.spyOn(checkpointDatabase, 'memoryDatabase').mockReturnValueOnce(db);
  const repo = createMemoryRunRepository('split-grace', bundle);
  factory.mockRestore();
  expect(await repo.read(scope)).toEqual(record);
  const saved = await repo.claim(scope, record.token, 'resumeStable');
  if (!saved.ok) throw new Error(saved.reason);
  const session = new PersistedSession(repo, saved.record);
  const world = await createShotWorld(layout, catalog, tuning, {
    rewardDevices: rewardDevicesFor(expansion!.profile.rewards!), transformPolicy: behavior!.transformPolicy,
  });
  const impulses = vi.spyOn(RAPIER.RigidBody.prototype, 'applyImpulseAtPoint');
  const events: SimEvent[] = [];
  const settled: ShotSummary[] = [];
  const game = new GameController({ ...bundle, world, rules: CORE_RULES, renderer: null, session,
    clockPolicy: behavior!.clock, transformPolicy: behavior!.transformPolicy,
    onSimEvents: batch => events.push(...batch), onShotSettled: summary => settled.push(summary),
  }, saved.record.state);
  try {
    await game.dispatchPersisted({ type: 'RESUME', reason: 'manual' });
    await game.dispatchPersisted({ type: 'SET_POSITION', x: layout.camera.standMinX });
    await game.dispatchPersisted({ type: 'CONFIRM_POSITION' });
    await game.dispatchPersisted({ type: 'STOP_LOAD' });
    // Aim at the corner of the split plate, accounting for the displayed hand sway.
    const sway = game.viewState().effectiveAim;
    await game.dispatchPersisted({ type: 'AIM', yaw: -0.16967688622029309 - sway.yaw, pitch: 0.264662308578521 - sway.pitch });
    expect(await game.dispatchPersisted({ type: 'FIRE' })).toBe('applied');
    const request = game.current.inFlight!.request;
    expect(game.current).toMatchObject({ ammo: 0, shotsFired: 11, score: initial.score });
    if (skip) await game.dispatchPersisted({ type: 'SKIP_PRESENTATION' });

    let maxCorks = 0, graceTick = 0, collectedTick = 0;
    const ball = initial.shelf.prizes[2]!;
    for (let i = 0; i < 1500 && game.current.phase === 'resolving'; i++) {
      expect(game.current.score).toBe(initial.score);
      expect(game.current.ammo).toBe(0);
      const before = events.length;
      game.frame(step);
      maxCorks = Math.max(maxCorks, world.frame().projectiles.length);
      for (const e of events.slice(before)) {
        if (e.type === 'shotStage' && e.stage === 'grace') graceTick = game.gameTick;
        if (e.type === 'prizeReachedCollection' && e.instanceId === ball.instanceId) collectedTick = game.gameTick;
      }
      if (game.persistencePending) await vi.waitFor(() => expect(session.status).toBe('ready'), { interval: 1 });
    }
    expect(maxCorks).toBe(4);
    expect(events.filter(e => e.type === 'shotStage' && e.stage === 'grace')).toHaveLength(1);
    expect(events.filter(e => e.type === 'projectileEnded' && e.reason === 'reflectionLimit')).toHaveLength(3);
    expect(graceTick).toBeGreaterThan(0);
    expect(collectedTick).toBeGreaterThan(graceTick);
    expect((game.gameTick - graceTick) * step).toBeLessThanOrEqual(tuning.limits.fallGraceSec + step);
    expect(settled).toHaveLength(1);
    const summary = settled[0]!;
    const split = layout.devices.find(d => d.kind === 'split')!;
    expect(summary.devicesActivated).toEqual([split.deviceId]);
    const spawns = events.filter(e => e.type === 'projectileSpawned');
    const originals = spawns.filter(e => e.parentId === null);
    const children = spawns.filter(e => e.parentId !== null);
    expect(originals).toHaveLength(3);
    expect(children).toHaveLength(2);
    const parent = children[0]!.parentId!;
    expect(children.every(p => p.parentId === parent && p.generation === 2)).toBe(true);
    const impacts = events.filter((e): e is ImpactEvent => e.type === 'impact');
    const hits = summary.prizeOutcomes.flatMap(outcome => outcome.hits.map(hit => ({ ...hit, prize: outcome.instanceId })));
    const family = [parent, ...children.map(p => p.projectileId)];
    expect(new Set(hits.map(h => h.projectileId)).size).toBe(4);
    for (const id of family) expect(hits.some(h => h.projectileId === id)).toBe(true);
    const prizeContacts = impacts.filter(e => e.target.kind === 'prize');
    const hp = events.filter(e => e.type === 'prizeDamaged');
    expect(impulses.mock.calls).toHaveLength(prizeContacts.length);
    prizeContacts.forEach((contact, i) => {
      const hit = hits.find(h => h.projectileId === contact.projectileId && h.reflectionIndex === contact.reflectionIndex)!;
      const speedRatio = Math.min(1, contact.speed / tuning.cork.speed);
      const share = 1.5 * speedRatio / originals.length;
      expect(hit.damage).toBeCloseTo(tuning.cork.baseDamage * request.load.damageMultiplier * share, 9);
      const [impulse] = impulses.mock.calls[i]!;
      const hpFactor = hp[i]!.hpAfter === 0 ? tuning.hpZero.pushMultiplier : 1;
      expect(Math.hypot(impulse.x, impulse.y, impulse.z))
        .toBeCloseTo(tuning.cork.baseImpulse * request.load.pushMultiplier * share * hpFactor, 9);
    });
    expect(summary.collected).toHaveLength(3);
    expect(summary.collected.at(-1)?.instanceId).toBe(ball.instanceId);
    expect(summary.newlyCompletedSets).toEqual(['PAIR244', 'PAIR245', 'S076']);
    expect(summary.ledger.items.filter(i => i.kind === 'set').map(i => i.points)).toEqual([50, 50, 100]);
    expect(summary.effects).toContainEqual(expect.objectContaining({ effectId: 'FX001', ammoDelta: 1 }));
    expect(summary.ammoAfter).toBeGreaterThan(0);
    expect(game.current).toMatchObject({ phase: 'position', shotsFired: 11 });
    expect(isAmmoBalanced(game.current, tuning.initialAmmo)).toBe(true);
    // Leave after the confirmed shot, then reopen its result and discovery book.
    expect(await game.dispatchPersisted({ type: 'ABANDON' })).toBe('applied');
    const abandoned = await repo.read(scope);
    expect(abandoned?.state).toMatchObject({ phase: 'abandoned', score: summary.ledger.scoreAfter, shotsFired: 11 });
    expect(abandoned?.state.ledger).toHaveLength(11);
    expect(abandoned?.lastSummary).toEqual(summary);
    expect((await repo.readProfile(scope)).discoveredSets).toEqual(expect.arrayContaining([...summary.newlyCompletedSets]));
    expect(await repo.read(scope)).toEqual(abandoned);
    return { summary, state: abandoned!.state, maxCorks, graceTick, collectedTick, settledTick: game.gameTick };
  } finally {
    impulses.mockRestore();
    world.dispose();
    repo.close();
  }
}

it('pays the last split shot once, including the prize collected in grace after the reflection cap, then keeps it on exit', async () => {
  const result = await play(false);
  expect(await play(true)).toEqual(result);
  console.info('r006 split shot', {
    grace: result.graceTick, collection: result.collectedTick, settled: result.settledTick,
    ammo: result.summary.ammoAfter, gain: result.summary.ledger.scoreAfter - result.summary.ledger.scoreBefore,
  });
});
