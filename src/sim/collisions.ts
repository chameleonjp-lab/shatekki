/**
 * Cork contact math (Task 05): reflection and material bounce factors. Pure.
 * All numbers are prototype (O07/O08).
 */
import type { PrizeMaterial, SurfaceMaterial, Vec3 } from '../contracts';

/** A second contact of the same cork with the same target within this time is the same, continuing contact. */
export const CONTACT_DEDUPE_SEC = 0.05;
/** Share of the tangential speed kept at a bounce. */
export const TANGENTIAL_KEEP = 0.9;
/** A cork slower than this after a bounce has stopped. */
export const CORK_STOP_SPEED = 0.25;
export { GRAVITY_MPS2 as GRAVITY } from '../contracts';

/** Multiplier on the cork's restitution per material (1 = baseline wood). */
const BOUNCE: Readonly<Record<SurfaceMaterial | PrizeMaterial, number>> = {
  wood: 1.0,
  cloth: 0.35,
  paper: 0.6,
  metal: 1.15,
  plastic: 1.0,
  glass: 1.1,
  ceramic: 1.1,
  rubber: 1.3,
};
export function bounceFactor(material: SurfaceMaterial | PrizeMaterial): number {
  return BOUNCE[material];
}

export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-12 ? scale(a, 1 / l) : { x: 0, y: 0, z: 0 };
}

/**
 * Reflect `v` about the unit normal `n` (pointing toward the cork): the normal
 * component is reversed and scaled by `restitution`; the tangential component
 * is scaled by `tangentialKeep`. A velocity already moving away is unchanged.
 */
export function reflectVelocity(v: Vec3, n: Vec3, restitution: number, tangentialKeep: number): Vec3 {
  const vn = dot(v, n);
  if (vn >= 0) return v;
  const vt = sub(v, scale(n, vn));
  return add(scale(vt, tangentialKeep), scale(n, -restitution * vn));
}
