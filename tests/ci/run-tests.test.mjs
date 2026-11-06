import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as runnerModule from '../../scripts/ci/run-tests.mjs';

const { buildTestCommand, validateBrowserReport } = runnerModule;

const runner = fileURLToPath(new URL('../../scripts/ci/run-tests.mjs', import.meta.url));
const docs = { scope: 'docs', unit: [], integration: [], e2e: [], node: false, build: false, browser: false, reasons: ['Documentation only'] };
const full = { scope: 'full', unit: 'all', integration: 'all', e2e: 'all', node: true, build: true, browser: true, reasons: ['Full checks requested'] };
const targeted = { ...docs, scope: 'targeted', unit: ['tests/unit/share.test.ts'], node: true, build: true };
const browserOnly = { ...docs, scope: 'targeted', build: true, browser: true, e2e: ['tests/e2e/screens.spec.ts'] };

test('empty project selections intentionally skip without launching a test process', () => {
  assert.equal(buildTestCommand('unit', docs), null);
  assert.equal(buildTestCommand('integration', docs), null);
  assert.equal(buildTestCommand('e2e', docs), null);
  const result = spawnSync(process.execPath, [runner, 'unit'], { encoding: 'utf8', env: { ...process.env, CI_PLAN: JSON.stringify(docs) } });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /intentional.*skip/i);
});

for (const project of ['unit', 'integration']) {
  test(`all ${project} tests use the existing nonzero-test guard`, () => {
    assert.deepEqual(buildTestCommand(project, full, ['--shard=1/2']), {
      command: process.execPath, args: ['scripts/run-vitest.mjs', project, '--shard=1/2'],
    });
  });
}

test('targeted Vitest tests pass only explicit files and retain shard arguments', () => {
  const plan = { ...docs, scope: 'targeted', node: true, build: true, unit: ['tests/unit/share.test.ts', 'tests/unit/i18n.test.ts'] };
  assert.deepEqual(buildTestCommand('unit', plan, ['--shard=2/2']), {
    command: process.execPath,
    args: ['scripts/run-vitest.mjs', 'unit', 'tests/unit/share.test.ts', 'tests/unit/i18n.test.ts', '--shard=2/2'],
  });
});

test('Playwright receives selected files and additional flags', () => {
  assert.deepEqual(buildTestCommand('e2e', browserOnly, ['--list', '--shard=1/2']), {
    command: 'npx', args: ['playwright', 'test', 'tests/e2e/screens.spec.ts', '--list', '--shard=1/2'],
  });
  assert.deepEqual(buildTestCommand('e2e', full), { command: 'npx', args: ['playwright', 'test'] });
});

test('a browser-only plan intentionally skips both Node test projects', () => {
  assert.equal(buildTestCommand('unit', browserOnly), null);
  assert.equal(buildTestCommand('integration', browserOnly), null);
});

for (const value of [undefined, null, {}, { ...full, unit: 'none' }, { ...full, node: 'true' },
  { ...full, scope: 'maybe' }, { ...full, reasons: [] },
  { ...targeted, unit: ['tests/integration/ranking.test.ts'] },
  { ...targeted, unit: ['tests/unit/../unit/share.test.ts'] },
  { ...targeted, unit: ['--passWithNoTests'] }, { ...targeted, unit: ['tests/unit/share.test.ts;echo bad'] },
  { ...targeted, browser: true, e2e: ['tests/e2e/.*.spec.ts'] },
  { ...targeted, unit: ['tests/unit/share.test.ts', 'tests/unit/share.test.ts'] },
  { ...targeted, unit: ['tests/unit/share.test.ts\n'] },
  { ...targeted, build: false }, { ...targeted, browser: true },
  { ...browserOnly, node: true }, { ...browserOnly, build: false },
]) {
  test(`invalid plan ${JSON.stringify(value)} fails before invoking tests`, () => {
    assert.throws(() => buildTestCommand('unit', value), /plan/i);
  });
}

test('unsupported projects and positional extra filters fail closed', () => {
  assert.throws(() => buildTestCommand('other', full), /project/i);
  assert.throws(() => buildTestCommand('unit', full, ['tests/unit/share.test.ts']), /argument/i);
});

test('CLI rejects missing and invalid JSON plans instead of running every test', () => {
  for (const plan of ['', '{bad-json', '{}']) {
    const result = spawnSync(process.execPath, [runner, 'unit'], { encoding: 'utf8', env: { ...process.env, CI_PLAN: plan } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /plan/i);
  }
});

const passingReport = { stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 0 } };

test('a browser report passes only when tests passed without failure, skipping, or retries', () => {
  assert.equal(validateBrowserReport(passingReport), true);
});

for (const report of [undefined, null, {}, { stats: {} },
  { stats: { expected: 0, unexpected: 0, skipped: 0, flaky: 0 } },
  { stats: { expected: 2, unexpected: 1, skipped: 0, flaky: 0 } },
  { stats: { expected: 2, unexpected: 0, skipped: 1, flaky: 0 } },
  { stats: { expected: 2, unexpected: 0, skipped: 0, flaky: 1 } },
  { stats: { expected: -1, unexpected: 0, skipped: 0, flaky: 0 } },
  { stats: { expected: 1.5, unexpected: 0, skipped: 0, flaky: 0 } },
  { stats: { expected: '2', unexpected: 0, skipped: 0, flaky: 0 } },
  { stats: { expected: 2, unexpected: -1, skipped: 0, flaky: 0 } },
]) {
  test(`browser report ${JSON.stringify(report)} cannot count as a passing run`, () => {
    assert.throws(() => validateBrowserReport(report), /browser report/i);
  });
}

function browserRunner(t, report, { stale = false, list = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'shatekki-ci-browser-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const bin = join(cwd, 'bin');
  const reportPath = join(cwd, 'test-results', 'e2e-report.json');
  mkdirSync(bin);
  mkdirSync(join(cwd, 'test-results'));
  if (stale) writeFileSync(reportPath, JSON.stringify(passingReport));
  writeFileSync(join(bin, 'npx'), `#!/usr/bin/env node
const fs = require('node:fs');
const path = 'test-results/e2e-report.json';
if (!process.argv.includes('--list') && fs.existsSync(path)) {
  console.error('Stale report still exists before browser execution');
  process.exit(87);
}
if (process.env.FAKE_BROWSER_REPORT !== undefined) fs.writeFileSync(path, process.env.FAKE_BROWSER_REPORT);
`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, CI_PLAN: JSON.stringify(browserOnly) };
  delete env.FAKE_BROWSER_REPORT;
  if (report !== undefined) env.FAKE_BROWSER_REPORT = report;
  const result = spawnSync(process.execPath, [runner, 'e2e', ...(list ? ['--list'] : ['--shard=1/2'])], { cwd, env, encoding: 'utf8' });
  return { ...result, reportExists: existsSync(reportPath) };
}

test('CLI removes the exact stale browser report before accepting a freshly written passing report', (t) => {
  const result = browserRunner(t, JSON.stringify(passingReport), { stale: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.reportExists, true);
});

for (const [name, report] of [['missing', undefined], ['malformed', '{bad-json'], ['zero-test shard', '{"stats":{"expected":0,"unexpected":0,"skipped":0,"flaky":0}}']]) {
  test(`CLI fails a successful browser exit with a ${name} report, including a stale previous result`, (t) => {
    const result = browserRunner(t, report, { stale: true });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /browser report/i);
    if (report === undefined) assert.equal(result.reportExists, false);
  });
}

test('CLI --list discovery intentionally does not require an executed-test report', (t) => {
  const result = browserRunner(t, undefined, { list: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.reportExists, false);
});
