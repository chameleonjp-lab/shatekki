import { mkdirSync, readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import type { PersistedRecord } from '../../src/contracts/persistence';
import { BOOTH_LAYOUT_V3, isAmmoBalanced, type ExpandedRunState, type GameplayBundle, type TuningConfig } from '../../src/contracts';
import { aimThrough } from '../helpers/aim-v3';

// r007 internal candidate, local build only (npm run build:aim-first, port 4180).
// Chromium with phone-sized viewports: NOT Safari and NOT a real iPhone.
test.use({ baseURL: 'http://127.0.0.1:4180' });

// r007 keeps the rules-v1 cork and aim numbers; only the layout is v3 (the browser loader cannot import the JSON bundle).
const RELEASE_TUNING = (JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')) as { tuning: TuningConfig }).tuning;
const B = { layout: BOOTH_LAYOUT_V3, tuning: RELEASE_TUNING } as unknown as GameplayBundle;
/** Must match AIM_SENSITIVITY in src/ui/controls/panel.ts. */
const AIM_SENSITIVITY = 0.0022;

async function shot(page: Page, info: TestInfo, name: string) {
  const dir = 'test-results/aim-first';
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: `${dir}/${info.project.name}-${name}.png` });
}

async function record(page: Page): Promise<PersistedRecord> {
  const rows = await page.evaluate(async (): Promise<PersistedRecord[]> => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('shatekki.checkpoints');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    try {
      return await new Promise<PersistedRecord[]>((resolve, reject) => {
        const req = db.transaction('runs').objectStore('runs').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  });
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

async function start(page: Page) {
  await page.goto('/?e2e=1');
  await expect(page.locator('#app')).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r007');
  await page.getByTestId('home-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  // the order card first (talk and speech wait for it)
  await page.locator('.rwd-order button').nth(1).click();
}

/** Press and hold a button with a real pointer for `ms`. */
async function hold(page: Page, testId: string, ms: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

/** Drag the aim pad by the pixels that give `dyaw`, `dpitch`. */
async function dragAim(page: Page, dyaw: number, dpitch: number) {
  const box = (await page.getByTestId('aim-pad').boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  await page.mouse.move(x0 + dyaw / AIM_SENSITIVITY, y0 - dpitch / AIM_SENSITIVITY, { steps: 8 });
  await page.mouse.up();
}

/** Hold ▶ until the stand reaches the right end (a slow machine glides at fewer frames per second). */
async function toRightEnd(page: Page) {
  for (let i = 0; i < 4; i++) {
    await hold(page, 'btn-right', 2600);
    if ((await savedAim(page)).x === B.layout.camera.standMaxX) return;
  }
  expect((await savedAim(page)).x).toBe(B.layout.camera.standMaxX);
}

async function savedAim(page: Page) {
  const s = (await record(page)).state;
  return { x: s.standX, yaw: s.aim.yaw, pitch: s.aim.pitch };
}

/** Tap 撃つ, wait for a bar near the middle of the strong zone, tap 発射. */
async function shoot(page: Page) {
  const btn = page.getByTestId('btn-fire');
  await btn.tap();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
  await page.waitForTimeout(560);
  await btn.tap();
}

async function settle(page: Page, answer = true) {
  for (let i = 0; i < 200; i++) {
    const mode = await page.getByTestId('controls').getAttribute('data-mode');
    if (mode === 'aiming' || mode === 'ended') return;
    const choice = page.getByTestId('shopq-choice-A');
    // an answered question stays on screen (disabled) for a moment: only an enabled choice is pressed
    if (answer && (await choice.isVisible().catch(() => false)) && (await choice.isEnabled().catch(() => false))) await choice.click({ timeout: 2_000 }).catch(() => undefined);
    await page.waitForTimeout(150);
  }
  throw new Error('the shot did not settle');
}

test('aim first: tap and hold to move, drag to aim, 撃つ then 発射 uses one cork, and a reload comes back to the same aim', async ({ page }, info) => {
  test.setTimeout(120_000);
  await start(page);
  await shot(page, info, '01-start');
  await page.getByTestId('btn-right').tap();
  await expect.poll(async () => (await savedAim(page)).x).toBeCloseTo(0.14, 5);
  await hold(page, 'btn-left', 1200);
  await expect.poll(async () => (await savedAim(page)).x).toBeLessThan(-0.2);
  await dragAim(page, 0.05, 0.04);
  await expect.poll(async () => (await savedAim(page)).yaw).toBeGreaterThan(0.03);
  const before = await savedAim(page);
  await shot(page, info, '02-aimed');
  await page.getByTestId('btn-fire').tap();
  await expect(page.getByTestId('load-meter')).toHaveAttribute('data-open', 'true');
  await page.waitForTimeout(400);
  await shot(page, info, '03-gauge');
  // 照準に戻る: no cork used, same aim
  await page.getByTestId('btn-cancel-gauge').tap();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  await expect(page.getByTestId('hud-ammo')).toContainText('10');
  await shoot(page);
  await expect(page.getByTestId('hud-ammo')).toContainText('9');
  await settle(page);
  await expect(page.getByTestId('shot-card')).toBeVisible();
  await shot(page, info, '04-card');
  // The shot spent exactly one cork (HUD showed 9 immediately after FIRE), but
  // post-flight cells, shopkeeper answers and rewards can legitimately add or
  // remove corks before settlement. Verify the confirmed result, not a fixed 9.
  const confirmed = await record(page);
  const settled = confirmed.state as ExpandedRunState;
  expect({ x: settled.standX, yaw: settled.aim.yaw, pitch: settled.aim.pitch }).toEqual(before);
  expect(settled.shotsFired).toBe(1);
  expect(settled.ledger).toHaveLength(1);
  expect(isAmmoBalanced(settled, RELEASE_TUNING.initialAmmo)).toBe(true);
  expect(confirmed.lastSummary?.ammoAfter).toBe(settled.ammo);

  // Resuming must restore that exact settlement: neither the shot nor any
  // bonus/penalty, score, completed set or presentation may be applied twice.
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  const resumed = await record(page);
  const s = resumed.state as ExpandedRunState;
  expect({ x: s.standX, yaw: s.aim.yaw, pitch: s.aim.pitch }).toEqual(before);
  expect(s.shotsFired).toBe(settled.shotsFired);
  expect(s.ammo).toBe(settled.ammo);
  expect(s.bonusAmmoTotal).toBe(settled.bonusAmmoTotal);
  expect(s.ammoLostTotal).toBe(settled.ammoLostTotal);
  expect(s.score).toBe(settled.score);
  expect(s.ledger).toEqual(settled.ledger);
  expect(s.completedSets).toEqual(settled.completedSets);
  expect(resumed.lastSummary).toEqual(confirmed.lastSummary);
  expect(isAmmoBalanced(s, RELEASE_TUNING.initialAmmo)).toBe(true);
});

test('talk: closing, rotating and reloading never use it; the ammo choice is saved once and survives a reload', async ({ page }, info) => {
  test.setTimeout(120_000);
  await start(page);
  await page.getByTestId('btn-talk').tap();
  await expect(page.getByTestId('talk-panel')).toBeVisible();
  await expect(page.getByTestId('talk-ammo')).toContainText('0.85');
  await shot(page, info, '05-talk');
  await page.getByTestId('talk-close').tap();
  await expect(page.getByTestId('talk-panel')).toBeHidden();
  // rotate with the panel open: it closes without using the right
  await page.getByTestId('btn-talk').tap();
  const portrait = page.viewportSize()!;
  await page.setViewportSize({ width: portrait.height, height: portrait.width });
  await expect(page.getByTestId('talk-panel')).toBeHidden();
  await page.setViewportSize(portrait);
  await page.getByTestId('btn-resume').tap();
  expect(((await record(page)).state as ExpandedRunState).expansion.aimFirst?.talk).toBeNull();
  // reload with the panel open: still unused
  await page.getByTestId('btn-talk').tap();
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  expect(((await record(page)).state as ExpandedRunState).expansion.aimFirst?.talk).toBeNull();
  // choose the cork; a double tap still pays once
  await page.getByTestId('btn-talk').tap();
  await page.getByTestId('talk-ammo').dblclick();
  await expect(page.getByTestId('talk-result')).toBeVisible();
  await shot(page, info, '06-talk-result');
  await page.getByTestId('talk-close').tap();
  await expect(page.getByTestId('hud-ammo')).toContainText('11');
  await expect(page.getByTestId('next-shot-mark')).toBeVisible();
  await expect(page.getByTestId('btn-talk')).toBeHidden();
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  const s = (await record(page)).state as ExpandedRunState;
  expect(s.ammo).toBe(11);
  expect(s.bonusAmmoTotal).toBe(1);
  expect(s.expansion.next.modifiers.powerZoneWidthMult).toBe(0.85);
  expect(s.expansion.aimFirst?.talk?.choice).toBe('ammo');
  // cancelling the gauge keeps the narrower zone for the next real shot
  await page.getByTestId('btn-fire').tap();
  await expect(page.getByTestId('load-label')).toContainText('0.85');
  await page.getByTestId('btn-cancel-gauge').tap();
  expect(((await record(page)).state as ExpandedRunState).expansion.next.modifiers.powerZoneWidthMult).toBe(0.85);
});

test('the shopkeeper speaks after six calm seconds, and the bubble closes when the gauge opens', async ({ page }, info) => {
  test.setTimeout(60_000);
  await start(page);
  const bubble = page.getByTestId('shopkeeper-speech');
  await expect(bubble).toBeHidden();
  await expect(bubble).toBeVisible({ timeout: 9_000 });
  expect((await bubble.textContent())!.length).toBeGreaterThan(4);
  await shot(page, info, '07-speech');
  await page.getByTestId('btn-fire').tap();
  await expect(bubble).toBeHidden();
});

test('a normal shot at the hat: 30 points, +1 cork, one question, then the result reads the part', async ({ page }, info) => {
  test.setTimeout(120_000);
  await start(page);
  await toRightEnd(page);
  const hat = B.layout.shopkeeper.find((p) => p.part === 'hat')!.box;
  const aim = aimThrough(B, B.layout.camera.standMaxX, { x: hat.center.x, y: hat.center.y, z: hat.center.z + hat.halfExtents.z })!;
  await dragAim(page, aim.yaw, aim.pitch);
  const saved = await savedAim(page);
  // the drag moves in whole pixels: correct the rest with a second, shorter drag
  await dragAim(page, aim.yaw - saved.yaw, aim.pitch - saved.pitch);
  await shot(page, info, '08-hat-aim');
  await shoot(page);
  await expect(page.getByTestId('shopkeeper-question')).toBeVisible({ timeout: 20_000 });
  // the question closes any speech bubble and none starts while it is open
  await expect(page.getByTestId('shopkeeper-speech')).toBeHidden();
  await shot(page, info, '09-hat-question');
  await page.getByTestId('shopq-choice-A').click();
  await settle(page);
  const card = page.getByTestId('shot-card');
  await expect(card).toBeVisible();
  await expect(card).toContainText('帽子 ＋30点');
  await shot(page, info, '10-hat-card');
  const s = (await record(page)).state;
  expect(s.firstHitsScored).toContain('shopkeeper:hat');
  expect(s.ledger.at(-1)!.items).toContainEqual({ kind: 'shopkeeper', refId: 'hat', points: 30 });
});

test('a normal shot at the fan face: one fan contact, a question, and the card names the fan', async ({ page }, info) => {
  test.setTimeout(120_000);
  await start(page);
  await toRightEnd(page);
  // two taps back from the right end
  await page.getByTestId('btn-left').tap();
  await page.getByTestId('btn-left').tap();
  await expect.poll(async () => (await savedAim(page)).x).toBeCloseTo(2.37, 5);
  const fan = B.layout.reflectors!.find((r) => r.reflectorId === 'fan')!;
  const aim = aimThrough(B, 2.37, { x: fan.center.x, y: fan.center.y + 0.04, z: fan.center.z })!;
  await dragAim(page, aim.yaw, aim.pitch);
  const saved = await savedAim(page);
  await dragAim(page, aim.yaw - saved.yaw, aim.pitch - saved.pitch);
  await shot(page, info, '11-fan-aim');
  await shoot(page);
  await expect(page.getByTestId('shopkeeper-question')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('shopq-choice-B').click();
  await settle(page);
  await expect(page.getByTestId('shot-card')).toContainText('うちわ');
  await shot(page, info, '12-fan-card');
  const last = (await record(page)).lastSummary!;
  expect(last.touchedFirstHitTargets).toContain('shopkeeper:fan');
});

test('today\'s stall (daily) uses the same aim-first rules, its own record, and resumes after a reload', async ({ page }, info) => {
  test.setTimeout(90_000);
  await page.goto('/?e2e=1');
  await page.getByTestId('home-daily-start').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  const r0 = await record(page);
  expect(r0.scope.mode).toBe('daily');
  expect(r0.state.rulesVersion).toBe('rules-v2-proposed-r007');
  await page.locator('.rwd-order button').nth(1).click();
  await page.getByTestId('btn-right').tap();
  await expect.poll(async () => (await savedAim(page)).x).toBeCloseTo(0.14, 5);
  await shoot(page);
  await settle(page);
  await shot(page, info, '13-daily');
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await page.getByTestId('btn-resume').click();
  const s = (await record(page)).state;
  expect(s.phase).toBe('aiming');
  expect(s.shotsFired).toBe(1);
  expect(s.standX).toBeCloseTo(0.14, 5);
});
