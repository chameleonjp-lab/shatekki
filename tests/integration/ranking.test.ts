import { describe, expect, it } from 'vitest';
import type { FinalResult, KeyValueStorage, RunId } from '../../src/contracts';
import { createRankingService, findOwnRank } from '../../src/ranking/client';
import { RANKING_CONFIG, type RankingConfig } from '../../src/ranking/config';
import { nextRetryDelayMs, classifyHttpFailure, PendingStore } from '../../src/ranking/retry';
import { checkName, normalizePlayerName } from '../../src/ranking/name';

const SLUG = 'test_game_slug'; // test-only; the real slug does not exist yet (O14)
const CONFIG: RankingConfig = { ...RANKING_CONFIG, gameSlug: SLUG, timeoutMs: 2000 };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

function brokenStorage(): KeyValueStorage {
  return {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {
      throw new Error('denied');
    },
  };
}

function counterIds(): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
}

interface Call {
  op: string;
  body: Record<string, unknown>;
}

/** In-memory stand-in for the lab RPCs with the same idempotency rules. */
class FakeLab {
  calls: Call[] = [];
  plays = new Map<string, { playId: string; name: string }>();
  playIds = new Set<string>();
  submissions = new Map<string, Record<string, unknown>>();
  scoreRuns: Array<{ playId: string; submissionId: string; score: number }> = [];
  loseResponse = new Map<string, number>(); // op -> how many responses to lose after processing
  failStatus = new Map<string, { status: number; body: unknown; times: number }>();
  rejectSubmit: string | null = null;
  ranking: Array<Record<string, unknown>> = [];
  rankingGate: Array<(v: void) => void> = [];
  holdRanking = false;
  private seq = 0;

  fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const op = url.split('/rpc/')[1] ?? '';
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    this.calls.push({ op, body });
    const headers = init?.headers as Record<string, string>;
    if (!headers.apikey || headers.Authorization !== `Bearer ${headers.apikey}`) return new Response('{}', { status: 401 });
    const fail = this.failStatus.get(op);
    if (fail && fail.times > 0) {
      fail.times -= 1;
      return new Response(JSON.stringify(fail.body), { status: fail.status });
    }
    const result = await this.handle(op, body);
    const lose = this.loseResponse.get(op) ?? 0;
    if (lose > 0) {
      this.loseResponse.set(op, lose - 1);
      throw new TypeError('network connection lost');
    }
    return new Response(JSON.stringify(result), { status: 200 });
  };

  private async handle(op: string, b: Record<string, unknown>): Promise<unknown> {
    if (op === 'start_game_play_v1') {
      const startId = String(b.p_start_id);
      let rec = this.plays.get(startId);
      const duplicate = rec !== undefined;
      if (!rec) {
        this.seq += 1;
        rec = { playId: `11111111-1111-4111-8111-${String(this.seq).padStart(12, '0')}`, name: String(b.p_display_name) };
        this.plays.set(startId, rec);
        this.playIds.add(rec.playId);
      }
      return {
        accepted: true, start_id: startId, game_slug: b.p_game_slug, play_id: rec.playId,
        display_name: b.p_display_name, normalized_name: b.p_display_name, client_version: b.p_client_version, duplicate,
      };
    }
    if (op === 'finish_game_play_v1') {
      return { accepted: true, play_id: b.p_play_id, game_slug: b.p_game_slug, result_type: b.p_result_type, reached_wave: b.p_reached_wave, score: b.p_score };
    }
    if (op === 'submit_score_idempotent_v1') {
      if (this.rejectSubmit) return [{ accepted: false, reason: this.rejectSubmit }];
      const sid = String(b.p_submission_id);
      const existing = this.submissions.get(sid);
      if (existing) return [{ ...existing, was_duplicate: true }];
      this.scoreRuns.push({ playId: String(b.p_play_id), submissionId: sid, score: Number(b.p_score) });
      const row = {
        accepted: true, result_submission_id: sid, result_play_id: b.p_play_id, result_display_name: b.p_display_name,
        result_normalized_name: b.p_display_name, result_first_score: b.p_score, result_best_score: b.p_score, result_play_count: 1,
        is_first_play: true, is_new_best: true, was_duplicate: false,
      };
      this.submissions.set(sid, row);
      return [row];
    }
    if (op === 'get_best_score_ranking') {
      const snapshot = this.ranking.map((r) => ({ ...r }));
      if (this.holdRanking) await new Promise<void>((res) => this.rankingGate.push(res));
      return snapshot;
    }
    throw new Error(`unexpected rpc ${op}`);
  }

  count(op: string): number {
    return this.calls.filter((c) => c.op === op).length;
  }
}

