import { expect, it } from 'vitest';
import { mintId } from '../../src/contracts';
import type { RunScope, SaveReply } from '../../src/contracts/persistence';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { abandonRun } from '../../src/core/session';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { collectLegacyProfile } from '../../src/persistence/legacy-import';
import { FakeStorage } from './fake-storage';

const bundle = getGameplayBundle('expanded-full');
const initial = createExpandedRun({ runId: mintId.run('repository-spec'), seed: 731, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: bundle.expansion! });
const scope: RunScope = { mode: 'normal', rulesVersion: initial.rulesVersion };
function saved(reply: SaveReply) {
  if (!reply.ok) throw Error(reply.reason);
  return reply;
}

it('checks receipts before revisions and returns the latest record after loss of a reply', async () => {
  const repo = createMemoryRunRepository('one');
  const first = saved(await repo.start(scope, initial, null)).record;
  const confirm = { operationId: 'position-1', expected: first.token, state: { ...initial, phase: 'loading' as const }, gameTick: 10 };
  const second = saved(await repo.saveCommand(confirm));
  const third = saved(await repo.claim(scope, second.record.token, 'resumeStable'));
  const replay = saved(await repo.saveCommand(confirm));
  expect(replay).toMatchObject({ replayed: true, freshSets: [], record: { token: third.record.token } });
  expect(await repo.saveCommand({ ...confirm, gameTick: 11 })).toEqual({ ok: false, reason: 'invalid' });
  expect(await repo.closeResult(third.record.token)).toEqual({ ok: false, reason: 'invalid' });
  expect((await repo.read(scope))?.token).toEqual(third.record.token);
});

it('only starts the next game with the token of the explicitly closed terminal result', async () => {
  const repo = createMemoryRunRepository('one');
  const first = saved(await repo.start(scope, initial, null)).record;
  const next = { ...initial, runId: mintId.run('next') };
  expect(await repo.start(scope, next, first.token)).toMatchObject({ ok: false });
  const command = { expected: first.token, operationId: 'abandon-1', state: abandonRun(initial), gameTick: 0 };
  const end = saved(await repo.saveCommand(command)).record;
  expect(end.result?.status).toBe('abandoned');
  expect(await repo.start(scope, next, end.token)).toMatchObject({ ok: false });
  const closed = saved(await repo.closeResult(end.token));
  expect(closed.record.resultViewOpen).toBe(false);
  expect(saved(await repo.closeResult(closed.record.token)).record.token).toEqual(closed.record.token);
  expect(saved(await repo.start(scope, next, closed.record.token)).record.token.runId).toBe(next.runId);
  expect(await repo.saveCommand(command)).toEqual({ ok: false, reason: 'conflict' });
});

it('reads only raw legacy keys, preserving broken records and separating the two books', () => {
  const storage = new FakeStorage();
  storage.setItem('shatekki.profile.v1', '{broken');
  storage.setItem('shatekki.profile.v2', JSON.stringify({schemaVersion: 2, bestScores: {old: 100}, legacyBestScore: 21, discoveredSets: ['S001','PAIR001','PAIR999']}));
  storage.setItem('shatekki.profile.v1.daily', JSON.stringify({schemaVersion: 1, bestScore: 50, discoveredSets: ['S002']}));
  const known = new Set(bundle.catalog.sets.keys());
  const before = [...storage.data];
  const normal = collectLegacyProfile(scope, storage, known);
  expect(normal.unreadable).toEqual(['shatekki.profile.v1']);
  expect(normal.discoveredSets).toEqual(['S001','PAIR001']);
  const daily = collectLegacyProfile({ ...scope, mode:'daily', startedDateJst:'2026-11-18' }, storage, known);
  expect(daily.discoveredSets).toEqual(['S002']);
  expect(daily.legacyBestScore).toBe(50);
  expect([...storage.data]).toEqual(before);
});
