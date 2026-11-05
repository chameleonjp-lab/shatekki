import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  BOOTH_LAYOUT,
  IDENTITY_QUAT,
  asPrizeTypeId,
  mintId,
  type CollisionShape,
  type EventId,
  type ImpactEvent,
  type PrizeFrame,
  type PrizeMaterial,
  type PrizeTypeId,
  type ProjectileFrame,
  type SimEvent,
  type SimulationFrame,
} from '../../src/contracts';
import { aimDirection, aimTargetPosition, applyFrame, buildPrizeGeometry, cameraPose, computeReticle, createSceneGraph, fovForAspect, muzzlePosition, updateAim } from '../../src/view';
import { PRIZE_RECIPES } from '../../src/view/assets/prize-recipes';
import { triangleCount } from '../../src/view/assets/kit';

// ------------------------------------------------------------------ fixtures
// Local shape fixtures: src/catalog is written in parallel and must not be imported.
const SHAPES: Record<string, CollisionShape> = {
  smallBox: { kind: 'box', halfExtents: { x: 0.07, y: 0.06, z: 0.04 } },
  flatBox: { kind: 'box', halfExtents: { x: 0.1, y: 0.03, z: 0.07 } },
  tallBox: { kind: 'box', halfExtents: { x: 0.04, y: 0.1, z: 0.04 } },
  cylinder: { kind: 'cylinder', radius: 0.05, halfHeight: 0.06 },
  capsule: { kind: 'capsule', radius: 0.04, halfHeight: 0.05 },
  ball: { kind: 'ball', radius: 0.06 },
};

const MATERIALS: PrizeMaterial[] = ['paper', 'plastic', 'wood', 'cloth', 'metal', 'glass', 'ceramic', 'rubber'];

const resolvePrize = (typeId: PrizeTypeId) => {
  const n = Number(typeId.slice(1));
  return {
    shape: Object.values(SHAPES)[n % 6]!,
    modelKey: typeId as string,
    material: MATERIALS[n % MATERIALS.length]!,
  };
};

const tid = (n: number) => asPrizeTypeId(`P${String(n).padStart(3, '0')}`);

function prizeFrame(n: number, typeNo: number, x: number, y: number, z: number, collected = false): PrizeFrame {
  return { instanceId: mintId.instance(n), typeId: tid(typeNo), position: { x, y, z }, rotation: IDENTITY_QUAT, hp: 3, maxHp: 3, mounted: true, collected };
}

function frame(prizes: PrizeFrame[], opts: { projectiles?: ProjectileFrame[]; events?: SimEvent[]; t?: number } = {}): SimulationFrame {
  return { simTimeSec: opts.t ?? 0, shotId: null, stage: null, prizes, projectiles: opts.projectiles ?? [], events: opts.events ?? [] };
}

function impact(n: number, x: number, y: number, z: number): ImpactEvent {
  const shot = mintId.shot(1);
  return {
    type: 'impact',
    eventId: mintId.event(shot, n),
    runId: mintId.run('run-test'),
    shotId: shot,
    projectileId: mintId.projectile(shot, 0),
    target: { kind: 'surface', surfaceId: 'back-wall', material: 'wood' },
    point: { x, y, z },
    normal: { x: 0, y: 0, z: 1 },
    speed: 8,
    reflectionIndex: 0,
  };
}

function worldBox(obj: THREE.Object3D): THREE.Box3 {
  obj.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(obj, true);
}

const EPS = 1e-4;
const toBox = (b: { center: { x: number; y: number; z: number }; halfExtents: { x: number; y: number; z: number } }) =>
  new THREE.Box3(
    new THREE.Vector3(b.center.x - b.halfExtents.x - EPS, b.center.y - b.halfExtents.y - EPS, b.center.z - b.halfExtents.z - EPS),
    new THREE.Vector3(b.center.x + b.halfExtents.x + EPS, b.center.y + b.halfExtents.y + EPS, b.center.z + b.halfExtents.z + EPS),
  );

// -------------------------------------------------------------------- booth

