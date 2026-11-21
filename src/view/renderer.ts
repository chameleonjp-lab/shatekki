import { ShotReplayRecorder } from './shot-replay';
/**
 * WebGL renderer implementing the `Renderer` port (Task 11, owner: Visual).
 *
 * Portrait first, pixel ratio capped at 2, antialias on, no shadow maps.
 * The camera depends only on the stand position and canvas aspect: it never
 * follows sway. Everything drawn here is derived from the read-only frame
 * and view state; nothing is written back into the simulation.
 */
import * as THREE from 'three';
import type { BoothLayout, ExpansionCatalog, PresentOptions, PrizeTypeId, Renderer, RuntimeCatalog, ShotId, ShotSummary, SimulationFrame, ViewState } from '../contracts';
import { BOOTH_LAYOUT } from '../contracts';
import { applyCameraPose, cameraPose } from './camera';
import type { PrizeVisualSpec } from './prizes';
import { applyFrame, createSceneGraph, updateAim, type SceneGraph, type SceneStats } from './scene';
import type { ReticleResult } from './aim';
import type { ShotClass } from './classify';
import { createEffects, type Effects, type EffectsHud } from './effects';
import { createDomHud, type DomHud } from './hud';
import { createExpandedView, type ExpandedView, type ExpandedViewModel } from './expanded-view';
import { createExpandedOverlay, type ExpandedOverlay } from './expanded-overlay';
import { createStallEnvironment } from './materials/procedural-textures';
import { createShotFestival } from './shot-festival';

export interface ThreeRendererDeps {
  readonly resolvePrize: (typeId: PrizeTypeId) => PrizeVisualSpec;
  /** Defaults to BOOTH_LAYOUT. */
  readonly layout?: BoothLayout;
  /** Defaults to window.devicePixelRatio (capped at 2). */
  readonly pixelRatio?: number;
  /** Cork radius from the live tuning; reticle pick proxies are inflated by it. */
  readonly corkRadius?: number;
  /** Translates `fx.*` i18n keys for the off-screen arrows / chain banner (UI/QA's translator). */
  readonly translate?: (key: string, params?: Record<string, string | number>) => string;
  /** Replaces the default DOM HUD (tests). `false` disables it. */
  readonly hud?: EffectsHud | false;
  /**
   * Called from present(), after settlement, with the pure classification of the
   * confirmed summary. The app may play the miss / nearMiss UiCue from here so
   * it can never fire before the shot has settled (AC27).
   */
  readonly onSettled?: (cls: ShotClass, summary: ShotSummary) => void;
  /** Expanded rules only: cells, series outline and the FX093-FX100 hints. */
  readonly expanded?: ExpandedRendererDeps;
  /** Opt-in presentation for the r007 internal candidate. */
  readonly duskMaterials?: boolean;
}

/**
 * Layout-v2 / expanded gameplay presentation (plan EG07). Without it the
 * renderer behaves exactly as rules-v1 (it ignores `view.expansion`).
 */
export interface ExpandedRendererDeps {
  readonly illustratedRewards?: boolean;
  /** The bundle's catalog (prize motions, sets for the "one more kind" hint). */
  readonly catalog: RuntimeCatalog;
  readonly expansion: ExpansionCatalog;
  /** UI keys and `exp.*` content keys; see createExpansionTranslator in src/i18n/expansion-text.ts. */
  readonly translate: (key: string, params?: Readonly<Record<string, string | number>>) => string;
  /** Short kind name in the current language (prizeName from src/i18n/content). */
  readonly prizeName: (typeId: PrizeTypeId) => string;
}

export interface ThreeRenderer extends Renderer {
  readonly graph: SceneGraph;
  beginFestivalShot(shotId: ShotId, perfect: boolean): void;
  presentFestivalShot(summary: ShotSummary, freshSets: number, ammoBefore: number, quiet: boolean): void;
  clearFestival(): void;
  readonly shotReplay: ShotReplayRecorder | null;
  /** Reticle ray of the last render() (null before the first one). */
  lastReticle(): ReticleResult | null;
  /** What the expanded overlay showed in the last render() (null for rules-v1). */
  lastExpandedModel(): ExpandedViewModel | null;
  /** Scene triangle / mesh counts and WebGL draw calls of the last frame. */
  stats(): SceneStats & { drawCalls: number };
  /** r007: CSS-pixel position just above the shopkeeper's head in the last frame, or null when off screen. */
  projectShopkeeperHead(): { readonly x: number; readonly y: number } | null;
}

