/**
 * Scene graph (Task 11, owner: Visual). Builds a THREE.Scene WITHOUT WebGL so
 * it can be tested in Node, and mirrors a read-only SimulationFrame into it.
 *
 *  - prize meshes are keyed by INSTANCE id (two prizes of one kind = two meshes);
 *  - a collected prize is hidden, a vanished one is removed;
 *  - corks come from frame.projectiles;
 *  - the view never writes into the sim and never derives points.
 */
import * as THREE from 'three';
import type { BoothLayout, CollisionShape, ImpactTarget, PrizeTypeId, SimulationFrame, ViewState } from '../contracts';
import { aimDirection, computeReticle, muzzlePosition, type ReticleResult } from './aim';
import { Kit, ROT_X, mergeParts } from './assets/kit';
import { C } from './assets/prize-recipes';
import { buildBooth, type BoothBuild } from './booth';
import { createBackgroundCells, type BackgroundCellsView } from './background-cells';
import { createPrizeVisualFactory, type PrizeVisualFactory, type PrizeVisualSpec } from './prizes';

export interface SceneGraphDeps {
  readonly layout: BoothLayout;
  readonly resolvePrize: (typeId: PrizeTypeId) => PrizeVisualSpec;
  /**
   * Cork radius (m). Reticle pick proxies (layout boxes and prize colliders) are
   * inflated by it, so the reticle marks where the sim's swept-sphere cork
   * really makes contact. Defaults to the prototype radius.
   */
  readonly corkRadius?: number;
}

/** Prototype cork radius (src/catalog/config.ts); the app passes the live tuning value. */
export const DEFAULT_PICK_CORK_RADIUS = 0.011;

export interface PrizeNode {
  readonly instanceId: string;
  typeId: string;
  mesh: THREE.Mesh;
  /** Invisible collider-shaped pick proxy (shape inflated by the cork radius). */
  proxy: THREE.Mesh;
}

interface Flash {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  born: number;
  alive: boolean;
}

export interface SceneStats {
  readonly triangles: number;
  readonly meshes: number;
  readonly prizeMeshes: number;
}

export interface SceneGraph {
  readonly layout: BoothLayout;
  readonly scene: THREE.Scene;
  readonly booth: BoothBuild;
  /** Layout v2 only: the 36 background cells on the back wall. */
  readonly cells: BackgroundCellsView | null;
  readonly prizeLayer: THREE.Group;
  readonly projectileLayer: THREE.Group;
  readonly effectsLayer: THREE.Group;
  readonly gun: THREE.Group;
  readonly reticle: THREE.Group;
  readonly prizes: Map<string, PrizeNode>;
  readonly projectiles: Map<string, THREE.Group>;
  /** Raycast targets for the reticle: layout boxes + prize collider shapes, both inflated by the cork radius. */
  pickTargets(): THREE.Object3D[];
  stats(): SceneStats;
  dispose(): void;
  /** @internal */
  readonly internals: GraphInternals;
}

interface GraphInternals {
  readonly resolvePrize: SceneGraphDeps['resolvePrize'];
  readonly proxyLayer: THREE.Group;
  readonly proxyMaterial: THREE.Material;
  readonly pickInflate: number;
  readonly factory: PrizeVisualFactory;
  readonly flashes: Flash[];
  readonly handledEvents: Set<string>;
  readonly corkMaterials: Map<string, THREE.Material>;
  readonly corkGeo: THREE.BufferGeometry;
  readonly trailGeo: THREE.BufferGeometry;
  simTime: number;
}

const FLASH_LIFE = 0.28;
const FLASH_POOL = 24;

const FLASH_COLOR: Record<ImpactTarget['kind'], number> = {
  prize: 0xfff2b0,
  surface: 0xd8d2c4,
  device: 0x7ae0ff,
  shopkeeper: 0xff9ec0,
  hidden: 0xffd24a,
  // Layout v2 background cell (EG07 refines the look).
  cell: 0xb8f0c8,
};

export function flashColorFor(target: ImpactTarget): number {
  if ((target.kind === 'device' || target.kind === 'cell') && !target.activated) return 0x9a9a9a;
  return FLASH_COLOR[target.kind];
}

