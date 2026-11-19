import { describe, expect, it, vi } from 'vitest';
import { GameController } from '../../src/app/controller';
import { PersistedSession } from '../../src/app/persisted-session';
import { CORE_RULES } from '../../src/app/rules';
import { createExpandedRun } from '../../src/core/expanded-run';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { powerZoneWidthFor } from '../../src/core/aim-first';
import { mintId, type ExpandedRunState, type RunState } from '../../src/contracts';
import type { RunRepository, RunScope } from '../../src/contracts/persistence';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { createShotWorld } from '../../src/sim/world';

const B = getGameplayBundle('expanded-aim-first');
const SCOPE: RunScope = { mode: 'normal', rulesVersion: B.catalog.rulesVersion };

async function tab(repo: RunRepository, writer: string, record: Awaited<ReturnType<RunRepository['start']>>) {
  if (!record.ok) throw Error(record.reason);
  const session = new PersistedSession(repo, record.record);
  const world = await createShotWorld(B.layout, B.catalog, B.tuning, { transformPolicy: B.behavior!.transformPolicy });
  const fire = vi.spyOn(world, 'fire');
  const replay = vi.fn();
  const settled = vi.fn();
  const c = new GameController({ ...B, rules: CORE_RULES, renderer: null, world, session, onReplayed: replay, onShotSettled: settled, clockPolicy: 'fixed', transformPolicy: B.behavior!.transformPolicy, initialGameTick: record.record.gameTick }, record.record.state);
  return { session, world, fire, replay, settled, c, writer };
}

async function setup(seed = 4242) {
  const repo = createMemoryRunRepository('page-a', B);
  const initial = createExpandedRun({ runId: mintId.run(`aim-first-${seed}`), seed, tuning: B.tuning, playerName: null }, { ...B, expansion: B.expansion! });
  const t = await tab(repo, 'page-a', await repo.start(SCOPE, initial, null));
  // answer the order card first (a normal first-screen step, saved like before)
  expect(await t.c.dispatchPersisted({ type: 'ORDER', accept: false })).toBe('applied');
  return { repo, ...t };
}

const talk = (s: RunState) => (s as ExpandedRunState).expansion.aimFirst?.talk ?? null;

