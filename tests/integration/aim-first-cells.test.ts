import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  CELL_IDS_V2,
  aimDirection,
  asPrizeTypeId,
  cellAtFacePoint,
  isBackgroundCellId,
  muzzlePosition,
  neighbourCells,
  type BackgroundCellGeometry,
  type BackgroundCellId,
  type ImpactEvent,
  type Vec3,
} from '../../src/contracts';
import { spawnPrize } from '../../src/core/replenish';
import { createShotWorld } from '../../src/sim/world';
import { aimThrough } from '../helpers/aim-v3';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

const B = getGameplayBundle('expanded-aim-first');
const R6 = getGameplayBundle('expanded-next');
const { layout, catalog, tuning } = B;
const cells = layout.backgroundCells!;
const allIds = cells.map((c) => c.cellId);
const centerOf = (c: BackgroundCellGeometry): Vec3 => {
  const b = c.box;
  const face = c.face ?? 'back';
  // the printed face, not the box centre
  return face === 'back' ? { ...b.center, z: b.center.z + b.halfExtents.z } : face === 'left' ? { ...b.center, x: b.center.x + b.halfExtents.x } : { ...b.center, x: b.center.x - b.halfExtents.x };
};

describe('layout v3: 100 cells', () => {
  it('70 on the back wall and 15 on each side, unique stable ids; the first 36 keep the v2 ids and slots', () => {
    expect(cells).toHaveLength(100);
    expect(new Set(allIds).size).toBe(100);
    expect(allIds.every(isBackgroundCellId)).toBe(true);
    expect(cells.filter((c) => (c.face ?? 'back') === 'back')).toHaveLength(70);
    expect(cells.filter((c) => c.face === 'left')).toHaveLength(15);
    expect(cells.filter((c) => c.face === 'right')).toHaveLength(15);
    expect(allIds.slice(0, 36)).toEqual(CELL_IDS_V2);
    expect(cells.slice(0, 36).every((c) => c.slotId !== undefined)).toBe(true);
    expect(cells.slice(36).every((c) => c.slotId === undefined)).toBe(true);
    // the extra 64 never invent a slot; ids name the wall, band and lane
    expect(allIds).toContain('cell-bk-top-L');
    expect(allIds).toContain('cell-rw-bot-front');
  });

  it('covers each wall without gaps or overlaps: every sampled point belongs to exactly one cell', () => {
    const faces: { face: 'back' | 'left' | 'right'; at: (u: number, v: number) => Vec3; u: [number, number] }[] = [
      { face: 'back', at: (u, v) => ({ x: u, y: v, z: -2.442 }), u: [-3, 3] },
      { face: 'left', at: (u, v) => ({ x: -2.992, y: v, z: u }), u: [-2.45, -0.15] },
      { face: 'right', at: (u, v) => ({ x: 2.992, y: v, z: u }), u: [-2.45, -0.15] },
    ];
    let samples = 0;
    for (const f of faces) {
      for (let i = 0; i <= 120; i++) {
        for (let j = 0; j <= 46; j++) {
          const u = f.u[0] + ((f.u[1] - f.u[0]) * i) / 120;
          const v = (2.3 * j) / 46;
          const p = f.at(u, v);
          const hit = cellAtFacePoint(cells, p);
          // corners of the back wall belong to the back wall
          expect(hit, `${f.face} ${u.toFixed(3)},${v.toFixed(3)}`).not.toBeNull();
          if (f.face !== 'back' && Math.abs(u + 2.45) < 0.011) continue;
          expect(hit!.face ?? 'back').toBe(f.face);
          samples++;
        }
      }
    }
    expect(samples).toBeGreaterThan(15000);
  });

  it('a boundary point goes to the cell on the larger-coordinate side; the outermost edge is closed; a corner goes to the back wall', () => {
    const a = cells.find((c) => c.cellId === 'cell-r2-c06')!;
    const edge = { x: a.box.center.x + a.box.halfExtents.x, y: a.box.center.y, z: -2.442 };
    expect(cellAtFacePoint(cells, edge)!.cellId).toBe('cell-r2-c07');
    expect(cellAtFacePoint(cells, { ...edge, x: edge.x - 1e-4 })!.cellId).toBe('cell-r2-c06');
    expect(cellAtFacePoint(cells, { x: 3, y: 2.3, z: -2.442 })!.cellId).toBe('cell-bk-top-R');
    expect(cellAtFacePoint(cells, { x: -3, y: 0, z: -2.442 })!.cellId).toBe('cell-bk-bot-L');
    expect(cellAtFacePoint(cells, { x: 2.992, y: 1.0, z: -2.442 })!.cellId).toBe('cell-bk-r3-R');
    expect(cellAtFacePoint(cells, { x: 2.992, y: 1.0, z: -0.15 })!.cellId).toBe('cell-rw-r3-front');
    const mid = cells.find((c) => c.cellId === 'cell-lw-r2-mid')!;
    expect(neighbourCells(cells, mid).map((c) => c.cellId).sort()).toEqual(['cell-lw-r1-mid', 'cell-lw-r2-back', 'cell-lw-r2-front', 'cell-lw-r3-mid']);
  });

  it('the r006 stand, muzzle and yaw limit cannot reach the front two lanes of either side wall (reproduced)', () => {
    const old = { ...B, layout: { ...layout, camera: R6.layout.camera } };
    const front = cells.filter((c) => (c.face === 'left' || c.face === 'right') && (c.lane === 2 || c.lane === 3));
    expect(front).toHaveLength(20);
    for (const c of front) {
      const reachable = [-2.35, -1.5, 0, 1.5, 2.35].some((x) => aimThrough(old, x, centerOf(c)) !== null);
      expect(reachable, c.cellId).toBe(false);
    }
  });
});

