import { test, expect, type Page } from '@playwright/test';
import { build } from 'vite';
import { asPrizeTypeId, asSetId, mintId, type RunState, type ShotSummary } from '../../src/contracts';
import type { RunRepository, RunScope, SaveReply } from '../../src/contracts/persistence';
import type * as Fixture from './fixtures/atomic-repository';
import { buildLedgerEntry } from '../../src/core/scoring';

declare global {
  interface Window {
    checkpointTest: typeof Fixture;
    repository: RunRepository;
  }
}

test.use({ baseURL: 'http://127.0.0.1:4176' });
const scope: RunScope = { mode: 'normal', rulesVersion: 'rules-v2-proposed-r004' };
const fresh = (page: Page, id: string) => page.evaluate((id) => window.checkpointTest.fresh(id), id);
let library: string;
test.beforeAll(async () => {
  // The fixture uses the real repository in two same-origin browser pages. It is never shipped.
  const compiled = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      lib: { entry: 'tests/e2e/fixtures/atomic-repository.ts', name: 'checkpointTest', formats: ['iife'] },
    },
  });
  const output = Array.isArray(compiled) ? compiled[0] : compiled;
  if (!output || !('output' in output) || output.output[0]?.type !== 'chunk') throw Error('missing test library');
  library = output.output[0].code;
});

async function open(page: Page, writer: string) {
  await page.route('**/repository-fixture', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Checkpoint transaction test</title>' }),
  );
  await page.goto('/repository-fixture');
  await page.addScriptTag({ content: library });
  await page.evaluate(async (id) => {
    window.repository = await window.checkpointTest.createIndexedRunRepository(
      indexedDB,
      id,
      window.checkpointTest.bundle,
    );
  }, writer);
}
function saved(reply: SaveReply) {
  if (!reply.ok) throw Error(reply.reason);
  return reply.record;
}

test('reading while a shot flies has no effect; competing claims abandon it exactly once; the other tab closes and starts', async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await Promise.all([open(page, 'a'), open(other, 'b')]);
  const initial = await fresh(page, 'two-tabs');
  let record = saved(
    await page.evaluate(([s, state]) => window.repository.start(s, state, null), [scope, initial] as const),
  );
  let state: RunState = initial;
  for (const type of ['CONFIRM_POSITION', 'STOP_LOAD', 'FIRE'] as const) {
    state = await page.evaluate(([s, t]) => window.checkpointTest.reduce(s, { type: t }), [state, type] as const);
    record = saved(
      await page.evaluate((input) => window.repository.saveCommand(input), {
        expected: record.token,
        operationId: type === 'FIRE' ? 'two-tabs/1/fire' : type,
        state,
        gameTick: 0,
      }),
    );
  }
  const read = await other.evaluate((s) => window.repository.read(s), scope);
  expect(read).toEqual(record);
  const attempt = (p: Page) =>
    p.evaluate(([s, t]) => window.repository.claim(s, t, 'abandonInFlight'), [scope, record.token] as const);
  const replies = await Promise.all([attempt(page), attempt(other)]);
  expect(replies.filter((r) => r.ok)).toHaveLength(1);
  expect(replies.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'conflict' }]);
  const abandoned = saved(replies.find((r) => r.ok)!);
  expect(abandoned.result?.status).toBe('abandoned');
  const nonowner = abandoned.ownerId === 'a' ? other : page;
  expect(
    await nonowner.evaluate(
      (id) => window.repository.place({ runId: id, typeId: 'P001' as never, expectedRevision: 0 }),
      state.runId,
    ),
  ).toEqual({ ok: false, reason: 'notWonInThisGame' });
  const closed = saved(await nonowner.evaluate((t) => window.repository.closeResult(t), abandoned.token));
  expect(closed.ownerId).toBe(abandoned.ownerId);
  saved(
    await nonowner.evaluate(([s, state, t]) => window.repository.start(s, state, t), [
      scope,
      await fresh(page, 'next'),
      closed.token,
    ] as const),
  );
});

