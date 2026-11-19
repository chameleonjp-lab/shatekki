import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { rewardConfigOf, rewardDevicesFor, settleRewards } from '../../src/core/rewards';
import { splitChildMarks } from '../../src/sim/shot';
import { createShotWorld } from '../../src/sim/world';
import { mintId, type GameplayBundle, type Vec3 } from '../../src/contracts';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

// 05: the A2 wind chime pays only for a cork that itself reflected off a wall, a cell or a shelf board.

const R7 = getGameplayBundle('expanded-aim-first');
const R6 = getGameplayBundle('expanded-next');
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
};

async function fireFrom(b: GameplayBundle, origin: Vec3, dir: Vec3) {
  const w = await createShotWorld(b.layout, b.catalog, b.tuning, { transformPolicy: b.behavior!.transformPolicy, rewardDevices: rewardDevicesFor(rewardConfigOf(b.expansion)) });
  try {
    w.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
    const run = runExpanded(w, makeRequest({ origin, direction: unit(dir) }), expandedCtx({ usableCells: b.layout.backgroundCells!.map((c) => c.cellId), rewards: true }), { dt: b.tuning.limits.fixedStepSec });
    const names = run.impacts.map((i) => (i.target.kind === 'surface' ? i.target.surfaceId : i.target.kind === 'cell' ? 'cell' : i.target.kind));
    return { names, contacts: run.record.rewardContacts! };
  } finally {
    w.dispose();
  }
}

const CEILING_PATH = { origin: { x: -2.78, y: 1.95, z: -1.6 }, dir: { x: 0, y: 1, z: -0.12 } };

describe('05 wind chime (A2)', () => {
  it('ceiling → chime: r006 pays (kept for comparison), r007 does not', async () => {
    const r6 = await fireFrom(R6, CEILING_PATH.origin, CEILING_PATH.dir);
    expect(r6.names.slice(0, 2)).toEqual(['ceiling', 'reward-chime']);
    expect(r6.contacts.chimeAfterReflection).toBe(true);
    const r7 = await fireFrom(R7, CEILING_PATH.origin, CEILING_PATH.dir);
    expect(r7.names.slice(0, 2)).toEqual(['ceiling', 'reward-chime']);
    expect(r7.contacts.chimeAfterReflection).toBe(false);
  });

  it('a direct hit does not pay in r007', async () => {
    const r7 = await fireFrom(R7, { x: -2.78, y: 1.62, z: -1.3 }, { x: 0, y: 0, z: -1 });
    expect(r7.names[0]).toBe('reward-chime');
    expect(r7.contacts.chimeAfterReflection).toBe(false);
  });

  it('the same cork off the left wall (a wall cell) or off a shelf board, then the chime: pays', async () => {
    // search a few directions from inside the stall for "wall/cell or board → chime" as the first two contacts
    const found: string[] = [];
    for (const [origin, base] of [
      [{ x: -2.4, y: 1.62, z: -1.6 }, { x: -1, y: 0.05, z: -0.6 }],
      [{ x: -2.78, y: 1.3, z: -1.95 }, { x: 0, y: 1, z: 0 }],
    ] as const) {
      for (let i = -12; i <= 12 && found.length < 2; i++) {
        for (let j = -6; j <= 6; j++) {
          const dir = { x: base.x + i * 0.04, y: base.y + j * 0.04, z: base.z + (base.y === 1 ? 0 : 0) + (base.y === 1 ? i * 0.02 : 0) };
          const r = await fireFrom(R7, origin, dir);
          const first = r.names[0];
          if (r.names[1] === 'reward-chime' && (first === 'cell' || first === 'left-wall' || /^shelf-/.test(first ?? ''))) {
            expect(r.contacts.chimeAfterReflection).toBe(true);
            found.push(first!);
            break;
          }
        }
      }
    }
    expect(found.length).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('a split child never inherits the parent reflection', () => {
    expect(splitChildMarks({ reflections: 3, chimeReady: true }).chimeReady).toBe(false);
  });

  it('+2 is paid once per game: a second qualifying shot gives nothing', () => {
    const cfg = rewardConfigOf(R7.expansion)!;
    const s = createExpandedRun({ runId: mintId.run('chime'), seed: 5, tuning: R7.tuning, playerName: null }, { ...R7, expansion: R7.expansion! });
    const contacts = { targetHit: null, chimeAfterReflection: true, seesawInstances: [], piggyDeposit: false };
    const first = settleRewards({ state: s, cfg, tuning: R7.tuning, catalog: R7.catalog, work: { ammo: 9, bonusAmmoTotal: 0 }, shotNumber: 1, collectedNow: [], newSets: [], contacts });
    expect(first.outcomes.filter((o) => o.id === 'A2')).toEqual([expect.objectContaining({ offered: 2, granted: 2 })]);
    const after = { ...s, expansion: { ...s.expansion, rewards: first.rewards } };
    const second = settleRewards({ state: after, cfg, tuning: R7.tuning, catalog: R7.catalog, work: { ammo: first.ammo - 1, bonusAmmoTotal: first.bonusAmmoTotal }, shotNumber: 2, collectedNow: [], newSets: [], contacts });
    expect(second.outcomes.filter((o) => o.id === 'A2')).toEqual([]);
  });
});
