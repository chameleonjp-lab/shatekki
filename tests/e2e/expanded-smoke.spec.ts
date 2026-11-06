import { expect, test, type Page } from '@playwright/test';

// The internal D34-D37 prototype build (VITE_SHATEKKI_BUNDLE=expanded-proposed),
// served on its own port. Chromium with an iPhone-class portrait viewport: not
// Safari, not a real device. The public build is covered by the other specs.

test.use({ baseURL: 'http://127.0.0.1:4174' });

const RUN_KEY = 'shatekki.run.rules-v2-proposed-r001';

const probe = (page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as { __shatekki: Record<string, () => unknown> }).__shatekki[n]!(), name);

async function fresh(page: Page) {
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await expect(page.getByTestId('home-start')).toBeVisible();
}

test('the prototype build starts a 36-prize run saved under its own key, marked as prototype and never ranked', async ({ page }) => {
  await fresh(page);
  await page.evaluate(() => {
    localStorage.setItem('shatekki.profile.v1', JSON.stringify({ schemaVersion: 1, bestScore: 77, discoveredSets: ['S001'] }));
  });
  await page.reload();
  await expect(page.locator('.notice.proto')).toBeVisible();
  await expect(page.getByTestId('home-ranking')).toBeHidden();
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  expect(await probe(page, 'prizeCount')).toBe(36);
  expect(await probe(page, 'ammo')).toBe(10);
  const saved = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!), RUN_KEY);
  expect(saved.checkpoint.state.schemaVersion).toBe(2);
  expect(saved.checkpoint.state.rulesVersion).toBe('rules-v2-proposed-r001');
  expect(saved.checkpoint.state.valueStatus).toBe('prototype');
  expect(saved.checkpoint.state.expansion.cells).toHaveLength(36);
  expect(saved.checkpoint.state.expansion.questionOrder).toHaveLength(200);
  // The rules-v1 keys are left exactly as they were.
  expect(await page.evaluate(() => localStorage.getItem('shatekki.run.v1'))).toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.profile.v1')!))).toEqual({ schemaVersion: 1, bestScore: 77, discoveredSets: ['S001'] });
});

test('a URL parameter cannot switch the public build to the prototype', async ({ page }) => {
  await page.goto('http://127.0.0.1:4173/?e2e=1&bundle=expanded-proposed&VITE_SHATEKKI_BUNDLE=expanded-proposed');
  await page.evaluate(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/?e2e=1&bundle=expanded-proposed&VITE_SHATEKKI_BUNDLE=expanded-proposed');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  expect(await probe(page, 'prizeCount')).toBe(9);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.run.v1')!));
  expect(saved.checkpoint.state.rulesVersion).toBe('rules-v1');
  expect(await page.evaluate((k) => localStorage.getItem(k), RUN_KEY)).toBeNull();
});
