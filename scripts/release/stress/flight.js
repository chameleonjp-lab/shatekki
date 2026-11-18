import { BASE_SHOT_MODIFIERS, aimDirection, ballisticForModifiers, mintId, muzzlePosition } from '../../../src/contracts';
import { createExpandedRun } from '../../../src/core/expanded-run';
import { rewardViewState } from '../../../src/core/rewards';

export function flightFixture({ bundle, renderer, makeWorld, updateMap }) {
  const { catalog, tuning, layout, expansion } = bundle;
  const seed = 5;
  const run = createExpandedRun({ runId: mintId.run('stress'), seed, tuning, playerName: null }, { catalog, tuning, layout, expansion });
  const modifiers = { ...BASE_SHOT_MODIFIERS, bulletType: 'bouncy', launch: { count: 3, spreadRad: 0.035 } };
  const aim = { yaw: 0, pitch: 0.14 };
  const outline = [...expansion.series.values()].find(series => series.typeIds.includes(run.shelf.prizes[0].typeId));
  const view = {
    phase: 'resolving', standX: 0, effectiveAim: aim, loadingBar: null, paused: false,
    ballistic: ballisticForModifiers(tuning, 'bouncy', modifiers),
    expansion: {
      cells: run.expansion.cells.map(cell => ({ cellId: cell.cellId, used: false, effectId: null })),
      outlineSeries: outline.seriesId, assortmentSeries: null, collectedTypeIds: [], completedSets: [],
      hint: 'trajectory', aimPreview: null, question: null, rewards: rewardViewState(run, expansion.profile.rewards, layout, tuning),
    },
  };
  let world;
  let observed = null;
  return {
    title: 'コルク8個の負荷試験',
    explanation: '試験用に8個を同時に発射します。同じ寸法の飛行が縦向きで合計60秒になるまで繰り返します。',
    mode: '独立した8個の負荷試験', scene: '試験飛行 景品36 マス36 コルク8', seed,
    async begin(trial) {
      world = await makeWorld();
      world.syncShelf(run.shelf, 0);
      world.fire({
        shotId: mintId.shot(trial), origin: muzzlePosition(layout, 0), direction: aimDirection(layout, 0, aim), bulletType: 'bouncy',
        load: { barValue: .85, tier: 'perfect', damageMultiplier: 1.5, pushMultiplier: 1.35 },
      }, { runId: run.runId, chooseTransform: () => null,
        expanded: { modifiers, usableCells: run.expansion.cells.map(cell => cell.cellId), rewards: true } });
      const frame = world.frame();
      if (frame.projectiles.length !== 8) throw Error('試験用のコルク8個を生成できませんでした。');
      renderer.render(frame, view);
    },
    draw(dt, time) {
      const { frame } = world.step(dt);
      renderer.render(frame, view);
      updateMap(time, frame, view);
      const { graph } = renderer;
      const full = frame.stage === 'flight' && frame.projectiles.length === 8 && graph.projectiles.size === 8 &&
        frame.prizes.filter(prize => !prize.collected).length === 36 &&
        [...graph.prizes.values()].filter(prize => prize.mesh.visible).length === 36 && graph.cells.cellCount === 36;
      if (!full) return false;
      const { outlined, trailSegments } = renderer.lastExpandedModel().stats;
      observed = { physicsCorks: frame.projectiles.length, renderedCorks: graph.projectiles.size,
        prizes: graph.prizes.size, cells: graph.cells.cellCount, outlined, maxTrailSegments: Math.max(observed?.maxTrailSegments ?? 0, trailSegments) };
      return true;
    },
    end() { world?.dispose(); world = null; },
    observation() { return observed; },
  };
}
