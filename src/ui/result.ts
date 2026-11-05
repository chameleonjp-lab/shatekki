/**
 * Result screen (Task 14). Everything shown comes from the confirmed
 * FinalResult and its ledger: the screen never recomputes or rewrites points
 * (decision: one confirmed value feeds result, self best, ranking and share).
 * The first portrait screenful holds the total and the retry button; prizes,
 * sets, chain, breakdown and the top 30 follow and scroll.
 */
import type { FinalResult } from '../contracts';
import { formatInteger, translate, type I18n, type Locale, type UiKey } from '../i18n';
import { prizeName, setName } from '../i18n/content';
import { findOwnRank, type RankingRow, type RankingSubmitStatus, type TopState } from '../ranking/client';
import type { PublicLinks } from '../ranking/config';
import { el, replaceChildren, setHidden, setText, type ScreenHandle } from './dom';
import { buildResultShareText, browserOpen, browserWriteText, shareOnX, shareOutcomeKey, type OpenWindow, type WriteText } from './share';
import './screens.css';

/** Section order. 'hero' and 'actions' are the first screenful; the rest scrolls. */
export const RESULT_SECTION_ORDER = ['hero', 'actions', 'prizes', 'sets', 'chain', 'breakdown', 'submit', 'top'] as const;

export interface ResultInput {
  result: FinalResult;
  /** Self best before this run (null = none). A lower score never lowers it. */
  selfBestBefore: number | null;
  /** Null until the ranking client has produced a status. */
  submit: RankingSubmitStatus | null;
  top: TopState;
  links: PublicLinks;
}

export type BreakdownKind = 'prize' | 'trick' | 'set' | 'firstHit' | 'penalty';

export interface ResultViewModel {
  readonly title: string;
  readonly abandonedNotice: string | null;
  readonly hero: { readonly label: string; readonly value: string; readonly unit: string };
  readonly newBest: boolean;
  readonly newBestLabel: string;
  readonly best: { readonly text: string; readonly previousText: string | null };
  /** Own rank text. Present only after a successful registration. */
  readonly rankText: string | null;
  readonly prizes: { readonly title: string; readonly total: number; readonly items: ReadonlyArray<{ typeId: string; name: string; count: number }>; readonly emptyText: string };
  readonly sets: { readonly title: string; readonly items: ReadonlyArray<{ setId: string; name: string }>; readonly emptyText: string };
  readonly chain: { readonly title: string; readonly value: number; readonly text: string };
  readonly shotsText: string;
  readonly breakdown: {
    readonly title: string;
    readonly rows: ReadonlyArray<{ kind: BreakdownKind; label: string; points: number; pointsText: string }>;
    readonly total: number;
    readonly totalLabel: string;
    readonly totalText: string;
    readonly penaltyNote: string | null;
    /** False if the ledger does not add up to the confirmed score (shown, never hidden). */
    readonly reconciled: boolean;
  };
  readonly submit: { readonly state: RankingSubmitStatus['state']; readonly text: string; readonly canRetry: boolean; readonly retryLabel: string; readonly storageWarning: string | null } | null;
  readonly top: {
    readonly title: string;
    readonly state: 'loading' | 'empty' | 'ready' | 'failed' | 'unavailable';
    readonly message: string | null;
    readonly canRetry: boolean;
    readonly retryLabel: string;
    readonly headers: { readonly rank: string; readonly name: string; readonly score: string };
    readonly rows: ReadonlyArray<{ rank: number; name: string; scoreText: string; isSelf: boolean }>;
  };
  readonly actions: {
    readonly retry: { readonly label: string };
    readonly home: { readonly label: string };
    readonly ranking: { readonly label: string; readonly enabled: boolean; readonly url: string | null; readonly note: string | null };
    readonly share: { readonly label: string; readonly text: string };
  };
}

const NOT_ELIGIBLE_KEYS: Readonly<Record<string, UiKey>> = {
  anonymous: 'submit.notEligible.anonymous',
  prototype: 'submit.notEligible.prototype',
  abandoned: 'submit.notEligible.abandoned',
  not_ready: 'submit.notEligible.notReady',
};