function result(over: Partial<FinalResult> = {}): FinalResult {
  return {
    runId: 'run-1' as RunId, rulesVersion: 'rules-1', valueStatus: 'approved', status: 'completed', score: 1234, shotsFired: 14,
    collected: [], completedSets: [], maxChain: 2, ledger: [], playerName: 'たろう', ...over,
  };
}

function setup(over: { config?: RankingConfig; storage?: KeyValueStorage | null; lab?: FakeLab } = {}) {
  const lab = over.lab ?? new FakeLab();
  const storage = over.storage === undefined ? memoryStorage() : over.storage;
  const svc = createRankingService({ config: over.config ?? CONFIG, fetch: lab.fetch as typeof fetch, storage, idFactory: counterIds(), now: () => new Date('2026-11-06T00:00:00Z') });
  return { lab, storage, svc };
}

describe('eligibility: what is never sent', () => {
  it('sends nothing while gameSlug is null (the shipped config)', async () => {
    expect(RANKING_CONFIG.gameSlug).toBeNull();
    expect(RANKING_CONFIG.canonicalUrl).toBeNull();
    expect(RANKING_CONFIG.labDetailUrl).toBeNull();
    const { lab, svc } = setup({ config: RANKING_CONFIG });
    const h = svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    expect(h.ranked).toBe(false);
    const st = await svc.submit(result({ valueStatus: 'approved' }));
    expect(st.state).toBe('not_eligible');
    expect(st.reason).toBe('not_ready');
    expect(lab.calls).toHaveLength(0);
  });

  it('anonymous runs never send anything, not even a start', async () => {
    const { lab, svc } = setup();
    const h = svc.beginRun({ runId: 'run-1' as RunId, playerName: null });
    expect(h.ranked).toBe(false);
    const st = await svc.submit(result({ playerName: null }));
    expect(st).toMatchObject({ state: 'not_eligible', reason: 'anonymous' });
    expect(lab.calls).toHaveLength(0);
  });

  it('prototype and proposed values are never sent (only approved)', async () => {
    for (const valueStatus of ['prototype', 'proposed'] as const) {
      const { lab, svc } = setup();
      svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
      const before = lab.calls.length;
      const st = await svc.submit(result({ valueStatus }));
      expect(st).toMatchObject({ state: 'not_eligible', reason: 'prototype' });
      expect(lab.calls.length).toBe(before);
      expect(lab.count('finish_game_play_v1') + lab.count('submit_score_idempotent_v1')).toBe(0);
    }
  });

  it('abandoned runs send no finish and no score (decision 27)', async () => {
    const { lab, svc } = setup();
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    await svc.flush();
    const st = await svc.submit(result({ status: 'abandoned' }));
    expect(st).toMatchObject({ state: 'not_eligible', reason: 'abandoned' });
    expect(lab.count('finish_game_play_v1')).toBe(0);
    expect(lab.count('submit_score_idempotent_v1')).toBe(0);
    expect(svc.getSnapshot().pendingCount).toBe(0);
  });

  it('invalid names and scores are rejected before any request', async () => {
    const { lab, svc } = setup();
    const long = 'あ'.repeat(21);
    expect((await svc.submit(result({ playerName: long }))).state).toBe('not_eligible');
    expect((await svc.submit(result({ runId: 'run-2' as RunId, score: -1 }))).state).toBe('not_eligible');
    expect((await svc.submit(result({ runId: 'run-3' as RunId, score: 1.5 }))).state).toBe('not_eligible');
    expect(lab.calls).toHaveLength(0);
  });

  it('a name different from the one fixed at start is refused (no after-the-fact publishing)', async () => {
    const { lab, svc } = setup();
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    await svc.flush();
    const st = await svc.submit(result({ playerName: 'じろう' }));
    expect(st).toMatchObject({ state: 'not_eligible', reason: 'name_mismatch' });
    expect(lab.count('submit_score_idempotent_v1')).toBe(0);
  });
});