describe('工程1: aim, move and fire are saved as the plan says', () => {
  it('a new r007 run is saved in the aiming phase without a load result', async () => {
    const { session, world } = await setup();
    expect(session.record.state.phase).toBe('aiming');
    expect(session.record.state.load).toBeNull();
    world.dispose();
  });

  it('moving and aiming are local until the gesture ends; then one numbered save keeps them for a reload', async () => {
    const { repo, session, c, world } = await setup();
    const save = vi.spyOn(repo, 'saveCommand');
    expect(await c.dispatchPersisted({ type: 'SET_POSITION', x: 1.4 })).toBe('applied');
    expect(await c.dispatchPersisted({ type: 'AIM', yaw: 0.2, pitch: 0.1 })).toBe('applied');
    expect(save).not.toHaveBeenCalled();
    expect(await c.commitAim()).toBe('applied');
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].operationId).toBe(`${c.current.runId}/aim/1`);
    expect(session.record.state.standX).toBe(1.4);
    expect(session.record.state.aim).toEqual({ yaw: 0.2, pitch: 0.1 });
    // an unchanged position writes nothing
    expect(await c.commitAim()).toBe('applied');
    expect(save).toHaveBeenCalledTimes(1);
    // a reload resumes from the last saved position and aim
    const claimed = await repo.claim(SCOPE, session.record.token, 'resumeStable');
    expect(claimed.ok && claimed.record.state).toMatchObject({ phase: 'aiming', standX: 1.4, aim: { yaw: 0.2, pitch: 0.1 }, pauseReasons: ['manual'] });
    world.dispose();
  });

  it('a failed aim save blocks shooting until the explicit retry writes the same operation', async () => {
    const { repo, session, c, world } = await setup();
    const save = vi.spyOn(repo, 'saveCommand').mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
    c.dispatch({ type: 'SET_POSITION', x: -2 }); // rejected: the controller is persisted
    await c.dispatchPersisted({ type: 'SET_POSITION', x: -2 });
    expect(await c.commitAim()).toBe('retryable');
    expect(await c.dispatchPersisted({ type: 'OPEN_GAUGE' })).toBe('rejected');
    expect(await session.retry()).toBe('applied');
    expect(save.mock.calls[0]).toEqual(save.mock.calls[1]);
    expect(session.record.state.standX).toBe(-2);
    world.dispose();
  });

  it('opening and cancelling the gauge are not saved; a reload with the gauge open comes back aiming', async () => {
    const { repo, session, c, world } = await setup();
    const save = vi.spyOn(repo, 'saveCommand');
    expect(await c.dispatchPersisted({ type: 'OPEN_GAUGE' })).toBe('applied');
    expect(c.current.phase).toBe('loading');
    expect(save).not.toHaveBeenCalled();
    const claimed = await repo.claim(SCOPE, session.record.token, 'resumeStable');
    expect(claimed.ok && claimed.record.state.phase).toBe('aiming');
    world.dispose();
  });

  it('a failed FIRE save keeps the pressed tick, power, position and aim; the retry fires once', async () => {
    const { repo, session, c, world, fire } = await setup();
    await c.dispatchPersisted({ type: 'SET_POSITION', x: 0.6 });
    await c.dispatchPersisted({ type: 'AIM', yaw: 0.1, pitch: 0.05 });
    expect(await c.commitAim()).toBe('applied');
    expect(await c.dispatchPersisted({ type: 'OPEN_GAUGE' })).toBe('applied');
    for (let i = 0; i < 30; i++) c.frame(1 / 60);
    const write = vi.spyOn(repo, 'saveCommand').mockResolvedValueOnce({ ok: false, reason: 'quota' });
    expect(await c.dispatchPersisted({ type: 'FIRE' })).toBe('retryable');
    const held = c.current;
    c.frame(0.2); // the gauge does not move while the save waits
    expect(c.current).toBe(held);
    expect(await c.dispatchPersisted({ type: 'FIRE' })).toBe('rejected');
    expect(fire).not.toHaveBeenCalled();
    expect(await session.retry()).toBe('applied');
    expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
    const saved = write.mock.calls[0]![0].state;
    expect(saved.load).toEqual(c.current.load);
    expect(saved.standX).toBe(0.6);
    expect(fire).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0]![0].operationId).toBe(`${c.current.runId}/1/fire`);
    world.dispose();
  });

  it('a fired shot settles back into aiming (the save accepts it) and keeps the position and aim', async () => {
    const { session, c, world, settled } = await setup();
    await c.dispatchPersisted({ type: 'SET_POSITION', x: 0.6 });
    await c.dispatchPersisted({ type: 'AIM', yaw: 0.05, pitch: 0.1 });
    await c.commitAim();
    await c.dispatchPersisted({ type: 'OPEN_GAUGE' });
    expect(await c.dispatchPersisted({ type: 'FIRE' })).toBe('applied');
    for (let i = 0; i < 3000 && settled.mock.calls.length === 0; i++) {
      if (c.persistencePending) await vi.waitFor(() => expect(c.persistencePending).toBe(false));
      const q = c.viewState().expansion?.question;
      if (q && q.answer === null) await c.dispatchPersisted({ type: 'ANSWER_SHOPKEEPER', shotId: q.shotId, questionId: q.questionId, choice: 'A' });
      c.frame(1 / 60);
    }
    await vi.waitFor(() => expect(settled).toHaveBeenCalledTimes(1));
    expect(session.record.state.phase).toBe('aiming');
    expect(c.current).toMatchObject({ phase: 'aiming', standX: 0.6, aim: { yaw: 0.05, pitch: 0.1 }, load: null });
    world.dispose();
  });
});

