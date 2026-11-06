import { describe, expect, it } from 'vitest';
import { createRunStore } from '../../src/persistence';
import { resolveShot } from '../../src/core/settlement';
import { finalResult } from '../../src/core/result';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import {
  BOOTH_LAYOUT,
  isLedgerEntryConsistent,
  isOfficialRankingEligible,
  mintId,
  type DeviceActivation,
  type RunState,
  type ShotWorld,
  type SimulationFrame,
} from '../../src/contracts';
import { CAT, T, fired, newRun, shelfOf, syntheticRecord } from '../unit/helpers';
import { FakeStorage } from './fake-storage';

/**
 * AC42 composite (Node, core + controller + persistence; the sim record is
 * synthetic so the combination is exact and repeatable):
 * last shot → split → +2 ammo → two prizes → two sets at once → presentation
 * skipped → next shot interrupted by a reload.
 * Sets used: S001 (P001 P002 P003) and S006 (P001 P002 P009).
 */
const act = (shot: number, id: string, kind: DeviceActivation['kind']): DeviceActivation => ({
  deviceId: mintId.device(id),
  kind,
  projectileId: mintId.projectile(mintId.shot(shot), 0),
});

function playUpToLastShot(): RunState {
  let s: RunState = {
    ...newRun(42),
    shelf: shelfOf([
      ['t0c0', 'P001'],
      ['t0c1', 'P002'],
      ['t0c2', 'P003'],
      ['t1c0', 'P009'],
      ['t1c1', 'P050'],
      ['t1c2', 'P051'],
      ['t2c0', 'P085'],
      ['t2c1', 'P086'],
      ['t2c2', 'P087'],
    ]),
  };
  const p001 = s.shelf.prizes[0]!.instanceId;
  const p002 = s.shelf.prizes[1]!.instanceId;
  for (let shot = 1; shot <= 17; shot++) {
    const f = fired(s);
    const collect = shot === 1 ? [p001, p002] : [];
    const devices = shot <= 4 ? [act(shot, 'dev-ammo-1', 'ammo')] : [];
    s = resolveShot(f, syntheticRecord(f, collect, { deviceActivations: devices }), CAT, T).state;
  }
  return s;
}

