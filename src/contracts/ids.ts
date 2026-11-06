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

// ---- expanded gameplay (D34-D37, plan EG01) -------------------------------
/** Shopkeeper question, Q001..Q200. */
export type QuestionId = Brand<string, 'QuestionId'>;
/** Gameplay effect, FX001..FX100. */
export type EffectId = Brand<string, 'EffectId'>;
/** Answer lottery group (GAIN, RISK, STOCK, GUIDE, MIX, CHAOS). */
export type EffectGroupId = Brand<string, 'EffectGroupId'>;
/** Prize series, SER01..SER20. Never a set id. */
export type SeriesId = Brand<string, 'SeriesId'>;
/** Background cell behind a slot, e.g. "cell-r1-c01" (row 1 = top). */
export type BackgroundCellId = Brand<string, 'BackgroundCellId'>;
/** One effect application request inside a shot (applied at most once). */
export type EffectRequestId = Brand<string, 'EffectRequestId'>;
/** One flight-end barrier of one shot. */
export type BarrierId = Brand<string, 'BarrierId'>;

const PRIZE_TYPE_RE = /^P\d{3}$/;
/** Existing three-prize sets S001..S100 and the new two-prize sets PAIR001..PAIR300. */
const SET_RE = /^(S\d{3}|PAIR\d{3})$/;
/** rules-v1 slots t0c0..t2c2 (tier 0 = bottom) and layout v2 slots slot-r1-c01..slot-r3-c12 (row 1 = top). */
const SLOT_RE = /^(t[0-2]c[0-2]|slot-r[1-3]-c(0[1-9]|1[0-2]))$/;
const QUESTION_RE = /^Q\d{3}$/;
const EFFECT_RE = /^FX\d{3}$/;
const SERIES_RE = /^SER\d{2}$/;
const CELL_RE = /^cell-r[1-3]-c(0[1-9]|1[0-2])$/;
export const EFFECT_GROUP_IDS = ['GAIN', 'RISK', 'STOCK', 'GUIDE', 'MIX', 'CHAOS'] as const;

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

/** Pair sets PAIR001..PAIR300 (format only; membership is checked against the catalog). */
export function isPairSetId(v: unknown): v is SetId {
  return typeof v === 'string' && /^PAIR\d{3}$/.test(v);
}
export function isQuestionId(v: unknown): v is QuestionId {
  return typeof v === 'string' && QUESTION_RE.test(v);
}
export function isEffectId(v: unknown): v is EffectId {
  return typeof v === 'string' && EFFECT_RE.test(v);
}
export function isSeriesId(v: unknown): v is SeriesId {
  return typeof v === 'string' && SERIES_RE.test(v);
}
export function isBackgroundCellId(v: unknown): v is BackgroundCellId {
  return typeof v === 'string' && CELL_RE.test(v);
}
export function isEffectGroupId(v: unknown): v is EffectGroupId {
  return typeof v === 'string' && (EFFECT_GROUP_IDS as readonly string[]).includes(v);
}

const pad2 = (n: number) => String(n).padStart(2, '0');
/** Layout v2 slot id: row 1..3 from the top, column 1..12 from the left. */
export function slotIdV2(row: number, column: number): SlotId {
  return asSlotId(`slot-r${row}-c${pad2(column)}`);
}
/** Background cell id paired one-to-one with slotIdV2(row, column). */
export function cellIdOf(row: number, column: number): BackgroundCellId {
  const id = `cell-r${row}-c${pad2(column)}`;
  if (!isBackgroundCellId(id)) throw new TypeError(`invalid BackgroundCellId: ${id}`);
  return id;
}

/** Unchecked constructors for ids the simulation itself mints. */
export const mintId = {
  instance: (n: number) => `i${String(n).padStart(4, '0')}` as PrizeInstanceId,
  shot: (n: number) => `s${String(n).padStart(2, '0')}` as ShotId,
  projectile: (shot: ShotId, n: number) => `${shot}-c${n}` as ProjectileId,
  event: (shot: ShotId, n: number) => `${shot}-e${n}` as EventId,
  run: (s: string) => s as RunId,
  device: (s: string) => s as DeviceId,
  barrier: (shot: ShotId) => `${shot}-barrier` as BarrierId,
  effectRequest: (shot: ShotId, n: number) => `${shot}-fx${n}` as EffectRequestId,
};
