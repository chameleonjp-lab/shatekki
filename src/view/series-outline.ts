/**
 * Series outline (D35, requirements §7.2, effects appendix §3.4, FX061-FX080).
 *
 * Every shelf individual whose CURRENT kind belongs to the shown series gets an
 * outline in the series colour (an inverted hull behind the prize, so the prize
 * itself is never repainted and nothing blinks). The same colour is always
 * paired with the series symbol and label (legend + a small symbol badge), so
 * the meaning never rests on colour alone. Internal SER ids are never shown.
 *
 * The outline follows the live frame: refilled and transformed individuals are
 * picked up on the next render, collected ones drop out. Off-screen individuals
 * are outlined too (they are in the scene regardless of the camera).
 * Presentation only: nothing here collects, scores or completes a set.
 */
import * as THREE from 'three';
import type { PrizeFrame, SeriesDef, SeriesId } from '../contracts';
import type { SceneGraph } from './scene';

/** Instance ids of the uncollected individuals whose current kind is in the series. */
export function seriesOutlineTargets(prizes: readonly PrizeFrame[], series: Pick<SeriesDef, 'typeIds'> | undefined | null): string[] {
  if (!series) return [];
  const members = new Set<string>(series.typeIds as readonly string[]);
  return prizes.filter((p) => !p.collected && members.has(p.typeId as string)).map((p) => p.instanceId as string);
}

export interface SeriesLegend {
  readonly seriesId: SeriesId;
  /** "#RRGGBB" */
  readonly color: string;
  /** Shared mark, e.g. "[菓]". Falls back to nothing (label still shown) when no symbol text exists. */
  readonly symbol: string;
  /** Series name in the current language (never an internal id). */
  readonly label: string;
  readonly targetCount: number;
  /** No individual matches right now: show "対象の景品は今はありません". */
  readonly empty: boolean;
}

/** `text(key)` returns the display text; a result equal to the key counts as missing. */
export type TextFn = (key: string) => string;

export function readText(text: TextFn, key: string): string {
  const v = text(key);
  return v && v !== key ? v : '';
}

export function seriesLegend(series: SeriesDef | undefined | null, targetCount: number, text: TextFn): SeriesLegend | null {
  if (!series) return null;
  return {
    seriesId: series.seriesId,
    color: series.color,
    symbol: readText(text, series.symbolKey),
    label: readText(text, series.labelKey),
    targetCount,
    empty: targetCount === 0,
  };
}

const HULL_SCALE = 1.09;

interface OutlineNode {
  mesh: THREE.Mesh;
  source: THREE.Mesh;
  color: string;
}

export interface SeriesOutline {
  /** Brings the outlines in line with the frame; returns the targeted individuals. */
  update(prizes: readonly PrizeFrame[], outlineSeries: SeriesId | null): string[];
  /** Outline meshes currently shown, by instance id (tests / browser checks). */
  active(): ReadonlyMap<string, THREE.Mesh>;
  dispose(): void;
}

export function createSeriesOutline(graph: SceneGraph, series: ReadonlyMap<SeriesId, SeriesDef>): SeriesOutline {
  const layer = new THREE.Group();
  layer.name = 'series-outline';
  graph.scene.add(layer);
  const materials = new Map<string, THREE.MeshBasicMaterial>();
  const nodes = new Map<string, OutlineNode>();

  const material = (color: string): THREE.MeshBasicMaterial => {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), side: THREE.BackSide, fog: false });
      materials.set(color, m);
    }
    return m;
  };
  const drop = (id: string): void => {
    const n = nodes.get(id);
    if (!n) return;
    layer.remove(n.mesh);
    nodes.delete(id);
  };

  return {
    update(prizes, outlineSeries) {
      const def = outlineSeries ? series.get(outlineSeries) : undefined;
      const targets = seriesOutlineTargets(prizes, def);
      const want = new Set(targets);
      for (const id of [...nodes.keys()]) if (!want.has(id)) drop(id);
      for (const id of targets) {
        const src = graph.prizes.get(id)?.mesh;
        if (!src || !def) continue;
        let n = nodes.get(id);
        // a transformed individual got a new mesh/geometry: rebuild its outline
        if (n && (n.source !== src || n.color !== def.color)) {
          drop(id);
          n = undefined;
        }
        if (!n) {
          const mesh = new THREE.Mesh(src.geometry, material(def.color));
          mesh.name = `outline:${id}`;
          mesh.renderOrder = -1;
          layer.add(mesh);
          n = { mesh, source: src, color: def.color };
          nodes.set(id, n);
        }
        n.mesh.position.copy(src.position);
        n.mesh.quaternion.copy(src.quaternion);
        n.mesh.scale.setScalar(HULL_SCALE);
        n.mesh.visible = src.visible;
      }
      return targets;
    },
    active() {
      return new Map([...nodes].map(([id, n]) => [id, n.mesh]));
    },
    dispose() {
      for (const id of [...nodes.keys()]) drop(id);
      for (const m of materials.values()) m.dispose();
      materials.clear();
      graph.scene.remove(layer);
    },
  };
}
