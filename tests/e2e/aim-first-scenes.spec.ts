import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { restoreShotStart } from '../helpers/outcome-checkpoint';
import { readRecordedRun } from '../helpers/read-recorded-run';
import { SETS, aimAndFire, expectCardClear, scene, settle } from '../helpers/aim-first-play';

// T02/T03/T19 in the browser: a prepared start (shelf and earlier wins only, from
// tests/fixtures/r007/scenarios.json.gz, checked by tests/integration/aim-first-scenarios.test.ts),
// then the player's own drag to aim, "撃つ" and "発射". Flight, scoring, sets, saving and the
// card all run as in a real game. Chromium with phone-sized viewports, not Safari, not a device.
test.use({ baseURL: 'http://127.0.0.1:4180', screenshot: 'only-on-failure' });

async function shot(page: Page, info: TestInfo, name: string) {
  if (process.env.SHATEKKI_EVIDENCE !== '1') return;
  mkdirSync('test-results/aim-first', { recursive: true });
  await page.screenshot({ path: `test-results/aim-first/${info.project.name}-${name}.png` });
}

for (const name of ['pair-first', 'pair-again', 'trio-first', 'pair-and-trio', 'last-cork-set'] as const) {
  test(`T02 set card from a real shot: ${name}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const sc = scene(name);
    await page.clock.install();
  await restoreShotStart(page, { beforeFire: sc.state, gameTick: 0 }, sc.discovered);
    await aimAndFire(page, sc);
    const card = page.getByTestId('shot-card');
    await expect(card).toHaveAttribute('data-kind', 'set', { timeout: 30_000 });
    if (name === 'pair-and-trio') {
      await expect(page.locator('.shot-festival-border')).toHaveAttribute('data-tier', '4');
    }
    await expectCardClear(page);
    await shot(page, info, `scene-${name}`);
    const record = await readRecordedRun(page);
    const summary = record.lastSummary!;
    expect([...summary.newlyCompletedSets].sort()).toEqual([...sc.expect.sets!].sort());
    for (const id of sc.expect.sets!) {
      const row = card.locator(`[data-set="${id}"]`);
      await expect(row).toBeVisible();
      // each member's picture, the set's own points and the first-discovery seal only when new
      expect(await row.locator('.rwd-portrait').evaluateAll((l) => l.map((e) => (e as HTMLElement).dataset.prize))).toEqual(SETS.get(id));
      const points = summary.ledger.items.find((i) => i.kind === 'set' && i.refId === id)!.points;
      await expect(row.locator('.af-card-set-points')).toContainText(String(points));
      await expect(row.locator('.af-card-seal')).toHaveCount(record.lastFreshSets.includes(id) ? 1 : 0);
    }
    await expect(card.locator('.af-card-total')).toContainText(String(summary.ledger.scoreAfter));
    expect(record.lastFreshSets).toEqual(sc.expect.sets!.filter((id) => !sc.discovered.includes(id)));
    if (summary.bonusAmmoGranted > 0) await expect(card.getByTestId('shot-card-ammo')).toContainText(`+${summary.bonusAmmoGranted}`);
    if (sc.expect.continues) {
      await settle(page);
      expect(summary.runEnded).toBe(false);
      await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
    }
    // a reload shows the same confirmed result quietly and never adds it twice
    const before = (await readRecordedRun(page)).state;
    await page.reload();
    await page.getByTestId('btn-resume-run').click();
    const after = (await readRecordedRun(page)).state;
    expect(after.score).toBe(before.score);
    expect(after.completedSets).toEqual(before.completedSets);
    expect(after.ammo).toBe(before.ammo);
  });
}

for (const name of ['fan-take', 'tray-take'] as const) {
  test(`T03 reflection take from a real shot: ${name}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const sc = scene(name);
    await page.clock.install();
  await restoreShotStart(page, { beforeFire: sc.state, gameTick: 0 }, sc.discovered);
    await shot(page, info, `scene-${name}-aim`);
    await aimAndFire(page, sc);
    await settle(page);
    await expect(page.getByTestId('shot-card')).toBeVisible();
    await expectCardClear(page);
    await shot(page, info, `scene-${name}-card`);
    const summary = (await readRecordedRun(page)).lastSummary!;
    expect(summary.collected.length).toBeGreaterThanOrEqual(1);
    expect(summary.ledger.items.some((i) => i.kind === 'trick')).toBe(true); // the existing reflection-take points
    if (name === 'fan-take') {
      expect(summary.touchedFirstHitTargets).toEqual(['shopkeeper:fan']);
      expect(summary.ledger.items).toContainEqual({ kind: 'shopkeeper', refId: 'fan', points: 20 });
    } else {
      // the tray alone: no shopkeeper points, no part and no question
      expect(summary.touchedFirstHitTargets).toEqual([]);
      expect(summary.ledger.items.filter((i) => i.kind === 'shopkeeper')).toEqual([]);
    }
  });
}

// T06: frame intervals while aiming (36 prizes, 100 cells, the shopkeeper) and while the cork
// flies and the shelf settles. Headless Chromium draws with a software GPU, so these numbers are a
// record for comparison between builds, not a measurement of an iPhone. Nothing here changes
// physics, scores or saves: the page is only observed.
test('T06 frame intervals while aiming and during a real shot (recorded, not a device result)', async ({ page }, info) => {
  test.setTimeout(120_000);
  const sc = scene('fan-take');
  await page.clock.install();
  await restoreShotStart(page, { beforeFire: sc.state, gameTick: 0 }, sc.discovered);
  const sample = (ms: number) =>
    page.evaluate(
      (dur) =>
        new Promise<number[]>((done) => {
          const out: number[] = [];
          let last = performance.now();
          const end = last + dur;
          const step = (t: number) => {
            out.push(t - last);
            last = t;
            if (t < end) requestAnimationFrame(step);
            else done(out);
          };
          requestAnimationFrame(step);
        }),
      ms,
    );
  const stats = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    const q = (p: number) => +(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0).toFixed(1);
    return { frames: xs.length, medianMs: q(0.5), p95Ms: q(0.95), worstMs: q(1), over33ms: xs.filter((x) => x > 33.4).length };
  };
  const aiming = stats(await sample(2000));
  await aimAndFire(page, sc);
  const flying = stats(await sample(2500));
  await settle(page);
  const result = { project: info.project.name, viewport: page.viewportSize(), aiming, flying, note: 'headless Chromium (software rendering); not Safari, not a device' };
  mkdirSync('test-results/aim-first', { recursive: true });
  writeFileSync(`test-results/aim-first/perf-${info.project.name}.json`, JSON.stringify(result, null, 2));
  expect(aiming.frames).toBeGreaterThan(10);
  expect(flying.frames).toBeGreaterThan(10);
  // the shot still settled to the same confirmed result as without the measurement
  expect((await readRecordedRun(page)).lastSummary!.touchedFirstHitTargets).toEqual(['shopkeeper:fan']);
});
