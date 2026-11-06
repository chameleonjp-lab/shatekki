/**
 * Stall geometry from BOOTH_LAYOUT (Task 11, owner: Visual).
 *
 * Rules:
 *  - Every layout surface / device / shopkeeper part / hidden target is drawn
 *    at exactly its layout box (the plate IS the box). Nothing is drawn that
 *    a cork could visibly pass through but not collide with, except flat
 *    decals (<= 5 mm) and the hair-thin bell cord.
 *  - An invisible "collision proxy" box per layout element is kept for the
 *    reticle raycast so the aim point follows the physics boxes, not the art.
 *  - Static pieces are merged into one vertex-coloured mesh (1 draw call).
 */
import * as THREE from 'three';
import type { Box3, BoothLayout, DeviceGeometry, HiddenTargetGeometry, StaticSurface } from '../contracts';
import { Kit, ROT_X, mergeParts, type V3 } from './assets/kit';
import { C } from './assets/prize-recipes';
import { buildShopkeeper } from './shopkeeper';

const PI = Math.PI;
const DECAL = 0.002;

export interface BoothBuild {
  readonly group: THREE.Group;
  /** Invisible exact layout boxes, used only for raycasting the aim point. */
  readonly proxies: THREE.Group;
  readonly devices: ReadonlyMap<string, THREE.Object3D>;
  readonly hidden: ReadonlyMap<string, THREE.Object3D>;
  readonly shopkeeper: ReadonlyMap<string, THREE.Mesh>;
  readonly lights: readonly THREE.Light[];
  /** Re-grows the invisible collision proxies to a new cork radius (expanded rules: FX083/FX084). */
  setPickInflate(inflate: number): void;
  dispose(): void;
}

const size = (b: Box3): V3 => [b.halfExtents.x * 2, b.halfExtents.y * 2, b.halfExtents.z * 2];
const pos = (b: Box3): V3 => [b.center.x, b.center.y, b.center.z];

// --------------------------------------------------------------------- static

function paintSurface(k: Kit, s: StaticSurface, hasCells: boolean): void {
  const b = s.box;
  const [w, h, d] = size(b);
  const [cx, cy, cz] = pos(b);
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;
  switch (s.id) {
    case 'floor': {
      k.box(0x4a2a2a, w, h, d, [cx, cy, cz]);
      // collection cloth: deep red with cream stripes along z
      const top = cy + hy + DECAL / 2;
      for (let i = 0; i < 7; i++) k.box(i % 2 ? 0x8a2e32 : 0x6e2328, w / 7, DECAL, d, [cx - hx + (i + 0.5) * (w / 7), top, cz]);
      k.box(C.cream, w, DECAL * 2, 0.04, [cx, top + DECAL / 2, cz - hz + 0.05]);
      break;
    }
    case 'back-wall': {
      k.box(0x5a3924, w, h, d, [cx, cy, cz]);
      const front = cz + hz + DECAL / 2;
      for (let i = 0; i < 14; i++) k.box(i % 2 ? 0x6b4429 : 0x5a3924, w / 14, h - 0.04, DECAL, [cx - hx + (i + 0.5) * (w / 14), cy, front]);
      // red/white scalloped valance along the top (visual only, flat)
      for (let i = 0; i < 14; i++) k.box(i % 2 ? C.white : C.red, w / 14, 0.1, DECAL * 2, [cx - hx + (i + 0.5) * (w / 14), cy + hy - 0.06, front + DECAL]);
      if (hasCells) break; // layout v2: the 36 background cells fill the wall (src/view/background-cells.ts)
      // bullseye sign: a 的 without text
      const sx = 0.55;
      const sy = 2.0;
      for (const [r, c] of [[0.15, C.black], [0.13, C.white], [0.1, C.red], [0.065, C.white], [0.035, C.red]] as [number, number][]) {
        k.cyl(c, r, r, DECAL, [sx, sy, front + DECAL * (2 + (0.15 - r) * 24)], ROT_X, 16);
      }
      break;
    }
    case 'left-wall':
    case 'right-wall': {
      k.box(0x7a4f32, w, h, d, [cx, cy, cz]);
      const sign = s.id === 'left-wall' ? 1 : -1; // inner face direction
      const face = cx + sign * (hx + DECAL / 2);
      for (let i = 0; i < 10; i++) k.box(i % 2 ? 0x8a5c3a : 0x7a4f32, DECAL, 0.22, d - 0.02, [face, 0.1 + i * 0.22, cz]);
      for (let i = 0; i < 12; i++) k.box(i % 2 ? C.white : C.red, DECAL * 2, 0.1, d / 12, [face + sign * DECAL, cy + hy - 0.06, cz - hz + (i + 0.5) * (d / 12)]);
      break;
    }
    case 'ceiling': {
      k.box(0x4e1a1e, w, h, d, [cx, cy, cz]);
      const under = cy - hy - DECAL / 2;
      for (let i = 0; i < 10; i++) k.box(i % 2 ? 0x9d8a66 : 0x5e1d22, w / 10, DECAL, d, [cx - hx + (i + 0.5) * (w / 10), under, cz]);
      break;
    }
    case 'counter': {
      k.box(0x6b4429, w, h, d, [cx, cy, cz]);
      const top = cy + hy + DECAL / 2;
      k.box(C.lightBrown, w, DECAL, d, [cx, top, cz]);
      k.box(C.darkRed, w, DECAL * 2, 0.03, [cx, top + DECAL / 2, cz + hz - 0.03]);
      break;
    }
    default: {
      // shelf boards: honey wood, red felt on the front face, 3 cloth slot pads
      k.box(0xc89a5b, w, h, d, [cx, cy, cz]);
      k.box(C.red, w, h * 0.9, DECAL, [cx, cy, cz + hz + DECAL / 2]);
      k.box(0x8a5a2c, w, h * 0.3, DECAL * 2, [cx, cy - h * 0.35, cz + hz + DECAL]);
    }
  }
}

