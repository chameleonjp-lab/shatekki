/**
 * Runtime catalog for ALL 100 prizes and ALL 100 sets (Task 03 / 13 seed).
 *
 * Every value is PROTOTYPE (valueStatus 'prototype'): derived by rule from the
 * prize's name/category, documented in docs/design/tuning-log.md. Nothing here
 * is approved; the official ranking must not accept runs that use it.
 *
 * Source of names and set combinations: data/catalog-candidates.json
 * (only ids are used here; set membership is read from the candidate JSON).
 */
import type {
  CollisionShape,
  DifficultyTier,
  MotionSpec,
  PrizeMaterial,
  PrizeRuntimeConfig,
  PrizeTypeId,
  RuntimeCatalog,
  SetId,
  SetRuntimeConfig,
  CandidateCatalog,
} from '../contracts';
import { asPrizeTypeId, asSetId } from '../contracts';
import candidateData from '../../data/catalog-candidates.json';
import { validateCatalog } from './validate';

export const PROTOTYPE_RULES_VERSION = 'rules-v1-prototype';

/**
 * Global multiplier on real-world masses so that a 2 g cork can plausibly move
 * a prize. 1 = realistic. Prototype game-feel knob (tuning-log).
 */
export const PROTOTYPE_MASS_SCALE = 0.5;
export const PROTOTYPE_SET_BONUS = 100;

/** Max extents that fit the slot occupancy box (src/contracts/layout.ts): width 0.30, height 0.28, depth 0.26. */
export const MAX_PRIZE_WIDTH = 0.3;
export const MAX_PRIZE_HEIGHT = 0.28;
export const MAX_PRIZE_DEPTH = 0.26;

type Dim = readonly [w: number, h: number, d: number];
type ShapeSpec =
  | { readonly k: 'box'; readonly dim: Dim } // cm: width, height, depth
  | { readonly k: 'cyl'; readonly r: number; readonly h: number } // cm
  | { readonly k: 'cap'; readonly r: number; readonly hh: number } // cm: radius, half length of the straight part
  | { readonly k: 'ball'; readonly r: number }; // cm

const box = (w: number, h: number, d: number): ShapeSpec => ({ k: 'box', dim: [w, h, d] });
const cyl = (r: number, h: number): ShapeSpec => ({ k: 'cyl', r, h });
const cap = (r: number, hh: number): ShapeSpec => ({ k: 'cap', r, hh });
const ball = (r: number): ShapeSpec => ({ k: 'ball', r });

interface Row {
  readonly id: number;
  readonly shape: ShapeSpec;
  /** Real-world-ish mass in grams (before PROTOTYPE_MASS_SCALE). */
  readonly grams: number;
  readonly material: PrizeMaterial;
  readonly motion?: MotionSpec;
}

const r = (id: number, shape: ShapeSpec, grams: number, material: PrizeMaterial, motion?: MotionSpec): Row => ({
  id,
  shape,
  grams,
  material,
  ...(motion ? { motion } : {}),
});

