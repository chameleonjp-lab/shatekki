import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { planChanges } from '../../scripts/ci/plan.mjs';

const planner = fileURLToPath(new URL('../../scripts/ci/plan.mjs', import.meta.url));
const none = { scope: 'docs', unit: [], integration: [], e2e: [], node: false, build: false, browser: false };

function withoutReasons(plan) {
  assert.ok(Array.isArray(plan.reasons));
  assert.ok(plan.reasons.length > 0);
  const { reasons, ...result } = plan;
  return result;
}

function assertFull(plan) {
  assert.deepEqual(withoutReasons(plan), {
    scope: 'full', unit: 'all', integration: 'all', e2e: 'all', node: true, build: true, browser: true,
  });
}

test('documentation-only changes skip dependency installation, builds and test jobs', () => {
  assert.deepEqual(withoutReasons(planChanges(['README.md', 'CLAUDE.md', 'AGENTS.md', 'docs/guide.md', 'docs/nested/help.md'])), none);
  assert.deepEqual(withoutReasons(planChanges([])), none);
});

for (const path of ['docs/prize-candidates.md', 'docs/set-candidates.md']) {
  test(`catalog data ${path} runs every check even alongside ordinary documentation`, () => {
    assertFull(planChanges(['README.md', path]));
  });
}

const sourceCases = [
  ['src/ranking/client.ts', {
    unit: ['tests/unit/share.test.ts'],
    integration: ['tests/integration/ranking.test.ts', 'tests/integration/screens.test.ts', 'tests/integration/security.test.ts'],
    e2e: [], browser: false,
  }],
  ['src/i18n/locales/ja.ts', {
    unit: ['tests/unit/controls-model.test.ts', 'tests/unit/i18n-content.test.ts', 'tests/unit/i18n.test.ts', 'tests/unit/share.test.ts'],
    integration: ['tests/integration/screens.test.ts', 'tests/integration/security.test.ts'],
    e2e: ['tests/e2e/long-text.spec.ts', 'tests/e2e/screens.spec.ts'], browser: true,
  }],
  ['src/ui/controls/controls.css', {
    unit: ['tests/unit/controls-model.test.ts', 'tests/unit/i18n.test.ts', 'tests/unit/share.test.ts'],
    integration: ['tests/integration/screens.test.ts', 'tests/integration/security.test.ts'],
    e2e: ['tests/e2e/long-text.spec.ts', 'tests/e2e/screens.spec.ts', 'tests/e2e/shot-smoke.spec.ts', 'tests/e2e/smoke.spec.ts'], browser: true,
  }],
  ['src/audio/engine.ts', {
    unit: ['tests/unit/audio.test.ts'], integration: ['tests/integration/screens.test.ts', 'tests/integration/security.test.ts'],
    e2e: ['tests/e2e/screens.spec.ts'], browser: true,
  }],
];

for (const [path, selection] of sourceCases) {
  test(`${path} selects its related checks and still builds/typechecks`, () => {
    assert.deepEqual(withoutReasons(planChanges([path])), { scope: 'targeted', ...selection, node: true, build: true });
  });
}

test('mixed safe changes union their selections without duplicates and retain docs', () => {
  assert.deepEqual(withoutReasons(planChanges(['docs/notes.md', 'src/audio/engine.ts', 'src/i18n/index.ts', 'src/audio/index.ts'])), {
    scope: 'targeted',
    unit: ['tests/unit/audio.test.ts', 'tests/unit/controls-model.test.ts', 'tests/unit/i18n-content.test.ts', 'tests/unit/i18n.test.ts', 'tests/unit/share.test.ts'],
    integration: ['tests/integration/screens.test.ts', 'tests/integration/security.test.ts'],
    e2e: ['tests/e2e/long-text.spec.ts', 'tests/e2e/screens.spec.ts'],
    node: true, build: true, browser: true,
  });
});

