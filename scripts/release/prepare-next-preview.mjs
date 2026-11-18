// Prepare an artifact locally; the workflow owns the separate publication decision.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect } from '@playwright/test';
import { build, preview } from 'vite';
import { recordStressSettlement } from './record-stress-settlement.mjs';

const output = process.argv[2];
const mode = process.argv[3] ?? 'prepare';
if (!output || !['prepare', 'withdraw'].includes(mode)) throw Error('Usage: node scripts/release/prepare-next-preview.mjs NEW_DIRECTORY [prepare|withdraw]');
const commit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
const workingTreeModified = (await promisify(execFile)('git', ['status', '--porcelain'])).stdout.length > 0;
const rulesVersion = 'rules-v2-proposed-r006';
const candidatePath = '/shatekki/preview/' + rulesVersion + '/';
const temporary = await mkdtemp(join(tmpdir(), 'shatekki-preview-'));
const site = join(temporary, 'shatekki');
const candidate = join(temporary, candidatePath.slice(1));
const legacyPath = '/legacy-test/';
const legacyKey = 'shatekki.run.rules-v2-proposed-r003';
let browser, server;

async function bundle(key, base, destination) {
  await build({ base, define: { 'import.meta.env.VITE_SHATEKKI_BUNDLE': JSON.stringify(key),
      'import.meta.env.VITE_SHATEKKI_PREVIEW_METER': JSON.stringify(key === 'expanded-next' ? '1' : '') },
    build: { outDir: destination, emptyOutDir: false } });
}

