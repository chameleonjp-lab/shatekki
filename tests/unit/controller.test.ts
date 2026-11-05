import { describe, expect, it, vi } from 'vitest';
import { GameController, MAX_FRAME_DT, type RulesApi } from '../../src/app/controller';
import {
  BOOTH_LAYOUT,
  mintId,
  type RunState,
  type RuntimeCatalog,
  type ShotRecord,
  type ShotSummary,
  type ShotWorld,
  type SimulationFrame,
  type SimulationStep,
  type TuningConfig,
  type ShotRequest,
} from '../../src/contracts';

// Fakes only: these tests check the controller's wiring, not game rules.
const tuning = { valueStatus: 'prototype' } as unknown as TuningConfig;
const catalog = { rulesVersion: 'test', prizes: new Map(), sets: new Map() } as RuntimeCatalog;

function baseState(over: Partial<RunState> = {}): RunState {
  return {
    schemaVersion: 1,
    runId: mintId.run('r'),
    rulesVersion: 'test',
    valueStatus: 'prototype',
    phase: 'aiming',
    pauseReasons: [],
    ammo: 10,
    bonusAmmoTotal: 0,
    shotsFired: 0,
    score: 0,
    ledger: [],
    collected: [],
    collectedTypeIds: [],
    completedSets: [],
    firstHitsScored: [],
    maxChain: 0,
    shelf: { prizes: [], deferredSlots: [], nextInstanceNumber: 1 },
    draw: { rng: [1, 2, 3, 4], history: [], drawCount: 0 },
    standX: 0,
    aim: { yaw: 0, pitch: 0 },
    load: { barValue: 0.85, tier: 'perfect', damageMultiplier: 1.5, pushMultiplier: 1.35 },
    bulletType: 'standard',
    clocks: { loadingSec: 0, aimingSec: 0, heartPhase: 0, motionSec: 0 },
    inFlight: null,
    playerName: null,
    seed: 1,
    ...over,
  };
}

const emptyFrame: SimulationFrame = { simTimeSec: 0, shotId: null, stage: null, prizes: [], projectiles: [], events: [] };

function fakeWorld(stepsUntilRecord: number) {
  let inShot = false;
  let remaining = 0;
  let current: ShotRequest | null = null;
  const world: ShotWorld & { fired: ShotRequest[]; steps: number[] } = {
    fired: [],
    steps: [],
    syncShelf: vi.fn(),
    fire(req) {
      if (inShot) throw new Error('already in shot');
      inShot = true;
      remaining = stepsUntilRecord;
      current = req;
      this.fired.push(req);
    },
    step(dt): SimulationStep {
      this.steps.push(dt);
      if (!inShot || !current) return { frame: emptyFrame, record: null };
      remaining -= 1;
      if (remaining > 0) return { frame: emptyFrame, record: null };
      inShot = false;
      const record: ShotRecord = {
        runId: mintId.run('r'),
        shotId: current.shotId,
        collected: [],
        prizeOutcomes: [],
        deviceActivations: [],
        firstHitCandidates: [],
        transforms: [],
        endedByLimit: false,
        remainingPrizes: [],
        simTimeSec: 1,
      };
      return { frame: emptyFrame, record };
    },
    frame: () => emptyFrame,
    get shotInProgress() {
      return inShot;
    },
    dispose: vi.fn(),
  };
  return world;
}

function fakeRules(): RulesApi & { resolved: number } {
  const rules: RulesApi & { resolved: number } = {
    resolved: 0,
    createRun: () => baseState(),
    reduceGame(state, command) {
      if (command.type === 'FIRE' && state.phase === 'aiming' && state.ammo > 0) {
        const shotId = mintId.shot(state.shotsFired + 1);
        return {
          ...state,
          phase: 'resolving',
          ammo: state.ammo - 1,
          shotsFired: state.shotsFired + 1,
          inFlight: {
            shotId,
            shotNumber: state.shotsFired + 1,
            request: { shotId, origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 }, load: state.load!, bulletType: 'standard' },
          },
        };
      }
      if (command.type === 'PAUSE') return { ...state, pauseReasons: [...new Set([...state.pauseReasons, command.reason, 'manual' as const])].sort() };
      if (command.type === 'RESUME') return { ...state, pauseReasons: state.pauseReasons.filter((r) => r !== command.reason) };
      return state;
    },
    tickRun: (s) => s,
    effectiveAim: (s) => s.aim,
    loadingBarValue: () => 0.5,
    resolveShot(state) {
      rules.resolved += 1;
      const next: RunState = { ...state, phase: 'aiming', inFlight: null };
      return { state: next, summary: { shotId: state.inFlight!.shotId } as ShotSummary };
    },
    transformChooser: () => () => null,
  };
  return rules;
}

function make(stepsUntilRecord = 3) {
  const world = fakeWorld(stepsUntilRecord);
  const rules = fakeRules();
  const settled: ShotSummary[] = [];
  const c = new GameController(
    { rules, world, renderer: null, catalog, tuning, layout: BOOTH_LAYOUT, onShotSettled: (s) => settled.push(s) },
    baseState(),
  );
  return { c, world, rules, settled };
}

describe('GameController wiring', () => {
  it('starts exactly one sim shot per accepted FIRE, even when FIRE is tapped twice', () => {
    const { c, world } = make();
    expect(c.dispatch({ type: 'FIRE' })).toBe(true);
    expect(c.dispatch({ type: 'FIRE' })).toBe(false);
    expect(world.fired).toHaveLength(1);
    expect(c.current.ammo).toBe(9);
  });

  it('rejects UI input that tries to carry results', () => {
    const { c, world } = make();
    expect(c.dispatch({ type: 'FIRE', score: 999 })).toBe(false);
    expect(c.dispatch({ type: 'SETTLE' })).toBe(false);
    expect(world.fired).toHaveLength(0);
  });

  it('settles the shot exactly once when the world returns its record', () => {
    const { c, rules, settled } = make(3);
    c.dispatch({ type: 'FIRE' });
    c.frame(1 / 60);
    c.frame(1 / 60);
    expect(rules.resolved).toBe(0);
    c.frame(1 / 60);
    expect(rules.resolved).toBe(1);
    c.frame(1 / 60);
    c.frame(1 / 60);
    expect(rules.resolved).toBe(1);
    expect(settled).toHaveLength(1);
    expect(c.current.inFlight).toBeNull();
  });

  it('does not advance the world while paused and does not catch up on resume', () => {
    const { c, world } = make(3);
    c.dispatch({ type: 'FIRE' });
    c.setEnvironmentPause(['hidden']);
    c.frame(5);
    c.frame(5);
    expect(world.steps).toHaveLength(0);
    c.setEnvironmentPause([]);
    // environment cleared, but the explicit resume (manual) is still required
    c.frame(1 / 60);
    expect(world.steps).toHaveLength(0);
    c.dispatch({ type: 'RESUME', reason: 'manual' });
    c.frame(10); // a huge gap is clamped
    expect(world.steps).toEqual([MAX_FRAME_DT]);
  });

  it('skipping presentation does not stop or shorten the shot', () => {
    const { c, rules } = make(3);
    c.dispatch({ type: 'FIRE' });
    expect(c.dispatch({ type: 'SKIP_PRESENTATION' })).toBe(true);
    c.frame(1 / 60);
    expect(rules.resolved).toBe(0);
    c.frame(1 / 60);
    c.frame(1 / 60);
    expect(rules.resolved).toBe(1);
  });
});
