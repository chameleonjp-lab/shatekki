/**
 * Versioned profile (expanded gameplay, persistence-design.md §1 addendum).
 *
 * `shatekki.profile.v2` keeps one local best per rules version, so a score of
 * the expanded rules never mixes with rules-v1 scores. `shatekki.profile.v1`
 * is READ-ONLY here: its best becomes `legacyBestScore` (its rules version is
 * unknown, so it is never filed under any version) and its discovered S sets
 * are unioned into the v2 book. Every read re-merges v1, because an older app
 * in another tab may have written more since. Writes are read-modify-write.
 */
import type { KeyValueStorage, SetId } from '../contracts';
import { isSetId } from '../contracts';
import { STORAGE_KEYS } from './keys';
import { PROFILE_SCHEMA_VERSION, type Profile, type ProfileStore, type RunEndInput } from './profile-store';
import { quarantine } from './quarantine';

export const PROFILE_V2_SCHEMA_VERSION = 2;

export interface ProfileV2 {
  readonly schemaVersion: typeof PROFILE_V2_SCHEMA_VERSION;
  readonly bestScores: Readonly<Record<string, number>>;
  readonly legacyBestScore: number | null;
  readonly discoveredSets: readonly SetId[];
}

export interface VersionedProfileStore extends ProfileStore {
  /** Local best of one rules version, or null if none was recorded. */
  bestFor(rulesVersion: string): number | null;
  /** Best of the old rules-v1 profile whose version is unknown (display only). */
  legacyBestScore(): number | null;
}

export interface VersionedProfileOptions {
  readonly rulesVersion: string;
  readonly now?: () => string;
}

const EMPTY_V2: ProfileV2 = { schemaVersion: PROFILE_V2_SCHEMA_VERSION, bestScores: {}, legacyBestScore: null, discoveredSets: [] };
const isScore = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const max = (a: number | null, b: number | null): number | null => (a === null ? b : b === null ? a : Math.max(a, b));
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

function union(a: ProfileV2, b: ProfileV2): ProfileV2 {
  const bests: Record<string, number> = { ...a.bestScores };
  for (const [k, v] of Object.entries(b.bestScores)) bests[k] = Math.max(bests[k] ?? 0, v);
  const known = new Set<SetId>(a.discoveredSets);
  return {
    schemaVersion: PROFILE_V2_SCHEMA_VERSION,
    bestScores: bests,
    legacyBestScore: max(a.legacyBestScore, b.legacyBestScore),
    discoveredSets: [...a.discoveredSets, ...b.discoveredSets.filter((id) => !known.has(id))],
  };
}

