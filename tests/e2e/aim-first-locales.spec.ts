import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LOCALES } from '../../src/i18n/locales';
import { restoreShotStart } from '../helpers/outcome-checkpoint';
import { aimAndFire, expectCardClear, scene } from '../helpers/aim-first-play';

// T08: the longest card (two sets at once) from a real shot, in each of the 15 languages, on the
// shortest screen (375×600). Text comes from each language (no key shown raw), the card stays clear
// of the ammo, the score, the controls and the speech bubble. Runs only in short-portrait-chromium
// (playwright.config.ts ignores this file in the other projects). 14 of 15 are machine translations
// not yet reviewed by native speakers; this checks fit and presence, not the wording.
test.use({ baseURL: 'http://127.0.0.1:4180', screenshot: 'only-on-failure' });

for (const locale of LOCALES) {
  test(`T08 two-set card fits in ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ baseURL: 'http://127.0.0.1:4180', locale, viewport: { width: 375, height: 600 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    try {
      const sc = scene('pair-and-trio');
      await page.clock.install();
      await restoreShotStart(page, { beforeFire: sc.state, gameTick: 0 }, sc.discovered);
      expect(await page.evaluate(() => document.documentElement.lang)).toBe(locale);
      await aimAndFire(page, sc);
      const card = page.getByTestId('shot-card');
      await expect(card).toHaveAttribute('data-kind', 'set', { timeout: 30_000 });
      if (process.env.SHATEKKI_EVIDENCE === '1') {
        mkdirSync('test-results/aim-first', { recursive: true });
        await page.screenshot({ path: `test-results/aim-first/locale-${locale}.png` });
      }
      const text = (await card.innerText()).trim();
      expect(text).not.toMatch(/\baf\.[a-z]|\bset\.[A-Z]|\bprize\.[A-Z]|\{[a-z]+\}/);
      await expectCardClear(page);
      // nothing in the card is cut off sideways
      expect(await card.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    } finally {
      await ctx.close();
    }
  });
}
