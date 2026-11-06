import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// EG10 browser record for the internal prototype build (36 prizes, 36 cells,
// overview, outlines/hints overlay). Headless Chromium renders WebGL in
// software (SwiftShader), so these are lower bounds on a server CPU, NOT
// iPhone results. The assertion only guards against a stalled loop; the
// target (smooth 60 fps, at least 30 fps) needs a real iPhone.

test.use({ baseURL: 'http://127.0.0.1:4174' });

test('frame intervals and scene size during an expanded shot', async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.goto('/?e2e=1');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  const mode = page.getByTestId('controls');
  await expect(mode).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  await page.getByTestId('btn-confirm-position').click();
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(mode).toHaveAttribute('data-mode', 'aiming');
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    let last = performance.now();
    const loop = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__frames.length < 120) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
  await page.waitForFunction(() => (window as unknown as { __frames: number[] }).__frames.length >= 120, null, { timeout: 90_000 });
  const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(5));
  const stats = await page.evaluate(() => (window as unknown as { __shatekki: { stats(): unknown } }).__shatekki.stats());
  const sorted = [...frames].sort((a, b) => a - b);
  const q = (p: number) => +sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!.toFixed(1);
  const report = { note: 'internal prototype build; headless Chromium + SwiftShader; not an iPhone measurement', frameMs: { p50: q(0.5), p95: q(0.95), max: q(1) }, scene: stats };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/expanded-performance-browser-${info.project.name}.json`, JSON.stringify(report, null, 2));
  expect(q(0.5)).toBeLessThan(250); // only catches a stalled loop
});
