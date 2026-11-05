import { expect, test, type Page } from '@playwright/test';

// Chromium with an iPhone-class viewport (not Safari, not a real device).
// Covers AC01 (10 shots, 9 prizes shown), AC03 (phases are distinct and the
// shot count drops only on fire) and AC04 (double tap does not double-fire).

async function startGame(page: Page) {
  await page.goto('/?e2e=1');
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
}

async function readAmmo(page: Page): Promise<number> {
  const text = (await page.getByTestId('hud-ammo').textContent()) ?? '';
  const m = text.match(/(\d+)/);
  return m ? Number(m[1]) : Number.NaN;
}

test('a new game shows 10 ammo and 9 prizes on the shelf (AC01)', async ({ page }) => {
  await startGame(page);
  expect(await readAmmo(page)).toBe(10);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shatekki?: { prizeCount(): number } }).__shatekki?.prizeCount() ?? -1)).toBe(9);
});

test('position → load → aim → fire; ammo drops only on fire and a double tap fires once (AC03, AC04)', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('btn-right').dispatchEvent('pointerdown');
  await page.getByTestId('btn-right').dispatchEvent('pointerup');
  expect(await readAmmo(page)).toBe(10);
  await page.getByTestId('btn-confirm-position').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
  expect(await readAmmo(page)).toBe(10);
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  expect(await readAmmo(page)).toBe(10);
  await expect(page.getByTestId('load-label')).not.toHaveText('');

  // Double tap on fire.
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'resolving');
  expect(await readAmmo(page)).toBe(9);

  // The shot settles in finite time and the next shot starts from position.
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  expect(await readAmmo(page)).toBe(9);
});

test('a finger left on the load button cannot fire (AC04)', async ({ page }) => {
  await startGame(page);
  await page.getByTestId('btn-confirm-position').click();
  const load = page.getByTestId('btn-load');
  await load.dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  // The release lands on the fire button without a press that started there.
  await page.getByTestId('btn-fire').dispatchEvent('pointerup');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  expect(await readAmmo(page)).toBe(10);
});
