/**
 * Game state transitions (Task 04). Pure: no clock, no storage, no physics.
 *
 * reduceGame returns the SAME object for any rejected (or no-op) command so
 * callers and tests can detect rejection by identity.
 *
 *   position --CONFIRM_POSITION--> loading --STOP_LOAD--> aiming --FIRE--> resolving
 *   resolving --(resolveShot, Task 06)--> position | ended
 *
 * The position cannot change after loading starts (AC05: no re-roll).
 */
import type { BoothLayout, GameCommand, PauseReason, RunState, ShotRequest, TuningConfig } from '../contracts';
import { BOOTH_LAYOUT, mintId } from '../contracts';
import { aimToDirection, clampAim, effectiveAim, heartBpm, muzzleAt } from './aim';
import { classifyLoad, loadingBarValue } from './loading';

export interface GameContext {
  readonly tuning: TuningConfig;
  readonly layout?: BoothLayout;
}

/** Largest dt applied in one tick; bigger steps are clamped, never batch-advanced. */
export const MAX_TICK_SEC = 0.1;

const PAUSE_ORDER: readonly PauseReason[] = ['hidden', 'landscape', 'manual'];
const sortReasons = (r: Iterable<PauseReason>): PauseReason[] => PAUSE_ORDER.filter((x) => new Set(r).has(x));

const isTerminal = (s: RunState): boolean => s.phase === 'ended' || s.phase === 'abandoned';

export function reduceGame(state: RunState, command: GameCommand, ctx: GameContext): RunState {
  const layout = ctx.layout ?? BOOTH_LAYOUT;
  if (isTerminal(state)) return state;

  switch (command.type) {
    case 'PAUSE': {
      if (state.pauseReasons.includes(command.reason)) return state;
      const add: PauseReason[] = [command.reason];
      if (command.reason !== 'manual') add.push('manual');
      return { ...state, pauseReasons: sortReasons([...state.pauseReasons, ...add]) };
    }
    case 'RESUME': {
      if (!state.pauseReasons.includes(command.reason)) return state;
      return { ...state, pauseReasons: state.pauseReasons.filter((r) => r !== command.reason) };
    }
    case 'ABANDON':
      return { ...state, phase: 'abandoned', pauseReasons: [] };
    case 'SKIP_PRESENTATION':
      // Presentation only (decision 26): never changes results, so the core state is untouched.
      return state;
    default:
      break;
  }

  if (state.pauseReasons.length > 0) return state;

  switch (command.type) {
    case 'SET_POSITION': {
      if (state.phase !== 'position') return state;
      const x = Math.min(layout.camera.standMaxX, Math.max(layout.camera.standMinX, command.x));
      return x === state.standX ? state : { ...state, standX: x };
    }
    case 'CONFIRM_POSITION': {
      if (state.phase !== 'position') return state;
      return { ...state, phase: 'loading', load: null, clocks: { ...state.clocks, loadingSec: 0 } };
    }
    case 'STOP_LOAD': {
      if (state.phase !== 'loading') return state;
      const load = classifyLoad(loadingBarValue(state.clocks.loadingSec, ctx.tuning), ctx.tuning);
      return {
        ...state,
        phase: 'aiming',
        load,
        clocks: { ...state.clocks, aimingSec: 0, heartPhase: 0 },
      };
    }
    case 'AIM': {
      if (state.phase !== 'aiming') return state;
      const aim = clampAim({ yaw: command.yaw, pitch: command.pitch }, layout);
      return aim.yaw === state.aim.yaw && aim.pitch === state.aim.pitch ? state : { ...state, aim };
    }
    case 'FIRE': {
      if (state.phase !== 'aiming' || state.inFlight !== null || state.ammo < 1 || state.load === null) return state;
      const shotNumber = state.shotsFired + 1;
      const shotId = mintId.shot(shotNumber);
      const request: ShotRequest = {
        shotId,
        origin: muzzleAt(state.standX, layout),
        direction: aimToDirection(state.standX, effectiveAim(state, ctx.tuning), layout),
        load: state.load,
        bulletType: state.bulletType,
      };
      return {
        ...state,
        phase: 'resolving',
        ammo: state.ammo - 1,
        shotsFired: shotNumber,
        inFlight: { shotId, shotNumber, request },
      };
    }
    default:
      return state;
  }
}

/**
 * Advance the core clocks. Only when not paused, only for the clock of the
 * current phase. The motion clock runs between shots only (during `resolving`
 * the physics world owns the motion time; resolveShot adds its duration).
 */
export function tickRun(state: RunState, dtSec: number, tuning: TuningConfig): RunState {
  if (!Number.isFinite(dtSec) || dtSec <= 0) return state;
  if (state.pauseReasons.length > 0 || isTerminal(state)) return state;
  const dt = Math.min(dtSec, MAX_TICK_SEC);
  const c = state.clocks;
  switch (state.phase) {
    case 'position':
      return { ...state, clocks: { ...c, motionSec: c.motionSec + dt } };
    case 'loading':
      return { ...state, clocks: { ...c, loadingSec: c.loadingSec + dt, motionSec: c.motionSec + dt } };
    case 'aiming': {
      const aimingSec = c.aimingSec + dt;
      const heartPhase = c.heartPhase + (heartBpm(aimingSec, tuning) / 60) * dt;
      return { ...state, clocks: { ...c, aimingSec, heartPhase, motionSec: c.motionSec + dt } };
    }
    default:
      return state;
  }
}
