/**
 * UI pieces used only by the expanded D34-D37 prototype (owner: Opus).
 * Loaded together with the expanded bundle behind the build-time switch in
 * ./bundle.ts, so the public build contains neither the expanded texts nor
 * these screens.
 */
export { createExpansionTranslator } from '../i18n/expansion-text';
export { createShopkeeperQuestionPanel, questionContentFor } from '../ui/shopkeeper-question';
export { mountBoothMap } from '../ui/booth-map';
export { seriesOutlineTargets } from '../view/series-outline';
export { expandedLine } from '../i18n/expanded-content';
export { mountEffectResults, effectResultsModel } from '../ui/effect-results';
export { mountRewardPanel, momentCue, shotMoment, rewardLine, renderRewardSet } from '../ui/reward-panel';
export { bestShotOf } from '../core/rewards';
export { mountRewardMotions } from '../view/reward-motions';
