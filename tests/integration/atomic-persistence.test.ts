import { expect, it } from 'vitest';
import { mintId } from '../../src/contracts';
import type { RunScope, SaveReply } from '../../src/contracts/persistence';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { abandonRun } from '../../src/core/session';
import { createMemoryRunRepository } from '../../src/persistence/indexed-run-repository';
import { collectLegacyProfile, readLegacyShelf } from '../../src/persistence/legacy-import';
import { FakeStorage } from './fake-storage';

const bundle = getGameplayBundle('expanded-save-trial');
const initial = createExpandedRun(
  { runId: mintId.run('repository-spec'), seed: 731, tuning: bundle.tuning, playerName: null },
  { ...bundle, expansion: bundle.expansion! },
);
const scope: RunScope = { mode: 'normal', rulesVersion: initial.rulesVersion };
function saved(reply: SaveReply) {
  if (!reply.ok) throw Error(reply.reason);
  return reply;
}

it('checks receipts before revisions and returns the latest record after loss of a reply', async () => {
  const repo = createMemoryRunRepository('one');
  const first = saved(await repo.start(scope, initial, null)).record;
  const confirm = {
    operationId: 'position-1',
    expected: first.token,
    state: { ...initial, phase: 'loading' as const },
    gameTick: 10,
  };
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
  storage.setItem(
    'shatekki.profile.v2',
    JSON.stringify({
      schemaVersion: 2,
      bestScores: { old: 100 },
      legacyBestScore: 21,
      discoveredSets: ['S001', 'PAIR001', 'PAIR999'],
    }),
  );
  storage.setItem(
    'shatekki.profile.v1.daily',
    JSON.stringify({ schemaVersion: 1, bestScore: 50, discoveredSets: ['S002'] }),
  );
  const known = new Set(bundle.catalog.sets.keys());
  const before = [...storage.data];
  const normal = collectLegacyProfile(scope, storage, known);
  expect(normal.unreadable).toEqual(['shatekki.profile.v1', 'shatekki.profile.v2']);
  expect(normal.discoveredSets).toEqual(['S001', 'PAIR001']);
  const daily = collectLegacyProfile({ ...scope, mode: 'daily', startedDateJst: '2026-11-18' }, storage, known);
  expect(daily.discoveredSets).toEqual(['S002']);
  expect(daily.legacyBestScore).toBe(50);
  expect([...storage.data]).toEqual(before);
});

it('rejects a damaged expanded candidate without changing the saved record', async () => {
  const repo = createMemoryRunRepository('writer', bundle);
  const record = saved(await repo.start(scope, initial, null)).record;
  const damaged = { ...initial, score: 123, phase: 'loading' as const };
  expect(
    await repo.saveCommand({ expected: record.token, operationId: 'confirm', gameTick: 1, state: damaged }),
  ).toEqual({ ok: false, reason: 'invalid' });
  expect(await repo.read(scope)).toEqual(record);
});

it('reports a partly unreadable old profile while retaining valid discoveries and the exact raw data', () => {
  const storage = new FakeStorage();
  const raw = JSON.stringify({
    schemaVersion: 2,
    bestScores: [],
    legacyBestScore: 'old',
    discoveredSets: ['S001', null],
  });
  storage.setItem('shatekki.profile.v2', raw);
  const snapshot = collectLegacyProfile(scope, storage, new Set(bundle.catalog.sets.keys()));
  expect(snapshot.unreadable).toEqual(['shatekki.profile.v2']);
  expect(snapshot.discoveredSets).toEqual(['S001']);
  expect(snapshot.legacyBestScore).toBeNull();
  expect([...storage.data]).toEqual([['shatekki.profile.v2', raw]]);
});

it('accepts the same discovery across old versions and warns when one version contains duplicate or unsupported entries', () => {
  const storage = new FakeStorage();
  const normal = JSON.stringify({ schemaVersion: 1, bestScore: 70, discoveredSets: ['S001'] });
  const expanded = JSON.stringify({ schemaVersion: 2, bestScores: {}, legacyBestScore: 70, discoveredSets: ['S001', 'PAIR001'] });
  storage.setItem('shatekki.profile.v1', normal);
  storage.setItem('shatekki.profile.v2', expanded);
  const known = new Set(bundle.catalog.sets.keys());
  expect(collectLegacyProfile(scope, storage, known).unreadable).toEqual([]);
  const damaged = JSON.stringify({ schemaVersion: 1, bestScore: 70, discoveredSets: ['S001', 'S001', 'PAIR001'] });
  storage.setItem('shatekki.profile.v1', damaged);
  expect(collectLegacyProfile(scope, storage, known)).toEqual({
    unreadable: ['shatekki.profile.v1'], discoveredSets: ['S001', 'PAIR001'], legacyBestScore: 70,
  });
  expect([...storage.data]).toEqual([['shatekki.profile.v1', damaged], ['shatekki.profile.v2', expanded]]);
});

it('retains each valid souvenir in its original position even when another slot has a broken shape', () => {
  const first = { typeId: 'P001', runId: 'first win' };
  const last = { typeId: 'P003', runId: 'later win' };
  const storage = new FakeStorage();
  for (const [slots, expected, damaged] of [
    [[first, null, last], [first, null, last], false],
    [[first, { typeId: 'P003', runId: '' }, last], [first, null, last], true],
    [[false, last], [null, last, null], true],
    [[null, null, null, first], [null, null, null], true],
  ] as const) {
    const key = 'shatekki.souvenirs.v1';
    const raw = JSON.stringify({ slots });
    storage.setItem(key, raw);
    expect(readLegacyShelf(storage, bundle.catalog.prizes)).toEqual({ slots: expected, damaged });
    expect([...storage.data]).toEqual([[key, raw]]);
  }
});
