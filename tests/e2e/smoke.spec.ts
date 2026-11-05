import { expect, test } from '@playwright/test';

// Chromium with an iPhone-class viewport. This is NOT a Safari/WebKit or
// real-device result (see playwright.config.ts).

test('home screen renders in portrait without a rotate overlay', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('home-start')).toBeVisible();
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

test('rotating to landscape shows the portrait guide (decision 25)', async ({ page }) => {
  await page.goto('/');
  const vp = page.viewportSize()!;
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await expect(page.getByTestId('rotate-overlay')).toBeVisible();
  await expect(page.locator('#app')).toHaveAttribute('data-pause', /landscape/);
  await page.setViewportSize(vp);
  await expect(page.getByTestId('rotate-overlay')).toBeHidden();
});

test('a hidden page is reported as a pause reason', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#app')).toHaveAttribute('data-pause', /hidden/);
});
