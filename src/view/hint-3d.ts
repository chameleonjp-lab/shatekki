/**
 * 3D pieces of the next-shot hints (FX098 dashed preview, FX099 trails and
 * reflection rings). Instanced boxes/rings so they stay thick and visible on a
 * phone (WebGL lines are 1 px) and cost three draw calls in total. Pure
 * three.js; presentation only, never read back by the game.
 */
import * as THREE from 'three';
import type { Vec3 } from '../contracts';
import { TRAJECTORY_MAX_BOUNCES, TRAJECTORY_MAX_CORKS, TRAJECTORY_MAX_POINTS, dashPolyline, type CorkTrack } from './gameplay-hints';

export const DASH_CAP = 160;
const TRAIL_CAP = TRAJECTORY_MAX_CORKS * (TRAJECTORY_MAX_POINTS - 1);
const RING_CAP = TRAJECTORY_MAX_CORKS * TRAJECTORY_MAX_BOUNCES;

/** Distinct hues for cork 1..8; the cork number is also drawn as text, so colour is never the only cue. */
export const CORK_COLORS: readonly number[] = [0xfff2b0, 0x7ae0ff, 0xff9ec0, 0xb8f0c8, 0xffc27a, 0xc9a8ff, 0xf5f5f5, 0xffe066];

const Z = new THREE.Vector3(0, 0, 1);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export interface Hint3D {
  readonly group: THREE.Group;
  /** FX098: the first-contact estimate as a dashed line (null hides it). Returns the dash count. */
  setAimPreview(points: readonly Vec3[] | null): number;
  /** FX099: solid trails per cork plus rings at the real contact points (null hides them). */
  setTracks(tracks: readonly CorkTrack[] | null): { segments: number; rings: number };
  /** Turns the rings toward the camera. */
  faceCamera(camera: THREE.Camera): void;
  dispose(): void;
}

function segmentMatrix(a: Vec3, b: Vec3, thickness: number, out: THREE.Matrix4): boolean {
  tmpA.set(a.x, a.y, a.z);
  tmpB.set(b.x, b.y, b.z);
  const len = tmpA.distanceTo(tmpB);
  if (len < 1e-5) return false;
  tmpB.sub(tmpA).divideScalar(len);
  tmpQ.setFromUnitVectors(Z, tmpB);
  tmpS.set(thickness, thickness, len);
  tmpA.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  out.compose(tmpA, tmpQ, tmpS);
  return true;
}

export function createHint3D(): Hint3D {
  const group = new THREE.Group();
  group.name = 'hint-3d';

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, depthTest: false, transparent: true, opacity: 0.95 });
  const dashes = new THREE.InstancedMesh(boxGeo, dashMat, DASH_CAP);
  dashes.name = 'hint:aim-dashes';
  dashes.renderOrder = 998;
  dashes.count = 0;
  dashes.frustumCulled = false;

  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const trails = new THREE.InstancedMesh(boxGeo, trailMat, TRAIL_CAP);
  trails.name = 'hint:trails';
  trails.count = 0;
  trails.frustumCulled = false;
  trails.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(TRAIL_CAP * 3), 3);

  const ringGeo = new THREE.RingGeometry(0.7, 1, 20);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, RING_CAP);
  rings.name = 'hint:rings';
  rings.renderOrder = 997;
  rings.count = 0;
  rings.frustumCulled = false;
  rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(RING_CAP * 3), 3);
  const ringPos: Vec3[] = [];

  group.add(dashes, trails, rings);
  group.visible = true;

  return {
    group,
    setAimPreview(points) {
      if (!points || points.length < 2) {
        dashes.count = 0;
        return 0;
      }
      const segs = dashPolyline(points, 0.07, 0.05, DASH_CAP);
      let n = 0;
      for (const d of segs) {
        if (!segmentMatrix(d.a, d.b, 0.012, tmpM)) continue;
        dashes.setMatrixAt(n++, tmpM);
      }
      dashes.count = n;
      dashes.instanceMatrix.needsUpdate = true;
      return n;
    },
    setTracks(tracks) {
      ringPos.length = 0;
      if (!tracks) {
        trails.count = 0;
        rings.count = 0;
        return { segments: 0, rings: 0 };
      }
      let n = 0;
      let r = 0;
      for (const t of tracks) {
        const color = tmpC.setHex(CORK_COLORS[(t.number - 1) % CORK_COLORS.length]!);
        for (let i = 0; i < t.points.length - 1 && n < TRAIL_CAP; i++) {
          if (!segmentMatrix(t.points[i]!, t.points[i + 1]!, 0.01, tmpM)) continue;
          trails.setMatrixAt(n, tmpM);
          trails.setColorAt(n, color);
          n++;
        }
        for (const p of t.reflections) {
          if (r >= RING_CAP) break;
          ringPos.push(p);
          tmpM.makeTranslation(p.x, p.y, p.z);
          rings.setMatrixAt(r, tmpM);
          rings.setColorAt(r, color);
          r++;
        }
      }
      trails.count = n;
      rings.count = r;
      trails.instanceMatrix.needsUpdate = true;
      rings.instanceMatrix.needsUpdate = true;
      if (trails.instanceColor) trails.instanceColor.needsUpdate = true;
      if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
      return { segments: n, rings: r };
    },
    faceCamera(camera) {
      if (rings.count === 0) return;
      tmpQ.copy(camera.quaternion);
      tmpS.setScalar(0.045);
      for (let i = 0; i < rings.count; i++) {
        const p = ringPos[i]!;
        tmpA.set(p.x, p.y, p.z);
        tmpM.compose(tmpA, tmpQ, tmpS);
        rings.setMatrixAt(i, tmpM);
      }
      rings.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      boxGeo.dispose();
      ringGeo.dispose();
      dashMat.dispose();
      trailMat.dispose();
      ringMat.dispose();
      dashes.dispose();
      trails.dispose();
      rings.dispose();
      group.clear();
    },
  };
}
