/**
 * Background cell assignment (D37, plan EG03). Pure and deterministic: every
 * cell draws one effect uniformly and independently from the given list, so
 * the same effect may sit on several cells and not every effect has to appear.
 * Uses its own rng stream (ExpansionRngState.cells), never the prize draw.
 */
import type { BackgroundCellId, BackgroundCellState, EffectId } from '../contracts';
import { rngNext, type RngState } from '../catalog/rng';

export function assignCells(
  rng: RngState,
  cellIds: readonly BackgroundCellId[],
  effectIds: readonly EffectId[],
): { readonly cells: readonly BackgroundCellState[]; readonly rng: RngState } {
  if (effectIds.length === 0) throw new RangeError('no effects to assign');
  let state = rng;
  const cells: BackgroundCellState[] = [];
  for (const cellId of cellIds) {
    const r = rngNext(state);
    state = r.state;
    const effectId = effectIds[Math.min(effectIds.length - 1, Math.floor(r.value * effectIds.length))]!;
    cells.push({ cellId, effectId, used: false, usedOnShot: null, requestId: null });
  }
  return { cells, rng: state };
}