test('test-only changes select exactly those tests and build/typecheck their TypeScript', () => {
  assert.deepEqual(withoutReasons(planChanges(['tests/unit/audio.test.ts', 'tests/integration/ranking.test.ts', 'tests/e2e/reload.spec.ts'])), {
    scope: 'targeted', unit: ['tests/unit/audio.test.ts'], integration: ['tests/integration/ranking.test.ts'],
    e2e: ['tests/e2e/reload.spec.ts'], node: true, build: true, browser: true,
  });
  const unitOnly = planChanges(['tests/unit/audio.test.ts']);
  assert.equal(unitOnly.browser, false);
  assert.deepEqual(unitOnly.integration, []);
  assert.deepEqual(unitOnly.e2e, []);
});

test('browser-test-only changes build/typecheck without scheduling an empty Node test job', () => {
  assert.deepEqual(withoutReasons(planChanges(['README.md', 'tests/e2e/reload.spec.ts'])), {
    scope: 'targeted', unit: [], integration: [], e2e: ['tests/e2e/reload.spec.ts'],
    node: false, build: true, browser: true,
  });
});

for (const path of [
  'src/core/loop.ts', 'src/sim/world.ts', 'src/catalog/config.ts', 'src/contracts/index.ts', 'src/app/main.ts',
  'src/persistence/storage.ts', 'src/view/render.ts', 'data/catalog.json', 'package.json', 'package-lock.json',
  'vite.config.ts', 'vitest.config.ts', 'tsconfig.json', '.github/workflows/ci.yml', 'scripts/ci/plan.mjs',
  'scripts/run-vitest.mjs', 'tests/unit/helpers.ts', 'tests/integration/fake-storage.ts', 'tests/e2e/helpers.ts',
  'src/new-feature/index.ts', 'src/ranking/nested/helper.ts', 'src/ranking/config.json', 'notes.txt',
  'tests/unit/../integration/ranking.test.ts', 'src/ui/../../core/world.ts', 'src/ui/home.ts\n', '',
]) {
  test(`unknown or shared path ${JSON.stringify(path)} falls back to every check`, () => {
    assertFull(planChanges(['README.md', 'src/audio/index.ts', path]));
  });
}

test('old and new paths of a rename cannot hide a risky old source', () => {
  assertFull(planChanges(['src/core/old.ts', 'src/ui/new.ts']));
});

test('forceFull overrides docs and safe selections', () => {
  assertFull(planChanges(['README.md'], { forceFull: true }));
  assertFull(planChanges(['src/ranking/client.ts'], { forceFull: true }));
});

test('unavailable changed-path input cannot silently skip checks', () => {
  assertFull(planChanges(undefined));
  assertFull(planChanges('README.md'));
  assertFull(planChanges([null]));
});

function repository(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'shatekki-ci-plan-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  function git(...args) {
    const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  }
  function write(path, content = 'fixture\n') {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), content);
  }
  function commit() {
    git('add', '-A');
    git('-c', 'user.name=CI test', '-c', 'user.email=ci@example.invalid', 'commit', '-qm', 'fixture');
    return git('rev-parse', 'HEAD');
  }
  git('init', '-q');
  write('README.md');
  return { cwd, git, write, commit };
}

function runPlan(repo, args) {
  const output = join(repo.cwd, '.git', 'ci-output');
  const summary = join(repo.cwd, '.git', 'ci-summary');
  writeFileSync(output, '');
  writeFileSync(summary, '');
  const result = spawnSync(process.execPath, [planner, ...args], {
    cwd: repo.cwd, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
  });
  assert.equal(result.status, 0, result.stderr);
  const outputs = Object.fromEntries(readFileSync(output, 'utf8').trim().split('\n').map((line) => {
    const equals = line.indexOf('=');
    return [line.slice(0, equals), line.slice(equals + 1)];
  }));
  const plan = JSON.parse(outputs.plan);
  for (const key of ['node', 'build', 'browser']) assert.equal(outputs[key], String(plan[key]));
  assert.match(readFileSync(summary, 'utf8'), new RegExp(plan.scope));
  return plan;
}

