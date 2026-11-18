import { expect, test } from '@playwright/test';

for (const [port, version, prizes] of [[4173, 'rules-v1', 9], [4176, 'rules-v2-proposed-r004', 36]] as const) {
  test(`the normal start on port ${port} selects ${version}`, async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('VITE_SHATEKKI_BUNDLE', 'expanded-full'));
    await page.goto(`http://127.0.0.1:${port}/?bundle=expanded-full&e2e=1`);
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version', version);
    if (prizes === 36) await expect(page.locator('.notice.proto')).toContainText(version);
    await expect(page.getByTestId('home-ranking')).toBeHidden();
    await page.getByTestId('home-start').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { __shatekki: { prizeCount(): number } }).__shatekki.prizeCount())).toBe(prizes);
  });
}
