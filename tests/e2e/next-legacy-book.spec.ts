import { expect, test, type Page } from '@playwright/test';
import { restoreBeforeShot } from '../helpers/outcome-checkpoint';
import { readRecordedRun } from '../helpers/read-recorded-run';

test.use({baseURL: 'http://127.0.0.1:4178'});

// Delay only the next profile read's acknowledgement. The database remains free for navigation.
async function holdBookRead(page: Page) {
  return page.evaluateHandle(() => {
    let signalReady!: () => void;
    const ready = new Promise<void>(resolve => { signalReady = resolve; });
    let reply!: (success: boolean) => void;
    const begin = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      const tx = begin.call(this, stores, mode, options);
      if (mode === 'readonly' && tx.objectStoreNames.length === 1 && tx.objectStoreNames.contains('profiles')) {
        IDBDatabase.prototype.transaction = begin;
        tx.addEventListener('complete', event => {
          event.stopImmediatePropagation();
          reply = success => {
            if (success) tx.oncomplete?.call(tx, event);
            else tx.onabort?.call(tx, new Event('abort'));
          };
          signalReady();
        }, { once: true });
      }
      return tx;
    };
    return { ready, release: async (success: boolean) => {
      reply(success);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    } };
  });
}

for (const origin of ['home', 'result'] as const) {
  test(`a delayed ${origin} book reply cannot open a book or a retry prompt after navigation`, async ({ page }) => {
    await page.goto('/?e2e=1');
    await expect(page.getByTestId('home-start')).toBeVisible();
    if (origin === 'result') {
      await page.getByTestId('home-start').click();
      await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
      await page.reload();
      await page.getByTestId('btn-new-run').click();
      await expect(page.getByTestId('result-score')).toBeVisible();
    }
    const held = await holdBookRead(page);
    await page.getByTestId(origin + '-setbook').click();
    await held.evaluate(gate => gate.ready);
    if (origin === 'home') {
      await page.getByTestId('home-start').click();
      await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
    } else {
      await page.getByTestId('result-home').click();
      await expect(page.getByTestId('home-start')).toBeVisible();
    }
    await held.evaluate((gate, success) => gate.release(success), origin === 'home');
    await expect(page.locator('.scr-book')).toHaveCount(0);
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    if (origin === 'result') {
      // A failed read from the current home still offers an effective retry.
      const current = await holdBookRead(page);
      await page.getByTestId('home-setbook').click();
      await current.evaluate(gate => gate.ready);
      await current.evaluate(gate => gate.release(false));
      await page.getByTestId('save.retry').click();
      await expect(page.locator('.scr-book')).toBeVisible();
      await expect(page.getByTestId('save-dialog')).toBeHidden();
    }
  });
}

test('a full souvenir shelf shows the winning tab’s three prizes before the other player chooses again', async ({ page, context }) => {
  test.setTimeout(90_000);
  await restoreBeforeShot(page, 'capped');
  await page.getByTestId('btn-fire').tap();
  await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 40_000 });
  const result = await readRecordedRun(page);
  const shelf = (tab: Page) => tab.getByTestId('souvenir-shelf');
  const choice = (tab: Page, id: string) => shelf(tab).locator(`button[data-type-id="${id}"]`);
  const kinds = ['P068', 'P078', 'P076', 'P079', 'P077'] as const;
  const labels = await Promise.all(kinds.map(id => choice(page, id).innerText()));
  for (const id of kinds.slice(0, 3)) {
    await choice(page, id).click();
    await expect(choice(page, id)).toHaveCount(0);
  }
  const other = await context.newPage();
  await other.goto('/?e2e=1');
  const shown = (tab: Page) => shelf(tab).locator('span.chip');
  await expect(shown(other)).toHaveText(labels.slice(0, 3));
  const slot = (tab: Page, index: number) => shelf(tab).locator(`button[data-slot="${index}"]`);
  await choice(page, kinds[3]).click();
  await choice(other, kinds[4]).click();
  await slot(page, 0).click();
  await expect(shown(page)).toHaveText([labels[3]!, labels[1]!, labels[2]!]);
  await slot(other, 1).click();
  await expect(shelf(other)).toContainText('もう一度選んでください');
  await expect(shown(other)).toHaveText([labels[3]!, labels[1]!, labels[2]!]);
  await choice(other, kinds[4]).click();
  await slot(other, 1).click();
  await expect(shown(other)).toHaveText([labels[3]!, labels[4]!, labels[2]!]);
  expect(await readRecordedRun(other)).toEqual(result);
});

