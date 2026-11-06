/**
 * Prize meshes (Task 11/13, owner: Visual).
 *
 * Physics is the truth: every visual is scaled to sit INSIDE the collision
 * shape it is given (never larger), bottom-aligned for flat-bottomed shapes,
 * so a hit that looks like a hit is a hit. Geometry is shared per
 * (modelKey, shape); materials are shared per PrizeMaterial. Pure three.js
 * objects: works in Node without WebGL.
 */
import * as THREE from 'three';
import type { CollisionShape, PrizeMaterial } from '../contracts';
import { Kit, mergeParts } from './assets/kit';
import { C, PRIZE_RECIPES } from './assets/prize-recipes';

export interface PrizeVisualSpec {
  readonly shape: CollisionShape;
  readonly modelKey: string;
  readonly material: PrizeMaterial;
}

/** Axis-aligned half extents of a collision shape (shape-centered). */
export function shapeHalfExtents(shape: CollisionShape): { hx: number; hy: number; hz: number } {
  switch (shape.kind) {
    case 'box':
      return { hx: shape.halfExtents.x, hy: shape.halfExtents.y, hz: shape.halfExtents.z };
    case 'cylinder':
      return { hx: shape.radius, hy: shape.halfHeight, hz: shape.radius };
    case 'capsule':
      return { hx: shape.radius, hy: shape.halfHeight + shape.radius, hz: shape.radius };
    case 'ball':
      return { hx: shape.radius, hy: shape.radius, hz: shape.radius };
  }
}

/** True when the point (shape-local) lies inside the collision shape. */
export function insideShape(shape: CollisionShape, x: number, y: number, z: number, eps = 1e-5): boolean {
  switch (shape.kind) {
    case 'box':
      return Math.abs(x) <= shape.halfExtents.x + eps && Math.abs(y) <= shape.halfExtents.y + eps && Math.abs(z) <= shape.halfExtents.z + eps;
    case 'cylinder':
      return Math.hypot(x, z) <= shape.radius + eps && Math.abs(y) <= shape.halfHeight + eps;
    case 'capsule': {
      const cy = Math.max(-shape.halfHeight, Math.min(shape.halfHeight, y));
      return Math.hypot(x, y - cy, z) <= shape.radius + eps;
    }
    case 'ball':
      return Math.hypot(x, y, z) <= shape.radius + eps;
  }
}

function everyVertexInside(g: THREE.BufferGeometry, shape: CollisionShape, sxz: number, s: number): boolean {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    if (!insideShape(shape, p.getX(i) * sxz * s, p.getY(i) * s, p.getZ(i) * sxz * s, 0)) return false;
  }
  return true;
}

/**
 * Scale/translate `geo` in place so it fits inside `shape`. Per-axis stretch
 * is limited (<= 1.6x the smallest axis factor) to keep the model's character;
 * round shapes are then shrunk until every vertex is inside the true shape.
 */
export function fitGeometryToShape(geo: THREE.BufferGeometry, shape: CollisionShape): void {
  const ext = shapeHalfExtents(shape);
  const { hx, hz } = ext;
  // A capsule's round bottom cannot carry a flat-bottomed model; rest it slightly above the tip.
  const hy = shape.kind === 'capsule' ? shape.halfHeight + 0.8 * shape.radius : ext.hy;
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const size = bb.getSize(new THREE.Vector3());
  const sx = (2 * hx) / Math.max(size.x, 1e-6);
  const sy = (2 * hy) / Math.max(size.y, 1e-6);
  const sz = (2 * hz) / Math.max(size.z, 1e-6);
  const smin = Math.min(sx, sy, sz);
  const cap = smin * 1.6;
  const fx = Math.min(sx, cap);
  const fy = Math.min(sy, cap);
  const fz = Math.min(sz, cap);
  const center = bb.getCenter(new THREE.Vector3());
  geo.translate(-center.x, shape.kind === 'ball' ? -center.y : -bb.min.y, -center.z);
  geo.scale(fx, fy, fz);
  if (shape.kind !== 'ball') geo.translate(0, -hy, 0);

  if (shape.kind === 'cylinder' || shape.kind === 'capsule') {
    // Shrink the footprint until every vertex is inside the true round shape.
    if (!everyVertexInside(geo, shape, 1, 1)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 24; i++) {
        const mid = (lo + hi) / 2;
        if (everyVertexInside(geo, shape, mid, 1)) lo = mid;
        else hi = mid;
      }
      applyXZ(geo, lo * 0.999);
    }
  } else if (shape.kind === 'ball') {
    const p = geo.getAttribute('position');
    let maxR = 0;
    for (let i = 0; i < p.count; i++) maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getY(i), p.getZ(i)));
    if (maxR > shape.radius) {
      const u = (shape.radius / maxR) * 0.999;
      geo.scale(u, u, u);
    }
  }
  bakeShade(geo);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
}

function applyXZ(geo: THREE.BufferGeometry, s: number): void {
  const p = geo.getAttribute('position');
  const n = geo.getAttribute('normal');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * s, p.getY(i), p.getZ(i) * s);
  p.needsUpdate = true;
  n.needsUpdate = true;
}

