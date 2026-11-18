import graceInputs from '../fixtures/next-seed-380112.json';
import mixedSetInputs from '../fixtures/next-seed-39595.json';
import { expect, it, vi } from 'vitest';
import { GameController } from '../../src/app/controller';
import { PersistedSession } from '../../src/app/persisted-session';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { mintId, isAmmoBalanced, type ShotSummary, type ShotStage, type ExpandedRunState } from '../../src/contracts';
import type { ConfirmedPresentation } from '../../src/contracts/persistence';
import { buildLedgerEntry } from '../../src/core/scoring';
import { validateRunState } from '../../src/core/session';
import { createExpandedRun } from '../../src/core/expanded-run';
import { rewardDevicesFor, TARGET_AIM } from '../../src/core/rewards';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';

it('plays a saved r006 game through first hits, last-cork rescue and depletion, then reads the same result twice', async () => {
  const b = getGameplayBundle('expanded-next');
  const scope = { mode: 'normal', rulesVersion: b.catalog.rulesVersion } as const;
  const repo = createMemoryRunRepository('counter', b);
  const start = createExpandedRun({ seed: 7919, runId: mintId.run('next-acceptance'), tuning: b.tuning, playerName: null }, { ...b, expansion: b.expansion! });
  const reply = await repo.start(scope, start, null);
  if (!reply.ok) throw new Error(reply.reason);
  const session = new PersistedSession(repo, reply.record);
  const world = await createShotWorld(b.layout, b.catalog, b.tuning, {
    rewardDevices: rewardDevicesFor(b.expansion!.profile.rewards ?? null), transformPolicy: b.behavior?.transformPolicy,
  });
  const notifications: ConfirmedPresentation[] = [];
  const settled: ShotSummary[] = [];
  const c = new GameController({ ...b, world, rules: CORE_RULES, renderer: null, session, transformPolicy: b.behavior?.transformPolicy,
    clockPolicy: b.behavior?.clock, onConfirmed: event => notifications.push(event), onShotSettled: summary => settled.push(summary),
  }, start);
  const stand = b.layout.camera.standMaxX;
  const keeper = b.layout.shopkeeper.find(p => p.part === 'body')!.box.center;
  const keeperAim = aimAt(b, stand, { x: keeper.x, y: 1.2, z: keeper.z + 0.1 }, 'standard');
  let rescued = false;
  try {
    for (let shot = 0; c.current.phase !== 'ended' && shot < 20; shot++) {
      const initialAmmo = c.current.ammo;
      await c.dispatchPersisted({ type: 'SET_POSITION', x: stand });
      expect(await c.dispatchPersisted({ type: 'CONFIRM_POSITION' })).toBe('applied');
      c.frame(0.6);
      expect(await c.dispatchPersisted({ type: 'STOP_LOAD' })).toBe('applied');
      const target = initialAmmo === 1 && !rescued;
      const aim = shot < 2 ? keeperAim : target ? TARGET_AIM : { yaw: 0, pitch: 0.8 };
      await c.dispatchPersisted({ type: 'AIM', ...aim });
      expect(await c.dispatchPersisted({ type: 'FIRE' })).toBe('applied');
      for (let guard = 0; c.current.phase === 'resolving' && guard < 3000; guard++) {
        if (c.awaitingAnswer) {
          const flight = c.current.inFlight!;
          expect(await c.dispatchPersisted({
            type: 'ANSWER_SHOPKEEPER', shotId: flight.shotId, questionId: flight.plan!.question!.questionId, choice: 'A',
          })).toBe('applied');
        }
        c.frame(1 / 30);
        if (c.persistencePending) await vi.waitFor(() => expect(session.status).toBe('ready'), { interval: 1 });
      }
      expect(settled).toHaveLength(shot + 1);
      expect(isAmmoBalanced(c.current, 10)).toBe(true);
      const saved = await repo.read(scope);
      expect(saved?.state).toEqual(c.current);
      expect(saved?.lastSummary).toEqual(settled.at(-1));
      if (target) {
        expect(settled.at(-1)!.rewards?.some(r => r.id === 'A5' && r.granted > 0)).toBe(true);
        expect(c.current.phase).toBe('position');
        rescued = true;
      }
    }
    expect(rescued).toBe(true);
    const first = settled[0]!;
    const repeat = settled[1]!;
    expect(first.collected).toHaveLength(0);
    expect(first.ledger.firstHitPoints).toBeGreaterThan(0);
    expect(repeat.touchedFirstHitTargets).toEqual(first.touchedFirstHitTargets);
    expect(repeat.ledger.firstHitPoints).toBe(0);
    expect(c.current.phase).toBe('ended');
    expect(settled.at(-1)?.ammoAfter).toBe(0);
    expect(notifications.filter(p => p.kind === 'shot')).toHaveLength(c.current.shotsFired);
    const result = await repo.read(scope);
    expect(result?.result?.score).toBe(c.current.score);
    expect(await repo.read(scope)).toEqual(result);
    expect((await repo.readProfile(scope)).bestScore).toBe(c.current.score);
    const closed = await repo.closeResult(result!.token);
    expect(closed.ok).toBe(true);
    const next = createExpandedRun({ seed: 7919, runId: mintId.run('again'), tuning: b.tuning, playerName: null }, { ...b, expansion: b.expansion! });
    if (!closed.ok) throw new Error(closed.reason);
    expect((await repo.start(scope, next, closed.record.token)).ok).toBe(true);
    expect((await repo.read(scope))?.state.completedSets).toEqual([]);
  } finally {
    world.dispose();
  }
}, 60_000);

