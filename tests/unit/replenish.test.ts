import { describe, expect, it } from 'vitest';
import { isSlotBlocked, replenish } from '../../src/core/replenish';
import { resolveShot } from '../../src/core/settlement';
import { createRun } from '../../src/core/state';
import { BOOTH_LAYOUT, BOOTH_LAYOUT_V2, mintId, type PrizeInstanceState, type RunState } from '../../src/contracts';
import { CAT, T, fired, newRun, syntheticRecord } from './helpers';

const slotGeom = (id: string) => BOOTH_LAYOUT.slots.find((s) => s.slotId === id)!;
const moveX = (p: PrizeInstanceState, dx: number): PrizeInstanceState => ({
  ...p,
  pose: { ...p.pose, position: { ...p.pose.position, x: p.pose.position.x + dx } },
});

describe('replenishment after a shot', () => {
  it('does not refill during flight: FIRE leaves the shelf untouched', () => {
    const a = newRun(1);
    const f = fired(a);
    expect(f.phase).toBe('resolving');
    expect(f.shelf).toBe(a.shelf);
    expect(f.shelf.prizes).toHaveLength(9);
  });

  it('refills the emptied slot after the shot with a NEW instance at full HP', () => {
    const f = fired(newRun(1));
    const gone = f.shelf.prizes[4]!;
    // damage a surviving prize: it must stay damaged and untouched
    const damaged = { ...f.shelf.prizes[0]!, hp: 0.5 };
    const rec = syntheticRecord(f, [gone.instanceId], {
      remainingPrizes: f.shelf.prizes.filter((p) => p.instanceId !== gone.instanceId).map((p) => (p.instanceId === damaged.instanceId ? damaged : p)),
    });
    const { state } = resolveShot(f, rec, CAT, T);
    expect(state.shelf.prizes).toHaveLength(9);
    const fresh = state.shelf.prizes.find((p) => p.homeSlot === gone.homeSlot)!;
    expect(fresh.instanceId).not.toBe(gone.instanceId);
    expect(fresh.instanceId).toBe('i0010');
    expect(fresh.hp).toBe(fresh.maxHp);
    expect(fresh.collected).toBe(false);
    expect(state.shelf.nextInstanceNumber).toBe(11);
    expect(state.shelf.deferredSlots).toEqual([]);
    // survivors are exactly what the sim reported (no deletion, no movement)
    for (const p of rec.remainingPrizes) expect(state.shelf.prizes).toContain(p);
    expect(state.draw.drawCount).toBe(f.draw.drawCount + 1);
  });

  it('defers a blocked slot, never touches the blocking prize, and refills once it is clear', () => {
    const f = fired(newRun(1));
    const gone = f.shelf.prizes.find((p) => p.homeSlot === 't1c1')!;
    const neighbor = f.shelf.prizes.find((p) => p.homeSlot === 't1c0')!;
    // the left neighbor was knocked into the middle slot's space
    const slid = moveX(neighbor, 0.42);
    const rec = syntheticRecord(f, [gone.instanceId], {
      remainingPrizes: f.shelf.prizes.filter((p) => p.instanceId !== gone.instanceId).map((p) => (p === neighbor ? slid : p)),
    });
    expect(isSlotBlocked(slotGeom('t1c1'), rec.remainingPrizes, CAT)).toBe(true);
    const r1 = resolveShot(f, rec, CAT, T);
    expect(r1.state.shelf.prizes).toHaveLength(8);
    expect(r1.state.shelf.deferredSlots).toEqual(['t1c1']);
    expect(r1.state.shelf.prizes).toContain(slid); // not deleted, not moved
    expect(r1.state.shelf.nextInstanceNumber).toBe(10); // nothing was drawn
    expect(r1.state.draw).toEqual(f.draw);
    expect(r1.state.phase).toBe('position');

    // next shot: still blocked -> still deferred
    const stay = replenish({ shelf: r1.state.shelf, draw: r1.state.draw, newlyEmptySlots: [], motionSec: 0 }, CAT, T);
    expect(stay.shelf.prizes).toHaveLength(8);
    expect(stay.shelf.deferredSlots).toEqual(['t1c1']);

    // the neighbor moves away -> refilled later, deferral cleared
    const cleared = { ...r1.state.shelf, prizes: r1.state.shelf.prizes.map((p) => (p === slid ? neighbor : p)) };
    const later = replenish({ shelf: cleared, draw: r1.state.draw, newlyEmptySlots: [], motionSec: 0 }, CAT, T);
    expect(later.shelf.prizes).toHaveLength(9);
    expect(later.shelf.deferredSlots).toEqual([]);
    expect(later.spawned).toHaveLength(1);
    expect(later.spawned[0]!.homeSlot).toBe('t1c1');
    expect(later.spawned[0]!.hp).toBe(later.spawned[0]!.maxHp);
    expect(later.shelf.nextInstanceNumber).toBe(11);
  });

  it('a prize that only slid keeps its home slot: nothing is refilled for it and no duplicate appears', () => {
    const f = fired(newRun(1));
    const slid = moveX(f.shelf.prizes[0]!, 0.1);
    const rec = syntheticRecord(f, [], { remainingPrizes: f.shelf.prizes.map((p) => (p === f.shelf.prizes[0] ? slid : p)) });
    const { state } = resolveShot(f, rec, CAT, T);
    expect(state.shelf.prizes).toHaveLength(9);
    expect(new Set(state.shelf.prizes.map((p) => p.instanceId)).size).toBe(9);
    expect(state.shelf.prizes.filter((p) => p.homeSlot === slid.homeSlot)).toHaveLength(1);
    expect(state.shelf.nextInstanceNumber).toBe(10);
  });

  it('never exceeds 9 prizes, even with stale deferred slots', () => {
    const s = newRun(1);
    const crowded = { ...s.shelf, deferredSlots: ['t0c0' as never, 't2c2' as never] };
    const r = replenish({ shelf: crowded, draw: s.draw, newlyEmptySlots: [], motionSec: 0 }, CAT, T);
    // those slots are occupied by their own prizes -> blocked; count stays 9
    expect(r.shelf.prizes).toHaveLength(9);
    expect(r.spawned).toHaveLength(0);
    // an artificial 9-prize shelf with a clear slot still does not grow past the limit
    const fewer = { ...s.shelf, prizes: s.shelf.prizes.slice(0, 8), deferredSlots: [] as never[] };
    const r2 = replenish({ shelf: fewer, draw: s.draw, newlyEmptySlots: [s.shelf.prizes[8]!.homeSlot, s.shelf.prizes[8]!.homeSlot], motionSec: 0 }, CAT, T);
    expect(r2.shelf.prizes).toHaveLength(9);
  });

  it('refills several emptied slots in one go, each with a distinct new instance id', () => {
    const f = fired(newRun(8));
    const ids = f.shelf.prizes.slice(0, 4).map((p) => p.instanceId);
    const { state } = resolveShot(f, syntheticRecord(f, ids), CAT, T);
    expect(state.shelf.prizes).toHaveLength(9);
    expect(new Set(state.shelf.prizes.map((p) => p.instanceId)).size).toBe(9);
    expect(state.shelf.nextInstanceNumber).toBe(14);
    expect(new Set(state.shelf.prizes.map((p) => p.homeSlot)).size).toBe(9);
  });

  it('no refill after the run has ended', () => {
    const s: RunState = { ...newRun(1), ammo: 1 };
    const f = fired(s);
    const { state } = resolveShot(f, syntheticRecord(f, [f.shelf.prizes[0]!.instanceId]), CAT, T);
    expect(state.phase).toBe('ended');
    expect(state.shelf.prizes).toHaveLength(8);
    expect(state.draw).toEqual(f.draw);
  });
});

