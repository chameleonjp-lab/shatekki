/**
 * Expanded-gameplay presentation (plan EG07): background cells, series outline
 * and the FX093-FX100 hints, driven by the read-only SimulationFrame + ViewState.
 *
 * Contract: this never steps the game, never consumes RNG, never creates
 * commands and never writes into the simulation. `update()` is a pure function
 * of (frame, view) plus a little drawing memory (the FX099 trail record and
 * the first kind each mounted individual was seen as, for FX097).
 *
 * rules-v1 (no `view.expansion`) draws nothing here.
 */
import * as THREE from 'three';
import type { BoothLayout, ExpansionCatalog, HintKind, MotionSpec, PrizeFrame, PrizeTypeId, RuntimeCatalog, SimulationFrame, Vec3, ViewState } from '../contracts';
import type { SceneGraph } from './scene';
import { angleReadout, computeHintLabels, signedDeg, TrajectoryRecorder, type AngleReadout, type HintLabel, type HintTone } from './gameplay-hints';
import { createHint3D, CORK_COLORS, type Hint3D } from './hint-3d';
import { createSeriesOutline, seriesLegend, type SeriesLegend, type SeriesOutline } from './series-outline';
import { createRewardProps } from './reward-props';

export type Translate = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface ExpandedViewDeps {
  readonly graph: SceneGraph;
  readonly layout: BoothLayout;
  readonly catalog: RuntimeCatalog;
  readonly expansion: ExpansionCatalog;
  /** UI keys and `exp.*` content keys (src/i18n/expansion-text.ts createExpansionTranslator). */
  readonly translate: Translate;
  /** Short display name of a kind in the current language. */
  readonly prizeName: (typeId: PrizeTypeId) => string;
}

export interface ScreenLabel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly tone: HintTone | 'badge' | 'guide' | 'cork';
  /** "#RRGGBB" for series badges and cork numbers. */
  readonly color?: string;
}

export interface SeriesRow {
  readonly color: string;
  readonly symbol: string;
  readonly label: string;
}

export interface ExpandedViewModel {
  /** Outline series legend (colour + symbol + label) and whether anything matches. */
  readonly outline: SeriesLegend | null;
  /** Refill series after FX041-FX060. */
  readonly assortment: SeriesRow | null;
  readonly hint: HintKind | null;
  readonly hintTitle: string;
  /** The hint applies but no individual matches. */
  readonly hintEmpty: boolean;
  readonly noTargetText: string;
  readonly badges: readonly ScreenLabel[];
  readonly labels: readonly ScreenLabel[];
  readonly corks: readonly ScreenLabel[];
  readonly aim: ScreenLabel | null;
  readonly angle: { readonly readout: AngleReadout; readonly text: string } | null;
  /** Rewards (r002+): "+2" on the bag, the ring values on the target. */
  readonly rewardLabels: readonly ScreenLabel[];
  /** Counts for tests and diagnostics. */
  readonly stats: { readonly outlined: number; readonly dashes: number; readonly trailSegments: number; readonly rings: number };
}

export interface ExpandedView {
  update(frame: SimulationFrame, view: ViewState, camera: THREE.Camera, size: { width: number; height: number }): ExpandedViewModel | null;
  lastModel(): ExpandedViewModel | null;
  dispose(): void;
}

const PHASES_WITH_AIM_GUIDE = new Set(['position', 'loading', 'aiming']);
const MARGIN = 1.08;

const v4 = new THREE.Vector4();
export function projectToScreen(camera: THREE.Camera, p: Vec3, width: number, height: number): { x: number; y: number } | null {
  v4.set(p.x, p.y, p.z, 1).applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
  if (v4.w <= 1e-6) return null;
  const nx = v4.x / v4.w;
  const ny = v4.y / v4.w;
  if (Math.abs(nx) > MARGIN || Math.abs(ny) > MARGIN || v4.z / v4.w > 1) return null;
  return { x: ((nx + 1) / 2) * width, y: ((1 - ny) / 2) * height };
}