/** Apply input at its recorded tick. Settlement can start an asynchronous
 * commit inside the frame. Resume only after that transaction completes. */
async function replayInputs(c: GameController, inputs: readonly {tick: number; cmd: {type: string}}[], endTick: number) {
  const stepSec = getGameplayBundle('expanded-next').tuning.limits.fixedStepSec;
  const until = async (tick: number) => {
    while (c.gameTick < tick) {
      const previous = c.gameTick;
      c.frame(Math.min(12, tick - c.gameTick) * stepSec);
      if (c.persistencePending) await vi.waitFor(() => expect(c.persistencePending).toBe(false), { interval: 1 });
      expect(c.gameTick, `stopped at ${previous} before input at ${tick}`).toBeGreaterThan(previous);
    }
  };
  for (const { tick, cmd } of inputs) {
    await until(tick);
    const result = await c.dispatchPersisted(cmd);
    if (cmd.type !== 'AIM' && cmd.type !== 'SET_POSITION') expect(result, JSON.stringify({ tick, cmd })).toBe('applied');
  }
  await until(endTick);
}

// Captured from the original scripted player's seed 39595, through shot 12.
// Only the controller inputs are replayed. Rapier, scoring, the book and the
// refill are recomputed by the game on every test run.
it('awards two pairs and a triple on one confirmed shot and keeps that discovery on reread', async () => {
  const b = getGameplayBundle('expanded-next');
  const scope = { mode: 'normal', rulesVersion: b.catalog.rulesVersion } as const;
  const repo = createMemoryRunRepository('book', b);
  const start = createExpandedRun({ seed: 39595, runId: mintId.run('mixed-sets'), tuning: b.tuning, playerName: null }, { ...b, expansion: b.expansion! });
  const reply = await repo.start(scope, start, null);
  if (!reply.ok) throw new Error(reply.reason);
  const session = new PersistedSession(repo, reply.record);
  const world = await createShotWorld(b.layout, b.catalog, b.tuning, {
    rewardDevices: rewardDevicesFor(b.expansion!.profile.rewards ?? null), transformPolicy: b.behavior?.transformPolicy,
  });
  const presented: ConfirmedPresentation[] = [];
  const c = new GameController({ ...b, world, rules: CORE_RULES, renderer: null, session, transformPolicy: b.behavior?.transformPolicy,
    clockPolicy: b.behavior?.clock, onConfirmed: event => presented.push(event),
  }, start);
  try {
    await replayInputs(c, mixedSetInputs, 3412);
    const found = ['PAIR245', 'PAIR246', 'S076'];
    expect(session.record.lastSummary?.shotNumber).toBe(12);
    expect(session.record.lastSummary?.newlyCompletedSets).toEqual(found);
    expect(session.record.lastFreshSets).toEqual(found);
    expect(presented.filter(p => p.kind === 'shot')).toHaveLength(12);
    expect(presented.at(-1)).toMatchObject({ kind: 'shot', freshSets: found });
    const before = await repo.readProfile(scope);
    expect(before.discoveredSets).toEqual(['PAIR244', ...found]);
    expect((await repo.read(scope))?.lastSummary).toEqual(session.record.lastSummary);
    expect(await repo.readProfile(scope)).toEqual(before);
  } finally {
    world.dispose();
  }
}, 60_000);

// Start from a stable scene. The obstacles, prize shapes, device locations,
// launch and all physics/scoring rules are those of the actual r006 bundle.
async function booth(initial: ExpandedRunState) {
  const b = getGameplayBundle('expanded-next');
  expect(validateRunState(initial, b.catalog, b.tuning, b.layout, b.expansion)).toBeNull();
  const rules = b.expansion!.profile.rewards!;
  const world = await createShotWorld(b.layout, b.catalog, b.tuning, {
    transformPolicy: b.behavior?.transformPolicy, rewardDevices: rewardDevicesFor(rules),
  });
  const stages: { shotId: string; stage: ShotStage }[] = [];
  const summaries: ShotSummary[] = [];
  const c = new GameController({ ...b, world, rules: CORE_RULES, renderer: null,
    transformPolicy: b.behavior?.transformPolicy, clockPolicy: b.behavior?.clock,
    onSimEvents(events) {
      for (const e of events) if (e.type === 'shotStage') stages.push({ shotId: e.shotId, stage: e.stage });
    },
    onShotSettled: summary => summaries.push(summary),
  }, initial);
  const fire = (x: number, yaw: number, pitch: number) => {
    c.dispatch({ type: 'SET_POSITION', x });
    expect(c.dispatch({ type: 'CONFIRM_POSITION' })).toBe(true);
    c.frame(0.6);
    expect(c.dispatch({ type: 'STOP_LOAD' })).toBe(true);
    c.dispatch({ type: 'AIM', yaw, pitch });
    expect(c.dispatch({ type: 'FIRE' })).toBe(true);
    for (let i = 0; i < 250 && c.current.phase === 'resolving'; i++) {
      const q = c.viewState().expansion?.question;
      if (q) expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: q.shotId, questionId: q.questionId, choice: 'A' })).toBe(true);
      c.frame(0.1);
    }
    expect(c.current.phase).not.toBe('resolving');
    return summaries.at(-1)!;
  };
  return { c, stages, summaries, fire, dispose: () => world.dispose() };
}

