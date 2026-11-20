/**
 * Shopkeeper figure (Task 11 base; Task 12 adds reactions).
 *
 * A friendly low-poly stall owner. Every part is built in WORLD coordinates
 * and stays inside the matching layout box (feet / body / hat / fan), so what
 * the player sees is what the cork can hit. One mesh per layout part so Task
 * 12 can react per part.
 */
import * as THREE from 'three';
import type { ReflectorGeometry, ShopkeeperPart, ShopkeeperPartGeometry } from '../contracts';
import { Kit, ROT_X, ROT_Z, mergeParts } from './assets/kit';
import { C } from './assets/prize-recipes';

const SKIN = 0xf2c9a0;
const INDIGO = 0x27406c;

type Builder = (k: Kit, g: ShopkeeperPartGeometry, head?: Kit, eyes?: Kit) => void;

const BUILDERS: Record<ShopkeeperPart, Builder> = {
  feet: (k, g) => {
    const { center: c } = g.box;
    for (const s of [-1, 1]) {
      k.box(C.lightBrown, 0.1, 0.05, 0.17, [c.x + s * 0.065, c.y - 0.03, c.z + 0.005]); // geta
      k.box(C.cream, 0.09, 0.05, 0.12, [c.x + s * 0.065, c.y + 0.02, c.z - 0.01]); // tabi
      k.box(C.red, 0.1, 0.01, 0.015, [c.x + s * 0.065, c.y + 0.047, c.z + 0.045]); // strap
    }
  },
  body: (k, g) => {
    const { center: c, halfExtents: h } = g.box;
    const base = c.y - h.y; // 0.12
    for (const s of [-1, 1]) k.cyl(INDIGO, 0.05, 0.045, 0.62, [c.x + s * 0.065, base + 0.34, c.z], undefined, 6); // trousers
    k.box(INDIGO, 0.25, 0.56, 0.19, [c.x, base + 0.9, c.z]); // happi coat
    k.box(C.white, 0.035, 0.56, 0.195, [c.x - 0.06, base + 0.9, c.z]); // coat trim
    k.box(C.white, 0.035, 0.56, 0.195, [c.x + 0.06, base + 0.9, c.z]);
    k.box(C.red, 0.255, 0.05, 0.195, [c.x, base + 0.66, c.z]); // belt
    k.cyl(C.white, 0.05, 0.05, 0.02, [c.x, base + 1.0, c.z + 0.088], ROT_X, 8); // crest on the chest
    k.cyl(C.red, 0.03, 0.03, 0.022, [c.x, base + 1.0, c.z + 0.088], ROT_X, 8);
    for (const s of [-1, 1]) {
      k.box(INDIGO, 0.05, 0.3, 0.08, [c.x + s * 0.1, base + 0.98, c.z], [-0.25, 0, 0]); // sleeves
      k.sph(SKIN, 0.03, [c.x + s * 0.098, base + 0.8, c.z + 0.04]);
    }
    k.sph(SKIN, 0.045, [c.x, base + 1.25, c.z], [1, 0.8, 1]); // neck
    k.sph(SKIN, 0.098, [c.x, base + 1.38, c.z], undefined, undefined, true); // head
    k.sph(C.black, 0.012, [c.x - 0.04, base + 1.39, c.z + 0.085]);
    k.sph(C.black, 0.012, [c.x + 0.04, base + 1.39, c.z + 0.085]);
    k.sph(C.hotPink, 0.018, [c.x - 0.065, base + 1.35, c.z + 0.075], [1, 0.7, 0.4]);
    k.sph(C.hotPink, 0.018, [c.x + 0.065, base + 1.35, c.z + 0.075], [1, 0.7, 0.4]);
    k.tor(C.darkRed, 0.03, 0.006, [c.x, base + 1.35, c.z + 0.088], [0, 0, Math.PI * 1.1], Math.PI * 0.8);
  },
  hat: (k, g) => {
    const { center: c, halfExtents: h } = g.box;
    const base = c.y - h.y; // 1.61
    k.cyl(C.tan, 0.115, 0.15, 0.03, [c.x, base + 0.015, c.z], undefined, 12); // brim
    k.cyl(C.tan, 0.075, 0.095, 0.075, [c.x, base + 0.065, c.z], undefined, 12); // crown
    k.cyl(C.red, 0.097, 0.097, 0.02, [c.x, base + 0.045, c.z], undefined, 12); // band
    k.sph(C.darkRed, 0.012, [c.x, base + 0.105, c.z]);
  },
  fan: (k, g) => {
    // The disc faces along the thin axis of the layout box (x or z).
    const { center: c, halfExtents: h } = g.box;
    const facesZ = h.z <= h.x;
    const discRot = facesZ ? ROT_X : ROT_Z;
    k.cyl(C.red, 0.07, 0.07, 0.014, [c.x, c.y + 0.02, c.z], discRot, 12);
    k.cyl(C.white, 0.045, 0.045, 0.017, [c.x, c.y + 0.02, c.z], discRot, 12);
    k.tor(C.gold, 0.07, 0.006, [c.x, c.y + 0.02, c.z], facesZ ? [0, 0, 0] : [0, Math.PI / 2, 0]);
    k.box(C.lightBrown, facesZ ? 0.022 : 0.014, 0.06, facesZ ? 0.014 : 0.022, [c.x, c.y - 0.055, c.z]);
  },
};

