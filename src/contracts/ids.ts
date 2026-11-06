/**
 * Identifier contracts (Task 02).
 *
 * Type IDs (what kind of prize) and instance IDs (which physical prize on the
 * shelf) are deliberately different branded types so that code cannot use one
 * where the other is required (requirements §4, plan "PrizeInstance").
 */

declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

/** Prize kind, e.g. "P001". Same value across languages and runs. */
export type PrizeTypeId = Brand<string, 'PrizeTypeId'>;
/** One physical prize placed on the shelf in one run, e.g. "i0007". Never reused within a run. */
export type PrizeInstanceId = Brand<string, 'PrizeInstanceId'>;
/** Hidden set kind, e.g. "S001". */
export type SetId = Brand<string, 'SetId'>;
/** One play (run). UUID-like string. */
export type RunId = Brand<string, 'RunId'>;
/** One shot inside a run, e.g. "s03". */
export type ShotId = Brand<string, 'ShotId'>;
/** One flying cork (the original or a split child) inside a shot, e.g. "s03-c0". */
export type ProjectileId = Brand<string, 'ProjectileId'>;
/** A background device (split plate, power plate, ...). */
export type DeviceId = Brand<string, 'DeviceId'>;
/** A shelf slot: tier 0 (bottom) .. 2 (top), column 0 (left) .. 2 (right). */
export type SlotId = Brand<string, 'SlotId'>;
/** Unique id of a simulation event inside a run. */
export type EventId = Brand<string, 'EventId'>;

const PRIZE_TYPE_RE = /^P\d{3}$/;
const SET_RE = /^S\d{3}$/;
const SLOT_RE = /^t[0-2]c[0-2]$/;

export function isPrizeTypeId(v: unknown): v is PrizeTypeId {
  return typeof v === 'string' && PRIZE_TYPE_RE.test(v);
}
export function isSetId(v: unknown): v is SetId {
  return typeof v === 'string' && SET_RE.test(v);
}
export function isSlotId(v: unknown): v is SlotId {
  return typeof v === 'string' && SLOT_RE.test(v);
}

export function asPrizeTypeId(v: string): PrizeTypeId {
  if (!isPrizeTypeId(v)) throw new TypeError(`invalid PrizeTypeId: ${v}`);
  return v;
}
export function asSetId(v: string): SetId {
  if (!isSetId(v)) throw new TypeError(`invalid SetId: ${v}`);
  return v;
}
export function asSlotId(v: string): SlotId {
  if (!isSlotId(v)) throw new TypeError(`invalid SlotId: ${v}`);
  return v;
}
export function slotIdOf(tier: number, column: number): SlotId {
  return asSlotId(`t${tier}c${column}`);
}

/** Unchecked constructors for ids the simulation itself mints. */
export const mintId = {
  instance: (n: number) => `i${String(n).padStart(4, '0')}` as PrizeInstanceId,
  shot: (n: number) => `s${String(n).padStart(2, '0')}` as ShotId,
  projectile: (shot: ShotId, n: number) => `${shot}-c${n}` as ProjectileId,
  event: (shot: ShotId, n: number) => `${shot}-e${n}` as EventId,
  run: (s: string) => s as RunId,
  device: (s: string) => s as DeviceId,
};