function buildGun(): THREE.Group {
  const k = new Kit();
  // local: muzzle at origin, the gun extends toward +z (toward the player). Kept short and
  // thin: it sits directly between the eye and the shelf and must not hide prizes.
  k.cyl(C.silver, 0.008, 0.008, 0.12, [0, 0, 0.06], ROT_X, 6);
  k.cyl(C.tan, 0.009, 0.009, 0.016, [0, 0, -0.006], ROT_X, 6); // the cork in the barrel
  const g = new THREE.Group();
  g.name = 'gun';
  g.add(new THREE.Mesh(mergeParts(k.parts), new THREE.MeshLambertMaterial({ vertexColors: true })));
  return g;
}

function buildReticle(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'reticle';
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff6c8, depthTest: false, transparent: true, opacity: 0.95 });
  const dark = new THREE.MeshBasicMaterial({ color: 0x2b2624, depthTest: false, transparent: true, opacity: 0.55 });
  const ringBack = new THREE.Mesh(new THREE.RingGeometry(0.8, 1.22, 20), dark);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 1.1, 20), mat);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 10), mat);
  const ticks = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.5), mat);
    const a = (i * Math.PI) / 2;
    t.position.set(Math.sin(a) * 1.5, Math.cos(a) * 1.5, 0);
    t.rotation.z = -a;
    ticks.add(t);
  }
  for (const m of [ringBack, ring, dot, ticks]) {
    m.renderOrder = 999;
    g.add(m);
  }
  ticks.traverse((o) => (o.renderOrder = 999));
  g.visible = false;
  return g;
}

function buildFlashPool(layer: THREE.Group): Flash[] {
  const geo = new THREE.OctahedronGeometry(1, 0);
  const out: Flash[] = [];
  for (let i = 0; i < FLASH_POOL; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    mesh.name = 'impact-flash';
    layer.add(mesh);
    out.push({ mesh, material, born: -1, alive: false });
  }
  return out;
}

/** Collider-shaped pick geometry (Rapier cylinders/capsules are along y, like three.js). */
function pickProxyGeometry(shape: CollisionShape, inflate: number): THREE.BufferGeometry {
  switch (shape.kind) {
    case 'box':
      return new THREE.BoxGeometry(2 * (shape.halfExtents.x + inflate), 2 * (shape.halfExtents.y + inflate), 2 * (shape.halfExtents.z + inflate));
    case 'cylinder':
      return new THREE.CylinderGeometry(shape.radius + inflate, shape.radius + inflate, 2 * (shape.halfHeight + inflate), 16);
    case 'capsule':
      return new THREE.CapsuleGeometry(shape.radius + inflate, 2 * shape.halfHeight, 4, 12);
    case 'ball':
      return new THREE.SphereGeometry(shape.radius + inflate, 16, 12);
  }
}

export function createSceneGraph(deps: SceneGraphDeps): SceneGraph {
  const { layout } = deps;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d1424); // dusk indigo; the stall fills the view
  const pickInflate = deps.corkRadius ?? DEFAULT_PICK_CORK_RADIUS;
  const booth = buildBooth(layout, pickInflate);
  scene.add(booth.group, booth.proxies);
  const cells = layout.backgroundCells && layout.backgroundCells.length > 0 ? createBackgroundCells(layout) : null;
  if (cells) scene.add(cells.group);
  for (const l of booth.lights) scene.add(l);

  const prizeLayer = new THREE.Group();
  prizeLayer.name = 'prizes';
  const projectileLayer = new THREE.Group();
  projectileLayer.name = 'projectiles';
  const effectsLayer = new THREE.Group();
  effectsLayer.name = 'effects';
  const gun = buildGun();
  const reticle = buildReticle();
  scene.add(prizeLayer, projectileLayer, effectsLayer, gun, reticle);

  const proxyLayer = new THREE.Group();
  proxyLayer.name = 'prize-pick-proxies';
  scene.add(proxyLayer);

  const internals: GraphInternals = {
    resolvePrize: deps.resolvePrize,
    proxyLayer,
    proxyMaterial: new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }),
    pickInflate,
    factory: createPrizeVisualFactory(),
    flashes: buildFlashPool(effectsLayer),
    handledEvents: new Set(),
    corkMaterials: new Map(),
    corkGeo: new THREE.CylinderGeometry(0.016, 0.016, 0.034, 8),
    trailGeo: new THREE.ConeGeometry(0.012, 0.16, 6),
    simTime: 0,
  };
  internals.trailGeo.rotateX(Math.PI / 2); // cone tip trails behind (+z) the cork
  internals.corkGeo.rotateX(Math.PI / 2); // cork axis along z

  const prizes = new Map<string, PrizeNode>();
  const projectiles = new Map<string, THREE.Group>();

  const graph: SceneGraph = {
    layout,
    scene,
    booth,
    cells,
    prizeLayer,
    projectileLayer,
    effectsLayer,
    gun,
    reticle,
    prizes,
    projectiles,
    internals,
    pickTargets() {
      const out: THREE.Object3D[] = [...booth.proxies.children];
      for (const n of prizes.values()) if (n.mesh.visible) out.push(n.proxy);
      return out;
    },
    stats() {
      let triangles = 0;
      let meshes = 0;
      let prizeMeshes = 0;
      scene.traverseVisible((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = o.material as THREE.Material;
        if (!mat.visible) return;
        meshes++;
        const g = o.geometry as THREE.BufferGeometry;
        triangles += g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
        if (o.parent === prizeLayer) prizeMeshes++;
      });
      return { triangles, meshes, prizeMeshes };
    },
    dispose() {
      booth.dispose();
      cells?.dispose();
      for (const n of prizes.values()) n.proxy.geometry.dispose();
      internals.proxyMaterial.dispose();
      internals.factory.dispose();
      internals.corkGeo.dispose();
      internals.trailGeo.dispose();
      for (const m of internals.corkMaterials.values()) m.dispose();
      for (const f of internals.flashes) f.material.dispose();
      internals.flashes[0]?.mesh.geometry.dispose();
      scene.traverse((o) => {
        if (o.parent === gun || o.parent === reticle || o === reticle) {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
        }
      });
      prizes.clear();
      projectiles.clear();
      scene.clear();
    },
  };
  return graph;
}