/** Rule 1: size/material/mass by name and category. See tuning-log. */
const ROWS: readonly Row[] = [
  // snacks / sweets
  r(1, box(22, 8, 16), 260, 'paper'),
  r(2, box(18, 4, 9), 150, 'paper'),
  r(3, cyl(8, 7), 220, 'metal'),
  r(4, box(12, 16, 5), 100, 'plastic'),
  r(5, box(12, 16, 5), 110, 'plastic'),
  r(6, box(20, 12, 14), 180, 'plastic'),
  r(7, box(16, 22, 5), 80, 'plastic'),
  r(8, box(12, 18, 9), 120, 'paper'),
  r(9, cap(3, 7), 70, 'plastic'),
  r(10, cyl(5.5, 6), 150, 'ceramic'),
  r(11, cyl(7, 12), 380, 'ceramic'),
  r(12, cyl(7, 8), 200, 'rubber'),
  r(13, box(14, 22, 2), 50, 'paper'),
  r(14, cyl(6, 14), 70, 'paper', { type: 'swing', amplitudeRad: 0.25, periodSec: 3 }),
  r(15, box(15, 17, 6), 90, 'plastic'),
  r(16, cyl(3.2, 20), 260, 'glass'),
  r(17, cap(3.5, 8), 100, 'plastic'),
  r(18, cyl(7, 20), 60, 'plastic'),
  r(19, cyl(4, 12), 80, 'glass', { type: 'swing', amplitudeRad: 0.35, periodSec: 2.4 }),
  r(20, cyl(11, 8), 160, 'cloth'),
  r(21, box(14, 14, 3), 60, 'plastic'),
  r(22, ball(6), 40, 'rubber', { type: 'bob', amplitude: 0.03, periodSec: 2.2 }),
  r(23, box(16, 9, 7), 60, 'plastic', { type: 'slide', amplitude: 0.05, periodSec: 4 }),
  r(24, cyl(4, 7), 90, 'wood', { type: 'spin', periodSec: 3 }),
  r(25, cap(2.5, 9), 140, 'wood'),
  r(26, ball(6.5), 25, 'paper', { type: 'bob', amplitude: 0.025, periodSec: 2.8 }),
  r(27, box(20, 24, 1.5), 40, 'paper'),
  r(28, cyl(8, 10), 250, 'wood'),
  // plush toys 29-39
  r(29, box(14, 18, 10), 190, 'cloth'),
  r(30, box(14, 18, 10), 180, 'cloth'),
  r(31, box(12, 22, 9), 170, 'cloth'),
  r(32, box(18, 18, 12), 260, 'cloth'),
  r(33, box(16, 18, 9), 210, 'cloth'),
  r(34, box(16, 18, 11), 230, 'cloth'),
  r(35, box(16, 18, 11), 240, 'cloth'),
  r(36, box(14, 18, 10), 180, 'cloth'),
  r(37, box(14, 11, 11), 140, 'cloth'),
  r(38, box(16, 18, 11), 250, 'cloth'),
  r(39, box(12, 18, 9), 160, 'cloth'),
  // misc 40-55
  r(40, box(24, 10, 14), 130, 'cloth'),
  r(41, cap(3, 8), 50, 'plastic'),
  r(42, cyl(6, 22), 180, 'wood'),
  r(43, cyl(5, 10), 70, 'plastic'),
  r(44, box(12, 8, 7), 130, 'plastic'),
  r(45, box(20, 10, 8), 120, 'rubber', { type: 'bob', amplitude: 0.035, periodSec: 2.6 }),
  r(46, box(14, 8, 6), 70, 'rubber', { type: 'slide', amplitude: 0.05, periodSec: 3.4 }),
  r(47, box(22, 11, 12), 220, 'cloth'),
  r(48, box(20, 7, 16), 200, 'plastic'),
  r(49, box(16, 6, 12), 90, 'plastic', { type: 'slide', amplitude: 0.05, periodSec: 3.6 }),
  r(50, box(12, 7, 10), 110, 'ceramic'),
  r(51, cyl(8, 3), 60, 'plastic'),
  r(52, ball(7), 100, 'rubber'),
  r(53, cyl(6, 12), 50, 'plastic'),
  r(54, box(24, 20, 8), 300, 'wood'),
  r(55, cyl(9, 4), 80, 'plastic'),
  // vehicles 56-64
  r(56, box(16, 9, 7), 150, 'metal'),
  r(57, box(16, 9, 7), 150, 'metal'),
  r(58, box(16, 8, 7), 140, 'metal'),
  r(59, box(18, 10, 8), 200, 'metal'),
  r(60, box(18, 12, 7), 190, 'metal'),
  r(61, box(18, 10, 7), 190, 'metal'),
  r(62, box(26, 9, 6), 280, 'metal'),
  r(63, box(22, 6, 20), 120, 'plastic'),
  r(64, box(20, 9, 6), 180, 'metal'),
  // space / bags
  r(65, box(16, 20, 9), 170, 'cloth'),
  r(66, box(18, 6, 12), 160, 'plastic'),
  r(67, ball(8), 220, 'plastic'),
  r(68, cap(3.5, 10), 150, 'plastic'),
  r(69, box(10, 22, 6), 150, 'cloth'),
  r(70, cyl(4, 24), 300, 'metal'),
  r(71, box(16, 10, 10), 160, 'metal'),
  r(72, box(24, 12, 3), 90, 'plastic'),
  // flowers / insects
  r(73, cyl(7, 22), 100, 'plastic'),
  r(74, cap(3, 8), 60, 'plastic'),
  r(75, cyl(6, 18), 90, 'plastic'),
  r(76, box(14, 4, 10), 40, 'plastic', { type: 'bob', amplitude: 0.04, periodSec: 2.6 }),
  r(77, ball(5), 40, 'plastic', { type: 'slide', amplitude: 0.06, periodSec: 3.2 }),
  r(78, cap(4, 3), 40, 'wood'),
  r(79, ball(5), 50, 'rubber'),
  // instruments
  r(80, cyl(4, 20), 180, 'metal'),
  r(81, cyl(8, 4), 120, 'wood'),
  r(82, box(24, 18, 14), 420, 'wood'),
  r(83, box(10, 26, 4), 200, 'wood'),
  r(84, cap(3.5, 9), 90, 'plastic'),
  // balls / cards
  r(85, ball(6.5), 160, 'rubber'),
  r(86, ball(4), 145, 'rubber'),
  r(87, ball(7.5), 200, 'rubber'),
  r(88, box(8, 11, 3), 90, 'paper'),
  // food models
  r(89, box(10, 6, 9), 90, 'rubber'),
  r(90, box(14, 5, 7), 80, 'rubber'),
  r(91, box(12, 10, 12), 70, 'rubber'),
  r(92, cyl(8, 3), 70, 'rubber'),
  r(93, cyl(7, 8), 100, 'rubber'),
  r(94, box(8, 14, 8), 70, 'rubber'),
  r(95, cyl(10, 2.5), 120, 'rubber'),
  // kitchen toys
  r(96, cyl(10, 2), 100, 'plastic'),
  r(97, box(4, 22, 1.5), 60, 'metal'),
  r(98, cyl(9, 4), 200, 'metal'),
  r(99, cyl(8, 9), 250, 'metal'),
  r(100, box(5, 20, 1.5), 50, 'metal'),
];

