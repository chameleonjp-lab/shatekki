import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { evaluateGate } from '../../scripts/ci/gate.mjs';

const gate = fileURLToPath(new URL('../../scripts/ci/gate.mjs', import.meta.url));
const docs = {
  PLAN_RESULT: 'success', NODE_REQUIRED: 'false', BUILD_REQUIRED: 'false', BROWSER_REQUIRED: 'false',
  NODE_RESULT: 'skipped', BUILD_RESULT: 'skipped', BROWSER_RESULT: 'skipped',
};
const full = {
  PLAN_RESULT: 'success', NODE_REQUIRED: 'true', BUILD_REQUIRED: 'true', BROWSER_REQUIRED: 'true',
  NODE_RESULT: 'success', BUILD_RESULT: 'success', BROWSER_RESULT: 'success',
};

test('documentation changes pass only with the planned deliberate skips', () => {
  assert.equal(evaluateGate(docs), true);
});

test('full changes pass when every required job succeeds', () => {
  assert.equal(evaluateGate(full), true);
});

test('a targeted plan accepts the exact combination of successes and skips', () => {
  assert.equal(evaluateGate({ ...full, BROWSER_REQUIRED: 'false', BROWSER_RESULT: 'skipped' }), true);
});

for (const project of ['NODE', 'BUILD', 'BROWSER']) {
  for (const result of ['failure', 'cancelled', 'skipped', '', undefined]) {
    test(`${project} required job cannot pass with ${JSON.stringify(result)}`, () => {
      assert.throws(() => evaluateGate({ ...full, [`${project}_RESULT`]: result }), new RegExp(project, 'i'));
    });
  }
  for (const result of ['success', 'failure', 'cancelled', '', undefined]) {
    test(`${project} unneeded job must report an intentional skip, not ${JSON.stringify(result)}`, () => {
      assert.throws(() => evaluateGate({ ...docs, [`${project}_RESULT`]: result }), new RegExp(project, 'i'));
    });
  }
  for (const required of ['', undefined, 'yes', 'TRUE', true, false]) {
    test(`${project} missing or invalid requirement ${JSON.stringify(required)} fails closed`, () => {
      assert.throws(() => evaluateGate({ ...docs, [`${project}_REQUIRED`]: required }), new RegExp(project, 'i'));
    });
  }
}

for (const result of ['failure', 'cancelled', 'skipped', '', undefined]) {
  test(`planning result ${JSON.stringify(result)} cannot pass the gate`, () => {
    assert.throws(() => evaluateGate({ ...docs, PLAN_RESULT: result }), /plan/i);
  });
}

test('CLI reports success and exits nonzero for a missing required job', () => {
  const success = spawnSync(process.execPath, [gate], { encoding: 'utf8', env: { ...process.env, ...docs } });
  assert.equal(success.status, 0, success.stderr);
  assert.match(success.stdout, /passed/i);
  const failure = spawnSync(process.execPath, [gate], {
    encoding: 'utf8', env: { ...process.env, ...full, BUILD_RESULT: 'skipped' },
  });
  assert.notEqual(failure.status, 0);
  assert.match(failure.stderr, /build/i);
});