describe('v1 contract flow', () => {
  it('start -> finish -> submit with ids fixed per run, then the board refreshes', async () => {
    const { lab, svc } = setup();
    lab.ranking = [{ rank_no: 1, display_name: 'たろう', first_score: 1234, best_score: 1234, play_count: 1, updated_at: null }];
    const h = svc.beginRun({ runId: 'run-1' as RunId, playerName: '  たろう  ' });
    expect(h.ranked).toBe(true);
    const st = await svc.submit(result({ playerName: 'たろう' }));
    expect(st.state).toBe('submitted');
    expect(st.bestScore).toBe(1234);
    expect(lab.calls.map((c) => c.op).filter((o) => o !== 'get_best_score_ranking')).toEqual([
      'start_game_play_v1', 'finish_game_play_v1', 'submit_score_idempotent_v1',
    ]);
    const start = lab.calls.find((c) => c.op === 'start_game_play_v1')!.body;
    expect(start).toMatchObject({ p_display_name: 'たろう', p_game_slug: SLUG, p_client_version: CONFIG.clientVersion });
    expect(String(start.p_start_id)).toMatch(UUID_RE);
    const sub = lab.calls.find((c) => c.op === 'submit_score_idempotent_v1')!.body;
    expect(sub).toMatchObject({ p_score: 1234, p_game_slug: SLUG, p_display_name: 'たろう' });
    expect(String(sub.p_submission_id)).toMatch(UUID_RE);
    expect(lab.scoreRuns).toHaveLength(1);
    // after success the top list is re-fetched
    await svc.flush();
    expect(lab.count('get_best_score_ranking')).toBe(1);
    expect(svc.getTop().state).toBe('ready');
  });

  it('never calls the old submit_score / record_* endpoints', async () => {
    const { lab, svc } = setup();
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    await svc.submit(result());
    await svc.fetchTop();
    const allowed = new Set(['start_game_play_v1', 'finish_game_play_v1', 'submit_score_idempotent_v1', 'get_best_score_ranking']);
    for (const c of lab.calls) expect(allowed.has(c.op), c.op).toBe(true);
  });

  it('duplicate retry after a lost submit response registers once with the same ids', async () => {
    const { lab, svc } = setup();
    lab.loseResponse.set('submit_score_idempotent_v1', 1);
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    const first = await svc.submit(result());
    expect(first.state).toBe('retryable_failed');
    expect(lab.scoreRuns).toHaveLength(1); // server already took it
    const again = await svc.retryPending();
    expect(again[0]?.state).toBe('submitted');
    expect(lab.scoreRuns).toHaveLength(1);
    const subs = lab.calls.filter((c) => c.op === 'submit_score_idempotent_v1');
    expect(subs).toHaveLength(2);
    expect(subs[1]!.body.p_submission_id).toBe(subs[0]!.body.p_submission_id);
    expect(subs[1]!.body.p_play_id).toBe(subs[0]!.body.p_play_id);
    expect(svc.getSnapshot().pendingCount).toBe(0);
  });

  it('a lost start response is retried with the same start_id and yields the same play_id', async () => {
    const { lab, svc } = setup();
    lab.loseResponse.set('start_game_play_v1', 1);
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    await svc.flush();
    const st = await svc.submit(result());
    expect(st.state).toBe('submitted');
    const starts = lab.calls.filter((c) => c.op === 'start_game_play_v1');
    expect(starts).toHaveLength(2);
    expect(starts[1]!.body.p_start_id).toBe(starts[0]!.body.p_start_id);
    expect(lab.plays.size).toBe(1);
    expect(lab.scoreRuns).toHaveLength(1);
  });

  it('survives a reload: the pending entry resumes with the same ids', async () => {
    const storage = memoryStorage();
    const lab = new FakeLab();
    lab.failStatus.set('submit_score_idempotent_v1', { status: 503, body: { message: 'unavailable' }, times: 1 });
    const a = setup({ storage, lab });
    a.svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    expect((await a.svc.submit(result())).state).toBe('retryable_failed');
    const firstSubmission = lab.calls.filter((c) => c.op === 'submit_score_idempotent_v1')[0]!.body.p_submission_id;
    const b = setup({ storage, lab }); // new page load, same storage
    expect(b.svc.getSnapshot().pendingCount).toBe(1);
    const [st] = await b.svc.retryPending();
    expect(st?.state).toBe('submitted');
    const subs = lab.calls.filter((c) => c.op === 'submit_score_idempotent_v1');
    expect(subs[subs.length - 1]!.body.p_submission_id).toBe(firstSubmission);
    expect(lab.scoreRuns).toHaveLength(1);
  });

  it('submitting the same finished run again after reload sends nothing new', async () => {
    const storage = memoryStorage();
    const lab = new FakeLab();
    const a = setup({ storage, lab });
    a.svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    expect((await a.svc.submit(result())).state).toBe('submitted');
    const callsBefore = lab.calls.length;
    const b = setup({ storage, lab });
    const st = await b.svc.submit(result());
    expect(st.state).toBe('submitted');
    expect(lab.calls.length).toBe(callsBefore);
    expect(lab.scoreRuns).toHaveLength(1);
  });

  it('concurrent submit calls for the same run send one set of requests', async () => {
    const { lab, svc } = setup();
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    const [a, b] = await Promise.all([svc.submit(result()), svc.submit(result())]);
    expect(a.state).toBe('submitted');
    expect(b.state).toBe('submitted');
    expect(lab.count('submit_score_idempotent_v1')).toBe(1);
    expect(lab.scoreRuns).toHaveLength(1);
  });

  it('a different score for an already frozen run is refused (the frozen result wins)', async () => {
    const { lab, svc } = setup();
    lab.failStatus.set('submit_score_idempotent_v1', { status: 503, body: {}, times: 1 });
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    await svc.submit(result({ score: 100 }));
    const st = await svc.submit(result({ score: 99999 }));
    expect(st.state).toBe('permanent_failed');
    expect(st.reason).toBe('payload_conflict');
    expect(lab.scoreRuns.every((r) => r.score !== 99999)).toBe(true);
  });

  it('http 5xx and 429 are retryable, a server rejection is permanent and is not auto-retried', async () => {
    expect(classifyHttpFailure(503, null, '')).toBe('retryable_failed');
    expect(classifyHttpFailure(429, null, '')).toBe('retryable_failed');
    expect(classifyHttpFailure(400, 'P0001', 'invalid_game')).toBe('permanent_failed');
    const { lab, svc } = setup();
    lab.rejectSubmit = 'game_not_found';
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    const st = await svc.submit(result());
    expect(st.state).toBe('permanent_failed');
    const n = lab.count('submit_score_idempotent_v1');
    await svc.retryPending();
    expect(lab.count('submit_score_idempotent_v1')).toBe(n);
    await svc.retryPending({ includePermanent: true });
    expect(lab.count('submit_score_idempotent_v1')).toBe(n + 1);
  });

  it('a failed send keeps the local result and queue entry', async () => {
    const { lab, svc } = setup();
    lab.failStatus.set('finish_game_play_v1', { status: 500, body: {}, times: 1 });
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    const st = await svc.submit(result());
    expect(st.state).toBe('retryable_failed');
    expect(svc.getSnapshot().pendingCount).toBe(1);
    expect(svc.getStatus('run-1' as RunId).state).toBe('retryable_failed');
  });

  it('backoff is exponential and capped', () => {
    expect(nextRetryDelayMs(0)).toBe(2000);
    expect(nextRetryDelayMs(3)).toBe(16000);
    expect(nextRetryDelayMs(50)).toBe(5 * 60_000);
  });
});