describe('view: booth matches BOOTH_LAYOUT', () => {
  // corkRadius 0: exact layout boxes (the app inflates them by the cork radius; see the next test).
  const graph = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize, corkRadius: 0 });

  it('keeps one exact invisible proxy box per layout collider, at the layout position', () => {
    const L = BOOTH_LAYOUT;
    const expected = [
      ...L.surfaces.map((s) => ({ id: `proxy:${s.id}`, box: s.box })),
      ...L.devices.map((d) => ({ id: `proxy:${d.deviceId}`, box: d.box })),
      ...L.shopkeeper.map((p) => ({ id: `proxy:shopkeeper-${p.part}`, box: p.box })),
      ...L.hiddenTargets.map((t) => ({ id: `proxy:${t.targetId}`, box: t.box })),
    ];
    expect(graph.booth.proxies.children).toHaveLength(expected.length);
    for (const e of expected) {
      const m = graph.booth.proxies.getObjectByName(e.id);
      expect(m, e.id).toBeDefined();
      const b = worldBox(m!);
      const c = b.getCenter(new THREE.Vector3());
      expect(c.x).toBeCloseTo(e.box.center.x, 6);
      expect(c.y).toBeCloseTo(e.box.center.y, 6);
      expect(c.z).toBeCloseTo(e.box.center.z, 6);
      const s = b.getSize(new THREE.Vector3());
      expect(s.x).toBeCloseTo(e.box.halfExtents.x * 2, 6);
      expect(s.y).toBeCloseTo(e.box.halfExtents.y * 2, 6);
      expect(s.z).toBeCloseTo(e.box.halfExtents.z * 2, 6);
      expect((m as THREE.Mesh).material).toHaveProperty('visible', false);
    }
  });

  it('static booth mesh covers every surface box (tiers, walls, ceiling, counter, floor)', () => {
    const stat = graph.booth.group.getObjectByName('booth:static')!;
    const sb = worldBox(stat);
    for (const s of BOOTH_LAYOUT.surfaces) {
      const b = toBox(s.box);
      expect(sb.containsBox(b.expandByScalar(-0.01)), s.id).toBe(true);
    }
    for (const t of BOOTH_LAYOUT.tiers) {
      // the board top sits exactly at topY: nothing of the static mesh sticks above it within the board footprint besides pads
      expect(sb.max.y).toBeGreaterThan(t.topY);
    }
  });

  it('draws each device plate exactly at its layout box (symbols <= 5 mm proud)', () => {
    for (const d of BOOTH_LAYOUT.devices) {
      const m = graph.booth.devices.get(d.deviceId as string);
      expect(m, d.deviceId).toBeDefined();
      const b = worldBox(m!);
      const box = toBox(d.box);
      const loose = box.clone().expandByScalar(0.0045);
      expect(loose.containsBox(b), `${d.deviceId} inside box+5mm`).toBe(true);
      if (d.kind !== 'transform') {
        // the plate fills the layout box (so the visual hit area equals the collider)
        const size = b.getSize(new THREE.Vector3());
        const want = new THREE.Vector3(d.box.halfExtents.x * 2, d.box.halfExtents.y * 2, d.box.halfExtents.z * 2);
        expect(size.x).toBeGreaterThanOrEqual(want.x - 1e-4);
        expect(size.y).toBeGreaterThanOrEqual(want.y - 1e-4);
        expect(size.z).toBeGreaterThanOrEqual(want.z - 1e-4);
      }
    }
    expect(graph.booth.devices.size).toBe(BOOTH_LAYOUT.devices.length);
  });

  it('keeps shopkeeper hat / fan / body / feet inside their layout part boxes', () => {
    expect(graph.booth.shopkeeper.size).toBe(4);
    for (const p of BOOTH_LAYOUT.shopkeeper) {
      const m = graph.booth.shopkeeper.get(p.part);
      expect(m, p.part).toBeDefined();
      expect(toBox(p.box).containsBox(worldBox(m!)), `shopkeeper ${p.part}`).toBe(true);
    }
  });

  it('keeps hidden daruma / cat inside their layout boxes', () => {
    for (const t of BOOTH_LAYOUT.hiddenTargets) {
      const m = graph.booth.hidden.get(t.targetId);
      expect(m, t.targetId).toBeDefined();
      expect(toBox(t.box).containsBox(worldBox(m!)), t.targetId).toBe(true);
    }
  });

  it('stays within a modest draw-call and triangle budget with no prizes', () => {
    const st = graph.stats();
    expect(st.triangles).toBeLessThan(20000);
    expect(st.meshes).toBeLessThan(30);
  });
});

