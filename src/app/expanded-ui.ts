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
// r007 (aim first, stall speech, talk, shot card)
export { mountAimFirstControls } from '../ui/controls/aim-first-panel';
export { mountTalkPanel } from '../ui/shopkeeper-talk';
export { SpeechScheduler, mountSpeechBubble } from '../ui/shopkeeper-speech';
export { aimFirstCardModel, cardBody, mountAimFirstCard, partLines } from '../ui/aim-first-card';
export { afText, speechText, isAfKey, SPEECH_LINES } from '../i18n/stall-speech';
export { speechConditions } from '../ui/speech-conditions';
export { effectKeyOverrides } from '../i18n/effect-keys';
export { aimFirstTranslator } from './aim-first-text';
export { prizePortrait } from '../view/prize-portrait';
export { miniShotPath, resultHighlight, resultPrizeShelf, recordBreak } from '../ui/festival-result';
export { festivalChallengeCard } from '../ui/festival-challenge-card';
