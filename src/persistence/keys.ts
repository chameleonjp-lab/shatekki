/** Storage keys (docs/architecture/persistence-design.md §1). One role per key; never merged. */
export const STORAGE_KEYS = {
  run: 'shatekki.run.v1',
  profile: 'shatekki.profile.v1',
  /** Per-rules-version bests (expanded rules and later). v1 stays read-only for it. */
  profileV2: 'shatekki.profile.v2',
  settings: 'shatekki.settings.v1',
  playerName: 'shatekki.player-name.v1',
  rankingPending: 'shatekki.ranking-pending.v1',
  quarantine: 'shatekki.quarantine.v1',
} as const;

export type StorageKeyName = keyof typeof STORAGE_KEYS;

/** Run key of an expanded rules version. Never equal to the rules-v1 key. */
export function expandedRunKey(rulesVersion: string): string {
  if (!/^[a-z0-9.-]+$/.test(rulesVersion)) throw new RangeError(`invalid rulesVersion for a storage key: ${rulesVersion}`);
  const key = `shatekki.run.${rulesVersion}`;
  if (key === STORAGE_KEYS.run) throw new RangeError('rulesVersion would collide with the rules-v1 run key');
  return key;
}
