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
  const starts = await Promise.all([page, other].map(tab =>
    tab.evaluate(([s, state]) => window.repository.start(s, state, null), [scope, initial] as const),
  ));
  expect(starts.filter(reply => !reply.ok)).toEqual([{ ok: false, reason: 'conflict' }]);
  let record = saved(starts.find(reply => reply.ok)!);
  const writer = record.ownerId === 'a' ? page : other;
  const reader = writer === page ? other : page;
  let state: RunState = initial;
  for (const type of ['CONFIRM_POSITION', 'STOP_LOAD', 'FIRE'] as const) {
    state = await writer.evaluate(([s, t]) => window.checkpointTest.reduce(s, { type: t }), [state, type] as const);
    const input = { expected: record.token, operationId: type === 'FIRE' ? 'two-tabs/1/fire' : type, state, gameTick: 0 };
    const ownerWrite = writer.evaluate(command => window.repository.saveCommand(command), input);
    if (type === 'FIRE') {
      // Both tabs have the current token. A different command under the same operation ID must never be a replay.
      const competing = reader.evaluate(command => window.repository.saveCommand(command), { ...input, gameTick: 1 });
      const [applied, denied] = await Promise.all([ownerWrite, competing]);
      expect(applied).toMatchObject({ ok: true, replayed: false });
      expect(denied).toMatchObject({ ok: false, reason: expect.stringMatching(/^(conflict|invalid)$/) });
      record = saved(applied);
    } else record = saved(await ownerWrite);
  }
  const read = await reader.evaluate((s) => window.repository.read(s), scope);
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
  const other = await context.newPage();
  await Promise.all([open(page, 'owner'), open(other, 'other')]);
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
    const ownerWrite = page.evaluate(i => window.repository.commitShot(i), input);
    if (last) {
      const competitor = other.evaluate(i => window.repository.commitShot(i), { ...input, gameTick: n + 1 });
      const [, denied] = await Promise.all([ownerWrite, competitor]);
      expect(denied).toMatchObject({ ok: false, reason: expect.stringMatching(/^(conflict|invalid)$/) });
    }
    const committed = await ownerWrite;
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
      JSON.stringify({ slots: [
        { typeId: 'P001', runId: 'earlier' }, { typeId: 'P001', runId: 'duplicate' }, { typeId: 'P999', runId: 'missing' },
      ] }),
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
    first: { unreadable: ['shatekki.profile.v1', 'shatekki.profile.v2', 'shatekki.souvenirs.v1'] },
    imported: { discoveredSets: ['S001', 'PAIR002'], bestScore: null, legacyBestScore: 800 },
    rawUnchanged: true,
    updatedUnchanged: true,
    incremental: { discoveredSets: ['S001', 'PAIR002', 'S002'], bestScore: null },
    daily: { discoveredSets: ['S005'], legacyBestScore: 124, bestScore: null },
    shelf: { slotRevision: 1, slots: [{ typeId: 'P001', runId: 'earlier' }, null, null] },
  });
});

test('a shelf imported by an older build is cleaned once, keeping newer valid slots and invalidating its former revision', async ({ page }) => {
  await open(page, 'reader');
  const result = await page.evaluate(async scope => {
    const original = JSON.stringify({ slots: [null, { typeId: 'P006', runId: 'old' }, null] });
    localStorage.setItem('shatekki.souvenirs.v1', original);
    const newer = { typeId: 'P004', runId: 'won-later' };
    const storedSlots = [newer, { typeId: 'P004', runId: 'duplicate' }, { typeId: 'P999', runId: 'missing' }];
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const opening = indexedDB.open('shatekki.checkpoints');
      opening.onsuccess = () => resolve(opening.result);
      opening.onerror = () => reject(opening.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(['meta', 'souvenirs'], 'readwrite');
        tx.objectStore('meta').put(true, 'shelfImported');
        tx.objectStore('meta').put(8, 'slotRevision');
        tx.objectStore('souvenirs').put(storedSlots, 'shared');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
      const preview = await window.repository.readShelf();
      const onDiskAfterReading = await new Promise<unknown>((resolve, reject) => {
        const read = db.transaction('souvenirs').objectStore('souvenirs').get('shared');
        read.onsuccess = () => resolve(read.result);
        read.onerror = () => reject(read.error);
      });
      const book = new Set(window.checkpointTest.bundle.catalog.sets.keys());
      const warning = await window.repository.importLegacy(scope, localStorage, book);
      const repaired = await window.repository.readShelf();
      await window.repository.importLegacy(scope, localStorage, book);
      return { preview, readOnly: JSON.stringify(onDiskAfterReading) === JSON.stringify(storedSlots),
        warning, repaired, repeated: await window.repository.readShelf(), raw: localStorage.getItem('shatekki.souvenirs.v1') === original };
    } finally { db.close(); }
  }, scope);
  const clean = [{ typeId: 'P004', runId: 'won-later' }, null, null];
  expect(result).toEqual({ preview: { slotRevision: 8, slots: clean }, readOnly: true,
    warning: { unreadable: ['shatekki.souvenirs.v1'] }, repaired: { slotRevision: 9, slots: clean },
    repeated: { slotRevision: 9, slots: clean }, raw: true });
});
