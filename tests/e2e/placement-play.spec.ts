import { expect, test } from '@playwright/test';
import { readRecordedRun } from '../helpers/read-recorded-run';
import { shootShopkeeper } from '../helpers/shoot-shopkeeper';


for (const [port, version] of [[4177, 'r005'], [4178, 'r006']] as const) {
  test(`${version} plays the shopkeeper's assortment change and restores the transformed shelf`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.addInitScript(() => {
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = array => {
        if (array instanceof Uint32Array && array.length === 1) { array[0] = 117; return array; }
        return original(array);
      };
    });
    await page.goto(`http://127.0.0.1:${port}/?e2e=1`);
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version', `rules-v2-proposed-${version}`);
    await page.getByTestId('home-start').click();
    await expect(page.getByTestId('booth-map').locator('.bm-tile')).toHaveCount(36, { timeout: 30_000 });
    await page.getByTestId('order-decline').click();
    await shootShopkeeper(page);
    await expect(page.getByTestId('shopkeeper-question')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('shopq-choice-B').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
    const before = await readRecordedRun(page);
    expect(before.state.expansion!.questionOrder[0]).toBe('Q001');
    expect(before.state.expansion!.assortmentSeries).not.toBeNull();
    expect(before.lastSummary!.appliedTransforms!.length).toBeGreaterThan(0);
    expect(before.state.shelf.prizes.some(p => p.mounted && p.motionAnchor && p.typeId !== p.drawnTypeId)).toBe(true);
    await page.reload();
    await page.getByTestId('btn-resume-run').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'paused');
    await page.getByTestId('btn-resume').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
    const after = await readRecordedRun(page);
    expect(after.state.shelf).toEqual(before.state.shelf);
    expect(after.state.expansion).toEqual(before.state.expansion);
    expect(after.gameTick).toBe(before.gameTick);
    expect(after.lastSummary).toEqual(before.lastSummary);
    expect(after.state.score).toBe(before.state.score);
    expect(after.state.shotsFired).toBe(1);
  });
}
