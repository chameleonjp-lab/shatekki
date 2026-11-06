import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { BOOTH_LAYOUT_V2, aimDirection, ballisticFor, corkFreeFlightPath, muzzlePosition, type TuningConfig, type Vec3 } from '../../src/contracts';

// The expanded bundle keeps the rules-v1 cork and aim numbers (only slots/tier targets differ).
const RELEASE_TUNING = (JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')) as { tuning: TuningConfig }).tuning;
/** Radians per CSS pixel of aim-pad drag; must match AIM_SENSITIVITY in src/ui/controls/panel.ts. */
const AIM_SENSITIVITY = 0.0022;

// The internal D34-D37 prototype build, end to end through the real page:
// move to the right end, hit the shopkeeper, answer once, and continue.
// Chromium with iPhone-class portrait viewports: not Safari, not a device.

test.use({ baseURL: 'http://127.0.0.1:4174' });

const probe = (page: Page, name: string) =>
  page.evaluate((n) => (window as unknown as { __shatekki: Record<string, () => unknown> }).__shatekki[n]!(), name);

/** Requested aim (relative to zero aim) that puts the cork on `target`, gravity included. */
function aimAt(standX: number, target: Vec3): { yaw: number; pitch: number } {
  const L = BOOTH_LAYOUT_V2;
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(RELEASE_TUNING, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

async function start(page: Page) {
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
}

/** Stand at the right end, load, drag the aim pad to the shopkeeper's body and fire. */
async function shootShopkeeper(page: Page) {
  const standX = BOOTH_LAYOUT_V2.camera.standMaxX;
  await page.getByTestId('stand-slider').fill(String(standX));
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  const body = BOOTH_LAYOUT_V2.shopkeeper.find((p) => p.part === 'body')!.box.center;
  const aim = aimAt(standX, { x: body.x, y: 1.2, z: body.z + 0.1 });
  const pad = page.getByTestId('aim-pad');
  const box = (await pad.boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await pad.dispatchEvent('pointerdown', { pointerId: 7, clientX: x0, clientY: y0, isPrimary: true });
  await pad.dispatchEvent('pointermove', { pointerId: 7, clientX: x0 + aim.yaw / AIM_SENSITIVITY, clientY: y0 - aim.pitch / AIM_SENSITIVITY, isPrimary: true });
  await pad.dispatchEvent('pointerup', { pointerId: 7, clientX: x0 + aim.yaw / AIM_SENSITIVITY, clientY: y0 - aim.pitch / AIM_SENSITIVITY, isPrimary: true });
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
}

test('the overview shows 3 × 12 and the stand reaches both ends (display only)', async ({ page }) => {
  await start(page);
  const map = page.getByTestId('booth-map');
  await expect(map).toBeVisible();
  await expect(map.locator('.bm-tile')).toHaveCount(36);
  const slider = page.getByTestId('stand-slider');
  await slider.fill(String(BOOTH_LAYOUT_V2.camera.standMinX));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.phase ?? '')).not.toBe('resolving');
  await slider.fill(String(BOOTH_LAYOUT_V2.camera.standMaxX));
  // Tapping the map never fires.
  await map.click();
  expect(await probe(page, 'ammo')).toBe(10);
  expect(await probe(page, 'phase')).toBe('position');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('a cork on the shopkeeper asks one question; one answer continues the game (CH-AC question flow)', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await shootShopkeeper(page);
  const panel = page.getByTestId('shopkeeper-question');
  await expect(panel).toBeVisible({ timeout: 20_000 });
  expect(await probe(page, 'phase')).toBe('resolving');
  await expect(page.getByTestId('shopq-question')).not.toHaveText('');
  const a = page.getByTestId('shopq-choice-A');
  const b = page.getByTestId('shopq-choice-B');
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  // Both choices stay inside the screen.
  const vp = page.viewportSize()!;
  for (const btn of [a, b]) {
    const r = (await btn.boundingBox())!;
    expect(r.y + r.height).toBeLessThanOrEqual(vp.height + 0.5);
    expect(r.x + r.width).toBeLessThanOrEqual(vp.width + 0.5);
  }
  // Waiting does not move the game on.
  await page.waitForTimeout(1500);
  expect(await probe(page, 'phase')).toBe('resolving');
  await expect(panel).toBeVisible();
  await b.click();
  await a.click({ force: true, timeout: 2000 }).catch(() => undefined);
  await expect(panel).toBeHidden({ timeout: 20_000 });
  // After the shot settles, the result lines say what the answer did (text only, no raw keys).
  const results = page.getByTestId('effect-results');
  await expect(results).toBeVisible({ timeout: 30_000 });
  const resultText = (await results.textContent()) ?? '';
  expect(resultText).toContain('店主の答え');
  expect(resultText).not.toMatch(/exp\.|fxres\.|\bFX\d{3}\b|\{\w+\}/);
  const rb = (await results.boundingBox())!;
  const fireBox = (await page.getByTestId('btn-confirm-position').boundingBox())!;
  expect(rb.y + rb.height).toBeLessThan(fireBox.y + 1);
  await results.click();
  await expect(results).toBeHidden();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', /position|ended/, { timeout: 30_000 });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('shatekki.run.rules-v2-proposed-r001')!));
  const st = saved.checkpoint.state;
  expect(st.expansion.questionCursor).toBe(1);
  expect(st.ledger).toHaveLength(1);
  expect(st.firstHitsScored.some((k: string) => k.startsWith('shopkeeper:'))).toBe(true);
  expect(st.shotsFired + st.ammo + st.ammoLostTotal).toBe(10 + st.bonusAmmoTotal);
});

test('reloading while the question is shown abandons the shot; nothing is redone or ranked', async ({ page }) => {
  test.setTimeout(90_000);
  await start(page);
  await shootShopkeeper(page);
  await expect(page.getByTestId('shopkeeper-question')).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByTestId('home-start')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('app-notice')).toContainText('中断');
  await expect(page.getByTestId('btn-resume-run')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('shatekki.run.rules-v2-proposed-r001'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('shatekki.run.v1'))).toBeNull();
});
