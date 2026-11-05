/** Plain-data math types shared by sim, view and persistence (serializable). */

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** Unit quaternion (x, y, z, w). */
export interface Quat {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
}

export interface Pose {
  readonly position: Vec3;
  readonly rotation: Quat;
}

export const vec3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const IDENTITY_QUAT: Quat = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });

/** Axis-aligned box given by center and half extents. */
export interface Box3 {
  readonly center: Vec3;
  readonly halfExtents: Vec3;
}

/** Oriented box: a Box3 rotated about its center. */
export interface OrientedBox extends Box3 {
  readonly rotation: Quat;
}

export function isFiniteVec3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

/** Quaternion for a rotation of `angle` radians about the unit axis (ax, ay, az). */
export function quatFromAxisAngle(ax: number, ay: number, az: number, angle: number): Quat {
  const h = angle / 2;
  const s = Math.sin(h);
  return { x: ax * s, y: ay * s, z: az * s, w: Math.cos(h) };
}