/** Material → [friction, restitution]. */
export const MATERIAL_PHYSICS: Readonly<Record<PrizeMaterial, readonly [number, number]>> = {
  paper: [0.6, 0.1],
  plastic: [0.45, 0.3],
  wood: [0.5, 0.2],
  cloth: [0.8, 0.05],
  metal: [0.35, 0.25],
  glass: [0.3, 0.15],
  ceramic: [0.4, 0.15],
  rubber: [0.7, 0.5],
};

const cm = (v: number): number => v / 100;

function buildShape(s: ShapeSpec): CollisionShape {
  switch (s.k) {
    case 'box':
      return { kind: 'box', halfExtents: { x: cm(s.dim[0]) / 2, y: cm(s.dim[1]) / 2, z: cm(s.dim[2]) / 2 } };
    case 'cyl':
      return { kind: 'cylinder', radius: cm(s.r), halfHeight: cm(s.h) / 2 };
    case 'cap':
      return { kind: 'capsule', radius: cm(s.r), halfHeight: cm(s.hh) };
    case 'ball':
      return { kind: 'ball', radius: cm(s.r) };
  }
}

/** Full extents (width, height, depth) in meters of a shape's bounding box. */
export function shapeExtents(shape: CollisionShape): { w: number; h: number; d: number } {
  switch (shape.kind) {
    case 'box':
      return { w: shape.halfExtents.x * 2, h: shape.halfExtents.y * 2, d: shape.halfExtents.z * 2 };
    case 'cylinder':
      return { w: shape.radius * 2, h: shape.halfHeight * 2, d: shape.radius * 2 };
    case 'capsule':
      return { w: shape.radius * 2, h: (shape.halfHeight + shape.radius) * 2, d: shape.radius * 2 };
    case 'ball':
      return { w: shape.radius * 2, h: shape.radius * 2, d: shape.radius * 2 };
  }
}