describe('storage', () => {
  it('flags storage_unavailable but still works from memory', async () => {
    const { lab, svc } = setup({ storage: brokenStorage() });
    expect(svc.getSnapshot().storageAvailable).toBe(false);
    svc.beginRun({ runId: 'run-1' as RunId, playerName: 'たろう' });
    const st = await svc.submit(result());
    expect(st.state).toBe('submitted');
    expect(st.storageAvailable).toBe(false);
    expect(lab.scoreRuns).toHaveLength(1);
  });

  it('works with no storage at all', async () => {
    const { svc } = setup({ storage: null });
    expect(svc.getSnapshot().storageAvailable).toBe(false);
  });

  it('quarantines corrupted queue data instead of dropping it silently', () => {
    const storage = memoryStorage();
    storage.setItem('shatekki.ranking-pending.v1', '{not json');
    const store = new PendingStore(storage);
    expect(store.list()).toHaveLength(0);
    expect(store.quarantinedCount).toBe(1);
    expect(storage.getItem('shatekki.ranking-pending-quarantine.v1')).toContain('not json');
  });
});

describe('top 30', () => {
  const row = (rank: number, name: string, best: number) => ({ rank_no: rank, display_name: name, first_score: best, best_score: best, play_count: 1, updated_at: null });

  it('passes through rank_no from the RPC (ties 1,1,3), asks for 30 participants, does not recompute', async () => {
    const { lab, svc } = setup();
    lab.ranking = [row(1, 'a', 500), row(1, 'b', 500), row(3, 'c', 400)];
    const top = await svc.fetchTop();
    expect(top.state).toBe('ready');
    if (top.state !== 'ready') throw new Error('unreachable');
    expect(top.rows.map((r) => r.rank_no)).toEqual([1, 1, 3]);
    expect(lab.calls[0]!.body).toEqual({ p_game_slug: SLUG, p_limit: 30 });
  });

  it('an older response arriving late never overwrites a newer one', async () => {
    const { lab, svc } = setup();
    lab.holdRanking = true;
    lab.ranking = [row(1, 'old', 100)];
    const first = svc.fetchTop(); // issued first, will be released last
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 5));
    lab.ranking = [row(1, 'new', 900)];
    const second = svc.fetchTop();
    await new Promise((r) => setTimeout(r, 5));
    expect(lab.rankingGate).toHaveLength(2);
    lab.rankingGate[1]!(); // newer resolves first
    await second;
    lab.rankingGate[0]!(); // older resolves late
    await first;
    const top = svc.getTop();
    expect(top.state).toBe('ready');
    if (top.state === 'ready') expect(top.rows[0]!.display_name).toBe('new');
  });

  it('reports failure and recovers on retry', async () => {
    const { lab, svc } = setup();
    lab.failStatus.set('get_best_score_ranking', { status: 503, body: {}, times: 1 });
    expect((await svc.fetchTop()).state).toBe('failed');
    lab.ranking = [];
    const again = await svc.fetchTop();
    expect(again.state).toBe('ready');
    if (again.state === 'ready') expect(again.rows).toHaveLength(0);
  });

  it('rejects malformed rows rather than showing garbage', async () => {
    const { lab, svc } = setup();
    lab.ranking = [{ rank_no: 'x', display_name: 5 }];
    expect((await svc.fetchTop()).state).toBe('failed');
  });

  it('is unavailable (not failed) while gameSlug is null', async () => {
    const { lab, svc } = setup({ config: RANKING_CONFIG });
    expect((await svc.fetchTop()).state).toBe('unavailable');
    expect(lab.calls).toHaveLength(0);
  });

  it('own rank is only shown when exactly one row matches name and best (never guessed)', () => {
    const rows = [row(1, 'a', 500), row(2, 'たろう', 300), row(2, 'たろう', 300), row(4, 'z', 100)];
    expect(findOwnRank(rows, 'a', 500)).toBe(1);
    expect(findOwnRank(rows, 'たろう', 300)).toBeNull(); // same-name participants are not merged or guessed
    expect(findOwnRank(rows, 'nobody', 5)).toBeNull();
  });
});

describe('name rules', () => {
  it('trims and counts Unicode code points like the v1 contract', () => {
    expect(normalizePlayerName('  たろう ')).toBe('たろう');
    expect(normalizePlayerName('😀'.repeat(20))).toBe('😀'.repeat(20));
    expect(normalizePlayerName('😀'.repeat(21))).toBeNull();
    expect(checkName('   ').status).toBe('empty');
    expect(checkName('a\nb').status).toBe('ok');
    expect(normalizePlayerName('a\nb')).toBe('a b');
  });
});
