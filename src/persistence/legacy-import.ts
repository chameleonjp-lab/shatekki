import type { KeyValueStorage, PrizeTypeId, RuntimeCatalog, SetId } from '../contracts';
import { isPrizeTypeId, isSetId } from '../contracts';
import type { RunScope } from '../contracts/persistence';
import { STORAGE_KEYS } from './keys';
import { SOUVENIR_KEY, SOUVENIR_SLOTS, type SouvenirSlot } from './souvenirs';

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
      const inThisProfile = new Set<SetId>();
      for (const id of Array.isArray(p.discoveredSets) ? p.discoveredSets : []) {
        if (!isSetId(id) || !knownSets.has(id) || (version === 1 && !id.startsWith('S')) || inThisProfile.has(id)) {
          damaged = true;
          continue;
        }
        inThisProfile.add(id);
        discovered.add(id);
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

type KnownPrizes = Pick<RuntimeCatalog['prizes'], 'has'>;

/** Keep the first valid occurrence in its original slot. Never move another prize to fill a gap. */
export function checkSouvenirSlots(source: unknown, knownPrizes: KnownPrizes) {
  const entries: unknown[] = Array.isArray(source) ? source : [];
  const seen = new Set<PrizeTypeId>();
  let damaged = entries.length !== SOUVENIR_SLOTS;
  const slots = Array.from({ length: SOUVENIR_SLOTS }, (_, index): SouvenirSlot | null => {
    const entry = entries[index];
    if (entry === null) return null;
    if (
      !entry || typeof entry !== 'object' ||
      !('typeId' in entry) || !isPrizeTypeId(entry.typeId) || !knownPrizes.has(entry.typeId) || seen.has(entry.typeId) ||
      !('runId' in entry) || typeof entry.runId !== 'string' || !entry.runId.trim()
    ) {
      damaged = true;
      return null;
    }
    seen.add(entry.typeId);
    return { typeId: entry.typeId, runId: entry.runId };
  });
  return { slots, damaged };
}

export function readLegacyShelf(storage: Pick<KeyValueStorage, 'getItem'>, knownPrizes: KnownPrizes) {
  const raw = storage.getItem(SOUVENIR_KEY);
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!Array.isArray(value?.slots)) throw Error('invalid souvenir shelf');
  return checkSouvenirSlots(value.slots, knownPrizes);
}