function paintSlotPads(k: Kit, layout: BoothLayout): void {
  for (const s of layout.slots) {
    k.box(0x7b2d34, 0.3, DECAL, 0.22, [s.spawnBase.x, s.spawnBase.y + DECAL / 2, s.spawnBase.z]);
    k.box(0xe4c27a, 0.3, DECAL * 1.5, 0.014, [s.spawnBase.x, s.spawnBase.y + DECAL * 0.75, s.spawnBase.z + 0.11]);
  }
}

/** Wall-mounted flat half lanterns (<= 5 cm proud), unlit-looking glow. */
function buildLanterns(layout: BoothLayout): THREE.BufferGeometry {
  const k = new Kit();
  const wallL = -1.05;
  const wallR = 1.05;
  const back = -2.45;
  const lantern = (at: V3, axis: 'x' | 'z', sign: 1 | -1) => {
    const rot: V3 = [0, 0, 0];
    const flat: V3 = axis === 'x' ? [0.45, 1, 1] : [1, 1, 0.45];
    k.sph(0xff7a3a, 0.11, at, flat, rot, true);
    k.sph(0xffd27a, 0.075, [at[0] + (axis === 'x' ? sign * 0.012 : 0), at[1], at[2] + (axis === 'z' ? 0.012 : 0)], flat, rot, true);
    k.box(C.black, axis === 'x' ? 0.05 : 0.1, 0.012, axis === 'z' ? 0.05 : 0.1, [at[0], at[1] + 0.11, at[2]]);
    k.box(C.black, axis === 'x' ? 0.05 : 0.1, 0.012, axis === 'z' ? 0.05 : 0.1, [at[0], at[1] - 0.11, at[2]]);
  };
  if (layout.slotModel === 'v2-36') {
    // Wide stall: side-wall lanterns at the real walls, back lanterns spread above the cell band (cells end at y 1.88).
    const lw = layout.surfaces.find((s) => s.id === 'left-wall');
    const rw = layout.surfaces.find((s) => s.id === 'right-wall');
    const wl = lw ? lw.box.center.x + lw.box.halfExtents.x : wallL;
    const wr = rw ? rw.box.center.x - rw.box.halfExtents.x : wallR;
    lantern([wl + 0.05, 1.95, -0.9], 'x', 1);
    lantern([wl + 0.05, 1.95, -1.7], 'x', 1);
    lantern([wr - 0.05, 1.95, -1.25], 'x', -1);
    const span = wr - wl - 0.6;
    for (let i = 0; i < 5; i++) lantern([wl + 0.3 + (span * (i + 0.5)) / 5, 2.06, back + 0.05], 'z', 1);
  } else {
    lantern([wallL + 0.05, 1.95, -0.9], 'x', 1);
    lantern([wallL + 0.05, 1.95, -1.7], 'x', 1);
    lantern([wallR - 0.05, 1.95, -1.25], 'x', -1);
    lantern([-0.5, 1.98, back + 0.05], 'z', 1);
  }
  return mergeParts(k.parts);
}

