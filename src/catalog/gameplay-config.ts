/**
 * Gameplay bundles (plan EG01): one consistent set of catalog, tuning, layout
 * and expansion handed to start, restore, physics, view and persistence.
 *
 * 'official-v1' is exactly today's rules-v1 (same object identities).
 * 'expanded-proposed' is the D34-D37 prototype; it is built lazily and cached.
 */
import type { GameplayBundle, GameplayBundleKey, RewardConfig, RewardId, TuningConfig } from '../contracts';
import { REWARD_IDS } from '../contracts';
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
import rewardData from '../../data/expansion-v2/rewards.json';

/** The raw expanded data as shipped in data/expansion-v2. */
export const EXPANSION_RAW_DATA = { pairSets, questions, groups, effects, series, profile } as const;

/** Internal prototype keys, each an exact build-time value. */
export const EXPANDED_BUNDLE_KEYS = ['expanded-proposed', 'expanded-trial', 'expanded-full'] as const;
export type ExpandedBundleKey = (typeof EXPANDED_BUNDLE_KEYS)[number];

/**
 * Only an exact internal key selects an expanded bundle; anything else (undefined,
 * 'official-v1', typos, objects) is the default. Callers feed it from a build-time
 * constant, never from URL parameters or storage.
 */
export function resolveBundleKey(raw: unknown): GameplayBundleKey {
  return (EXPANDED_BUNDLE_KEYS as readonly unknown[]).includes(raw) ? (raw as ExpandedBundleKey) : DEFAULT_GAMEPLAY_BUNDLE_KEY;
}

/**
 * Rules version and rewards of each internal key (plan T2): r001 stays as it was for
 * comparison; r002 is the first playable rewards trial (A1, A5); r003 has all ten.
 * Prototype values from data/expansion-v2/rewards.json.
 */
function rewardsFor(key: ExpandedBundleKey): { readonly rulesVersion: string; readonly rewards: RewardConfig | null } {
  if (key === 'expanded-proposed') return { rulesVersion: profile.rulesVersion, rewards: null };
  const v = rewardData.versions[key];
  const enabled = v.enabled.filter((id): id is RewardId => (REWARD_IDS as readonly string[]).includes(id));
  if (enabled.length !== v.enabled.length) throw new RangeError(`rewards.json: unknown reward id in ${key}`);
  const d = rewardData.values;
  const rewards: RewardConfig = Object.freeze({
    enabled: Object.freeze(enabled),
    bonusBag: d.bonusBag,
    windChime: d.windChime,
    seesaw: d.seesaw,
    piggyBank: Object.freeze({ ...d.piggyBank }),
    lastShotTarget: Object.freeze({ ...d.lastShotTarget }),
    stamps: Object.freeze({ milestones: Object.freeze([...d.stamps.milestones]), amount: d.stamps.amount }),
    multiTake: Object.freeze({ ...d.multiTake }),
    setVoucher: Object.freeze({ ...d.setVoucher }),
    order: Object.freeze({ ...d.order }),
    lanterns: Object.freeze({ amount: d.lanterns.amount, zones: Object.freeze(d.lanterns.zones.map((z) => Object.freeze([z[0]!, z[1]!] as const))) }),
  });
  return { rulesVersion: v.rulesVersion, rewards };
}

const OFFICIAL: GameplayBundle = Object.freeze({
  key: 'official-v1' as const,
  catalog: RELEASE_CATALOG,
  tuning: RELEASE_TUNING,
  layout: BOOTH_LAYOUT,
  expansion: null,
});

const expandedCache = new Map<ExpandedBundleKey, GameplayBundle>();

function buildExpandedBundle(key: ExpandedBundleKey): GameplayBundle {
  const version = rewardsFor(key);
  const built = buildExpansion(RELEASE_CATALOG, { ...EXPANSION_RAW_DATA, profile: { ...profile, rulesVersion: version.rulesVersion } });
  const catalog = built.catalog;
  const expansion = version.rewards ? Object.freeze({ ...built.expansion, profile: Object.freeze({ ...built.expansion.profile, rewards: version.rewards }) }) : built.expansion;
  const tuning: TuningConfig = Object.freeze({
    ...RELEASE_TUNING,
    valueStatus: 'prototype' as const,
    shelfSlotCount: expansion.profile.slotCount,
    draw: Object.freeze({ ...RELEASE_TUNING.draw, tierTargets: expansion.profile.tierTargets }),
  });
  return Object.freeze({ key, catalog, tuning, layout: BOOTH_LAYOUT_V2, expansion });
}

export function getGameplayBundle(key: GameplayBundleKey): GameplayBundle {
  if (key === 'official-v1') return OFFICIAL;
  let b = expandedCache.get(key);
  if (!b) expandedCache.set(key, (b = buildExpandedBundle(key)));
  return b;
}
