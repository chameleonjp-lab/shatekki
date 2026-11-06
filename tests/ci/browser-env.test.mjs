// The browser job must not download a browser or system fonts while it runs: on 2026-11-06 the
// apt font download alone took 9 min 7 s and the 10-minute job limit cancelled the tests
// (run 42260041719). It runs inside the Playwright image of the lockfile's exact version instead.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url), 'utf8'));

/** The text of one top-level job, from its `  name:` line to the next job at the same indent. */
function jobBlock(name) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((line) => line === `  ${name}:`);
  assert.ok(start >= 0, `job ${name} exists`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ {2}[\w-]+:\s*$/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

const browser = jobBlock('browser');
const playwrightVersion = lock.packages['node_modules/@playwright/test'].version;

test('the lockfile pins one Playwright version for the runner and the browser build', () => {
  assert.match(playwrightVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(lock.packages['node_modules/playwright'].version, playwrightVersion);
  assert.equal(lock.packages['node_modules/playwright-core'].version, playwrightVersion);
});

test('browser tests run in the Playwright image of exactly the lockfile version', () => {
  const image = /^\s+image:\s*(\S+)\s*$/m.exec(browser)?.[1];
  assert.equal(image, `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`);
});

test('no job downloads a browser or its system packages while CI runs', () => {
  assert.doesNotMatch(workflow, /playwright\s+install/);
  assert.doesNotMatch(workflow, /apt(?:-get)?\s+install/);
});

test('the browser job checks its fonts and version before the tests, with separate time limits', () => {
  const steps = browser.split(/\n {6}- /).slice(1);
  const check = steps.findIndex((step) => /dpkg-query/.test(step));
  const run = steps.findIndex((step) => /run-tests\.mjs e2e/.test(step));
  assert.ok(check >= 0 && run > check, 'environment check runs before the browser tests');
  for (const pkg of ['fonts-ipafont-gothic', 'fonts-wqy-zenhei', 'fonts-tlwg-loma-otf']) {
    assert.match(steps[check], new RegExp(pkg), `${pkg} (Japanese, Chinese, Thai text) is checked`);
  }
  assert.match(steps[check], /playwright --version/);
  const limit = (step) => Number(/timeout-minutes:\s*(\d+)/.exec(step)?.[1]);
  assert.ok(limit(steps[check]) > 0 && limit(steps[check]) <= 3, 'the environment check has its own short limit');
  assert.ok(limit(steps[run]) >= 10, 'the tests keep at least the earlier 10 minutes for themselves');
  const job = Number(/^ {4}timeout-minutes:\s*(\d+)/m.exec(browser)?.[1]);
  assert.ok(job > limit(steps[run]), 'the job limit leaves room for setup beyond the test step');
});
