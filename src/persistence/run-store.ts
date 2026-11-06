/**
 * Run checkpoint store (Task 10; docs/architecture/persistence-design.md).
 *
 * Write points (the only ones):
 *   saveAfterFire(state)  right after FIRE was accepted, BEFORE the sim runs (phase "resolving", inFlight set)
 *   saveStable(state)     after a shot is settled (incl. replenishment and draw state), after STOP_LOAD,
 *                         and when the run has ended
 *
 * Reading (`load`) validates the saved state, quarantines anything unusable
 * (never deletes it silently) and applies the restore rules of
 * src/core/session.ts. Several tabs are guarded by an optimistic `revision`:
 * a write only succeeds if the stored revision is the one this tab last read
 * or wrote. A failed write never stops the game: the caller keeps playing in
 * memory and shows the warning from `status()`.
 */
import type { BoothLayout, Checkpoint, ExpansionCatalog, KeyValueStorage, RunState, RuntimeCatalog, TuningConfig } from '../contracts';
import { BOOTH_LAYOUT, CHECKPOINT_SCHEMA_VERSION } from '../contracts';
import { planRestore, validateRunState } from '../core/session';
import { STORAGE_KEYS } from './keys';
import { quarantine } from './quarantine';

const ENVELOPE_FORMAT = 'shatekki.run';

export interface RunEnvelope {
  readonly format: typeof ENVELOPE_FORMAT;
  /** +1 on every write. Guards against two tabs advancing the same run. */
  readonly revision: number;
  readonly tabId: string;
  readonly checkpoint: Checkpoint;
}

export type SaveFailure = 'unavailable' | 'quota' | 'conflict' | 'quarantine-failed' | 'invalid-call';
export type SaveResult = { readonly ok: true; readonly revision: number } | { readonly ok: false; readonly reason: SaveFailure; readonly message: string };

export type RestoreResult =
  /** Nothing saved (or storage cannot be read: see status().available). Start a new run. */
  | { readonly kind: 'none' }
  /** Continue. The state is paused with reason "manual" until the player presses resume. */
  | { readonly kind: 'resume'; readonly state: RunState }
  /** Decision 27: the in-flight shot was lost. Never ranked, no re-shot. `cause` tells why. */
  | { readonly kind: 'abandoned'; readonly state: RunState; readonly cause: 'inFlight' | 'saved' }
  /** The run had finished: show the result (and resend a pending ranking entry, Task 16). */
  | { readonly kind: 'ended'; readonly state: RunState }
  /** The saved data was unusable and was moved to the quarantine key (`preserved` false: it could not be moved and was left in place). Start a new run. */
  | { readonly kind: 'quarantined'; readonly reason: string; readonly preserved: boolean };

export interface RunStoreStatus {
  /** False after a read/write failure of the browser storage; progress is kept in memory only. */
  readonly available: boolean;
  readonly lastError: string | null;
  /** Another tab advanced the saved run. Stop accepting input in this tab. Cleared by load(). */
  readonly conflict: boolean;
  /** The pre-shot save failed in this run, so a reload could not tell that a shot was lost: do not send this run to the ranking (persistence-design.md §5). */
  readonly fireSaveFailed: boolean;
}

export interface RunStoreOptions {
  readonly catalog: RuntimeCatalog;
  readonly tuning: TuningConfig;
  readonly layout?: BoothLayout;
  /** Storage key of this run (default: the rules-v1 key). Expanded rules use expandedRunKey(rulesVersion). */
  readonly key?: string;
  /** Set for the expanded rules: state schema 2 is validated against it. */
  readonly expansion?: ExpansionCatalog | null;
  /** ISO time source (tests inject a fixed one). */
  readonly now?: () => string;
}

export interface RunStore {
  saveAfterFire(state: RunState): SaveResult;
  saveStable(state: RunState): SaveResult;
  load(): RestoreResult;
  /** Remove the saved run after the result was taken over. False if another tab owns it or storage failed. */
  clear(): boolean;
  /** True if another tab has written a newer revision since this tab last read or wrote. */
  isStale(): boolean;
  status(): RunStoreStatus;
  readonly tabId: string;
}

type Parsed = { readonly ok: true; readonly env: RunEnvelope } | { readonly ok: false; readonly reason: string };

function isQuota(e: unknown): boolean {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  return /quota/i.test(name) || /quota/i.test(e instanceof Error ? e.message : String(e));
}

/** Revision of a stored value, or null when it cannot be read as an envelope at all. */
function peekRevision(raw: string): number | null {
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === 'object' && v !== null && 'revision' in v && Number.isInteger((v as { revision: unknown }).revision)) return (v as { revision: number }).revision;
  } catch {
    /* fall through */
  }
  return null;
}

