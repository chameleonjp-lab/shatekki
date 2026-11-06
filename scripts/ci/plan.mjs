#!/usr/bin/env node
// Unknown paths deliberately run every check. Extend these rules only when the
// affected tests are understood; this is an allowlist, not a dependency graph.
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rules = [
  {
    pattern: /^src\/ranking\/[\w-]+\.ts$/,
    label: 'ranking', unit: ['share'], integration: ['ranking', 'security', 'screens'], e2e: [],
  },
  {
    pattern: /^src\/i18n\/(?:[\w-]+\/)*[\w-]+\.ts$/,
    label: 'translations', unit: ['controls-model', 'i18n', 'i18n-content', 'share'], integration: ['screens', 'security'], e2e: ['screens', 'long-text'],
  },
  {
    pattern: /^src\/ui\/(?:[\w-]+\/)*[\w-]+\.(?:ts|css)$/,
    label: 'user interface', unit: ['controls-model', 'share', 'i18n'], integration: ['screens', 'security'],
    e2e: ['screens', 'long-text', 'shot-smoke', 'smoke'],
  },
  {
    pattern: /^src\/audio\/(?:[\w-]+\/)*[\w-]+\.ts$/,
    label: 'audio', unit: ['audio'], integration: ['screens', 'security'], e2e: ['screens'],
  },
];

export const testPathPatterns = {
  unit: /^tests\/unit\/(?:[\w-]+\/)*[\w-]+\.test\.ts$/,
  integration: /^tests\/integration\/(?:[\w-]+\/)*[\w-]+\.test\.ts$/,
  e2e: /^tests\/e2e\/(?:[\w-]+\/)*[\w-]+\.spec\.ts$/,
};

function fullPlan(reason) {
  return { scope: 'full', unit: 'all', integration: 'all', e2e: 'all', node: true, build: true, browser: true, reasons: [reason] };
}

function isDoc(path) {
  return ['README.md', 'CLAUDE.md', 'AGENTS.md'].includes(path)
    || (/^docs\/(?:[^/]+\/)*[^/]+\.md$/.test(path) && !path.split('/').some((part) => part === '.' || part === '..'));
}

export function planChanges(paths, { forceFull = false } = {}) {
  if (forceFull) return fullPlan('Full checks explicitly requested.');
  if (!Array.isArray(paths) || paths.some((path) => typeof path !== 'string' || !path)) {
    return fullPlan('Changed paths are missing or invalid.');
  }
  const selection = { unit: new Set(), integration: new Set(), e2e: new Set() };
  const reasons = new Set();
  for (const path of paths) {
    // These paired catalog tables are data; view-contract reads prize names
    // from the markdown at runtime, so they must not use the docs-only skip.
    if (path === 'docs/prize-candidates.md' || path === 'docs/set-candidates.md') {
      return fullPlan(`Catalog data changed: ${path}; run every check.`);
    }
    if (isDoc(path)) continue;
    const project = Object.keys(testPathPatterns).find((key) => testPathPatterns[key].test(path));
    if (project) {
      selection[project].add(path);
      reasons.add('Changed test files run in their own project.');
      continue;
    }
    const rule = rules.find(({ pattern }) => pattern.test(path));
    if (!rule) return fullPlan(`No narrow rule for ${path}; run every check.`);
    reasons.add(`Related checks for ${rule.label} changes.`);
    for (const key of Object.keys(selection)) {
      for (const name of rule[key]) {
        selection[key].add(`tests/${key}/${name}.${key === 'e2e' ? 'spec' : 'test'}.ts`);
      }
    }
  }
  const targeted = reasons.size > 0;
  return {
    scope: targeted ? 'targeted' : 'docs',
    ...Object.fromEntries(Object.entries(selection).map(([key, files]) => [key, [...files].sort()])),
    node: selection.unit.size > 0 || selection.integration.size > 0,
    build: targeted, browser: selection.e2e.size > 0,
    reasons: targeted ? [...reasons] : [paths.length ? 'Only documentation changed.' : 'No changed files.'],
  };
}

function planFromGit(args) {
  let base;
  let head;
  let forceFull = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--full') forceFull = true;
    else if (arg === '--base' && base === undefined) base = args[++index];
    else if (arg === '--head' && head === undefined) head = args[++index];
    else return fullPlan('Invalid planner arguments; run every check.');
  }
  if (forceFull) return fullPlan('Full checks explicitly requested.');
  const validRef = (ref) => typeof ref === 'string' && /^[a-f\d]{40}$/i.test(ref) && !/^0+$/.test(ref);
  if (!validRef(base) || !validRef(head)) return fullPlan('Missing, zero, or invalid base/head commit; run every check.');
  for (const ref of [base, head]) {
    const commit = spawnSync('git', ['cat-file', '-t', ref], { encoding: 'utf8', shell: false });
    if (commit.error || commit.status !== 0 || commit.stdout.trim() !== 'commit') {
      return fullPlan('Base/head commit is unavailable; run every check.');
    }
  }

  const diff = spawnSync('git', ['diff', '--name-only', '--no-renames', '-z', base, head, '--'], { encoding: 'utf8', shell: false });
  if (diff.error || diff.status !== 0 || typeof diff.stdout !== 'string') {
    return fullPlan('Could not read the base/head diff; run every check.');
  }
  const paths = diff.stdout.split('\0').filter(Boolean);
  for (const path of paths) {
    if (Object.values(testPathPatterns).some((pattern) => pattern.test(path))) {
      const exists = spawnSync('git', ['cat-file', '-e', `${head}:${path}`], { stdio: 'ignore', shell: false });
      if (exists.error || exists.status !== 0) return fullPlan(`Changed test is absent from head: ${path}; run every check.`);
    }
  }
  return planChanges(paths);
}

function main() {
  const plan = planFromGit(process.argv.slice(2));
  const output = `plan=${JSON.stringify(plan)}\nnode=${plan.node}\nbuild=${plan.build}\nbrowser=${plan.browser}\n`;
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, output);
  console.log(JSON.stringify(plan));
  if (process.env.GITHUB_STEP_SUMMARY) {
    const describe = (value) => value === 'all' ? 'all tests' : value.length ? value.join(', ') : 'intentional skip';
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, [
      `### CI scope: ${plan.scope}`, '',
      `- Unit: ${describe(plan.unit)}`, `- Integration: ${describe(plan.integration)}`, `- Browser: ${describe(plan.e2e)}`,
      `- Build/typecheck: ${plan.build}`, '', ...plan.reasons.map((reason) => `- ${reason}`), '',
    ].join('\n'));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
