import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { formatInteger, LOCALES, translate, type Locale } from '../../src/i18n';
import { prizeName, setName } from '../../src/i18n/content';
import { pairName } from '../../src/i18n/expanded-content';
import { restoreBeforeShot, restoreShotStart } from '../helpers/outcome-checkpoint';
import { readRecordedRun } from '../helpers/read-recorded-run';
import { localizedSetShots } from '../helpers/localized-set-shots';

const sets = new Map<string, string[]>();
const trios = JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')).catalog.sets as {setId: string; requiredTypeIds: string[]}[];
const pairs = JSON.parse(readFileSync('data/expansion-v2/pair-sets.json', 'utf8')) as {id: string; prizeIds: string[]}[];
for (const s of trios) sets.set(s.setId, s.requiredTypeIds);
for (const s of pairs) sets.set(s.id, s.prizeIds);
test.use({ baseURL: process.env.SHATEKKI_NEXT_TEST_ORIGIN ?? 'http://127.0.0.1:4178' });

test('the real final shot keeps its illustrated discoveries, capped reason and score breakdown after reload', async ({ page }, info) => {
  test.setTimeout(90_000);
  // Let the normal wall clock carry the player from the shot through the result.
  await restoreBeforeShot(page, 'capped', ['PAIR216']);
  await page.getByTestId('btn-fire').tap();
  await expect(page.getByTestId('result-score')).toBeVisible({ timeout: 40_000 });
  const record = await readRecordedRun(page);
  const ids = ['PAIR214', 'PAIR216', 'S065'];
  expect(record.lastSummary?.newlyCompletedSets).toEqual(ids);
  expect(record.lastFreshSets).toEqual(['PAIR214', 'S065']);
  const result = record.result!;
  const total = (key: 'prizePoints' | 'trickPoints' | 'setPoints' | 'firstHitPoints' | 'appliedPenalty') =>
    result.ledger.reduce((sum, line) => sum + line[key], 0);
  const penalty = total('appliedPenalty');
  const breakdown = [total('prizePoints'), total('trickPoints'), total('setPoints'), total('firstHitPoints'), -penalty];
  expect(breakdown.reduce((sum, value) => sum + value, 0)).toBe(result.score);
  for (const reloaded of [false, true]) {
    if (reloaded) await page.reload();
    const last = page.getByTestId('result-last-shot');
    await expect(last).toBeVisible();
    await expect(last.locator('.rwd-portrait')).toHaveCount(7);
    for (const id of ids) {
      const row = last.locator(`[data-set="${id}"]`);
      const members = sets.get(id)!;
      await expect(row).toContainText(id.startsWith('PAIR') ? pairName('ja', id) : setName('ja', id));
      expect(await row.locator('.rwd-portrait').evaluateAll(list => list.map(el => (el as HTMLElement).dataset.prize))).toEqual(members);
      expect(await row.locator('.rwd-prize-name').allTextContents()).toEqual(members.map(id => prizeName('ja', id)));
      await expect(row.locator('.rwd-seal')).toHaveCount(id === 'PAIR216' ? 0 : 1);
      await row.scrollIntoViewIfNeeded();
      for (const member of await row.locator('.rwd-member').all()) await expect(member).toBeInViewport({ ratio: 0.99 });
    }
    await expect(last).toContainText(translate('ja', 'result.end.capped'));
    await expect(last).toContainText(translate('ja', 'result.end.noAmmo'));
    if (!reloaded) await info.attach('final-shot-sets.png', { body: await last.screenshot(), contentType: 'image/png' });
    await expect(page.getByTestId('result-score')).toHaveText(formatInteger('ja', result.score));
    expect(await page.locator('.bd dd').allTextContents()).toEqual([...breakdown, result.score].map(n =>
      n < 0 ? '−' + formatInteger('ja', -n) : formatInteger('ja', n || 0)));
  }
  expect((await readRecordedRun(page)).result).toEqual(result);
  await expect(page.locator('[data-result-vfx], .rwd-motion')).toHaveCount(0);
  await page.getByTestId('result-retry').tap();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
});

async function fireToSets(page: Page, targetSet?: string) {
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown', { pointerId: 4 });
  await fire.dispatchEvent('pointerup', { pointerId: 4 });
  const card = page.getByTestId('reward-card');
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return card.locator(targetSet ? `[data-set="${targetSet}"]` : '.rwd-set').count();
  }, { timeout: 30_000, intervals: [0] }).toBe(targetSet ? 1 : 3);
  return card;
}

