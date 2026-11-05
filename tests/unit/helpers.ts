/** Shared test helpers (not a test file). */
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { PROTOTYPE_CATALOG } from '../../src/catalog/runtime-config';
import { classifyLoad } from '../../src/core/loading';
import { spawnPrize } from '../../src/core/replenish';
import { createRun } from '../../src/core/state';
import { reduceGame, tickRun, type GameContext } from '../../src/core/transitions';
import {
  BOOTH_LAYOUT,
  asPrizeTypeId,
  mintId,
  type GameCommand,
  type PrizeInstanceState,
  type RunState,
  type ShelfState,
  type ShotContext,
  type ShotRecord,
  type ShotRequest,
  type ShotWorld,
  type SimEvent,
  type SlotId,
  type TuningConfig,
  type Vec3,
} from '../../src/contracts';

export const T: TuningConfig = PROTOTYPE_TUNING;
export const CAT = PROTOTYPE_CATALOG;
export const ctx: GameContext = { tuning: T };

export function newRun(seed = 1, tuning: TuningConfig = T): RunState {
  return createRun({ runId: mintId.run('run-test'), seed, tuning, playerName: null }, CAT);
}
export const send = (s: RunState, c: GameCommand): RunState => reduceGame(s, c, ctx);
export function tick(s: RunState, sec: number): RunState {
  let out = s;
  let left = sec;
  while (left > 1e-9) {
    const dt = Math.min(0.05, left);
    out = tickRun(out, dt, T);
    left -= dt;
  }
  return out;
}
/** position -> loading (bar at the sweet spot) -> aiming. */
export function toAiming(s: RunState): RunState {
  let out = send(s, { type: 'CONFIRM_POSITION' });
  out = tick(out, 0.595);
  return send(out, { type: 'STOP_LOAD' });
}

/** Build a shelf holding exactly the given kinds in the given slots (new instance ids i0001...). */
export function shelfOf(entries: readonly (readonly [SlotId | string, string])[], motionSec = 0): ShelfState {
  const prizes: PrizeInstanceState[] = entries.map(([slot, type], i) => {
    const geom = BOOTH_LAYOUT.slots.find((s) => s.slotId === slot)!;
    return spawnPrize(CAT, asPrizeTypeId(type), geom, i + 1, motionSec);
  });
  return { prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 };
}

export function unit(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}
export function dirTo(from: Vec3, to: Vec3): Vec3 {
  return unit({ x: to.x - from.x, y: to.y - from.y, z: to.z - from.z });
}

/** Direction that makes a cork (with the tuning's gravity and speed) pass through `to`, ignoring collisions. */
export function ballisticDir(from: Vec3, to: Vec3, tuning: TuningConfig = T): Vec3 {
  const speed = tuning.cork.speed;
  const g = 9.81 * tuning.cork.gravityScale;
  let aim = to;
  for (let i = 0; i < 4; i++) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    const t = dist / speed;
    // the cork also falls by g*t^2/2 along the way, along -y
    aim = { x: to.x, y: to.y + 0.5 * g * t * t, z: to.z };
  }
  return dirTo(from, aim);
}

export function makeRequest(over: Partial<ShotRequest> & { direction: Vec3 }, shot = 1): ShotRequest {
  return {
    shotId: mintId.shot(shot),
    origin: { x: 0, y: BOOTH_LAYOUT.camera.muzzle.y, z: BOOTH_LAYOUT.camera.muzzle.z },
    load: classifyLoad(T.loading.sweetSpot, T),
    bulletType: 'standard',
    ...over,
  };
}
export const shotCtx: ShotContext = { runId: mintId.run('run-test'), chooseTransform: () => null };

export interface TimedEvent {
  readonly t: number;
  readonly event: SimEvent;
}
export interface ShotRun {
  readonly record: ShotRecord;
  readonly events: readonly TimedEvent[];
  readonly steps: number;
}

/** Fire and step (in render-sized chunks) until the record arrives. */
export function runShot(world: ShotWorld, request: ShotRequest, dt = 1 / 60, maxSteps = 5000): ShotRun {
  world.fire(request, shotCtx);
  const events: TimedEvent[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const step = world.step(dt);
    for (const event of step.frame.events) events.push({ t: step.frame.simTimeSec, event });
    if (step.record) return { record: step.record, events, steps: i + 1 };
  }
  throw new Error('shot did not finish within maxSteps');
}