// ------------------------------------------------------------------- frames

describe('view: applyFrame mirrors the simulation frame (keyed by instanceId)', () => {
  it('creates one mesh per instanceId; two instances of one kind get two meshes', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    const r = applyFrame(g, frame([prizeFrame(1, 5, -0.42, 0.86, -1.75), prizeFrame(2, 5, 0.42, 0.86, -1.75), prizeFrame(3, 29, 0, 1.22, -1.92)]));
    expect(r.created).toBe(3);
    expect(g.prizes.size).toBe(3);
    expect(g.prizeLayer.children).toHaveLength(3);
    const a = g.prizes.get('i0001')!.mesh;
    const b = g.prizes.get('i0002')!.mesh;
    expect(a).not.toBe(b);
    expect(a.geometry).toBe(b.geometry); // geometry is shared per kind
    g.dispose();
  });

  it('moves meshes to the frame pose and reuses them on later frames', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    applyFrame(g, frame([prizeFrame(1, 5, 0, 0.86, -1.75)]));
    const mesh = g.prizes.get('i0001')!.mesh;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);
    const moved: PrizeFrame = { ...prizeFrame(1, 5, 0.3, 0.7, -1.6), rotation: { x: q.x, y: q.y, z: q.z, w: q.w } };
    const r = applyFrame(g, frame([moved], { t: 0.1 }));
    expect(r.created).toBe(0);
    expect(g.prizes.get('i0001')!.mesh).toBe(mesh);
    expect(mesh.position.toArray()).toEqual([0.3, 0.7, -1.6]);
    expect(mesh.quaternion.angleTo(q)).toBeLessThan(1e-9);
    g.dispose();
  });

  it('hides collected prizes and removes vanished ones; never touches the frame', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    const f1 = frame([prizeFrame(1, 5, 0, 0.86, -1.75), prizeFrame(2, 6, 0.4, 0.86, -1.75)]);
    applyFrame(g, f1);
    const f2 = frame([prizeFrame(1, 5, 0, 0.3, -1.4, true), prizeFrame(2, 6, 0.4, 0.86, -1.75)], { t: 0.5 });
    const snapshot = JSON.stringify(f2);
    const r = applyFrame(g, f2);
    expect(r.hidden).toBe(1);
    expect(g.prizes.get('i0001')!.mesh.visible).toBe(false);
    expect(g.prizes.get('i0002')!.mesh.visible).toBe(true);
    expect(g.pickTargets().some((o) => o === g.prizes.get('i0001')!.mesh)).toBe(false);
    expect(JSON.stringify(f2)).toBe(snapshot);
    const r3 = applyFrame(g, frame([prizeFrame(2, 6, 0.4, 0.86, -1.75)], { t: 0.6 }));
    expect(r3.removed).toBe(1);
    expect(g.prizes.has('i0001')).toBe(false);
    expect(g.prizeLayer.children).toHaveLength(1);
    g.dispose();
  });

  it('keeps the individual on transform but swaps its look', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    applyFrame(g, frame([prizeFrame(1, 29, 0, 0.86, -1.75)]));
    const before = g.prizes.get('i0001')!.mesh;
    applyFrame(g, frame([prizeFrame(1, 56, 0, 0.86, -1.75)], { t: 0.2 }));
    const after = g.prizes.get('i0001')!.mesh;
    expect(g.prizes.size).toBe(1);
    expect(after).not.toBe(before);
    expect(g.prizeLayer.children).toHaveLength(1);
    expect(after.userData).toMatchObject({ instanceId: 'i0001', typeId: 'P056' });
    g.dispose();
  });

  it('shows corks from frame.projectiles and removes them when they end', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    const cork: ProjectileFrame = { projectileId: mintId.projectile(mintId.shot(1), 0), position: { x: 0, y: 1.2, z: -1 }, velocity: { x: 0, y: 0, z: -8 }, bulletType: 'standard', powerMultiplier: 1 };
    applyFrame(g, frame([], { projectiles: [cork] }));
    expect(g.projectileLayer.children).toHaveLength(1);
    const c = g.projectileLayer.children[0]!;
    expect(c.position.z).toBeCloseTo(-1, 9);
    applyFrame(g, frame([], { projectiles: [{ ...cork, position: { x: 0, y: 1.2, z: -1.4 }, powerMultiplier: 2 }], t: 0.05 }));
    expect(g.projectileLayer.children[0]).toBe(c);
    expect(c.position.z).toBeCloseTo(-1.4, 9);
    applyFrame(g, frame([], { t: 0.1 }));
    expect(g.projectileLayer.children).toHaveLength(0);
    g.dispose();
  });

  it('draws one small flash per impact event, once (re-applying the same frame does not re-trigger)', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    const ev = impact(0, 0.1, 1.0, -2.45);
    const f = frame([], { events: [ev], t: 1 });
    expect(applyFrame(g, f).flashes).toBe(1);
    expect(applyFrame(g, f).flashes).toBe(0);
    const visible = g.effectsLayer.children.filter((c) => c.visible);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.position.z).toBeCloseTo(-2.44, 9);
    applyFrame(g, frame([], { t: 2 }));
    expect(g.effectsLayer.children.filter((c) => c.visible)).toHaveLength(0);
    // an event for contacts outside the camera still draws (no camera dependence here)
    const far = impact(1, 5, 5, 5);
    expect(applyFrame(g, frame([], { events: [far], t: 3 })).flashes).toBe(1);
    expect(far.eventId).toBe('s01-e1' as EventId);
    g.dispose();
  });

  it('keeps the whole scene modest with nine prizes on the shelf', () => {
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize });
    const prizes = BOOTH_LAYOUT.slots.map((s, i) => prizeFrame(i + 1, 1 + i * 11, s.spawnBase.x, s.spawnBase.y + 0.06, s.spawnBase.z));
    applyFrame(g, frame(prizes));
    const st = g.stats();
    expect(st.prizeMeshes).toBe(9);
    expect(st.triangles).toBeLessThan(60000);
    expect(st.meshes).toBeLessThan(40);
    g.dispose();
  });
});

