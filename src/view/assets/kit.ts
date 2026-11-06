/**
 * Low-poly modelling kit (Task 11/13, owner: Visual).
 *
 * Recipes describe a prize as a list of coloured primitives. The kit bakes
 * them into ONE merged, vertex-coloured, non-indexed BufferGeometry so every
 * prize type costs a single draw call and shares one geometry between all of
 * its instances. Pure three.js geometry code: no WebGL, runs in Node.
 *
 * Recipe space: +x right, +y up, +z toward the player. Size is arbitrary;
 * src/view/prizes.ts fits the result into the physics shape.
 */
import * as THREE from 'three';

export type V3 = readonly [number, number, number];

export interface Part {
  readonly geo: THREE.BufferGeometry;
  readonly color: number;
}

const ZERO: V3 = [0, 0, 0];
export const ROT_X: V3 = [Math.PI / 2, 0, 0]; // cylinder axis y -> z
export const ROT_Z: V3 = [0, 0, Math.PI / 2]; // cylinder axis y -> x

const Z_AXIS = new THREE.Vector3(0, 0, 1);

export class Kit {
  readonly parts: Part[] = [];

  private place(g: THREE.BufferGeometry, color: number, pos: V3, rot: V3, scl?: V3): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(pos[0], pos[1], pos[2]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')),
      new THREE.Vector3(scl?.[0] ?? 1, scl?.[1] ?? 1, scl?.[2] ?? 1),
    );
    g.applyMatrix4(m);
    this.parts.push({ geo: g, color });
  }

  box = (c: number, w: number, h: number, d: number, p: V3 = ZERO, r: V3 = ZERO): void =>
    this.place(new THREE.BoxGeometry(w, h, d), c, p, r);

  /** Cylinder / truncated cone along y. `seg` 4 gives a square taper. */
  cyl = (c: number, rTop: number, rBot: number, h: number, p: V3 = ZERO, r: V3 = ZERO, seg = 10, thetaStart = 0, thetaLength = Math.PI * 2, scl?: V3): void =>
    this.place(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, false, thetaStart, thetaLength), c, p, r, scl);

  cone = (c: number, rad: number, h: number, p: V3 = ZERO, r: V3 = ZERO, seg = 8): void =>
    this.place(new THREE.CylinderGeometry(0, rad, h, seg, 1), c, p, r);

  sph = (c: number, rad: number, p: V3 = ZERO, scl?: V3, r: V3 = ZERO, hi = false): void =>
    this.place(hi ? new THREE.SphereGeometry(rad, 12, 8) : rad < 0.16 ? new THREE.SphereGeometry(rad, 6, 4) : new THREE.SphereGeometry(rad, 8, 6), c, p, r, scl);

  /** Torus (ring) in the xy plane; `arc` < 2*PI gives a partial arc. */
  tor = (c: number, R: number, tube: number, p: V3 = ZERO, r: V3 = ZERO, arc = Math.PI * 2, scl?: V3): void =>
    this.place(new THREE.TorusGeometry(R, tube, 5, arc < 6 ? 10 : 14, arc), c, p, r, scl);

  /** Triangular prism, apex up, bbox w x h, thickness d along z. */
  tri = (c: number, w: number, h: number, d: number, p: V3 = ZERO, r: V3 = ZERO): void => {
    const g = new THREE.CylinderGeometry(1, 1, d, 3, 1);
    g.rotateX(-Math.PI / 2);
    g.scale(w / 1.7320508, h / 1.5, 1);
    g.translate(0, -h / 6, 0);
    this.place(g, c, p, r);
  };

  /** Extruded star with n points in the xy plane, thickness d along z (centered). */
  star = (c: number, outer: number, inner: number, d: number, p: V3 = ZERO, r: V3 = ZERO, n = 5): void => {
    const s = new THREE.Shape();
    for (let i = 0; i < n * 2; i++) {
      const rad = i % 2 === 0 ? outer : inner;
      const a = Math.PI / 2 + (i * Math.PI) / n;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) s.moveTo(x, y);
      else s.lineTo(x, y);
    }
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2);
    this.place(g, c, p, r);
  };

  /** Flat blob lying on a sphere of radius R in direction `dir` (spots, patches, continents). */
  dot = (c: number, R: number, dir: V3, size: number, thick = 0.25, center: V3 = ZERO): void => {
    const n = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(Z_AXIS, n);
    const g = new THREE.SphereGeometry(size, 6, 4);
    g.scale(1, 1, thick);
    g.applyMatrix4(new THREE.Matrix4().compose(n.clone().multiplyScalar(R).add(new THREE.Vector3(center[0], center[1], center[2])), q, new THREE.Vector3(1, 1, 1)));
    this.parts.push({ geo: g, color: c });
  };
}

/** Merge parts into one non-indexed geometry with vertex colours (no uv). */
export function mergeParts(parts: readonly Part[]): THREE.BufferGeometry {
  let verts = 0;
  const flat = parts.map((p) => {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo;
    verts += g.getAttribute('position').count;
    return { g, color: new THREE.Color(p.color) };
  });
  const pos = new Float32Array(verts * 3);
  const nor = new Float32Array(verts * 3);
  const col = new Float32Array(verts * 3);
  let o = 0;
  for (const { g, color } of flat) {
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    for (let i = 0; i < pa.count; i++, o++) {
      pos.set([pa.getX(i), pa.getY(i), pa.getZ(i)], o * 3);
      nor.set([na.getX(i), na.getY(i), na.getZ(i)], o * 3);
      col.set([color.r, color.g, color.b], o * 3);
    }
  }
  for (const p of parts) p.geo.dispose();
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export function triangleCount(g: THREE.BufferGeometry): number {
  return g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
}
