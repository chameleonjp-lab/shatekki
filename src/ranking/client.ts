/**
 * Ranking client for the lab's v1 submission contract (Task 16).
 *
 * Flow per run: start_game_play_v1 (start_id fixed at run start) -> play_id ->
 * finish_game_play_v1 -> submit_score_idempotent_v1 (submission_id fixed per
 * result and reused on every retry). The old submit_score is never used.
 * Nothing is sent for anonymous, prototype, proposed, abandoned or invalid
 * results, nor while config.gameSlug is null (game not registered yet, O14).
 * Plain fetch against the public RPC endpoint; no secret is involved.
 *
 * The caller (src/app.ts) owns the wiring: beginRun at the start of a run
 * (name fixed there), submit(finalResult) when the run ends, retryPending on
 * load / when the browser comes back online, fetchTop for the list.
 */
import { isOfficialRankingEligible, type FinalResult, type KeyValueStorage, type RankingClient, type RunId, type SubmitStatus } from '../contracts';
import { MAX_SCORE, RANKING_CONFIG, type RankingConfig } from './config';
import { normalizePlayerName } from './name';
import { classifyHttpFailure, isRetryableReason, isUuid, PendingStore, type FailureKind, type PendingEntry } from './retry';

export type RankingOperation = 'start_game_play_v1' | 'finish_game_play_v1' | 'submit_score_idempotent_v1' | 'get_best_score_ranking';

export type NotEligibleReason =
  | 'not_ready' // gameSlug is null: the game is not registered yet
  | 'anonymous'
  | 'prototype'
  | 'abandoned'
  | 'invalid_name'
  | 'invalid_score'
  | 'name_mismatch';

/** SubmitStatus plus what the result screen needs. `state`/`reason` are the contract fields. */
export interface RankingSubmitStatus extends SubmitStatus {
  readonly bestScore?: number;
  readonly isNewBest?: boolean;
  readonly isFirstPlay?: boolean;
  /** False when the queue cannot be persisted: a closed page would lose the retry. */
  readonly storageAvailable: boolean;
}

export interface RankingRow {
  readonly rank_no: number;
  readonly display_name: string;
  readonly first_score: number;
  readonly best_score: number;
  readonly play_count: number;
  readonly updated_at: string | null;
}

export type TopState =
  | { readonly state: 'idle' }
  | { readonly state: 'loading'; readonly rows: readonly RankingRow[] }
  | { readonly state: 'ready'; readonly rows: readonly RankingRow[]; readonly fetchedAt: string }
  | { readonly state: 'failed'; readonly retryable: boolean }
  | { readonly state: 'unavailable' }; // game not registered yet

export interface RunHandle {
  readonly runId: RunId;
  /** True only if this run can ever be ranked (named, and the game is registered). */
  readonly ranked: boolean;
}

export interface RankingSnapshot {
  readonly storageAvailable: boolean;
  readonly pendingCount: number;
  readonly quarantinedCount: number;
}

export interface RankingService extends RankingClient {
  beginRun(input: { runId: RunId; playerName: string | null }): RunHandle;
  submit(result: FinalResult): Promise<RankingSubmitStatus>;
  retryPending(options?: { includePermanent?: boolean }): Promise<readonly RankingSubmitStatus[]>;
  getStatus(runId: RunId): RankingSubmitStatus;
  getSnapshot(): RankingSnapshot;
  fetchTop(): Promise<TopState>;
  getTop(): TopState;
  subscribe(listener: () => void): () => void;
  /** Resolves when background work (start requests, post-submit refresh) has settled. Mainly for tests. */
  flush(): Promise<void>;
}

export interface RankingServiceOptions {
  readonly config?: RankingConfig;
  readonly fetch?: typeof fetch | null;
  readonly storage?: KeyValueStorage | null;
  readonly idFactory?: () => string;
  readonly now?: () => Date;
}

function uuidV4(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function intIn(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
}

function safeCode(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const c = v.trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(c) ? c : null;
}

type RpcResult = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly kind: FailureKind; readonly code: string };

/** Find the participant's own rank in the top list, only when it is unambiguous. */
export function findOwnRank(rows: readonly RankingRow[], displayName: string, bestScore: number): number | null {
  const m = rows.filter((r) => r.display_name === displayName && r.best_score === bestScore);
  return m.length === 1 ? (m[0]?.rank_no ?? null) : null;
}