test('a light tap and a touch scroll keep all seven confirmed prize pictures open until closed', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 375, height: 600 });
  await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
  await restoreBeforeShot(page, 'rescued');
  const card = await fireToSets(page);
  await page.clock.resume();
  await card.locator('.rwd-portrait').first().tap();
  await expect(card).toBeVisible();
  await card.evaluate(el => el.scrollTop = 0);
  const box = (await card.boundingBox())!;
  const x = box.x + box.width / 2;
  const start = box.y + box.height - 12;
  const touch = await page.context().newCDPSession(page);
  try {
    await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: start }] });
    for (let i = 1; i <= 6; i++) {
      await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: start - i * box.height / 10 }] });
    }
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => card.evaluate(el => el.scrollTop)).toBeGreaterThan(10);
    await expect(card.locator('.rwd-portrait')).toHaveCount(7);
  } finally {
    await touch.detach();
  }
  await page.getByTestId('reward-close').tap();
  await expect(card).toBeHidden();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
});

async function useLanguage(page: Page, locale: Locale) {
  await page.addInitScript(locale => {
    localStorage.setItem('shatekki.language.v1', locale);
    localStorage.setItem('shatekki.settings.v1', JSON.stringify({
      schemaVersion: 1, language: locale, audio: { enabled: false, volume: 0 }, savedAt: '2026-11-18T12:00:00.000Z',
    }));
  }, locale);
}

const nameOfSet = (locale: Locale, id: string) => id.startsWith('PAIR') ? pairName(locale, id) : setName(locale, id);

async function expectControlsClear(card: Locator) {
  const covered = await card.evaluate(el => {
    const box = el.getBoundingClientRect();
    const controls = document.querySelector('[data-testid=controls]')!;
    return [...controls.querySelectorAll<HTMLElement>('button:enabled, input:enabled')].filter(action => {
      const button = action.getBoundingClientRect();
      return button.width > 0 && button.height > 0 && box.left < button.right && button.left < box.right
        && box.top < button.bottom && button.top < box.bottom;
    }).map(action => action.dataset.testid);
  });
  expect(covered).toEqual([]);
}

for (const locale of LOCALES) {
  test(`${locale}: the longest localized set and the controls fit all three portraits`, async ({ page }) => {
    test.setTimeout(90_000);
    const longest = [...sets.keys()].sort((a, b) =>
      Array.from(nameOfSet(locale, b)).length - Array.from(nameOfSet(locale, a)).length)[0]!;
    const members = sets.get(longest)!;
    const before = localizedSetShots[longest];
    if (!before) throw Error(`No playable checkpoint for ${locale} / ${longest}`);
    await useLanguage(page, locale);
    await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
    await restoreShotStart(page, before);
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    const card = await fireToSets(page, longest);
    const row = card.locator(`[data-set="${longest}"]`);
    await expect(row.locator('.rwd-set-name')).toHaveText(nameOfSet(locale, longest));
    expect(await row.locator('.rwd-prize-name').allTextContents()).toEqual(members.map(id => prizeName(locale, id)));
    await expect(row.locator('.rwd-seal')).toHaveCount(1);
    const controls = page.getByTestId('controls');
    const close = page.getByTestId('reward-close');
    for (const [width, height] of [[402, 874], [402, 700], [375, 600]] as const) {
      await page.setViewportSize({ width, height });
      await expect(controls).toHaveAttribute('data-mode', 'position');
      // Check every wrapped line against the scrollable card, including text in the final tile.
      const clipped = await row.evaluate(row => {
        const card = row.closest('.rwd-card')!.getBoundingClientRect();
        return [...row.querySelectorAll('.rwd-set-name, .rwd-prize-name')].filter(el => {
          el.scrollIntoView({ block: 'nearest' });
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].some(r => r.left < card.left - 1 || r.right > card.right + 1
            || r.top < card.top - 1 || r.bottom > card.bottom + 1);
        }).map(el => el.textContent);
      });
      expect(clipped).toEqual([]);
      await close.tap({ trial: true });
      expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      await expectControlsClear(card);
      await page.getByTestId('btn-confirm-position').tap({ trial: true });
    }
    await close.tap();
    await expect(card).toBeHidden();
    await page.getByTestId('btn-confirm-position').tap();
    await expect(controls).toHaveAttribute('data-mode', 'loading');
  });
}

