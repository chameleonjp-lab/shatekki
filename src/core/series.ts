/**
 * Series helpers (plan EG04). A series is a display/assortment grouping of
 * prize kinds; it is never an input to set completion. Pure, no RNG.
 */
import type { ExpansionCatalog, PrizeInstanceId, PrizeInstanceState, PrizeTypeId, SeriesDef, SeriesId } from '../contracts';

export function seriesDef(expansion: ExpansionCatalog, seriesId: SeriesId): SeriesDef {
  const def = expansion.series.get(seriesId);
  if (!def) throw new RangeError(`unknown series: ${seriesId}`);
  return def;
}

/** Series a kind belongs to, in series-id order. A kind may belong to several. */
export function seriesOfType(expansion: ExpansionCatalog, typeId: PrizeTypeId): SeriesId[] {
  const out: SeriesId[] = [];
  for (const s of expansion.series.values()) if (s.typeIds.includes(typeId)) out.push(s.seriesId);
  return out.sort();
}

export function isTypeInSeries(expansion: ExpansionCatalog, seriesId: SeriesId, typeId: PrizeTypeId): boolean {
  return seriesDef(expansion, seriesId).typeIds.includes(typeId);
}

/** Current uncollected prizes that the outline of `seriesId` marks (by their current kind). */
export function outlineTargets(expansion: ExpansionCatalog, seriesId: SeriesId | null, prizes: readonly PrizeInstanceState[]): PrizeInstanceId[] {
  if (seriesId === null) return [];
  const members = seriesDef(expansion, seriesId).typeIds;
  return prizes.filter((p) => !p.collected && members.includes(p.typeId)).map((p) => p.instanceId);
}

/**
 * Kinds a refill may draw from while an assortment series is active (in P-number
 * order), or null when there is no assortment series (the whole catalog applies).
 */
export function refillCandidates(expansion: ExpansionCatalog, assortmentSeries: SeriesId | null): readonly PrizeTypeId[] | null {
  return assortmentSeries === null ? null : seriesDef(expansion, assortmentSeries).typeIds;
}

/** Deterministic board order: slot row, column, then instance id. Unknown slot ids sort last. */
export function slotOrderKey(slotId: string): number {
  const v2 = /^slot-r([1-3])-c(\d{2})$/.exec(slotId);
  if (v2) return Number(v2[1]) * 100 + Number(v2[2]);
  const v1 = /^t([0-2])c([0-2])$/.exec(slotId);
  if (v1) return (3 - Number(v1[1])) * 100 + Number(v1[2]) + 1;
  return 10_000;
}

export function sortPrizesByBoardOrder<T extends Pick<PrizeInstanceState, 'homeSlot' | 'instanceId'>>(prizes: readonly T[]): T[] {
  return [...prizes].sort((a, b) => slotOrderKey(a.homeSlot) - slotOrderKey(b.homeSlot) || (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0));
}