// ------------------------------------------------------------------ recipes

describe('view: 100 prize recipes', () => {
  const names = new Map<string, string>();
  for (const line of readFileSync('docs/prize-candidates.md', 'utf8').split('\n')) {
    const m = /^\|\s*(P\d{3})\s*\|\s*(.+?)\s*\|$/.exec(line);
    if (m) names.set(m[1]!, m[2]!);
  }

  it('has a recipe for every P001-P100, named as in prize-candidates.md', () => {
    expect(names.size).toBe(100);
    expect(Object.keys(PRIZE_RECIPES)).toHaveLength(100);
    for (const [id, name] of names) {
      expect(PRIZE_RECIPES[id], id).toBeDefined();
      expect(PRIZE_RECIPES[id]!.name, id).toBe(name);
    }
  });

  it('builds every recipe for every shape kind and fits strictly inside the collision shape', () => {
    let worstTriangles = 0;
    let total = 0;
    for (const id of Object.keys(PRIZE_RECIPES)) {
      for (const [shapeName, shape] of Object.entries(SHAPES)) {
        const geo = buildPrizeGeometry(id, shape, 'plastic');
        const p = geo.getAttribute('position');
        expect(p.count, `${id}/${shapeName} has vertices`).toBeGreaterThan(0);
        let min = Infinity;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const z = p.getZ(i);
          if (!Number.isFinite(x + y + z)) throw new Error(`${id}/${shapeName}: non-finite vertex`);
          if (!insideShapeIndependent(shape, x, y, z)) throw new Error(`${id}/${shapeName}: vertex ${i} outside shape (${x}, ${y}, ${z})`);
          min = Math.min(min, y);
        }
        // not collapsed: the model uses a meaningful part of the collider
        geo.computeBoundingBox();
        const size = geo.boundingBox!.getSize(new THREE.Vector3());
        const hx = shape.kind === 'box' ? shape.halfExtents.x : shape.kind === 'ball' ? shape.radius : shape.radius;
        expect(Math.max(size.x, size.y, size.z), `${id}/${shapeName} not collapsed`).toBeGreaterThan(Math.min(hx, 0.03));
        const tris = triangleCount(geo);
        worstTriangles = Math.max(worstTriangles, tris);
        if (shapeName === 'smallBox') total += tris;
        expect(geo.getAttribute('color')).toBeDefined();
        expect(geo.getAttribute('normal').count).toBe(p.count);
      }
    }
    // low-poly budget: each prize stays small, 100 kinds total is modest
    expect(worstTriangles).toBeLessThan(2200);
    expect(total).toBeLessThan(100000);
  });

  it('bottom-aligns flat-bottomed shapes so prizes sit on the shelf', () => {
    for (const id of ['P001', 'P029', 'P056']) {
      const shape = SHAPES.smallBox as Extract<CollisionShape, { kind: 'box' }>;
      const geo = buildPrizeGeometry(id, shape);
      geo.computeBoundingBox();
      expect(geo.boundingBox!.min.y).toBeCloseTo(-shape.halfExtents.y, 5);
    }
  });

  it('falls back to a shape-based primitive for an unknown modelKey (never throws)', () => {
    for (const shape of Object.values(SHAPES)) {
      const geo = buildPrizeGeometry('does-not-exist', shape, 'wood');
      const p = geo.getAttribute('position');
      expect(p.count).toBeGreaterThan(0);
      for (let i = 0; i < p.count; i++) expect(insideShapeIndependent(shape, p.getX(i), p.getY(i), p.getZ(i))).toBe(true);
    }
    const g = createSceneGraph({ layout: BOOTH_LAYOUT, resolvePrize: (t) => ({ ...resolvePrize(t), modelKey: 'unknown-key' }) });
    applyFrame(g, frame([prizeFrame(1, 5, 0, 0.86, -1.75)]));
    expect(g.prizes.size).toBe(1);
    g.dispose();
  });
});

