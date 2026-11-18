import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4176' });

test('unavailable IndexedDB: play from first shot to result, reopen the book and reload without changing any legacy key', async ({ page }) => {
  test.setTimeout(300_000);
  const legacy = {
    'shatekki.run.v1': 'old official run',
    'shatekki.run.rules-v2-proposed-r003': 'old internal run',
    'shatekki.profile.v1': '{"schemaVersion":1,"bestScore":145,"discoveredSets":["S001"]}',
    'shatekki.profile.v2': 'old profile with a parse error',
    'shatekki.settings.v1': 'old settings with a parse error',
    'shatekki.souvenirs.v1': '{"slots":[null,null,{"typeId":"P003","runId":"earlier"}]}',
    'shatekki.player-name.v1': 'old name',
    'shatekki.quarantine.v1': 'old quarantine',
    'shatekki.ranking-pending.v1': 'old submission',
    'shatekki.ranking-done.v1': 'old submission id',
  };
  // Set up an isolated test profile before the app's first visit. No fixtures run on reload.
  await page.route('**/storage-setup', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage setup</title>'}));
  await page.goto('/storage-setup');
  await page.evaluate(values => {
    for (const [key,value] of Object.entries(values)) localStorage.setItem(key,value);
  },legacy);

  const mutations: string[] = [];
  const ranking: string[] = [];
  page.on('console', msg => {
    if (msg.text().startsWith('storage-test:')) mutations.push(msg.text());
  });
  page.on('request', request => {
    if (new URL(request.url()).hostname.endsWith('supabase.co')) ranking.push(request.url());
  });
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => { throw new DOMException('test storage unavailable','SecurityError'); };
    for (const method of ['setItem','removeItem','clear'] as const) {
      const original = Storage.prototype[method] as (...args: string[]) => void;
      Storage.prototype[method] = function(...args: string[]) {
        if (this === localStorage) console.log('storage-test:' + method + '/' + (args[0] ?? 'all'));
        return original.apply(this,args);
      };
    }
  });

  await page.goto('/?e2e=1');
  await expect(page.locator('#app')).toHaveAttribute('data-rules-version','rules-v2-proposed-r004');
  await page.getByTestId('save.memory').click();
  const controls = page.getByTestId('controls');
  await expect(controls).toHaveAttribute('data-mode','position',{timeout:30_000});
  await expect(page.getByTestId('app-notice')).toContainText('この回は');
  await expect(page.getByTestId('hud-ammo')).toContainText('10');
  for (let shot = 0; shot < 20; shot++) {
    await page.getByTestId('btn-confirm-position').click();
    await expect(controls).toHaveAttribute('data-mode','loading');
    await page.getByTestId('btn-load').dispatchEvent('pointerdown');
    await expect(controls).toHaveAttribute('data-mode','aiming');
    const fire = page.getByTestId('btn-fire');
    await fire.dispatchEvent('pointerdown',{pointerId:1});
    await fire.dispatchEvent('pointerup',{pointerId:1});
    await expect(controls).toHaveAttribute('data-mode','resolving');
    await expect.poll(async () => {
      const answer = page.getByTestId('shopq-choice-A');
      if (await answer.isVisible()) await answer.click();
      return page.locator('#app').getAttribute('data-phase');
    },{timeout:30_000}).toMatch(/position|ended/);
    if (await page.locator('#app').getAttribute('data-phase') === 'ended') break;
  }
  await expect(page.getByTestId('result-score')).toBeVisible();
  await expect(page.getByTestId('result-ranking')).toBeHidden();
  await page.getByTestId('result-setbook').click();
  await page.locator('.scr-book button.primary').click();
  await expect(page.getByTestId('result-score')).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('save.memory')).toBeVisible();
  await expect(page.getByTestId('result-score')).toBeHidden();
  expect(await page.evaluate(() => ({...localStorage}))).toEqual(legacy);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  expect(mutations).toEqual([]);
  expect(ranking).toEqual([]);
});