/** Rows of the top list that are unambiguously this player's (name + best score match exactly once). */
function ownRowIndex(rows: readonly RankingRow[], name: string | null, best: number | null): number {
  if (name === null || best === null) return -1;
  const idx = rows.map((r, i) => (r.display_name === name && r.best_score === best ? i : -1)).filter((i) => i >= 0);
  return idx.length === 1 ? (idx[0] ?? -1) : -1;
}

export function resultViewModel(input: ResultInput, locale: Locale): ResultViewModel {
  const t = (k: UiKey, p?: Record<string, string | number>): string => translate(locale, k, p);
  const { result, submit, top } = input;
  const completed = result.status === 'completed';

  // ---- self best (a lower score never lowers it; abandoned never counts)
  const before = input.selfBestBefore;
  const newBest = completed && (before === null ? true : result.score > before);
  const bestValue = completed ? Math.max(before ?? 0, result.score) : before;
  const bestText = bestValue === null ? t('home.best.none') : t('home.best', { score: bestValue });

  // ---- prizes grouped by kind in order of first collection
  const order: string[] = [];
  const counts = new Map<string, number>();
  for (const c of result.collected) {
    const id = String(c.typeId);
    if (!counts.has(id)) order.push(id);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  // ---- breakdown straight from the ledger
  let prize = 0, trick = 0, set = 0, firstHit = 0, nominal = 0, applied = 0;
  for (const l of result.ledger) {
    prize += l.prizePoints;
    trick += l.trickPoints;
    set += l.setPoints;
    firstHit += l.firstHitPoints;
    nominal += l.nominalPenalty;
    applied += l.appliedPenalty;
  }
  const pts = (n: number): string => (n < 0 ? `−${formatInteger(locale, -n)}` : formatInteger(locale, n));
  const rows: Array<{ kind: BreakdownKind; label: string; points: number; pointsText: string }> = [
    { kind: 'prize', label: t('bd.prize'), points: prize, pointsText: pts(prize) },
    { kind: 'trick', label: t('bd.trick'), points: trick, pointsText: pts(trick) },
    { kind: 'set', label: t('bd.set'), points: set, pointsText: pts(set) },
    { kind: 'firstHit', label: t('bd.firstHit'), points: firstHit, pointsText: pts(firstHit) },
    { kind: 'penalty', label: t('bd.penalty'), points: -applied, pointsText: pts(-applied) },
  ];
  const reconciled = prize + trick + set + firstHit - applied === result.score;

  // ---- own rank: only after a successful registration, never guessed
  const registered = submit?.state === 'submitted' && result.playerName !== null && completed;
  const ownBest = submit?.bestScore ?? result.score;
  const topRows: readonly RankingRow[] = top.state === 'ready' || top.state === 'loading' ? top.rows : [];
  let rankText: string | null = null;
  if (registered && top.state === 'ready') {
    const rank = findOwnRank(top.rows, result.playerName ?? '', ownBest);
    rankText = rank === null ? t('result.rank.unknown') : t('result.rank', { rank });
  }
  const selfIdx = registered ? ownRowIndex(topRows, result.playerName, ownBest) : -1;

  // ---- submit message
  let submitVm: ResultViewModel['submit'] = null;
  if (submit) {
    const base = { state: submit.state, retryLabel: t('submit.retry') };
    switch (submit.state) {
      case 'idle':
        submitVm = { ...base, text: t('submit.idle'), canRetry: false, storageWarning: null };
        break;
      case 'submitting':
        submitVm = { ...base, text: t('submit.submitting'), canRetry: false, storageWarning: null };
        break;
      case 'submitted':
        submitVm = { ...base, text: t('submit.submitted'), canRetry: false, storageWarning: null };
        break;
      case 'retryable_failed':
        submitVm = { ...base, text: t('submit.retryable'), canRetry: true, storageWarning: submit.storageAvailable ? null : t('submit.storage') };
        break;
      case 'permanent_failed':
        submitVm = { ...base, text: t('submit.permanent'), canRetry: false, storageWarning: null };
        break;
      case 'not_eligible':
        submitVm = { ...base, text: t(NOT_ELIGIBLE_KEYS[submit.reason ?? ''] ?? 'submit.permanent'), canRetry: false, storageWarning: null };
        break;
    }
  }

  // ---- top 30 area
  const mapRows = (rs: readonly RankingRow[]) => rs.map((r, i) => ({ rank: r.rank_no, name: r.display_name, scoreText: t('unit.points', { n: r.best_score }), isSelf: i === selfIdx }));
  const topBase = { title: t('rank.title'), retryLabel: t('rank.retry'), headers: { rank: t('rank.col.rank'), name: t('rank.col.name'), score: t('rank.col.score') } };
  let topVm: ResultViewModel['top'];
  switch (top.state) {
    case 'idle':
      topVm = { ...topBase, state: 'loading', message: t('rank.loading'), canRetry: false, rows: [] };
      break;
    case 'loading':
      topVm = { ...topBase, state: 'loading', message: t('rank.loading'), canRetry: false, rows: mapRows(top.rows) };
      break;
    case 'ready':
      topVm = top.rows.length === 0
        ? { ...topBase, state: 'empty', message: t('rank.empty'), canRetry: false, rows: [] }
        : { ...topBase, state: 'ready', message: null, canRetry: false, rows: mapRows(top.rows) };
      break;
    case 'failed':
      topVm = { ...topBase, state: 'failed', message: t('rank.failed'), canRetry: true, rows: [] };
      break;
    case 'unavailable':
      topVm = { ...topBase, state: 'unavailable', message: t('rank.unavailable'), canRetry: false, rows: [] };
      break;
  }

  const links = input.links;
  return {
    title: t('result.title'),
    abandonedNotice: completed ? null : t('result.abandoned'),
    hero: { label: t('result.score'), value: formatInteger(locale, result.score), unit: t('hud.score') },
    newBest,
    newBestLabel: t('result.newBest'),
    best: { text: bestText, previousText: newBest && before !== null ? t('result.prevBest', { score: before }) : null },
    rankText,
    prizes: {
      title: t('result.prizes'),
      total: result.collected.length,
      items: order.map((id) => ({ typeId: id, name: prizeName(locale, id), count: counts.get(id) ?? 0 })),
      emptyText: t('result.prizes.none'),
    },
    sets: { title: t('result.sets'), items: result.completedSets.map((s) => ({ setId: String(s), name: setName(locale, String(s)) })), emptyText: t('result.sets.none') },
    chain: { title: t('result.maxChain'), value: result.maxChain, text: t('unit.pieces', { n: result.maxChain }) },
    shotsText: t('result.shots', { n: result.shotsFired }),
    breakdown: {
      title: t('result.breakdown'),
      rows,
      total: result.score,
      totalLabel: t('bd.total'),
      totalText: pts(result.score),
      penaltyNote: nominal !== applied ? t('bd.penaltyNote', { nominal, applied }) : null,
      reconciled,
    },
    submit: submitVm,
    top: topVm,
    actions: {
      retry: { label: t('btn.retry') },
      home: { label: t('result.home') },
      ranking: {
        label: t('home.ranking'),
        enabled: links.labDetailUrl !== null,
        url: links.labDetailUrl,
        note: links.labDetailUrl === null ? t('home.ranking.soon') : null,
      },
      share: {
        label: t('home.share'),
        text: buildResultShareText(locale, { score: result.score, prizes: result.collected.length, sets: result.completedSets.length, maxChain: result.maxChain }, links.canonicalUrl),
      },
    },
  };
}

export interface ResultDeps {
  readonly i18n: I18n;
  readonly onRetry: () => void;
  readonly onHome: () => void;
  /** Resend a failed registration (the same submission id is reused by the client). */
  readonly onRetrySubmit: () => void;
  /** Reload the top 30. */
  readonly onRetryTop: () => void;
  readonly open?: OpenWindow;
  readonly writeText?: WriteText | undefined;
}

export function mountResult(root: HTMLElement, deps: ResultDeps, initial: ResultInput): ScreenHandle<ResultInput> {
  let input = initial;
  const open = deps.open ?? browserOpen();
  let vm = resultViewModel(input, deps.i18n.locale);

  const h = (tag: 'h2' | 'h3', cls = 'sec-title') => el(tag, { class: cls });
  const title = h('h2', 'ov-title');
  const notice = el('p', { class: 'notice', attrs: { role: 'status' } });
  const heroLabel = el('div', { class: 'hero-label' });
  const heroValue = el('div', { class: 'hero-value' });
  const heroUnit = el('span', { class: 'hero-unit' });
  const newBest = el('div', { class: 'new-best' });
  const best = el('p', { class: 'best' });
  const prevBest = el('p', { class: 'note dim' });
  const rank = el('p', { class: 'rank-line', attrs: { role: 'status' } });
  const retry = el('button', { class: 'btn primary big', attrs: { type: 'button' } });
  const home = el('button', { class: 'btn', attrs: { type: 'button' } });
  const rankingBtn = el('button', { class: 'btn', attrs: { type: 'button' } });
  const rankingNote = el('span', { class: 'btn-note' });
  const share = el('button', { class: 'btn x-share', attrs: { type: 'button' } });
  const shareStatus = el('p', { class: 'note', attrs: { role: 'status' } });
  const manual = el('textarea', { class: 'manual-copy', attrs: { readonly: 'true', rows: '4' } });
  const prizesTitle = h('h3');
  const prizesBody = el('div', { class: 'chips' });
  const setsTitle = h('h3');
  const setsBody = el('div', { class: 'chips' });
  const chainTitle = h('h3');
  const chainValue = el('p', { class: 'big-num' });
  const shots = el('p', { class: 'note dim' });
  const bdTitle = h('h3');
  const bdBody = el('dl', { class: 'bd' });
  const bdNote = el('p', { class: 'note' });
  const submitMsg = el('p', { class: 'note', attrs: { role: 'status' } });
  const storageWarn = el('p', { class: 'note error' });
  const submitRetry = el('button', { class: 'btn', attrs: { type: 'button' } });
  const topTitle = h('h3');
  const topMsg = el('p', { class: 'note', attrs: { role: 'status' } });
  const topRetry = el('button', { class: 'btn', attrs: { type: 'button' } });
  const topList = el('ol', { class: 'top-list' });

  const heroSec = el('section', { class: 'sec hero' }, [heroLabel, el('div', { class: 'hero-row' }, [heroValue, heroUnit]), newBest, best, prevBest, rank]);
  const actionsSec = el('section', { class: 'sec actions' }, [
    retry,
    el('div', { class: 'btn-grid three' }, [home, el('div', { class: 'btn-with-note' }, [rankingBtn, rankingNote]), share]),
    shareStatus, manual,
  ]);
  const col = el('main', { class: 'scr-col' }, [
    title, notice, heroSec, actionsSec,
    el('section', { class: 'sec' }, [prizesTitle, prizesBody]),
    el('section', { class: 'sec' }, [setsTitle, setsBody]),
    el('section', { class: 'sec' }, [chainTitle, chainValue, shots]),
    el('section', { class: 'sec' }, [bdTitle, bdBody, bdNote]),
    el('section', { class: 'sec' }, [submitMsg, storageWarn, submitRetry]),
    el('section', { class: 'sec' }, [topTitle, topMsg, topRetry, topList]),
  ]);
  const scr = el('div', { class: 'scr scr-result' }, [col]);
  root.appendChild(scr);
  setHidden(manual, true);

  function chip(text: string, count?: number): HTMLElement {
    return el('span', { class: 'chip' }, [el('span', { text }), ...(count && count > 1 ? [el('b', { text: ` ×${count}` })] : [])]);
  }

  function refresh(): void {
    vm = resultViewModel(input, deps.i18n.locale);
    document.documentElement.lang = deps.i18n.locale;
    setText(title, vm.title);
    setText(notice, vm.abandonedNotice ?? '');
    setHidden(notice, vm.abandonedNotice === null);
    setText(heroLabel, vm.hero.label);
    setText(heroValue, vm.hero.value);
    setText(heroUnit, vm.hero.unit);
    setText(newBest, vm.newBest ? vm.newBestLabel : '');
    setHidden(newBest, !vm.newBest);
    setText(best, vm.best.text);
    setText(prevBest, vm.best.previousText ?? '');
    setHidden(prevBest, vm.best.previousText === null);
    setText(rank, vm.rankText ?? '');
    setHidden(rank, vm.rankText === null);
    setText(retry, vm.actions.retry.label);
    setText(home, vm.actions.home.label);
    setText(rankingBtn, vm.actions.ranking.label);
    rankingBtn.disabled = !vm.actions.ranking.enabled;
    setText(rankingNote, vm.actions.ranking.note ?? '');
    setHidden(rankingNote, vm.actions.ranking.note === null);
    setText(share, vm.actions.share.label);
    setText(prizesTitle, `${vm.prizes.title} (${vm.prizes.total})`);
    replaceChildren(prizesBody, vm.prizes.items.length === 0 ? [el('span', { class: 'note', text: vm.prizes.emptyText })] : vm.prizes.items.map((i) => chip(i.name, i.count)));
    setText(setsTitle, vm.sets.title);
    replaceChildren(setsBody, vm.sets.items.length === 0 ? [el('span', { class: 'note', text: vm.sets.emptyText })] : vm.sets.items.map((i) => chip(i.name)));
    setText(chainTitle, vm.chain.title);
    setText(chainValue, vm.chain.text);
    setText(shots, vm.shotsText);
    setText(bdTitle, vm.breakdown.title);
    replaceChildren(bdBody, [
      ...vm.breakdown.rows.flatMap((r) => [el('dt', { text: r.label }), el('dd', { text: r.pointsText, class: r.points < 0 ? 'neg' : '' })]),
      el('dt', { text: vm.breakdown.totalLabel, class: 'total' }),
      el('dd', { text: vm.breakdown.totalText, class: 'total' }),
    ]);
    setText(bdNote, vm.breakdown.penaltyNote ?? '');
    setHidden(bdNote, vm.breakdown.penaltyNote === null);
    const s = vm.submit;
    setText(submitMsg, s?.text ?? '');
    setHidden(submitMsg, s === null);
    setText(storageWarn, s?.storageWarning ?? '');
    setHidden(storageWarn, !s?.storageWarning);
    setText(submitRetry, s?.retryLabel ?? '');
    setHidden(submitRetry, !s?.canRetry);
    setText(topTitle, vm.top.title);
    setText(topMsg, vm.top.message ?? '');
    setHidden(topMsg, vm.top.message === null);
    setText(topRetry, vm.top.retryLabel);
    setHidden(topRetry, !vm.top.canRetry);
    replaceChildren(
      topList,
      vm.top.rows.map((r) =>
        el('li', { class: r.isSelf ? 'top-row self' : 'top-row' }, [
          el('span', { class: 'top-rank', text: String(r.rank) }),
          el('span', { class: 'top-name', text: r.name }),
          el('span', { class: 'top-score', text: r.scoreText }),
        ]),
      ),
    );
  }

  retry.addEventListener('click', () => deps.onRetry());
  home.addEventListener('click', () => deps.onHome());
  rankingBtn.addEventListener('click', () => {
    if (vm.actions.ranking.url) open(vm.actions.ranking.url);
  });
  share.addEventListener('click', () => {
    const writeText = 'writeText' in deps ? deps.writeText : browserWriteText();
    void shareOnX({ text: vm.actions.share.text, open, writeText }).then((o) => {
      setText(shareStatus, translate(deps.i18n.locale, shareOutcomeKey(o)));
      manual.value = o === 'manual' ? vm.actions.share.text : '';
      setHidden(manual, o !== 'manual');
      if (o === 'manual') manual.select();
    });
  });
  submitRetry.addEventListener('click', () => deps.onRetrySubmit());
  topRetry.addEventListener('click', () => deps.onRetryTop());

  const unsub = deps.i18n.subscribe(refresh);
  refresh();
  scr.scrollTop = 0;

  return {
    update(patch) {
      input = { ...input, ...patch };
      refresh();
    },
    dispose() {
      unsub();
      scr.remove();
    },
  };
}
