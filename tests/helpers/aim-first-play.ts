/**
 * Playing r007 in the browser the way a player does (T02/T03/T05/T06/T08): the prepared starts of
 * tests/fixtures/r007/scenarios.json.gz, a drag to aim, "撃つ", watching the gauge, "発射".
 * Not a test file.
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import type { RunState, SetId } from '../../src/contracts';
import { readRecordedRun } from './read-recorded-run';

export interface Scene {
  name: string;
  state: RunState;
  aim: { yaw: number; pitch: number };
  discovered: SetId[];
  expect: { sets?: SetId[]; reflector?: 'fan' | 'tray'; continues?: boolean };
}
export const SCENES = JSON.parse(gunzipSync(readFileSync('tests/fixtures/r007/scenarios.json.gz')).toString()) as Scene[];
export const scene = (name: string) => SCENES.find((s) => s.name === name)!;
export const SETS = new Map<string, string[]>([
  ...(JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')).catalog.sets as { setId: string; requiredTypeIds: string[] }[]).map((s) => [s.setId, s.requiredTypeIds] as [string, string[]]),
  ...(JSON.parse(readFileSync('data/expansion-v2/pair-sets.json', 'utf8')) as { id: string; prizeIds: string[] }[]).map((s) => [s.id, s.prizeIds] as [string, string[]]),
]);
const AIM_SENSITIVITY = 0.0022;

export async function drag(page: Page, dyaw: number, dpitch: number) {
  const box = (await page.getByTestId('aim-pad').boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dyaw / AIM_SENSITIVITY, y0 - dpitch / AIM_SENSITIVITY, { steps: 6 });
  await page.mouse.up();
}

/**
 * Pause the page clock a moment from now. On a slow machine the moment can pass before the call
 * arrives ("Cannot fast-forward to the past"); then ask again with a longer lead. Nothing is
 * pressed while the clock jumps, and the gauge is still closed.
 */
async function holdClock(page: Page) {
  for (const lead of [200, 1000, 3000]) {
    try {
      await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + lead));
      return;
    } catch (e) {
      if (!/fast-forward to the past/.test(String(e))) throw e;
    }
  }
  throw new Error('could not hold the page clock');
}

/**
 * Drag to the scene's aim (a second short drag takes up the pixel rounding), then 撃つ → 発射.
 * The page clock (installed by the caller before the page loads) is held while the gauge runs, so
 * "発射" is pressed 0.6 s after "撃つ" as in the node check, whatever the machine's load; the
 * label must then name a strong band, as a player would see before pressing.
 */
export async function aimAndFire(page: Page, sc: Scene) {
  await drag(page, sc.aim.yaw, sc.aim.pitch);
  await expect.poll(async () => (await readRecordedRun(page)).state.aim.yaw).not.toBe(0);
  const saved = (await readRecordedRun(page)).state.aim;
  await drag(page, sc.aim.yaw - saved.yaw, sc.aim.pitch - saved.pitch);
  await expect.poll(async () => (await readRecordedRun(page)).state.aim).toEqual(expect.objectContaining({ yaw: expect.closeTo(sc.aim.yaw, 4) }));
  await fireWithGauge(page);
  await expect.poll(async () => (await readRecordedRun(page)).state.shotsFired, { timeout: 15_000 }).toBe(sc.state.shotsFired + 1);
}

/**
 * Drive the visible button with touch input while the gauge uses a controlled
 * clock. A trusted touch does not wait for two stable animation frames while
 * that clock is paused, and the final tap still goes through the real handler.
 */
export async function fireWithGauge(page: Page, checkSpentCork?: () => Promise<void>) {
  const btn = page.getByTestId('btn-fire');
  const tap = async () => {
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
    const box = await btn.boundingBox();
    if (!box) throw new Error('The visible fire control has no touch area');
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    const reachable = await btn.evaluate((el, point) => el.contains(el.ownerDocument.elementFromPoint(point.x, point.y)), { x, y });
    if (!reachable) throw new Error('The fire control is covered');
    await page.touchscreen.tap(x, y);
  };
  await holdClock(page);
  try {
    await tap();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
    // The UI and game clocks both advance through the same animation frames.
    await page.clock.runFor(600);
    await expect(page.getByTestId('load-label')).toHaveAttribute('data-tier', /^(good|perfect)$/);
    await tap();
    // The IndexedDB write may still be pending after the native tap. Keep the
    // game clock paused until FIRE starts, then inspect the committed shot.
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'resolving', { timeout: 30_000 });
    await checkSpentCork?.();
  } finally {
    await page.clock.resume();
  }
}

/** T05: read the card as a player would and measure every element from one layout. */
export async function expectCardClear(page: Page) {
  const card = page.getByTestId('shot-card');
  await expect(card).toBeVisible();
  await card.dispatchEvent('pointerdown');
  await expect.poll(() => card.evaluate(element => {
    const r = element.getBoundingClientRect();
    if (!r.width || !r.height || r.left < -0.5 || r.top < -0.5 ||
      r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5) return 'The card is outside the viewport';
    const selectors = ['[data-testid="hud-ammo"]', '[data-testid="hud-score"]', '[data-testid="controls"]', '.af-speech:not([hidden])'];
    for (const selector of selectors) {
      const other = element.ownerDocument.querySelector(selector)?.getBoundingClientRect();
      if (other?.width && other.height && r.left < other.right && r.right > other.left &&
        r.top < other.bottom && r.bottom > other.top) return `The card overlaps ${selector}`;
    }
    return null;
  }), { timeout: 8_000 }).toBeNull();
}

export async function settle(page: Page) {
  for (let i = 0; i < 200; i++) {
    const mode = await page.getByTestId('controls').getAttribute('data-mode');
    if (mode === 'aiming' || mode === 'ended') return;
    const a = page.getByTestId('shopq-choice-A');
    if ((await a.isVisible().catch(() => false)) && (await a.isEnabled().catch(() => false))) await a.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
  throw new Error('the shot did not settle');
}

