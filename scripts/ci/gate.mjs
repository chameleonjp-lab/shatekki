#!/usr/bin/env node
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function evaluateGate(env) {
  if (env.PLAN_RESULT !== 'success') throw new Error(`Plan did not succeed: ${env.PLAN_RESULT ?? 'missing'}.`);
  for (const project of ['NODE', 'BUILD', 'BROWSER']) {
    const required = env[`${project}_REQUIRED`];
    if (required !== 'true' && required !== 'false') throw new Error(`${project} requirement is missing or invalid.`);
    const expected = required === 'true' ? 'success' : 'skipped';
    const actual = env[`${project}_RESULT`];
    if (actual !== expected) throw new Error(`${project} expected ${expected}, received ${actual ?? 'missing'}.`);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    evaluateGate(process.env);
    console.log('[ci-gate] All planned checks passed; unneeded jobs were intentionally skipped.');
  } catch (error) {
    console.error(`[ci-gate] ${error.message}`);
    process.exitCode = 1;
  }
}
