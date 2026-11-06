/**
 * Aiming and hand sway (Task 07, calculation part).
 *
 * The sway is a deterministic function of the aiming time and the run seed: a
 * calm period at the base amplitude, then growth up to a cap, plus a pulse
 * driven by the in-game heartbeat clock. The heartbeat is a game variable
 * (decision 22); no real heart-rate sensor is read anywhere.
 *
 * `effectiveAim` is exactly what the player sees. FIRE uses the direction of
 * this value and nothing else: there is NO hidden extra offset.
 */
import type { AimAngles, BoothLayout, RunState, TuningConfig, Vec3 } from '../contracts';
import { BOOTH_LAYOUT, aimDirection, muzzlePosition } from '../contracts';

const TAU = Math.PI * 2;

export function heartBpm(aimingSec: number, tuning: TuningConfig): number {
  const a = tuning.aim;
  return Math.min(a.bpmMax, a.bpmStart + a.bpmRisePerSec * Math.max(0, aimingSec));
}

/** Sway amplitude (rad) after `aimingSec` seconds of aiming. Non-decreasing, capped. */
export function swayAmplitude(aimingSec: number, tuning: TuningConfig): number {
  const a = tuning.aim;
  const t = Math.max(0, aimingSec);
  if (t <= a.calmSec) return a.baseAmplitudeRad;
  return Math.min(a.maxAmplitudeRad, a.baseAmplitudeRad + a.growthRadPerSec * (t - a.calmSec));
}

/** 32-bit integer hash → [0, 1). */
function hash01(seed: number, salt: number): number {
  let h = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(salt | 0, 0x85ebca6b)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 0x100000000;
}

/** Heartbeat pulse 0..1 for a heart phase measured in beats. Sharp peak once per beat. */
export function heartPulse(heartPhase: number): number {
  const p = heartPhase - Math.floor(heartPhase);
  return Math.pow(Math.max(0, Math.sin(TAU * p)), 6);
}

type SwayInput = Pick<RunState, 'seed' | 'shotsFired' | 'clocks'>;

/** Sway offset added on top of the requested aim. Deterministic in (seed, shot, clocks). */
export function swayOffset(state: SwayInput, tuning: TuningConfig): AimAngles {
  const amp = swayAmplitude(state.clocks.aimingSec, tuning);
  const t = state.clocks.aimingSec;
  const salt = state.shotsFired * 4;
  const p1 = hash01(state.seed, salt + 1) * TAU;
  const p2 = hash01(state.seed, salt + 2) * TAU;
  const p3 = hash01(state.seed, salt + 3) * TAU;
  const p4 = hash01(state.seed, salt + 4) * TAU;
  const yaw = amp * (0.65 * Math.sin(TAU * 0.55 * t + p1) + 0.35 * Math.sin(TAU * 1.3 * t + p2));
  const pitch =
    amp * (0.65 * Math.sin(TAU * 0.4 * t + p3) + 0.35 * Math.sin(TAU * 1.1 * t + p4)) +
    amp * 0.5 * heartPulse(state.clocks.heartPhase);
  return { yaw, pitch };
}

export function clampAim(aim: AimAngles, layout: BoothLayout = BOOTH_LAYOUT): AimAngles {
  const c = layout.camera;
  return {
    yaw: Math.min(c.yawLimit, Math.max(-c.yawLimit, aim.yaw)),
    pitch: Math.min(c.pitchMax, Math.max(c.pitchMin, aim.pitch)),
  };
}

/**
 * Expanded rules: the sway multiplier reserved for the shot being aimed
 * (FX012/013/035/036). 1 for rules-v1 states.
 */
export function swayMultiplierFor(state: Partial<Pick<RunState, 'expansion'>>): number {
  const m = state.expansion?.next.modifiers.swayMult;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
}

/**
 * Factor applied to the sway offset: the amplitude times the multiplier, still
 * capped by tuning.aim.maxAmplitudeRad (effects appendix §3.2).
 */
export function swayScale(state: Pick<RunState, 'clocks'> & Partial<Pick<RunState, 'expansion'>>, tuning: TuningConfig): number {
  const mult = swayMultiplierFor(state);
  if (mult === 1) return 1;
  const amp = swayAmplitude(state.clocks.aimingSec, tuning);
  if (!(amp > 0)) return 1;
  return Math.min(tuning.aim.maxAmplitudeRad, amp * mult) / amp;
}

/** The aim the player sees: requested aim + sway. The reticle and FIRE both use exactly this. */
export function effectiveAim(state: SwayInput & Pick<RunState, 'aim'> & Partial<Pick<RunState, 'expansion'>>, tuning: TuningConfig): AimAngles {
  const s = swayOffset(state, tuning);
  const k = swayScale(state, tuning);
  if (k === 1) return { yaw: state.aim.yaw + s.yaw, pitch: state.aim.pitch + s.pitch };
  return { yaw: state.aim.yaw + s.yaw * k, pitch: state.aim.pitch + s.pitch * k };
}

/** Muzzle position for a stand position (shared convention in src/contracts/aim.ts). */
export function muzzleAt(standX: number, layout: BoothLayout = BOOTH_LAYOUT): Vec3 {
  return muzzlePosition(layout, standX);
}

/** Unit direction for an aim (shared convention in src/contracts/aim.ts). */
export function aimToDirection(standX: number, aim: AimAngles, layout: BoothLayout = BOOTH_LAYOUT): Vec3 {
  return aimDirection(layout, standX, aim);
}
