/**
 * Replenishment (Task 06, decisions 01/30). Runs only after a shot is
 * settled and only if the run continues.
 *
 * Targets: slots whose placed prize was collected, plus slots already
 * deferred. A target slot is refilled only when no uncollected prize overlaps
 * its occupancy box; otherwise it stays deferred. Uncollected prizes are never
 * deleted or moved. A prize that merely slid keeps its home slot, so its slot
 * is not a target and no duplicate appears. New instances get a new id, full
 * HP, and the shelf never holds more than `shelfSlotCount` prizes.
 */
import type {
  BoothLayout,
  DrawState,
  PrizeInstanceState,
  PrizeTypeId,
  RuntimeCatalog,
  ShelfState,
  SlotGeometry,
  SlotId,
  TuningConfig,
} from '../contracts';
import { BOOTH_LAYOUT, mintId } from '../contracts';
import { drawPrize } from '../catalog/draw';
import { mountBasePose, mountedPose } from '../sim/motion';
import { boxesOverlap, prizeAabb } from './shapes';

export function spawnPrize(
  catalog: RuntimeCatalog,
  typeId: PrizeTypeId,
  slot: SlotGeometry,
  instanceNumber: number,
  motionSec: number,
): PrizeInstanceState {
  const cfg = catalog.prizes.get(typeId);
  if (!cfg) throw new RangeError(`unknown prize type: ${typeId}`);
  const base = mountBasePose(slot, cfg);
  const mounted = cfg.motion.type !== 'none';
  return {
    instanceId: mintId.instance(instanceNumber),
    typeId,
    drawnTypeId: typeId,
    homeSlot: slot.slotId,
    hp: cfg.maxHp,
    maxHp: cfg.maxHp,
    pose: mounted ? mountedPose(base, cfg, motionSec) : base,
    mounted,
    collected: false,
  };
}

/** True when any uncollected prize's bounding box overlaps the slot's occupancy box. */
export function isSlotBlocked(
  slot: SlotGeometry,
  prizes: readonly PrizeInstanceState[],
  catalog: RuntimeCatalog,
): boolean {
  for (const p of prizes) {
    if (p.collected) continue;
    const cfg = catalog.prizes.get(p.typeId);
    if (!cfg) continue;
    if (boxesOverlap(prizeAabb(cfg.shape, p.pose), slot.occupancyBox)) return true;
  }
  return false;
}

export interface ReplenishInput {
  readonly shelf: ShelfState;
  readonly draw: DrawState;
  /** Slots whose prize was collected in the shot just settled. */
  readonly newlyEmptySlots: readonly SlotId[];
  readonly motionSec: number;
  /** Expanded rules: draw only from these kinds (assortment series members). Absent/null = all kinds. */
  readonly candidateTypeIds?: readonly PrizeTypeId[] | null;
}

export interface ReplenishResult {
  readonly shelf: ShelfState;
  readonly draw: DrawState;
  readonly spawned: readonly PrizeInstanceState[];
}

export function replenish(
  input: ReplenishInput,
  catalog: RuntimeCatalog,
  tuning: TuningConfig,
  layout: BoothLayout = BOOTH_LAYOUT,
): ReplenishResult {
  const wanted = new Set<SlotId>([...input.shelf.deferredSlots, ...input.newlyEmptySlots]);
  let prizes = input.shelf.prizes.filter((p) => !p.collected);
  let draw = input.draw;
  let next = input.shelf.nextInstanceNumber;
  const stillDeferred: SlotId[] = [];
  const spawned: PrizeInstanceState[] = [];

  for (const slot of layout.slots) {
    if (!wanted.has(slot.slotId)) continue;
    if (prizes.length >= tuning.shelfSlotCount || isSlotBlocked(slot, prizes, catalog)) {
      stillDeferred.push(slot.slotId);
      continue;
    }
    const r = drawPrize(catalog, draw, prizes.map((p) => p.typeId), tuning, input.candidateTypeIds);
    draw = r.draw;
    const inst = spawnPrize(catalog, r.typeId, slot, next, input.motionSec);
    next += 1;
    prizes = [...prizes, inst];
    spawned.push(inst);
  }
  return { shelf: { prizes, deferredSlots: stillDeferred, nextInstanceNumber: next }, draw, spawned };
}
