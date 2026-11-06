/**
 * Booth layout contract (Task 02, owner: Opus).
 *
 * One data source for both the physics colliders (src/sim) and the meshes
 * (src/view). The view must draw every collider-bearing element exactly where
 * it is here, and the sim must not invent geometry that is not here. If a
 * visual needs different geometry, change this file (Opus) and both sides.
 *
 * Units: meters. Axes: +y up, the player looks toward -z, +x is the player's right.
 * All numeric values are PROTOTYPE layout v1 (試作). They are not approved
 * final values (open items O07, O08, O12, O15).
 */
import type { DeviceId, SlotId } from './ids';
import { mintId, slotIdOf } from './ids';
import type { Box3, Vec3 } from './geometry';

export const LAYOUT_VERSION = 'layout-v1.1-prototype';

export type SurfaceMaterial = 'wood' | 'cloth' | 'paper' | 'metal' | 'plastic';

export interface ShelfTier {
  readonly tier: 0 | 1 | 2;
  /** Board top surface height. */
  readonly topY: number;
  readonly thickness: number;
  readonly centerZ: number;
  readonly depth: number;
  readonly halfWidth: number;
}

export interface SlotGeometry {
  readonly slotId: SlotId;
  readonly tier: 0 | 1 | 2;
  readonly column: 0 | 1 | 2;
  /** Where a new prize's bottom-center is placed (on the board top). */
  readonly spawnBase: Vec3;
  /**
   * A slot is "blocked" for replenishment while any uncollected prize's
   * bounding box overlaps this box (decision 30: defer, never delete/move).
   */
  readonly occupancyBox: Box3;
}

export interface StaticSurface {
  readonly id: string;
  readonly box: Box3;
  readonly material: SurfaceMaterial;
  /** Ordinary reflection; may be hit any number of times (decision 31). */
  readonly reflective: true;
}

export type DeviceKind =
  | 'split' // 分裂板: the cork becomes 2 corks; ammo is NOT increased
  | 'power' // 威力倍の板: damage/push x2 for the touching cork
  | 'transform' // 景品変更: a target prize changes kind after flight ends (decision 32)
  | 'penalty' // 減点札
  | 'ammo' // 所持弾+2 (bonus ammo cumulative cap 10)
  | 'bulletType'; // 弾種類変更

export interface DeviceGeometry {
  readonly deviceId: DeviceId;
  readonly kind: DeviceKind;
  readonly box: Box3;
  /** Outward normal of the face the cork is expected to hit. */
  readonly faceNormal: Vec3;
  /** Whether a straight shot from any stand position can reach it (else reflection only). */
  readonly directlyReachable: boolean;
}

export type ShopkeeperPart = 'hat' | 'fan' | 'body' | 'feet';

export interface ShopkeeperPartGeometry {
  readonly part: ShopkeeperPart;
  readonly box: Box3;
}

export interface HiddenTargetGeometry {
  readonly targetId: string;
  readonly box: Box3;
}

export interface CameraRig {
  /** Stand position range along the counter (x). */
  readonly standMinX: number;
  readonly standMaxX: number;
  readonly eye: Vec3; // x is replaced by the stand position
  readonly muzzle: Vec3; // x is replaced by the stand position
  /** Direction the "zero aim" points to (from the muzzle). */
  readonly aimTarget: Vec3; // x is replaced by the stand position
  readonly yawLimit: number; // radians, symmetric
  readonly pitchMin: number;
  readonly pitchMax: number;
}

export interface BoothLayout {
  readonly version: string;
  readonly tiers: readonly ShelfTier[];
  readonly slots: readonly SlotGeometry[];
  readonly surfaces: readonly StaticSurface[];
  readonly devices: readonly DeviceGeometry[];
  readonly shopkeeper: readonly ShopkeeperPartGeometry[];
  readonly hiddenTargets: readonly HiddenTargetGeometry[];
  /** A prize whose center falls below this height is collected (獲得). */
  readonly collectBelowY: number;
  /** Projectiles leaving this box are removed (not scored). Off-screen inside is still simulated. */
  readonly activeBounds: Box3;
  readonly camera: CameraRig;
}

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box3 => ({
  center: { x: cx, y: cy, z: cz },
  halfExtents: { x: hx, y: hy, z: hz },
});

const TIERS: readonly ShelfTier[] = [
  { tier: 0, topY: 0.8, thickness: 0.03, centerZ: -1.75, depth: 0.28, halfWidth: 0.63 },
  { tier: 1, topY: 1.16, thickness: 0.03, centerZ: -1.92, depth: 0.28, halfWidth: 0.63 },
  { tier: 2, topY: 1.52, thickness: 0.03, centerZ: -2.09, depth: 0.28, halfWidth: 0.63 },
];

