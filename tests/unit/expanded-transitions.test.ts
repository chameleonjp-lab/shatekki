import { describe, expect, it } from 'vitest';
import { BASE_SHOT_MODIFIERS, parseCommand, type ExpansionRunState, type RunState, type ShotModifiers } from '../../src/contracts';
import { effectiveAim, swayOffset } from '../../src/core/aim';
import { loadingBarValue, loadPeriodMultiplierFor } from '../../src/core/loading';
import { CORE_RULES } from '../../src/app/rules';
import { T, newRun, send, tick, toAiming } from './helpers';

// Expanded rules (D34-D37) on the core reducer: the reserved next-shot
// settings act on loading/aiming and are consumed only by an accepted FIRE.

function expansionWith(modifiers: Partial<ShotModifiers>): ExpansionRunState {
  return {
    cells: [],
    questionOrder: [],
    questionCursor: 0,
    next: { modifiers: { ...BASE_SHOT_MODIFIERS, ...modifiers }, hint: 'angleTicks' },
    active: null,
    assortmentSeries: null,
    outlineSeries: null,
    deferredTransforms: [],
    rng: { cells: [1, 2, 3, 4], questions: [5, 6, 7, 8], effects: [9, 10, 11, 12] },
  };
}

function expanded(base: RunState, modifiers: Partial<ShotModifiers> = {}): RunState {
  return { ...base, schemaVersion: 2, ammoLostTotal: 0, expansion: expansionWith(modifiers) };
}

describe('expanded FIRE consumes the next-shot reservation once', () => {
  it('moves next → active, resets next, uses the reserved bullet type, and keeps phase resolving', () => {
    const s = toAiming(expanded(newRun(3), { bulletType: 'heavy', damageMult: 1.5 }));
    expect(s.phase).toBe('aiming');
    const fired = send(s, { type: 'FIRE' });
    expect(fired.phase).toBe('resolving');
    expect(fired.inFlight?.stage).toBe('flight');
    expect(fired.inFlight?.request.bulletType).toBe('heavy');
    expect(fired.bulletType).toBe(s.bulletType); // the run's own bullet type is not changed
    expect(fired.expansion?.active?.modifiers.damageMult).toBe(1.5);
    expect(fired.expansion?.active?.hint).toBe('angleTicks');
    expect(fired.expansion?.next).toEqual({ modifiers: BASE_SHOT_MODIFIERS, hint: null });
    expect(fired.pauseReasons).toEqual([]);
  });

  it('does not consume the reservation when FIRE is rejected, on re-positioning, or while paused', () => {
    const reserved = expanded(newRun(4), { speedMult: 1.2 });
    const moved = send(reserved, { type: 'SET_POSITION', x: 0.2 });
    expect(moved.expansion?.next.modifiers.speedMult).toBe(1.2);
    const aiming = toAiming(moved);
    const paused = send(aiming, { type: 'PAUSE', reason: 'manual' });
    expect(send(paused, { type: 'FIRE' })).toBe(paused);
    expect(paused.expansion?.next.modifiers.speedMult).toBe(1.2);
    const noAmmo = { ...aiming, ammo: 0 };
    expect(send(noAmmo, { type: 'FIRE' })).toBe(noAmmo);
  });

  it('leaves rules-v1 FIRE exactly as before (no stage, no expansion)', () => {
    const s = toAiming(newRun(5));
    const fired = send(s, { type: 'FIRE' });
    expect(fired.inFlight).toEqual({ shotId: fired.inFlight!.shotId, shotNumber: 1, request: fired.inFlight!.request });
    expect('stage' in fired.inFlight!).toBe(false);
    expect(fired.expansion).toBeUndefined();
  });

  it('rules-v1 rejects an answer command by identity', () => {
    const s = send(toAiming(newRun(6)), { type: 'FIRE' });
    const parsed = parseCommand({ type: 'ANSWER_SHOPKEEPER', shotId: s.inFlight!.shotId, questionId: 'Q001', choice: 'A' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(send(s, parsed.command)).toBe(s);
  });
});

describe('expanded sway and loading multipliers act on what the player sees and what FIRE uses', () => {
  it('scales the sway offset and keeps it within the existing amplitude cap', () => {
    const base = tick(toAiming(newRun(7)), 1.5);
    const calm = { ...expanded(base, { swayMult: 0.5 }), clocks: base.clocks };
    const shaky = { ...expanded(base, { swayMult: 1.5 }), clocks: base.clocks };
    const off = swayOffset(base, T);
    const aimCalm = effectiveAim(calm, T);
    expect(aimCalm.yaw - base.aim.yaw).toBeCloseTo(off.yaw * 0.5, 12);
    expect(aimCalm.pitch - base.aim.pitch).toBeCloseTo(off.pitch * 0.5, 12);
    // Late in the aim the amplitude is already at the cap, so ×1.5 cannot exceed it.
    const late = tick(toAiming(newRun(7)), 30);
    const lateShaky = { ...expanded(late, { swayMult: 1.5 }), clocks: late.clocks };
    expect(effectiveAim(lateShaky, T)).toEqual(effectiveAim(late, T));
    expect(effectiveAim(shaky, T)).not.toEqual(effectiveAim(base, T));
    // FIRE uses the same direction the player saw.
    const firedV1 = send(base, { type: 'FIRE' });
    const firedCalm = send(calm, { type: 'FIRE' });
    expect(firedCalm.inFlight!.request.direction).not.toEqual(firedV1.inFlight!.request.direction);
  });

  it('changes the loading-bar period only for the reserved shot; rules-v1 values are bit-identical', () => {
    expect(loadPeriodMultiplierFor(newRun(8))).toBe(1);
    const slow = expanded(newRun(8), { loadPeriodMult: 1.15 });
    expect(loadPeriodMultiplierFor(slow)).toBe(1.15);
    const sec = 0.5;
    expect(loadingBarValue(sec, T, 1)).toBe(loadingBarValue(sec, T));
    expect(loadingBarValue(sec, T, 1.15)).toBeCloseTo(loadingBarValue(sec / 1.15, T), 12);
    const loading = send(slow, { type: 'CONFIRM_POSITION' });
    const advanced = tick(loading, 0.4);
    expect(CORE_RULES.loadingBarValue(advanced, T)).toBeCloseTo(loadingBarValue(0.4, T, 1.15), 9);
    const stopped = send(advanced, { type: 'STOP_LOAD' });
    expect(stopped.load?.barValue).toBeCloseTo(loadingBarValue(0.4, T, 1.15), 9);
  });
});
