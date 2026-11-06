/**
 * Profile (local best score, set book), settings and player name stores
 * (Task 10; persistence-design.md §1). Each has its own key; none of them is
 * touched by starting, finishing or abandoning a run except through the
 * explicit calls below. The set book is separate from the run's own
 * completed sets (AC22): a new run starts with no completed sets, the book
 * keeps every discovery.
 *
 * Every write is read-modify-write, so a second tab's discoveries are merged
 * and never lost. Unreadable data is quarantined, never silently dropped; if
 * storage fails the values are kept in memory and `available` turns false.
 */
import type { FinalResult, KeyValueStorage, SetId } from '../contracts';
import { isSetId } from '../contracts';
import { STORAGE_KEYS } from './keys';
import { quarantine } from './quarantine';

export const PROFILE_SCHEMA_VERSION = 1;
export const SETTINGS_SCHEMA_VERSION = 1;

export interface Profile {
  readonly schemaVersion: typeof PROFILE_SCHEMA_VERSION;
  /** Local display only. null = no completed run yet (never 0). */
  readonly bestScore: number | null;
  /** Discovered sets in the order of discovery. */
  readonly discoveredSets: readonly SetId[];
}

export interface StoreStatus {
  readonly available: boolean;
  readonly lastError: string | null;
}

export interface ProfileStore {
  load(): Profile;
  /** Add discoveries (e.g. ShotSummary.newlyCompletedSets). Returns the ones that were new to the book. */
  discoverSets(ids: readonly SetId[]): readonly SetId[];
  /**
   * Record a finished run. Only completed runs can set the local best; abandoned runs never do.
   * The local best is for display and includes prototype-value runs; the official ranking is separate.
   */
  recordRunEnd(result: Pick<FinalResult, 'status' | 'score'>): { readonly newBest: boolean };
  status(): StoreStatus;
}

const EMPTY: Profile = { schemaVersion: PROFILE_SCHEMA_VERSION, bestScore: null, discoveredSets: [] };

function isQuotaLike(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function createProfileStore(storage: KeyValueStorage, now: () => string = () => new Date().toISOString()): ProfileStore {
  let memory: Profile = EMPTY;
  let available = true;
  let lastError: string | null = null;

  function read(): Profile {
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEYS.profile);
    } catch (e) {
      available = false;
      lastError = isQuotaLike(e);
      return memory;
    }
    if (raw === null) return memory;
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      quarantine(storage, { atIso: now(), key: STORAGE_KEYS.profile, reason: 'json', raw });
      return memory;
    }
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      quarantine(storage, { atIso: now(), key: STORAGE_KEYS.profile, reason: 'format', raw });
      return memory;
    }
    const o = v as { schemaVersion?: unknown; bestScore?: unknown; discoveredSets?: unknown };
    const ids = Array.isArray(o.discoveredSets) ? o.discoveredSets : [];
    const goodIds = [...new Set(ids.filter((x): x is SetId => isSetId(x)))];
    const goodBest = typeof o.bestScore === 'number' && Number.isInteger(o.bestScore) && o.bestScore >= 0 ? o.bestScore : null;
    // keep what can be trusted; keep the original aside whenever something was dropped
    const clean = o.schemaVersion === PROFILE_SCHEMA_VERSION && goodIds.length === ids.length && Array.isArray(o.discoveredSets) && (goodBest === o.bestScore || o.bestScore === null);
    if (!clean) quarantine(storage, { atIso: now(), key: STORAGE_KEYS.profile, reason: 'partly-invalid', raw });
    memory = { schemaVersion: PROFILE_SCHEMA_VERSION, bestScore: goodBest, discoveredSets: goodIds };
    return memory;
  }

  function write(p: Profile): void {
    memory = p;
    try {
      storage.setItem(STORAGE_KEYS.profile, JSON.stringify(p));
      available = true;
      lastError = null;
    } catch (e) {
      available = false;
      lastError = isQuotaLike(e);
    }
  }

  return {
    load: read,

    discoverSets(ids) {
      const cur = read();
      const known = new Set<SetId>(cur.discoveredSets);
      const added: SetId[] = [];
      for (const id of ids) {
        if (!isSetId(id) || known.has(id)) continue;
        known.add(id);
        added.push(id);
      }
      if (added.length > 0) write({ ...cur, discoveredSets: [...cur.discoveredSets, ...added] });
      return added;
    },

    recordRunEnd(result) {
      if (result.status !== 'completed') return { newBest: false };
      const cur = read();
      const newBest = cur.bestScore === null || result.score > cur.bestScore;
      if (newBest) write({ ...cur, bestScore: result.score });
      return { newBest };
    },

    status: () => ({ available, lastError }),
  };
}