// -------------------------------------------------------------------- devices

function digit2(k: Kit, cx: number, cy: number, hgt: number, color: number, z: number): void {
  const t = hgt * 0.16;
  const w = hgt * 0.55;
  const hh = hgt / 2;
  k.box(color, w, t, DECAL, [cx, cy + hh - t / 2, z]);
  k.box(color, t, hh - t, DECAL, [cx + w / 2 - t / 2, cy + hh / 2, z]);
  k.box(color, w, t, DECAL, [cx, cy, z]);
  k.box(color, t, hh - t, DECAL, [cx - w / 2 + t / 2, cy - hh / 2, z]);
  k.box(color, w, t, DECAL, [cx, cy - hh + t / 2, z]);
}

function cross(k: Kit, cx: number, cy: number, len: number, thick: number, color: number, z: number, angle: number): void {
  k.box(color, len, thick, DECAL, [cx, cy, z], [0, 0, angle]);
  k.box(color, len, thick, DECAL, [cx, cy, z], [0, 0, angle + PI / 2]);
}

/** Plate artwork in local space: plate centred at origin, face toward +z, w x h x depth. */
function devicePlate(d: DeviceGeometry, w: number, h: number, depth: number): Kit {
  const k = new Kit();
  const z = depth / 2 + DECAL / 2;
  const base = (color: number) => k.box(color, w, h, depth, [0, 0, 0]);
  switch (d.kind) {
    case 'split': {
      base(0x2aa198);
      k.box(C.white, w * 0.1, h * 0.32, DECAL, [0, -h * 0.22, z]);
      k.box(C.white, w * 0.1, h * 0.36, DECAL, [-w * 0.17, h * 0.1, z], [0, 0, 0.55]);
      k.box(C.white, w * 0.1, h * 0.36, DECAL, [w * 0.17, h * 0.1, z], [0, 0, -0.55]);
      k.tri(C.white, w * 0.2, h * 0.16, DECAL, [-w * 0.27, h * 0.3, z], [0, 0, 0.55]);
      k.tri(C.white, w * 0.2, h * 0.16, DECAL, [w * 0.27, h * 0.3, z], [0, 0, -0.55]);
      break;
    }
    case 'power': {
      base(C.orange);
      cross(k, -w * 0.22, 0, h * 0.34, h * 0.09, C.darkRed, z, PI / 4);
      digit2(k, w * 0.2, 0, h * 0.5, C.white, z);
      k.box(C.yellow, w, h * 0.06, DECAL * 2, [0, h * 0.44, z]);
      k.box(C.yellow, w, h * 0.06, DECAL * 2, [0, -h * 0.44, z]);
      break;
    }
    case 'penalty': {
      base(0x3a2a45);
      cross(k, 0, -h * 0.05, h * 0.5, h * 0.12, C.red, z, PI / 4);
      k.tor(C.white, w * 0.1, Math.min(w * 0.02, 0.0032), [0, h * 0.36, z]); // tube capped so the mark stays <= 5 mm proud on wide plates
      break;
    }
    case 'ammo': {
      base(0x3fae5a);
      cross(k, -w * 0.25, 0, h * 0.3, h * 0.09, C.white, z, 0);
      digit2(k, w * 0.2, 0, h * 0.46, C.white, z);
      for (let i = 0; i < 2; i++) k.cyl(C.tan, w * 0.06, w * 0.06, DECAL, [-w * 0.28 + i * w * 0.14, -h * 0.34, z], ROT_X, 8);
      break;
    }
    case 'bulletType': {
      base(0x3b6fd0);
      const dots = [0xe6bd82, 0x4a4f58, 0xff5a7a];
      dots.forEach((c, i) => k.cyl(c, w * 0.12, w * 0.12, DECAL * 2, [0, (1 - i) * h * 0.28, z], ROT_X, 10));
      break;
    }
    case 'transform': {
      break;
    }
  }
  return k;
}

function bellGeometry(d: DeviceGeometry): THREE.BufferGeometry {
  const k = new Kit();
  const [cx, cy, cz] = pos(d.box);
  const s = d.box.halfExtents.x; // 0.06
  k.cyl(C.gold, s * 0.35, s * 0.9, s * 1.3, [cx, cy + s * 0.05, cz], undefined, 10);
  k.tor(0xf6d36a, s * 0.9, s * 0.1, [cx, cy - s * 0.58, cz], [PI / 2, 0, 0]);
  k.sph(C.gold, s * 0.3, [cx, cy + s * 0.75, cz]);
  k.sph(0x7a4f32, s * 0.16, [cx, cy - s * 0.78, cz]);
  k.tor(C.hotPink, s * 0.48, s * 0.07, [cx, cy + s * 0.25, cz], [PI / 2, 0, 0]);
  return mergeParts(k.parts);
}

