/**
 * Confirmation of an expanded-rules shot (plan EG04 phase 3b / EG05 hand-over).
 *
 * `resolveShot` (rules-v1) is untouched. This function confirms a shot from the
 * completed EffectPlan's projection plus the final ShotRecord the sim produced
 * after resuming: ledger (incl. pair/trio sets through the same scoring), the
 * collected kinds AFTER transforms, ammo / bonus / ammoLostTotal from the
 * projection, the next-shot reservation, used cells, deferred transforms, the
 * question cursor, and the end check. Nothing is scored from the screen.
 */
import type { CollectedPrize, ExpandedRunState, LedgerItem, PrizeTypeId, RunState, ShotRecord, ShotSummary, SlotId, SeriesId } from '../contracts';
import { isAmmoBalanced, isExpandedRunState } from '../contracts';
import { completedSetsFor } from '../catalog/sets';
import { replenish } from './replenish';
import { buildLedgerEntry, firstHitItems, prizeItems, trickItems } from './scoring';
import { EMPTY_RESERVATION } from './gameplay-effects';
import { seriesDef } from './series';
import type { SettlementResult } from './settlement';
import type { ExpandedPlanContext } from './effect-plan';

export function resolveExpandedShot(state: RunState, record: ShotRecord, ctx: ExpandedPlanContext): SettlementResult {
  if (!isExpandedRunState(state)) throw new Error('resolveExpandedShot: not an expanded run');
  const flight = state.inFlight;
  if (state.phase !== 'resolving' || flight === null) throw new Error('resolveExpandedShot: no shot in flight');
  if (flight.shotId !== record.shotId) throw new Error(`resolveExpandedShot: record ${record.shotId} does not match in-flight ${flight.shotId}`);
  const plan = flight.plan;
  if (!plan || flight.stage !== 'postEffects' || !plan.complete) throw new Error('resolveExpandedShot: the effect plan is not complete');
  if (record.barrierId !== undefined && record.barrierId !== plan.barrierId) throw new Error(`resolveExpandedShot: record barrier ${record.barrierId} does not match plan ${plan.barrierId}`);
  const { tuning, catalog } = ctx;
  const projection = plan.projection;

  // Each instance is collected at most once (this shot and the whole run).
  const already = new Set<string>(state.collected.map((c) => c.instanceId));
  const collectedNow: CollectedPrize[] = [];
  for (const c of record.collected) {
    if (already.has(c.instanceId)) continue;
    already.add(c.instanceId);
    collectedNow.push({ instanceId: c.instanceId, typeId: c.typeId, shotId: record.shotId });
  }

  // Sets use the distinct kinds collected so far in this run, by the kind at collection time (after transforms).
  const typeSeen = new Set<PrizeTypeId>(state.collectedTypeIds);
  const collectedTypeIds = [...state.collectedTypeIds];
  for (const c of collectedNow) {
    if (!typeSeen.has(c.typeId)) {
      typeSeen.add(c.typeId);
      collectedTypeIds.push(c.typeId);
    }
  }
  const newSets = completedSetsFor(catalog, typeSeen, state.completedSets);
  const firstHits = firstHitItems(record.firstHitCandidates, state.firstHitsScored, tuning);
  // legacy penalty plates: one ledger item per device, exactly the plan's penaltyPoints in total
  const penalties = plan.processed.filter((e) => e.source.kind === 'device' && e.source.deviceKind === 'penalty' && e.outcome === 'applied');

  const items: LedgerItem[] = [
    ...prizeItems(collectedNow, catalog),
    ...trickItems(collectedNow, record.prizeOutcomes, record.shotId, tuning),
    ...newSets.map((id): LedgerItem => ({ kind: 'set', refId: id, points: catalog.sets.get(id)!.bonusScore })),
    ...firstHits.items,
    ...penalties.map((e): LedgerItem => ({ kind: 'penalty', refId: e.source.kind === 'device' ? e.source.deviceId : e.requestId, points: tuning.devices.penaltyPoints })),
  ];
  const ledgerEntry = buildLedgerEntry(record.shotId, state.score, items);

  const collectedIds = new Set(collectedNow.map((c) => c.instanceId));
  const emptied: SlotId[] = state.shelf.prizes.filter((p) => collectedIds.has(p.instanceId)).map((p) => p.homeSlot);
  const remaining = record.remainingPrizes.filter((p) => !already.has(p.instanceId) && !p.collected);

  const motionSec = state.clocks.motionSec + record.simTimeSec;
  const ammoAfter = projection.ammo;
  const runEnded = ammoAfter <= 0;
  const bonusGranted = projection.bonusAmmoTotal - state.bonusAmmoTotal;

  // cells used this shot (also when their effect could not act); transforms still waiting; question taken
  const usedNow = new Map(plan.processed.filter((e) => e.source.kind === 'cell' && e.reason !== 'cellAlreadyUsed' && e.reason !== 'unknownCell').map((e) => [e.source.kind === 'cell' ? e.source.cellId : '', e.requestId]));
  const exp = state.expansion;
  const expansion: ExpandedRunState['expansion'] = {
    ...exp,
    cells: exp.cells.map((c) => (usedNow.has(c.cellId) && !c.used ? { ...c, used: true, usedOnShot: record.shotId, requestId: usedNow.get(c.cellId)! } : c)),
    questionCursor: plan.question ? plan.question.cursor + 1 : exp.questionCursor,
    // a reservation that survives to the next FIRE; the game end drops it (no corks left to use it)
    next: runEnded ? EMPTY_RESERVATION : projection.next,
    active: null,
    assortmentSeries: projection.assortmentSeries,
    outlineSeries: projection.outlineSeries,
    deferredTransforms: (record.deferredTransforms ?? []).filter((d) => !already.has(d.instanceId)),
    rng: plan.rng,
  };

  const base: ExpandedRunState = {
    ...state,
    score: ledgerEntry.scoreAfter,
    ledger: [...state.ledger, ledgerEntry],
    collected: [...state.collected, ...collectedNow],
    collectedTypeIds,
    completedSets: [...state.completedSets, ...newSets],
    firstHitsScored: [...state.firstHitsScored, ...firstHits.keys],
    ammo: ammoAfter,
    bonusAmmoTotal: projection.bonusAmmoTotal,
    ammoLostTotal: projection.ammoLostTotal,
    bulletType: projection.bulletType,
    maxChain: Math.max(state.maxChain, collectedNow.length),
    inFlight: null,
    load: null,
    clocks: { loadingSec: 0, aimingSec: 0, heartPhase: 0, motionSec },
    expansion,
  };

  let next: ExpandedRunState;
  if (runEnded) {
    const deferred = [...new Set<SlotId>([...state.shelf.deferredSlots, ...emptied])];
    next = { ...base, phase: 'ended', shelf: { ...state.shelf, prizes: remaining, deferredSlots: deferred } };
  } else {
    const r = replenish(
      { shelf: { ...state.shelf, prizes: remaining }, draw: state.draw, newlyEmptySlots: emptied, motionSec },
      refillCatalog(ctx, projection.assortmentSeries),
      tuning,
      ctx.layout,
    );
    next = { ...base, phase: 'position', shelf: r.shelf, draw: r.draw };
  }
  if (!isAmmoBalanced(next, tuning.initialAmmo)) throw new Error('resolveExpandedShot: ammo invariant broken (shotsFired + ammo + ammoLostTotal !== initialAmmo + bonusAmmoTotal)');

  const summary: ShotSummary = {
    runId: state.runId,
    shotId: record.shotId,
    shotNumber: flight.shotNumber,
    collected: collectedNow,
    chainCount: collectedNow.length,
    newlyCompletedSets: newSets,
    bonusAmmoRequested: Math.max(0, bonusGranted),
    bonusAmmoGranted: bonusGranted,
    devicesActivated: [...new Set(record.deviceActivations.map((d) => d.deviceId))],
    transforms: record.transforms,
    ledger: ledgerEntry,
    endedByLimit: record.endedByLimit,
    prizeOutcomes: record.prizeOutcomes,
    touchedFirstHitTargets: [...new Set(record.firstHitCandidates)],
    ammoAfter,
    runEnded,
    effects: plan.processed,
    appliedTransforms: record.appliedTransforms ?? [],
    deferredTransforms: record.deferredTransforms ?? [],
  };
  return { state: next, summary };
}

/**
 * While an assortment series is active, refills draw only from its kinds.
 * Done by narrowing the catalog handed to `replenish`; the base catalog is not changed.
 */
function refillCatalog(ctx: ExpandedPlanContext, series: SeriesId | null): ExpandedPlanContext['catalog'] {
  if (series === null) return ctx.catalog;
  const members = new Set(seriesDef(ctx.expansion, series).typeIds);
  return { ...ctx.catalog, prizes: new Map([...ctx.catalog.prizes].filter(([id]) => members.has(id))) };
}
