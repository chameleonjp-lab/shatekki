import { expect, test, type Page } from '@playwright/test';

// Chromium, short portrait screens (not Safari, not a real device).
// Long translations and a 20-character name must not hide or push out the
// main buttons, and nothing may scroll sideways.

const LONG_NAME = 'ジュゲムジュゲムゴコウノスリキレカイジャ'.slice(0, 20); // 20 code points

async function setLocale(page: Page, locale: string) {
  await page.goto('/?e2e=1');
  await page.evaluate((l) => {
    localStorage.clear();
    localStorage.setItem('shatekki.settings.v1', JSON.stringify({ schemaVersion: 1, audio: { enabled: false, volume: 0 }, language: l, savedAt: new Date().toISOString() }));
  }, locale);
  await page.goto('/?e2e=1');
}

async function inViewport(page: Page, testId: string) {
  const vp = page.viewportSize()!;
  const box = await page.getByTestId(testId).boundingBox();
  expect(box, testId).not.toBeNull();
  expect(box!.x, testId).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, testId).toBeLessThanOrEqual(vp.width + 0.5);
  expect(box!.y + box!.height, testId).toBeLessThanOrEqual(vp.height + 0.5);
}

for (const locale of ['de', 'ru', 'th', 'vi', 'ja'] as const) {
  test(`${locale}: home start button stays visible with a 20-character name, no sideways scroll`, async ({ page }) => {
    await setLocale(page, locale);
    if (locale !== 'ja') await expect(page.getByTestId('home-start')).not.toHaveText('はじめる');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await page.getByTestId('home-name').fill(LONG_NAME);
    await inViewport(page, 'home-start');
    await expect(page.getByTestId('home-start')).toBeEnabled();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(overflow).toBe(false);
  });

  test(`${locale}: in-game controls (confirm, load, fire) stay inside the screen`, async ({ page }) => {
    await setLocale(page, locale);
    await page.getByTestId('home-start').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
    await inViewport(page, 'btn-confirm-position');
    await inViewport(page, 'btn-pause');
    await page.getByTestId('btn-confirm-position').click();
    await inViewport(page, 'btn-load');
    await page.getByTestId('btn-load').dispatchEvent('pointerdown');
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
    await inViewport(page, 'btn-fire');
    await inViewport(page, 'aim-pad');
  });
}
