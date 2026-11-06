/**
 * Plan T3 (A5): the last-shot target in the real physics world. The target is a solid disc for
 * its shot only; the ring is decided from where the cork touched it, and the screen plays no part.
 */
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createShotWorld, REWARD_TARGET_SURFACE_ID } from '../../src/sim/world';
import { TARGET_AIM, targetGeometryAt } from '../../src/core/rewards';
import { aimDirection, muzzlePosition, type ShotWorld } from '../../src/contracts';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

const b = getGameplayBundle('expanded-trial');

async function emptyWorld(): Promise<ShotWorld> {
  const w = await createShotWorld(b.layout, b.catalog, b.tuning);
  w.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
  return w;
}

function shotAt(standX: number, dYaw: number, shot = 1) {
  return makeRequest({ origin: muzzlePosition(b.layout, standX), direction: aimDirection(b.layout, standX, { yaw: TARGET_AIM.yaw + dYaw, pitch: TARGET_AIM.pitch }) }, shot);
}

describe('A5 target in the physics world', () => {
  for (const standX of [b.layout.camera.standMinX, 0, b.layout.camera.standMaxX]) {
    it(`stand ${standX.toFixed(2)}: the planned aim hits the center; a small turn hits the outer ring`, async () => {
      const g = targetGeometryAt(b.layout, b.tuning, standX);
      const w = await emptyWorld();
      const center = runExpanded(w, shotAt(standX, 0, 1), expandedCtx({ rewards: true, rewardTarget: g }));
      expect(center.record.rewardContacts?.targetHit).toBe('center');
      expect(center.impacts.some((e) => e.target.kind === 'surface' && e.target.surfaceId === REWARD_TARGET_SURFACE_ID)).toBe(true);
      const outer = runExpanded(w, shotAt(standX, 0.07, 2), expandedCtx({ rewards: true, rewardTarget: g }));
      expect(outer.record.rewardContacts?.targetHit).toBe('outer');
      w.dispose();
    });
  }

  it('exists for its own shot only: the next shot through the same point does not touch it', async () => {
    const g = targetGeometryAt(b.layout, b.tuning, 0);
    const w = await emptyWorld();
    expect(runExpanded(w, shotAt(0, 0, 1), expandedCtx({ rewards: true, rewardTarget: g })).record.rewardContacts?.targetHit).toBe('center');
    const next = runExpanded(w, shotAt(0, 0, 2), expandedCtx({ rewards: true, rewardTarget: null }));
    expect(next.record.rewardContacts?.targetHit).toBeNull();
    expect(next.impacts.some((e) => e.target.kind === 'surface' && e.target.surfaceId === REWARD_TARGET_SURFACE_ID)).toBe(false);
    w.dispose();
  });

  it('a run without rewards gets no reward contacts in its record', async () => {
    const w = await emptyWorld();
    expect(runExpanded(w, shotAt(0, 0, 1), expandedCtx()).record.rewardContacts).toBeUndefined();
    w.dispose();
  });
});
