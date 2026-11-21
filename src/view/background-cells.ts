/**
 * The 36 background cells of layout v2 (D37, plan EG07), drawn on the back
 * wall exactly where the thin cell colliders are (layout.backgroundCells).
 *
 *  - unused: a light panel with a "?" mark;
 *  - used:   a darkened panel with a check mark (shape + brightness, never colour alone).
 *
 * The effect behind a cell stays hidden until it was used: this module never
 * receives an effect id it could show for an unused cell (ExpansionViewState
 * gives null until then) and does not draw effect names in 3D at all.
 *
 * Pure three.js (no WebGL): runs in Node. Presentation only.
 */
import * as THREE from 'three';
import type { BackgroundCellGeometry, BackgroundCellId, BoothLayout, ExpansionViewState } from '../contracts';
import { Kit, mergeParts } from './assets/kit';

export type CellVisual = 'unused' | 'used';

const DECAL = 0.002;

const COLORS: Readonly<Record<CellVisual, { panel: number; frame: number; mark: number }>> = {
  unused: { panel: 0xe0cc9f, frame: 0xc2603a, mark: 0x6b3a22 },
  used: { panel: 0x3d322c, frame: 0x6b5a4a, mark: 0xd9e6b4 },
};

type Pt = readonly [number, number];

/** "?" outline in unit coordinates (x right, y up), roughly 0.6 wide and 0.82 tall. */
const QUESTION: readonly Pt[] = [
  [-0.28, 0.28],
  [-0.2, 0.4],
  [0, 0.46],
  [0.2, 0.4],
  [0.28, 0.28],
  [0.2, 0.12],
  [0, 0],
  [0, -0.14],
];
const CHECK: readonly Pt[] = [
  [-0.32, 0.02],
  [-0.1, -0.22],
  [0.34, 0.3],
];

function stroke(k: Kit, color: number, pts: readonly Pt[], scale: number, thick: number, cx: number, cy: number, z: number): void {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const dx = (bx - ax) * scale;
    const dy = (by - ay) * scale;
    const len = Math.hypot(dx, dy) + thick * 0.9; // overlap the joints
    k.box(color, len, thick, DECAL, [cx + ((ax + bx) / 2) * scale, cy + ((ay + by) / 2) * scale, z], [0, 0, Math.atan2(dy, dx)]);
  }
}

/** Layout v3 side-wall cell: the same panel, frame and corner mark, printed on a wall facing ±x. */
function paintSideCell(k: Kit, cell: BackgroundCellGeometry, visual: CellVisual): void {
  const { center: c, halfExtents: h } = cell.box;
  const col = COLORS[visual];
  const sx = cell.faceNormal.x > 0 ? 1 : -1; // the printed face looks toward +sx
  k.box(col.panel, h.x * 2, h.y * 2, h.z * 2, [c.x, c.y, c.z]);
  const face = c.x + sx * (h.x + DECAL / 2);
  const f = 0.011;
  k.box(col.frame, DECAL, f, h.z * 2, [face, c.y + h.y - f / 2, c.z]);
  k.box(col.frame, DECAL, f, h.z * 2, [face, c.y - h.y + f / 2, c.z]);
  k.box(col.frame, DECAL, h.y * 2, f, [face, c.y, c.z - h.z + f / 2]);
  k.box(col.frame, DECAL, h.y * 2, f, [face, c.y, c.z + h.z - f / 2]);
  // the mark sits in the upper corner nearest the player; strokes drawn in the wall plane
  const u = Math.min(h.z, h.y) * 0.42;
  const mz = c.z + h.z - 0.075;
  const my = c.y + h.y - 0.085;
  const x = face + sx * DECAL;
  const pts = visual === 'unused' ? QUESTION : CHECK;
  const thick = visual === 'unused' ? 0.011 : 0.014;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    // face u axis: toward the player is +z on both walls; mirror on the left wall so the glyph reads correctly
    const du = (bx - ax) * u * -sx;
    const dv = (by - ay) * u;
    const len = Math.hypot(du, dv) + thick * 0.9;
    k.box(col.mark, DECAL, thick, len, [x, my + ((ay + by) / 2) * u, mz + ((ax + bx) / 2) * u * -sx], [Math.atan2(dv, du) * -1, 0, 0]);
  }
  if (visual === 'unused') k.box(col.mark, DECAL, 0.013, 0.013, [x, my - 0.34 * u, mz]);
}

function paintCell(k: Kit, cell: BackgroundCellGeometry, visual: CellVisual): void {
  if (cell.face === 'left' || cell.face === 'right') return paintSideCell(k, cell, visual);
  const { center: c, halfExtents: h } = cell.box;
  const col = COLORS[visual];
  // The panel IS the collider box: what is drawn is what a cork can touch.
  k.box(col.panel, h.x * 2, h.y * 2, h.z * 2, [c.x, c.y, c.z]);
  const face = c.z + h.z + DECAL / 2;
  const f = 0.011;
  k.box(col.frame, h.x * 2, f, DECAL, [c.x, c.y + h.y - f / 2, face]);
  k.box(col.frame, h.x * 2, f, DECAL, [c.x, c.y - h.y + f / 2, face]);
  k.box(col.frame, f, h.y * 2, DECAL, [c.x - h.x + f / 2, c.y, face]);
  k.box(col.frame, f, h.y * 2, DECAL, [c.x + h.x - f / 2, c.y, face]);
  const z = face + DECAL;
  // A small mark in the upper corner, so the prize standing in front stays easy to see.
  const u = Math.min(h.x, h.y) * 0.42; // mark scale
  const mx = c.x + h.x - 0.075;
  const my = c.y + h.y - 0.085;
  if (visual === 'unused') {
    stroke(k, col.mark, QUESTION, u, 0.011, mx, my, z);
    k.box(col.mark, 0.013, 0.013, DECAL, [mx, my - 0.34 * u, z]);
  } else {
    stroke(k, col.mark, CHECK, u, 0.014, mx, my, z);
  }
}