export interface ShopkeeperBuild {
  readonly group: THREE.Group;
  readonly parts: ReadonlyMap<ShopkeeperPart, THREE.Mesh>;
}

export function buildShopkeeper(parts: readonly ShopkeeperPartGeometry[], material: THREE.Material): ShopkeeperBuild {
  const group = new THREE.Group();
  group.name = 'shopkeeper';
  const map = new Map<ShopkeeperPart, THREE.Mesh>();
  for (const g of parts) {
    const k = new Kit();
    BUILDERS[g.part](k, g);
    const mesh = new THREE.Mesh(mergeParts(k.parts), material);
    mesh.name = `shopkeeper:${g.part}`;
    group.add(mesh);
    map.set(g.part, mesh);
  }
  return { group, parts: map };
}

// ------------------------------------------------------------ layout v3 (r007)

const HAPPI = 0x1f3358; // indigo happi coat
const APRON = 0xefe4cc; // unbleached apron
const HAIR = 0x2a211c;
const FAN_PAPER = 0xf3ead6;
const FAN_ARROW = 0xe5532d; // vermillion arrow feathers
const TRAY_WOOD = 0x5a3a22;
const BRASS = 0xc9a14a;

/**
 * r007 humanoid shopkeeper. Each mesh stays inside its hit volume (feet / body / hat), so
 * the cork hits what the player sees: legs, torso, raised arm and head in 'body', the small
 * indigo cap with a red band in 'hat'. The fan in the right hand and the tray on its stand are
 * the oriented reflector panels of the layout, drawn in the panel's own frame (front = +z).
 */
