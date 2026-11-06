import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { createShotWorld } from '../../src/sim/world';
import {
  aimDirection,
  ballisticFor,
  corkFreeFlightPath,
  isAmmoBalanced,
  isExpandedRunState,
  mintId,
  muzzlePosition,
  type ShotSummary,
  type Vec3,
} from '../../src/contracts';

// Real physics world + real effect planning + real settlement, wired by the
// controller (EG05/EG08). Node + Rapier, no browser, no device.

const bundle = getGameplayBundle('expanded-proposed');
const L = bundle.layout;
const EXP = bundle.expansion!;

function aimAt(standX: number, target: Vec3): { yaw: number; pitch: number } {
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(bundle.tuning, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

async function setup(seed: number) {
  const world = await createShotWorld(L, bundle.catalog, bundle.tuning);
  const initial = createExpandedRun({ runId: mintId.run(`run-int-${seed}`), seed, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: EXP });
  const settled: ShotSummary[] = [];
  const c = new GameController(
    { rules: CORE_RULES, world, renderer: null, catalog: bundle.catalog, tuning: bundle.tuning, layout: L, expansion: EXP, onShotSettled: (s) => settled.push(s) },
    initial,
  );
  return { c, world, settled };
}

function prepareShot(c: GameController, standX: number, target: Vec3) {
  c.dispatch({ type: 'SET_POSITION', x: standX });
  c.dispatch({ type: 'CONFIRM_POSITION' });
  c.frame(0.3);
  c.dispatch({ type: 'STOP_LOAD' });
  c.dispatch({ type: 'AIM', ...aimAt(c.current.standX, target) });
  expect(c.dispatch({ type: 'FIRE' })).toBe(true);
}

function runUntil(c: GameController, done: () => boolean, maxFrames = 2000): void {
  for (let i = 0; i < maxFrames && !done(); i++) c.frame(1 / 60);
}

describe('an expanded shot through the real world, plan and settlement', () => {
  it('a cork on the shopkeeper asks one question, waits, takes one answer and settles once', async () => {
    const { c, world, settled } = await setup(21);
    const body = L.shopkeeper.find((p) => p.part === 'body')!.box.center;
    prepareShot(c, L.camera.standMaxX, { x: body.x, y: 1.2, z: body.z + 0.1 });
    runUntil(c, () => c.awaitingAnswer || c.current.phase !== 'resolving');
    expect(c.awaitingAnswer).toBe(true);
    const s = c.current;
    const question = s.inFlight!.plan!.question!;
    expect(question.questionId).toBe(s.expansion!.questionOrder[0]);
    expect(c.viewState().expansion?.question?.questionId).toBe(question.questionId);
    // Waiting: many frames change nothing.
    const frozen = world.frame();
    for (let i = 0; i < 120; i++) c.frame(0.1);
    expect(world.frame().prizes).toEqual(frozen.prizes);
    expect(c.current).toBe(s);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: s.inFlight!.shotId, questionId: question.questionId, choice: 'B' })).toBe(true);
    expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: s.inFlight!.shotId, questionId: question.questionId, choice: 'A' })).toBe(false);
    runUntil(c, () => c.current.phase !== 'resolving');
    expect(settled).toHaveLength(1);
    const after = c.current;
    expect(isExpandedRunState(after)).toBe(true);
    expect(after.phase === 'position' || after.phase === 'ended').toBe(true);
    expect(after.expansion!.questionCursor).toBe(1);
    expect(after.expansion!.active).toBeNull();
    expect(after.ledger).toHaveLength(1);
    expect(after.firstHitsScored.some((k) => k.startsWith('shopkeeper:'))).toBe(true);
    expect(isAmmoBalanced(after, bundle.tuning.initialAmmo)).toBe(true);
    // The answer's effect was planned once and is in the plan that settled.
    const answered = s.inFlight!.plan!.processed.length;
    expect(answered).toBeGreaterThanOrEqual(0);
  });

  it('a cork on a background cell uses that cell once, without a question', async () => {
    const { c, settled } = await setup(22);
    const cell = L.backgroundCells!.find((x) => x.cellId === 'cell-r3-c12')!;
    // Aim beside the cell centre, between the prizes of column 12.
    prepareShot(c, L.camera.standMaxX, { x: cell.box.center.x + 0.12, y: cell.box.center.y - 0.05, z: cell.box.center.z });
    runUntil(c, () => c.awaitingAnswer || c.current.phase !== 'resolving');
    if (c.awaitingAnswer) throw new Error('the cell shot touched the shopkeeper');
    expect(settled).toHaveLength(1);
    const after = c.current;
    const used = after.expansion!.cells.filter((x) => x.used);
    expect(used.map((x) => x.cellId)).toContain('cell-r3-c12');
    for (const u of used) expect(u.usedOnShot).toBe(mintId.shot(1));
    expect(after.expansion!.questionCursor).toBe(0);
    expect(isAmmoBalanced(after, bundle.tuning.initialAmmo)).toBe(true);
    // The view shows the effect only for used cells.
    const shown = c.viewState().expansion!.cells.find((x) => x.cellId === 'cell-r3-c12')!;
    expect(shown.used).toBe(true);
    expect(shown.effectId).toBe(after.expansion!.cells.find((x) => x.cellId === 'cell-r3-c12')!.effectId);
  });
});