describe('4c: talking to the shopkeeper is saved once with its effect', () => {
  it('ammo: the cork and the 0.85 zone are written together under runId/shopkeeper-talk', async () => {
    const { repo, session, c, world } = await setup();
    const save = vi.spyOn(repo, 'saveCommand');
    expect(await c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe('applied');
    expect(save.mock.calls[0]![0].operationId).toBe(`${c.current.runId}/shopkeeper-talk`);
    expect(session.record.state.ammo).toBe(11);
    expect(powerZoneWidthFor(session.record.state)).toBe(0.85);
    expect(talk(session.record.state)).toMatchObject({ choice: 'ammo', ammoGranted: 1 });
    // pressed again (a double tap): refused by the rules, nothing written
    expect(await c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe('rejected');
    expect(save).toHaveBeenCalledTimes(1);
    world.dispose();
  });

  it('a failed save changes nothing until the retry; a lost reply re-reads the stored talk and never pays twice', async () => {
    const { repo, session, c, world, replay } = await setup();
    vi.spyOn(repo, 'saveCommand').mockResolvedValueOnce({ ok: false, reason: 'unavailable' });
    expect(await c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe('retryable');
    expect(c.current.ammo).toBe(10);
    expect(talk(c.current)).toBeNull();
    // the reply of the retry is lost after the write
    const write = repo.saveCommand.bind(repo);
    vi.spyOn(repo, 'saveCommand').mockImplementationOnce(async (i) => {
      await write(i);
      throw Error('response lost');
    });
    expect(await session.retry()).toBe('retryable');
    expect(await session.retry()).toBe('applied');
    expect(replay).toHaveBeenCalledTimes(1);
    const claimed = await repo.claim(SCOPE, session.record.token, 'resumeStable');
    expect(claimed.ok && claimed.record.state.ammo).toBe(11);
    expect(claimed.ok && claimed.record.state.bonusAmmoTotal).toBe(1);
    world.dispose();
  });

  it('a reload right after the talk keeps one cork and the unused 0.85 condition; cancelling the gauge does not use it', async () => {
    const { repo, session, c, world } = await setup();
    await c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' });
    await c.dispatchPersisted({ type: 'OPEN_GAUGE' });
    await c.dispatchPersisted({ type: 'CANCEL_GAUGE' });
    const claimed = await repo.claim(SCOPE, session.record.token, 'resumeStable');
    if (!claimed.ok) throw Error(claimed.reason);
    expect(claimed.record.state.ammo).toBe(11);
    expect(powerZoneWidthFor(claimed.record.state)).toBe(0.85);
    world.dispose();
  });

  it('two tabs: the second talk is refused as a conflict and only the first result stays', async () => {
    const { repo, session, c, world } = await setup();
    const other = await repo.claim(SCOPE, session.record.token, 'resumeStable');
    if (!other.ok) throw Error(other.reason);
    // tab B took the run over; tab A's old token can no longer write
    expect(await c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe('conflict');
    const b = await tab(repo, 'page-a', other);
    await b.c.dispatchPersisted({ type: 'RESUME', reason: 'manual' });
    expect(await b.c.dispatchPersisted({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' })).toBe('applied');
    expect(talk(b.session.record.state)?.choice).toBe('hint');
    expect(b.session.record.state.ammo).toBe(10);
    world.dispose();
    b.world.dispose();
  });

  it('the repository refuses a forged talk that adds a cork under another operation id', async () => {
    const { repo, session, c, world } = await setup();
    const after = CORE_RULES.reduceGame(c.current, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }, { ...B, expansion: B.expansion });
    const reply = await repo.saveCommand({ expected: session.record.token, state: after, operationId: `${after.runId}/9/ORDER`, gameTick: 0 });
    expect(reply).toEqual({ ok: false, reason: 'invalid' });
    world.dispose();
  });
});