const COLUMN_X = [-0.42, 0, 0.42] as const;

const SLOTS: readonly SlotGeometry[] = TIERS.flatMap((t) =>
  COLUMN_X.map((x, column) => ({
    slotId: slotIdOf(t.tier, column),
    tier: t.tier,
    column: column as 0 | 1 | 2,
    spawnBase: { x, y: t.topY, z: t.centerZ },
    occupancyBox: box(x, t.topY + 0.15, t.centerZ, 0.15, 0.14, 0.13),
  })),
);

const BACK_Z = -2.45;
const SIDE_X = 1.05;
const CEIL_Y = 2.3;

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

const DEVICES: readonly DeviceGeometry[] = [
  { deviceId: mintId.device('dev-split-1'), kind: 'split', box: box(-0.82, 1.62, BACK_Z + 0.01, 0.1, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-power-1'), kind: 'power', box: box(-SIDE_X + 0.01, 1.3, -1.25, 0.01, 0.12, 0.14), faceNormal: { x: 1, y: 0, z: 0 }, directlyReachable: true },
  { deviceId: mintId.device('dev-transform-1'), kind: 'transform', box: box(0, 2.08, -2.25, 0.06, 0.06, 0.06), faceNormal: { x: 0, y: -1, z: 0 }, directlyReachable: false },
  { deviceId: mintId.device('dev-penalty-1'), kind: 'penalty', box: box(-0.82, 0.95, BACK_Z + 0.01, 0.08, 0.1, 0.01), faceNormal: { x: 0, y: 0, z: 1 }, directlyReachable: true },
  { deviceId: mintId.device('dev-ammo-1'), kind: 'ammo', box: box(SIDE_X - 0.01, 2.0, -1.8, 0.01, 0.09, 0.09), faceNormal: { x: -1, y: 0, z: 0 }, directlyReachable: false },
  { deviceId: mintId.device('dev-bullet-1'), kind: 'bulletType', box: box(-SIDE_X + 0.01, 0.62, -1.6, 0.01, 0.09, 0.09), faceNormal: { x: 1, y: 0, z: 0 }, directlyReachable: true },
];

// The shopkeeper stands in the right back corner beside the top shelf so the
// default portrait view shows them (requirements §5 "屋台の端に店主"). Layout v1.1.
const SHOPKEEPER_X = 0.8;
const SHOPKEEPER_Z = -2.18;
const SHOPKEEPER: readonly ShopkeeperPartGeometry[] = [
  { part: 'feet', box: box(SHOPKEEPER_X, 0.06, SHOPKEEPER_Z, 0.12, 0.06, 0.1) },
  { part: 'body', box: box(SHOPKEEPER_X, 0.86, SHOPKEEPER_Z, 0.13, 0.74, 0.1) },
  { part: 'hat', box: box(SHOPKEEPER_X, 1.67, SHOPKEEPER_Z, 0.15, 0.06, 0.15) },
  { part: 'fan', box: box(SHOPKEEPER_X - 0.05, 1.15, SHOPKEEPER_Z + 0.12, 0.09, 0.1, 0.01) },
];

const HIDDEN: readonly HiddenTargetGeometry[] = [
  { targetId: 'hidden-daruma', box: box(-0.97, 2.12, -2.36, 0.05, 0.06, 0.05) },
  { targetId: 'hidden-cat', box: box(0.95, 2.2, -0.75, 0.06, 0.06, 0.08) },
];

export const BOOTH_LAYOUT: BoothLayout = Object.freeze({
  version: LAYOUT_VERSION,
  tiers: TIERS,
  slots: SLOTS,
  surfaces: SURFACES,
  devices: DEVICES,
  shopkeeper: SHOPKEEPER,
  hiddenTargets: HIDDEN,
  collectBelowY: 0.45,
  activeBounds: box(0, 1.2, -0.95, SIDE_X + 0.08, 1.3, 1.6),
  camera: {
    standMinX: -0.45,
    standMaxX: 0.45,
    eye: { x: 0, y: 1.42, z: 0.45 },
    muzzle: { x: 0, y: 1.25, z: -0.3 },
    aimTarget: { x: 0, y: 1.2, z: -1.92 },
    yawLimit: 0.3,
    pitchMin: -0.3,
    pitchMax: 0.3,
  },
});

export const SLOT_IDS: readonly SlotId[] = SLOTS.map((s) => s.slotId);
