import { expect, test } from '@playwright/test';
import { readRecordedRun } from '../helpers/read-recorded-run';
import { shootShopkeeper } from '../helpers/shoot-shopkeeper';

test.use({ baseURL:'http://127.0.0.1:4178' });
for (const afterAnswer of [false, true]) {
  test(`r006 abandons after losing the ${afterAnswer ? 'answer acknowledgement' : 'pending question'}`, async ({ page, context }) => {
    test.setTimeout(120_000);
    const external: string[] = [];
    context.on('request', req => { if(new URL(req.url()).hostname !== '127.0.0.1') external.push(req.url()); });
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (array instanceof Uint32Array && array.length === 1) { array[0] = 117; return array; }
        return original(array);
      };
    });
    await page.goto('/?e2e=1');
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version','rules-v2-proposed-r006');
    await page.evaluate(() => {
      // A previous version's real schema. It must survive interruption and a stale tab's retry.
      localStorage.setItem('shatekki.profile.v1',JSON.stringify({schemaVersion:1, bestScore:23, discoveredSets:['S001']}));
      localStorage.setItem('shatekki.ranking-pending.v1','preserve queue');
    });
    const old=await page.evaluate(()=>({...localStorage}));
    await page.getByTestId('home-start').click();
    await shootShopkeeper(page);
    const answer=page.getByTestId('shopq-choice-B');
    await expect(answer).toBeVisible({timeout:35_000});
    const before=await readRecordedRun(page);
    expect(before.state.phase).toBe('resolving');
    expect(before.state.score).toBe(0);
    if(afterAnswer) {
      await page.evaluate(() => {
        const put=IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put=function(...args) {
          if(this.name==='runs'){
            IDBObjectStore.prototype.put=put;
            // Commit the answer but lose its reply. The game cannot play it again.
            this.transaction.oncomplete=this.transaction.onabort;
          }
          return put.apply(this,args);
        };
      });
      await answer.click();
      await expect(page.getByTestId('save.retry')).toBeVisible();
    }
    const player=await context.newPage();
    await player.goto('/?e2e=1');
    const confirm=player.getByTestId('btn-resume-run');
    await expect(confirm).toHaveText('中断を確定する');
    const inFlight=await readRecordedRun(player);
    expect(inFlight.token.revision).toBe(before.token.revision + Number(afterAnswer));
    expect(inFlight.state.inFlight?.stage).toBe(afterAnswer ? 'postEffects' : 'flight');
    await confirm.click();
    await expect(player.getByTestId('result-score')).toBeVisible();
    const ended=await readRecordedRun(player);
    expect(ended.result).toMatchObject({status:'abandoned', score:0, shotsFired:1});
    expect(ended.state).toMatchObject({inFlight:null, ammo:9, ledger:[]});
    expect(ended.lastSummary).toBeNull();
    if(afterAnswer) {
      await page.getByTestId('save.retry').click();
      await expect(page.getByTestId('result-score')).toBeVisible();
    } else {
      // The old owner cannot answer a question from the now abandoned shot.
      await answer.click();
      await expect(page.getByTestId('save.reload')).toBeVisible();
    }
    await player.reload();
    await expect(player.getByTestId('result-score')).toBeVisible();
    expect(await readRecordedRun(player)).toEqual(ended);
    expect(await player.evaluate(()=>({...localStorage}))).toEqual(old);
    expect(external).toEqual([]);
  });
}