const V3_BUILDERS: Record<'feet' | 'body' | 'hat', Builder> = {
  feet: (k, g) => {
    const { center: c } = g.box;
    for (const s of [-1, 1]) {
      k.box(C.lightBrown, 0.1, 0.035, 0.18, [c.x + s * 0.065, c.y - 0.04, c.z + 0.01]); // geta
      k.box(0x3a2a20, 0.02, 0.025, 0.16, [c.x + s * 0.065, c.y - 0.065, c.z + 0.01]); // teeth
      k.sph(C.cream, 0.048, [c.x + s * 0.065, c.y + 0.0, c.z + 0.02], [0.95, 0.7, 1.6]); // tabi
      k.box(C.red, 0.1, 0.012, 0.016, [c.x + s * 0.065, c.y + 0.03, c.z + 0.06]); // strap
    }
  },
  body: (k, g, head, eyes) => {
    const { center: c, halfExtents: h } = g.box;
    const y0 = c.y - h.y; // 0.12
    const front = c.z + h.z; // the face toward the player
    // legs in trousers, slightly apart, weight on both feet
    for (const s of [-1, 1]) {
      k.cyl(HAPPI, 0.048, 0.052, 0.58, [c.x + s * 0.06, y0 + 0.3, c.z], undefined, 8);
      k.cyl(C.cream, 0.04, 0.04, 0.06, [c.x + s * 0.06, y0 + 0.02, c.z + 0.01], undefined, 8); // ankle
    }
    // torso: happi coat with white collar trims, red belt, unbleached apron
    k.box(HAPPI, 0.25, 0.6, 0.15, [c.x, y0 + 0.88, c.z]);
    k.box(C.white, 0.03, 0.42, 0.152, [c.x - 0.045, y0 + 1.0, c.z], [0, 0, -0.18]);
    k.box(C.white, 0.03, 0.42, 0.152, [c.x + 0.045, y0 + 1.0, c.z], [0, 0, 0.18]);
    k.box(C.red, 0.254, 0.05, 0.155, [c.x, y0 + 0.64, c.z]);
    k.box(APRON, 0.21, 0.46, 0.012, [c.x, y0 + 0.5, front - 0.012]); // apron
    k.box(APRON, 0.012, 0.18, 0.012, [c.x - 0.09, y0 + 0.75, front - 0.016], [0, 0, 0.5]); // apron strings
    k.box(APRON, 0.012, 0.18, 0.012, [c.x + 0.09, y0 + 0.75, front - 0.016], [0, 0, -0.5]);
    k.cyl(C.white, 0.035, 0.035, 0.01, [c.x, y0 + 0.98, front - 0.01], ROT_X, 10); // crest
    k.cyl(C.red, 0.022, 0.022, 0.012, [c.x, y0 + 0.98, front - 0.008], ROT_X, 10);
    // right upper arm down to the elbow (the forearm to the fan is its own hit box); left arm raised to guide
    k.box(HAPPI, 0.058, 0.17, 0.07, [c.x - 0.13, y0 + 1.08, c.z + 0.02], [0.1, 0, 0.08]); // upper sleeve
    k.box(HAPPI, 0.06, 0.2, 0.07, [c.x + 0.125, y0 + 1.12, c.z], [0, 0, -0.5]); // upper arm out
    k.box(HAPPI, 0.055, 0.17, 0.065, [c.x + 0.125, y0 + 1.28, c.z + 0.02], [0.2, 0, 0.25]); // forearm up
    k.sph(0xf0c49c, 0.028, [c.x + 0.105, y0 + 1.37, c.z + 0.035], [0.9, 1.15, 0.8]); // open hand
    for (let i = 0; i < 4; i++) k.box(0xf0c49c, 0.008, 0.03, 0.012, [c.x + 0.09 + i * 0.01, y0 + 1.405, c.z + 0.035]); // fingers
    // neck and head: round cheeks, nose bridge, upper eyelids, mouth, ears, hair
    k.cyl(0xe8b98e, 0.035, 0.04, 0.06, [c.x, y0 + 1.2, c.z], undefined, 8); // the neck stays with the body
    const hk = head ?? k;
    const ek = eyes ?? hk;
    const hy = y0 + 1.33;
    hk.sph(0xf2c9a0, 0.092, [c.x, hy, c.z], [1, 1.05, 0.95], undefined, true);
    hk.sph(0xf2c9a0, 0.04, [c.x - 0.05, hy - 0.035, c.z + 0.055], [1, 0.85, 0.7]); // cheeks
    hk.sph(0xf2c9a0, 0.04, [c.x + 0.05, hy - 0.035, c.z + 0.055], [1, 0.85, 0.7]);
    hk.sph(0xf7a3a0, 0.016, [c.x - 0.055, hy - 0.035, c.z + 0.083], [1, 0.6, 0.3]);
    hk.sph(0xf7a3a0, 0.016, [c.x + 0.055, hy - 0.035, c.z + 0.083], [1, 0.6, 0.3]);
    hk.box(0xe9b88e, 0.016, 0.045, 0.02, [c.x, hy - 0.005, c.z + 0.09]); // nose bridge
    hk.sph(0xe9b08a, 0.014, [c.x, hy - 0.03, c.z + 0.097]); // nose tip
    for (const s of [-1, 1]) {
      ek.sph(C.black, 0.0095, [c.x + s * 0.034, hy + 0.012, c.z + 0.086]); // eyes
      hk.box(HAIR, 0.026, 0.006, 0.008, [c.x + s * 0.034, hy + 0.024, c.z + 0.088], [0, 0, s * -0.12]); // upper eyelids
      hk.box(HAIR, 0.03, 0.008, 0.008, [c.x + s * 0.036, hy + 0.045, c.z + 0.084], [0, 0, s * -0.2]); // brows
      hk.sph(0xeab48a, 0.022, [c.x + s * 0.09, hy, c.z], [0.5, 1, 0.8]); // ears
    }
    hk.tor(0x9a3a2a, 0.022, 0.0045, [c.x, hy - 0.062, c.z + 0.081], [0, 0, Math.PI * 1.12], Math.PI * 0.76); // smile
    hk.sph(HAIR, 0.094, [c.x, hy + 0.025, c.z - 0.012], [1.02, 0.8, 0.95]); // hair under the cap
  },
  hat: (k, g) => {
    const { center: c, halfExtents: h } = g.box;
    const base = c.y - h.y; // 1.61
    k.cyl(HAPPI, 0.11, 0.13, 0.022, [c.x, base + 0.012, c.z + 0.01], undefined, 14); // brim
    k.cyl(HAPPI, 0.07, 0.088, 0.075, [c.x, base + 0.06, c.z], undefined, 14); // crown
    k.cyl(C.red, 0.09, 0.09, 0.022, [c.x, base + 0.04, c.z], undefined, 14); // red band
    k.box(C.red, 0.03, 0.022, 0.03, [c.x + 0.075, base + 0.06, c.z + 0.05], [0.5, 0, 0.4]); // the band's corner (it flips on a hit)
    k.sph(C.gold, 0.01, [c.x, base + 0.1, c.z]);
  },
};

