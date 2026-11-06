/**
 * Shot settlement (Task 06 + Task 09). Turns the sim's ShotRecord into the
 * confirmed state: collected prizes (each instance once), sets (once per run),
 * tricks, first hits, penalties, the ledger (gains and nominal penalty combined,
 * then floor 0: decision 28), bonus ammo (granted BEFORE the end check, so a
 * last shot that earns ammo continues: AC18), the next bullet type, max chain,
 * in-flight marker cleared, end check, and replenishment if the run continues.
 *
 * Nothing is scored from what the screen showed; only the record counts.
 */
import type {
  BoothLayout,
  CollectedPrize,
  LedgerItem,
  PrizeTypeId,
  RunState,
  RuntimeCatalog,
  ShotRecord,
  ShotSummary,
  SlotId,
  TuningConfig,
} from '../contracts';
import { BOOTH_LAYOUT } from '../contracts';
import { completedSetsFor } from '../catalog/sets';
import { deviceEffects, grantBonusAmmo, nextBulletType } from './gimmicks';
import { replenish } from './replenish';
import { buildLedgerEntry, firstHitItems, prizeItems, trickItems } from './scoring';

export interface SettlementResult {
  readonly state: RunState;
  readonly summary: ShotSummary;
}

export function resolveShot(
  state: RunState,
  record: ShotRecord,
  catalog: RuntimeCatalog,
  tuning: TuningConfig,
  layout: BoothLayout = BOOTH_LAYOUT,
): SettlementResult {
  const flight = state.inFlight;
  if (state.phase !== 'resolving' || flight === null) throw new Error('resolveShot: no shot in flight');
  if (flight.shotId !== record.shotId) throw new Error(`resolveShot: record ${record.shotId} does not match in-flight ${flight.shotId}`);

  // Each instance is collected at most once (this shot and the whole run).
  const already = new Set<string>(state.collected.map((c) => c.instanceId));
  const collectedNow: CollectedPrize[] = [];
  for (const c of record.collected) {
    if (already.has(c.instanceId)) continue;
    already.add(c.instanceId);
    collectedNow.push({ instanceId: c.instanceId, typeId: c.typeId, shotId: record.shotId });
  }

  // Sets use the distinct kinds collected so far in this run (kind at collection time).
  const typeSeen = new Set<PrizeTypeId>(state.collectedTypeIds);
  const collectedTypeIds = [...state.collectedTypeIds];
  for (const c of collectedNow) {
    if (!typeSeen.has(c.typeId)) {
      typeSeen.add(c.typeId);
      collectedTypeIds.push(c.typeId);
    }
  }
  const newSets = completedSetsFor(catalog, typeSeen, state.completedSets);
  const effects = deviceEffects(record.deviceActivations, tuning);
  const firstHits = firstHitItems(record.firstHitCandidates, state.firstHitsScored, tuning);

  const items: LedgerItem[] = [
    ...prizeItems(collectedNow, catalog),
    ...trickItems(collectedNow, record.prizeOutcomes, record.shotId, tuning),
    ...newSets.map((id): LedgerItem => ({ kind: 'set', refId: id, points: catalog.sets.get(id)!.bonusScore })),
    ...firstHits.items,
    ...effects.penalties.map((p): LedgerItem => ({ kind: 'penalty', refId: p.deviceId, points: p.points })),
  ];
  const ledgerEntry = buildLedgerEntry(record.shotId, state.score, items);

  // Slots whose placed prize was just collected become refill targets (decision 01/30).
  const collectedIds = new Set(collectedNow.map((c) => c.instanceId));
  const emptied: SlotId[] = state.shelf.prizes.filter((p) => collectedIds.has(p.instanceId)).map((p) => p.homeSlot);
  const remaining = record.remainingPrizes.filter((p) => !already.has(p.instanceId) && !p.collected);

  const motionSec = state.clocks.motionSec + record.simTimeSec;
  const bonusGranted = grantBonusAmmo(effects.bonusAmmoRequested, state.bonusAmmoTotal, tuning);
  const ammoAfter = state.ammo + bonusGranted;
  const runEnded = ammoAfter <= 0;

  const base: RunState = {
    ...state,
    score: ledgerEntry.scoreAfter,
    ledger: [...state.ledger, ledgerEntry],
    collected: [...state.collected, ...collectedNow],
    collectedTypeIds,
    completedSets: [...state.completedSets, ...newSets],
    firstHitsScored: [...state.firstHitsScored, ...firstHits.keys],
    ammo: ammoAfter,
    bonusAmmoTotal: state.bonusAmmoTotal + bonusGranted,
    // a bullet-type device changes the NEXT shot only (prototype); otherwise back to the standard cork
    bulletType: effects.bulletTypeChanged ? nextBulletType(flight.request.bulletType, tuning) : 'standard',
    maxChain: Math.max(state.maxChain, collectedNow.length),
    inFlight: null,
    load: null,
    clocks: { loadingSec: 0, aimingSec: 0, heartPhase: 0, motionSec },
  };

  let next: RunState;
  if (runEnded) {
    const deferred = [...new Set<SlotId>([...state.shelf.deferredSlots, ...emptied])];
    next = { ...base, phase: 'ended', shelf: { ...state.shelf, prizes: remaining, deferredSlots: deferred } };
  } else {
    const r = replenish(
      { shelf: { ...state.shelf, prizes: remaining }, draw: state.draw, newlyEmptySlots: emptied, motionSec },
      catalog,
      tuning,
      layout,
    );
    next = { ...base, phase: 'position', shelf: r.shelf, draw: r.draw };
  }

  const summary: ShotSummary = {
    runId: state.runId,
    shotId: record.shotId,
    shotNumber: flight.shotNumber,
    collected: collectedNow,
    chainCount: collectedNow.length,
    newlyCompletedSets: newSets,
    bonusAmmoRequested: effects.bonusAmmoRequested,
    bonusAmmoGranted: bonusGranted,
    devicesActivated: [...new Set(record.deviceActivations.map((d) => d.deviceId))],
    transforms: record.transforms,
    ledger: ledgerEntry,
    endedByLimit: record.endedByLimit,
    prizeOutcomes: record.prizeOutcomes,
    touchedFirstHitTargets: [...new Set(record.firstHitCandidates)],
    ammoAfter,
    runEnded,
  };
  return { state: next, summary };
}
