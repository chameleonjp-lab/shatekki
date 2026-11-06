import { expect, test, type Page } from '@playwright/test';

// Chromium with an iPhone-class viewport (not Safari, not a real device).
// AC38: reload between shots resumes the confirmed state.
// AC39 / decision 27: reload while a shot is resolving abandons that run.
// AC05: reload after loading keeps the same load result (no re-roll).

const mode = (page: Page) => page.getByTestId('controls');
const ammo = async (page: Page) => Number(((await page.getByTestId('hud-ammo').textContent()) ?? '').match(/\d+/)?.[0]);

async function newGame(page: Page) {
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await page.getByTestId('btn-start').click();
  await expect(mode(page)).toHaveAttribute('data-mode', 'position');
}

async function loadAndFire(page: Page) {
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode(page)).toHaveAttribute('data-mode', 'aiming');
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
  await expect(mode(page)).toHaveAttribute('data-mode', 'resolving');
}

test('reload between shots resumes the confirmed state, paused until resume (AC38)', async ({ page }) => {
  await newGame(page);
  await loadAndFire(page);
  await expect(mode(page)).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  const scoreBefore = await page.evaluate(() => (window as unknown as { __shatekki: { score(): number } }).__shatekki.score());
  expect(await ammo(page)).toBe(9);

  await page.reload();
  await expect(page.getByTestId('btn-start')).toHaveText('続きから');
  await page.getByTestId('btn-start').click();
  await expect(mode(page)).toHaveAttribute('data-mode', 'paused');
  expect(await ammo(page)).toBe(9);
  const scoreAfter = await page.evaluate(() => (window as unknown as { __shatekki: { score(): number } }).__shatekki.score());
  expect(scoreAfter).toBe(scoreBefore);
  await page.getByTestId('btn-resume').click();
  await expect(mode(page)).toHaveAttribute('data-mode', 'position');
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shatekki: { prizeCount(): number } }).__shatekki.prizeCount())).toBeLessThanOrEqual(9);
});

test('reload while the shot is resolving abandons that run and never resumes it (AC39, decision 27)', async ({ page }) => {
  await newGame(page);
  await loadAndFire(page);
  await page.reload();
  await expect(page.getByTestId('boot-status')).toContainText('中断');
  await expect(page.getByTestId('btn-start')).toHaveText('はじめる');
  await page.getByTestId('btn-start').click();
  await expect(mode(page)).toHaveAttribute('data-mode', 'position');
  expect(await ammo(page)).toBe(10);
});

test('reload after loading keeps the same load result (AC05: no re-roll)', async ({ page }) => {
  await newGame(page);
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode(page)).toHaveAttribute('data-mode', 'aiming');
  const label = await page.getByTestId('load-label').textContent();
  await page.reload();
  await page.getByTestId('btn-start').click();
  await page.getByTestId('btn-resume').click();
  await expect(mode(page)).toHaveAttribute('data-mode', 'aiming');
  await expect(page.getByTestId('load-label')).toHaveText(label ?? '');
  expect(await ammo(page)).toBe(10);
});

test('a second tab that continues the run makes the first tab stop accepting input (multi-tab, Task 10)', async ({ context }) => {
  const a = await context.newPage();
  await newGame(a);
  await a.getByTestId('btn-confirm-position').click();
  await a.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode(a)).toHaveAttribute('data-mode', 'aiming');

  const b = await context.newPage();
  await b.goto('/?e2e=1');
  await b.getByTestId('btn-start').click(); // 続きから
  await b.getByTestId('btn-resume').click();
  const fire = b.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
  await expect(mode(b)).toHaveAttribute('data-mode', 'resolving');

  // Tab A tries to fire the same loaded cork: refused, and told why.
  const fireA = a.getByTestId('btn-fire');
  await fireA.dispatchEvent('pointerdown');
  await fireA.dispatchEvent('pointerup');
  await expect(a.getByTestId('stale-overlay')).toBeVisible();
  expect(await ammo(a)).toBe(10);
});
