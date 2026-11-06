/** Official rules-v1 snapshot, adopted unchanged on 2026-11-06. */
import type { PrizeRuntimeConfig, RuntimeCatalog, SetRuntimeConfig, TuningConfig } from '../contracts';
import approved from '../../data/release-approved-v1.json';

export const RELEASE_RULES_VERSION = 'rules-v1';
const snapshot = approved as unknown as {
  tuning: TuningConfig;
  catalog: { rulesVersion: string; prizes: readonly PrizeRuntimeConfig[]; sets: readonly SetRuntimeConfig[] };
};

export const RELEASE_CATALOG: RuntimeCatalog = Object.freeze({
  rulesVersion: RELEASE_RULES_VERSION,
  prizes: new Map(snapshot.catalog.prizes.map((prize) => [prize.typeId, Object.freeze(prize)])),
  sets: new Map(snapshot.catalog.sets.map((set) => [set.setId, Object.freeze(set)])),
});
export const RELEASE_TUNING: TuningConfig = Object.freeze(snapshot.tuning);
