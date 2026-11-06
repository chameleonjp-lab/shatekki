import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

// AC40 browser record. Headless Chromium here renders WebGL in software
// (SwiftShader), so the numbers are a lower bound on a server CPU and are NOT
// iPhone results. The assertion only guards against stalls; the iPhone target
// (smooth 60 fps, acceptable ≥ 30 fps) is checked on a real device (Task 17/18).

test('frame intervals and scene size during a shot', async ({ page }, info) => {
  // Software WebGL on shared CI runners can be slow; this test records numbers and must not time out.
  test.setTimeout(120_000);
  await page.goto('/?e2e=1');
  await page.getByTestId('home-start').click();
  const mode = page.getByTestId('controls');
  await expect(mode).toHaveAttribute('data-mode', 'position');
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
  const report = { note: 'headless Chromium + SwiftShader; not an iPhone measurement', frameMs: { p50: q(0.5), p95: q(0.95), max: q(1) }, scene: stats };
  mkdirSync('test-results', { recursive: true });
  writeFileSync(`test-results/performance-browser-${info.project.name}.json`, JSON.stringify(report, null, 2));
  expect(q(0.5)).toBeLessThan(250); // only catches a stalled loop
});