export function createExpandedView(deps: ExpandedViewDeps): ExpandedView {
  const { graph, layout, catalog, expansion, translate } = deps;
  const outline: SeriesOutline = createSeriesOutline(graph, expansion.series);
  const hint3d: Hint3D = createHint3D();
  graph.scene.add(hint3d.group);
  const recorder = new TrajectoryRecorder();
  const rewardProps = createRewardProps();
  graph.scene.add(rewardProps.group);
  /** P4: price tags on prizes whose kind really changed, for a few seconds of simulation time. */
  const changed = new Map<string, { readonly toTypeId: PrizeTypeId; readonly untilSec: number }>();
  const TAG_SEC = 3;
  /** First kind each individual was seen as: the mount keeps running that kind's motion after a transform. */
  const firstKind = new Map<string, PrizeTypeId>();
  let last: ExpandedViewModel | null = null;

  const text: (key: string) => string = (key) => translate(key);
  const ui = (key: string, params?: Readonly<Record<string, string | number>>) => translate(key, params);

  const motionOf = (instanceId: string, current: PrizeTypeId): MotionSpec | null => {
    const kind = firstKind.get(instanceId) ?? current;
    return catalog.prizes.get(kind)?.motion ?? null;
  };

  const model = (frame: SimulationFrame, view: ViewState, camera: THREE.Camera, size: { width: number; height: number }): ExpandedViewModel | null => {
    const ex = view.expansion;
    if (!ex) return null;
    graph.cells?.update(ex.cells);

    // ---- series outline + legend
    const targets = outline.update(frame.prizes, ex.outlineSeries);
    const outlineDef = ex.outlineSeries ? expansion.series.get(ex.outlineSeries) : undefined;
    const legend = seriesLegend(outlineDef, targets.length, text);
    const assortDef = ex.assortmentSeries ? expansion.series.get(ex.assortmentSeries) : undefined;
    const assortLegend = seriesLegend(assortDef, 0, text);
    const assortment: SeriesRow | null = assortLegend ? { color: assortLegend.color, symbol: assortLegend.symbol, label: assortLegend.label } : null;

    const byId = new Map<string, PrizeFrame>(frame.prizes.map((p) => [p.instanceId as string, p]));
    const badges: ScreenLabel[] = [];
    if (legend) {
      for (const id of targets) {
        const p = byId.get(id);
        if (!p) continue;
        const s = projectToScreen(camera, p.position, size.width, size.height);
        if (s) badges.push({ id: `badge:${id}`, x: s.x, y: s.y, text: legend.symbol || legend.label.slice(0, 2), tone: 'badge', color: legend.color });
      }
    }

    // ---- the kind whose motion each mount really runs (FX097): the sim reports it after a transform
    const present = new Set<string>();
    for (const p of frame.prizes) {
      const id = p.instanceId as string;
      present.add(id);
      firstKind.set(id, p.motionTypeId ?? p.typeId);
    }
    for (const id of [...firstKind.keys()]) if (!present.has(id)) firstKind.delete(id);

    // ---- one hint at a time
    const hint = ex.hint;
    const labels: ScreenLabel[] = [];
    let hintEmpty = false;
    let aim: ScreenLabel | null = null;
    let angle: ExpandedViewModel['angle'] = null;
    const corks: ScreenLabel[] = [];
    let dashes = 0;
    let segments = 0;
    let rings = 0;
    const guidePhase = PHASES_WITH_AIM_GUIDE.has(view.phase);

    if (hint === 'trajectory') {
      recorder.observe(frame);
      const r = hint3d.setTracks(recorder.tracks());
      segments = r.segments;
      rings = r.rings;
      for (const t of recorder.tracks()) {
        const head = t.points[t.points.length - 1];
        if (!head) continue;
        const s = projectToScreen(camera, head, size.width, size.height);
        if (s) corks.push({ id: `cork:${t.projectileId}`, x: s.x, y: s.y, text: String(t.number), tone: 'cork', color: `#${CORK_COLORS[(t.number - 1) % CORK_COLORS.length]!.toString(16).padStart(6, '0')}` });
      }
    } else {
      if (recorder.tracks().length > 0) recorder.reset();
      hint3d.setTracks(null);
    }

    if (hint === 'aimPreview' && ex.aimPreview && guidePhase) {
      dashes = hint3d.setAimPreview(ex.aimPreview.points);
      const end = ex.aimPreview.points[ex.aimPreview.points.length - 1];
      const s = end ? projectToScreen(camera, end, size.width, size.height) : null;
      if (s) aim = { id: 'aim-guide', x: s.x, y: s.y, text: ui('xhint.aim'), tone: 'guide' };
    } else {
      hint3d.setAimPreview(null);
    }

    if (hint === 'angleTicks' && guidePhase) {
      const readout = angleReadout(layout, view.standX, view.effectiveAim);
      angle = { readout, text: ui('xhint.angle', { yaw: signedDeg(readout.yawDeg), pitch: signedDeg(readout.pitchDeg) }) };
    }

    if (hint) {
      const res = computeHintLabels(hint, {
        prizes: frame.prizes,
        sets: catalog.sets,
        collectedTypeIds: ex.collectedTypeIds,
        completedSets: ex.completedSets,
        nameOf: deps.prizeName,
        motionOf,
      });
      if (res) {
        hintEmpty = res.empty;
        for (const l of res.labels) {
          const s = projectToScreen(camera, l.position, size.width, size.height);
          if (s) labels.push(toScreen(l, s, ui));
        }
      }
    }

    // ---- rewards: the bag on its prize and the last-shot target (display only)
    const placed = rewardProps.update(ex.rewards, frame.prizes);
    const rewardLabels: ScreenLabel[] = [];
    if (placed.bag && ex.rewards) {
      const s = projectToScreen(camera, placed.bag, size.width, size.height);
      if (s) rewardLabels.push({ id: 'reward:bag', x: s.x, y: s.y, text: ui('reward.bag.label', { n: ex.rewards.bagOffer }), tone: 'badge', color: '#d9a441' });
    }
    if (ex.rewards) {
      for (const e of frame.events) if (e.type === 'prizeTransformed') changed.set(e.instanceId, { toTypeId: e.toTypeId, untilSec: frame.simTimeSec + TAG_SEC });
      for (const [id, c] of [...changed]) {
        const p = byId.get(id);
        if (!p || frame.simTimeSec > c.untilSec) {
          if (frame.simTimeSec > c.untilSec) changed.delete(id);
          continue;
        }
        const s = projectToScreen(camera, p.position, size.width, size.height);
        if (s) rewardLabels.push({ id: `reward:tag:${id}`, x: s.x, y: s.y, text: ui('reward.tag.changed', { name: deps.prizeName(c.toTypeId) }), tone: 'badge', color: '#ffe9a8' });
      }
    }
    if (placed.target && ex.rewards?.target) {
      const s = projectToScreen(camera, placed.target, size.width, size.height);
      const o = ex.rewards.target.offered;
      if (s) rewardLabels.push({ id: `reward:target:${placed.targetMode}`, x: s.x, y: s.y, text: ui('reward.target.label', { center: o.center, outer: o.outer }), tone: 'badge', color: '#c8372d' });
    }

    hint3d.faceCamera(camera);
    return {
      rewardLabels,
      outline: legend,
      assortment,
      hint,
      hintTitle: hint ? ui(`xhint.title.${hint}`) : '',
      hintEmpty,
      noTargetText: ui('series.noTarget'),
      badges,
      labels,
      corks,
      aim,
      angle,
      stats: { outlined: targets.length, dashes, trailSegments: segments, rings },
    };
  };

  return {
    update(frame, view, camera, size) {
      last = model(frame, view, camera, size);
      if (!view.expansion) {
        outline.update([], null);
        hint3d.setAimPreview(null);
        hint3d.setTracks(null);
      }
      return last;
    },
    lastModel: () => last,
    dispose() {
      graph.scene.remove(rewardProps.group);
      rewardProps.dispose();
      outline.dispose();
      graph.scene.remove(hint3d.group);
      hint3d.dispose();
    },
  };
}

function toScreen(l: HintLabel, s: { x: number; y: number }, ui: Translate): ScreenLabel {
  return { id: `hint:${l.instanceId}`, x: s.x, y: s.y, text: ui(l.key, l.params), tone: l.tone };
}

