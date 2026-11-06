import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  BOOTH_LAYOUT,
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  IDENTITY_QUAT,
  mintId,
  type BackgroundCellId,
  type BoothLayout,
  type PrizeFrame,
  type PrizeTypeId,
  type SimulationFrame,
} from '../../src/contracts';
import { applyCameraPose, applyFrame, cameraPose, createSceneGraph, fovForAspect } from '../../src/view';
import { createBackgroundCells } from '../../src/view/background-cells';

const bundle = getGameplayBundle('expanded-proposed');
const resolvePrize = (typeId: PrizeTypeId) => {
  const p = bundle.catalog.prizes.get(typeId)!;
  return { shape: p.shape, modelKey: p.modelKey, material: p.material };
};

const EPS = 1e-4;
const toBox = (b: { center: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number } }) =>
  new THREE.Box3(
    new THREE.Vector3(b.center.x - b.halfExtents.x - EPS, b.center.y - b.halfExtents.y - EPS, b.center.z - b.halfExtents.z - EPS),
    new THREE.Vector3(b.center.x + b.halfExtents.x + EPS, b.center.y + b.halfExtents.y + EPS, b.center.z + b.halfExtents.z + EPS),
  );
function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

function prizeFrame(n: number, typeNo: number, x: number, y: number, z: number): PrizeFrame {
  return {
    instanceId: mintId.instance(n),
    typeId: `P${String(typeNo).padStart(3, '0')}` as PrizeTypeId,
    position: { x, y, z },
    rotation: IDENTITY_QUAT,
    hp: 3,
    maxHp: 3,
    mounted: true,
    collected: false,
  };
}
const frame = (prizes: PrizeFrame[]): SimulationFrame => ({ simTimeSec: 0, shotId: null, stage: null, prizes, projectiles: [], events: [] });

describe('view v2: booth matches BOOTH_LAYOUT_V2 (one data source with the colliders)', () => {
  const L = BOOTH_LAYOUT_V2;
  const graph = createSceneGraph({ layout: L, resolvePrize, corkRadius: 0 });

  it('keeps one exact invisible proxy per surface, device, shopkeeper part, hidden target and the 36 cells', () => {
    const expected = [
      ...L.surfaces.map((s) => ({ id: `proxy:${s.id}`, box: s.box })),
      ...L.devices.map((d) => ({ id: `proxy:${d.deviceId}`, box: d.box })),
      ...L.shopkeeper.map((p) => ({ id: `proxy:shopkeeper-${p.part}`, box: p.box })),
      ...L.hiddenTargets.map((t) => ({ id: `proxy:${t.targetId}`, box: t.box })),
      ...L.backgroundCells!.map((c) => ({ id: `proxy:${c.cellId}`, box: c.box })),
    ];
    expect(L.backgroundCells).toHaveLength(36);
    expect(graph.booth.proxies.children).toHaveLength(expected.length);
    for (const e of expected) {
      const m = graph.booth.proxies.getObjectByName(e.id);
      expect(m, e.id).toBeDefined();
      const b = worldBox(m!);
      const c = b.getCenter(new THREE.Vector3());
      const s = b.getSize(new THREE.Vector3());
      expect(c.x).toBeCloseTo(e.box.center.x, 6);
      expect(c.y).toBeCloseTo(e.box.center.y, 6);
      expect(c.z).toBeCloseTo(e.box.center.z, 6);
      expect(s.x).toBeCloseTo(e.box.halfExtents.x * 2, 6);
      expect(s.y).toBeCloseTo(e.box.halfExtents.y * 2, 6);
      expect(s.z).toBeCloseTo(e.box.halfExtents.z * 2, 6);
    }
  });

  it('covers every surface box with the static mesh, including the wide shelf boards and walls', () => {
    const sb = worldBox(graph.booth.group.getObjectByName('booth:static')!);
    for (const s of L.surfaces) expect(sb.containsBox(toBox(s.box).expandByScalar(-0.01)), s.id).toBe(true);
    // the wide board of every tier really spans the 12 columns
    for (const t of L.tiers) expect(t.halfWidth).toBeGreaterThan(2.3);
  });

  it('draws each device plate at its layout box and keeps the shopkeeper parts inside theirs, beyond column 12', () => {
    expect(graph.booth.devices.size).toBe(L.devices.length);
    for (const d of L.devices) {
      const m = graph.booth.devices.get(d.deviceId as string)!;
      expect(m, d.deviceId).toBeDefined();
      expect(toBox(d.box).expandByScalar(0.0045).containsBox(worldBox(m)), d.deviceId).toBe(true);
    }
    expect(graph.booth.shopkeeper.size).toBe(4);
    for (const p of L.shopkeeper) {
      const b = worldBox(graph.booth.shopkeeper.get(p.part)!);
      expect(toBox(p.box).containsBox(b), p.part).toBe(true);
      expect(b.min.x).toBeGreaterThan(2.31 + 0.2); // beyond the last column
    }
    for (const t of L.hiddenTargets) expect(toBox(t.box).containsBox(worldBox(graph.booth.hidden.get(t.targetId)!)), t.targetId).toBe(true);
  });

  it('keeps lanterns inside the walls', () => {
    const lanterns = worldBox(graph.booth.group.getObjectByName('booth:lanterns')!);
    expect(lanterns.min.x).toBeGreaterThan(-3.01);
    expect(lanterns.max.x).toBeLessThan(3.01);
  });

  it('stays within a modest budget with no prizes and with a full 36-prize shelf', () => {
    const st = graph.stats();
    expect(st.triangles).toBeLessThan(45000);
    expect(st.meshes).toBeLessThan(40);
    const g = createSceneGraph({ layout: L, resolvePrize });
    applyFrame(g, frame(L.slots.map((s, i) => prizeFrame(i + 1, 1 + ((i * 7) % 100), s.spawnBase.x, s.spawnBase.y + 0.06, s.spawnBase.z))));
    const full = g.stats();
    expect(full.prizeMeshes).toBe(36);
    expect(full.triangles).toBeLessThan(180000);
    g.dispose();
  });

  it('rules-v1 keeps no cells and the exact old proxy count', () => {
    const v1 = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    expect(v1.cells).toBeNull();
    expect(v1.booth.proxies.children).toHaveLength(BOOTH_LAYOUT.surfaces.length + BOOTH_LAYOUT.devices.length + BOOTH_LAYOUT.shopkeeper.length + BOOTH_LAYOUT.hiddenTargets.length);
    v1.dispose();
  });
});