export function createThreeRenderer(canvas: HTMLCanvasElement, deps: ThreeRendererDeps): ThreeRenderer {
  const layout = deps.layout ?? BOOTH_LAYOUT;
  const webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const dpr = Math.min(2, deps.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1));
  webgl.setPixelRatio(dpr);
  webgl.shadowMap.enabled = false;
  webgl.outputColorSpace = THREE.SRGBColorSpace;

  const environment = deps.duskMaterials ? createStallEnvironment() : null;
  const graph = createSceneGraph({
    layout, illustratedRewards: deps.expanded?.illustratedRewards, resolvePrize: deps.resolvePrize,
    duskMaterials: deps.duskMaterials, prizeEnvironment: environment,
    ...(deps.corkRadius !== undefined ? { corkRadius: deps.corkRadius } : {}),
  });
  if (deps.duskMaterials) {
    webgl.toneMapping = THREE.ACESFilmicToneMapping;
    webgl.toneMappingExposure = 1.12;
    graph.scene.fog = new THREE.FogExp2(0x1b1020, 0.085);
  }
  const camera = new THREE.PerspectiveCamera(60, 0.5, 0.05, 30);
  let width = Math.max(1, canvas.clientWidth || 402);
  let height = Math.max(1, canvas.clientHeight || 874);
  webgl.setSize(width, height, false);
  let last: ReticleResult | null = null;
  let disposed = false;

  const domHud: DomHud | null = deps.hud === undefined ? createDomHud(canvas, deps.translate ? { translate: deps.translate } : {}) : null;
  const hud: EffectsHud | undefined = deps.hud === false ? undefined : (deps.hud ?? domHud ?? undefined);
  const fx: Effects = createEffects({
    layer: graph.effectsLayer,
    illustratedRewards: deps.expanded?.illustratedRewards,
    festival: deps.duskMaterials,
    layout,
    shopkeeperParts: graph.booth.shopkeeper,
    prizeObject: (id) => graph.prizes.get(id)?.mesh ?? null,
    projectilePosition: (id) => graph.projectiles.get(id)?.position ?? null,
    camera: () => camera,
    size: () => ({ width, height }),
    ...(hud ? { hud } : {}),
    ...(deps.onSettled ? { onClassified: deps.onSettled } : {}),
  });

  const expandedView: ExpandedView | null = deps.expanded
    ? createExpandedView({ graph, festival: deps.duskMaterials, illustratedRewards: deps.expanded.illustratedRewards, layout, catalog: deps.expanded.catalog, expansion: deps.expanded.expansion, translate: deps.expanded.translate, prizeName: deps.expanded.prizeName })
    : null;
  const expandedOverlay: ExpandedOverlay | null = expandedView && canvas.parentElement ? createExpandedOverlay(canvas.parentElement) : null;

  const festival = deps.duskMaterials
    ? createShotFestival(canvas, graph.effectsLayer, layout, graph.booth.group.getObjectByName('booth:washi'))
    : null;
  const shotReplay = festival ? new ShotReplayRecorder() : null;
  const reflections = new Map<string, number>();
  let festivalShot: ShotId | null = null;
  let perfect = false;
  let kickStart = -Infinity;
  const reduceMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: true };
  return {
    graph,
    shotReplay,
    beginFestivalShot(shotId, isPerfect) {
      festivalShot = shotId;
      shotReplay?.begin(shotId);
      perfect = isPerfect;
      reflections.clear();
      kickStart = -Infinity;
      festival?.begin(shotId, isPerfect && !reduceMotion.matches);
    },
    presentFestivalShot(summary, freshSets, ammoBefore, quiet) {
      shotReplay?.confirm(summary);
      const still = quiet || reduceMotion.matches;
      festival?.settle(summary, freshSets, ammoBefore, still);
      if (festival && !still) {
        const ids = (summary.effects ?? []).flatMap(effect => effect.source.kind === 'cell' &&
          effect.reason !== 'cellAlreadyUsed' && effect.reason !== 'unknownCell' ? [effect.source.cellId] : []);
        graph.cells?.celebrate(ids, performance.now() / 1_000);
        festival.showCellLinks(summary, camera, width, height, id => {
          const prize = graph.prizes.get(id)?.mesh;
          return prize?.visible ? prize.position : undefined;
        });
      }
    },
    clearFestival() {
      festivalShot = null;
      shotReplay?.clear();
      reflections.clear();
      festival?.clear();
      graph.cells?.clearCelebration();
    },
    render(frame: SimulationFrame, view: ViewState): void {
      if (disposed) return;
      shotReplay?.capture(frame);
      applyFrame(graph, frame);
      applyCameraPose(camera, cameraPose(layout, view.standX, width / height, view.aimFirst?.aim), width / height);
      last = updateAim(graph, view);
      if (expandedView) {
        const animationTime = festival && !view.paused && !reduceMotion.matches ? performance.now() / 1_000 : undefined;
        expandedOverlay?.render(expandedView.update(frame, view, camera, { width, height }, animationTime));
      }
      // r007: the shopkeeper's nod/blink, and a wrist flick when the cork hits the fan (view only;
      // the hit volumes never move). Wall time, so it also lives between shots.
      const keeper = graph.booth.keeperMotion;
      if (keeper) {
        const now = performance.now() / 1000;
        if (frame.events.some((e) => e.type === 'impact' && e.target.kind === 'shopkeeper' && e.target.part === 'fan')) keeper.flick(now);
        if (!reduceMotion.matches) keeper.idle(now);
      }
      if (festival && festivalShot) {
        const quiet = reduceMotion.matches || view.paused;
        const now = performance.now() / 1_000;
        for (const event of frame.events) {
          if (event.shotId !== festivalShot) continue;
          if (event.type === 'projectileSpawned' && event.parentId === null && !Number.isFinite(kickStart)) kickStart = now;
          if (event.type !== 'impact') continue;
          const old = reflections.get(event.projectileId) ?? 0;
          reflections.set(event.projectileId, Math.max(old, event.reflectionIndex + 1));
        }
        if (!quiet) for (const [id, cork] of graph.projectiles) {
          const trace = cork.children[1] as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
          const bounces = reflections.get(id) ?? 0;
          trace.material.toneMapped = false;
          trace.material.opacity = bounces || perfect ? 0.76 : 0.45;
          if (bounces >= 3) trace.material.color.setHSL((frame.simTimeSec * 3) % 1, .98, .68);
          else trace.material.color.setHex(bounces >= 2 || perfect ? 0xffcf54 : 0xdcf4ff);
          trace.scale.set(1.1 + .2 * Math.min(bounces, 3), 1.1, 1.2 + .45 * Math.min(bounces, 3));
        }
        const kick = (now - kickStart) / .12;
        if (!quiet && view.phase === 'resolving' && kick >= 0 && kick < 1) {
          graph.gun.visible = true;
          graph.gun.translateZ(.045 * Math.sin(kick * Math.PI));
        }
        festival.render(frame, camera, width, height, now, quiet);
      }
      fx.handleEvents(frame.events, frame.simTimeSec, { festival: !!festival && !reduceMotion.matches && !view.paused, perfect });
      fx.update(frame.simTimeSec);
      if (festival) graph.cells?.animate(performance.now() / 1_000, reduceMotion.matches || view.paused);
      webgl.render(graph.scene, camera);
    },
    present(summary: ShotSummary, options: PresentOptions): Promise<void> {
      // Settle effects. Skipping is presentation-only: it never changes what happened.
      if (deps.expanded?.illustratedRewards) expandedView?.showConfirmedTransforms(summary.appliedTransforms ?? [], !options.skip && !options.reducedMotion);
      return fx.present(summary, options);
    },
    resize(w: number, h: number): void {
      if (disposed) return;
      width = Math.max(1, Math.floor(w));
      height = Math.max(1, Math.floor(h));
      webgl.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      fx.dispose();
      festival?.dispose();
      expandedOverlay?.dispose();
      expandedView?.dispose();
      domHud?.dispose();
      graph.dispose();
      environment?.dispose();
      webgl.dispose();
    },
    lastReticle: () => last,
    lastExpandedModel: () => expandedView?.lastModel() ?? null,
    stats: () => ({ ...graph.stats(), drawCalls: webgl.info.render.calls }),
    projectShopkeeperHead() {
      const hat = layout.shopkeeper.find((p) => p.part === 'hat');
      if (!hat) return null;
      const v = new THREE.Vector3(hat.box.center.x, hat.box.center.y + hat.box.halfExtents.y + 0.04, hat.box.center.z).project(camera);
      if (v.z > 1 || v.x < -0.95 || v.x > 0.95 || v.y < -0.9 || v.y > 0.95) return null;
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + ((v.x + 1) / 2) * rect.width, y: rect.top + ((1 - v.y) / 2) * rect.height };
    },
  };
}
