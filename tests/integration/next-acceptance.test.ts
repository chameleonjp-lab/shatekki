import mixedSetInputs from '../fixtures/next-seed-39595.json';
import { expect, it, vi } from 'vitest';
import { GameController } from '../../src/app/controller';
import { PersistedSession } from '../../src/app/persisted-session';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { mintId, isAmmoBalanced, type ShotSummary } from '../../src/contracts';
import type { ConfirmedPresentation } from '../../src/contracts/persistence';
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
  const stepSec = b.tuning.limits.fixedStepSec;
  const until = async (tick: number) => {
    while (c.gameTick < tick) {
      const previous = c.gameTick;
      c.frame(Math.min(12, tick - c.gameTick) * stepSec);
      if (c.persistencePending) await vi.waitFor(() => expect(session.status).toBe('ready'), { interval: 1 });
      expect(c.gameTick, `wait at ${previous} (target ${tick}, ${session.status}/${session.reason}, ${c.current.phase}/${c.current.inFlight?.stage})`).toBeGreaterThan(previous);
    }
  };
  try {
    for (const { tick, cmd } of mixedSetInputs) {
      await until(tick);
      const outcome = await c.dispatchPersisted(cmd);
      if (cmd.type !== 'AIM' && cmd.type !== 'SET_POSITION') expect(outcome, JSON.stringify({tick,cmd})).toBe('applied');
    }
    await until(3412);
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
