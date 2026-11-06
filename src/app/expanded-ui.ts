/**
 * UI pieces used only by the expanded D34-D37 prototype (owner: Opus).
 * Loaded together with the expanded bundle behind the build-time switch in
 * ./bundle.ts, so the public build contains neither the expanded texts nor
 * these screens.
 */
export { createExpansionTranslator } from '../i18n/expansion-text';
export { createShopkeeperQuestionPanel, questionContentFor } from '../ui/shopkeeper-question';
export { mountBoothMap } from '../ui/booth-map';