export interface BackgroundCellsView {
  readonly group: THREE.Group;
  /** Redraws the cells whose used flag changed. A cell id the layout does not know is ignored. */
  update(cells: ExpansionViewState['cells'] | undefined): void;
  /** What is drawn for each cell right now. */
  states(): ReadonlyMap<string, CellVisual>;
  /** Presentation of confirmed use only. Does not change the panel state or pick boxes. */
  celebrate(ids: readonly BackgroundCellId[], now: number): void;
  animate(now: number, quiet: boolean): void;
  clearCelebration(): void;
  /** Number of cell panels drawn (36 in layout v2). */
  readonly cellCount: number;
  dispose(): void;
}

export function createBackgroundCells(layout: BoothLayout, festival = false): BackgroundCellsView {
  const cells = layout.backgroundCells ?? [];
  const group = new THREE.Group();
  group.name = 'background-cells';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const state = new Map<string, CellVisual>(cells.map((c) => [c.cellId as string, 'unused']));
  let mesh: THREE.Mesh | null = null;
  let signature = '';
  const flips = new Map<BackgroundCellId, { pivot: THREE.Group; born: number }>();
  const rim = festival ? new THREE.MeshBasicMaterial({
    color: 0xffb356, transparent: true, opacity: .64, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }) : null;
  const clearFlip = (id: BackgroundCellId) => {
    const flip = flips.get(id);
    if (!flip) return;
    flip.pivot.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
    group.remove(flip.pivot);
    flips.delete(id);
  };
  const clearCelebration = () => {
    for (const id of flips.keys()) clearFlip(id);
  };

  const rebuild = (): void => {
    const k = new Kit();
    for (const c of cells) paintCell(k, c, state.get(c.cellId as string) ?? 'unused');
    const next = new THREE.Mesh(mergeParts(k.parts), material);
    next.name = 'cells:panels';
    if (mesh) {
      group.remove(mesh);
      mesh.geometry.dispose();
    }
    mesh = next;
    group.add(next);
  };
  rebuild();

  return {
    group,
    cellCount: cells.length,
    states: () => state,
    celebrate(ids, now) {
      if (!rim) return;
      for (const id of ids) {
        if (flips.size >= 4 || flips.has(id)) continue;
        const cell = cells.find(c => c.cellId === id);
        if (!cell) continue;
        const { center: c, halfExtents: h } = cell.box;
        const sideWall = Math.abs(cell.faceNormal.x) > .5;
        const front = new Kit();
        paintCell(front, cell, 'unused');
        const plaque = new THREE.Mesh(mergeParts(front.parts), material);
        plaque.geometry.translate(-c.x, -c.y, -c.z);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry((sideWall ? h.z : h.x) * 2.07, h.y * 2.04), rim);
        if (sideWall) glow.rotateY(Math.PI / 2);
        glow.position.set(cell.faceNormal.x * (h.x + DECAL * 2.2), 0, cell.faceNormal.z * (h.z + DECAL * 2.2));
        const pivot = new THREE.Group();
        pivot.name = `festival-cell:${id}`;
        pivot.position.set(c.x + cell.faceNormal.x * .013, c.y, c.z + cell.faceNormal.z * .013);
        pivot.add(plaque, glow);
        group.add(pivot);
        flips.set(id, { pivot, born: now + flips.size * .045 });
      }
    },
    animate(now, quiet) {
      if (quiet) {
        clearCelebration();
        return;
      }
      for (const [id, flip] of flips) {
        const age = (now - flip.born) / .34;
        if (age >= 1) clearFlip(id);
        else {
          const turn = Math.max(0, age);
          flip.pivot.rotation.y = (1 - (1 - turn) ** 2) * (Math.PI / 2);
          flip.pivot.scale.setScalar(1 - .2 * turn);
        }
      }
    },
    clearCelebration,
    update(input) {
      if (!input) return;
      let changed = false;
      for (const c of input) {
        const id = c.cellId as string;
        if (!state.has(id)) continue;
        const v: CellVisual = c.used ? 'used' : 'unused';
        if (state.get(id) !== v) {
          state.set(id, v);
          changed = true;
        }
      }
      if (!changed) return;
      const sig = [...state.values()].map((v) => (v === 'used' ? '1' : '0')).join('');
      if (sig === signature) return;
      signature = sig;
      rebuild();
    },
    dispose() {
      clearCelebration();
      mesh?.geometry.dispose();
      rim?.dispose();
      material.dispose();
      group.clear();
    },
  };
}
