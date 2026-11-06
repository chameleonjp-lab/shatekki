import { describe, expect, it } from 'vitest';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { resolveShot } from '../../src/core/settlement';
import { createRun } from '../../src/core/state';
import { reduceGame, tickRun } from '../../src/core/transitions';
import { createShotWorld } from '../../src/sim/world';
import { BOOTH_LAYOUT, isLedgerEntryConsistent, mintId, type RunState } from '../../src/contracts';

const T = PROTOTYPE_TUNING;
const ctx = { tuning: T };

/** Plays a whole run through core + sim, the way src/app.ts will wire them. */
async function playRun(seed: number, aimYawFor: (shot: number) => number) {
  const world = await createShotWorld(BOOTH_LAYOUT, PROTOTYPE_CATALOG, T);
  let s: RunState = createRun({ runId: mintId.run(`run-${seed}`), seed, tuning: T, playerName: null }, PROTOTYPE_CATALOG);
  world.syncShelf(s.shelf, s.clocks.motionSec);
  const trace: string[] = [];
  let guard = 0;
  while (s.phase !== 'ended' && guard++ < 30) {
    s = reduceGame(s, { type: 'CONFIRM_POSITION' }, ctx);
    for (let i = 0; i < 12; i++) {
      s = tickRun(s, 0.05, T);
      world.step(0.05);
    }
    s = reduceGame(s, { type: 'STOP_LOAD' }, ctx);
    s = reduceGame(s, { type: 'AIM', yaw: aimYawFor(s.shotsFired), pitch: 0.02 }, ctx);
    for (let i = 0; i < 10; i++) s = tickRun(s, 0.05, T);
    s = reduceGame(s, { type: 'FIRE' }, ctx);
    expect(s.phase).toBe('resolving');
    world.fire(s.inFlight!.request, { runId: s.runId, chooseTransform: () => null });
    let record = null;
    for (let i = 0; i < 2000 && !record; i++) record = world.step(1 / 60).record;
    expect(record).not.toBeNull();
    const r = resolveShot(s, record!, PROTOTYPE_CATALOG, T);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
    s = r.state;
    trace.push(`${r.summary.shotNumber}:${r.summary.chainCount}:${s.score}`);
    if (s.phase === 'position') {
      expect(s.shelf.prizes.length + s.shelf.deferredSlots.length).toBeGreaterThanOrEqual(9 - 0);
      world.syncShelf(s.shelf, s.clocks.motionSec);
    }
  }
  world.dispose();
  return { s, trace };
}

describe('a whole run through core and sim', () => {
  it('uses exactly 10 shots, then ends after the last settlement', async () => {
    const { s } = await playRun(1, (n) => ((n % 5) - 2) * 0.03);
    expect(s.phase).toBe('ended');
    expect(s.shotsFired).toBe(10);
    expect(s.ammo).toBe(0);
    expect(s.ledger).toHaveLength(10);
    expect(s.score).toBe(s.ledger[9]!.scoreAfter);
    expect(s.shelf.prizes.length).toBeLessThanOrEqual(9);
  });

  it('is reproducible: the same seed and inputs give the same trace', async () => {
    const a = await playRun(3, (n) => ((n % 4) - 1.5) * 0.04);
    const b = await playRun(3, (n) => ((n % 4) - 1.5) * 0.04);
    expect(a.trace).toEqual(b.trace);
    expect(a.s.score).toBe(b.s.score);
  });

  it('collected prizes are unique instances and the score equals the sum of their base scores', async () => {
    const { s } = await playRun(5, (n) => (n % 3) * 0.02 - 0.02);
    const ids = s.collected.map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    const sum = s.collected.reduce((a, c) => a + PROTOTYPE_CATALOG.prizes.get(c.typeId)!.baseScore, 0);
    expect(s.score).toBe(sum);
  });
});