function buildDevice(d: DeviceGeometry, mat: THREE.Material): THREE.Mesh {
  if (d.kind === 'transform') {
    const m = new THREE.Mesh(bellGeometry(d), mat);
    m.name = `device:${d.deviceId}`;
    return m;
  }
  const n = d.faceNormal;
  const he = d.box.halfExtents;
  // local frame: +z is the face normal, x/y span the plate
  let w: number;
  let h: number;
  let depth: number;
  if (Math.abs(n.z) > 0.5) {
    w = he.x * 2; h = he.y * 2; depth = he.z * 2;
  } else if (Math.abs(n.x) > 0.5) {
    w = he.z * 2; h = he.y * 2; depth = he.x * 2;
  } else {
    w = he.x * 2; h = he.z * 2; depth = he.y * 2;
  }
  const kit = devicePlate(d, w, h, depth);
  const geo = mergeParts(kit.parts);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(n.x, n.y, n.z).normalize());
  geo.applyQuaternion(q);
  geo.translate(d.box.center.x, d.box.center.y, d.box.center.z);
  const m = new THREE.Mesh(geo, mat);
  m.name = `device:${d.deviceId}`;
  return m;
}

// -------------------------------------------------------------- hidden targets

function buildHidden(t: HiddenTargetGeometry, mat: THREE.Material): THREE.Mesh {
  const k = new Kit();
  const [cx, cy, cz] = pos(t.box);
  const hx = t.box.halfExtents.x;
  const hy = t.box.halfExtents.y;
  if (t.targetId === 'hidden-daruma') {
    k.sph(C.red, hx * 0.98, [cx, cy - hy * 0.06, cz], [1, (hy * 0.94) / (hx * 0.98), 1]);
    k.sph(C.cream, hx * 0.62, [cx, cy + hy * 0.22, cz + hx * 0.38], [1, 0.9, 0.55]);
    k.sph(C.black, hx * 0.1, [cx - hx * 0.25, cy + hy * 0.28, cz + hx * 0.8]);
    k.sph(C.black, hx * 0.1, [cx + hx * 0.25, cy + hy * 0.28, cz + hx * 0.8]);
    k.box(C.black, hx * 0.5, hy * 0.05, hx * 0.1, [cx - hx * 0.25, cy + hy * 0.5, cz + hx * 0.78], [0, 0, 0.3]);
    k.box(C.black, hx * 0.5, hy * 0.05, hx * 0.1, [cx + hx * 0.25, cy + hy * 0.5, cz + hx * 0.78], [0, 0, -0.3]);
    k.box(C.gold, hx * 1.2, hy * 0.1, hx * 0.2, [cx, cy - hy * 0.45, cz + hx * 0.8]);
  } else {
    // lucky cat: sits facing +z, one paw raised
    const hz = t.box.halfExtents.z;
    k.sph(C.white, hx * 0.92, [cx, cy - hy * 0.1, cz - hz * 0.1], [1, 0.95, 1.1]);
    k.sph(C.white, hx * 0.8, [cx, cy + hy * 0.33, cz + hz * 0.05], [1, 0.82, 0.9]);
    k.cone(C.white, hx * 0.3, hy * 0.35, [cx - hx * 0.55, cy + hy * 0.8, cz + hz * 0.05], undefined, 4);
    k.cone(C.white, hx * 0.3, hy * 0.35, [cx + hx * 0.55, cy + hy * 0.8, cz + hz * 0.05], undefined, 4);
    k.sph(C.white, hx * 0.22, [cx + hx * 0.7, cy + hy * 0.5, cz + hz * 0.45], [1, 1.6, 1]);
    k.sph(C.red, hx * 0.8, [cx, cy + hy * 0.0, cz + hz * 0.45], [1, 0.22, 0.5]);
    k.sph(C.gold, hx * 0.2, [cx, cy - hy * 0.1, cz + hz * 0.75]);
    k.sph(C.black, hx * 0.1, [cx - hx * 0.25, cy + hy * 0.45, cz + hz * 0.7]);
    k.sph(C.black, hx * 0.1, [cx + hx * 0.25, cy + hy * 0.45, cz + hz * 0.7]);
    k.sph(C.hotPink, hx * 0.07, [cx, cy + hy * 0.3, cz + hz * 0.82]);
  }
  const m = new THREE.Mesh(mergeParts(k.parts), mat);
  m.name = `hidden:${t.targetId}`;
  return m;
}

