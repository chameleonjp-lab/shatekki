import { expect, test } from '@playwright/test';
import { shootShopkeeper } from '../helpers/shoot-shopkeeper';
import type { PersistedRecord } from '../../src/contracts/persistence';

test.use({ baseURL: 'http://127.0.0.1:4178' });

test('the previous JST stall resumes after midnight, pauses a question on rotation and records one answer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.clock.setFixedTime(new Date('2026-11-18T23:59:00+09:00'));
  await page.goto('/?e2e=1');
  const root = page.locator('#app');
  await expect(root).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r006');
  await page.getByTestId('home-daily-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  const records = () => page.evaluate(async (): Promise<PersistedRecord[]> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('shatekki.checkpoints');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<PersistedRecord[]>((resolve, reject) => {
        const req = db.transaction('runs').objectStore('runs').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  });
  const before = await records();
  expect(before).toHaveLength(1);
  expect(before[0]!.scope).toMatchObject({ mode: 'daily', startedDateJst: '2026-11-18' });
  await page.clock.setFixedTime(new Date('2026-11-19T00:01:00+09:00'));
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  await expect(root).toHaveAttribute('data-daily-date', '2026-11-18');
  await shootShopkeeper(page);
  const question = page.getByTestId('shopkeeper-question');
  const answer = page.getByTestId('shopq-choice-A');
  await expect(question).toBeVisible({ timeout: 25_000 });
  const text = await answer.textContent();
  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: portrait.height, height: portrait.width });
  await expect(question).toHaveAttribute('data-paused', '1');
  await answer.dispatchEvent('pointerdown', { pointerId: 1, isPrimary: true });
  await answer.dispatchEvent('pointerdown', { pointerId: 2, isPrimary: false });
  await answer.dispatchEvent('pointerup', { pointerId: 2, isPrimary: false });
  await answer.dispatchEvent('pointerup', { pointerId: 1, isPrimary: true });
  await page.setViewportSize(portrait);
  await expect(question).toHaveAttribute('data-paused', '1');
  await page.getByTestId('shopq-resume').click();
  await expect(answer).toHaveText(text!);
  await answer.click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
  const after = await records();
  expect(after).toHaveLength(1);
  expect(after[0]!.scope).toEqual(before[0]!.scope);
  expect(after[0]!.token.runId).toBe(before[0]!.token.runId);
  expect(after[0]!.state.expansion?.questionCursor).toBe(1);
  expect(after[0]!.state.ledger).toHaveLength(1);
  expect(after[0]!.gameTick).toBeGreaterThan(0);
});

test('normal and daily games can coexist; choosing yesterday’s stall does not claim the normal game', async ({page,context}) => {
  test.setTimeout(240_000);
  const normal = await context.newPage();
  const beforeMidnight = new Date('2026-11-18T23:59:00+09:00');
  for (const tab of [page, normal]) {
    await tab.clock.setFixedTime(beforeMidnight);
    await tab.goto('/?e2e=1');
    await expect(tab.getByTestId('home-start')).toBeVisible();
  }
  await normal.getByTestId('home-start').click();
  await expect(normal.getByTestId('controls')).toHaveAttribute('data-mode','position',{timeout:30000});
  await page.getByTestId('home-daily-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode','position',{timeout:30000});
  await page.clock.setFixedTime(new Date('2026-11-19T00:01:00+09:00'));
  await page.reload();
  await expect(page.getByTestId('choose-normal')).toBeVisible();
  const choice = page.getByTestId('choose-daily');
  await expect(choice).toContainText('2026-11-18');
  await choice.click();
  await expect(page.locator('#app')).toHaveAttribute('data-daily-date','2026-11-18');
  await page.getByTestId('btn-resume-run').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode','paused',{timeout:30000});
  await expect(page.locator('#app')).toHaveAttribute('data-daily-date','2026-11-18');
  // The original normal owner can still advance. Selecting the daily record touched only that scope.
  await normal.getByTestId('btn-confirm-position').click();
  await expect(normal.getByTestId('controls')).toHaveAttribute('data-mode','loading');
  // Retire yesterday's game explicitly. Replay now adopts today's Japan date, keeping the other run alive.
  await page.reload();
  await choice.click();
  await page.getByTestId('btn-new-run').click();
  await expect(page.getByTestId('result-score')).toBeVisible();
  await page.getByTestId('result-retry').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode','position',{timeout:30000});
  await expect(page.locator('#app')).toHaveAttribute('data-daily-date','2026-11-19');
});