function insideShapeIndependent(shape: CollisionShape, x: number, y: number, z: number): boolean {
  const e = 1e-6;
  switch (shape.kind) {
    case 'box':
      return Math.abs(x) <= shape.halfExtents.x + e && Math.abs(y) <= shape.halfExtents.y + e && Math.abs(z) <= shape.halfExtents.z + e;
    case 'cylinder':
      return Math.sqrt(x * x + z * z) <= shape.radius + e && Math.abs(y) <= shape.halfHeight + e;
    case 'capsule': {
      const cy = Math.min(shape.halfHeight, Math.max(-shape.halfHeight, y));
      return Math.sqrt(x * x + (y - cy) ** 2 + z * z) <= shape.radius + e;
    }
    case 'ball':
      return Math.sqrt(x * x + y * y + z * z) <= shape.radius + e;
  }
}

// ---------------------------------------------------------------- reticle

describe('view: reticle shows exactly the aimed direction', () => {
  const L = BOOTH_LAYOUT;

  it('zero aim points from the muzzle to aimTarget; yaw+ is right, pitch+ is up', () => {
    for (const standX of [-0.45, 0, 0.3, 0.45]) {
      const m = muzzlePosition(L, standX);
      const t = aimTargetPosition(L, standX);
      const want = new THREE.Vector3(t.x - m.x, t.y - m.y, t.z - m.z).normalize();
      const got = aimDirection(L, standX, { yaw: 0, pitch: 0 });
      expect(got.distanceTo(want)).toBeLessThan(1e-12);
    }
    const d0 = aimDirection(L, 0, { yaw: 0, pitch: 0 });
    expect(aimDirection(L, 0, { yaw: 0.2, pitch: 0 }).x).toBeGreaterThan(0.15);
    expect(aimDirection(L, 0, { yaw: 0, pitch: 0.2 }).y).toBeGreaterThan(d0.y + 0.15);
    expect(aimDirection(L, 0, { yaw: 0.2, pitch: 0.1 }).length()).toBeCloseTo(1, 12);
  });

  it('puts the reticle exactly on origin + direction * distance, on the first geometry hit', () => {
    const g = createSceneGraph({ layout: L, resolvePrize, corkRadius: 0 });
    applyFrame(g, frame([]));
    for (const aim of [{ yaw: 0, pitch: 0 }, { yaw: 0.15, pitch: -0.1 }, { yaw: -0.3, pitch: 0.3 }]) {
      const standX = 0.2;
      const r = computeReticle(L, standX, aim, g.pickTargets());
      expect(r.hit).toBe(true);
      const expected = r.origin.clone().addScaledVector(aimDirection(L, standX, aim), r.distance);
      expect(r.point.distanceTo(expected)).toBeLessThan(1e-9);
      expect(r.origin.x).toBeCloseTo(standX, 12);
    }
    // straight ahead with an empty shelf: the back wall inner face
    const straight = computeReticle(L, 0, { yaw: 0, pitch: 0 }, g.pickTargets());
    expect(straight.point.z).toBeCloseTo(-2.45, 6);
    g.dispose();
  });

  it('inflates pick proxies by the cork radius so the reticle marks the cork centre at contact', () => {
    const r = 0.011;
    const g = createSceneGraph({ layout: L, resolvePrize, corkRadius: r });
    applyFrame(g, frame([]));
    const straight = computeReticle(L, 0, { yaw: 0, pitch: 0 }, g.pickTargets());
    expect(straight.point.z).toBeCloseTo(-2.45 + r, 6);
    const wall = g.booth.proxies.getObjectByName('proxy:back-wall')!;
    const size = worldBox(wall).getSize(new THREE.Vector3());
    const back = L.surfaces.find((x) => x.id === 'back-wall')!;
    expect(size.z).toBeCloseTo(back.box.halfExtents.z * 2 + 2 * r, 6);
    g.dispose();
  });

  it('stops at a prize that stands in the aim ray (first hit)', () => {
    const g = createSceneGraph({ layout: L, resolvePrize });
    const dir = aimDirection(L, 0, { yaw: 0, pitch: 0 });
    const o = muzzlePosition(L, 0);
    const at = new THREE.Vector3(o.x, o.y, o.z).addScaledVector(dir, 1.7);
    applyFrame(g, frame([prizeFrame(1, 29, at.x, at.y, at.z)]));
    const r = updateAim(g, { phase: 'aiming', standX: 0, effectiveAim: { yaw: 0, pitch: 0 } });
    expect(r.hit).toBe(true);
    expect(r.distance).toBeLessThan(1.8);
    expect(r.distance).toBeGreaterThan(1.55);
    expect(g.reticle.position.distanceTo(r.point)).toBeLessThan(1e-12);
    expect(g.reticle.visible).toBe(true);
    // the gun barrel points exactly along the aim ray
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.gun.quaternion);
    expect(fwd.distanceTo(dir)).toBeLessThan(1e-9);
    // once collected, the prize no longer blocks
    applyFrame(g, frame([prizeFrame(1, 29, at.x, at.y, at.z, true)], { t: 1 }));
    const r2 = updateAim(g, { phase: 'loading', standX: 0, effectiveAim: { yaw: 0, pitch: 0 } });
    expect(r2.distance).toBeGreaterThan(2);
    expect(g.reticle.visible).toBe(false);
    g.dispose();
  });

  it('the camera pose depends on stand position and aspect only (sway cannot move it)', () => {
    const a = cameraPose(L, 0.2, 0.46);
    const b = cameraPose(L, 0.2, 0.46);
    expect(a).toEqual(b);
    expect(a.eye.x).toBe(0.2);
    expect(a.eye.y).toBe(L.camera.eye.y);
    expect(a.eye.z).toBe(L.camera.eye.z);
    expect(fovForAspect(0.46)).toBeLessThanOrEqual(70);
    expect(fovForAspect(0.46)).toBeGreaterThanOrEqual(52);
    expect(fovForAspect(2)).toBe(52);
  });
});
