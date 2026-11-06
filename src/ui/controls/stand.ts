/**
 * Stand-position helpers for the wide stall (layout v2, ±2.35 m). Pure.
 * Position and aiming stay separate controls; the rules still accept
 * SET_POSITION only in the position phase.
 */
export interface StandRange {
  readonly min: number;
  readonly max: number;
  /** Distance between column centres (m). */
  readonly step: number;
  /** x of the first column centre. */
  readonly origin: number;
}

export function standRangeOf(layout: { camera: { standMinX: number; standMaxX: number }; slots: readonly { spawnBase: { x: number } }[] }): StandRange {
  const xs = layout.slots.map((s) => s.spawnBase.x);
  const first = Math.min(...xs);
  const distinct = [...new Set(xs.map((x) => Math.round(x * 1000)))].sort((a, b) => a - b);
  const step = distinct.length > 1 ? (distinct[1]! - distinct[0]!) / 1000 : 0.42;
  return { min: layout.camera.standMinX, max: layout.camera.standMaxX, step, origin: first };
}

/** One column step in `dir` (-1 left, +1 right): snaps to the next column centre, clamped to the range. */
export function nextStandX(current: number, dir: -1 | 1, r: StandRange): number {
  const k = (current - r.origin) / r.step;
  const eps = 1e-3;
  const idx = dir > 0 ? (Math.abs(k - Math.round(k)) < eps ? Math.round(k) + 1 : Math.ceil(k)) : Math.abs(k - Math.round(k)) < eps ? Math.round(k) - 1 : Math.floor(k);
  return Math.max(r.min, Math.min(r.max, r.origin + idx * r.step));
}

/** Stand speed while a side button is held for a while (m/s); about three seconds end to end. */
export const WIDE_STAND_SPEED = 1.6;
/** A press shorter than this is a one-column step; longer, the stand glides. */
export const HOLD_DELAY_MS = 320;
