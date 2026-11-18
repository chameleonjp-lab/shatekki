import { GameController } from '../../../src/app/controller';
import { CORE_RULES } from '../../../src/app/rules';
import { expandedLine } from '../../../src/i18n/expanded-content';
import { mountEffectResults } from '../../../src/ui/effect-results';
import { mountRewardPanel } from '../../../src/ui/reward-panel';
import { setDisplayName } from '../../../src/ui/set-book';
import { mountRewardMotions } from '../../../src/view/reward-motions';
import { settlementMs, visibleHeavyCard } from '../preview-intervals.js';

export async function settlementFixture({ bundle, renderer, makeWorld, updateMap, ui, t, prizeName }) {
  const response = await fetch('./confirmed-shot.json');
  if (!response.ok) throw Error('精算の再現記録を読み込めませんでした。');
  const { seed, state, summary, ammoBeforeShot } = await response.json();
  if (state.rulesVersion !== bundle.catalog.rulesVersion || summary.chainCount < 2 || !summary.newlyCompletedSets.length) {
    throw Error('この版の多獲得と初発見を確認できませんでした。');
  }
  const effects = mountEffectResults(ui, { t, line: key => expandedLine('ja', key) });
  const panel = mountRewardPanel(ui, { t, prizeName, onOrder: () => false });
  // Each trial uses the same real post-shot shelf and the candidate's normal renderer,
  // card and animation. This page never dispatches a command or opens a repository.
  const world = await makeWorld();
  let controller, motion, started, observed = null;
  let at = 0;
  return {
    title: '精算直後の再現試験',
    explanation: '第18射で景品2個を獲得し、2組を初発見した場面を繰り返します。札が見える最初の0.9秒を、同じ寸法で合計60秒まで測ります。',
    mode: '確定した精算の演出再現', scene: '再現精算 多獲得・初発見・複数札', seed,
    begin() {
      const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
      controller = new GameController({ ...bundle, world, renderer, rules: CORE_RULES, clockPolicy: bundle.behavior.clock,
        onChange(snap) {
          updateMap(at, snap.frame, snap.view);
          panel.update(snap.view.expansion.rewards, bundle.expansion.profile.rewards.order);
        },
      }, state);
      renderer.render(world.frame(), controller.viewState());
      motion = mountRewardMotions(ui, {
        cue() {}, // This isolated rendering test is silent. Sound is observed in normal play.
        card(input, event) {
          effects.show(summary);
          panel.showShot({ ...input, collectedPrizes: summary.collected, staticCard: event.reducedMotion,
            setName: id => setDisplayName('ja', id, t), setMembers: id => bundle.catalog.sets.get(id).requiredTypeIds });
        },
      });
      started = performance.now();
      motion.presentRewardMotion({ kind: 'shot', runId: summary.runId, shotId: summary.shotId, summary,
        freshSets: summary.newlyCompletedSets, ammoBeforeShot, replayed: false, reducedMotion });
      void renderer.present(summary, { skip: false });
    },
    draw(dt, time) {
      at = time;
      controller.frame(dt);
      const card = visibleHeavyCard(ui);
      if (time < started || time > started + settlementMs || !card) return false;
      observed = { shot: summary.shotNumber, collected: summary.chainCount,
        freshSets: [...card.querySelectorAll('.rwd-set-fresh')].map(row => row.dataset.set),
        cardRows: card.querySelectorAll('.rwd-set, .rwd-item').length };
      return true;
    },
    end() { motion?.destroy(); panel.hideCard(); effects.hide(); },
    observation() { return observed; },
  };
}