test('aborting after the receipt put rolls back the whole settlement; retry and replay preserve the result and the shelf revision', async ({
  page,
  context,
}) => {
  await open(page, 'owner');
  const initial = await fresh(page, 'settle');
  let record = saved(
    await page.evaluate(([s, state]) => window.repository.start(s, state, null), [scope, initial] as const),
  );
  // Exercise ten protocol rounds. The settlement payload here is a repository fixture;
  // persisted-gameplay exercises the real physical shot and the normal page entry.
  for (let n = 1; n <= 10; n++) {
    let state = record.state;
    for (const type of ['CONFIRM_POSITION', 'STOP_LOAD', 'FIRE'] as const) {
      state = await page.evaluate(([s, t]) => window.checkpointTest.reduce(s, { type: t }), [state, type] as const);
      record = saved(
        await page.evaluate((input) => window.repository.saveCommand(input), {
          expected: record.token,
          operationId: [state.runId, n, type === 'FIRE' ? 'fire' : type].join('/'),
          state,
          gameTick: n,
        }),
      );
    }
    const shotId = mintId.shot(n);
    const last = n === 10;
    const sets = last ? [asSetId('S001')] : [];
    const collected = last
      ? [1, 2, 3, 4, 5].map((i) => ({ instanceId: mintId.instance(100 + i), typeId: asPrizeTypeId('P00' + i), shotId }))
      : [];
    const ledger = buildLedgerEntry(shotId, state.score, last ? [{ kind: 'set', refId: 'S001', points: 100 }] : []);
    const summary: ShotSummary = {
      runId: state.runId,
      shotId,
      shotNumber: n,
      collected,
      chainCount: collected.length,
      newlyCompletedSets: sets,
      bonusAmmoRequested: 0,
      bonusAmmoGranted: 0,
      devicesActivated: [],
      transforms: [],
      ledger,
      endedByLimit: false,
      prizeOutcomes: [],
      touchedFirstHitTargets: [],
      ammoAfter: state.ammo,
      runEnded: last,
    };
    const settled: RunState = {
      ...state,
      phase: last ? 'ended' : 'position',
      inFlight: null,
      load: null,
      score: ledger.scoreAfter,
      expansion: { ...state.expansion!, active: null },
      shelf: { ...state.shelf, nextInstanceNumber: 110 },
      collected,
      completedSets: sets,
      collectedTypeIds: collected.map((c) => c.typeId),
      ledger: [...state.ledger, ledger],
    };
    const input = { expected: record.token, state: settled, summary, gameTick: n };
    if (last) {
      await page.evaluate(() => {
        const original = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function (...args) {
          const request = original.apply(this, args);
          if (this.name === 'receipts') {
            IDBObjectStore.prototype.put = original;
            request.onsuccess = () => this.transaction.abort();
          }
          return request;
        };
      });
      expect(await page.evaluate((i) => window.repository.commitShot(i), input)).toMatchObject({ ok: false });
      expect(await page.evaluate((s) => window.repository.read(s), scope)).toEqual(record);
      expect(await page.evaluate((s) => window.repository.readProfile(s), scope)).toMatchObject({
        bestScore: null,
        discoveredSets: [],
      });
    }
    const committed = await page.evaluate((i) => window.repository.commitShot(i), input);
    record = saved(committed);
    if (last) {
      expect(committed).toMatchObject({ freshSets: ['S001'], record: { newBest: true, result: { score: 100 } } });
      // Reload loses the reply. Replaying the exact operation only reads its receipt.
      await open(page, 'reloaded');
      expect(await page.evaluate((i) => window.repository.commitShot(i), input)).toEqual({
        ok: true,
        freshSets: [],
        replayed: true,
        record,
      });
      expect(await page.evaluate((s) => window.repository.readProfile(s), scope)).toMatchObject({
        bestScore: 100,
        discoveredSets: ['S001'],
      });
    }
  }

  for (let i = 1; i <= 3; i++) {
    expect(
      await page.evaluate((input) => window.repository.place(input), {
        runId: initial.runId,
        typeId: asPrizeTypeId('P00' + i),
        expectedRevision: i - 1,
      }),
    ).toMatchObject({ ok: true, changed: true });
  }
  const other = await context.newPage();
  await open(other, 'other');
  const replace = (p: Page, i: number) =>
    p.evaluate((input) => window.repository.place(input), {
      runId: initial.runId,
      slot: 0,
      typeId: asPrizeTypeId('P00' + i),
      expectedRevision: 3,
    });
  const race = await Promise.all([replace(page, 4), replace(other, 5)]);
  expect(race.filter((r) => r.ok)).toHaveLength(1);
  const current = await other.evaluate(() => window.repository.readShelf());
  expect(current.slotRevision).toBe(4);
  expect(race.find((r) => !r.ok)).toEqual({ ok: false, reason: 'conflict', current });
});

