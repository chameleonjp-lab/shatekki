import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { FinalResult, PrizeInstanceId, PrizeTypeId, RunId, ScoreLedgerEntry, SetId, ShotId } from '../../src/contracts';
import { LOCALES, translate } from '../../src/i18n';
import { prizeName, setName } from '../../src/i18n/content';
import { homeViewModel } from '../../src/ui/home';
import { RESULT_SECTION_ORDER, resultViewModel, type ResultInput } from '../../src/ui/result';
import { setBookViewModel } from '../../src/ui/set-book';
import { settingsViewModel } from '../../src/ui/settings';
import { AUDIO_STORAGE_KEY, DEFAULT_AUDIO, loadAudio, parseAudioPrefs, saveAudio } from '../../src/ui/prefs';
import type { PublicLinks } from '../../src/ranking/config';
import type { RankingRow, RankingSubmitStatus, TopState } from '../../src/ranking/client';

const NO_LINKS: PublicLinks = { canonicalUrl: null, labDetailUrl: null };
const SET_LINKS: PublicLinks & { canonicalUrl: string; labDetailUrl: string } = { canonicalUrl: 'https://example.invalid/g/', labDetailUrl: 'https://example.invalid/lab/ranking' };

function mem() {
  const d = new Map<string, string>();
  return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k), d };
}

const home = (over: Partial<Parameters<typeof homeViewModel>[0]> = {}, links = NO_LINKS, loc: (typeof LOCALES)[number] = 'ja') =>
  homeViewModel({ nameDraft: '', selfBest: null, audio: DEFAULT_AUDIO, prototype: false, rankingAvailable: true, ...over }, links, loc);

describe('home view-model', () => {
  it('private mode hides public-name and ranking controls and ignores a previously saved name', () => {
    const vm = home({ nameDraft: '😀'.repeat(21), rankingAvailable: false }, SET_LINKS);
    expect(vm.name.visible).toBe(false);
    expect(vm.ranking.visible).toBe(false);
    expect(vm.ranking.enabled).toBe(false);
    expect(vm.ranking.url).toBeNull();
    expect(vm.canStart).toBe(true);
    expect(vm.startName).toBeNull();
  });

  it('defaults to private mode until a ranking page is configured', () => {
    const vm = homeViewModel({ nameDraft: 'たろう', selfBest: null, audio: DEFAULT_AUDIO, prototype: false }, NO_LINKS, 'ja');
    expect(vm.name.visible).toBe(false);
    expect(vm.startName).toBeNull();
  });

  it('shows the exact name explanation and lets an empty name start anonymously', () => {
    const vm = home();
    expect(vm.name.explain).toBe('名前を入力すると、名前と記録がランキングに公開されます。空欄でも遊べます。');
    expect(vm.name.status).toBe('empty');
    expect(vm.canStart).toBe(true);
    expect(vm.startName).toBeNull();
    expect(home({ nameDraft: '   ' }).startName).toBeNull();
  });

  it('fixes a valid trimmed name for the run, 20 code points max', () => {
    expect(home({ nameDraft: '  たろう  ' }).startName).toBe('たろう');
    expect(home({ nameDraft: '😀'.repeat(20) }).canStart).toBe(true);
    const long = home({ nameDraft: '😀'.repeat(21) });
    expect(long.canStart).toBe(false);
    expect(long.startName).toBeNull();
    expect(long.name.error).toBe('名前は20文字までです。');
    expect(long.name.length).toBe(21);
  });

  it('keeps the name as plain data (markup is not interpreted or altered into HTML)', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const vm = home({ nameDraft: evil });
    expect(vm.canStart).toBe(false); // 28 chars: too long, and it is only ever shown as text
    expect(vm.startName).toBeNull();
    const short = '<b>x</b>';
    expect(home({ nameDraft: short }).startName).toBe(short);
  });

  it('src/ui never uses HTML injection APIs', () => {
    const dir = resolve(__dirname, '..', '..', 'src', 'ui');
    const files = readdirSync(dir).filter((f) => f.endsWith('.ts'));
    expect(files).toEqual(expect.arrayContaining(['home.ts', 'result.ts', 'set-book.ts', 'settings.ts', 'share.ts']));
    for (const f of files) {
      const text = readFileSync(join(dir, f), 'utf8');
      expect(text, f).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/);
    }
  });

  it('disables the ranking button with a "準備中" note while the lab URL is unknown', () => {
    const vm = home({}, NO_LINKS);
    expect(vm.ranking.enabled).toBe(false);
    expect(vm.ranking.url).toBeNull();
    expect(vm.ranking.note).toBe('準備中');
    const on = home({}, SET_LINKS);
    expect(on.ranking.enabled).toBe(true);
    expect(on.ranking.url).toBe(SET_LINKS.labDetailUrl);
    expect(on.ranking.note).toBeNull();
  });

  it('shows the local self best or "not yet"', () => {
    expect(home({ selfBest: null }).bestText).toBe('自己ベスト：まだありません');
    expect(home({ selfBest: 12345 }).bestText).toBe('自己ベスト：12,345点');
    expect(home({ selfBest: 0 }).bestText).toBe('自己ベスト：0点');
  });

  it('share text on home carries the URL only once it is configured', () => {
    expect(home({}, NO_LINKS).shareText).not.toMatch(/https?:/);
    expect(home({}, SET_LINKS).shareText).toContain(SET_LINKS.canonicalUrl);
  });

  it('shows the prototype notice only for prototype values', () => {
    expect(home({ prototype: true }).prototypeNotice).toBe('試作の数値で動いています（正式ランキング対象外）');
    expect(home({ prototype: false }).prototypeNotice).toBeNull();
  });

  it('every locale builds a complete home model with non-empty labels', () => {
    for (const loc of LOCALES) {
      const vm = home({ nameDraft: 'x' }, SET_LINKS, loc);
      for (const s of [vm.title, vm.startLabel, vm.howtoLabel, vm.shareLabel, vm.ranking.label, vm.name.explain, vm.settingsLabel]) expect(s.trim().length, loc).toBeGreaterThan(0);
    }
  });
});