/** Cheap baked ambient occlusion: darken toward the bottom of the model. */
function bakeShade(geo: THREE.BufferGeometry): void {
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  const h = Math.max(bb.max.y - bb.min.y, 1e-6);
  const p = geo.getAttribute('position');
  const c = geo.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const k = 0.78 + 0.22 * Math.min(1, Math.max(0, (p.getY(i) - bb.min.y) / h));
    c.setXYZ(i, c.getX(i) * k, c.getY(i) * k, c.getZ(i) * k);
  }
  c.needsUpdate = true;
}

const FALLBACK_COLOR: Record<PrizeMaterial, number> = {
  paper: C.cream, plastic: C.sky, wood: C.lightBrown, cloth: C.pink, metal: C.silver, glass: C.glass, ceramic: C.white, rubber: C.orange,
};

/** Unknown modelKey: a plain colour-coded primitive of the collision shape (never crashes). */
function fallbackRecipe(shape: CollisionShape, material: PrizeMaterial): Kit {
  const k = new Kit();
  const color = FALLBACK_COLOR[material];
  const { hx, hy, hz } = shapeHalfExtents(shape);
  switch (shape.kind) {
    case 'box':
      k.box(color, hx * 2, hy * 2, hz * 2);
      break;
    case 'cylinder':
      k.cyl(color, shape.radius, shape.radius, shape.halfHeight * 2);
      break;
    case 'capsule':
      k.cyl(color, shape.radius, shape.radius, shape.halfHeight * 2);
      k.sph(color, shape.radius, [0, shape.halfHeight, 0]);
      k.sph(color, shape.radius, [0, -shape.halfHeight, 0]);
      break;
    case 'ball':
      k.sph(color, shape.radius);
      break;
  }
  // A small contrasting "unknown" stripe so a missing recipe is noticed in play-tests.
  k.box(C.red, hx * 1.2, Math.max(hy * 0.15, 0.003), hz * 1.2, [0, 0, 0]);
  return k;
}

/** Build (unshared) fitted geometry for one prize kind and shape. */
export function buildPrizeGeometry(modelKey: string, shape: CollisionShape, material: PrizeMaterial = 'plastic'): THREE.BufferGeometry {
  const recipe = PRIZE_RECIPES[modelKey];
  let kit: Kit;
  if (recipe) {
    kit = new Kit();
    recipe.build(kit);
  } else {
    kit = fallbackRecipe(shape, material);
  }
  const geo = mergeParts(kit.parts);
  fitGeometryToShape(geo, shape);
  return geo;
}

const GLOSSY: Partial<Record<PrizeMaterial, number>> = { glass: 90, metal: 70, ceramic: 60, plastic: 30, rubber: 12 };

/** Shared materials per PrizeMaterial. */
export function createPrizeMaterials(): Record<PrizeMaterial, THREE.Material> {
  const out = {} as Record<PrizeMaterial, THREE.Material>;
  for (const m of ['paper', 'plastic', 'wood', 'cloth', 'metal', 'glass', 'ceramic', 'rubber'] as PrizeMaterial[]) {
    const shininess = GLOSSY[m];
    out[m] =
      shininess === undefined
        ? new THREE.MeshLambertMaterial({ vertexColors: true })
        : new THREE.MeshPhongMaterial({ vertexColors: true, shininess, specular: new THREE.Color(0x555555) });
  }
  return out;
}

export interface PrizeVisualFactory {
  /** A new Mesh sharing cached geometry/material. Never throws for unknown keys. */
  createMesh(spec: PrizeVisualSpec): THREE.Mesh;
  readonly geometryCount: () => number;
  dispose(): void;
}

function shapeKey(s: CollisionShape): string {
  switch (s.kind) {
    case 'box':
      return `b${s.halfExtents.x}_${s.halfExtents.y}_${s.halfExtents.z}`;
    case 'cylinder':
      return `c${s.radius}_${s.halfHeight}`;
    case 'capsule':
      return `p${s.radius}_${s.halfHeight}`;
    case 'ball':
      return `s${s.radius}`;
  }
}

export function createPrizeVisualFactory(): PrizeVisualFactory {
  const geos = new Map<string, THREE.BufferGeometry>();
  const mats = createPrizeMaterials();
  return {
    createMesh(spec) {
      const key = `${spec.modelKey}|${shapeKey(spec.shape)}|${PRIZE_RECIPES[spec.modelKey] ? '' : spec.material}`;
      let g = geos.get(key);
      if (!g) {
        g = buildPrizeGeometry(spec.modelKey, spec.shape, spec.material);
        geos.set(key, g);
      }
      const mesh = new THREE.Mesh(g, mats[spec.material]);
      mesh.matrixAutoUpdate = true;
      return mesh;
    },
    geometryCount: () => geos.size,
    dispose() {
      for (const g of geos.values()) g.dispose();
      geos.clear();
      for (const m of Object.values(mats)) m.dispose();
    },
  };
}
