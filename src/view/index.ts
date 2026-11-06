export { createThreeRenderer, type ThreeRenderer, type ThreeRendererDeps } from './renderer';
export { createSceneGraph, applyFrame, updateAim, type SceneGraph, type SceneGraphDeps, type SceneStats, type FrameApplyResult } from './scene';
export { buildBooth, type BoothBuild } from './booth';
export { buildPrizeGeometry, createPrizeVisualFactory, fitGeometryToShape, insideShape, shapeHalfExtents, type PrizeVisualSpec } from './prizes';
export { aimDirection, computeReticle, muzzlePosition, aimTargetPosition, type ReticleResult } from './aim';
export { cameraPose, applyCameraPose, fovForAspect, type CameraPose } from './camera';
export { PRIZE_RECIPES, PRIZE_RECIPE_IDS } from './assets/prize-recipes';
