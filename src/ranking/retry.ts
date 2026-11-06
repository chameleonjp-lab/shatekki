/**
 * Failure classification and the persisted pending queue for the ranking
 * client. A pending entry freezes everything needed to repeat the exact same
 * requests (start_id, play_id, submission_id, score, name) so a retry after a
 * lost response registers once.
 */
import type { KeyValueStorage } from '../contracts';
import { DONE_STORAGE_KEY, MAX_SCORE, PENDING_STORAGE_KEY, QUARANTINE_STORAGE_KEY } from './config';
import { normalizePlayerName } from './name';

export type FailureKind = 'retryable_failed' | 'permanent_failed';

export function classifyHttpFailure(status: number, code: string | null, message: string): FailureKind {
  if ([408, 425, 429].includes(status) || status >= 500) return 'retryable_failed';
  return isRetryableReason(`${code ?? ''} ${message}`) ? 'retryable_failed' : 'permanent_failed';
}

export function isRetryableReason(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /rate.?limit|too many|temporar|try again|timeout|unavailable|busy|game_not_available|inactive_game|not_active/i.test(value);
}

/** Exponential backoff with a cap; attempt is 0-based. Pure so apps can schedule retries. */
export function nextRetryDelayMs(attempt: number, baseMs = 2000, capMs = 5 * 60_000): number {
  const n = Math.max(0, Math.min(30, Math.trunc(attempt)));
  return Math.min(capMs, baseMs * 2 ** n);
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export interface FrozenResult {
  readonly score: number;
  readonly submissionId: string;
}

export interface PendingEntry {
  readonly schema: 1;
  readonly runId: string;
  readonly startId: string;
  readonly gameSlug: string;
  readonly clientVersion: string;
  readonly displayName: string;
  readonly playId: string | null;
  readonly result: FrozenResult | null;
  readonly finishConfirmed: boolean;
  readonly attempts: number;
  readonly lastFailure: { readonly phase: 'start' | 'finish' | 'submit'; readonly kind: FailureKind; readonly code: string | null } | null;
}

export interface DoneRecord {
  readonly runId: string;
  readonly playId: string;
  readonly submissionId: string;
  readonly bestScore: number;
  readonly isNewBest: boolean;
  readonly isFirstPlay: boolean;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function isValidEntry(v: unknown): v is PendingEntry {
  if (!isRecord(v) || v.schema !== 1) return false;
  if (typeof v.runId !== 'string' || v.runId === '' || !isUuid(v.startId)) return false;
  if (typeof v.gameSlug !== 'string' || v.gameSlug === '' || typeof v.clientVersion !== 'string') return false;
  if (normalizePlayerName(v.displayName) !== v.displayName) return false;
  if (v.playId !== null && !isUuid(v.playId)) return false;
  if (typeof v.finishConfirmed !== 'boolean' || typeof v.attempts !== 'number') return false;
  if (v.result !== null) {
    if (!isRecord(v.result) || !isUuid(v.result.submissionId)) return false;
    const s = v.result.score;
    if (typeof s !== 'number' || !Number.isSafeInteger(s) || s < 0 || s > MAX_SCORE) return false;
  } else if (v.finishConfirmed) return false;
  return true;
}

const MAX_DONE = 100;

/** Persists pending entries and done markers. Never throws; reports availability instead. */
export class PendingStore {
  private entries: PendingEntry[] = [];
  private done: DoneRecord[] = [];
  private _available = true;
  quarantinedCount = 0;

  constructor(private readonly storage: KeyValueStorage | null) {
    if (!storage) {
      this._available = false;
      return;
    }
    try {
      const probe = `${PENDING_STORAGE_KEY}.probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch {
      this._available = false;
      return;
    }
    this.load();
  }

  get available(): boolean {
    return this._available;
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      this._available = false;
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      this._available = false;
    }
  }

  private load(): void {
    const raw = this.read(PENDING_STORAGE_KEY);
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) throw new Error('not an array');
        const ok: PendingEntry[] = [];
        const bad: unknown[] = [];
        for (const e of parsed) (isValidEntry(e) ? ok : bad).push(e);
        this.entries = ok;
        if (bad.length > 0) this.quarantine(bad);
      } catch {
        this.quarantine([raw]);
      }
    }
    const rawDone = this.read(DONE_STORAGE_KEY);
    if (rawDone) {
      try {
        const parsed: unknown = JSON.parse(rawDone);
        if (Array.isArray(parsed)) {
          this.done = parsed.filter(
            (d): d is DoneRecord =>
              isRecord(d) && typeof d.runId === 'string' && typeof d.playId === 'string' && typeof d.submissionId === 'string' &&
              typeof d.bestScore === 'number' && typeof d.isNewBest === 'boolean' && typeof d.isFirstPlay === 'boolean',
          );
        }
      } catch {
        this.done = [];
      }
    }
  }

  /** Keep unreadable data for inspection instead of silently dropping a player's result. */
  private quarantine(items: readonly unknown[]): void {
    this.quarantinedCount += items.length;
    let prev: unknown[] = [];
    try {
      const raw = this.read(QUARANTINE_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) prev = parsed;
    } catch {
      prev = [];
    }
    this.write(QUARANTINE_STORAGE_KEY, JSON.stringify([...prev, ...items].slice(-20)));
    this.persist();
  }

  private persist(): void {
    this.write(PENDING_STORAGE_KEY, JSON.stringify(this.entries));
    this.write(DONE_STORAGE_KEY, JSON.stringify(this.done));
  }

  list(): readonly PendingEntry[] {
    return this.entries;
  }

  find(runId: string): PendingEntry | undefined {
    return this.entries.find((e) => e.runId === runId);
  }

  findDone(runId: string): DoneRecord | undefined {
    return this.done.find((d) => d.runId === runId);
  }

  upsert(entry: PendingEntry): void {
    const i = this.entries.findIndex((e) => e.runId === entry.runId);
    if (i >= 0) this.entries = this.entries.map((e, j) => (j === i ? entry : e));
    else this.entries = [...this.entries, entry];
    this.persist();
  }

  remove(runId: string): void {
    this.entries = this.entries.filter((e) => e.runId !== runId);
    this.persist();
  }

  markDone(rec: DoneRecord): void {
    this.entries = this.entries.filter((e) => e.runId !== rec.runId);
    this.done = [...this.done.filter((d) => d.runId !== rec.runId), rec].slice(-MAX_DONE);
    this.persist();
  }
}