// ------------------------------------------------------------------- result

const id = <T>(s: string) => s as unknown as T;

function ledger(over: Omit<Partial<ScoreLedgerEntry>, 'shotId'> & { shotId: string; scoreBefore: number }): ScoreLedgerEntry {
  const e: ScoreLedgerEntry = {
    shotId: id<ShotId>(over.shotId), scoreBefore: over.scoreBefore, prizePoints: over.prizePoints ?? 0, trickPoints: over.trickPoints ?? 0,
    setPoints: over.setPoints ?? 0, firstHitPoints: over.firstHitPoints ?? 0, nominalPenalty: over.nominalPenalty ?? 0,
    appliedPenalty: over.appliedPenalty ?? 0, scoreAfter: over.scoreAfter ?? 0, items: [],
  };
  return e;
}

const L1 = ledger({ shotId: 's01', scoreBefore: 0, prizePoints: 300, trickPoints: 50, firstHitPoints: 20, setPoints: 0, scoreAfter: 370 });
const L2 = ledger({ shotId: 's02', scoreBefore: 370, prizePoints: 100, setPoints: 500, nominalPenalty: 40, appliedPenalty: 40, scoreAfter: 930 });
const L3 = ledger({ shotId: 's03', scoreBefore: 930, nominalPenalty: 60, appliedPenalty: 60, scoreAfter: 870 });

function finalResult(over: Partial<FinalResult> = {}): FinalResult {
  const collected = [
    { instanceId: id<PrizeInstanceId>('i1'), typeId: id<PrizeTypeId>('P002'), shotId: id<ShotId>('s01') },
    { instanceId: id<PrizeInstanceId>('i2'), typeId: id<PrizeTypeId>('P002'), shotId: id<ShotId>('s01') },
    { instanceId: id<PrizeInstanceId>('i3'), typeId: id<PrizeTypeId>('P001'), shotId: id<ShotId>('s02') },
  ];
  return {
    runId: id<RunId>('run-1'), rulesVersion: 'r1', valueStatus: 'approved', status: 'completed', score: 870, shotsFired: 3, collected,
    completedSets: [id<SetId>('S001')], maxChain: 2, ledger: [L1, L2, L3], playerName: 'たろう', ...over,
  };
}

