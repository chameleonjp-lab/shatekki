import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { seedRng } from '../../src/catalog/rng';
import { shuffleOnce } from '../../src/core/expanded-run';
import { LOCALES, translate, type Locale } from '../../src/i18n';
import { choiceText, groupLabel, questionText } from '../../src/i18n/expanded-content';
import { shootShopkeeper } from '../helpers/shoot-shopkeeper';

const questions = JSON.parse(readFileSync('data/expansion-v2/questions.json', 'utf8')) as {
  id: string; A: { group: string }; B: { group: string };
}[];
const ids = questions.map(q => q.id).sort();

function longestPanel(locale: Locale) {
  const length = (q: typeof questions[number]) => {
    const parts = [questionText(locale, q.id)];
    for (const side of ['A', 'B'] as const) parts.push(choiceText(locale, q.id, side), groupLabel(locale, q[side].group));
    return Array.from(parts.join('')).length;
  };
  const longest = questions.reduce((best, next) => length(next) > length(best) ? next : best);
  for (let seed = 1; seed <= 20_000; seed++) {
    if (shuffleOnce(seedRng(seed ^ 0x1b873593), ids).items[0] === longest.id) return { seed, id: longest.id };
  }
  throw Error('No matching first question: ' + longest.id);
}

const candidateUrl = process.env.SHATEKKI_NEXT_TEST_ORIGIN ?? 'http://127.0.0.1:4178';
test.use({ baseURL: candidateUrl });

for (const locale of LOCALES) {
  test(`${locale}: read the longest question and tap through it on r006`, async ({ page }) => {
    test.setTimeout(90_000);
    const fixture = longestPanel(locale);
    await page.clock.install({ time: new Date('2026-11-18T12:00:00Z') });
    await page.addInitScript(({ seed }) => {
      // Pin the game's one-word seed. UUID generation and all other draws remain native.
      const original = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = values => {
        if (values instanceof Uint32Array && values.length === 1) {
          values[0] = seed;
          return values;
        }
        return original(values);
      };
    }, fixture);

    await page.goto('/?e2e=1');
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r006');
    await expect(page.locator('.notice.proto')).toContainText('rules-v2-proposed-r006');
    await page.getByTestId('home-settings').click();
    const settings = page.getByRole('dialog');
    await settings.locator('select').selectOption(locale);
    await settings.locator('input[type=range]').fill('0');
    await settings.getByRole('button', { name: translate(locale, 'settings.close'), exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.getByTestId('home-start')).toHaveText(translate(locale, 'home.start'));
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (...args) {
        const request = put.apply(this, args);
        if (this.name === 'runs') {
          IDBObjectStore.prototype.put = put;
          this.transaction.abort();
        }
        return request;
      };
    });
    await page.getByTestId('home-start').click();
    await expect(page.getByTestId('save-dialog')).toContainText(translate(locale, 'save.failure'));
    await page.getByRole('button', { name: translate(locale, 'save.retry'), exact: true }).click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
    await expect(page.locator('.bm-tile')).toHaveCount(36);
    await shootShopkeeper(page);
    const panel = page.getByTestId('shopkeeper-question');
    await expect(panel).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('shopq-question')).toHaveText(questionText(locale, fixture.id));
    for (const side of ['A', 'B'] as const) {
      const button = page.getByTestId('shopq-choice-' + side);
      await expect(button).toContainText(choiceText(locale, fixture.id, side));
      await button.click({ trial: true });
      await expect(button).toBeInViewport({ ratio: 0.99 });
    }
    // Stop at the question barrier before creating the auto-dismiss timer.
    await page.clock.pauseAt(new Date('2026-11-18T13:00:00Z'));
    await page.getByTestId('shopq-choice-B').click();
    await expect(panel).toBeHidden();
    const results = page.getByTestId('effect-results');
    await expect.poll(async () => {
      await page.clock.runFor(100);
      return results.isVisible();
    }, { timeout: 30_000, intervals: [0] }).toBe(true);
    await expect(results).toContainText(translate(locale, 'fxres.src.answer'));
    await expect(results).not.toContainText(/\bFX\d{3}\b|\{\w+\}/);
    await results.click();
    await page.getByTestId('btn-confirm-position').click();
    await page.clock.runFor(100);
    await expect(page.getByTestId('btn-load')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
}

// Play to a genuine result once per viewport. Clone that origin's storage into
// fresh browser contexts so replay in one language cannot erase the next case.
test('result, reason, share and replay in all 15 locales on the same settled game', async ({ page, browser, context }) => {
  test.setTimeout(300_000);
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  const controls = page.getByTestId('controls');
  for (let n = 0; n < 20; n++) {
    if (await page.getByTestId('result-score').isVisible()) break;
    await expect(controls).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });
    await page.getByTestId('btn-confirm-position').click();
    await expect(controls).toHaveAttribute('data-mode', 'loading');
    await page.getByTestId('btn-load').dispatchEvent('pointerdown');
    await expect(controls).toHaveAttribute('data-mode', 'aiming');
    const fire = page.getByTestId('btn-fire');
    await fire.dispatchEvent('pointerdown');
    await fire.dispatchEvent('pointerup');
    await expect.poll(async () => {
      if (await page.getByTestId('shopkeeper-question').isVisible()) await page.getByTestId('shopq-choice-A').click();
      return await page.getByTestId('result-score').isVisible() || await controls.getAttribute('data-mode', { timeout: 100 }).catch(() => '') === 'position';
    }, { timeout: 30_000 }).toBe(true);
  }
  await expect(page.getByTestId('result-score')).toBeVisible();
  const snapshot = await context.storageState({ indexedDB: true });
  for (const locale of LOCALES) {
    const next = await browser.newContext({ viewport: page.viewportSize(), isMobile: true, hasTouch: true, storageState: snapshot });
    try {
      await next.addInitScript(locale => {
        localStorage.setItem('shatekki.settings.v1', JSON.stringify({ schemaVersion: 1, audio: { enabled: false, volume: 0 }, language: locale, savedAt: new Date().toISOString() }));
        localStorage.setItem('shatekki.language.v1', locale);
        window.open = () => null;
        Object.defineProperty(navigator, 'clipboard', { value: undefined });
      }, locale);
      const result = await next.newPage();
      await result.goto(candidateUrl + '/');
      await expect(result.locator('#app')).toHaveAttribute('data-rules-version', 'rules-v2-proposed-r006');
      await expect(result.locator('html')).toHaveAttribute('lang', locale);
      await expect(result.getByTestId('result-score')).toBeVisible();
      await expect(result.getByTestId('result-last-shot')).toContainText(translate(locale, 'result.end.noAmmo'));
      await expect(result.getByTestId('result-ranking')).toBeHidden();
      await result.getByTestId('result-share').click();
      const copy = result.locator('textarea');
      await expect(copy).toBeVisible();
      expect(await copy.inputValue()).toContain('https://chameleonjp-lab.github.io/shatekki/');
      expect(await copy.inputValue()).not.toMatch(/\{\w+\}/);
      await result.getByTestId('result-retry').click();
      await expect(result.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
    } finally {
      await next.close();
    }
  }
});
