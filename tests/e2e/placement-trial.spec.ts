import { expect, test } from '@playwright/test';

test('r005 opens its own 36-slot game, settles a shot and resumes it', async ({ page }) => {
  await page.goto('http://127.0.0.1:4177/');
  await expect(page.locator('.notice.proto')).toContainText('rules-v2-proposed-r005');
  await page.getByTestId('home-start').click();
  await expect(page.locator('.bm-tile')).toHaveCount(36);
  await page.getByTestId('btn-confirm-position').click();
  const controls = page.getByTestId('controls');
  await expect(controls).toHaveAttribute('data-mode', 'loading');
  await page.getByTestId('btn-load').tap();
  await expect(controls).toHaveAttribute('data-mode', 'aiming');
  await page.getByTestId('btn-fire').tap();
  await expect.poll(async () => {
    const answer = page.getByTestId('shopq-choice-A');
    if (await answer.isVisible()) await answer.tap();
    return controls.getAttribute('data-mode');
  }, { timeout: 30_000 }).toBe('position');
  await page.reload();
  await page.getByTestId('btn-resume-run').tap();
  await page.getByTestId('btn-resume').tap();
  await expect(controls).toHaveAttribute('data-mode', 'position');
  await expect(page.locator('.bm-tile')).toHaveCount(36);
});