// --------------------------------------------------------------- settings

export interface Settings {
  readonly schemaVersion: typeof SETTINGS_SCHEMA_VERSION;
  readonly audio: { readonly enabled: boolean; /** 0..1 */ readonly volume: number };
  /** null = not chosen: use the browser language, then English (requirements §11). */
  readonly language: string | null;
}

export const DEFAULT_SETTINGS: Settings = { schemaVersion: SETTINGS_SCHEMA_VERSION, audio: { enabled: true, volume: 0.7 }, language: null };

export interface SettingsStore {
  load(): Settings;
  save(patch: { readonly audio?: Partial<Settings['audio']>; readonly language?: string | null }): Settings;
  status(): StoreStatus;
}

export function createSettingsStore(storage: KeyValueStorage, now: () => string = () => new Date().toISOString()): SettingsStore {
  let memory: Settings = DEFAULT_SETTINGS;
  let available = true;
  let lastError: string | null = null;

  function read(): Settings {
    let raw: string | null;
    try {
      raw = storage.getItem(STORAGE_KEYS.settings);
    } catch (e) {
      available = false;
      lastError = isQuotaLike(e);
      return memory;
    }
    if (raw === null) return memory;
    try {
      const v = JSON.parse(raw) as Partial<Settings> | null;
      const a = v?.audio;
      if (v && v.schemaVersion === SETTINGS_SCHEMA_VERSION && a && typeof a.enabled === 'boolean' && typeof a.volume === 'number' && a.volume >= 0 && a.volume <= 1 && (v.language === null || typeof v.language === 'string')) {
        memory = { schemaVersion: SETTINGS_SCHEMA_VERSION, audio: { enabled: a.enabled, volume: a.volume }, language: v.language ?? null };
        return memory;
      }
    } catch {
      /* quarantined below */
    }
    quarantine(storage, { atIso: now(), key: STORAGE_KEYS.settings, reason: 'invalid-settings', raw });
    return memory;
  }

  return {
    load: read,
    save(patch) {
      const cur = read();
      const volume = patch.audio?.volume;
      const next: Settings = {
        schemaVersion: SETTINGS_SCHEMA_VERSION,
        audio: {
          enabled: patch.audio?.enabled ?? cur.audio.enabled,
          volume: volume === undefined || !Number.isFinite(volume) ? cur.audio.volume : Math.min(1, Math.max(0, volume)),
        },
        language: patch.language === undefined ? cur.language : patch.language,
      };
      memory = next;
      try {
        storage.setItem(STORAGE_KEYS.settings, JSON.stringify(next));
        available = true;
        lastError = null;
      } catch (e) {
        available = false;
        lastError = isQuotaLike(e);
      }
      return next;
    },
    status: () => ({ available, lastError }),
  };
}

// ------------------------------------------------------------ player name

export interface PlayerNameStore {
  get(): string | null;
  /** Empty / whitespace clears it (null = anonymous). Length rules are not decided yet (open item). */
  set(name: string | null): string | null;
}

export function createPlayerNameStore(storage: KeyValueStorage): PlayerNameStore {
  let memory: string | null = null;
  return {
    get() {
      try {
        const raw = storage.getItem(STORAGE_KEYS.playerName);
        if (raw !== null) memory = raw.trim() === '' ? null : raw;
      } catch {
        /* keep memory */
      }
      return memory;
    },
    set(name) {
      const v = name === null || name.trim() === '' ? null : name.trim();
      memory = v;
      try {
        if (v === null) storage.removeItem(STORAGE_KEYS.playerName);
        else storage.setItem(STORAGE_KEYS.playerName, v);
      } catch {
        /* kept in memory */
      }
      return v;
    },
  };
}
