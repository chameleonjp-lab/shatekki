import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { LOCALES, translate } from '../../src/i18n';
import { prizeName, setName } from '../../src/i18n/content';
import { pairName } from '../../src/i18n/expanded-content';
import { restoreBeforeShot } from '../helpers/outcome-checkpoint';

const sets = new Map<string, string[]>();
const trios = JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')).catalog.sets as {setId: string; requiredTypeIds: string[]}[];
const pairs = JSON.parse(readFileSync('data/expansion-v2/pair-sets.json', 'utf8')) as {id: string; prizeIds: string[]}[];
for (const s of trios) sets.set(s.setId, s.requiredTypeIds);
for (const s of pairs) sets.set(s.id, s.prizeIds);
test.use({ baseURL: process.env.SHATEKKI_NEXT_TEST_ORIGIN ?? 'http://127.0.0.1:4178' });

async function fireToSets(page: Page) {
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown', { pointerId: 4 });
  await fire.dispatchEvent('pointerup', { pointerId: 4 });
  const card = page.getByTestId('reward-card');
  await expect.poll(async () => {
    await page.clock.runFor(100);
    return card.locator('.rwd-set').count();
  }, { timeout: 30_000, intervals: [0] }).toBe(3);
  return card;
}

for (const [outcome, locales] of [['rescued', LOCALES], ['capped', ['ja']]] as const) {
  for (const locale of locales) {
    test(`${locale} ${outcome}: a real last shot shows all three newly discovered sets`, async ({ page, browser }, info) => {
      test.setTimeout(90_000);
      await page.addInitScript(locale => {
        localStorage.setItem('shatekki.language.v1', locale);
        localStorage.setItem('shatekki.settings.v1', JSON.stringify({
          schemaVersion: 1, language: locale, audio: { enabled: false, volume: 0 }, savedAt: '2026-11-18T12:00:00.000Z',
        }));
      }, locale);
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
