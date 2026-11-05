/** Run creation (Task 04). */
import type {
  BoothLayout,
  PrizeInstanceState,
  RunConfig,
  RunState,
  RuntimeCatalog,
  ValueStatus,
} from '../contracts';
import { BOOTH_LAYOUT, RUN_STATE_SCHEMA_VERSION, catalogValueStatus } from '../contracts';
import { createDrawState, drawPrize } from '../catalog/draw';
import { spawnPrize } from './replenish';

const STATUS_ORDER: Record<ValueStatus, number> = { prototype: 0, proposed: 1, approved: 2 };
export function lowestStatus(a: ValueStatus, b: ValueStatus): ValueStatus {
  return STATUS_ORDER[a] <= STATUS_ORDER[b] ? a : b;
}

export function createRun(config: RunConfig, catalog: RuntimeCatalog, layout: BoothLayout = BOOTH_LAYOUT): RunState {
  const { tuning } = config;
  let draw = createDrawState(config.seed);
  const prizes: PrizeInstanceState[] = [];
  let next = 1;
  for (const slot of layout.slots.slice(0, tuning.shelfSlotCount)) {
    const r = drawPrize(catalog, draw, prizes.map((p) => p.typeId), tuning);
    draw = r.draw;
    prizes.push(spawnPrize(catalog, r.typeId, slot, next, 0));
    next += 1;
  }
  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    runId: config.runId,
    rulesVersion: catalog.rulesVersion,
    valueStatus: lowestStatus(tuning.valueStatus, catalogValueStatus(catalog)),
    phase: 'position',
    pauseReasons: [],
    ammo: tuning.initialAmmo,
    bonusAmmoTotal: 0,
    shotsFired: 0,
    score: 0,
    ledger: [],
    collected: [],
    collectedTypeIds: [],
    completedSets: [],
    firstHitsScored: [],
    maxChain: 0,
    shelf: { prizes, deferredSlots: [], nextInstanceNumber: next },
    draw,
    standX: 0,
    aim: { yaw: 0, pitch: 0 },
    load: null,
    bulletType: 'standard',
    clocks: { loadingSec: 0, aimingSec: 0, heartPhase: 0, motionSec: 0 },
    inFlight: null,
    playerName: config.playerName,
    seed: config.seed,
  };
}