test('r006 restores a deferred prize and a next-shot modifier together after a real shot', async ({ page }) => {
  test.setTimeout(120_000);
  // Shot 17 of seed 15838 from the existing balance comparison. The browser computes the outcome here.
  await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
  const beforeFire = await restoreBeforeShot(page, 'deferred');
  const pending = [{ instanceId: 'i0006', requestId: 's09-hit0', candidateTypeIds: ['P066', 'P044', 'P065', 'P006'] }];
  expect(beforeFire.expansion?.deferredTransforms).toEqual(pending);
  expect(beforeFire.expansion?.next.modifiers.swayMult).toBe(1);

  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown', { pointerId: 4 });
  await fire.dispatchEvent('pointerup', { pointerId: 4 });
  const card = page.getByTestId('effect-results');
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return card.isVisible();
  }, { timeout: 30_000, intervals: [0] }).toBe(true);
  await expect(card.locator('.fxres-deferred')).toBeInViewport();
  await expect(card.locator('.fxres-deferred')).toHaveText('1個の景品は形が合わないため、あとで変わります');
  const settled = await readRecordedRun(page);
  expect(settled.state).toMatchObject({ phase: 'position', shotsFired: 17 });
  expect(settled.state.expansion?.deferredTransforms).toEqual(pending);
  expect(settled.lastSummary?.deferredTransforms).toEqual(pending);
  expect(settled.lastSummary?.effects).toContainEqual(expect.objectContaining({ effectId: 'FX035', outcome: 'applied' }));
  expect(settled.state.expansion?.next.modifiers.swayMult).toBe(1.25);

  await page.reload();
  await expect(page.getByTestId('btn-resume-run')).toBeVisible();
  expect(await readRecordedRun(page)).toEqual(settled);
  await page.getByTestId('btn-resume-run').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'paused');
  const resumed = await readRecordedRun(page);
  expect(resumed.ownerId).not.toBe(settled.ownerId);
  expect(resumed.token).toEqual({ ...settled.token, revision: settled.token.revision + 1, ownerEpoch: settled.token.ownerEpoch + 1 });
  expect(resumed.state).toEqual({ ...settled.state, pauseReasons: ['manual'] });
  expect(resumed.lastSummary).toEqual(settled.lastSummary);
  expect(resumed.gameTick).toBe(settled.gameTick);
  await expect(card.locator('.fxres-deferred')).toBeVisible();
  await expect(card.locator('.fxres-deferred')).toHaveText('1個の景品は形が合わないため、あとで変わります');
});

test('r006 restores all confirmed shot fields, starts fresh and keeps both legacy and newly earned book entries', async ({page, context}) => {
  test.setTimeout(150_000);
  const external: string[] = [];
  page.on('request', req => { if (new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url()); });
  const triples = Array.from({length:100}, (_,i) => 'S' + String(i+1).padStart(3,'0'));
  const home = await context.newPage();
  await home.goto('/?e2e=1');
  await expect(home.getByTestId('home-start')).toBeVisible();
  await page.clock.install({time:new Date('2026-11-18T12:00:00Z')});
  await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
  await restoreBeforeShot(page,'rescued');
  const old = {
    'shatekki.profile.v1': JSON.stringify({schemaVersion:1,bestScore:9600,discoveredSets:triples}),
    'shatekki.profile.v2': JSON.stringify({schemaVersion:2,bestScores:{'rules-v2-proposed-r003':5210},legacyBestScore:9600,discoveredSets:['PAIR001']}),
    'shatekki.run.v1': 'old run contents',
    'shatekki.run.rules-v2-proposed-r003':'old internal run contents',
    'shatekki.settings.v1':JSON.stringify({schemaVersion:1,language:'ja',audio:{enabled:false,volume:0}}),
    'shatekki.player-name.v1':'以前の名前',
    'shatekki.ranking-pending.v1':'untouched queued entry',
    'shatekki.ranking-done.v1':'untouched submission ID',
  };
  await page.evaluate(entries => { for (const [key,value] of Object.entries(entries)) localStorage.setItem(key,value); },old);
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown',{pointerId:4});
  await fire.dispatchEvent('pointerup',{pointerId:4});
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return page.getByTestId('reward-card').locator('.rwd-set').count();
  },{timeout:30_000,intervals:[0]}).toBe(3);
  const first = await readRecordedRun(page);
  expect(first.lastFreshSets).toEqual(expect.arrayContaining(['PAIR201','PAIR203','S061']));
  expect(first.state.ammo).toBe(2);
  const transactions = await home.evaluateHandle(() => {
    const modes: IDBTransactionMode[] = [];
    const begin = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (stores, mode, options) {
      modes.push(mode ?? 'readonly');
      return begin.call(this, stores, mode, options);
    };
    return modes;
  });
  await home.getByTestId('home-setbook').click();
  for (const id of first.lastFreshSets) await expect(home.locator(`[data-set-id="${id}"]`)).toHaveClass(/found/);
  await home.locator('.scr-book button.primary').click();
  expect(await transactions.jsonValue()).toEqual(['readonly']);
  expect(await readRecordedRun(home)).toEqual(first);
  await home.close();
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode','paused',{timeout:30000});
  const resumed = await readRecordedRun(page);
  expect({...resumed.state,pauseReasons:first.state.pauseReasons}).toEqual(first.state);
  expect(resumed.lastSummary).toEqual(first.lastSummary);
  expect(resumed.gameTick).toBe(first.gameTick);
  await page.reload();
  await page.getByTestId('btn-new-run').click();
  await expect(page.getByTestId('result-score')).toBeVisible();
  await page.getByTestId('result-retry').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode','position',{timeout:30000});
  const next = await readRecordedRun(page);
  expect(next.token.runId).not.toBe(first.token.runId);
  expect(next.state).toMatchObject({shotsFired:0,score:0,ammo:10,completedSets:[],firstHitsScored:[],collected:[]});
  expect(next.selfBestBefore).toBeNull();
  const book = await page.evaluate(() => new Promise<{discoveredSets:string[];legacyBestScore:number}>((resolve,reject) => {
    const opening=indexedDB.open('shatekki.checkpoints');
    opening.onerror=()=>reject(opening.error);
    opening.onsuccess=()=>{
      const db=opening.result;
      const tx=db.transaction('profiles');
      const read=tx.objectStore('profiles').get(JSON.stringify(['book','normal','rules-v2-proposed-r006']));
      tx.oncomplete=()=>{db.close();resolve(read.result);};
      tx.onabort=()=>{db.close();reject(tx.error);};
    };
  }));
  expect(book.legacyBestScore).toBe(9600);
  expect(book.discoveredSets).toEqual(expect.arrayContaining([...triples,'PAIR001','PAIR201','PAIR203']));
  expect(new Set(book.discoveredSets).size).toBe(book.discoveredSets.length);
  expect(await page.evaluate(() => ({...localStorage}))).toEqual(old);
  expect(external).toEqual([]);
});