describe('AC42: last shot → split → +2 → two prizes → two sets → skip → interrupted reload', () => {
  it('settles the combination consistently and keeps playing', () => {
    const s = playUpToLastShot();
    expect(s.ammo).toBe(1);
    expect(s.bonusAmmoTotal).toBe(8);
    expect(s.shotsFired).toBe(17);
    expect(s.collectedTypeIds).toEqual(expect.arrayContaining(['P001', 'P002']));

    const last = fired(s);
    expect(last.ammo).toBe(0);
    const p003 = last.shelf.prizes.find((p) => p.typeId === 'P003')!.instanceId;
    const p009 = last.shelf.prizes.find((p) => p.typeId === 'P009')!.instanceId;
    const record = syntheticRecord(last, [p003, p009], {
      deviceActivations: [act(18, 'dev-split-1', 'split'), act(18, 'dev-ammo-1', 'ammo')],
      prizeOutcomes: [p003, p009].map((id) => ({
        instanceId: id,
        typeId: last.shelf.prizes.find((p) => p.instanceId === id)!.typeId,
        hits: [{ projectileId: mintId.projectile(mintId.shot(18), 1), generation: 1, reflectionIndex: 1, damage: 1 }],
        collected: true,
        displacement: 0.3,
        endedNearEdge: false,
      })),
    });
    const { state: after, summary } = resolveShot(last, record, CAT, T);

    expect(summary.bonusAmmoGranted).toBe(2); // cumulative 8 → 10 (cap)
    expect(after.bonusAmmoTotal).toBe(10);
    expect(after.ammo).toBe(2); // the last shot earned ammo, so the run continues (AC18)
    expect(after.phase).toBe('position');
    expect(summary.runEnded).toBe(false);
    expect([...summary.newlyCompletedSets].sort()).toEqual(['S001', 'S006']); // two sets at once, once each
    expect(summary.chainCount).toBe(2);
    expect(after.maxChain).toBe(2);
    expect(summary.ledger.setPoints).toBe(CAT.sets.get('S001' as never)!.bonusScore + CAT.sets.get('S006' as never)!.bonusScore);
    expect(isLedgerEntryConsistent(summary.ledger)).toBe(true);
    expect(after.score).toBe(after.ledger.reduce((a, e) => a + (e.scoreAfter - e.scoreBefore), 0));
    expect(after.shotsFired).toBe(18);

    // Re-delivering the same record cannot add anything: the run is no longer resolving that shot.
    expect(() => resolveShot(after, record, CAT, T)).toThrow();
  });

  it('skipping the presentation gives exactly the same settled state through the controller', () => {
    const base = fired(playUpToLastShot());
    const p003 = base.shelf.prizes.find((p) => p.typeId === 'P003')!.instanceId;
    const p009 = base.shelf.prizes.find((p) => p.typeId === 'P009')!.instanceId;
    const record = syntheticRecord(base, [p003, p009], {
      deviceActivations: [act(18, 'dev-split-1', 'split'), act(18, 'dev-ammo-1', 'ammo')],
    });
    const frame: SimulationFrame = { simTimeSec: 0, shotId: null, stage: null, prizes: [], projectiles: [], events: [] };
    const settleVia = (skip: boolean): RunState => {
      let delivered = false;
      const world: ShotWorld = {
        syncShelf: () => undefined,
        fire: () => undefined,
        step: () => {
          if (delivered) return { frame, record: null, barrier: null };
          delivered = true;
          return { frame, record, barrier: null };
        },
        frame: () => frame,
        resumeAfterEffects: () => false,
        previewFirstContact: () => ({ points: [], firstHitTargetId: null, approximate: true }),
        shotInProgress: false,
        dispose: () => undefined,
      };
      const c = new GameController({ rules: CORE_RULES, world, renderer: null, catalog: CAT, tuning: T, layout: BOOTH_LAYOUT }, base);
      if (skip) expect(c.dispatch({ type: 'SKIP_PRESENTATION' })).toBe(true);
      c.frame(1 / 60);
      c.frame(1 / 60);
      return c.current;
    };
    const plain = settleVia(false);
    const skipped = settleVia(true);
    expect(skipped).toEqual(plain);
    expect(plain.completedSets).toEqual(expect.arrayContaining(['S001', 'S006']));
  });

  it('a reload during the next shot abandons the run; it is never ranked and never resumed', () => {
    const storage = new FakeStorage();
    const now = () => '2026-11-06T00:00:00.000Z';
    const store = createRunStore(storage, 'tab-A', { catalog: CAT, tuning: T, now });
    const s = playUpToLastShot();
    const last = fired(s);
    const p003 = last.shelf.prizes.find((p) => p.typeId === 'P003')!.instanceId;
    const p009 = last.shelf.prizes.find((p) => p.typeId === 'P009')!.instanceId;
    const settled = resolveShot(
      last,
      syntheticRecord(last, [p003, p009], { deviceActivations: [act(18, 'dev-ammo-1', 'ammo')] }),
      CAT,
      T,
    ).state;
    expect(store.saveStable(settled).ok).toBe(true);
    const next = fired({ ...settled, playerName: 'たろう' });
    expect(store.saveAfterFire(next).ok).toBe(true);

    const reloaded = createRunStore(storage, 'tab-B', { catalog: CAT, tuning: T, now }).load();
    expect(reloaded.kind).toBe('abandoned');
    if (reloaded.kind !== 'abandoned') return;
    const result = finalResult(reloaded.state);
    expect(result.status).toBe('abandoned');
    expect(isOfficialRankingEligible({ ...result, valueStatus: 'approved', playerName: 'たろう' })).toBe(false);
  });
});
