import { describe, expect, it } from 'vitest';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { createTransformChooser } from '../../src/core/gimmicks';
import { resolveShot } from '../../src/core/settlement';
import { createRun } from '../../src/core/state';
import { reduceGame, tickRun } from '../../src/core/transitions';
import { createShotWorld } from '../../src/sim/world';
import { isLedgerEntryConsistent, mintId, type BoothLayout, type DeviceKind, type RunState } from '../../src/contracts';
import { layoutWith, plate } from '../unit/device-helpers';

const T = PROTOTYPE_TUNING;
const ctx = { tuning: T };

/** One whole shot through core and sim, aimed straight ahead from x = 0.45 (so a plate on the right is hit). */
async function oneShot(layout: BoothLayout, seed: number, kind: DeviceKind) {
  const world = await createShotWorld(layout, PROTOTYPE_CATALOG, T);
  let s: RunState = createRun({ runId: mintId.run(`run-${seed}`), seed, tuning: T, playerName: null }, PROTOTYPE_CATALOG, layout);
  world.syncShelf(s.shelf, s.clocks.motionSec);
  s = reduceGame(s, { type: 'SET_POSITION', x: 0.45 }, ctx);
  s = reduceGame(s, { type: 'CONFIRM_POSITION' }, ctx);
  for (let i = 0; i < 12; i++) s = tickRun(s, 0.05, T);
  s = reduceGame(s, { type: 'STOP_LOAD' }, ctx);
  s = reduceGame(s, { type: 'AIM', yaw: 0, pitch: 0 }, { tuning: T, layout });
  const before = s;
  s = reduceGame(s, { type: 'FIRE' }, { tuning: T, layout });
  expect(s.phase).toBe('resolving');
  world.fire(s.inFlight!.request, { runId: s.runId, chooseTransform: createTransformChooser(s, PROTOTYPE_CATALOG) });
  let record = null;
  for (let i = 0; i < 3000 && !record; i++) record = world.step(1 / 60).record;
  expect(record).not.toBeNull();
  const result = resolveShot(s, record!, PROTOTYPE_CATALOG, T, layout);
  world.dispose();
  return { before, fired: s, record: record!, ...result, kind };
}

describe('devices through core and sim', () => {
  // the zero aim points at the middle of the shelf; a wide plate in front of it is always hit
  const wide = (kind: DeviceKind) => layoutWith([plate(kind, `dev-${kind}`, 0, 1.0, -1.0)], false);

  it('ammo plate: +2 ammo requested and granted, shots fired unchanged by the bonus (AC16, AC17)', async () => {
    const r = await oneShot(wide('ammo'), 3, 'ammo');
    expect(r.record.deviceActivations.map((d) => d.kind)).toEqual(['ammo']);
    expect(r.summary.bonusAmmoRequested).toBe(2);
    expect(r.summary.bonusAmmoGranted).toBe(2);
    expect(r.state.ammo).toBe(10 - 1 + 2);
    expect(r.state.bonusAmmoTotal).toBe(2);
    expect(r.state.shotsFired).toBe(1);
  });

  it('split plate: ammo and shots fired are untouched by the split (AC15)', async () => {
    const r = await oneShot(wide('split'), 3, 'split');
    expect(r.record.deviceActivations.map((d) => d.kind)).toEqual(['split']);
    expect(r.state.ammo).toBe(9);
    expect(r.state.bonusAmmoTotal).toBe(0);
    expect(r.state.shotsFired).toBe(1);
  });

  it('penalty plate: the nominal penalty is recorded, the score floors at 0 and the entry is consistent (AC24)', async () => {
    const r = await oneShot(wide('penalty'), 3, 'penalty');
    expect(r.summary.ledger.nominalPenalty).toBe(T.devices.penaltyPoints);
    expect(r.state.score).toBeGreaterThanOrEqual(0);
    expect(isLedgerEntryConsistent(r.summary.ledger)).toBe(true);
  });

  it('bullet type plate: only the next shot changes', async () => {
    const r = await oneShot(wide('bulletType'), 3, 'bulletType');
    expect(r.state.bulletType).toBe('heavy');
  });

  it('transform plate: one prize changes kind after the flight with the core chooser, keeping its HP ratio, deterministically (AC44)', async () => {
    const a = await oneShot(wide('transform'), 11, 'transform');
    const b = await oneShot(wide('transform'), 11, 'transform');
    expect(a.record.transforms).toHaveLength(1);
    expect(a.record.transforms).toEqual(b.record.transforms);
    const t = a.record.transforms[0]!;
    expect(t.toTypeId).not.toBe(t.fromTypeId);
    expect(t.hpAfter).toBe(Math.round((t.hpBefore / t.maxHpBefore) * t.maxHpAfter));
    const moved = [...a.state.shelf.prizes, ...a.state.collected.map((c) => ({ instanceId: c.instanceId, typeId: c.typeId }))].find((p) => p.instanceId === t.instanceId);
    expect(moved?.typeId).toBe(t.toTypeId);
    expect(a.summary.transforms).toEqual(a.record.transforms);
    // a mounted (periodic) prize is never the one that changed
    const before = a.fired.shelf.prizes.find((p) => p.instanceId === t.instanceId)!;
    expect(before.mounted).toBe(false);
  });
});