/** Rule 2: tall & narrow → center of mass raised; balls neutral. */
function centerOfMassFor(shape: CollisionShape): { x: number; y: number; z: number } {
  const e = shapeExtents(shape);
  const aspect = e.h / Math.min(e.w, e.d);
  const k = shape.kind === 'ball' ? 0 : aspect > 2 ? 0.2 : aspect > 1.3 ? 0.1 : 0;
  return { x: 0, y: (e.h / 2) * k, z: 0 };
}

/** Rule 3: durability from mass: round(2 + 10 kg), clamped 2..8. */
function maxHpFor(massKg: number): number {
  return Math.min(8, Math.max(2, Math.round(2 + massKg * 10)));
}

/**
 * Rule 4: difficulty = how hard to knock down. Heavier, stickier and squat
 * prizes are harder; light, slippery, tall ones are easier.
 */
export function difficultyFor(massKg: number, friction: number, shape: CollisionShape): DifficultyTier {
  const e = shapeExtents(shape);
  const squat = e.h / Math.min(e.w, e.d) < 0.7 ? 1 : 0;
  const score = massKg * 10 + friction * 2 + squat; // roughly 1.5 .. 5
  if (score < 2.1) return 'easy';
  if (score < 3.4) return 'normal';
  return 'hard';
}

/** Rule 5: base score by difficulty. */
export const BASE_SCORE_BY_DIFFICULTY: Readonly<Record<DifficultyTier, number>> = { easy: 10, normal: 20, hard: 35 };

function buildPrize(row: Row): PrizeRuntimeConfig {
  const shape = buildShape(row.shape);
  const [friction, restitution] = MATERIAL_PHYSICS[row.material];
  const massKg = (row.grams / 1000) * PROTOTYPE_MASS_SCALE;
  const difficulty = difficultyFor(massKg / PROTOTYPE_MASS_SCALE, friction, shape);
  const typeId = asPrizeTypeId(`P${String(row.id).padStart(3, '0')}`);
  return {
    typeId,
    shape,
    massKg,
    centerOfMass: centerOfMassFor(shape),
    friction,
    restitution,
    maxHp: maxHpFor(massKg / PROTOTYPE_MASS_SCALE),
    baseScore: BASE_SCORE_BY_DIFFICULTY[difficulty],
    material: row.material,
    difficulty,
    motion: row.motion ?? { type: 'none' },
    modelKey: typeId,
    valueStatus: 'prototype',
  };
}

/**
 * Build the runtime catalog. Set membership comes from the validated candidate
 * data (so the 100 sets are exactly the candidates); all numbers are prototype.
 */
export function buildRuntimeCatalog(candidates: CandidateCatalog): RuntimeCatalog {
  const prizes = new Map<PrizeTypeId, PrizeRuntimeConfig>();
  for (const row of ROWS) {
    const p = buildPrize(row);
    prizes.set(p.typeId, p);
  }
  const sets = new Map<SetId, SetRuntimeConfig>();
  for (const s of candidates.sets) {
    const ids = s.required_prize_ids.map(asPrizeTypeId);
    const setId = asSetId(s.id);
    sets.set(setId, {
      setId,
      requiredTypeIds: [ids[0]!, ids[1]!, ids[2]!],
      bonusScore: PROTOTYPE_SET_BONUS,
      hintKey: `set.${s.id}.hint`,
      valueStatus: 'prototype',
    });
  }
  return { rulesVersion: PROTOTYPE_RULES_VERSION, prizes, sets };
}

/**
 * The prototype catalog for the whole game: validated candidate JSON plus the
 * prototype numbers above. Throws at import time if the candidates are invalid.
 */
export function createPrototypeCatalog(): RuntimeCatalog {
  const result = validateCatalog(candidateData);
  if (!result.valid || !result.catalog) {
    throw new Error(`catalog-candidates.json is invalid: ${JSON.stringify(result.errors.slice(0, 3))}`);
  }
  return buildRuntimeCatalog(result.catalog);
}

export const PROTOTYPE_CATALOG: RuntimeCatalog = createPrototypeCatalog();
