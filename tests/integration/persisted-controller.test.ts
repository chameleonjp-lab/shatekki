import { expect, it, vi } from 'vitest';
import { GameController } from '../../src/app/controller';
import { PersistedSession } from '../../src/app/persisted-session';
import { CORE_RULES } from '../../src/app/rules';
import { createExpandedRun } from '../../src/core/expanded-run';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { mintId } from '../../src/contracts';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { createShotWorld } from '../../src/sim/world';

async function setup() {
  const bundle = getGameplayBundle('expanded-save-trial');
  const initial = createExpandedRun({ runId: mintId.run('controller-test'), seed: 7919, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: bundle.expansion! });
  const repo = createMemoryRunRepository('page');
  const reply = await repo.start({mode:'normal', rulesVersion:initial.rulesVersion}, initial, null);
  if (!reply.ok) throw Error(reply.reason);
  const session = new PersistedSession(repo, reply.record);
  const world = await createShotWorld(bundle.layout, bundle.catalog, bundle.tuning);
  const fire = vi.spyOn(world, 'fire');
  const replay = vi.fn(), settled = vi.fn();
  const controller = new GameController({ ...bundle, rules: CORE_RULES, renderer:null, world, session, onReplayed: replay, onShotSettled: settled }, initial);
  expect(await controller.dispatchPersisted({type:'CONFIRM_POSITION'})).toBe('applied');
  expect(await controller.dispatchPersisted({type:'STOP_LOAD'})).toBe('applied');
  return {session, repo, fire, controller, world, replay, settled};
}

it('retains the exact failed fire; input and clocks wait; retry starts one flight', async () => {
  const {session,repo,fire,controller:c,world} = await setup();
  const write = vi.spyOn(repo,'saveCommand').mockResolvedValueOnce({ok:false,reason:'quota'});
  const before = c.current;
  expect(await c.dispatchPersisted({type:'FIRE'})).toBe('retryable');
  c.frame(0.1);
  expect(c.current).toBe(before);
  expect(await c.dispatchPersisted({type:'FIRE'})).toBe('rejected');
  expect(fire).not.toHaveBeenCalled();
  expect(await session.retry()).toBe('applied');
  expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
  expect(fire).toHaveBeenCalledTimes(1);
  world.dispose();
});

it('losing only the reply rereads the saved flight and never fires again', async () => {
  const {session,repo,fire,controller:c,world,replay} = await setup();
  const write = repo.saveCommand.bind(repo);
  vi.spyOn(repo,'saveCommand').mockImplementationOnce(async i => { await write(i); throw Error('response lost'); });
  expect(await c.dispatchPersisted({type:'FIRE'})).toBe('retryable');
  expect(await session.retry()).toBe('applied');
  expect(replay).toHaveBeenCalledTimes(1);
  expect(fire).not.toHaveBeenCalled();
  world.dispose();
});

it('retries the same complete settlement without running physics or resolving twice', async () => {
  const {session,repo,controller:c,world,settled} = await setup();
  const write = vi.spyOn(repo,'commitShot').mockResolvedValueOnce({ok:false,reason:'quota'});
  expect(await c.dispatchPersisted({type:'FIRE'})).toBe('applied');
  for(let i=0;i<2000 && !c.persistencePending;i++) {
    c.frame(1/60);
    const q = c.viewState().expansion?.question;
    if (q) await c.dispatchPersisted({type:'ANSWER_SHOPKEEPER',shotId:q.shotId,questionId:q.questionId,choice:'A'});
  }
  await vi.waitFor(()=>expect(session.status).toBe('retryable'));
  expect(settled).not.toHaveBeenCalled();
  const step = vi.spyOn(world,'step');
  c.frame(0.1);
  expect(step).not.toHaveBeenCalled();
  expect(await session.retry()).toBe('applied');
  expect(write.mock.calls[0]).toEqual(write.mock.calls[1]);
  expect(settled).toHaveBeenCalledTimes(1);
  expect(c.current.ledger).toHaveLength(1);
  world.dispose();
});

it('holds an acknowledged fire while rotated and only launches after an explicit resume', async () => {
  const {repo,controller:c,world,fire} = await setup();
  let allow!: () => void;
  const pending = new Promise<void>(resolve => {allow = resolve;});
  const save = repo.saveCommand.bind(repo);
  vi.spyOn(repo,'saveCommand').mockImplementationOnce(async input => {
    await pending;
    return save(input);
  });
  const action = c.dispatchPersisted({type:'FIRE'});
  c.setEnvironmentPause(['landscape']);
  allow();
  expect(await action).toBe('applied');
  c.setEnvironmentPause([]);
  expect(c.current.pauseReasons).toEqual(['manual']);
  expect(fire).not.toHaveBeenCalled();
  await c.dispatchPersisted({type:'RESUME', reason:'manual'});
  expect(fire).toHaveBeenCalledTimes(1);
  world.dispose();
});
