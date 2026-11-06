/**
 * Plan T3 (A5): the last-shot target in the real physics world. The target is a solid disc for
 * its shot only; the ring is decided from where the cork touched it, and the screen plays no part.
 */
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createShotWorld, REWARD_CHIME_SURFACE_ID, REWARD_TARGET_SURFACE_ID } from '../../src/sim/world';
import { splitChildMarks } from '../../src/sim/shot';
import { spawnPrize } from '../../src/core/replenish';
import { CHIME_BOX, PIGGY_SLOT_BOX, TARGET_AIM, rewardDevicesFor, targetGeometryAt } from '../../src/core/rewards';
import { aimDirection, asPrizeTypeId, muzzlePosition, type PrizeInstanceState, type ShotWorld } from '../../src/contracts';
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

describe('A2-A4 devices in the physics world (plan T4a)', () => {
  const fullB = getGameplayBundle('expanded-full');
  const devices = rewardDevicesFor(fullB.expansion!.profile.rewards!);
  async function deviceWorld(prizes: readonly PrizeInstanceState[] = []): Promise<ShotWorld> {
    const w = await createShotWorld(fullB.layout, fullB.catalog, fullB.tuning, { rewardDevices: devices });
    w.syncShelf({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 }, 0);
    return w;
  }
  const dir = (x: number, y: number, z: number) => {
    const l = Math.hypot(x, y, z);
    return { x: x / l, y: y / l, z: z / l };
  };
  const hit = (r: ReturnType<typeof runExpanded>, id: string) => r.impacts.findIndex((e) => e.target.kind === 'surface' && e.target.surfaceId === id);

  it('the chime hit directly pays nothing; after a real wall reflection of the same cork it counts', async () => {
    const w = await deviceWorld();
    const direct = runExpanded(w, makeRequest({ origin: { x: CHIME_BOX.center.x, y: CHIME_BOX.center.y, z: -1.3 }, direction: dir(0, 0, -1) }, 1), expandedCtx({ rewards: true }));
    expect(hit(direct, REWARD_CHIME_SURFACE_ID)).toBeGreaterThanOrEqual(0);
    expect(direct.record.rewardContacts?.chimeAfterReflection).toBe(false);
    // found by stepping the real world: left wall first, then the chime
    const bank = runExpanded(w, makeRequest({ origin: { x: -2.6, y: 1.62, z: -1.5 }, direction: dir(-1, 0.03, -0.6) }, 2), expandedCtx({ rewards: true }));
    const wall = bank.impacts.findIndex((e) => e.target.kind === 'surface' && e.target.surfaceId === 'left-wall');
    expect(wall).toBeGreaterThanOrEqual(0);
    expect(hit(bank, REWARD_CHIME_SURFACE_ID)).toBeGreaterThan(wall);
    expect(bank.record.rewardContacts?.chimeAfterReflection).toBe(true);
    w.dispose();
  });

  it('a split child keeps the parent reflection count but not the chime mark', () => {
    expect(splitChildMarks({ reflections: 3, chimeReady: true })).toEqual({ reflections: 3, chimeReady: false });
  });

  it('a cork into the piggy-bank slot is a deposit and stays there', async () => {
    const w = await deviceWorld();
    const r = runExpanded(w, makeRequest({ origin: { x: PIGGY_SLOT_BOX.center.x, y: PIGGY_SLOT_BOX.center.y, z: -1.3 }, direction: dir(0, 0, -1) }, 1), expandedCtx({ rewards: true }));
    expect(r.record.rewardContacts?.piggyDeposit).toBe(true);
    const ended = r.events.filter((e) => e.type === 'projectileEnded');
    expect(ended.map((e) => (e.type === 'projectileEnded' ? e.reason : ''))).toEqual(['stopped']);
    w.dispose();
  });

  it('a prize pushed off the back of the bottom board through the tray is recorded once and collected once; beside the tray only collected', async () => {
    /** One straight cork at a light prize on the bottom board (found by stepping the real world). */
    const pushOff = async (slotId: string) => {
      const slot = fullB.layout.slots.find((s) => s.slotId === slotId)!;
      const p = spawnPrize(fullB.catalog, asPrizeTypeId('P004'), slot, 1, 0);
      const w = await deviceWorld([p]);
      const o = muzzlePosition(fullB.layout, slot.spawnBase.x);
      const r = runExpanded(w, makeRequest({ origin: o, direction: dir(0, p.pose.position.y - o.y + 0.03, slot.spawnBase.z - o.z) }, 1), expandedCtx({ rewards: true }));
      w.dispose();
      return { p, r };
    };
    const inTray = await pushOff('slot-r3-c04');
    expect(inTray.r.record.collected.map((c) => c.instanceId)).toEqual([inTray.p.instanceId]);
    expect(inTray.r.record.rewardContacts?.seesawInstances).toEqual([inTray.p.instanceId]);
    const beside = await pushOff('slot-r3-c08');
    expect(beside.r.record.collected.map((c) => c.instanceId)).toEqual([beside.p.instanceId]);
    expect(beside.r.record.rewardContacts?.seesawInstances).toEqual([]);
  });
});
