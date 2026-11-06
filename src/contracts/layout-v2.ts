/**
 * Booth layout v2 (D36, plan EG01/EG03, owner: Opus).
 *
 * Three rows × twelve columns in one continuous stall. Row 1 is the top
 * board (tier 2), row 3 the bottom board (tier 0). Every slot has one
 * background cell on the back wall behind it (D37). The physics colliders
 * and the meshes both come from here, like layout v1.
 *
 * All numbers are PROTOTYPE (試作) and are measured in EG03/EG10. rules-v1
 * keeps using BOOTH_LAYOUT (layout v1.1) unchanged.
 */
import type { BackgroundCellId, SlotId } from './ids';
import { cellIdOf, mintId, slotIdV2 } from './ids';
import type { Box3 } from './geometry';
import type { BackgroundCellGeometry, BoothLayout, DeviceGeometry, HiddenTargetGeometry, ShelfTier, ShopkeeperPartGeometry, SlotGeometry, StaticSurface } from './layout';

export const LAYOUT_V2_VERSION = 'layout-v2.0-prototype';
export const V2_ROWS = 3;
export const V2_COLUMNS = 12;
/** Distance between column centers (same as layout v1). */
export const V2_COLUMN_PITCH = 0.42;

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box3 => ({
  center: { x: cx, y: cy, z: cz },
  halfExtents: { x: hx, y: hy, z: hz },
});

/** x of a 0-based column; columns are centered on x = 0. */
export function columnX(column: number): number {
  return (column - (V2_COLUMNS - 1) / 2) * V2_COLUMN_PITCH;
}

const EDGE_X = columnX(V2_COLUMNS - 1); // 2.31
const SHELF_HALF_WIDTH = EDGE_X + 0.24; // 2.55
const SIDE_X = 3.0;
const BACK_Z = -2.45;
const CEIL_Y = 2.3;

const TIERS: readonly ShelfTier[] = [
  { tier: 0, topY: 0.8, thickness: 0.03, centerZ: -1.75, depth: 0.28, halfWidth: SHELF_HALF_WIDTH },
  { tier: 1, topY: 1.16, thickness: 0.03, centerZ: -1.92, depth: 0.28, halfWidth: SHELF_HALF_WIDTH },
  { tier: 2, topY: 1.52, thickness: 0.03, centerZ: -2.09, depth: 0.28, halfWidth: SHELF_HALF_WIDTH },
];

const rowOfTier = (tier: 0 | 1 | 2): 1 | 2 | 3 => (3 - tier) as 1 | 2 | 3;
const tierOfRow = (row: 1 | 2 | 3): 0 | 1 | 2 => (3 - row) as 0 | 1 | 2;

/** Rows top to bottom, columns left to right: slot-r1-c01 … slot-r3-c12. */
const SLOTS: readonly SlotGeometry[] = ([1, 2, 3] as const).flatMap((row) => {
  const t = TIERS[tierOfRow(row)]!;
  return Array.from({ length: V2_COLUMNS }, (_, column): SlotGeometry => {
    const x = columnX(column);
    return {
      slotId: slotIdV2(row, column + 1),
      tier: t.tier,
      column,
      spawnBase: { x, y: t.topY, z: t.centerZ },
      occupancyBox: box(x, t.topY + 0.15, t.centerZ, 0.15, 0.14, 0.13),
    };
  });
});

/**
 * Back-wall bands behind each row: from the row's board top up to the next
 * board top (row 1 gets the same height above the top board). Neighbouring
 * cells touch; the sim picks one cell per contact from the contact point and
 * the fixed id order.
 */
const CELL_HALF_DEPTH = 0.004;
const CELL_BAND: Readonly<Record<1 | 2 | 3, { bottom: number; top: number }>> = {
  1: { bottom: 1.52, top: 1.88 },
  2: { bottom: 1.16, top: 1.52 },
  3: { bottom: 0.8, top: 1.16 },
};

const CELLS: readonly BackgroundCellGeometry[] = SLOTS.map((s) => {
  const row = rowOfTier(s.tier);
  const band = CELL_BAND[row];
  return {
    cellId: cellIdOf(row, s.column + 1),
    slotId: s.slotId,
    row,
    column: s.column + 1,
    box: box(s.spawnBase.x, (band.bottom + band.top) / 2, BACK_Z + CELL_HALF_DEPTH, V2_COLUMN_PITCH / 2, (band.top - band.bottom) / 2, CELL_HALF_DEPTH),
    faceNormal: { x: 0, y: 0, z: 1 },
  };
});

const SURFACES: readonly StaticSurface[] = [
  ...TIERS.map((t) => ({
    id: `shelf-${t.tier}`,
    box: box(0, t.topY - t.thickness / 2, t.centerZ, t.halfWidth, t.thickness / 2, t.depth / 2),
    material: 'wood' as const,
    reflective: true as const,
  })),
  { id: 'floor', box: box(0, -0.05, -1.2, SIDE_X, 0.05, 1.4), material: 'cloth', reflective: true },
  { id: 'back-wall', box: box(0, CEIL_Y / 2, BACK_Z - 0.02, SIDE_X, CEIL_Y / 2, 0.02), material: 'wood', reflective: true },
  { id: 'left-wall', box: box(-SIDE_X - 0.02, CEIL_Y / 2, -1.3, 0.02, CEIL_Y / 2, 1.15), material: 'wood', reflective: true },
  { id: 'right-wall', box: box(SIDE_X + 0.02, CEIL_Y / 2, -1.3, 0.02, CEIL_Y / 2, 1.15), material: 'wood', reflective: true },
  { id: 'ceiling', box: box(0, CEIL_Y + 0.02, -1.3, SIDE_X, 0.02, 1.15), material: 'cloth', reflective: true },
  { id: 'counter', box: box(0, 0.47, -0.25, SIDE_X, 0.47, 0.12), material: 'wood', reflective: true },
];