describe('view v2: background cells', () => {
  it('draws all 36 cells, unused and used differently, and keeps every cell inside its collider box', () => {
    const cells = createBackgroundCells(BOOTH_LAYOUT_V2);
    expect(cells.cellCount).toBe(36);
    expect(cells.states().size).toBe(36);
    expect([...cells.states().values()].every((v) => v === 'unused')).toBe(true);
    const unusedMesh = cells.group.getObjectByName('cells:panels') as THREE.Mesh;
    const unusedColors = Array.from((unusedMesh.geometry.getAttribute('color') as THREE.BufferAttribute).array);
    const unusedTris = unusedMesh.geometry.getAttribute('position').count / 3;

    const used = new Set<string>(['cell-r1-c01', 'cell-r2-c05', 'cell-r3-c12']);
    cells.update(CELL_IDS_V2.map((cellId: BackgroundCellId) => ({ cellId, used: used.has(cellId), effectId: null })));
    expect([...cells.states()].filter(([, v]) => v === 'used').map(([k]) => k).sort()).toEqual([...used].sort());
    const mesh = cells.group.getObjectByName('cells:panels') as THREE.Mesh;
    expect(cells.group.children).toHaveLength(1);
    const colors = Array.from((mesh.geometry.getAttribute('color') as THREE.BufferAttribute).array);
    expect(colors.length).toBeGreaterThan(0);
    expect(unusedColors.length).toBeGreaterThan(0);
    // used cells use a different mark (shape) and a darker panel
    expect(mesh.geometry.getAttribute('position').count / 3).not.toBe(unusedTris);

    // everything drawn stays within the cell boxes' footprint (+ a flat decal)
    const wb = worldBox(mesh);
    for (const c of BOOTH_LAYOUT_V2.backgroundCells!) {
      expect(wb.containsPoint(new THREE.Vector3(c.box.center.x, c.box.center.y, c.box.center.z))).toBe(true);
    }
    expect(wb.max.z).toBeLessThan(-2.45 + 0.008 + 0.006 + 1e-6);
    expect(wb.min.z).toBeGreaterThan(-2.45 - 1e-6);

    // darker: the average luminance of a used panel is lower than an unused one
    const lum = (arr: number[], from: number, n: number) => {
      let s = 0;
      for (let i = 0; i < n; i++) s += arr[from + i * 3]! * 0.3 + arr[from + i * 3 + 1]! * 0.6 + arr[from + i * 3 + 2]! * 0.1;
      return s / n;
    };
    // the first cell (cell-r1-c01) is used in the second build; the first vertex belongs to its panel box
    expect(lum(colors, 0, 12)).toBeLessThan(lum(unusedColors, 0, 12));
    cells.dispose();
  });

  it('ignores unknown cell ids and a missing expansion state (rules-v1 safe)', () => {
    const cells = createBackgroundCells(BOOTH_LAYOUT_V2);
    cells.update(undefined);
    cells.update([{ cellId: 'cell-r9-c99' as BackgroundCellId, used: true, effectId: null }]);
    expect([...cells.states().values()].every((v) => v === 'unused')).toBe(true);
    cells.dispose();
  });
});

// ------------------------------------------------------------------ camera

const VIEWPORTS: readonly [number, number][] = [
  [402, 874],
  [402, 700],
  [375, 600],
  [320, 568],
];

