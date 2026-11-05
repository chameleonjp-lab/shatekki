import { describe, expect, it } from 'vitest';
import { tickRun } from '../../src/core/transitions';
import { T, newRun, send, tick, toAiming } from './helpers';
import { aimToDirection, effectiveAim } from '../../src/core/aim';
import { BOOTH_LAYOUT, mintId } from '../../src/contracts';

describe('createRun', () => {
  it('starts with 10 ammo, 9 distinct prizes in the 9 slots, phase position', () => {
    const s = newRun();
    expect(s.ammo).toBe(10);
    expect(s.shotsFired).toBe(0);
    expect(s.phase).toBe('position');
    expect(s.score).toBe(0);
    expect(s.inFlight).toBeNull();
    expect(s.shelf.prizes).toHaveLength(9);
    expect(new Set(s.shelf.prizes.map((p) => p.instanceId)).size).toBe(9);
    expect(new Set(s.shelf.prizes.map((p) => p.homeSlot)).size).toBe(9);
    expect(s.shelf.nextInstanceNumber).toBe(10);
    for (const p of s.shelf.prizes) {
      expect(p.hp).toBe(p.maxHp);
      expect(p.collected).toBe(false);
      expect(p.typeId).toBe(p.drawnTypeId);
    }
    expect(s.valueStatus).toBe('prototype');
  });

  it('is deterministic for the same seed and differs for another', () => {
    expect(newRun(5)).toEqual(newRun(5));
    expect(newRun(5).shelf.prizes.map((p) => p.typeId)).not.toEqual(newRun(6).shelf.prizes.map((p) => p.typeId));
  });
});

describe('phase flow', () => {
  it('position -> loading -> aiming; position and load alone do not spend ammo', () => {
    let s = newRun();
    s = send(s, { type: 'SET_POSITION', x: 0.2 });
    expect(s.standX).toBeCloseTo(0.2);
    s = send(s, { type: 'CONFIRM_POSITION' });
    expect(s.phase).toBe('loading');
    expect(s.ammo).toBe(10);
    s = tick(s, 0.595);
    s = send(s, { type: 'STOP_LOAD' });
    expect(s.phase).toBe('aiming');
    expect(s.ammo).toBe(10);
    expect(s.shotsFired).toBe(0);
    expect(s.load?.tier).toBe('perfect');
  });

  it('clamps the stand position and aim to their limits', () => {
    let s = newRun();
    s = send(s, { type: 'SET_POSITION', x: 9 });
    expect(s.standX).toBe(BOOTH_LAYOUT.camera.standMaxX);
    s = send(s, { type: 'SET_POSITION', x: -9 });
    expect(s.standX).toBe(BOOTH_LAYOUT.camera.standMinX);
    s = toAiming(s);
    s = send(s, { type: 'AIM', yaw: 5, pitch: -5 });
    expect(s.aim.yaw).toBe(BOOTH_LAYOUT.camera.yawLimit);
    expect(s.aim.pitch).toBe(BOOTH_LAYOUT.camera.pitchMin);
  });

  it('the loading result comes from the core clock: timing decides the tier, the UI cannot supply it', () => {
    const weak = (() => {
      let s = send(newRun(), { type: 'CONFIRM_POSITION' });
      s = tick(s, 0.0);
      return send(s, { type: 'STOP_LOAD' }); // bar at 0
    })();
    expect(weak.load?.tier).toBe('weak');
    expect(weak.load?.barValue).toBe(0);
    expect(weak.load?.damageMultiplier).toBeLessThan(1);
    expect(weak.load?.pushMultiplier).toBeLessThan(1);
  });

  it('after loading starts the position cannot change (no re-roll, AC05)', () => {
    const s0 = send(newRun(), { type: 'CONFIRM_POSITION' });
    expect(send(s0, { type: 'SET_POSITION', x: 0.3 })).toBe(s0);
    expect(send(s0, { type: 'CONFIRM_POSITION' })).toBe(s0);
    const s1 = toAiming(newRun());
    expect(send(s1, { type: 'SET_POSITION', x: 0.3 })).toBe(s1);
    expect(send(s1, { type: 'CONFIRM_POSITION' })).toBe(s1);
    expect(send(s1, { type: 'STOP_LOAD' })).toBe(s1);
  });

  it('rejected commands return the same object', () => {
    const s = newRun();
    expect(send(s, { type: 'FIRE' })).toBe(s);
    expect(send(s, { type: 'STOP_LOAD' })).toBe(s);
    expect(send(s, { type: 'AIM', yaw: 0.1, pitch: 0 })).toBe(s);
  });
});

