/**
 * Booth layout v3 (r007 "aim first" candidate, plan 2026-11-19 工程2/4).
 *
 * The same 3×12 shelf as layout v2, with the inner walls covered by 100 cells:
 * the back wall in 14 columns × 5 bands (the 36 cells behind the slots keep
 * their v2 ids and slot pairing) and both side walls in 3 lanes × 5 bands.
 * The muzzle moves to the front of the counter and the stand and aim ranges
 * widen so the front lanes of the side walls are reachable. The shopkeeper
 * stands at the right end; the fan in their hand and a tray on a low stand are
 * oriented panels that reflect corks toward the shelves.
 *
 * Every number is PROTOTYPE (試作) for the internal candidate rules-v2-proposed-r007.
 * Layout v1 and v2 stay unchanged.
 */
import type { BackgroundCellId } from './ids';
import { isBackgroundCellId } from './ids';
import type { Box3, Vec3 } from './geometry';
import type { BackgroundCellGeometry, BoothLayout, ReflectorGeometry, ShopkeeperPartGeometry } from './layout';
import { BOOTH_LAYOUT_V2, V2_COLUMNS, V2_COLUMN_PITCH, columnX } from './layout-v2';

export const LAYOUT_V3_VERSION = 'layout-v3.0-prototype';

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number): Box3 => ({
  center: { x: cx, y: cy, z: cz },
  halfExtents: { x: hx, y: hy, z: hz },
});

export const V3_SIDE_X = 3.0;
export const V3_BACK_Z = -2.45;
export const V3_FRONT_Z = -0.15;
/** Band edges from the top: 2.30 / 1.88 / 1.52 / 1.16 / 0.80 / 0. Band 2..4 are the v2 rows r1..r3. */
export const V3_BAND_EDGES = [2.3, 1.88, 1.52, 1.16, 0.8, 0] as const;
const BAND_NAMES = ['top', 'r1', 'r2', 'r3', 'bot'] as const;
const LANE_NAMES = ['back', 'mid', 'front'] as const;
/** The 12 middle columns are 0.42 m (±2.52); the two end columns are 0.48 m each. */
const CENTER_HALF = (V2_COLUMNS * V2_COLUMN_PITCH) / 2; // 2.52
const CELL_HALF_DEPTH = 0.004;

/** x range of back-wall column 1..14 (1 = left end, 2..13 = v2 columns c01..c12, 14 = right end). */
export function backColumnRange(lane: number): { readonly min: number; readonly max: number } {
  if (lane === 1) return { min: -V3_SIDE_X, max: -CENTER_HALF };
  if (lane === 14) return { min: CENTER_HALF, max: V3_SIDE_X };
  const cx = columnX(lane - 2);
  return { min: cx - V2_COLUMN_PITCH / 2, max: cx + V2_COLUMN_PITCH / 2 };
}

/** z range of side-wall lane 1..3 (1 = back, 3 = front). */
export function sideLaneRange(lane: number): { readonly min: number; readonly max: number } {
  const w = (V3_FRONT_Z - V3_BACK_Z) / 3;
  return { min: V3_BACK_Z + (lane - 1) * w, max: V3_BACK_Z + lane * w };
}

function backCellId(band: number, lane: number): BackgroundCellId {
  const b = BAND_NAMES[band - 1]!;
  const inner = lane >= 2 && lane <= 13;
  const col = lane === 1 ? 'L' : lane === 14 ? 'R' : String(lane - 1).padStart(2, '0');
  const id = inner && band >= 2 && band <= 4 ? `cell-r${band - 1}-c${col}` : `cell-bk-${b}-${col}`;
  if (!isBackgroundCellId(id)) throw new TypeError(`invalid v3 back cell id ${id}`);
  return id;
}

function sideCellId(face: 'left' | 'right', band: number, lane: number): BackgroundCellId {
  const id = `cell-${face === 'left' ? 'l' : 'r'}w-${BAND_NAMES[band - 1]!}-${LANE_NAMES[lane - 1]!}`;
  if (!isBackgroundCellId(id)) throw new TypeError(`invalid v3 side cell id ${id}`);
  return id;
}

function bandRange(band: number): { readonly top: number; readonly bottom: number } {
  return { top: V3_BAND_EDGES[band - 1]!, bottom: V3_BAND_EDGES[band]! };
}

const v2Cells = BOOTH_LAYOUT_V2.backgroundCells!;
const v2ById = new Map(v2Cells.map((c) => [c.cellId as string, c]));

function backCell(band: number, lane: number): BackgroundCellGeometry {
  const id = backCellId(band, lane);
  const old = v2ById.get(id);
  const x = backColumnRange(lane);
  const y = bandRange(band);
  const geometry = {
    box: box((x.min + x.max) / 2, (y.top + y.bottom) / 2, V3_BACK_Z + CELL_HALF_DEPTH, (x.max - x.min) / 2, (y.top - y.bottom) / 2, CELL_HALF_DEPTH),
    faceNormal: { x: 0, y: 0, z: 1 },
    face: 'back' as const,
    band,
    lane,
  };
  // The 36 cells behind the slots keep their v2 id, slot pairing and box.
  return old ? { ...old, ...geometry, box: old.box } : { cellId: id, ...geometry };
}