function buildFanPanel(k: Kit, r: ReflectorGeometry): void {
  const R = Math.min(r.halfExtents.x, r.halfExtents.y);
  const d = r.halfExtents.z * 2;
  k.cyl(FAN_PAPER, R, R, d, [0, 0, 0], ROT_X, 18); // round fan, front = +z
  k.tor(C.lightBrown, R, 0.005, [0, 0, 0]);
  // vermillion arrow feathers on the front, and a short line toward the shelf (−x of the panel)
  for (const s of [-1, 1]) k.box(FAN_ARROW, 0.016, 0.07, 0.003, [s * 0.02, 0.01, d / 2 + 0.002], [0, 0, s * 0.45]);
  k.box(FAN_ARROW, 0.01, 0.1, 0.003, [0, -0.01, d / 2 + 0.002]);
  k.box(0x6b3f22, 0.06, 0.006, 0.003, [-R * 0.55, -R * 0.55, d / 2 + 0.002], [0, 0, 0.6]);
  for (let i = -2; i <= 2; i++) k.box(C.lightBrown, 0.004, R * 1.8, 0.003, [i * 0.03, 0, -d / 2 - 0.001], [0, 0, i * 0.18]); // ribs on the back
  k.box(C.lightBrown, 0.018, 0.05, 0.014, [0, -R - 0.02, 0]); // handle stub, held by the hand
}

function buildTrayPanel(k: Kit, r: ReflectorGeometry): void {
  const { x: hx, y: hy, z: hz } = r.halfExtents;
  k.box(TRAY_WOOD, hx * 2, hy * 2, hz * 2, [0, 0, 0]);
  const f = 0.012;
  k.box(BRASS, hx * 2, f, hz * 2 + 0.004, [0, hy - f / 2, 0]);
  k.box(BRASS, hx * 2, f, hz * 2 + 0.004, [0, -hy + f / 2, 0]);
  k.box(BRASS, f, hy * 2, hz * 2 + 0.004, [hx - f / 2, 0, 0]);
  k.box(BRASS, f, hy * 2, hz * 2 + 0.004, [-hx + f / 2, 0, 0]);
  k.box(BRASS, 0.07, 0.006, 0.003, [-hx * 0.45, -hy * 0.45, hz + 0.002], [0, 0, 0.5]); // short line toward the shelf
}

export interface ShopkeeperV3Build extends ShopkeeperBuild {
  readonly tray: THREE.Mesh | null;
}

export interface ShopkeeperV3Build extends ShopkeeperBuild {
  readonly tray: THREE.Mesh | null;
  /** View only: a nod, blinks and the wrist after a fan hit. Never moves a hit volume. */
  idle(timeSec: number): void;
  /** The fan was hit: the wrist gives a small flick (the fan panel and its collider stay put). */
  flick(timeSec: number): void;
}

/** The right forearm inside its own 'body' hit box, the hand at the fan's handle. */
function buildForearm(k: Kit, g: ShopkeeperPartGeometry): void {
  const { center: c, halfExtents: h } = g.box;
  k.cyl(HAPPI, 0.026, 0.03, h.z * 1.7, [c.x, c.y, c.z - h.z * 0.1], [Math.PI / 2 - 0.25, 0, 0], 8); // sleeve to the wrist
  k.sph(C.cream, 0.022, [c.x - 0.004, c.y - 0.012, c.z + h.z * 0.65], [1, 1.1, 1]); // wrist
  k.sph(0xf0c49c, 0.026, [c.x - 0.008, c.y - 0.03, c.z + h.z * 0.95], [0.9, 1, 1.1]); // hand round the handle
}