describe('replenishment with 36 slots and an assortment subset (EG03)', () => {
  const T36 = { ...T, shelfSlotCount: 36, draw: { ...T.draw, tierTargets: { easy: 12, normal: 16, hard: 8 } } };
  const start = () => createRun({ runId: mintId.run('r36'), seed: 3, tuning: T36, playerName: null }, CAT, BOOTH_LAYOUT_V2);

  it('createRun fills all 36 distinct v2 slots', () => {
    const s = start();
    expect(s.shelf.prizes).toHaveLength(36);
    expect(new Set(s.shelf.prizes.map((p) => p.homeSlot)).size).toBe(36);
    expect(s.shelf.nextInstanceNumber).toBe(37);
  });

  it('refills emptied slots from the subset only', () => {
    const s = start();
    const subset = [...CAT.prizes.keys()].slice(0, 3);
    const gone = s.shelf.prizes.filter((p) => ['slot-r1-c01', 'slot-r3-c12', 'slot-r2-c06'].includes(p.homeSlot));
    const shelf = { ...s.shelf, prizes: s.shelf.prizes.filter((p) => !gone.includes(p)) };
    const r = replenish({ shelf, draw: s.draw, newlyEmptySlots: gone.map((p) => p.homeSlot), motionSec: 0, candidateTypeIds: subset }, CAT, T36, BOOTH_LAYOUT_V2);
    expect(r.spawned).toHaveLength(3);
    for (const p of r.spawned) expect(subset).toContain(p.typeId);
    expect(r.shelf.prizes).toHaveLength(36);
    expect(r.shelf.deferredSlots).toEqual([]);
  });

  it('defers a blocked v2 slot and never moves or deletes the blocking prize', () => {
    const s = start();
    const gone = s.shelf.prizes.find((p) => p.homeSlot === 'slot-r2-c05')!;
    const neighbor = s.shelf.prizes.find((p) => p.homeSlot === 'slot-r2-c04')!;
    const slid = moveX(neighbor, 0.42);
    const shelf = { ...s.shelf, prizes: s.shelf.prizes.filter((p) => p !== gone).map((p) => (p === neighbor ? slid : p)) };
    const r = replenish({ shelf, draw: s.draw, newlyEmptySlots: [gone.homeSlot], motionSec: 0 }, CAT, T36, BOOTH_LAYOUT_V2);
    expect(r.spawned).toHaveLength(0);
    expect(r.shelf.deferredSlots).toEqual([gone.homeSlot]);
    expect(r.shelf.prizes).toContain(slid);
    expect(r.draw).toBe(s.draw);
  });

  it('without a subset the draw is the same as with null', () => {
    const s = start();
    const gone = s.shelf.prizes[7]!;
    const shelf = { ...s.shelf, prizes: s.shelf.prizes.filter((p) => p !== gone) };
    const a = replenish({ shelf, draw: s.draw, newlyEmptySlots: [gone.homeSlot], motionSec: 0 }, CAT, T36, BOOTH_LAYOUT_V2);
    const b = replenish({ shelf, draw: s.draw, newlyEmptySlots: [gone.homeSlot], motionSec: 0, candidateTypeIds: null }, CAT, T36, BOOTH_LAYOUT_V2);
    expect(a).toEqual(b);
  });
});