function initialBooth(seed = 7919) {
  const b = getGameplayBundle('expanded-next');
  return createExpandedRun({ runId: mintId.run('counterexample'), seed, tuning: b.tuning, playerName: null }, { ...b, expansion: b.expansion! });
}

it('awards only the hidden daruma first-hit points on its first touch and zero on its second touch', async () => {
  const scene = await booth(initialBooth());
  try {
    const firstHit = getGameplayBundle('expanded-next').tuning.scoring.hiddenTargetPoints;
    for (const [x, pitch, expected] of [[-2.24, 0.26, firstHit], [-2.16, 0.24, 0]] as const) {
      const shot = scene.fire(x, -0.1875, pitch);
      expect(shot.touchedFirstHitTargets).toEqual(['hidden:hidden-daruma']);
      expect(shot.collected).toHaveLength(0);
      expect(shot.ledger.firstHitPoints).toBe(expected);
      expect(shot.ledger.scoreAfter - shot.ledger.scoreBefore).toBe(expected);
    }
    expect(scene.c.current.firstHitsScored).toEqual(['hidden:hidden-daruma']);
    expect(scene.summaries).toHaveLength(2);
  } finally {
    scene.dispose();
  }
});

it('resolves the actual old +2 plate and the original bag on the same last cork with one opening under the cap', async () => {
  const before = initialBooth();
  const bag = before.expansion.rewards!.bag!.instanceId;
  // A pre-shot boundary fixture: 18 completed shots, 9 total grants, one
  // remaining cork, and the detached original bag sitting on the upper tier.
  const fixture = {
    ...before, shotsFired: 18, ammo: 1, bonusAmmoTotal: 9,
    ledger: Array.from({ length: 18 }, (_, i) => buildLedgerEntry(mintId.shot(i + 1), 0, [])),
    shelf: { ...before.shelf, prizes: before.shelf.prizes.map(p => p.instanceId === bag
      ? { ...p, mounted: false, hp: 1, pose: { ...p.pose, position: { x: 2.22, y: 1.57, z: -2 } } } : p) },
    expansion: { ...before.expansion, next: { ...before.expansion.next, modifiers: {
      ...before.expansion.next.modifiers, launch: { count: 3 as const, spreadRad: 0.175 },
    } } },
  };
  const scene = await booth(fixture);
  try {
    const shot = scene.fire(2.35, 0.115, 0.29);
    expect(shot.collected.map(p => p.instanceId)).toContain(bag);
    expect(shot.effects).toContainEqual(expect.objectContaining({
      source: { kind: 'device', deviceId: 'dev-ammo-1', deviceKind: 'ammo' }, ammoRequested: 2, ammoDelta: 1,
    }));
    expect(shot.rewards).toContainEqual({ id: 'A1', key: `bag:${bag}`, shotNumber: 19, offered: 2, granted: 0 });
    expect(scene.c.current.expansion?.rewards?.bag?.used).toBe(true);
    expect(scene.c.current).toMatchObject({ phase: 'position', shotsFired: 19, ammo: 1, bonusAmmoTotal: 10 });
    expect(scene.summaries).toHaveLength(1);
    expect(scene.stages.filter(s => s.stage === 'settle')).toHaveLength(1);
  } finally {
    scene.dispose();
  }
});

it('enters finite fall grace once, then confirms the third shot exactly once', async () => {
  const scene = await booth(initialBooth(380112));
  try {
    await replayInputs(scene.c, graceInputs, graceInputs.at(-1)!.tick);
    for (let i = 0; i < 150 && scene.c.current.phase === 'resolving'; i++) scene.c.frame(0.1);
    expect(scene.stages.filter(s => s.shotId === 's03').map(s => s.stage)).toEqual(['flight', 'transform', 'settle', 'grace']);
    expect(scene.c.current.phase).toBe('position');
    scene.c.frame(0.5);
    expect(scene.summaries.map(s => s.shotNumber)).toEqual([1, 2, 3]);
    expect(scene.c.current.ledger).toHaveLength(3);
    expect(scene.summaries[2]!.endedByLimit).toBe(true);
  } finally {
    scene.dispose();
  }
});
