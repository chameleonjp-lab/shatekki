/**
 * Shot settlement (Task 06, minimal; Task 09 extends it with sets, tricks,
 * first hits and penalties). Turns the sim's ShotRecord into the confirmed
 * state: collected prizes (each instance once), ledger, max chain, in-flight
 * marker cleared, end check, and replenishment if the run continues.
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
  ScoreLedgerEntry,
  ShotRecord,
  ShotSummary,
  SlotId,
  TuningConfig,
} from '../contracts';
import { BOOTH_LAYOUT } from '../contracts';
import { replenish } from './replenish';

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

  const items: LedgerItem[] = collectedNow.map((c) => {
    const cfg = catalog.prizes.get(c.typeId);
    if (!cfg) throw new RangeError(`resolveShot: unknown prize type ${c.typeId}`);
    return { kind: 'prize', refId: c.instanceId, points: cfg.baseScore };
  });
  const prizePoints = items.reduce((a, i) => a + i.points, 0);
  const ledgerEntry: ScoreLedgerEntry = {
    shotId: record.shotId,
    scoreBefore: state.score,
    prizePoints,
    trickPoints: 0,
    setPoints: 0,
    firstHitPoints: 0,
    nominalPenalty: 0,
    appliedPenalty: 0,
    scoreAfter: state.score + prizePoints,
    items,
  };

  // Slots whose placed prize was just collected become refill targets (decision 01/30).
  const collectedIds = new Set(collectedNow.map((c) => c.instanceId));
  const emptied: SlotId[] = state.shelf.prizes.filter((p) => collectedIds.has(p.instanceId)).map((p) => p.homeSlot);
  const remaining = record.remainingPrizes.filter((p) => !already.has(p.instanceId) && !p.collected);

  const typeSeen = new Set<PrizeTypeId>(state.collectedTypeIds);
  const collectedTypeIds = [...state.collectedTypeIds];
  for (const c of collectedNow) {
    if (!typeSeen.has(c.typeId)) {
      typeSeen.add(c.typeId);
      collectedTypeIds.push(c.typeId);
    }
  }

  const motionSec = state.clocks.motionSec + record.simTimeSec;
  const ammoAfter = state.ammo;
  const runEnded = ammoAfter <= 0;

  const base: RunState = {
    ...state,
    score: ledgerEntry.scoreAfter,
    ledger: [...state.ledger, ledgerEntry],
    collected: [...state.collected, ...collectedNow],
    collectedTypeIds,
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
    newlyCompletedSets: [],
    bonusAmmoRequested: 0,
    bonusAmmoGranted: 0,
    devicesActivated: [...new Set(record.deviceActivations.map((d) => d.deviceId))],
    transforms: record.transforms,
    ledger: ledgerEntry,
    endedByLimit: record.endedByLimit,
    ammoAfter,
    runEnded,
  };
  return { state: next, summary };
}
