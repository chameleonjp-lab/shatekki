/** Helpers for device scenarios (Task 08): custom layouts and a runner that keeps every frame. Not a test file. */
import {
  BOOTH_LAYOUT,
  mintId,
  type BoothLayout,
  type DeviceGeometry,
  type DeviceKind,
  type ImpactEvent,
  type ShotContext,
  type ShotRecord,
  type ShotRequest,
  type ShotWorld,
  type SimEvent,
  type SimulationFrame,
  type StaticSurface,
  type Vec3,
} from '../../src/contracts';
import { shotCtx } from './helpers';

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => ({
  center: { x: cx, y: cy, z: cz },
  halfExtents: { x: hx, y: hy, z: hz },
});

/** A wall just in front of the counter, so that corks coming back from a plate fly toward the plate again. */
export const MIRROR: StaticSurface = { id: 'mirror', box: box(0, 1.25, -0.1, 1.0, 1.5, 0.02), material: 'wood', reflective: true };

export function plate(kind: DeviceKind, id: string, centerX = 0, halfX = 1.0, z = -1.2): DeviceGeometry {
  return {
    deviceId: mintId.device(id),
    kind,
    box: box(centerX, 1.25, z, halfX, 1.5, 0.01),
    faceNormal: { x: 0, y: 0, z: 1 },
    directlyReachable: true,
  };
}

export function layoutWith(devices: readonly DeviceGeometry[], mirror = true): BoothLayout {
  return { ...BOOTH_LAYOUT, devices, shopkeeper: [], hiddenTargets: [], surfaces: mirror ? [...BOOTH_LAYOUT.surfaces, MIRROR] : BOOTH_LAYOUT.surfaces };
}

export interface FullRun {
  readonly record: ShotRecord;
  readonly events: readonly SimEvent[];
  readonly frames: readonly SimulationFrame[];
}

export function runFull(world: ShotWorld, request: ShotRequest, context: ShotContext = shotCtx, dt = 1 / 60, maxSteps = 3000): FullRun {
  world.fire(request, context);
  const events: SimEvent[] = [];
  const frames: SimulationFrame[] = [];
  for (let i = 0; i < maxSteps; i++) {
    const step = world.step(dt);
    frames.push(step.frame);
    events.push(...step.frame.events);
    if (step.record) return { record: step.record, events, frames };
  }
  throw new Error('shot did not finish');
}

export const impactsOnDevices = (events: readonly SimEvent[]): ImpactEvent[] =>
  events.filter((e): e is ImpactEvent => e.type === 'impact' && e.target.kind === 'device');

export const straight: Vec3 = { x: 0, y: 0, z: -1 };
