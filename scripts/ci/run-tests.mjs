#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { testPathPatterns } from './plan.mjs';

function validatePlan(plan) {
  const invalid = () => { throw new Error('Invalid CI plan: expected a complete scope and exact project test paths.'); };
  if (!plan || !['docs', 'targeted', 'full'].includes(plan.scope)) invalid();
  if (!['node', 'build', 'browser'].every((key) => typeof plan[key] === 'boolean')) invalid();
  if (!Array.isArray(plan.reasons) || !plan.reasons.length || plan.reasons.some((reason) => typeof reason !== 'string' || !reason)) invalid();
  for (const [project, pattern] of Object.entries(testPathPatterns)) {
    const files = plan[project];
    if (files !== 'all' && (!Array.isArray(files) || files.some((file) => typeof file !== 'string' || !pattern.test(file)) || new Set(files).size !== files.length)) invalid();
  }
  const projects = ['unit', 'integration', 'e2e'];
  if (plan.scope === 'full') {
    if (projects.some((key) => plan[key] !== 'all') || !plan.node || !plan.build || !plan.browser) invalid();
  } else {
    if (projects.some((key) => plan[key] === 'all')) invalid();
    const hasTests = projects.some((key) => plan[key].length > 0);
    const hasNodeTests = plan.unit.length > 0 || plan.integration.length > 0;
    if (plan.node !== hasNodeTests || plan.build !== hasTests || plan.browser !== (plan.e2e.length > 0)) invalid();
    if ((plan.scope === 'targeted') !== hasTests) invalid();
  }
}

export function buildTestCommand(project, plan, rest = []) {
  if (!Object.hasOwn(testPathPatterns, project)) throw new Error('Invalid test project: use unit, integration, or e2e.');
  validatePlan(plan);
  if (!Array.isArray(rest) || rest.some((arg) => typeof arg !== 'string' || !/^--[a-z][a-z\d-]*(?:=[^\0\r\n]+)?$/i.test(arg))) {
    throw new Error('Invalid extra argument: use flags such as --shard=1/2 or --list.');
  }
  const files = plan[project];
  if (Array.isArray(files) && !files.length) return null;
  const selected = files === 'all' ? [] : files;
  return project === 'e2e'
    ? { command: 'npx', args: ['playwright', 'test', ...selected, ...rest] }
    : { command: process.execPath, args: ['scripts/run-vitest.mjs', project, ...selected, ...rest] };
}

export function validateBrowserReport(report) {
  const stats = report?.stats;
  if (!stats || ['expected', 'unexpected', 'skipped', 'flaky'].some((key) => !Number.isSafeInteger(stats[key]) || stats[key] < 0)) {
    throw new Error('Invalid browser report: expected nonnegative integer test counts.');
  }
  if (stats.expected === 0 || stats.unexpected !== 0 || stats.skipped !== 0 || stats.flaky !== 0) {
    throw new Error('Browser report must contain passing tests with no failures, skipped tests, or flaky tests.');
  }
  return true;
}

function main() {
  try {
    if (!process.env.CI_PLAN) throw new Error('CI_PLAN must contain a valid JSON plan.');
    let plan;
    try { plan = JSON.parse(process.env.CI_PLAN); }
    catch { throw new Error('CI_PLAN is not valid JSON.'); }
    const [project, ...rest] = process.argv.slice(2);
    const command = buildTestCommand(project, plan, rest);
    if (!command) {
      console.log(`[ci-tests] ${project}: intentional skip; this change selects no tests for this project.`);
      return;
    }
    const checkBrowserReport = project === 'e2e' && !rest.includes('--list');
    const browserReportPath = 'test-results/e2e-report.json';
    if (checkBrowserReport) {
      try { unlinkSync(browserReportPath); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    const result = spawnSync(command.command, command.args, { stdio: 'inherit', shell: false });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
    if (checkBrowserReport && result.status === 0) {
      let report;
      try { report = JSON.parse(readFileSync(browserReportPath, 'utf8')); }
      catch { throw new Error('Browser report is missing or invalid; a successful process exit alone does not pass.'); }
      validateBrowserReport(report);
    }
  } catch (error) {
    console.error(`[ci-tests] ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