// --------------------------------------------------------------------- frames

function corkMaterial(graph: SceneGraph, bullet: string, powered: boolean): THREE.Material {
  const key = `${bullet}|${powered}`;
  let m = graph.internals.corkMaterials.get(key);
  if (!m) {
    const color = powered ? 0xff8a1e : bullet === 'heavy' ? 0x59606c : bullet === 'bouncy' ? 0xff5a7a : 0xe6bd82;
    m = new THREE.MeshBasicMaterial({ color });
    graph.internals.corkMaterials.set(key, m);
  }
  return m;
}

function makeCork(graph: SceneGraph): THREE.Group {
  const g = new THREE.Group();
  g.name = 'cork';
  const body = new THREE.Mesh(graph.internals.corkGeo, corkMaterial(graph, 'standard', false));
  body.name = 'cork-body';
  const trail = new THREE.Mesh(
    graph.internals.trailGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  trail.name = 'cork-trail';
  trail.position.z = 0.1;
  g.add(body, trail);
  return g;
}

export interface FrameApplyResult {
  readonly created: number;
  readonly removed: number;
  readonly hidden: number;
  readonly flashes: number;
}

const Z_FORWARD = new THREE.Vector3(0, 0, -1);

export function applyFrame(graph: SceneGraph, frame: SimulationFrame): FrameApplyResult {
  const it = graph.internals;
  let created = 0;
  let removed = 0;
  let hidden = 0;

  // ---- prizes, keyed by instance id
  const seen = new Set<string>();
  for (const p of frame.prizes) {
    const id = p.instanceId as string;
    seen.add(id);
    let node = graph.prizes.get(id);
    if (!node || node.typeId !== p.typeId) {
      const spec = it.resolvePrize(p.typeId);
      const mesh = it.factory.createMesh(spec);
      mesh.name = `prize:${id}`;
      mesh.userData = { instanceId: id, typeId: p.typeId };
      const proxy = new THREE.Mesh(pickProxyGeometry(spec.shape, it.pickInflate), it.proxyMaterial);
      proxy.name = `pick:${id}`;
      if (node) {
        graph.prizeLayer.remove(node.mesh); // transformed: same individual, new look
        it.proxyLayer.remove(node.proxy);
        node.proxy.geometry.dispose();
        node.mesh = mesh;
        node.proxy = proxy;
        node.typeId = p.typeId;
      } else {
        node = { instanceId: id, typeId: p.typeId, mesh, proxy };
        graph.prizes.set(id, node);
        created++;
      }
      graph.prizeLayer.add(mesh);
      it.proxyLayer.add(proxy);
    }
    const m = node.mesh;
    m.position.set(p.position.x, p.position.y, p.position.z);
    m.quaternion.set(p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w);
    m.updateMatrixWorld(true);
    node.proxy.position.copy(m.position);
    node.proxy.quaternion.copy(m.quaternion);
    node.proxy.updateMatrixWorld(true);
    const show = !p.collected;
    if (!show && m.visible) hidden++;
    m.visible = show;
  }
  for (const [id, node] of graph.prizes) {
    if (!seen.has(id)) {
      graph.prizeLayer.remove(node.mesh);
      it.proxyLayer.remove(node.proxy);
      node.proxy.geometry.dispose();
      graph.prizes.delete(id);
      removed++;
    }
  }

  // ---- corks
  const live = new Set<string>();
  const dir = new THREE.Vector3();
  for (const pr of frame.projectiles) {
    const id = pr.projectileId as string;
    live.add(id);
    let g = graph.projectiles.get(id);
    if (!g) {
      g = makeCork(graph);
      graph.projectiles.set(id, g);
      graph.projectileLayer.add(g);
    }
    const powered = pr.powerMultiplier > 1;
    (g.children[0] as THREE.Mesh).material = corkMaterial(graph, pr.bulletType, powered);
    g.scale.setScalar(powered ? 1.35 : 1);
    g.position.set(pr.position.x, pr.position.y, pr.position.z);
    dir.set(pr.velocity.x, pr.velocity.y, pr.velocity.z);
    if (dir.lengthSq() > 1e-8) g.quaternion.setFromUnitVectors(Z_FORWARD, dir.normalize());
  }
  for (const [id, g] of graph.projectiles) {
    if (!live.has(id)) {
      graph.projectileLayer.remove(g);
      ((g.children[1] as THREE.Mesh).material as THREE.Material).dispose();
      graph.projectiles.delete(id);
    }
  }

  // ---- impact flashes (one tiny reaction per contact event; Task 12 extends)
  it.simTime = frame.simTimeSec;
  let flashes = 0;
  for (const ev of frame.events) {
    if (ev.type !== 'impact') continue;
    if (it.handledEvents.has(ev.eventId)) continue;
    it.handledEvents.add(ev.eventId);
    if (it.handledEvents.size > 1024) it.handledEvents.delete(it.handledEvents.values().next().value as string);
    const f = it.flashes.find((x) => !x.alive) ?? it.flashes.reduce((a, b) => (a.born <= b.born ? a : b));
    f.alive = true;
    f.born = frame.simTimeSec;
    f.material.color.setHex(flashColorFor(ev.target));
    f.mesh.position.set(ev.point.x + ev.normal.x * 0.01, ev.point.y + ev.normal.y * 0.01, ev.point.z + ev.normal.z * 0.01);
    flashes++;
  }
  for (const f of it.flashes) {
    if (!f.alive) continue;
    const t = (frame.simTimeSec - f.born) / FLASH_LIFE;
    if (t < 0 || t >= 1) {
      f.alive = false;
      f.mesh.visible = false;
      continue;
    }
    f.mesh.visible = true;
    f.mesh.scale.setScalar(0.012 + 0.04 * Math.sqrt(t));
    f.material.opacity = 1 - t;
  }

  return { created, removed, hidden, flashes };
}

// ------------------------------------------------------------------ aim / HUD

const GUN_PHASES = new Set(['position', 'loading', 'aiming']);

/** Place the gun and the 3D reticle for the effective aim. Returns the reticle ray result. */
export function updateAim(graph: SceneGraph, view: Pick<ViewState, 'phase' | 'standX' | 'effectiveAim'> & Partial<Pick<ViewState, 'ballistic'>>): ReticleResult {
  const { layout } = graph;
  graph.prizeLayer.updateMatrixWorld(true);
  graph.booth.proxies.updateMatrixWorld(true);
  const r = computeReticle(layout, view.standX, view.effectiveAim, graph.pickTargets(), 6, view.ballistic);

  const m = muzzlePosition(layout, view.standX);
  const dir = aimDirection(layout, view.standX, view.effectiveAim);
  graph.gun.position.set(m.x, m.y, m.z);
  graph.gun.quaternion.setFromUnitVectors(Z_FORWARD, dir);
  graph.gun.visible = GUN_PHASES.has(view.phase);

  graph.reticle.visible = view.phase === 'aiming';
  graph.reticle.position.copy(r.point);
  graph.reticle.scale.setScalar(Math.max(0.02, r.distance * 0.026));
  graph.reticle.lookAt(r.origin);
  return r;
}
