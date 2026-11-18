import { expect, test, type Page } from '@playwright/test';

test.use({ baseURL:'http://127.0.0.1:4176' });
const mode = (p: Page) => p.getByTestId('controls');
const legacy = (p: Page) => p.evaluate(() => JSON.stringify({...localStorage}));

async function start(p: Page) {
  await p.goto('/?e2e=1');
  await expect(p.locator('#app')).toHaveAttribute('data-rules-version','rules-v2-proposed-r004');
  await p.getByTestId('home-start').click();
  await expect(mode(p)).toHaveAttribute('data-mode','position',{timeout:30_000});
}
async function load(p: Page) {
  await p.getByTestId('btn-confirm-position').click();
  await expect(mode(p)).toHaveAttribute('data-mode','loading');
  await p.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode(p)).toHaveAttribute('data-mode','aiming');
}
async function fire(p: Page) {
  await p.getByTestId('btn-fire').dispatchEvent('pointerdown',{pointerId:1});
  await p.getByTestId('btn-fire').dispatchEvent('pointerup',{pointerId:1});
}
async function settle(p: Page) {
  await expect.poll(async () => {
    if (await p.getByTestId('shopq-choice-A').isVisible()) await p.getByTestId('shopq-choice-A').click();
    return p.locator('#app').getAttribute('data-phase');
  },{timeout:35_000}).toMatch(/position|ended/);
}

async function failNextRunWrite(p: Page) {
  await p.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name !== 'runs') return put.apply(this,args);
      IDBObjectStore.prototype.put = put;
      this.transaction.abort();
      throw new DOMException('test write failure','AbortError');
    };
  });
}

test('a failed fire keeps ammo and phase; retry settles one shot and another tab must claim before playing', async ({page,context}) => {
  test.setTimeout(120_000);
  await start(page);
  await load(page);
  await failNextRunWrite(page);
  await fire(page);
  await expect(page.getByTestId('save.retry')).toBeVisible();
  await expect(mode(page)).toHaveAttribute('data-mode','aiming');
  await expect(page.getByTestId('hud-ammo')).toContainText('10');
  await page.getByTestId('save.retry').click();
  await settle(page);
  const other = await context.newPage();
  await other.goto('/?e2e=1');
  await expect(other.getByTestId('resume-prompt')).toBeVisible();
  await other.getByTestId('btn-resume-run').click();
  await expect(mode(other)).toHaveAttribute('data-mode','paused',{timeout:30_000});
  await page.getByTestId('btn-confirm-position').click();
  await expect(page.getByTestId('save.reload')).toBeVisible();
  await other.getByTestId('btn-resume').click();
  await expect(mode(other)).toHaveAttribute('data-mode','position');
});

test('a committed fire with a lost reply opens the interruption prompt; a second page closes the final record', async ({page,context}) => {
  test.setTimeout(120_000);
  await start(page);
  await load(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'runs') {
        IDBObjectStore.prototype.put = put;
        // The write really commits. Only its acknowledgement to the caller fails.
        this.transaction.oncomplete = this.transaction.onabort;
      }
      return put.apply(this,args);
    };
  });
  await fire(page);
  await expect(page.getByTestId('save.retry')).toBeVisible();
  const reader = await context.newPage();
  await reader.goto('/?e2e=1');
  await expect(reader.getByTestId('btn-resume-run')).toHaveText('中断を確定する');
  await page.getByTestId('save.retry').click();
  await expect(page.getByTestId('btn-resume-run')).toHaveText('中断を確定する');
  await page.getByTestId('btn-resume-run').click();
  await expect(page.getByTestId('result-score')).toBeVisible();
  await reader.reload();
  await expect(reader.getByTestId('result-score')).toBeVisible();
  await reader.getByTestId('result-retry').click();
  await expect(mode(reader)).toHaveAttribute('data-mode','position',{timeout:30_000});
  await page.getByTestId('result-home').click();
  await expect(page.getByTestId('save.reload')).toBeVisible();
});

test('memory-only play starts fresh on a write failure and reload restores the untouched recorded game', async ({page}) => {
  await page.addInitScript(() => {
    localStorage.setItem('shatekki.profile.v2','preserve this old record');
    localStorage.setItem('shatekki.settings.v1','preserve invalid old settings');
  });
  await start(page);
  const before = await legacy(page);
  expect(await page.evaluate(() => localStorage.getItem('shatekki.quarantine.v1'))).toBeNull();
  await load(page);
  await failNextRunWrite(page);
  await fire(page);
  await page.getByTestId('save.memory').click();
  await expect(mode(page)).toHaveAttribute('data-mode','position');
  await expect(page.getByTestId('app-notice')).toContainText('この回は');
  await load(page);
  await fire(page);
  await settle(page);
  expect(await legacy(page)).toBe(before);
  await page.reload();
  await expect(page.getByTestId('resume-prompt')).toBeVisible();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  await expect(mode(page)).toHaveAttribute('data-mode','aiming');
  await expect(page.getByTestId('hud-ammo')).toContainText('10');
});

test('final shot persists before the result delay; another tab reopens the result and closes it to replay', async ({page,context}) => {
  test.setTimeout(300_000);
  await start(page);
  const before = await legacy(page);
  for (let shot=0;shot<20;shot++) {
    await load(page);
    await fire(page);
    await settle(page);
    if (await page.locator('#app').getAttribute('data-phase')==='ended') break;
  }
  await expect(page.locator('#app')).toHaveAttribute('data-phase','ended');
  // Reload in the last shot's presentation window and compare against another cold read.
  await page.reload();
  await expect(page.getByTestId('result-score')).toBeVisible();
  const other = await context.newPage();
  await other.goto('/?e2e=1');
  await expect(other.getByTestId('result-score')).toBeVisible();
  const score = await other.getByTestId('result-score').innerText();
  await page.reload();
  await expect(page.getByTestId('result-score')).toHaveText(score);
  await other.getByTestId('result-setbook').click();
  await other.locator('.scr-book button.primary').click();
  await other.getByTestId('result-retry').click();
  await expect(mode(other)).toHaveAttribute('data-mode','position',{timeout:30_000});
  await expect(other.getByTestId('hud-ammo')).toContainText('10');
  expect(await legacy(other)).toBe(before);
  await page.getByTestId('result-home').click();
  await expect(page.getByTestId('save.reload')).toBeVisible();
});
