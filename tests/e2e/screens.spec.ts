import { expect, test, type Page } from '@playwright/test';

// Chromium with iPhone-class portrait viewports (not Safari, not a real device).
// Home / result / set book / language, wired by src/app.ts.

type ProbeName = 'screen' | 'phase' | 'ammo' | 'score' | 'playerName';
const probe = (page: Page, name: ProbeName) =>
  page.evaluate((n) => (window as unknown as { __shatekki: Record<string, () => unknown> }).__shatekki[n]!(), name);

async function fresh(page: Page) {
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await expect(page.getByTestId('home-start')).toBeVisible();
}

async function shoot(page: Page) {
  const mode = page.getByTestId('controls');
  await expect(mode).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode).toHaveAttribute('data-mode', 'aiming');
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
}

test('the name is fixed at start; empty means anonymous (AC28)', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('home-name').fill('たろう');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  expect(await probe(page, 'playerName')).toBe('たろう');

  await fresh(page);
  await page.getByTestId('home-name').fill('   ');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  expect(await probe(page, 'playerName')).toBeNull();
});

test('ranking is "準備中" while the official page is unknown, and X share opens a post screen only (AC29, AC34 partial)', async ({ page }) => {
  await fresh(page);
  await expect(page.getByTestId('home-ranking')).toBeDisabled();
  const opened: string[] = [];
  await page.exposeFunction('__recordOpen', (u: string) => opened.push(u));
  await page.evaluate(() => {
    window.open = ((u?: string | URL) => {
      (window as unknown as { __recordOpen(u: string): void }).__recordOpen(String(u));
      return null;
    }) as typeof window.open;
  });
  await page.getByTestId('home-share').click();
  await expect.poll(() => opened.length).toBeGreaterThan(0);
  const url = new URL(opened[0]!);
  expect(url.hostname).toBe('x.com');
  expect(url.pathname).toBe('/intent/post');
  // No official URL exists yet, so the text must not contain a guessed URL.
  expect(url.searchParams.get('text') ?? '').not.toMatch(/https?:\/\//);
  const bg = await page.getByTestId('home-share').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(bg).toBe('rgb(0, 0, 0)');
});

test('the set book opens from home with 100 sets, names hidden until discovered (AC23 partial)', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('home-setbook').click();
  const items = page.locator('.book-item');
  await expect(items).toHaveCount(100);
  await expect(page.locator('.book-item.found')).toHaveCount(0);
  await expect(items.first()).toContainText('？？？');
});

test('switching to English changes text only; the run is unaffected (AC35 partial)', async ({ page }) => {
  await fresh(page);
  await page.getByTestId('home-settings').click();
  await page.locator('select.select').selectOption('en');
  await expect(page.getByTestId('home-start')).toHaveText(/start|play/i);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  await expect(page.getByTestId('btn-confirm-position')).not.toHaveText('ここで構える');
  expect(await probe(page, 'ammo')).toBe(10);
  await page.reload();
  // The saved language applies to the resume prompt as well as the home.
  await expect(page.getByTestId('btn-resume-run')).toHaveText('Continue');
  await expect(page.getByTestId('resume-prompt').locator('h1')).toHaveText('You have an unfinished game');
  await page.getByTestId('btn-new-run').click();
  await expect(page.getByTestId('home-start')).toHaveText(/start|play/i);
});

test('a whole run of 10 shots ends on the result screen with the confirmed score (AC30 partial)', async ({ page }) => {
  test.setTimeout(180_000);
  await fresh(page);
  await page.getByTestId('home-start').click();
  for (let i = 0; i < 10; i++) await shoot(page);
  await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 30_000 });
  expect(await probe(page, 'phase')).toBe('ended');
  const score = await probe(page, 'score');
  await expect(page.getByTestId('result-score')).toHaveText(new RegExp(String(score)));
  // The score and "retry" are in the first portrait screenful.
  const vp = page.viewportSize()!;
  for (const id of ['result-score', 'result-retry']) {
    const box = await page.getByTestId(id).boundingBox();
    expect(box, id).not.toBeNull();
    expect(box!.y + box!.height, id).toBeLessThanOrEqual(vp.height);
  }
  await expect(page.getByTestId('result-ranking')).toBeDisabled();
  await page.getByTestId('result-retry').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  expect(await probe(page, 'ammo')).toBe(10);
});
