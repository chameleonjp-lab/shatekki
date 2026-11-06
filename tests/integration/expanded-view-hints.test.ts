import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  BOOTH_LAYOUT_V2,
  CELL_IDS_V2,
  IDENTITY_QUAT,
  mintId,
  type HintKind,
  type PrizeFrame,
  type PrizeTypeId,
  type SeriesId,
  type SimulationFrame,
  type ViewState,
} from '../../src/contracts';
import { applyCameraPose, applyFrame, cameraPose, createExpandedView, createSceneGraph } from '../../src/view';
import { createExpansionTranslator } from '../../src/i18n/expansion-text';
import { translate } from '../../src/i18n';
import { prizeName } from '../../src/i18n/content';

const bundle = getGameplayBundle('expanded-proposed');
const L = BOOTH_LAYOUT_V2;
const exp = bundle.expansion!;
const resolvePrize = (typeId: PrizeTypeId) => {
  const p = bundle.catalog.prizes.get(typeId)!;
  return { shape: p.shape, modelKey: p.modelKey, material: p.material };
};
const ser = (n: string) => n as SeriesId;
const tr = createExpansionTranslator(
  () => 'ja',
  (k, p) => translate('ja', k as never, p),
);

function pf(n: number, typeNo: number, x: number, y: number, z: number): PrizeFrame {
  return { instanceId: mintId.instance(n), typeId: `P${String(typeNo).padStart(3, '0')}` as PrizeTypeId, position: { x, y, z }, rotation: IDENTITY_QUAT, hp: 3, maxHp: 3, mounted: true, collected: false };
}
const frame = (prizes: PrizeFrame[], extra: Partial<SimulationFrame> = {}): SimulationFrame => ({ simTimeSec: 0, shotId: null, stage: null, prizes, projectiles: [], events: [], ...extra });

const size = { width: 402, height: 874 };
function mk() {
  const graph = createSceneGraph({ layout: L, resolvePrize });
  const view = createExpandedView({ graph, layout: L, catalog: bundle.catalog, expansion: exp, translate: tr, prizeName: (t) => prizeName('ja', t) });
  const cam = new THREE.PerspectiveCamera(60, size.width / size.height, 0.05, 30);
  applyCameraPose(cam, cameraPose(L, 0, size.width / size.height), size.width / size.height);
  return { graph, view, cam };
}
function vs(over: Partial<NonNullable<ViewState['expansion']>> = {}): ViewState {
  return {
    phase: 'aiming',
    standX: 0,
    effectiveAim: { yaw: 0, pitch: 0 },
    loadingBar: null,
    paused: false,
    ballistic: { speed: 11, gravity: 5.9, fixedStepSec: 1 / 120, bulletType: 'standard', corkRadius: 0.011 },
    expansion: {
      cells: CELL_IDS_V2.map((cellId, i) => ({ cellId, used: i === 3, effectId: null })),
      outlineSeries: null,
      assortmentSeries: null,
      collectedTypeIds: [],
      completedSets: [],
      hint: null,
      aimPreview: null,
      question: null,
      ...over,
    },
  };
}
const prizes = () => [pf(1, 1, 0, 1.2, -1.92), pf(2, 13, 0.42, 1.2, -1.92), pf(3, 1, 2.31, 0.86, -1.75)];