test('CLI emits a compact plan from the exact base/head diff', (t) => {
  const repo = repository(t);
  const base = repo.commit();
  repo.write('src/ranking/client.ts');
  const head = repo.commit();
  assert.deepEqual(withoutReasons(runPlan(repo, ['--base', base, '--head', head])), {
    scope: 'targeted', ...sourceCases[0][1], node: true, build: true,
  });
  assertFull(runPlan(repo, ['--base', base, '--head', head, '--full']));
});

test('CLI keeps modified and removed catalog markdown in the full-check scope', (t) => {
  const repo = repository(t);
  repo.write('docs/prize-candidates.md');
  repo.write('docs/set-candidates.md');
  const base = repo.commit();
  repo.write('docs/prize-candidates.md', '| P001 | Changed prize name |\n');
  const edited = repo.commit();
  assertFull(runPlan(repo, ['--base', base, '--head', edited]));
  repo.git('rm', 'docs/prize-candidates.md', 'docs/set-candidates.md');
  const removed = repo.commit();
  assertFull(runPlan(repo, ['--base', edited, '--head', removed]));
});

test('CLI browser-test-only output skips Node tests but still requires a build', (t) => {
  const repo = repository(t);
  const base = repo.commit();
  repo.write('tests/e2e/screens.spec.ts');
  const head = repo.commit();
  const plan = runPlan(repo, ['--base', base, '--head', head]);
  assert.equal(plan.node, false);
  assert.equal(plan.build, true);
  assert.equal(plan.browser, true);
});

test('CLI falls back to full when refs are absent, zero, malformed, or unavailable', (t) => {
  const repo = repository(t);
  const head = repo.commit();
  for (const args of [[], ['--head', head], ['--base', '0'.repeat(40), '--head', head],
    ['--base', 'HEAD;touch exploited', '--head', head], ['--base', 'HEAD', '--head', head],
    ['--base', 'f'.repeat(40), '--head', head], ['--base', head, '--head', head, '--unexpected']]) {
    assertFull(runPlan(repo, args));
  }
});

test('CLI rejects valid object SHAs that do not identify commits', (t) => {
  const repo = repository(t);
  const head = repo.commit();
  const blob = repo.git('rev-parse', 'HEAD:README.md');
  const tree = repo.git('rev-parse', 'HEAD^{tree}');
  assertFull(runPlan(repo, ['--base', blob, '--head', blob]));
  assertFull(runPlan(repo, ['--base', tree, '--head', tree]));
  assertFull(runPlan(repo, ['--base', head, '--head', tree]));
});

test('CLI detects a removed test in the head tree and falls back to full', (t) => {
  const repo = repository(t);
  repo.write('tests/unit/audio.test.ts');
  const base = repo.commit();
  repo.git('rm', 'tests/unit/audio.test.ts');
  const head = repo.commit();
  assertFull(runPlan(repo, ['--base', base, '--head', head]));
});

test('CLI uses the head tree rather than worktree existence for changed tests', (t) => {
  const repo = repository(t);
  const base = repo.commit();
  repo.write('tests/unit/audio.test.ts');
  const head = repo.commit();
  rmSync(join(repo.cwd, 'tests/unit/audio.test.ts'));
  assert.deepEqual(runPlan(repo, ['--base', base, '--head', head]).unit, ['tests/unit/audio.test.ts']);
});

test('CLI keeps both sides of a rename and allows removed documentation', (t) => {
  const repo = repository(t);
  repo.write('src/core/old.ts');
  const base = repo.commit();
  mkdirSync(join(repo.cwd, 'src/ui'), { recursive: true });
  repo.git('mv', 'src/core/old.ts', 'src/ui/new.ts');
  const head = repo.commit();
  assertFull(runPlan(repo, ['--base', base, '--head', head]));
  repo.git('rm', 'README.md');
  const docsHead = repo.commit();
  assert.deepEqual(withoutReasons(runPlan(repo, ['--base', head, '--head', docsHead])), none);
});