async function world(withPrizes: boolean) {
  const w = await createShotWorld(layout, catalog, tuning, { transformPolicy: B.behavior!.transformPolicy });
  const prizes = withPrizes ? layout.slots.map((slot, i) => spawnPrize(catalog, asPrizeTypeId('P009'), slot, i + 1, 0)) : [];
  w.syncShelf({ prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 }, 0);
  return w;
}

function fireAt(w: Awaited<ReturnType<typeof world>>, standX: number, aim: { yaw: number; pitch: number }, usable: readonly BackgroundCellId[] = allIds) {
  const request = makeRequest({ origin: muzzlePosition(layout, standX), direction: aimDirection(layout, standX, aim) });
  return runExpanded(w, request, expandedCtx({ usableCells: usable }), { dt: tuning.limits.fixedStepSec });
}

const STANDS = [0, -1.3, 1.3, -2.65, 2.65, -2.0, 2.0, -0.7, 0.7];

/** The centre, then points 20 % in from each corner of the printed face (a device or the shopkeeper may cover the centre). */
function samplePoints(c: BackgroundCellGeometry): Vec3[] {
  const p = centerOf(c);
  const b = c.box;
  const face = c.face ?? 'back';
  const hu = (face === 'back' ? b.halfExtents.x : b.halfExtents.z) * 0.6;
  const hv = b.halfExtents.y * 0.6;
  const at = (du: number, dv: number): Vec3 => (face === 'back' ? { ...p, x: p.x + du, y: p.y + dv } : { ...p, z: p.z + du, y: p.y + dv });
  return [p, at(-hu, -hv), at(hu, -hv), at(-hu, hv), at(hu, hv), at(-hu, 0), at(hu, 0), at(0, -hv), at(0, hv)];
}