try {
  await bundle('official-v1', '/shatekki/', site);
  if (mode !== 'withdraw') {
    await bundle('expanded-next', candidatePath, candidate);
    await bundle('expanded-full', legacyPath, join(temporary, legacyPath.slice(1)));
    const stressRoot = fileURLToPath(new URL('./stress/', import.meta.url));
    // Separate entry and bundle. The game builds above always use the normal muzzle pattern.
    await build({ configFile: false, root: stressRoot, base: candidatePath + 'stress/',
      resolve: { alias: [{ find: /^\.\/launch-angles$/, replacement: join(stressRoot, 'launch-angles.js') }] },
      define: { __PREVIEW_COMMIT__: JSON.stringify(commit), __PREVIEW_MODIFIED__: JSON.stringify(workingTreeModified) },
      build: { target: 'es2022', chunkSizeWarningLimit: 4096, outDir: join(candidate, 'stress'), emptyOutDir: false } });
    await writeFile(join(candidate, 'stress', 'confirmed-shot.json'), JSON.stringify(await recordStressSettlement()));
    await writeFile(join(candidate, 'version.json'), JSON.stringify({ rulesVersion, bundle: 'expanded-next', commit, workingTreeModified }));
    const index = join(candidate, 'index.html');
    for (const file of ['preview-intervals.js', 'preview-frame-meter.js']) {
      await cp(new URL(file, import.meta.url), join(candidate, file));
    }
    const html = await readFile(index, 'utf8');
    assert.ok(html.includes('</body>'));
    const source = `<meta name="preview-commit" content="${commit}"><meta name="preview-modified" content="${workingTreeModified}">`;
    await writeFile(index, html.replace('</head>', source + '</head>').replace('</body>', '<script type="module" src="./preview-frame-meter.js"></script></body>'));
    await cp(new URL('./record-check.html', import.meta.url), join(candidate, 'record-check.html'));
  }

  server = await preview({ configFile: false, base: '/', build: { outDir: temporary },
    preview: { host: '127.0.0.1', port: 0, open: false } });
  const origin = 'http://127.0.0.1:' + server.httpServer.address().port;
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 402, height: 700 }, isMobile: true, hasTouch: true });
  const failedAssets = [];
  page.on('requestfailed', r => { if (r.failure()?.errorText !== 'net::ERR_ABORTED') failedAssets.push(r.url()); });
  page.on('response', r => { if (r.status() >= 400) failedAssets.push(r.url()); });
  async function open(path, version) {
    await page.goto(origin + path);
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version', version);
    await page.reload();
    await expect(page.locator('#app')).toHaveAttribute('data-rules-version', version);
  }
  async function start(target = page) {
    await target.getByTestId('home-start').click();
    await expect(target.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  }
  await open('/shatekki/?measure=1', 'rules-v1');
  await expect(page.getByRole('button', { name: '計測結果' })).toHaveCount(0);
  await start();
  await expect(page.getByTestId('booth-map')).toHaveCount(0);
  if (mode !== 'withdraw') {
    const fixturePage = await browser.newPage({ viewport: { width: 402, height: 700 } });
    await fixturePage.goto(origin + legacyPath);
    await start(fixturePage);
    const raw = await fixturePage.evaluate(key => localStorage.getItem(key), legacyKey);
    assert.equal(JSON.parse(raw).checkpoint.state.rulesVersion, 'rules-v2-proposed-r003');
    await writeFile(join(candidate, 'r003-fixture.json'), raw);
    await fixturePage.close();

    await page.goto(origin + candidatePath + 'record-check.html');
    await page.locator('#prepare').click();
    await expect(page.locator('output')).toContainText('控えを作成しました');
    await open(candidatePath + '?measure=1', rulesVersion);
    await page.getByRole('button', { name: '計測結果' }).click();
    const report = JSON.parse(await page.getByRole('dialog').locator('textarea').inputValue());
    assert.equal(report.commit, commit);
    assert.equal(report.workingTreeModified, workingTreeModified);
    assert.equal(report.rules, rulesVersion);
    assert.equal(report.mode, '通常プレイ');
    const stress = page.getByRole('link', { name: 'コルク8個の負荷試験を別タブで開く' });
    assert.equal(await stress.getAttribute('target'), '_blank');
    const stressUrl = await stress.evaluate(link => link.href);
    const settlementUrl = await page.getByRole('link', { name: '精算直後の再現試験を別タブで開く' }).evaluate(link => link.href);
    await page.getByRole('dialog').getByRole('button', { name: '閉じる' }).click();
    await start();
    await expect(page.locator('.bm-tile')).toHaveCount(36);
    await page.getByTestId('btn-confirm-position').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
    await page.getByTestId('btn-load').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
    await page.getByTestId('btn-fire').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'resolving');
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 30_000 });

    await page.goto(origin + candidatePath + 'record-check.html');
    await page.locator('#compare').click();
    await expect(page.locator('output')).toContainText('一致　' + legacyKey);
    await expect(page.locator('output')).not.toContainText('差異');
    for (const [path, version] of [[legacyPath, 'rules-v2-proposed-r003'], ['/shatekki/', 'rules-v1']]) {
      await open(path, version);
      await page.getByTestId('btn-resume-run').click();
      await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'paused');
    }
    const savedBeforeStress = await page.context().storageState({ indexedDB: true });
    async function measureFixture(url) {
      await page.goto(url);
      await page.reload();
      await page.getByRole('button', { name: '計測を開始' }).click({ timeout: 30_000 });
      await expect(page.locator('#status')).toHaveText(/計測中　[1-9]\d*\./, { timeout: 60_000 });
      await page.getByRole('button', { name: '停止して結果を見る' }).click();
      const result = JSON.parse(await page.locator('#report').inputValue());
      assert.equal(result.commit, commit);
      assert.equal(result.workingTreeModified, workingTreeModified);
      assert.equal(result.rules, rulesVersion);
      assert.ok(Object.values(result.scenes).some(scene => scene.seconds >= 1 && scene.frames >= 2));
      return result;
    }
    const stressReport = await measureFixture(stressUrl);
    assert.equal(stressReport.mode, '独立した8個の負荷試験');
    const { physicsCorks, renderedCorks, prizes, cells, outlined, maxTrailSegments } = stressReport.observed;
    assert.deepEqual([physicsCorks, renderedCorks, prizes, cells], [8, 8, 36, 36]);
    assert.ok(outlined > 0 && maxTrailSegments >= 8);
    const mapMark = page.locator('.bm-tile[data-outlined="1"]').first();
    await expect(mapMark.locator('.bm-pip')).toHaveText('◆');
    const legendColor = await page.getByTestId('exp-outline').locator('span').first().evaluate(el => getComputedStyle(el).backgroundColor);
    assert.ok((await mapMark.evaluate(el => getComputedStyle(el).boxShadow)).includes(legendColor));
    const replay = await measureFixture(settlementUrl);
    assert.equal(replay.mode, '確定した精算の演出再現');
    assert.ok(replay.repetitions >= 2);
    assert.equal(replay.observed.collected, 2);
    assert.deepEqual(replay.observed.freshSets, ['PAIR081', 'PAIR134']);
    assert.ok(replay.observed.cardRows >= 2);
    assert.deepEqual(await page.context().storageState({ indexedDB: true }), savedBeforeStress);
  }
  assert.deepEqual(failedAssets, []);
  // Only the verified site subtree is packaged; the legacy build never ships.
  await mkdir(resolve(output)); // Refuse to replace any existing directory.
  await cp(site, resolve(output), { recursive: true });
  console.log('Verified and prepared', mode, commit, resolve(output));
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