for (const [outcome, locales] of [['rescued', LOCALES], ['capped', ['ja']]] as const) {
  for (const locale of locales) {
    test(`${locale} ${outcome}: a real last shot shows all three newly discovered sets`, async ({ page, browser }, info) => {
      test.setTimeout(90_000);
      await useLanguage(page, locale);
      await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
      const prior = await restoreBeforeShot(page, outcome);
      expect(prior.ammo).toBe(1);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      const card = await fireToSets(page);
      const expected = outcome === 'rescued' ? ['PAIR201', 'PAIR203', 'S061'] : ['PAIR214', 'PAIR216', 'S065'];
      await expect(card.locator('[data-moment=setFirst]')).toBeVisible();
      await expect(card.locator('.rwd-seal')).toHaveCount(3);
      for (const id of expected) {
        const row = card.locator(`[data-set="${id}"]`);
        const members = sets.get(id)!;
        await expect(row).toContainText(id.startsWith('PAIR') ? pairName(locale, id) : setName(locale, id));
        expect(await row.locator('.rwd-portrait').evaluateAll(tiles => tiles.map(tile => (tile as HTMLElement).dataset.prize))).toEqual(members);
        expect(await row.locator('.rwd-prize-name').allTextContents()).toEqual(members.map(kind => prizeName(locale, kind)));
      }
      await expect(card.locator('[data-reward=A8]')).toHaveClass(outcome === 'capped' ? /rwd-none/ : /^rwd-item$/);
      await expect(card.locator('.rwd-portrait')).toHaveCount(7);
      const ammo = await page.evaluate(() => (window as unknown as { __shatekki: { ammo(): number } }).__shatekki.ammo());
      expect(ammo).toBe(outcome === 'rescued' ? 2 : 0);
      if (outcome === 'capped') await expect(card.locator('.rwd-calm')).toBeVisible();
      const reward = card.locator('[data-reward=A8]');
      await expect(reward).toContainText(outcome === 'rescued' ? translate(locale, 'reward.granted', { n: 2 }) : translate(locale, 'reward.capped'));
      const close = page.getByTestId('reward-close');
      // Freeze the actual confirmed card while rotating among the three portrait viewports.
      for (const [width, height] of [[402, 874], [402, 700], [375, 600]] as const) {
        await page.setViewportSize({ width, height });
        await card.evaluate(el => el.scrollTop = el.scrollHeight);
        const closeBox = (await close.boundingBox())!;
        const cardBox = (await card.boundingBox())!;
        // The scroll offset rounds to CSS pixels. Check each edge within one pixel.
        expect(closeBox.y).toBeGreaterThanOrEqual(cardBox.y - 1);
        expect(closeBox.y + closeBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height + 1);
        await expect(close).toBeInViewport();
        await close.click({ trial: true });
        await expectControlsClear(card);
        expect(await card.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
        const bounds = (await card.boundingBox())!;
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(height);
        if (locale === 'ja') {
          await card.evaluate(el => el.scrollTop = 0);
          await info.attach(outcome + '-' + width + 'x' + height + '.png', {
            body: await page.screenshot(), contentType: 'image/png',
          });
        }
      }
      await close.scrollIntoViewIfNeeded();
      await expect(close).toBeInViewport();
      await close.click();
      await expect(card).toBeHidden();

      if (locale === 'ja' && outcome === 'rescued') {
        // Carry only the discoveries actually made in the first browser into a new
        // copy of the pre-shot game. Its shot/score are computed again by the sim.
        const book = await page.evaluate(() => new Promise<string[]>((resolve, reject) => {
          const open = indexedDB.open('shatekki.checkpoints');
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction('profiles');
            const read = tx.objectStore('profiles').get(JSON.stringify(['book', 'normal', 'rules-v2-proposed-r006']));
            tx.oncomplete = () => { open.result.close(); resolve(read.result.discoveredSets); };
          };
        }));
        expect(book).toEqual(expect.arrayContaining(expected));
        const repeat = await browser.newContext({ baseURL: new URL(page.url()).origin, locale: 'ja-JP', viewport: page.viewportSize() });
        try {
          const next = await repeat.newPage();
          await next.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
          await next.clock.pauseAt(new Date('2026-11-18T12:01:00Z'));
          await restoreBeforeShot(next, 'rescued', book);
          const repeated = await fireToSets(next);
          await expect(repeated.locator('.rwd-seal')).toHaveCount(0);
          await expect(repeated.locator('.rwd-portrait')).toHaveCount(7);
          await expect(repeated.locator('[data-moment=continue]')).toBeVisible();
          await expect(next.locator('[data-motion=refill] [data-token=cork]')).toHaveCount(2);
        } finally {
          await repeat.close();
        }
      }
    });
  }
}