test('rollback and incremental legacy import preserve raw keys and daily discovery boundaries', async ({ page }) => {
  await open(page, 'reader');
  const result = await page.evaluate(async (scope) => {
    const book = new Set(window.checkpointTest.bundle.catalog.sets.keys());
    localStorage.setItem('shatekki.profile.v1', 'damaged');
    localStorage.setItem(
      'shatekki.profile.v2',
      JSON.stringify({
        schemaVersion: 2,
        bestScores: { old: 800 },
        legacyBestScore: 500,
        discoveredSets: ['S001', 'PAIR002', null],
      }),
    );
    localStorage.setItem(
      'shatekki.profile.v1.daily',
      JSON.stringify({ schemaVersion: 1, bestScore: 124, discoveredSets: ['S005'] }),
    );
    localStorage.setItem(
      'shatekki.souvenirs.v1',
      JSON.stringify({ slots: [null, { typeId: 'P003', runId: 'earlier' }, null] }),
    );
    localStorage.setItem('shatekki.ranking-pending.v1', 'do not change');
    const before = JSON.stringify(localStorage);
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'meta') {
        IDBObjectStore.prototype.put = put;
        request.onsuccess = () => this.transaction.abort();
      }
      return request;
    };
    const repo = window.repository;
    const failed = await repo.importLegacy(scope, localStorage, book).then(
      () => false,
      () => true,
    );
    const rolledBack = await repo.readProfile(scope);
    const emptyShelf = await repo.readShelf();
    const first = await repo.importLegacy(scope, localStorage, book);
    const imported = await repo.readProfile(scope);
    const rawUnchanged = before === JSON.stringify(localStorage);
    const updated = JSON.parse(localStorage.getItem('shatekki.profile.v2')!);
    updated.discoveredSets = ['S002'];
    localStorage.setItem('shatekki.profile.v2', JSON.stringify(updated));
    const updatedRaw = JSON.stringify(localStorage);
    await repo.importLegacy(scope, localStorage, book);
    const daily = { ...scope, mode: 'daily' as const, startedDateJst: '2026-11-19' };
    await repo.importLegacy(daily, localStorage, book);
    return {
      failed,
      rolledBack,
      emptyShelf,
      first,
      imported,
      rawUnchanged,
      updatedUnchanged: updatedRaw === JSON.stringify(localStorage),
      incremental: await repo.readProfile(scope),
      daily: await repo.readProfile(daily),
      shelf: await repo.readShelf(),
    };
  }, scope);
  expect(result).toMatchObject({
    failed: true,
    rolledBack: { discoveredSets: [], bestScore: null },
    emptyShelf: { slotRevision: 0, slots: [null, null, null] },
    first: { unreadable: ['shatekki.profile.v1', 'shatekki.profile.v2'] },
    imported: { discoveredSets: ['S001', 'PAIR002'], bestScore: null, legacyBestScore: 800 },
    rawUnchanged: true,
    updatedUnchanged: true,
    incremental: { discoveredSets: ['S001', 'PAIR002', 'S002'], bestScore: null },
    daily: { discoveredSets: ['S005'], legacyBestScore: 124, bestScore: null },
    shelf: { slotRevision: 1, slots: [null, { typeId: 'P003', runId: 'earlier' }, null] },
  });
});
