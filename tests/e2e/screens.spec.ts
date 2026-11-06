import { expect, test, type Page } from '@playwright/test';
import { RANKING_CONFIG } from '../../src/ranking/config';

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

test('private release hides public-name and ranking controls and preserves an old saved name without using it', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => localStorage.setItem('shatekki.player-name.v1', 'たろう'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'シャテッキ', exact: true })).toBeVisible();
  await expect(page.locator('.notice.proto')).toBeHidden();
  await expect(page.getByTestId('home-name')).toBeHidden();
  await expect(page.getByTestId('home-ranking')).toBeHidden();
  await expect(page.getByText('名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。')).toBeHidden();
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  expect(await probe(page, 'playerName')).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('shatekki.player-name.v1'))).toBe('たろう');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.run.v1')!));
  expect(saved.checkpoint.state.rulesVersion).toBe('rules-v1');
  expect(saved.checkpoint.state.valueStatus).toBe('approved');
});

test('private release hides ranking, and X share opens a post screen only (AC29, AC34 partial)', async ({ page }) => {
  await fresh(page);
  await expect(page.getByTestId('home-ranking')).toBeHidden();
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
  const text = url.searchParams.get('text') ?? '';
  expect(text).toContain('シャテッキ');
  if (RANKING_CONFIG.canonicalUrl) expect(text).toContain(RANKING_CONFIG.canonicalUrl);
  else expect(text).not.toMatch(/https?:\/\//);
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
  await expect(page.getByTestId('result-ranking')).toBeHidden();
  await expect(page.getByTestId('result-submit')).toBeHidden();
  await expect(page.getByTestId('result-top')).toBeHidden();
  await expect(page.getByRole('heading', { name: '上位30名' })).toBeHidden();
  await page.getByTestId('result-retry').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  expect(await probe(page, 'ammo')).toBe(10);
});