function sideCell(face: 'left' | 'right', band: number, lane: number): BackgroundCellGeometry {
  const z = sideLaneRange(lane);
  const y = bandRange(band);
  const sign = face === 'left' ? -1 : 1;
  return {
    cellId: sideCellId(face, band, lane),
    box: box(sign * (V3_SIDE_X - CELL_HALF_DEPTH), (y.top + y.bottom) / 2, (z.min + z.max) / 2, CELL_HALF_DEPTH, (y.top - y.bottom) / 2, (z.max - z.min) / 2),
    faceNormal: { x: -sign, y: 0, z: 0 },
    face,
    band,
    lane,
  };
}

const BACK: readonly BackgroundCellGeometry[] = [1, 2, 3, 4, 5].flatMap((band) => Array.from({ length: 14 }, (_, i) => backCell(band, i + 1)));
const INNER = BACK.filter((c) => c.slotId !== undefined);
const OUTER_BACK = BACK.filter((c) => c.slotId === undefined);
const SIDES: readonly BackgroundCellGeometry[] = (['left', 'right'] as const).flatMap((face) =>
  [1, 2, 3, 4, 5].flatMap((band) => [1, 2, 3].map((lane) => sideCell(face, band, lane))),
);
// Same order as v2 for the first 36 (validation and saves compare positions), then back extras, left, right.
const CELLS: readonly BackgroundCellGeometry[] = [
  ...v2Cells.map((c) => INNER.find((x) => x.cellId === c.cellId)!),
  ...OUTER_BACK,
  ...SIDES,
];

// ---- shopkeeper, fan and tray (right end, in front of back-wall column 14)
const SK_X = 2.8;
const SK_Z = -2.33;
const SHOPKEEPER: readonly ShopkeeperPartGeometry[] = [
  { part: 'feet', box: box(SK_X, 0.06, SK_Z + 0.02, 0.13, 0.06, 0.1) },
  // Legs, torso, arms at the sides and the head: one 'body' volume, as before.
  { part: 'body', box: box(SK_X, 0.86, SK_Z, 0.15, 0.74, 0.09) },
  { part: 'hat', box: box(SK_X, 1.67, SK_Z, 0.14, 0.06, 0.14) },
  // T04: the right forearm that reaches out to the fan. Drawn where it is, and counts as 'body'.
  { part: 'body', box: box(2.655, 1.2, -2.2, 0.03, 0.07, 0.05) },
];

/** Unit quaternion for a rotation of `a` radians about the unit axis (x, y, z). */
function quat(x: number, y: number, z: number, a: number): ReflectorGeometry['rotation'] {
  const s = Math.sin(a / 2);
  return { x: x * s, y: y * s, z: z * s, w: Math.cos(a / 2) };
}
function rotate(q: ReflectorGeometry['rotation'], v: Vec3): Vec3 {
  // v' = q v q*
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return { x: ix * w + iw * -x + iy * -z - iz * -y, y: iy * w + iw * -y + iz * -x - ix * -z, z: iz * w + iw * -z + ix * -y - iy * -x };
}
function mul(a: ReflectorGeometry['rotation'], b: ReflectorGeometry['rotation']): ReflectorGeometry['rotation'] {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}
function reflector(reflectorId: ReflectorGeometry['reflectorId'], part: ReflectorGeometry['part'], center: Vec3, half: Vec3, yaw: number, tilt: number, material: ReflectorGeometry['material'], bounce: number): ReflectorGeometry {
  // Turn about y toward the shelf (positive yaw faces the player's left), then tilt about the panel's own x.
  const rotation = mul(quat(0, 1, 0, yaw), quat(1, 0, 0, tilt));
  const n = rotate(rotation, { x: 0, y: 0, z: 1 });
  const len = Math.hypot(n.x, n.y, n.z);
  return { reflectorId, part, center, halfExtents: half, rotation, frontNormal: { x: n.x / len, y: n.y / len, z: n.z / len }, material, bounce };
}

/**
 * Prototype angles: a cork from the right end of the counter hits the fan face and goes
 * on toward the right end of the middle board; the tray sends it to the bottom board.
 * Measured with real shots in tests/integration/aim-first-shopkeeper.test.ts.
 */
export const V3_REFLECTORS: readonly ReflectorGeometry[] = [
  // T04: the round fan is a disc, the same circle that is drawn (radius 0.12).
  { ...reflector('fan', 'fan', { x: 2.62, y: 1.3, z: -2.12 }, { x: 0.12, y: 0.12, z: 0.008 }, -0.62, 0, 'paper', 0.9), shape: 'disc' as const },
  reflector('tray', null, { x: 2.7, y: 1.0, z: -1.98 }, { x: 0.13, y: 0.1, z: 0.01 }, -0.66, 0, 'wood', 0.9),
];

const V2 = BOOTH_LAYOUT_V2;