function cameraFor(layout: BoothLayout, standX: number, w: number, h: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(60, w / h, 0.05, 30);
  applyCameraPose(cam, cameraPose(layout, standX, w / h), w / h);
  return cam;
}
function ndc(cam: THREE.Camera, p: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.y, p.z).project(cam);
}
const inside = (v: THREE.Vector3, margin = 0) => Math.abs(v.x) <= 1 - margin && Math.abs(v.y) <= 1 - margin && v.z < 1;

describe('view v2: camera follows the stand and shows about three columns', () => {
  const L = BOOTH_LAYOUT_V2;
  const colX = (c: number) => L.slots[c]!.spawnBase.x;

  it.each(VIEWPORTS)('shows about 3-4 columns of the middle board at %i x %i, wherever the stand is', (w, h) => {
    for (const standX of [L.camera.standMinX, -1, 0, 1.3, L.camera.standMaxX]) {
      const cam = cameraFor(L, standX, w, h);
      const mid = L.tiers[1]!;
      const left = ndc(cam, { x: standX - 0.21, y: mid.topY + 0.1, z: mid.centerZ });
      const right = ndc(cam, { x: standX + 0.21, y: mid.topY + 0.1, z: mid.centerZ });
      // the visible width in columns at the middle board
      const widthCols = (2 * 0.42) / ((right.x - left.x) / 2) / 1; // columns across the full screen width [-1, 1]
      expect(widthCols, `${w}x${h} stand ${standX}`).toBeGreaterThan(2.8);
      expect(widthCols, `${w}x${h} stand ${standX}`).toBeLessThan(4.4);
    }
  });

  it.each(VIEWPORTS)('keeps the stand column, all three rows and the cells behind them in view at %i x %i', (w, h) => {
    for (const standX of [L.camera.standMinX, 0, L.camera.standMaxX]) {
      const cam = cameraFor(L, standX, w, h);
      // nearest column
      let best = 0;
      for (let c = 0; c < 12; c++) if (Math.abs(colX(c) - standX) < Math.abs(colX(best) - standX)) best = c;
      for (const row of [1, 2, 3] as const) {
        const slot = L.slots[(row - 1) * 12 + best]!;
        expect(inside(ndc(cam, { x: slot.spawnBase.x, y: slot.spawnBase.y + 0.1, z: slot.spawnBase.z }), 0.02), `${w}x${h} stand ${standX} row ${row} prize`).toBe(true);
        const cell = L.backgroundCells![(row - 1) * 12 + best]!;
        expect(inside(ndc(cam, cell.box.center), 0.02), `${w}x${h} stand ${standX} row ${row} cell`).toBe(true);
      }
    }
  });

  it.each(VIEWPORTS)('brings both end columns, the left-end devices and the shopkeeper into view at %i x %i', (w, h) => {
    // right end: last column and the shopkeeper
    const camR = cameraFor(L, L.camera.standMaxX, w, h);
    expect(inside(ndc(camR, L.slots[11]!.spawnBase))).toBe(true);
    expect(inside(ndc(camR, L.slots[35]!.spawnBase))).toBe(true);
    for (const part of L.shopkeeper) expect(inside(ndc(camR, part.box.center)), `shopkeeper ${part.part}`).toBe(true);
    // left end: first column and the four back-wall devices
    const camL = cameraFor(L, L.camera.standMinX, w, h);
    expect(inside(ndc(camL, L.slots[0]!.spawnBase))).toBe(true);
    for (const d of L.devices.filter((x) => x.directlyReachable)) expect(inside(ndc(camL, d.box.center)), String(d.deviceId)).toBe(true);
  });

  it('can aim at the shopkeeper and at the left-end devices from the end of the stand range (within the yaw limit)', () => {
    const atRight = L.shopkeeper.map((p) => Math.atan2(p.box.center.x - L.camera.standMaxX, -(p.box.center.z - L.camera.muzzle.z)));
    for (const a of atRight) expect(Math.abs(a)).toBeLessThan(L.camera.yawLimit);
    for (const d of L.devices.filter((x) => x.directlyReachable)) {
      const a = Math.atan2(d.box.center.x - L.camera.standMinX, -(d.box.center.z - L.camera.muzzle.z));
      expect(Math.abs(a)).toBeLessThan(L.camera.yawLimit);
    }
  });

  it('moves the picture continuously with the stand and keeps the rules-v1 camera unchanged', () => {
    const a = cameraPose(L, 0.5, 0.46);
    const b = cameraPose(L, 0.51, 0.46);
    expect(Math.abs(a.eye.x - b.eye.x)).toBeCloseTo(0.01, 9);
    expect(Math.abs(a.target.x - b.target.x)).toBeCloseTo(0.01, 9);
    const v1 = cameraPose(BOOTH_LAYOUT, 0.4, 0.46);
    expect(v1.target.x).toBeCloseTo(0.24, 12); // 0.6 follow, as before
    expect(v1.fovDeg).toBeCloseTo(fovForAspect(0.46), 12);
  });
});