export function createRunStore(storage: KeyValueStorage, tabId: string, options: RunStoreOptions): RunStore {
  const { catalog, tuning } = options;
  const layout = options.layout ?? BOOTH_LAYOUT;
  const expansion = options.expansion ?? null;
  const KEY = options.key ?? STORAGE_KEYS.run;
  const now = options.now ?? (() => new Date().toISOString());
  /** Revision this tab last read or wrote; null = this tab expects no saved run. */
  let expected: number | null = null;
  let available = true;
  let lastError: string | null = null;
  let conflict = false;
  let fireSaveFailed = false;

  const fail = (reason: SaveFailure, message: string): SaveResult => ({ ok: false, reason, message });
  const noteFailure = (e: unknown): SaveResult => {
    available = false;
    lastError = e instanceof Error ? e.message : String(e);
    return fail(isQuota(e) ? 'quota' : 'unavailable', lastError);
  };

  function parse(raw: string): Parsed {
    let v: unknown;
    try {
      v = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'json' };
    }
    if (typeof v !== 'object' || v === null) return { ok: false, reason: 'format' };
    const e = v as Partial<RunEnvelope>;
    if (e.format !== ENVELOPE_FORMAT || !Number.isInteger(e.revision) || typeof e.tabId !== 'string' || typeof e.checkpoint !== 'object' || e.checkpoint === null) {
      return { ok: false, reason: 'format' };
    }
    const cp = e.checkpoint as Checkpoint;
    if (cp.schemaVersion !== CHECKPOINT_SCHEMA_VERSION) return { ok: false, reason: 'schema-version' };
    if (cp.rulesVersion !== catalog.rulesVersion) return { ok: false, reason: `rules-version: saved ${String(cp.rulesVersion)}, current ${catalog.rulesVersion}` };
    const problem = validateRunState(cp.state, catalog, tuning, layout, expansion);
    if (problem !== null) return { ok: false, reason: `invalid-state: ${problem}` };
    if (cp.runId !== cp.state.runId) return { ok: false, reason: 'invalid-state: runId mismatch' };
    if (cp.confirmedShots !== cp.state.ledger.length) return { ok: false, reason: 'invalid-state: confirmedShots mismatch' };
    return { ok: true, env: e as RunEnvelope };
  }

  /** Move `raw` to the quarantine key and only then remove it from the run key. */
  function moveAside(raw: string, reason: string): boolean {
    const ok = quarantine(storage, { atIso: now(), key: KEY, reason, raw });
    if (!ok) {
      lastError = `could not quarantine the saved run (${reason}); it was left in place`;
      return false;
    }
    try {
      storage.removeItem(KEY);
    } catch (e) {
      noteFailure(e);
    }
    return true;
  }

  function write(state: RunState): SaveResult {
    let raw: string | null;
    try {
      raw = storage.getItem(KEY);
    } catch (e) {
      return noteFailure(e);
    }
    if (raw !== null) {
      const stored = peekRevision(raw);
      if (stored === null) {
        // unreadable: never overwrite it silently
        if (!moveAside(raw, 'unreadable-before-write')) return fail('quarantine-failed', lastError ?? 'quarantine failed');
      } else if (stored !== expected) {
        conflict = true;
        return fail('conflict', `another tab saved revision ${stored}; this tab expected ${String(expected)}`);
      }
    } else if (expected !== null) {
      conflict = true;
      return fail('conflict', 'the saved run disappeared (another tab cleared it)');
    }
    const revision = (expected ?? 0) + 1;
    const envelope: RunEnvelope = {
      format: ENVELOPE_FORMAT,
      revision,
      tabId,
      checkpoint: {
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        savedAtIso: now(),
        runId: state.runId,
        rulesVersion: state.rulesVersion,
        confirmedShots: state.ledger.length,
        state,
      },
    };
    try {
      storage.setItem(KEY, JSON.stringify(envelope));
    } catch (e) {
      return noteFailure(e);
    }
    expected = revision;
    available = true;
    lastError = null;
    return { ok: true, revision };
  }

  return {
    tabId,

    saveAfterFire(state) {
      if (state.phase !== 'resolving' || state.inFlight === null) return fail('invalid-call', 'saveAfterFire needs a state with a shot in flight');
      const r = write(state);
      if (!r.ok && r.reason !== 'conflict') {
        // The shot will still be flown. Make sure a reload cannot offer the PRE-shot state (a free re-shot):
        // drop the old checkpoint (best effort) and exclude this run from the ranking.
        fireSaveFailed = true;
        try {
          storage.removeItem(KEY);
          expected = null;
        } catch {
          /* the flag still excludes the run */
        }
      }
      return r;
    },

    saveStable(state) {
      if (state.phase === 'resolving' || state.inFlight !== null) return fail('invalid-call', 'saveStable needs a settled state (no shot in flight)');
      return write(state);
    },

    load() {
      conflict = false;
      let raw: string | null;
      try {
        raw = storage.getItem(KEY);
      } catch (e) {
        noteFailure(e);
        return { kind: 'none' };
      }
      if (raw === null) {
        expected = null;
        return { kind: 'none' };
      }
      const parsed = parse(raw);
      if (!parsed.ok) {
        const preserved = moveAside(raw, parsed.reason);
        expected = null;
        return { kind: 'quarantined', reason: parsed.reason, preserved };
      }
      expected = parsed.env.revision;
      const plan = planRestore(parsed.env.checkpoint.state);
      if (plan.kind === 'abandoned') {
        // remember it, so that a second reload says the same and the shelf of the lost shot is never offered again
        if (plan.cause === 'inFlight') write(plan.state);
        return { kind: 'abandoned', state: plan.state, cause: plan.cause };
      }
      if (plan.kind === 'ended') return { kind: 'ended', state: plan.state };
      return { kind: 'resume', state: plan.state };
    },

    clear() {
      try {
        const raw = storage.getItem(KEY);
        if (raw !== null) {
          const stored = peekRevision(raw);
          if (stored !== null && stored !== expected) {
            conflict = true;
            return false;
          }
        }
        storage.removeItem(KEY);
      } catch (e) {
        noteFailure(e);
        return false;
      }
      expected = null;
      fireSaveFailed = false;
      return true;
    },

    isStale() {
      try {
        const raw = storage.getItem(KEY);
        if (raw === null) return expected !== null;
        return peekRevision(raw) !== expected;
      } catch {
        return false;
      }
    },

    status() {
      return { available, lastError, conflict, fireSaveFailed };
    },
  };
}