// Devices sit outside the cell area: four plates on the back wall beyond the
// left end of the shelves, the ammo plate high on the right wall and the
// transform target hanging from the ceiling (both reflection only, as in v1).
const END_X = -(SHELF_HALF_WIDTH + SIDE_X) / 2; // ≈ -2.78
const DEVICES: readonly DeviceGeometry[] = [
  { deviceId: mintId.device('dev-split-1'), kind: 'split', box: box(END_X, 1.7, BACK_Z + 0.01, 0.1, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-power-1'), kind: 'power', box: box(END_X, 1.44, BACK_Z + 0.01, 0.1, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-bullet-1'), kind: 'bulletType', box: box(END_X, 1.18, BACK_Z + 0.01, 0.1, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-penalty-1'), kind: 'penalty', box: box(END_X, 0.92, BACK_Z + 0.01, 0.1, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-ammo-1'), kind: 'ammo', box: box(SIDE_X - 0.01, 2.0, -1.8, 0.01, 0.09, 0.09), faceNormal: { x: -1, y: 0, z: 0 }, directlyReachable: false },
  { deviceId: mintId.device('dev-transform-1'), kind: 'transform', box: box(0, 2.08, -2.25, 0.06, 0.06, 0.06), faceNormal: { x: 0, y: -1, z: 0 }, directlyReachable: false },
];

// The shopkeeper stands beyond column 12 at the right end, beside the top board.
const SHOPKEEPER_X = -END_X; // ≈ 2.78
const SHOPKEEPER_Z = -2.18;
const SHOPKEEPER: readonly ShopkeeperPartGeometry[] = [
  { part: 'feet', box: box(SHOPKEEPER_X, 0.06, SHOPKEEPER_Z, 0.12, 0.06, 0.1) },
  { part: 'body', box: box(SHOPKEEPER_X, 0.86, SHOPKEEPER_Z, 0.13, 0.74, 0.1) },
  { part: 'hat', box: box(SHOPKEEPER_X, 1.67, SHOPKEEPER_Z, 0.15, 0.06, 0.15) },
  { part: 'fan', box: box(SHOPKEEPER_X - 0.05, 1.15, SHOPKEEPER_Z + 0.12, 0.09, 0.1, 0.01) },
];

const HIDDEN: readonly HiddenTargetGeometry[] = [
  { targetId: 'hidden-daruma', box: box(-SIDE_X + 0.1, 2.12, -2.36, 0.05, 0.06, 0.05) },
  { targetId: 'hidden-cat', box: box(SIDE_X - 0.1, 2.2, -0.75, 0.06, 0.06, 0.08) },
];

export const BOOTH_LAYOUT_V2: BoothLayout = Object.freeze({
  version: LAYOUT_V2_VERSION,
  slotModel: 'v2-36' as const,
  tiers: TIERS,
  slots: SLOTS,
  surfaces: SURFACES,
  devices: DEVICES,
  shopkeeper: SHOPKEEPER,
  hiddenTargets: HIDDEN,
  collectBelowY: 0.45,
  activeBounds: box(0, 1.2, -0.95, SIDE_X + 0.08, 1.3, 1.6),
  camera: {
    // The view keeps about three columns in sight and follows the stand position.
    standMinX: -(EDGE_X + 0.04),
    standMaxX: EDGE_X + 0.04,
    eye: { x: 0, y: 1.42, z: 0.45 },
    muzzle: { x: 0, y: 1.25, z: -0.3 },
    aimTarget: { x: 0, y: 1.2, z: -1.92 },
    yawLimit: 0.3,
    pitchMin: -0.3,
    pitchMax: 0.3,
  },
  backgroundCells: CELLS,
});

export const SLOT_IDS_V2: readonly SlotId[] = SLOTS.map((s) => s.slotId);
export const CELL_IDS_V2: readonly BackgroundCellId[] = CELLS.map((c) => c.cellId);

/** Row (1 = top) and 1-based column of a layout v2 slot id; null for any other id. */
export function slotRowColumn(slotId: string): { readonly row: 1 | 2 | 3; readonly column: number } | null {
  const m = /^slot-r([1-3])-c(0[1-9]|1[0-2])$/.exec(slotId);
  return m ? { row: Number(m[1]) as 1 | 2 | 3, column: Number(m[2]) } : null;
}

/**
 * Where a rules-v1 slot sits in v2 terms (row = 3 - tier, column = old + 1).
 * For comparisons and documents only: rules-v1 saves are never converted
 * into a 36-slot run with this.
 */
export function legacySlotPosition(slotId: string): { readonly row: 1 | 2 | 3; readonly column: number } | null {
  const m = /^t([0-2])c([0-2])$/.exec(slotId);
  return m ? { row: (3 - Number(m[1])) as 1 | 2 | 3, column: Number(m[2]) + 1 } : null;
}

/** The background cell paired with a v2 slot. */
export function cellForSlot(slotId: SlotId): BackgroundCellId {
  const rc = slotRowColumn(slotId);
  if (!rc) throw new TypeError(`not a layout v2 slot: ${slotId}`);
  return cellIdOf(rc.row, rc.column);
}

