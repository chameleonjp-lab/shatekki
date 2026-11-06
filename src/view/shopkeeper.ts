/**
 * Shopkeeper figure (Task 11 base; Task 12 adds reactions).
 *
 * A friendly low-poly stall owner. Every part is built in WORLD coordinates
 * and stays inside the matching layout box (feet / body / hat / fan), so what
 * the player sees is what the cork can hit. One mesh per layout part so Task
 * 12 can react per part.
 */
import * as THREE from 'three';
import type { ShopkeeperPart, ShopkeeperPartGeometry } from '../contracts';
import { Kit, ROT_X, ROT_Z, mergeParts } from './assets/kit';
import { C } from './assets/prize-recipes';

const SKIN = 0xf2c9a0;
const INDIGO = 0x27406c;

type Builder = (k: Kit, g: ShopkeeperPartGeometry) => void;

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
