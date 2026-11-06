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
import type { BackgroundCellGeometry, BoothLayout, ExpansionViewState } from '../contracts';
import { Kit, mergeParts } from './assets/kit';

export type CellVisual = 'unused' | 'used';

const DECAL = 0.002;

const COLORS: Readonly<Record<CellVisual, { panel: number; frame: number; mark: number }>> = {
  unused: { panel: 0xf1e2bd, frame: 0xc2603a, mark: 0x6b3a22 },
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

function paintCell(k: Kit, cell: BackgroundCellGeometry, visual: CellVisual): void {
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
  const u = Math.min(h.x, h.y) * 1.5; // mark scale
  if (visual === 'unused') {
    stroke(k, col.mark, QUESTION, u, 0.024, c.x, c.y - 0.01, z);
    k.box(col.mark, 0.03, 0.03, DECAL, [c.x, c.y - 0.01 - 0.34 * u, z]);
  } else {
    stroke(k, col.mark, CHECK, u, 0.03, c.x, c.y, z);
  }
}

export interface BackgroundCellsView {
  readonly group: THREE.Group;
  /** Redraws the cells whose used flag changed. A cell id the layout does not know is ignored. */
  update(cells: ExpansionViewState['cells'] | undefined): void;
  /** What is drawn for each cell right now. */
  states(): ReadonlyMap<string, CellVisual>;
  /** Number of cell panels drawn (36 in layout v2). */
  readonly cellCount: number;
  dispose(): void;
}

export function createBackgroundCells(layout: BoothLayout): BackgroundCellsView {
  const cells = layout.backgroundCells ?? [];
  const group = new THREE.Group();
  group.name = 'background-cells';
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const state = new Map<string, CellVisual>(cells.map((c) => [c.cellId as string, 'unused']));
  let mesh: THREE.Mesh | null = null;
  let signature = '';

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
      mesh?.geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