const row = (rank_no: number, display_name: string, best_score: number): RankingRow => ({ rank_no, display_name, first_score: best_score, best_score, play_count: 1, updated_at: null });
const submitted: RankingSubmitStatus = { state: 'submitted', bestScore: 870, isNewBest: true, isFirstPlay: true, storageAvailable: true };

function resultInput(over: Partial<ResultInput> = {}): ResultInput {
  return {
    result: finalResult(), selfBestBefore: null, submit: null, top: { state: 'idle' } as TopState, links: NO_LINKS, rankingAvailable: true, ...over,
  };
}

describe('result view-model', () => {
  it('private mode suppresses submit, own rank, top rows, and the ranking link even with stale ranking data', () => {
    const vm = resultViewModel(resultInput({
      rankingAvailable: false, links: SET_LINKS, submit: submitted,
      top: { state: 'ready', fetchedAt: 't', rows: [row(1, 'たろう', 870)] },
    }), 'ja');
    expect(vm.rankingAvailable).toBe(false);
    expect(vm.submit).toBeNull();
    expect(vm.rankText).toBeNull();
    expect(vm.top.rows).toEqual([]);
    expect(vm.top.canRetry).toBe(false);
    expect(vm.actions.ranking.enabled).toBe(false);
    expect(vm.actions.ranking.url).toBeNull();
    expect(vm.hero.value).toBe('870');
    expect(vm.best.text).toBe('自己ベスト：870点');
  });

  it('shows the total as the hero and puts retry right after it (first screenful), the rest scrolls', () => {
    const vm = resultViewModel(resultInput(), 'ja');
    expect(vm.hero.value).toBe('870');
    expect(RESULT_SECTION_ORDER.slice(0, 2)).toEqual(['hero', 'actions']);
    expect(RESULT_SECTION_ORDER).toEqual(expect.arrayContaining(['prizes', 'sets', 'chain', 'breakdown', 'submit', 'top']));
    expect(vm.actions.retry.label).toBe('もう一回');
    expect(vm.actions.home.label).toBe('ホームへ');
    expect(vm.actions.ranking.label).toBe('ランキング');
    expect(vm.actions.share.label).toBe('Xでシェア');
  });

  it('max chain is the confirmed value (most prizes in one shot), not re-derived', () => {
    const vm = resultViewModel(resultInput({ result: finalResult({ maxChain: 2 }) }), 'ja');
    expect(vm.chain.value).toBe(2);
    expect(vm.chain.text).toBe('2個');
  });

  it('groups collected prizes by kind with localized names; ids are kind ids', () => {
    const vm = resultViewModel(resultInput(), 'ja');
    expect(vm.prizes.total).toBe(3);
    expect(vm.prizes.items).toEqual([
      { typeId: 'P002', name: prizeName('ja', 'P002'), count: 2 },
      { typeId: 'P001', name: prizeName('ja', 'P001'), count: 1 },
    ]);
    expect(resultViewModel(resultInput({ result: finalResult({ collected: [] }) }), 'ja').prizes.emptyText).toBe('獲得した景品はありません。');
  });

  it('lists completed sets by name', () => {
    const vm = resultViewModel(resultInput(), 'ja');
    expect(vm.sets.items).toEqual([{ setId: 'S001', name: setName('ja', 'S001') }]);
  });

  it('breakdown comes from the ledger and reconciles with the final score', () => {
    const vm = resultViewModel(resultInput(), 'ja');
    const by = Object.fromEntries(vm.breakdown.rows.map((r) => [r.kind, r.points]));
    expect(by).toEqual({ prize: 400, trick: 50, set: 500, firstHit: 20, penalty: -100 });
    expect(vm.breakdown.total).toBe(870);
    expect(vm.breakdown.reconciled).toBe(true);
  });

  it('explains when the floor at zero reduced a penalty (nominal vs applied)', () => {
    const l = ledger({ shotId: 's01', scoreBefore: 10, prizePoints: 0, nominalPenalty: 50, appliedPenalty: 10, scoreAfter: 0 });
    const vm = resultViewModel(resultInput({ result: finalResult({ score: 0, ledger: [l] }) }), 'ja');
    expect(vm.breakdown.rows.find((r) => r.kind === 'penalty')?.points).toBe(-10);
    expect(vm.breakdown.penaltyNote).toBe('減点50点のうち10点を反映しました（得点は0点を下回りません）。');
  });

  it('flags a ledger that does not match the score instead of hiding it', () => {
    const vm = resultViewModel(resultInput({ result: finalResult({ score: 999 }) }), 'ja');
    expect(vm.breakdown.reconciled).toBe(false);
    expect(vm.hero.value).toBe('999'); // the screen never rewrites the confirmed score
  });

  it('new best vs self best', () => {
    expect(resultViewModel(resultInput({ selfBestBefore: 500 }), 'ja').newBest).toBe(true);
    expect(resultViewModel(resultInput({ selfBestBefore: 500 }), 'ja').best.text).toBe('自己ベスト：870点');
    const lower = resultViewModel(resultInput({ selfBestBefore: 2000 }), 'ja');
    expect(lower.newBest).toBe(false);
    expect(lower.best.text).toBe('自己ベスト：2,000点'); // a lower score never lowers the self best
    expect(resultViewModel(resultInput({ selfBestBefore: null }), 'ja').newBest).toBe(true);
    expect(resultViewModel(resultInput({ selfBestBefore: 870 }), 'ja').newBest).toBe(false);
  });

  it('abandoned runs are never a new best and say they were interrupted', () => {
    const vm = resultViewModel(resultInput({ result: finalResult({ status: 'abandoned' }), selfBestBefore: 1 }), 'ja');
    expect(vm.newBest).toBe(false);
    expect(vm.abandonedNotice).toBe('このプレイは中断されました');
    expect(vm.best.text).toBe('自己ベスト：1点');
  });

  describe('rank (only after a successful registration)', () => {
    const top: TopState = { state: 'ready', fetchedAt: 't', rows: [row(1, 'あ', 900), row(2, 'たろう', 870), row(3, 'い', 100)] };

    it('shows no rank before registration succeeds', () => {
      for (const submit of [null, { state: 'submitting', storageAvailable: true }, { state: 'retryable_failed', storageAvailable: true }, { state: 'not_eligible', reason: 'anonymous', storageAvailable: true }] as const) {
        expect(resultViewModel(resultInput({ submit: submit as RankingSubmitStatus, top }), 'ja').rankText).toBeNull();
      }
    });

    it('does not claim a different participant with the same name and score is the player', () => {
      // The real player may be outside the top 30. One matching row proves no identity.
      const vm = resultViewModel(resultInput({ submit: submitted, top }), 'ja');
      expect(vm.rankText).not.toBe('登録後の順位：2位');
      expect(vm.top.rows.every((r) => !r.isSelf)).toBe(true);
    });

    it('leaves own rank unconfirmed even when name and score match once', () => {
      expect(resultViewModel(resultInput({ submit: submitted, top }), 'ja').rankText).toBe('本人の順位を確認できません。上位30名は下に表示しています。');
    });

    it('does not guess a rank outside the top 30 or for same-name ties', () => {
      const out = resultViewModel(resultInput({ submit: submitted, top: { state: 'ready', fetchedAt: 't', rows: [row(1, 'あ', 900)] } }), 'ja');
      expect(out.rankText).toBe('本人の順位を確認できません。上位30名は下に表示しています。');
      const dup = resultViewModel(resultInput({ submit: submitted, top: { state: 'ready', fetchedAt: 't', rows: [row(2, 'たろう', 870), row(2, 'たろう', 870)] } }), 'ja');
      expect(dup.rankText).toBe('本人の順位を確認できません。上位30名は下に表示しています。');
    });

    it('anonymous play never shows a rank', () => {
      const vm = resultViewModel(resultInput({ result: finalResult({ playerName: null }), submit: submitted, top }), 'ja');
      expect(vm.rankText).toBeNull();
    });
  });

  describe('submit messaging', () => {
    const k = (submit: RankingSubmitStatus | null, result?: Partial<FinalResult>) => resultViewModel(resultInput({ submit, ...(result ? { result: finalResult(result) } : {}) }), 'ja').submit;
    it('anonymous / prototype / abandoned / not ready explain why nothing is registered', () => {
      expect(k({ state: 'not_eligible', reason: 'anonymous', storageAvailable: true })?.text).toBe('名前なしで遊んだため、ランキングには登録されません。');
      expect(k({ state: 'not_eligible', reason: 'prototype', storageAvailable: true })?.text).toContain('試作');
      expect(k({ state: 'not_eligible', reason: 'abandoned', storageAvailable: true })?.text).toBe('中断されたプレイは登録されません。');
      expect(k({ state: 'not_eligible', reason: 'not_ready', storageAvailable: true })?.text).toBe('ランキングは準備中のため、登録されません。');
    });
    it('retryable failures offer a resend and keep the result; permanent ones do not', () => {
      const r = k({ state: 'retryable_failed', reason: 'submit:NETWORK_ERROR', storageAvailable: true });
      expect(r?.canRetry).toBe(true);
      expect(r?.text).toContain('再送');
      expect(k({ state: 'permanent_failed', storageAvailable: true })?.canRetry).toBe(false);
    });
    it('warns when the queue cannot be saved', () => {
      expect(k({ state: 'retryable_failed', storageAvailable: false })?.storageWarning).toBe('この端末に保存できないため、ページを閉じると再送できません。');
      expect(k({ state: 'retryable_failed', storageAvailable: true })?.storageWarning).toBeNull();
    });
    it('submitting and submitted states', () => {
      expect(k({ state: 'submitting', storageAvailable: true })?.text).toBe('登録中…');
      expect(k(submitted)?.text).toBe('ランキングに登録しました。');
    });
  });

  describe('top 30 area', () => {
    const t = (top: TopState, submit: RankingSubmitStatus | null = null) => resultViewModel(resultInput({ top, submit }), 'ja').top;
    it('has loading / empty / failed(+retry) / unavailable states', () => {
      expect(t({ state: 'idle' }).state).toBe('loading');
      expect(t({ state: 'loading', rows: [] }).message).toBe('読み込み中…');
      expect(t({ state: 'ready', fetchedAt: 't', rows: [] })).toMatchObject({ state: 'empty', message: 'まだ記録がありません。' });
      expect(t({ state: 'failed', retryable: true })).toMatchObject({ state: 'failed', canRetry: true, message: 'ランキングを読み込めませんでした。' });
      expect(t({ state: 'unavailable' })).toMatchObject({ state: 'unavailable', message: 'ランキングは準備中です。', canRetry: false });
    });
    it('shows rank_no as given (ties 1,1,3), names as plain text, and never guesses the own row', () => {
      const rows = [row(1, 'a<b>', 500), row(1, 'b', 500), row(3, 'たろう', 870)];
      const top = t({ state: 'ready', fetchedAt: 't', rows }, submitted);
      expect(top.rows.map((r) => r.rank)).toEqual([1, 1, 3]);
      expect(top.rows[0]?.name).toBe('a<b>');
      expect(top.rows.map((r) => r.isSelf)).toEqual([false, false, false]);
      expect(top.rows[2]?.scoreText).toBe('870点');
    });
    it('keeps the old rows visible while a refresh is loading', () => {
      const vm = t({ state: 'loading', rows: [row(1, 'a', 5)] });
      expect(vm.rows).toHaveLength(1);
      expect(vm.state).toBe('loading');
    });
  });

  it('share text uses the confirmed numbers and adds the URL once when configured', () => {
    const none = resultViewModel(resultInput(), 'ja');
    expect(none.actions.share.text).toBe('シャテッキ（通常モード）\n870点／景品3個／セット1種／最大連鎖2個');
    const withUrl = resultViewModel(resultInput({ links: SET_LINKS }), 'ja');
    expect(withUrl.actions.share.text.split(SET_LINKS.canonicalUrl).length - 1).toBe(1);
  });

  it('ranking button follows the lab URL', () => {
    expect(resultViewModel(resultInput(), 'ja').actions.ranking).toMatchObject({ enabled: false, url: null, note: '準備中' });
    expect(resultViewModel(resultInput({ links: SET_LINKS }), 'ja').actions.ranking).toMatchObject({ enabled: true, url: SET_LINKS.labDetailUrl });
  });

  it('changing the language changes text only, never ids, numbers or scoring', () => {
    const strip = (l: (typeof LOCALES)[number]) => {
      const vm = resultViewModel(resultInput({ selfBestBefore: 500, submit: submitted, top: { state: 'ready', fetchedAt: 't', rows: [row(2, 'たろう', 870)] } }), l);
      return {
        score: vm.hero.value, ids: vm.prizes.items.map((i) => [i.typeId, i.count]), sets: vm.sets.items.map((s) => s.setId), chain: vm.chain.value,
        rows: vm.breakdown.rows.map((r) => [r.kind, r.points]), total: vm.breakdown.total, newBest: vm.newBest, top: vm.top.rows.map((r) => [r.rank, r.isSelf]),
      };
    };
    const base = strip('ja');
    for (const l of LOCALES) {
      const s = strip(l);
      // hero value is locale-formatted; compare digits only
      expect(s.score.replace(/\D/g, ''), l).toBe(base.score.replace(/\D/g, ''));
      expect({ ...s, score: '' }, l).toEqual({ ...base, score: '' });
    }
  });

  it('builds in all 15 locales with no unresolved placeholders', () => {
    for (const l of LOCALES) {
      const vm = resultViewModel(resultInput({ result: finalResult({ ledger: [ledger({ shotId: 's', scoreBefore: 0, nominalPenalty: 5, appliedPenalty: 2, prizePoints: 2, scoreAfter: 0 })], score: 0 }), selfBestBefore: 3, submit: submitted, top: { state: 'ready', fetchedAt: 't', rows: [row(1, 'x', 1)] } }), l);
      const all = JSON.stringify(vm);
      expect(all, l).not.toMatch(/\{\w+\}/);
    }
  });
});