export function createVersionedProfileStore(storage: KeyValueStorage, options: VersionedProfileOptions): VersionedProfileStore {
  const now = options.now ?? (() => new Date().toISOString());
  const rulesVersion = options.rulesVersion;
  let memory: ProfileV2 = EMPTY_V2;
  let available = true;
  let lastError: string | null = null;
  let quarantinedRaw: string | null = null;

  function readV2(): ProfileV2 | null | 'failed' {
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEYS.profileV2);
    } catch (e) {
      available = false;
      lastError = msg(e);
      return 'failed';
    }
    if (raw === null) return null;
    const aside = (reason: string): void => {
      if (quarantinedRaw === raw) return;
      if (quarantine(storage, { atIso: now(), key: STORAGE_KEYS.profileV2, reason, raw })) quarantinedRaw = raw;
    };
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      aside('json');
      return 'failed';
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v) || (v as { schemaVersion?: unknown }).schemaVersion !== PROFILE_V2_SCHEMA_VERSION) {
      aside('format');
      return 'failed';
    }
    const o = v as { bestScores?: unknown; legacyBestScore?: unknown; discoveredSets?: unknown };
    const bests: Record<string, number> = {};
    let clean = true;
    if (typeof o.bestScores === 'object' && o.bestScores !== null && !Array.isArray(o.bestScores)) {
      for (const [k, b] of Object.entries(o.bestScores)) {
        if (isScore(b)) bests[k] = b;
        else clean = false;
      }
    } else clean = false;
    const ids: unknown[] = Array.isArray(o.discoveredSets) ? o.discoveredSets : [];
    if (!Array.isArray(o.discoveredSets)) clean = false;
    const goodIds = [...new Set(ids.filter((x): x is SetId => isSetId(x)))];
    if (goodIds.length !== ids.length) clean = false;
    const legacy = isScore(o.legacyBestScore) ? o.legacyBestScore : null;
    if (legacy === null && o.legacyBestScore !== null) clean = false;
    if (!clean) aside('partly-invalid');
    return { schemaVersion: PROFILE_V2_SCHEMA_VERSION, bestScores: bests, legacyBestScore: legacy, discoveredSets: goodIds };
  }

  /** The rules-v1 profile, read only. Unreadable data is ignored here (the v1 store owns its quarantine). */
  function readV1(): { best: number | null; sets: SetId[] } {
    try {
      const raw = storage.getItem(STORAGE_KEYS.profile);
      if (raw === null) return { best: null, sets: [] };
      const v: unknown = JSON.parse(raw);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) return { best: null, sets: [] };
      const o = v as { schemaVersion?: unknown; bestScore?: unknown; discoveredSets?: unknown };
      if (o.schemaVersion !== PROFILE_SCHEMA_VERSION) return { best: null, sets: [] };
      return { best: isScore(o.bestScore) ? o.bestScore : null, sets: Array.isArray(o.discoveredSets) ? o.discoveredSets.filter((x): x is SetId => isSetId(x)) : [] };
    } catch {
      return { best: null, sets: [] };
    }
  }

  function persist(p: ProfileV2): void {
    memory = p;
    try {
      storage.setItem(STORAGE_KEYS.profileV2, JSON.stringify(p));
      available = true;
      lastError = null;
    } catch (e) {
      available = false;
      lastError = msg(e);
    }
  }

  /** Current merged profile. Writes v2 back only when the v1 merge added something. */
  function read(): ProfileV2 {
    const stored = readV2();
    let base = stored === 'failed' || stored === null ? memory : stored;
    if (stored !== 'failed' && stored !== null && !available) base = union(stored, memory); // a failed write is not forgotten
    const v1 = readV1();
    const legacy = max(base.legacyBestScore, v1.best);
    const known = new Set<SetId>(base.discoveredSets);
    const extra = [...new Set(v1.sets)].filter((id) => !known.has(id));
    const merged: ProfileV2 = { ...base, legacyBestScore: legacy, discoveredSets: [...base.discoveredSets, ...extra] };
    const changed = merged.legacyBestScore !== base.legacyBestScore || extra.length > 0;
    if (changed && stored !== 'failed') persist(merged);
    else memory = merged;
    return merged;
  }

  return {
    load(): Profile {
      const p = read();
      return { schemaVersion: PROFILE_SCHEMA_VERSION, bestScore: p.bestScores[rulesVersion] ?? null, discoveredSets: p.discoveredSets };
    },

    bestFor: (version) => read().bestScores[version] ?? null,
    legacyBestScore: () => read().legacyBestScore,

    discoverSets(ids) {
      const cur = read();
      const known = new Set<SetId>(cur.discoveredSets);
      const added: SetId[] = [];
      for (const id of ids) {
        if (!isSetId(id) || known.has(id)) continue;
        known.add(id);
        added.push(id);
      }
      if (added.length > 0) persist({ ...cur, discoveredSets: [...cur.discoveredSets, ...added] });
      return added;
    },

    recordRunEnd(result: RunEndInput) {
      if (result.status !== 'completed') return { newBest: false };
      const version = result.rulesVersion;
      if (typeof version !== 'string' || version === '' || !isScore(result.score)) return { newBest: false };
      const cur = read();
      const old = cur.bestScores[version];
      const newBest = old === undefined || result.score > old;
      if (newBest) persist({ ...cur, bestScores: { ...cur.bestScores, [version]: result.score } });
      return { newBest };
    },

    status: () => ({ available, lastError }),
  };
}
