import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { RunState } from '../../src/contracts';

/** Each entry ends immediately before the shot that wins this set. */
export const localizedSetShots = JSON.parse(gunzipSync(readFileSync(
  new URL('../fixtures/outcomes/longest-sets.json.gz', import.meta.url),
)).toString()) as Record<string, { beforeFire: RunState; gameTick: number }>;