describe('expanded view: cells, outline and hints from frame + view state only', () => {
  it('outlines every member of the series by its CURRENT kind (also off-screen) and follows a transform', () => {
    const { graph, view, cam } = mk();
    const f1 = frame(prizes());
    applyFrame(graph, f1);
    const m1 = view.update(f1, vs({ outlineSeries: ser('SER01') }), cam, size)!;
    expect(m1.stats.outlined).toBe(2);
    expect(m1.outline).toMatchObject({ color: '#F28C28', symbol: '[菓]', label: 'お菓子屋さん', empty: false });
    expect(m1.badges).toHaveLength(1); // the far one is outlined but off-screen
    expect(m1.badges[0]!.text).toBe('[菓]');
    expect(graph.scene.getObjectByName('series-outline')!.children).toHaveLength(2);
    expect(JSON.stringify(m1)).not.toMatch(/SER\d\d/);

    const f2 = frame([pf(1, 13, 0, 1.2, -1.92), pf(2, 2, 0.42, 1.2, -1.92), pf(3, 1, 2.31, 0.86, -1.75)]);
    applyFrame(graph, f2);
    const m2 = view.update(f2, vs({ outlineSeries: ser('SER01') }), cam, size)!;
    expect(m2.stats.outlined).toBe(2);
    expect(graph.scene.getObjectByName('series-outline')!.children.map((c) => c.name).sort()).toEqual(['outline:i0002', 'outline:i0003']);
    view.dispose();
    graph.dispose();
  });

  it('says so when nothing matches, and clears the outline when the series is removed', () => {
    const { graph, view, cam } = mk();
    const f = frame([pf(1, 13, 0, 1.2, -1.92)]);
    applyFrame(graph, f);
    const m = view.update(f, vs({ outlineSeries: ser('SER12') }), cam, size)!;
    expect(m.outline!.empty).toBe(true);
    expect(m.noTargetText).toBe('対象の景品は今はありません');
    const off = view.update(f, vs({ outlineSeries: null }), cam, size)!;
    expect(off.outline).toBeNull();
    expect(graph.scene.getObjectByName('series-outline')!.children).toHaveLength(0);
    view.dispose();
    graph.dispose();
  });

  it('draws used cells from the view state and shows the refill series in the legend', () => {
    const { graph, view, cam } = mk();
    const m = view.update(frame([]), vs({ assortmentSeries: ser('SER03') }), cam, size)!;
    expect(graph.cells!.states().get('cell-r1-c04')).toBe('used');
    expect(graph.cells!.states().get('cell-r1-c05')).toBe('unused');
    expect(m.assortment).toMatchObject({ color: '#EE6252', label: '夏祭り' });
    view.dispose();
    graph.dispose();
  });

  it('shows one hint at a time with a translated title; rules-v1 view state draws nothing', () => {
    const { graph, view, cam } = mk();
    const f = frame(prizes());
    applyFrame(graph, f);
    const kinds: HintKind[] = ['hpRatio', 'oneMissing', 'notCollectedThisRun', 'duplicates', 'motionPeriod', 'aimPreview', 'trajectory', 'angleTicks'];
    for (const k of kinds) {
      const m = view.update(f, vs({ hint: k }), cam, size)!;
      expect(m.hint).toBe(k);
      expect(m.hintTitle.length).toBeGreaterThan(0);
      expect(m.hintTitle).not.toMatch(/^xhint\./);
    }
    expect(view.update(f, vs({ hint: 'hpRatio' }), cam, size)!.labels.map((l) => l.text)).toContain('耐久 100%');
    expect(view.update(f, vs({ hint: 'angleTicks' }), cam, size)!.angle!.text).toMatch(/^左右 [+-]?\d+°／上下 [+-]?\d+°$/);
    const prev = { points: [{ x: 0, y: 1.25, z: -0.3 }, { x: 0, y: 1.2, z: -1.9 }], firstHitTargetId: null, approximate: true as const };
    const aim = view.update(f, vs({ hint: 'aimPreview', aimPreview: prev }), cam, size)!;
    expect(aim.stats.dashes).toBeGreaterThan(5);
    expect(aim.aim!.text).toBe('目安');
    const none = view.update(f, vs({ hint: null }), cam, size)!;
    expect(none.stats.dashes).toBe(0);
    expect(none.labels).toEqual([]);
    expect(view.update(f, { ...vs(), expansion: undefined }, cam, size)).toBeNull();
    view.dispose();
    graph.dispose();
  });

  it('records real corks only while FX099 is the hint, numbered and with trails', () => {
    const { graph, view, cam } = mk();
    const shot = mintId.shot(1);
    const c = (n: number, x: number) => ({ projectileId: mintId.projectile(shot, n), position: { x, y: 1.2, z: -1 }, velocity: { x: 0, y: 0, z: -8 }, bulletType: 'standard' as const, powerMultiplier: 1 });
    const f = (x: number): SimulationFrame => frame([], { simTimeSec: x, shotId: shot, projectiles: [c(0, x), c(1, x + 0.1)] });
    for (let i = 0; i < 5; i++) view.update(f(i * 0.05), vs({ hint: 'trajectory' }), cam, size);
    const m = view.update(f(0.3), vs({ hint: 'trajectory' }), cam, size)!;
    expect(m.stats.trailSegments).toBeGreaterThan(4);
    expect(m.corks.map((x) => x.text)).toEqual(['1', '2']);
    const off = view.update(f(0.35), vs({ hint: 'hpRatio' }), cam, size)!;
    expect(off.stats.trailSegments).toBe(0);
    view.dispose();
    graph.dispose();
  });
});