// ----------------------------------------------------------------------- main

/**
 * @param pickInflate collision proxies are grown by this much (the cork radius) so a
 *   ray along the cork centre meets them exactly where the swept sphere would.
 */
export function buildBooth(layout: BoothLayout, pickInflate = 0): BoothBuild {
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const proxyMat = new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'booth';

  // static, merged
  const sk = new Kit();
  const hasCells = (layout.backgroundCells?.length ?? 0) > 0;
  for (const s of layout.surfaces) paintSurface(sk, s, hasCells);
  paintSlotPads(sk, layout);
  // bell cord (hair thin, runs to the ceiling)
  const bell = layout.devices.find((d) => d.kind === 'transform');
  if (bell) {
    const top = bell.box.center.y + bell.box.halfExtents.y;
    const ceil = layout.surfaces.find((s) => s.id === 'ceiling');
    const ceilY = ceil ? ceil.box.center.y - ceil.box.halfExtents.y : top + 0.16;
    sk.cyl(C.hotPink, 0.004, 0.004, ceilY - top, [bell.box.center.x, (top + ceilY) / 2, bell.box.center.z], undefined, 4);
  }
  const staticMesh = new THREE.Mesh(mergeParts(sk.parts), lit);
  staticMesh.name = 'booth:static';
  group.add(staticMesh);

  const lanterns = new THREE.Mesh(buildLanterns(layout), glow);
  lanterns.name = 'booth:lanterns';
  group.add(lanterns);

  const devices = new Map<string, THREE.Object3D>();
  for (const d of layout.devices) {
    const m = buildDevice(d, lit);
    devices.set(d.deviceId, m);
    group.add(m);
  }
  const hidden = new Map<string, THREE.Object3D>();
  for (const t of layout.hiddenTargets) {
    const m = buildHidden(t, lit);
    hidden.set(t.targetId, m);
    group.add(m);
  }
  const keeper = buildShopkeeper(layout.shopkeeper, lit);
  group.add(keeper.group);

  const proxies = new THREE.Group();
  proxies.name = 'collision-proxies';
  const addProxy = (id: string, b: Box3) => {
    const [sx, sy, sz] = size(b);
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx + 2 * pickInflate, sy + 2 * pickInflate, sz + 2 * pickInflate), proxyMat);
    m.userData = { size: [sx, sy, sz] };
    m.position.set(...pos(b));
    m.name = `proxy:${id}`;
    m.updateMatrixWorld(true);
    proxies.add(m);
  };
  for (const s of layout.surfaces) addProxy(s.id, s.box);
  for (const d of layout.devices) addProxy(d.deviceId, d.box);
  for (const p of layout.shopkeeper) addProxy(`shopkeeper-${p.part}`, p.box);
  for (const t of layout.hiddenTargets) addProxy(t.targetId, t.box);
  for (const c of layout.backgroundCells ?? []) addProxy(c.cellId, c.box);

  // warm dusk lighting
  const hemi = new THREE.HemisphereLight(0xffe2b8, 0x5a3a30, 1.6);
  const key = new THREE.DirectionalLight(0xffc98a, 2.0);
  key.position.set(0.7, 1.6, 1.0);
  key.target.position.set(0, 1.1, -1.9);
  const glowLight = new THREE.PointLight(0xff9a50, 5, 4.5, 1.6);
  glowLight.position.set(0, 2.0, -1.3);
  group.add(key.target);

  return {
    group,
    proxies,
    devices,
    hidden,
    shopkeeper: keeper.parts,
    lights: [hemi, key, glowLight],
    setPickInflate(inflate: number) {
      for (const child of proxies.children) {
        const m = child as THREE.Mesh;
        const size = m.userData.size as V3 | undefined;
        if (!size) continue;
        m.geometry.dispose();
        m.geometry = new THREE.BoxGeometry(size[0] + 2 * inflate, size[1] + 2 * inflate, size[2] + 2 * inflate);
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      proxies.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      lit.dispose();
      glow.dispose();
      proxyMat.dispose();
    },
  };
}

