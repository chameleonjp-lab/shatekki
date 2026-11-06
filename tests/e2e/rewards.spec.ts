import { expect, test, type Page } from '@playwright/test';

// Internal rewards build (rules-v2-proposed-r003), end to end through the real page: the order
// card, the bag, the last-shot target (preview, fixed, hit), continuing from the last cork, the
// best shot on the result, and the same result after a reload. Chromium with iPhone-class
// portrait viewports: not Safari, not a device.

test.use({ baseURL: 'http://127.0.0.1:4175' });

/** Radians per CSS pixel of aim-pad drag; must match AIM_SENSITIVITY in src/ui/controls/panel.ts. */
const AIM_SENSITIVITY = 0.0022;
/** Must match TARGET_AIM in src/core/rewards.ts. */
const TARGET_AIM = { yaw: 0.17, pitch: -0.17 };

const probe = (page: Page, name: string) => page.evaluate((n) => (window as unknown as { __shatekki: Record<string, () => unknown> }).__shatekki[n]!(), name);

async function start(page: Page) {
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
}

/** Relative drag on the aim pad (the aim persists between shots). */
async function drag(page: Page, dYaw: number, dPitch: number) {
  const pad = page.getByTestId('aim-pad');
  const box = (await pad.boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  const x1 = x0 + dYaw / AIM_SENSITIVITY;
  const y1 = y0 - dPitch / AIM_SENSITIVITY;
  await pad.dispatchEvent('pointerdown', { pointerId: 7, clientX: x0, clientY: y0, isPrimary: true });
  await pad.dispatchEvent('pointermove', { pointerId: 7, clientX: x1, clientY: y1, isPrimary: true });
  await pad.dispatchEvent('pointerup', { pointerId: 7, clientX: x1, clientY: y1, isPrimary: true });
}

async function settle(page: Page) {
  await expect
    .poll(async () => {
      if (await page.getByTestId('shopkeeper-question').isVisible()) await page.getByTestId('shopq-choice-A').click().catch(() => undefined);
      const screen = await probe(page, 'screen');
      const phase = await probe(page, 'phase');
      return screen === 'result' || phase === 'position' || phase === 'ended';
    }, { timeout: 30_000 })
    .toBe(true);
}

/** One shot aimed at the top of the stall (no prize there), so the cork count drops by one. */
async function shootHigh(page: Page) {
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  await drag(page, 0, 0.8); // clamps at the top
  await page.getByTestId('btn-fire').dispatchEvent('pointerdown');
  await page.getByTestId('btn-fire').dispatchEvent('pointerup');
  await settle(page);
}

test('the order card answers once; the strip and the bag label are shown', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  const order = page.getByTestId('reward-order');
  await expect(order).toBeVisible();
  await expect(order).toContainText('3射以内');
  await page.getByTestId('order-accept').click();
  await expect(order).toBeHidden();
  await expect(page.getByTestId('reward-strip')).toContainText('注文：');
  await expect(page.getByTestId('reward-strip')).toContainText('袋 0個');
  await expect(page.locator('text=おまけ+2')).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.run.rules-v2-proposed-r003')!));
  expect(saved.checkpoint.state.expansion.rewards.order.status).toBe('accepted');
});

test('the last cork shows the target, a hit on it continues the game, and the result survives a reload', async ({ page }) => {
  test.setTimeout(300_000);
  await start(page);
  await page.getByTestId('order-decline').click();
  for (let i = 0; i < 25 && (await probe(page, 'ammo')) as number > 1; i++) await shootHigh(page);
  expect(await probe(page, 'ammo')).toBe(1);

  // preview while choosing the stand, fixed after confirming
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
  await expect(page.locator('text=中心+3／外+1')).toBeVisible();
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.run.rules-v2-proposed-r003')!));
  expect(saved.checkpoint.state.expansion.rewards.target.offered).toEqual({ outer: 1, center: 3 });

  // corner first (the aim persists), then the target's aim
  await drag(page, -0.8, -0.8);
  await drag(page, 0.3 + TARGET_AIM.yaw, 0.3 + TARGET_AIM.pitch);
  await page.getByTestId('btn-fire').dispatchEvent('pointerdown');
  await page.getByTestId('btn-fire').dispatchEvent('pointerup');
  const card = page.getByTestId('reward-card');
  await expect(card).toBeVisible({ timeout: 30_000 });
  await expect(card).toContainText('最後の一発の二重丸: 弾+');
  await expect(card).toContainText(/あと[13]発！/);
  await settle(page);
  expect(await probe(page, 'phase')).toBe('position');
  expect(await probe(page, 'ammo') as number).toBeGreaterThan(0);

  // play it out
  for (let i = 0; i < 25 && (await probe(page, 'screen')) !== 'result' && (await probe(page, 'phase')) !== 'ended'; i++) await shootHigh(page);
  await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('result-best-shot')).toBeVisible();
  await expect(page.getByTestId('result-last-shot')).toContainText('弾がなくなったので');
  const before = await page.getByTestId('result-last-shot').textContent();
  const score = await page.getByTestId('result-score').textContent();

  // a reload opens the same result, read only; going home closes it
  await page.reload();
  await expect(page.getByTestId('result-score')).toHaveText(score!, { timeout: 20_000 });
  await expect(page.getByTestId('result-last-shot')).toHaveText(before!);
  await page.getByTestId('result-home').click();
  await page.reload();
  await expect(page.getByTestId('home-start')).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => localStorage.getItem('shatekki.run.rules-v2-proposed-r003'))).toBeNull();
});
