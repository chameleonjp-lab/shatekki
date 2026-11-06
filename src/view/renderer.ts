/**
 * WebGL renderer implementing the `Renderer` port (Task 11, owner: Visual).
 *
 * Portrait first, pixel ratio capped at 2, antialias on, no shadow maps.
 * The camera depends only on the stand position and canvas aspect: it never
 * follows sway. Everything drawn here is derived from the read-only frame
 * and view state; nothing is written back into the simulation.
 */
import * as THREE from 'three';
import type { BoothLayout, PresentOptions, PrizeTypeId, Renderer, ShotSummary, SimulationFrame, ViewState } from '../contracts';
import { BOOTH_LAYOUT } from '../contracts';
import { applyCameraPose, cameraPose } from './camera';
import type { PrizeVisualSpec } from './prizes';
import { applyFrame, createSceneGraph, updateAim, type SceneGraph, type SceneStats } from './scene';
import type { ReticleResult } from './aim';
import type { ShotClass } from './classify';
import { createEffects, type Effects, type EffectsHud } from './effects';
import { createDomHud, type DomHud } from './hud';

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
}

export interface ThreeRenderer extends Renderer {
  readonly graph: SceneGraph;
  /** Reticle ray of the last render() (null before the first one). */
  lastReticle(): ReticleResult | null;
  /** Scene triangle / mesh counts and WebGL draw calls of the last frame. */
  stats(): SceneStats & { drawCalls: number };
}

export function createThreeRenderer(canvas: HTMLCanvasElement, deps: ThreeRendererDeps): ThreeRenderer {
  const layout = deps.layout ?? BOOTH_LAYOUT;
  const webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const dpr = Math.min(2, deps.pixelRatio ?? (typeof window !== 'undefined' ? window.devicePixelRatio : 1));
  webgl.setPixelRatio(dpr);
  webgl.shadowMap.enabled = false;
  webgl.outputColorSpace = THREE.SRGBColorSpace;

  const graph = createSceneGraph({ layout, resolvePrize: deps.resolvePrize, ...(deps.corkRadius !== undefined ? { corkRadius: deps.corkRadius } : {}) });
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
    layout,
    shopkeeperParts: graph.booth.shopkeeper,
    prizeObject: (id) => graph.prizes.get(id)?.mesh ?? null,
    projectilePosition: (id) => graph.projectiles.get(id)?.position ?? null,
    camera: () => camera,
    size: () => ({ width, height }),
    ...(hud ? { hud } : {}),
    ...(deps.onSettled ? { onClassified: deps.onSettled } : {}),
  });

  return {
    graph,
    render(frame: SimulationFrame, view: ViewState): void {
      if (disposed) return;
      applyFrame(graph, frame);
      applyCameraPose(camera, cameraPose(layout, view.standX, width / height), width / height);
      last = updateAim(graph, view);
      fx.handleEvents(frame.events, frame.simTimeSec);
      fx.update(frame.simTimeSec);
      webgl.render(graph.scene, camera);
    },
    present(summary: ShotSummary, options: PresentOptions): Promise<void> {
      // Settle effects. Skipping is presentation-only: it never changes what happened.
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
      domHud?.dispose();
      graph.dispose();
      webgl.dispose();
    },
    lastReticle: () => last,
    stats: () => ({ ...graph.stats(), drawCalls: webgl.info.render.calls }),
  };
}
