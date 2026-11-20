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
  const btn = page.getByTestId('btn-fire');
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 200));
  await btn.tap();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
  for (let i = 0; i < 6; i++) await page.clock.runFor(100);
  await expect(page.getByTestId('load-label')).toHaveAttribute('data-tier', /^(good|perfect)$/);
  await btn.tap();
  await page.clock.resume();
  await expect.poll(async () => (await readRecordedRun(page)).state.shotsFired).toBe(sc.state.shotsFired + 1);
}

type Rect = { x: number; y: number; width: number; height: number };
const meets = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** T05: the card stays on screen and clear of the ammo, the score, the controls and the speech bubble. */
export async function expectCardClear(page: Page) {
  const vp = page.viewportSize()!;
  const card = (await page.getByTestId('shot-card').boundingBox())!;
  expect(card.x).toBeGreaterThanOrEqual(0);
  expect(card.y).toBeGreaterThanOrEqual(0);
  expect(card.x + card.width).toBeLessThanOrEqual(vp.width + 0.5);
  expect(card.y + card.height).toBeLessThanOrEqual(vp.height + 0.5);
  for (const id of ['hud-ammo', 'hud-score', 'controls']) {
    const other = await page.getByTestId(id).boundingBox();
    if (other) expect(meets(card, other), `the card covers ${id} at ${vp.width}x${vp.height}`).toBe(false);
  }
  const speech = page.locator('.af-speech:not([hidden])');
  if (await speech.count()) {
    const b = await speech.first().boundingBox();
    if (b) expect(meets(card, b), 'the card covers the speech bubble').toBe(false);
  }
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

