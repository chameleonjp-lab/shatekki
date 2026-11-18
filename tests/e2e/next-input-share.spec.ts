import { expect, test, type Page } from '@playwright/test';
import { RANKING_CONFIG } from '../../src/ranking/config';

async function start(page: Page, version: string, port: number) {
  await page.goto(`http://127.0.0.1:${port}/?e2e=1`);
  await expect(page.locator('#app')).toHaveAttribute('data-rules-version', version);
  await page.getByTestId('home-start').click();
  if (version !== 'rules-v1') await page.getByTestId('order-decline').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
}

const read = (page: Page, field: 'ammo' | 'score' | 'phase') =>
  page.evaluate(n => (window as unknown as { __shatekki: Record<string, () => unknown> }).__shatekki[n]!(), field);

async function aim(page: Page) {
  await page.getByTestId('btn-confirm-position').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
  await page.getByTestId('btn-load').dispatchEvent('pointerdown', { pointerId: 10, pointerType: 'touch', isPrimary: true });
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
}

for (const [version, port] of [['rules-v1', 4173], ['rules-v2-proposed-r006', 4178]] as const) {
  test(`${version} AC04 only the finger that pressed fire can release it`, async ({ page }) => {
    await start(page, version, port);
    await aim(page);
    const fire = page.getByTestId('btn-fire');
    const finger = (id: number, isPrimary: boolean) => ({ pointerId: id, isPrimary, pointerType: 'touch' });
    await fire.dispatchEvent('pointerup', finger(10, true)); // load press released over fire
    await fire.dispatchEvent('pointerdown', finger(11, true));
    await fire.dispatchEvent('pointerdown', finger(12, false));
    await fire.dispatchEvent('pointerup', finger(12, false));
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
    expect(await read(page, 'ammo')).toBe(10);
    await fire.dispatchEvent('pointerup', finger(11, true));
    await expect.poll(() => read(page, 'ammo')).toBe(9);
    await fire.dispatchEvent('pointerup', finger(11, true));
    expect(await read(page, 'ammo')).toBe(9);
  });

  test(`${version} AC34 confirmed result opens X on tap and keeps both copy fallbacks`, async ({ page }) => {
    test.setTimeout(300_000);
    const requests: string[] = [];
    page.on('request', request => {
      if (request.url().startsWith(RANKING_CONFIG.supabaseUrl) || new URL(request.url()).hostname === 'x.com') requests.push(request.url());
    });
    const opened: string[] = [];
    const copied: string[] = [];
    await page.exposeFunction('recordIntent', (url: string) => opened.push(url));
    await page.exposeFunction('recordCopy', (text: string) => copied.push(text));
    await page.addInitScript(() => {
      const recorder = window as unknown as { recordIntent(url: string): void; recordCopy(text: string): void };
      let attempts = 0;
      window.open = ((url: string) => {
        recorder.recordIntent(String(url));
        return ++attempts === 1 ? { opener: null } : null;
      }) as typeof window.open;
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
        writeText: async (text: string) => {
          if (attempts === 3) throw new Error('clipboard denied');
          recorder.recordCopy(text);
        },
      } });
    });
    await start(page, version, port);
    const fire = page.getByTestId('btn-fire');
    for (let shot = 0; shot < 20 && await read(page, 'phase') !== 'ended'; shot++) {
      await aim(page);
      await fire.dispatchEvent('pointerdown', { pointerId: 11 });
      await fire.dispatchEvent('pointerup', { pointerId: 11 });
      await expect.poll(async () => {
        if (await page.getByTestId('shopkeeper-question').isVisible()) await page.getByTestId('shopq-choice-A').click();
        return ['position', 'ended'].includes(String(await read(page, 'phase')));
      }, { timeout: 30_000 }).toBe(true);
    }
    const share = page.getByTestId('result-share');
    await expect(share).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('result-ranking')).toBeHidden();
    expect(opened).toEqual([]);
    expect(copied).toEqual([]);
    const score = Number(await read(page, 'score'));
    await expect(page.getByTestId('result-score')).toContainText(String(score));
    await expect(share).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(share).toHaveCSS('color', 'rgb(255, 255, 255)');
    await share.click();
    await expect.poll(() => opened.length).toBe(1);
    const intent = new URL(opened[0]!);
    expect(intent.origin + intent.pathname).toBe('https://x.com/intent/post');
    const text = intent.searchParams.get('text')!;
    expect(text).toMatch(new RegExp(`(?:^|\\D)${score}点`));
    expect(text).toContain('https://chameleonjp-lab.github.io/shatekki/');
    await share.click();
    await expect.poll(() => copied).toEqual([text]);
    await share.click();
    await expect(page.locator('.scr-result textarea.manual-copy')).toHaveValue(text);
    await expect(page.locator('.scr-result textarea.manual-copy')).toBeVisible();
    expect(requests).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('shatekki.ranking-pending.v1'))).toBeNull();
  });
}