export function buildShopkeeperV3(parts: readonly ShopkeeperPartGeometry[], reflectors: readonly ReflectorGeometry[], material: THREE.Material): ShopkeeperV3Build {
  const group = new THREE.Group();
  group.name = 'shopkeeper';
  const map = new Map<ShopkeeperPart, THREE.Mesh>();
  const add = (k: Kit, name: string) => {
    const mesh = new THREE.Mesh(mergeParts(k.parts), material);
    mesh.name = name;
    group.add(mesh);
    return mesh;
  };
  let headMesh: THREE.Mesh | null = null;
  let eyesMesh: THREE.Mesh | null = null;
  let headPivot = new THREE.Vector3();
  let wrist: THREE.Mesh | null = null;
  let wristPivot = new THREE.Vector3();
  for (const g of parts) {
    if (g.part === 'fan') continue;
    if (map.has(g.part)) {
      // a second box of the same part: the right forearm reaching to the fan
      const k = new Kit();
      buildForearm(k, g);
      wrist = add(k, 'shopkeeper:forearm');
      wristPivot = new THREE.Vector3(g.box.center.x, g.box.center.y, g.box.center.z - g.box.halfExtents.z);
      continue;
    }
    const k = new Kit();
    if (g.part === 'body') {
      const hk = new Kit();
      const ek = new Kit();
      V3_BUILDERS.body(k, g, hk, ek);
      map.set('body', add(k, 'shopkeeper:body'));
      headMesh = add(hk, 'shopkeeper:head');
      eyesMesh = add(ek, 'shopkeeper:eyes');
      headPivot = new THREE.Vector3(g.box.center.x, g.box.center.y - g.box.halfExtents.y + 1.24, g.box.center.z);
      continue;
    }
    V3_BUILDERS[g.part](k, g);
    map.set(g.part, add(k, `shopkeeper:${g.part}`));
  }
  let tray: THREE.Mesh | null = null;
  for (const r of reflectors) {
    const k = new Kit();
    if (r.reflectorId === 'fan') buildFanPanel(k, r);
    else buildTrayPanel(k, r);
    const mesh = new THREE.Mesh(mergeParts(k.parts), material);
    mesh.name = r.reflectorId === 'fan' ? 'shopkeeper:fan' : 'stall:tray';
    mesh.position.set(r.center.x, r.center.y, r.center.z);
    mesh.quaternion.set(r.rotation.x, r.rotation.y, r.rotation.z, r.rotation.w);
    group.add(mesh);
    if (r.reflectorId === 'fan') map.set('fan', mesh);
    else tray = mesh;
  }
  let flickAt = -Infinity;
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const axisX = new THREE.Vector3(1, 0, 0);
  const rotateAbout = (m: THREE.Mesh, pivot: THREE.Vector3, angle: number) => {
    q.setFromAxisAngle(axisX, angle);
    m.quaternion.copy(q);
    v.copy(pivot).applyQuaternion(q);
    m.position.set(pivot.x - v.x, pivot.y - v.y, pivot.z - v.z);
  };
  return {
    group,
    parts: map,
    tray,
    flick(t) {
      flickAt = t;
    },
    idle(t) {
      // a short nod every 7 s and a blink every 4.3 s; small enough to stay inside the body box
      const nodPhase = (t % 7) / 7;
      const nod = nodPhase < 0.08 ? Math.sin((nodPhase / 0.08) * Math.PI) * 0.12 : 0;
      if (headMesh) rotateAbout(headMesh, headPivot, nod);
      if (eyesMesh) {
        rotateAbout(eyesMesh, headPivot, nod);
        eyesMesh.scale.set(1, t % 4.3 < 0.12 ? 0.15 : 1, 1);
      }
      if (wrist) {
        const age = t - flickAt;
        rotateAbout(wrist, wristPivot, age >= 0 && age < 0.5 ? Math.sin(age * 25) * 0.18 * (1 - age / 0.5) : 0);
      }
    },
  };
}
