/** Shared fixtures for the expanded-rules core tests (not a test file). */
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { seedRng } from '../../src/catalog/rng';
import { drawQuestionOrder } from '../../src/core/questions';
import { nextIndex } from '../../src/core/expansion-rng';
import { spawnPrize } from '../../src/core/replenish';
import { createRun } from '../../src/core/state';
import type { ExpandedPlanContext } from '../../src/core/effect-plan';
import {
  BASE_SHOT_MODIFIERS,
  CELL_IDS_V2,
  EXPANDED_RUN_STATE_SCHEMA_VERSION,
  asPrizeTypeId,
  mintId,
  type BackgroundCellId,
  type BackgroundCellState,
  type EffectId,
  type EffectRequest,
  type ExpandedRunState,
  type FlightBarrier,
  type PrizeInstanceState,
  type RunState,
  type ShotId,
  type ExpansionRunState,
} from '../../src/contracts';
import { makeRequest } from './helpers';

export const bundle = getGameplayBundle('expanded-proposed');
export const EXP = bundle.expansion!;
export const PLAN_CTX: ExpandedPlanContext = { tuning: bundle.tuning, catalog: bundle.catalog, layout: bundle.layout, expansion: EXP };
export const tid = asPrizeTypeId;
export const SHOT1 = mintId.shot(1);

/** A fresh expanded run (36 prizes, 36 cells, 200 questions), phase 'position'. */
export function expandedRun(seed = 1): ExpandedRunState {
  const base = createRun({ runId: mintId.run('run-exp'), seed, tuning: bundle.tuning, playerName: null }, bundle.catalog, bundle.layout);
  let cellsRng = seedRng(seed * 31 + 1);
  const cells: BackgroundCellState[] = CELL_IDS_V2.map((cellId) => {
    const r = nextIndex(cellsRng, 100);
    cellsRng = r.state;
    return { cellId, effectId: `FX${String(r.index + 1).padStart(3, '0')}` as EffectId, used: false, usedOnShot: null, requestId: null };
  });
  const q = drawQuestionOrder(EXP, seedRng(seed * 31 + 2));
  const expansion: ExpansionRunState = {
    cells,
    questionOrder: q.order,
    questionCursor: 0,
    next: { modifiers: BASE_SHOT_MODIFIERS, hint: null },
    active: null,
    assortmentSeries: null,
    outlineSeries: null,
    deferredTransforms: [],
    rng: { cells: cellsRng, questions: q.rng, effects: seedRng(seed * 31 + 3) },
  };
  return {
    ...base,
    schemaVersion: EXPANDED_RUN_STATE_SCHEMA_VERSION,
    ammoLostTotal: 0,
    expansion,
  } as ExpandedRunState;
}

/** The run with the first shot fired: phase resolving, one cork spent, marker written. */
export function inFlight(state: ExpandedRunState, shot: ShotId = SHOT1): ExpandedRunState {
  return {
    ...state,
    phase: 'resolving',
    ammo: state.ammo - 1,
    shotsFired: state.shotsFired + 1,
    inFlight: { shotId: shot, shotNumber: state.shotsFired + 1, request: makeRequest({ direction: { x: 0, y: 0, z: -1 } }, 1) },
  };
}

export function barrierOf(state: RunState, over: Partial<FlightBarrier> = {}): FlightBarrier {
  const shotId = state.inFlight!.shotId;
  return {
    runId: state.runId,
    shotId,
    barrierId: mintId.barrier(shotId),
    requests: [],
    shopkeeperHit: false,
    shopkeeperParts: [],
    collectedDuringFlight: [],
    prizes: state.shelf.prizes.filter((p) => !p.collected),
    motion: [],
    simTimeSec: 1,
    ...over,
  };
}

export function cellRequest(shot: ShotId, n: number, cellId: BackgroundCellId, order = n): EffectRequest {
  return { requestId: mintId.effectRequest(shot, n), source: { kind: 'cell', cellId }, simTimeSec: 0.5, contactOrder: order, targetId: cellId, effectId: null };
}
export function deviceRequest(shot: ShotId, n: number, deviceId: string, deviceKind: 'ammo' | 'penalty' | 'bulletType' | 'transform' | 'split' | 'power', order = n): EffectRequest {
  return { requestId: mintId.effectRequest(shot, n), source: { kind: 'device', deviceId: mintId.device(deviceId), deviceKind }, simTimeSec: 0.4, contactOrder: order, targetId: deviceId, effectId: null };
}

/** Replace the effect assigned to a cell. */
export function withCellEffect(state: ExpandedRunState, cellId: BackgroundCellId, effectId: string): ExpandedRunState {
  return { ...state, expansion: { ...state.expansion, cells: state.expansion.cells.map((c) => (c.cellId === cellId ? { ...c, effectId: effectId as EffectId } : c)) } };
}

/** Replace the shelf kinds by slot index (0..35), keeping everything else. */
export function withKinds(state: ExpandedRunState, kinds: Readonly<Record<number, string>>): ExpandedRunState {
  const prizes: PrizeInstanceState[] = state.shelf.prizes.map((p, i) => {
    const k = kinds[i];
    if (!k) return p;
    const slot = bundle.layout.slots.find((s) => s.slotId === p.homeSlot)!;
    const n = Number(p.instanceId.slice(1));
    return spawnPrize(bundle.catalog, tid(k), slot, n, 0);
  });
  return { ...state, shelf: { ...state.shelf, prizes } };
}
