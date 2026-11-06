/**
 * E3 souvenir shelf (plan T4c): up to three prize kinds shown on this device.
 *
 * Its own storage key (no older save name is reused); shared by every rules version on the
 * device. Only an explicit choice on a result is stored, and only for a kind won in that very
 * game (checked against the result's run id and kinds). The same kind takes one slot; a full
 * shelf needs the slot to replace. A save failure is reported, never treated as success.
 */
import type { KeyValueStorage, PrizeTypeId } from '../contracts';

export const SOUVENIR_KEY = 'shatekki.souvenirs.v1';
export const SOUVENIR_SLOTS = 3;

export interface SouvenirSlot {
  readonly typeId: PrizeTypeId;
  /** The game it was won in. */
  readonly runId: string;
}

export interface SouvenirShelf {
  readonly slots: readonly (SouvenirSlot | null)[];
}

export type PlaceResult =
  | { readonly ok: true; readonly shelf: SouvenirShelf; readonly changed: boolean }
  | { readonly ok: false; readonly reason: 'notWonInThisGame' | 'chooseSlot' | 'badSlot' | 'saveFailed' };

const EMPTY: SouvenirShelf = { slots: [null, null, null] };

function parse(raw: string | null): SouvenirShelf {
  if (!raw) return EMPTY;
  try {
    const v = JSON.parse(raw) as { slots?: unknown };
    if (!Array.isArray(v.slots) || v.slots.length !== SOUVENIR_SLOTS) return EMPTY;
    const slots = v.slots.map((s) => (s && typeof s === 'object' && typeof (s as SouvenirSlot).typeId === 'string' && typeof (s as SouvenirSlot).runId === 'string' ? { typeId: (s as SouvenirSlot).typeId, runId: (s as SouvenirSlot).runId } : null));
    return { slots };
  } catch {
    return EMPTY;
  }
}

export interface SouvenirStore {
  load(): SouvenirShelf;
  /**
   * Put `typeId` won in `runId` (whose kinds are `wonTypeIds`) on the shelf. `slot` is required
   * only when the shelf is full. Placing a kind already shown changes nothing (no duplicates on
   * a second tap or a reopened result).
   */
  place(input: { readonly runId: string; readonly wonTypeIds: readonly string[]; readonly typeId: PrizeTypeId; readonly slot?: number }): PlaceResult;
}

export function createSouvenirStore(storage: KeyValueStorage): SouvenirStore {
  const read = (): SouvenirShelf => {
    try {
      return parse(storage.getItem(SOUVENIR_KEY));
    } catch {
      return EMPTY;
    }
  };
  return {
    load: read,
    place({ runId, wonTypeIds, typeId, slot }) {
      if (!wonTypeIds.includes(typeId)) return { ok: false, reason: 'notWonInThisGame' };
      const cur = read();
      if (cur.slots.some((s) => s?.typeId === typeId)) return { ok: true, shelf: cur, changed: false };
      let index = cur.slots.findIndex((s) => s === null);
      if (index === -1) {
        if (slot === undefined) return { ok: false, reason: 'chooseSlot' };
        if (!Number.isInteger(slot) || slot < 0 || slot >= SOUVENIR_SLOTS) return { ok: false, reason: 'badSlot' };
        index = slot;
      }
      const next: SouvenirShelf = { slots: cur.slots.map((s, i) => (i === index ? { typeId, runId } : s)) };
      try {
        storage.setItem(SOUVENIR_KEY, JSON.stringify(next));
      } catch {
        return { ok: false, reason: 'saveFailed' };
      }
      return { ok: true, shelf: next, changed: true };
    },
  };
}