export const BOOTH_LAYOUT_V3: BoothLayout = Object.freeze({
  ...V2,
  version: LAYOUT_V3_VERSION,
  slotModel: 'v3-36' as const,
  shopkeeper: SHOPKEEPER,
  // The tray's low stand (a thin post) is part of the scenery; the tray itself is a reflector.
  // The counter moves in front of the side walls (z -0.12..0.12) so no cell sits behind it (measured: at z -0.25 it hid
  // the bottom front lane of both side walls). The tray's low stand is scenery; the tray itself is a reflector.
  surfaces: [
    ...V2.surfaces.map((s) => (s.id === 'counter' ? { ...s, box: box(0, 0.47, 0, V3_SIDE_X, 0.47, 0.12) } : s)),
    { id: 'tray-stand', box: box(2.7, 0.44, -1.98, 0.015, 0.44, 0.015), material: 'wood' as const, reflective: true as const },
  ],
  activeBounds: box(0, 1.2, -0.7, V3_SIDE_X + 0.08, 1.3, 1.85),
  camera: {
    standMinX: -2.65,
    standMaxX: 2.65,
    eye: { x: 0, y: 1.45, z: 1.05 },
    muzzle: { x: 0, y: 1.25, z: 0.35 },
    aimTarget: { x: 0, y: 1.2, z: -1.92 },
    yawLimit: 0.72,
    pitchMin: -0.7,
    pitchMax: 0.7,
  },
  backgroundCells: CELLS,
  reflectors: V3_REFLECTORS,
});

export const CELL_IDS_V3: readonly BackgroundCellId[] = CELLS.map((c) => c.cellId);

/** Face-local coordinates of a world point on a cell face: back = (x, y), sides = (z, y). */
export function faceCoordinates(face: 'back' | 'left' | 'right', p: Vec3): { readonly u: number; readonly v: number } {
  return face === 'back' ? { u: p.x, v: p.y } : { u: p.z, v: p.y };
}

/** The one tolerance for cell faces: distance from the printed plane, and the floating error at edges. */
export const CELL_PLANE_TOLERANCE = 0.009;
export const CELL_EDGE_EPS = 1e-6;

const FACE_ORDER: readonly ('back' | 'left' | 'right')[] = ['back', 'left', 'right'];

/**
 * The one cell a contact point belongs to. Faces are tried back → left → right, so a point on the
 * corner of two walls belongs to the back wall. On a face, each cell owns [min, max) of its two face
 * coordinates; only the outermost edge of the face is closed. Null when the point is on no cell.
 */
export function cellAtFacePoint(cells: readonly BackgroundCellGeometry[], p: Vec3): BackgroundCellGeometry | null {
  for (const face of FACE_ORDER) {
    const onFace = cells.filter((c) => (c.face ?? 'back') === face);
    if (onFace.length === 0) continue;
    const plane = face === 'back' ? onFace[0]!.box.center.z + onFace[0]!.box.halfExtents.z : face === 'left' ? onFace[0]!.box.center.x + onFace[0]!.box.halfExtents.x : onFace[0]!.box.center.x - onFace[0]!.box.halfExtents.x;
    const d = face === 'back' ? p.z - plane : p.x - plane;
    if (Math.abs(d) > CELL_PLANE_TOLERANCE) continue;
    const { u, v } = faceCoordinates(face, p);
    const uMax = Math.max(...onFace.map((c) => uRange(face, c).max));
    const vMax = Math.max(...onFace.map((c) => c.box.center.y + c.box.halfExtents.y));
    for (const c of onFace) {
      const ur = uRange(face, c);
      const vr = { min: c.box.center.y - c.box.halfExtents.y, max: c.box.center.y + c.box.halfExtents.y };
      // Every interval is shifted by the same EPS, so neighbours meet without a gap or an overlap.
      const inU = u >= ur.min - CELL_EDGE_EPS && (u < ur.max - CELL_EDGE_EPS || (ur.max >= uMax - CELL_EDGE_EPS && u <= ur.max + CELL_EDGE_EPS));
      const inV = v >= vr.min - CELL_EDGE_EPS && (v < vr.max - CELL_EDGE_EPS || (vr.max >= vMax - CELL_EDGE_EPS && v <= vr.max + CELL_EDGE_EPS));
      if (inU && inV) return c;
    }
  }
  return null;
}

function uRange(face: 'back' | 'left' | 'right', c: BackgroundCellGeometry): { min: number; max: number } {
  const b = c.box;
  return face === 'back' ? { min: b.center.x - b.halfExtents.x, max: b.center.x + b.halfExtents.x } : { min: b.center.z - b.halfExtents.z, max: b.center.z + b.halfExtents.z };
}

/** Cells sharing an edge with `cell` on the same wall (layout v3 cells only). */
export function neighbourCells(cells: readonly BackgroundCellGeometry[], cell: BackgroundCellGeometry): BackgroundCellGeometry[] {
  if (cell.band === undefined || cell.lane === undefined) return [];
  const face = cell.face ?? 'back';
  return cells.filter((c) => (c.face ?? 'back') === face && c.band !== undefined && c.lane !== undefined && Math.abs(c.band - cell.band!) + Math.abs(c.lane - cell.lane!) === 1);
}
