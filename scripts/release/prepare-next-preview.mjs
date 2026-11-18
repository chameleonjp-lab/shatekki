// Prepare an artifact locally; the workflow owns the separate publication decision.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { build, preview } from 'vite';

const output = process.argv[2];
const mode = process.argv[3] ?? 'prepare';
if (!output || !['prepare', 'withdraw'].includes(mode)) throw Error('Usage: node scripts/release/prepare-next-preview.mjs NEW_DIRECTORY [prepare|withdraw]');
const commit = (await promisify(execFile)('git', ['rev-parse', 'HEAD'])).stdout.trim();
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
    await writeFile(join(candidate, 'version.json'), JSON.stringify({ rulesVersion, bundle: 'expanded-next', commit }));
    const index = join(candidate, 'index.html');
    await cp(new URL('./preview-frame-meter.js', import.meta.url), join(candidate, 'preview-frame-meter.js'));
    const html = await readFile(index, 'utf8');
    assert.ok(html.includes('</body>'));
    await writeFile(index, html.replace('</head>', `<meta name="preview-commit" content="${commit}"></head>`).replace('</body>', '<script type="module" src="./preview-frame-meter.js"></script></body>'));
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
  async function start() {
    await page.getByTestId('home-start').click();
    await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'position', { timeout: 20_000 });
  }
  await open('/shatekki/', 'rules-v1');
  await start();
  await expect(page.getByTestId('booth-map')).toHaveCount(0);
  if (mode !== 'withdraw') {
    const fixturePage = await browser.newPage({ viewport: { width: 402, height: 700 } });
    await fixturePage.goto(origin + legacyPath);
    await fixturePage.getByTestId('home-start').click();
    await expect(fixturePage.getByTestId('controls')).toHaveAttribute('data-mode', 'position');
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
    assert.equal(report.rules, rulesVersion);
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