// ----------------------------------------------------------------- set book

const BOOK_SETS = [
  { setId: 'S001', requiredTypeIds: ['P001', 'P002', 'P003'] as const },
  { setId: 'S002', requiredTypeIds: ['P002', 'P004', 'P005'] as const },
  { setId: 'S003', requiredTypeIds: ['P001', 'P004', 'P006'] as const },
];

describe('set book view-model', () => {
  it('hides the name and requirements of undiscovered sets and shows a hint', () => {
    const vm = setBookViewModel({ sets: BOOK_SETS, discovered: ['S002'], completedThisRun: [] }, 'ja');
    const e1 = vm.entries.find((e) => e.setId === 'S001')!;
    expect(e1.discovered).toBe(false);
    expect(e1.title).toBe('？？？');
    expect(e1.required).toBeNull();
    expect(e1.hint?.length).toBeGreaterThan(0);
    expect(e1.hint).not.toContain(setName('ja', 'S001'));
    expect(JSON.stringify(e1)).not.toContain(setName('ja', 'S001'));
  });

  it('shows name and the three required prizes once discovered', () => {
    const vm = setBookViewModel({ sets: BOOK_SETS, discovered: ['S002'], completedThisRun: [] }, 'ja');
    const e = vm.entries.find((x) => x.setId === 'S002')!;
    expect(e.discovered).toBe(true);
    expect(e.title).toBe(setName('ja', 'S002'));
    expect(e.required?.map((r) => r.typeId)).toEqual(['P002', 'P004', 'P005']);
    expect(e.required?.map((r) => r.name)).toEqual(['P002', 'P004', 'P005'].map((p) => prizeName('ja', p)));
    expect(e.hint).toBeNull();
    expect(vm.progressText).toBe('発見 1/3');
  });

  it('keeps "discovered in the book" separate from "completed in this run"', () => {
    const vm = setBookViewModel({ sets: BOOK_SETS, discovered: ['S001'], completedThisRun: ['S003'] }, 'ja');
    const byId = Object.fromEntries(vm.entries.map((e) => [e.setId, e]));
    expect(byId.S001).toMatchObject({ discovered: true, completedThisRun: false });
    // completed this run but not (yet) recorded in the book: flagged, yet the name stays hidden
    expect(byId.S003).toMatchObject({ discovered: false, completedThisRun: true, title: '？？？', required: null });
    expect(vm.progressText).toBe('発見 1/3');
  });

  it('marks hints as prototype and works in all locales (en fallback for content)', () => {
    for (const l of LOCALES) {
      const vm = setBookViewModel({ sets: BOOK_SETS, discovered: [], completedThisRun: [] }, l);
      expect(vm.entries.every((e) => e.hint && e.hintIsPrototype), l).toBe(true);
      expect(vm.progressText).not.toMatch(/\{/);
    }
  });
});

// ---------------------------------------------------------------- settings

describe('settings and audio preferences', () => {
  it('first run: sound on with volume above zero', () => {
    const a = parseAudioPrefs(null);
    expect(a.enabled).toBe(true);
    expect(a.volume).toBeGreaterThan(0);
    expect(loadAudio(mem())).toEqual(DEFAULT_AUDIO);
  });

  it('respects a saved off and a saved volume of 0', () => {
    expect(parseAudioPrefs(JSON.stringify({ enabled: false, volume: 0.8 }))).toEqual({ enabled: false, volume: 0.8 });
    expect(parseAudioPrefs(JSON.stringify({ enabled: true, volume: 0 }))).toEqual({ enabled: true, volume: 0 });
    const s = mem();
    saveAudio(s, { enabled: false, volume: 0 });
    expect(loadAudio(s)).toEqual({ enabled: false, volume: 0 });
    expect(s.d.has(AUDIO_STORAGE_KEY)).toBe(true);
  });

  it('falls back to the default on garbage and clamps out-of-range numbers', () => {
    expect(parseAudioPrefs('{nope')).toEqual(DEFAULT_AUDIO);
    expect(parseAudioPrefs(JSON.stringify({ enabled: 'yes', volume: 'loud' }))).toEqual(DEFAULT_AUDIO);
    expect(parseAudioPrefs(JSON.stringify({ enabled: true, volume: 7 })).volume).toBe(1);
    expect(parseAudioPrefs(JSON.stringify({ enabled: true, volume: -2 })).volume).toBe(0);
  });

  it('survives unavailable storage', () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(loadAudio(bad)).toEqual(DEFAULT_AUDIO);
    expect(() => saveAudio(bad, DEFAULT_AUDIO)).not.toThrow();
  });

  it('settings view-model lists all 15 languages by native name and marks the current one', () => {
    const vm = settingsViewModel({ audio: { enabled: true, volume: 0.5 }, locale: 'de' });
    expect(vm.languages).toHaveLength(15);
    expect(vm.languages.filter((l) => l.selected).map((l) => l.id)).toEqual(['de']);
    expect(vm.languages.find((l) => l.id === 'ja')?.nativeName).toBe('日本語');
    expect(vm.volumePercent).toBe(50);
    expect(vm.soundLabel).toBe(translate('de', 'settings.soundOn'));
    expect(settingsViewModel({ audio: { enabled: false, volume: 0.5 }, locale: 'de' }).soundLabel).toBe(translate('de', 'settings.soundOff'));
    expect(vm.note).toBe(translate('de', 'settings.langNote'));
  });
});

describe('result breakdown formatting (Opus integration fix)', () => {
  it('shows a zero penalty as 0, not -0', async () => {
    const { resultViewModel } = await import('../../src/ui/result');
    const vm = resultViewModel(
      {
        result: {
          runId: 'r' as never, rulesVersion: 't', valueStatus: 'prototype', status: 'completed', score: 0, shotsFired: 10,
          collected: [], completedSets: [], maxChain: 0, ledger: [], playerName: null,
        },
        selfBestBefore: null,
        submit: null,
        top: { state: 'idle' } as never,
        links: { canonicalUrl: null, labDetailUrl: null },
      },
      'ja',
    );
    const penalty = vm.breakdown.rows.find((r) => r.kind === 'penalty');
    expect(penalty?.pointsText).not.toMatch(/^-\s*0$/);
    expect(Object.is(penalty?.points, -0)).toBe(false);
  });
});
