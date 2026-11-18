import type { KeyValueStorage, SetId } from '../contracts';
import { isPrizeTypeId, isSetId } from '../contracts';
import type { RunScope } from '../contracts/persistence';
import { STORAGE_KEYS } from './keys';
import { SOUVENIR_KEY, SOUVENIR_SLOTS, type SouvenirShelf } from './souvenirs';

const score = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Read raw values only. The old profile stores can write repairs even from load(). */
export function collectLegacyProfile(
  scope: RunScope,
  storage: Pick<KeyValueStorage, 'getItem'>,
  knownSets: ReadonlySet<SetId>,
) {
  const suffix = scope.mode === 'daily' ? '.daily' : '';
  const discovered = new Set<SetId>();
  let legacyBestScore: number | null = null;
  const unreadable: string[] = [];
  for (const [version, name] of [
    [1, STORAGE_KEYS.profile],
    [2, STORAGE_KEYS.profileV2],
  ] as const) {
    const key = name + suffix;
    try {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      const p = JSON.parse(raw);
      if (p?.schemaVersion !== version) throw Error('unsupported profile');
      let damaged = !Array.isArray(p.discoveredSets);
      for (const id of Array.isArray(p.discoveredSets) ? p.discoveredSets : []) {
        if (!isSetId(id)) damaged = true;
        else if (knownSets.has(id) && (version === 2 || id.startsWith('S'))) discovered.add(id);
      }
      const oldScores: unknown[] = [];
      const best = version === 1 ? p.bestScore : p.legacyBestScore;
      if (best !== null) oldScores.push(best);
      if (version === 2) {
        if (!p.bestScores || typeof p.bestScores !== 'object' || Array.isArray(p.bestScores)) damaged = true;
        else oldScores.push(...Object.values(p.bestScores));
      }
      for (const value of oldScores) {
        if (score(value)) legacyBestScore = Math.max(legacyBestScore ?? 0, value);
        else damaged = true;
      }
      if (damaged) unreadable.push(key);
    } catch {
      unreadable.push(key);
    }
  }
  return { discoveredSets: [...discovered], legacyBestScore, unreadable };
}

export function readLegacyShelf(storage: Pick<KeyValueStorage, 'getItem'>): SouvenirShelf | null {
  const raw = storage.getItem(SOUVENIR_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (
    !Array.isArray(value?.slots) ||
    value.slots.length !== SOUVENIR_SLOTS ||
    !value.slots.every(
      (s: { typeId?: unknown; runId?: unknown } | null) =>
        s === null || (isPrizeTypeId(s?.typeId) && typeof s.runId === 'string' && s.runId.length > 0),
    )
  ) {
    throw Error('invalid souvenir shelf');
  }
  return { slots: value.slots };
}
