/**
 * Gameplay bundles (plan EG01): one consistent set of catalog, tuning, layout
 * and expansion handed to start, restore, physics, view and persistence.
 *
 * 'official-v1' is exactly today's rules-v1 (same object identities).
 * 'expanded-proposed' is the D34-D37 prototype; it is built lazily and cached.
 */
import type { GameplayBundle, GameplayBundleKey, TuningConfig } from '../contracts';
import { BOOTH_LAYOUT_V2 } from '../contracts';
import { BOOTH_LAYOUT } from '../contracts/layout';
import { DEFAULT_GAMEPLAY_BUNDLE_KEY } from '../contracts';
import { RELEASE_CATALOG, RELEASE_TUNING } from './release-config';
import { buildExpansion } from './expanded-config';
import pairSets from '../../data/expansion-v2/pair-sets.json';
import questions from '../../data/expansion-v2/questions.json';
import groups from '../../data/expansion-v2/groups.json';
import effects from '../../data/expansion-v2/effects.json';
import series from '../../data/expansion-v2/series.json';
import profile from '../../data/expansion-v2/profile.json';

/** The raw expanded data as shipped in data/expansion-v2. */
export const EXPANSION_RAW_DATA = { pairSets, questions, groups, effects, series, profile } as const;

/**
 * Only the exact string 'expanded-proposed' selects the expanded bundle; anything else
 * (undefined, 'official-v1', typos, objects) is the default. Callers feed it from a
 * build-time constant, never from URL parameters or storage.
 */
export function resolveBundleKey(raw: unknown): GameplayBundleKey {
  return raw === 'expanded-proposed' ? 'expanded-proposed' : DEFAULT_GAMEPLAY_BUNDLE_KEY;
}

const OFFICIAL: GameplayBundle = Object.freeze({
  key: 'official-v1' as const,
  catalog: RELEASE_CATALOG,
  tuning: RELEASE_TUNING,
  layout: BOOTH_LAYOUT,
  expansion: null,
});

let expanded: GameplayBundle | null = null;

function buildExpandedBundle(): GameplayBundle {
  const { expansion, catalog } = buildExpansion(RELEASE_CATALOG, EXPANSION_RAW_DATA);
  const tuning: TuningConfig = Object.freeze({
    ...RELEASE_TUNING,
    valueStatus: 'prototype' as const,
    shelfSlotCount: expansion.profile.slotCount,
    draw: Object.freeze({ ...RELEASE_TUNING.draw, tierTargets: expansion.profile.tierTargets }),
  });
  return Object.freeze({ key: 'expanded-proposed' as const, catalog, tuning, layout: BOOTH_LAYOUT_V2, expansion });
}

export function getGameplayBundle(key: GameplayBundleKey): GameplayBundle {
  if (key === 'official-v1') return OFFICIAL;
  expanded ??= buildExpandedBundle();
  return expanded;
}