describe('FIRE', () => {
  it('one fire consumes exactly one ammo and enters resolving with an in-flight marker', () => {
    const a = toAiming(newRun());
    const f = send(a, { type: 'FIRE' });
    expect(f.ammo).toBe(9);
    expect(f.shotsFired).toBe(1);
    expect(f.phase).toBe('resolving');
    expect(f.inFlight?.shotNumber).toBe(1);
    expect(f.inFlight?.shotId).toBe(mintId.shot(1));
    expect(f.inFlight?.request.load).toEqual(a.load);
  });

  it('double FIRE still consumes one; cannot fire while resolving', () => {
    const f = send(toAiming(newRun()), { type: 'FIRE' });
    const g = send(f, { type: 'FIRE' });
    expect(g).toBe(f);
    expect(g.ammo).toBe(9);
    expect(g.shotsFired).toBe(1);
  });

  it('cannot fire in position or loading', () => {
    const p = newRun();
    expect(send(p, { type: 'FIRE' }).ammo).toBe(10);
    const l = send(p, { type: 'CONFIRM_POSITION' });
    expect(send(l, { type: 'FIRE' })).toBe(l);
  });

  it('cannot fire with 0 ammo', () => {
    const a = { ...toAiming(newRun()), ammo: 0 };
    expect(send(a, { type: 'FIRE' })).toBe(a);
  });

  it('the shot direction is the direction of the visible effective aim (no hidden offset)', () => {
    let a = toAiming(newRun(3));
    a = send(a, { type: 'SET_POSITION', x: 0.1 }); // rejected in aiming
    a = send(a, { type: 'AIM', yaw: 0.07, pitch: -0.04 });
    a = tick(a, 2.3);
    const visible = effectiveAim(a, T);
    const f = send(a, { type: 'FIRE' });
    expect(f.inFlight?.request.direction).toEqual(aimToDirection(a.standX, visible));
    const d = f.inFlight!.request.direction;
    expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 9);
    expect(f.inFlight?.request.origin.x).toBe(a.standX);
  });
});

describe('time and pause', () => {
  it('tick never batch-advances: a huge dt is clamped', () => {
    const l = send(newRun(), { type: 'CONFIRM_POSITION' });
    const t = tickRun(l, 50, T);
    expect(t.clocks.loadingSec).toBeLessThanOrEqual(0.1 + 1e-12);
    expect(t.clocks.loadingSec).toBeGreaterThan(0);
  });

  it('clocks only advance in their own phase', () => {
    const p = newRun();
    const t = tickRun(p, 0.05, T);
    expect(t.clocks.loadingSec).toBe(0);
    expect(t.clocks.aimingSec).toBe(0);
    const a = toAiming(newRun());
    const u = tickRun(a, 0.05, T);
    expect(u.clocks.aimingSec).toBeCloseTo(0.05);
    expect(u.clocks.loadingSec).toBe(a.clocks.loadingSec);
    expect(u.clocks.heartPhase).toBeGreaterThan(a.clocks.heartPhase);
    const r = send(a, { type: 'FIRE' });
    const v = tickRun(r, 0.05, T);
    expect(v.clocks).toEqual(r.clocks);
  });

  it('the motion clock advances between shots but not while paused or resolving', () => {
    const p = newRun();
    expect(tickRun(p, 0.05, T).clocks.motionSec).toBeCloseTo(0.05);
    const paused = send(p, { type: 'PAUSE', reason: 'manual' });
    expect(tickRun(paused, 0.05, T)).toBe(paused);
  });

  it('paused rejects everything except PAUSE / RESUME / SKIP_PRESENTATION / ABANDON', () => {
    const base = toAiming(newRun());
    const p = send(base, { type: 'PAUSE', reason: 'manual' });
    expect(p.pauseReasons).toEqual(['manual']);
    expect(send(p, { type: 'FIRE' })).toBe(p);
    expect(send(p, { type: 'AIM', yaw: 0.1, pitch: 0 })).toBe(p);
    expect(send(p, { type: 'STOP_LOAD' })).toBe(p);
    expect(send(p, { type: 'SET_POSITION', x: 0 })).toBe(p);
    expect(send(p, { type: 'CONFIRM_POSITION' })).toBe(p);
    expect(tickRun(p, 0.05, T)).toBe(p);
    expect(send(p, { type: 'SKIP_PRESENTATION' })).toBe(p);
    expect(send(p, { type: 'RESUME', reason: 'manual' }).pauseReasons).toEqual([]);
    expect(send(p, { type: 'ABANDON' }).phase).toBe('abandoned');
  });

  it('hidden / landscape also add manual; the player must RESUME manual explicitly', () => {
    const base = toAiming(newRun());
    const h = send(base, { type: 'PAUSE', reason: 'hidden' });
    expect(h.pauseReasons).toEqual(['hidden', 'manual']);
    const back = send(h, { type: 'RESUME', reason: 'hidden' });
    expect(back.pauseReasons).toEqual(['manual']); // environment returned, still paused
    expect(send(back, { type: 'FIRE' })).toBe(back);
    expect(send(back, { type: 'RESUME', reason: 'manual' }).pauseReasons).toEqual([]);
    const l = send(base, { type: 'PAUSE', reason: 'landscape' });
    expect(l.pauseReasons).toEqual(['landscape', 'manual']);
    // duplicate pause is a no-op
    expect(send(h, { type: 'PAUSE', reason: 'hidden' })).toBe(h);
    // resuming a reason that is not set is a no-op
    expect(send(base, { type: 'RESUME', reason: 'manual' })).toBe(base);
  });

  it('pause keeps the aiming sway state frozen', () => {
    const a = tick(toAiming(newRun()), 1);
    const p = send(a, { type: 'PAUSE', reason: 'hidden' });
    const later = tickRun(tickRun(p, 0.1, T), 0.1, T);
    expect(later.clocks).toEqual(a.clocks);
  });
});
