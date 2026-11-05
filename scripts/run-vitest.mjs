#!/usr/bin/env node
// Runs one Vitest project and fails unless at least one test passed and no
// test was skipped / marked todo. Plan rule: "テスト0件・skipのみを合格にしない".
// Usage: node scripts/run-vitest.mjs <unit|integration> [extra vitest args / file filters]
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const [project, ...rest] = process.argv.slice(2);
if (!project) {
  console.error('usage: run-vitest.mjs <project> [...args]');
  process.exit(2);
}
mkdirSync('test-results', { recursive: true });
const out = `test-results/vitest-${project}.json`;
const args = ['vitest', 'run', '--project', project, '--reporter=default', '--reporter=json', `--outputFile.json=${out}`, ...rest];
const res = spawnSync('npx', args, { stdio: 'inherit', shell: false });
if (res.status !== 0) process.exit(res.status ?? 1);

const report = JSON.parse(readFileSync(out, 'utf8'));
const passed = report.numPassedTests ?? 0;
const pending = (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0);
const failed = report.numFailedTests ?? 0;
console.log(`[run-vitest] project=${project} passed=${passed} failed=${failed} skipped/todo=${pending}`);
if (failed > 0) process.exit(1);
if (passed === 0) {
  console.error('[run-vitest] FAIL: zero passing tests is not a pass.');
  process.exit(1);
}
if (pending > 0) {
  console.error('[run-vitest] FAIL: skipped or todo tests are not allowed.');
  process.exit(1);
}