export function createRankingService(options: RankingServiceOptions = {}): RankingService {
  const config = options.config ?? RANKING_CONFIG;
  const fetchImpl: typeof fetch | null = options.fetch === undefined ? (typeof fetch === 'function' ? fetch.bind(globalThis) : null) : options.fetch;
  const idFactory = options.idFactory ?? uuidV4;
  const now = options.now ?? (() => new Date());
  const store = new PendingStore(options.storage === undefined ? null : options.storage);

  const statuses = new Map<string, RankingSubmitStatus>();
  const inflight = new Map<string, Promise<RankingSubmitStatus>>();
  const background = new Set<Promise<unknown>>();
  const listeners = new Set<() => void>();
  let top: TopState = { state: 'idle' };
  let topSeq = 0;
  let topApplied = 0;

  const notify = (): void => {
    for (const l of [...listeners]) {
      try {
        l();
      } catch {
        /* isolate UI listeners */
      }
    }
  };
  const status = (s: Omit<RankingSubmitStatus, 'storageAvailable'>): RankingSubmitStatus => ({ ...s, storageAvailable: store.available });
  const track = <T>(p: Promise<T>): Promise<T> => {
    background.add(p);
    const done = (): void => void background.delete(p);
    p.then(done, done);
    return p;
  };

  async function rpc(op: RankingOperation, args: Record<string, unknown>): Promise<RpcResult> {
    if (!fetchImpl) return { ok: false, kind: 'retryable_failed', code: 'FETCH_UNAVAILABLE' };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(`${config.supabaseUrl}/rest/v1/rpc/${op}`, {
        method: 'POST',
        headers: {
          apikey: config.publishableKey,
          Authorization: `Bearer ${config.publishableKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(args),
        signal: controller.signal,
      });
      let body: unknown = null;
      let invalidJson = false;
      try {
        body = await response.json();
      } catch {
        invalidJson = true;
      }
      if (!response.ok) {
        const eb = isRecord(body) ? body : {};
        const code = safeCode(eb.code) ?? `HTTP_${response.status}`;
        const message = typeof eb.message === 'string' ? eb.message.slice(0, 300) : '';
        return { ok: false, kind: classifyHttpFailure(response.status, safeCode(eb.code), message), code };
      }
      if (invalidJson) return { ok: false, kind: 'retryable_failed', code: 'INVALID_JSON' };
      return { ok: true, data: body };
    } catch (e) {
      const aborted = controller.signal.aborted || (e instanceof Error && e.name === 'AbortError');
      return { ok: false, kind: 'retryable_failed', code: aborted ? 'TIMEOUT' : 'NETWORK_ERROR' };
    } finally {
      clearTimeout(timer);
    }
  }

  function failure(entry: PendingEntry, phase: 'start' | 'finish' | 'submit', kind: FailureKind, code: string): RankingSubmitStatus {
    const latest = store.find(entry.runId) ?? entry;
    store.upsert({ ...latest, attempts: latest.attempts + 1, lastFailure: { phase, kind, code } });
    const s = status({ state: kind, reason: `${phase}:${code}` });
    statuses.set(entry.runId, s);
    notify();
    return s;
  }

  function serverRejection(entry: PendingEntry, phase: 'start' | 'finish' | 'submit', reason: unknown): RankingSubmitStatus {
    return failure(entry, phase, isRetryableReason(reason) ? 'retryable_failed' : 'permanent_failed', safeCode(reason) ?? 'REJECTED');
  }

  /** Step 1: obtain play_id. Idempotent on start_id. */
  async function ensureStarted(entry: PendingEntry): Promise<{ entry: PendingEntry } | { fail: RankingSubmitStatus }> {
    if (entry.playId) return { entry };
    const r = await rpc('start_game_play_v1', {
      p_start_id: entry.startId,
      p_display_name: entry.displayName,
      p_game_slug: entry.gameSlug,
      p_client_version: entry.clientVersion,
    });
    if (!r.ok) return { fail: failure(entry, 'start', r.kind, r.code) };
    const d = r.data;
    if (isRecord(d) && d.accepted === false) return { fail: serverRejection(entry, 'start', d.reason) };
    if (!isRecord(d) || d.accepted !== true || d.start_id !== entry.startId || d.game_slug !== entry.gameSlug || !isUuid(d.play_id) || d.display_name !== entry.displayName) {
      return { fail: failure(entry, 'start', 'retryable_failed', 'INVALID_START_RESPONSE') };
    }
    // Re-read: a result may have been frozen into the entry while the start request was in flight.
    const next: PendingEntry = { ...(store.find(entry.runId) ?? entry), playId: d.play_id, lastFailure: null };
    store.upsert(next);
    return { entry: next };
  }

  async function processEntry(runId: string, startOnly = false): Promise<RankingSubmitStatus> {
    let entry = store.find(runId);
    if (!entry) return statuses.get(runId) ?? status({ state: 'idle' });
    statuses.set(runId, status({ state: 'submitting' }));
    notify();

    const started = await ensureStarted(entry);
    if ('fail' in started) return started.fail;
    entry = started.entry;
    if (startOnly) {
      const idle = status({ state: 'idle' });
      statuses.set(runId, idle);
      notify();
      return idle;
    }
    const frozen = entry.result;
    const playId = entry.playId;
    if (!frozen || !playId) {
      // Started but no result yet: nothing more to do until the run ends.
      const s = status({ state: 'idle' });
      statuses.set(runId, s);
      notify();
      return s;
    }

    if (!entry.finishConfirmed) {
      const f = await rpc('finish_game_play_v1', {
        p_play_id: playId,
        p_display_name: entry.displayName,
        p_game_slug: entry.gameSlug,
        p_result_type: 'game_over', // the game has no victory state; a completed run ends when ammo runs out
        p_reached_wave: 1,
        p_score: frozen.score,
        p_client_version: entry.clientVersion,
        p_ranking_score: null,
      });
      if (!f.ok) return failure(entry, 'finish', f.kind, f.code);
      const d = f.data;
      if (isRecord(d) && d.accepted === false) return serverRejection(entry, 'finish', d.reason);
      if (!isRecord(d) || d.accepted !== true || d.play_id !== playId || d.game_slug !== entry.gameSlug || d.score !== frozen.score) {
        return failure(entry, 'finish', 'retryable_failed', 'INVALID_FINISH_RESPONSE');
      }
      entry = { ...entry, finishConfirmed: true, lastFailure: null };
      store.upsert(entry);
    }

    const s = await rpc('submit_score_idempotent_v1', {
      p_play_id: playId,
      p_submission_id: frozen.submissionId,
      p_display_name: entry.displayName,
      p_game_slug: entry.gameSlug,
      p_score: frozen.score,
      p_client_version: entry.clientVersion,
    });
    if (!s.ok) return failure(entry, 'submit', s.kind, s.code);
    const rows = s.data;
    const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    if (isRecord(row) && row.accepted === false) return serverRejection(entry, 'submit', row.reason);
    if (
      !isRecord(row) || row.accepted !== true || row.result_submission_id !== frozen.submissionId || row.result_play_id !== playId ||
      !intIn(row.result_best_score, frozen.score, MAX_SCORE) || typeof row.is_new_best !== 'boolean' || typeof row.is_first_play !== 'boolean'
    ) {
      return failure(entry, 'submit', 'retryable_failed', 'INVALID_SUBMIT_RESPONSE');
    }
    store.markDone({
      runId, playId, submissionId: frozen.submissionId,
      bestScore: row.result_best_score, isNewBest: row.is_new_best, isFirstPlay: row.is_first_play,
    });
    const done = status({ state: 'submitted', bestScore: row.result_best_score, isNewBest: row.is_new_best, isFirstPlay: row.is_first_play });
    statuses.set(runId, done);
    notify();
    // Registration succeeded: fetch the latest board (newest request wins).
    void track(fetchTop());
    return done;
  }

  /** One processor per run at a time, in order. processEntry is idempotent on persisted state. */
  function run(runId: string, startOnly = false): Promise<RankingSubmitStatus> {
    const prev = inflight.get(runId) ?? Promise.resolve(status({ state: 'idle' }));
    const p = prev.catch(() => status({ state: 'idle' })).then(() => processEntry(runId, startOnly));
    inflight.set(runId, p);
    const cleanup = (): void => {
      if (inflight.get(runId) === p) inflight.delete(runId);
    };
    p.then(cleanup, cleanup);
    return p;
  }

  async function fetchTop(): Promise<TopState> {
    if (!config.gameSlug) {
      top = { state: 'unavailable' };
      notify();
      return top;
    }
    topSeq += 1;
    const seq = topSeq;
    const previousRows: readonly RankingRow[] = top.state === 'ready' || top.state === 'loading' ? top.rows : [];
    top = { state: 'loading', rows: previousRows };
    notify();
    const r = await rpc('get_best_score_ranking', { p_game_slug: config.gameSlug, p_limit: config.topLimit });
    // A response older than one already applied must never overwrite it.
    if (seq < topApplied) return top;
    let next: TopState;
    if (!r.ok) next = { state: 'failed', retryable: r.kind === 'retryable_failed' };
    else {
      const rows = parseRows(r.data, config.topLimit);
      next = rows ? { state: 'ready', rows, fetchedAt: now().toISOString() } : { state: 'failed', retryable: true };
    }
    topApplied = seq;
    top = next;
    notify();
    return top;
  }

  function notEligible(reason: NotEligibleReason, runId?: string): RankingSubmitStatus {
    const s = status({ state: 'not_eligible', reason });
    if (runId) statuses.set(runId, s);
    return s;
  }

  const service: RankingService = {
    beginRun({ runId, playerName }) {
      const id = String(runId);
      const name = normalizePlayerName(playerName);
      if (!config.gameSlug || name === null) return { runId, ranked: false };
      if (!store.find(id) && !store.findDone(id)) {
        store.upsert({
          schema: 1, runId: id, startId: idFactory(), gameSlug: config.gameSlug, clientVersion: config.clientVersion,
          displayName: name, playId: null, result: null, finishConfirmed: false, attempts: 0, lastFailure: null,
        });
        // Best-effort start in the background; it is retried at submit time anyway.
        void track(run(id, true));
      }
      return { runId, ranked: true };
    },

    async submit(result) {
      const id = String(result.runId);
      if (!config.gameSlug) return notEligible('not_ready', id);
      if (result.status === 'abandoned') {
        const pending = store.find(id);
        if (pending) store.remove(id); // decision 27: no finish, no score for an abandoned run
        return notEligible('abandoned', id);
      }
      if (result.playerName === null) return notEligible('anonymous', id);
      if (result.valueStatus !== 'approved') return notEligible('prototype', id);
      const name = normalizePlayerName(result.playerName);
      if (name === null) return notEligible('invalid_name', id);
      if (!isOfficialRankingEligible(result)) return notEligible('prototype', id);
      if (!intIn(result.score, 0, MAX_SCORE)) return notEligible('invalid_score', id);

      const done = store.findDone(id);
      if (done) {
        const s = status({ state: 'submitted', bestScore: done.bestScore, isNewBest: done.isNewBest, isFirstPlay: done.isFirstPlay });
        statuses.set(id, s);
        return s;
      }

      let entry = store.find(id);
      if (entry && entry.displayName !== name) return notEligible('name_mismatch', id);
      if (!entry) {
        entry = {
          schema: 1, runId: id, startId: idFactory(), gameSlug: config.gameSlug, clientVersion: config.clientVersion,
          displayName: name, playId: null, result: null, finishConfirmed: false, attempts: 0, lastFailure: null,
        };
      }
      if (entry.result && entry.result.score !== result.score) {
        const s = status({ state: 'permanent_failed', reason: 'payload_conflict' });
        return s; // the frozen result stays untouched
      }
      if (!entry.result) entry = { ...entry, result: { score: result.score, submissionId: idFactory() } };
      store.upsert(entry);
      return run(id);
    },

    async retryPending(opts) {
      const out: RankingSubmitStatus[] = [];
      for (const e of [...store.list()]) {
        if (e.lastFailure?.kind === 'permanent_failed' && !opts?.includePermanent) continue;
        if (!e.result) {
          // Started-only entries are retried only to obtain the play_id.
          out.push(await run(e.runId));
          continue;
        }
        out.push(await run(e.runId));
      }
      return out;
    },

    getStatus(runId) {
      const known = statuses.get(String(runId));
      if (known) return known;
      const done = store.findDone(String(runId));
      if (done) return status({ state: 'submitted', bestScore: done.bestScore, isNewBest: done.isNewBest, isFirstPlay: done.isFirstPlay });
      const e = store.find(String(runId));
      if (e?.lastFailure) return status({ state: e.lastFailure.kind, reason: `${e.lastFailure.phase}:${e.lastFailure.code ?? 'ERROR'}` });
      return status({ state: 'idle' });
    },

    getSnapshot() {
      return { storageAvailable: store.available, pendingCount: store.list().length, quarantinedCount: store.quarantinedCount };
    },

    getTop: () => top,

    fetchTop: () => fetchTop(),

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async flush() {
      while (background.size > 0) await Promise.allSettled([...background]);
    },
  };
  return service;
}

function parseRows(data: unknown, limit: number): RankingRow[] | null {
  if (!Array.isArray(data) || data.length > limit) return null;
  const rows: RankingRow[] = [];
  for (const v of data) {
    if (
      !isRecord(v) || !intIn(v.rank_no, 1, Number.MAX_SAFE_INTEGER) || typeof v.display_name !== 'string' ||
      normalizePlayerName(v.display_name) === null || !intIn(v.first_score, 0, MAX_SCORE) || !intIn(v.best_score, 0, MAX_SCORE) ||
      !intIn(v.play_count, 1, Number.MAX_SAFE_INTEGER) || (v.updated_at !== null && typeof v.updated_at !== 'string')
    ) {
      return null;
    }
    rows.push({ rank_no: v.rank_no, display_name: v.display_name, first_score: v.first_score, best_score: v.best_score, play_count: v.play_count, updated_at: v.updated_at });
  }
  return rows;
}
