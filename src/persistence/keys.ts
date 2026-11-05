/** Storage keys (docs/architecture/persistence-design.md §1). One role per key; never merged. */
export const STORAGE_KEYS = {
  run: 'shatekki.run.v1',
  profile: 'shatekki.profile.v1',
  settings: 'shatekki.settings.v1',
  playerName: 'shatekki.player-name.v1',
  rankingPending: 'shatekki.ranking-pending.v1',
  quarantine: 'shatekki.quarantine.v1',
} as const;

export type StorageKeyName = keyof typeof STORAGE_KEYS;
