import { describe, expect, it } from 'vitest';
import { controlsModel } from '../../src/ui/controls/model';
import { JA_CONTROLS } from '../../src/ui/controls/strings';
import { mintId, type RunState, type ViewState } from '../../src/contracts';

function state(over: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1, runId: mintId.run('r'), rulesVersion: 't', valueStatus: 'prototype', phase: 'position', pauseReasons: [],
    ammo: 10, bonusAmmoTotal: 0, shotsFired: 0, score: 0, ledger: [], collected: [], collectedTypeIds: [], completedSets: [],
    firstHitsScored: [], maxChain: 0, shelf: { prizes: [], deferredSlots: [], nextInstanceNumber: 1 },
    draw: { rng: [1, 2, 3, 4], history: [], drawCount: 0 }, standX: 0, aim: { yaw: 0, pitch: 0 }, load: null,
    bulletType: 'standard', clocks: { loadingSec: 0, aimingSec: 0, heartPhase: 0, motionSec: 0 }, inFlight: null,
    playerName: null, seed: 1, ...over,
  };
}
const view = (over: Partial<ViewState> = {}): ViewState => ({
  phase: 'position', standX: 0, effectiveAim: { yaw: 0, pitch: 0 }, loadingBar: null, paused: false,
  ballistic: { speed: 11, gravity: 5.9, fixedStepSec: 1 / 120, bulletType: 'standard' }, ...over,
});

describe('minimal controls model (Task 07)', () => {
  it('maps each phase to a panel mode with a defined hint', () => {
    for (const phase of ['position', 'loading', 'aiming', 'resolving', 'ended', 'abandoned'] as const) {
      const m = controlsModel(state({ phase }), view({ phase }), 10, null);
      expect(m.mode).toBe(phase);
      expect(JA_CONTROLS[m.hintKey]).toBeTruthy();
    }
  });
  it('paused overrides the phase except after the run is over', () => {
    expect(controlsModel(state({ phase: 'aiming' }), view({ paused: true }), 10, null).mode).toBe('paused');
    expect(controlsModel(state({ phase: 'ended' }), view({ paused: true }), 10, null).mode).toBe('ended');
  });
  it('fire is enabled only while aiming with a loaded cork and ammo left', () => {
    const load = { barValue: 0.85, tier: 'perfect' as const, damageMultiplier: 1.5, pushMultiplier: 1.35 };
    expect(controlsModel(state({ phase: 'aiming', load }), view({ phase: 'aiming' }), 10, null).canFire).toBe(true);
    expect(controlsModel(state({ phase: 'aiming', load: null }), view({ phase: 'aiming' }), 10, null).canFire).toBe(false);
    expect(controlsModel(state({ phase: 'aiming', load, ammo: 0 }), view({ phase: 'aiming' }), 10, null).canFire).toBe(false);
    expect(controlsModel(state({ phase: 'loading', load }), view({ phase: 'loading' }), 10, null).canFire).toBe(false);
    expect(controlsModel(state({ phase: 'aiming', load }), view({ phase: 'aiming', paused: true }), 10, null).canFire).toBe(false);
  });
});
