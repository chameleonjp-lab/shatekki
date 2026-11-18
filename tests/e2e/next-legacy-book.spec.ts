import { expect, test } from '@playwright/test';
import { restoreBeforeShot } from '../helpers/outcome-checkpoint';
import { readRecordedRun } from '../helpers/read-recorded-run';

test.use({baseURL: 'http://127.0.0.1:4178'});

test('r006 restores all confirmed shot fields, starts fresh and keeps both legacy and newly earned book entries', async ({page}) => {
  test.setTimeout(150_000);
  const external: string[] = [];
  page.on('request', req => { if (new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url()); });
  const triples = Array.from({length:100}, (_,i) => 'S' + String(i+1).padStart(3,'0'));
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