describe('layout v3: real shots reach every cell', () => {
  it('each of the 100 cells is hit first by a direct shot from some stand position with an empty shelf', async () => {
    const w = await world(false);
    const missing: string[] = [];
    try {
      for (const c of cells) {
        let ok = false;
        for (const p of samplePoints(c)) {
          for (const x of STANDS) {
            const aim = aimThrough(B, x, p);
            if (!aim) continue;
            const run = fireAt(w, x, aim);
            const first = run.impacts[0]?.target;
            if (first?.kind === 'cell' && first.cellId === c.cellId && first.activated) {
              ok = true;
              break;
            }
          }
          if (ok) break;
        }
        if (!ok) missing.push(c.cellId);
      }
    } finally {
      w.dispose();
    }
    expect(missing).toEqual([]);
  });

  it('with all 36 prizes on the shelf, the back, middle and front lanes of both side walls are hit by direct shots', async () => {
    const w = await world(true);
    const hits: string[] = [];
    try {
      for (const face of ['left', 'right'] as const) {
        for (const lane of [1, 2, 3]) {
          const targets = cells.filter((c) => c.face === face && c.lane === lane);
          let hit: string | null = null;
          for (const c of targets) {
            for (const x of STANDS) {
              const aim = aimThrough(B, x, centerOf(c));
              if (!aim) continue;
              const run = fireAt(w, x, aim);
              const first = run.impacts[0]?.target;
              if (first?.kind === 'cell' && first.cellId === c.cellId) {
                hit = c.cellId;
                break;
              }
            }
            if (hit) break;
          }
          expect(hit, `${face} lane ${lane}`).not.toBeNull();
          hits.push(hit!);
        }
      }
    } finally {
      w.dispose();
    }
    expect(hits).toHaveLength(6);
  });

  it('a used cell reflects and reports activated=false; one contact uses one cell; the impact carries point, normal and material', async () => {
    const w = await world(false);
    try {
      const c = cells.find((x) => x.cellId === 'cell-rw-r2-mid')!;
      const aim = aimThrough(B, 2.65, centerOf(c))!;
      expect(aim).not.toBeNull();
      const fresh = fireAt(w, 2.65, aim);
      const firstCell = fresh.impacts.find((i) => i.target.kind === 'cell')!;
      expect(firstCell.target).toMatchObject({ kind: 'cell', cellId: c.cellId, activated: true });
      expect(Math.abs(firstCell.point.x - 2.992)).toBeLessThan(0.02);
      expect(firstCell.normal.x).toBeLessThan(-0.9);
      const requests = fresh.barriers[0]!.requests.filter((r) => r.source.kind === 'cell');
      // the cork may bounce on to other cells later; this cell is requested once
      expect(requests.filter((r) => r.targetId === c.cellId)).toHaveLength(1);
      const used = fireAt(w, 2.65, aim, allIds.filter((id) => id !== c.cellId));
      const again = used.impacts.find((i) => i.target.kind === 'cell')!;
      expect(again.target).toMatchObject({ kind: 'cell', cellId: c.cellId, activated: false });
      expect(used.barriers[0]!.requests.some((r) => r.targetId === c.cellId)).toBe(false);
      expect(used.record.facts?.representative).toMatchObject({ kind: 'cell', cellId: c.cellId, activated: false });
      expect(used.record.facts?.unusedNeighbour).toBe(true);
    } finally {
      w.dispose();
    }
  });

  it('a shot into the right back corner uses one cell per contact instant, never two', async () => {
    const w = await world(false);
    try {
      const corner = { x: 2.99, y: 2.1, z: -2.44 };
      const aim = aimThrough(B, 2.65, corner)!;
      expect(aim).not.toBeNull();
      const run = fireAt(w, 2.65, aim);
      const first: ImpactEvent[] = run.impacts.filter((i) => i.target.kind === 'cell' && i.target.activated);
      expect(first.length).toBeGreaterThan(0);
      // the first contact never asks for a side cell in the same instant
      const requests = run.barriers[0]!.requests.filter((r) => r.source.kind === 'cell');
      const sameInstant = requests.filter((r) => r.simTimeSec === requests[0]!.simTimeSec);
      expect(sameInstant).toHaveLength(1);
    } finally {
      w.dispose();
    }
  });

  it('a shot that touches nothing records which side it left by', async () => {
    const w = await world(false);
    try {
      const up = fireAt(w, 0, { yaw: 0, pitch: 0.7 });
      // straight up and over: it either touches the ceiling cloth or leaves upward
      if (up.record.facts?.representative === null) expect(up.record.facts?.exit).toBe('up');
      const out = makeRequest({ origin: muzzlePosition(layout, 0), direction: { x: 0, y: 0, z: 1 } });
      const front = runExpanded(w, out, expandedCtx({ usableCells: allIds }), { dt: tuning.limits.fixedStepSec });
      expect(front.record.facts).toEqual({ representative: null, exit: 'front', pushedPrizes: [], unusedNeighbour: false });
    } finally {
      w.dispose();
    }
  });
});
