/**
 * Home screen (Task 14): title, start, how-to-play, optional name, self best,
 * ranking link, X share, language and sound settings.
 *
 * The name is a draft until Start: the run's name is fixed at that moment and
 * later edits apply to the next run only (decision / requirements 8). An empty
 * name plays anonymously and is never ranked. Names are shown as text only.
 */
import type { AudioSettings } from '../contracts';
import { translate, type I18n, type Locale, type UiKey } from '../i18n';
import type { PublicLinks } from '../ranking/config';
import { checkName, NAME_MAX_CODE_POINTS, type NameCheck } from '../ranking/name';
import { el, setHidden, setText, type ScreenHandle } from './dom';
import { buildHomeShareText, browserOpen, browserWriteText, shareOnX, shareOutcomeKey, type OpenWindow, type WriteText } from './share';
import { mountSettings } from './settings';
import './screens.css';

export interface HomeInput {
  /** What is currently in the name field. */
  nameDraft: string;
  /** Local self best; null = none yet. */
  selfBest: number | null;
  audio: AudioSettings;
  /** True while the game runs on prototype values (never ranked). */
  prototype: boolean;
  /** False during private/offline publication. Defaults to a configured ranking link. */
  rankingAvailable?: boolean;
}

export interface HomeViewModel {
  readonly title: string;
  readonly tagline: string;
  readonly startLabel: string;
  readonly howtoLabel: string;
  readonly settingsLabel: string;
  readonly shareLabel: string;
  readonly canStart: boolean;
  /** The name to fix for the next run, or null (anonymous). */
  readonly startName: string | null;
  readonly name: {
    readonly visible: boolean;
    readonly label: string;
    readonly placeholder: string;
    readonly explain: string;
    readonly fixedNote: string;
    readonly status: NameCheck['status'];
    readonly length: number;
    readonly max: number;
    readonly error: string | null;
  };
  readonly bestText: string;
  readonly ranking: { readonly visible: boolean; readonly label: string; readonly enabled: boolean; readonly url: string | null; readonly note: string | null };
  readonly shareText: string;
  readonly prototypeNotice: string | null;
  readonly howto: { readonly title: string; readonly steps: readonly string[]; readonly closeLabel: string };
}

const HOWTO_KEYS: readonly UiKey[] = ['howto.1', 'howto.2', 'howto.3', 'howto.4', 'howto.5'];

export function homeViewModel(input: HomeInput, links: PublicLinks, locale: Locale): HomeViewModel {
  const t = (k: UiKey, p?: Record<string, string | number>): string => translate(locale, k, p);
  const rankingAvailable = input.rankingAvailable ?? links.labDetailUrl !== null;
  const check = checkName(rankingAvailable ? input.nameDraft : '');
  const length = check.status === 'ok' ? [...check.name].length : check.status === 'too_long' ? check.length : 0;
  const canStart = check.status !== 'too_long';
  return {
    title: t('app.title'),
    tagline: t('home.tagline'),
    startLabel: t('home.start'),
    howtoLabel: t('home.howto'),
    settingsLabel: t('home.settings'),
    shareLabel: t('home.share'),
    canStart,
    startName: check.status === 'ok' ? check.name : null,
    name: {
      visible: rankingAvailable,
      label: t('home.name.label'),
      placeholder: t('home.name.placeholder'),
      explain: rankingAvailable ? t('home.name.explain') : '',
      fixedNote: rankingAvailable ? t('home.name.fixed') : '',
      status: check.status,
      length,
      max: NAME_MAX_CODE_POINTS,
      error: check.status === 'too_long' ? t('home.name.tooLong') : null,
    },
    bestText: input.selfBest === null ? t('home.best.none') : t('home.best', { score: input.selfBest }),
    ranking: {
      visible: rankingAvailable,
      label: t('home.ranking'),
      enabled: rankingAvailable && links.labDetailUrl !== null,
      url: rankingAvailable ? links.labDetailUrl : null,
      note: rankingAvailable && links.labDetailUrl === null ? t('home.ranking.soon') : null,
    },
    shareText: buildHomeShareText(locale, links.canonicalUrl),
    prototypeNotice: input.prototype ? t('prototype') : null,
    howto: { title: t('howto.title'), steps: HOWTO_KEYS.map((k) => t(k)), closeLabel: t('howto.close') },
  };
}

export interface HomeDeps {
  readonly i18n: I18n;
  readonly links: PublicLinks;
  /** Start a run. `playerName` is the name fixed for this run (null = anonymous). */
  readonly onStart: (playerName: string | null) => void;
  readonly onNameChange: (draft: string) => void;
  readonly onAudioChange: (audio: AudioSettings) => void;
  /** Open the set book (図鑑). The button is shown only when provided. */
  readonly onOpenSetBook?: () => void;
  /** Defaults to window.open. */
  readonly open?: OpenWindow;
  readonly writeText?: WriteText | undefined;
}

export function mountHome(root: HTMLElement, deps: HomeDeps, initial: HomeInput): ScreenHandle<HomeInput> {
  let input = initial;
  const open = deps.open ?? browserOpen();

  const title = el('h1', { class: 'home-title' });
  const tagline = el('p', { class: 'tagline' });
  const proto = el('p', { class: 'notice proto', attrs: { role: 'status' } });
  const best = el('p', { class: 'best' });

  const nameLabel = el('label', { class: 'row-label' });
  const nameInput = el('input', { class: 'text-input', attrs: { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done' } });
  nameInput.id = `name-${Math.random().toString(36).slice(2, 8)}`;
  nameLabel.htmlFor = nameInput.id;
  const counter = el('span', { class: 'counter', attrs: { 'aria-hidden': 'true' } });
  const explain = el('p', { class: 'note' });
  const fixed = el('p', { class: 'note dim' });
  const nameErr = el('p', { class: 'note error', attrs: { role: 'alert' } });

  const start = el('button', { class: 'btn primary big', attrs: { type: 'button' } });
  const howto = el('button', { class: 'btn', attrs: { type: 'button' } });
  const rankingBtn = el('button', { class: 'btn', attrs: { type: 'button' } });
  const rankingNote = el('span', { class: 'btn-note' });
  const share = el('button', { class: 'btn x-share', attrs: { type: 'button' } });
  const settingsBtn = el('button', { class: 'btn', attrs: { type: 'button' } });
  const bookBtn = el('button', { class: 'btn', attrs: { type: 'button' } });
  const shareStatus = el('p', { class: 'note', attrs: { role: 'status' } });
  const manual = el('textarea', { class: 'manual-copy', attrs: { readonly: 'true', rows: '4' } });
  // Stable hooks for browser automation (never used by game logic).
  start.dataset.testid = 'home-start';
  nameInput.dataset.testid = 'home-name';
  howto.dataset.testid = 'home-howto';
  rankingBtn.dataset.testid = 'home-ranking';
  share.dataset.testid = 'home-share';
  settingsBtn.dataset.testid = 'home-settings';
  bookBtn.dataset.testid = 'home-setbook';

  const overlays = el('div', { class: 'overlays' });
  const nameBlock = el('div', { class: 'name-block' }, [nameLabel, el('div', { class: 'input-row' }, [nameInput, counter]), explain, fixed, nameErr]);
  const rankingBlock = el('div', { class: 'btn-with-note' }, [rankingBtn, rankingNote]);
  const col = el('main', { class: 'scr-col' }, [
    title, tagline, proto,
    nameBlock,
    best,
    el('div', { class: 'btn-grid' }, [howto, rankingBlock, share, settingsBtn, ...(deps.onOpenSetBook ? [bookBtn] : [])]),
    shareStatus, manual,
  ]);
  const startBar = el('div', { class: 'sticky-bar' }, [start]);
  const scr = el('div', { class: 'scr scr-home' }, [col, startBar, overlays]);
  root.appendChild(scr);

  let vm = homeViewModel(input, deps.links, deps.i18n.locale);
  let settingsHandle: ReturnType<typeof mountSettings> | null = null;
  let howtoWrap: HTMLElement | null = null;

  function refresh(): void {
    vm = homeViewModel(input, deps.links, deps.i18n.locale);
    document.documentElement.lang = deps.i18n.locale;
    setText(title, vm.title);
    setText(tagline, vm.tagline);
    setText(proto, vm.prototypeNotice ?? '');
    setHidden(proto, vm.prototypeNotice === null);
    setText(best, vm.bestText);
    setHidden(nameBlock, !vm.name.visible);
    setText(nameLabel, vm.name.label);
    nameInput.placeholder = vm.name.placeholder;
    if (nameInput.value !== input.nameDraft) nameInput.value = input.nameDraft;
    setText(counter, `${vm.name.length}/${vm.name.max}`);
    counter.classList.toggle('over', vm.name.status === 'too_long');
    setText(explain, vm.name.explain);
    setText(fixed, vm.name.fixedNote);
    setText(nameErr, vm.name.error ?? '');
    setHidden(nameErr, vm.name.error === null);
    nameInput.setAttribute('aria-invalid', String(vm.name.status === 'too_long'));
    setText(start, vm.startLabel);
    start.disabled = !vm.canStart;
    setText(howto, vm.howtoLabel);
    setText(rankingBtn, vm.ranking.label);
    setHidden(rankingBlock, !vm.ranking.visible);
    rankingBtn.disabled = !vm.ranking.enabled;
    setText(rankingNote, vm.ranking.note ?? '');
    setHidden(rankingNote, vm.ranking.note === null);
    setText(share, vm.shareLabel);
    setText(settingsBtn, vm.settingsLabel);
    setText(bookBtn, translate(deps.i18n.locale, 'setbook.title'));
    if (howtoWrap) renderHowto();
  }

  function renderHowto(): void {
    if (!howtoWrap) return;
    const h = vm.howto;
    const close = el('button', { class: 'btn primary', text: h.closeLabel, attrs: { type: 'button' } });
    close.addEventListener('click', closeHowto);
    howtoWrap.replaceChildren(
      el('div', { class: 'ov-panel', attrs: { role: 'dialog', 'aria-modal': 'true' } }, [
        el('h2', { class: 'ov-title', text: h.title }),
        el('ol', { class: 'steps' }, h.steps.map((s) => el('li', { text: s }))),
        close,
      ]),
    );
  }
  function openHowto(): void {
    if (howtoWrap) return;
    howtoWrap = el('div', { class: 'ov-back' });
    overlays.appendChild(howtoWrap);
    renderHowto();
  }
  function closeHowto(): void {
    howtoWrap?.remove();
    howtoWrap = null;
  }
  function openSettings(): void {
    if (settingsHandle) return;
    settingsHandle = mountSettings(overlays, { i18n: deps.i18n, onAudioChange: deps.onAudioChange, onClose: closeSettings }, { audio: input.audio });
  }
  function closeSettings(): void {
    settingsHandle?.dispose();
    settingsHandle = null;
  }

  nameInput.addEventListener('input', () => {
    if (!vm.name.visible) return;
    input = { ...input, nameDraft: nameInput.value };
    deps.onNameChange(input.nameDraft);
    refresh();
  });
  // Enter never starts the game: confirming IME composition must not begin a run.
  nameInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      nameInput.blur();
    }
  });
  start.addEventListener('click', () => {
    if (!vm.canStart) return;
    deps.onStart(vm.startName); // the name is fixed here, for this run only
  });
  howto.addEventListener('click', openHowto);
  settingsBtn.addEventListener('click', openSettings);
  bookBtn.addEventListener('click', () => deps.onOpenSetBook?.());
  rankingBtn.addEventListener('click', () => {
    const url = vm.ranking.url;
    if (url) open(url);
  });
  share.addEventListener('click', () => {
    const writeText = 'writeText' in deps ? deps.writeText : browserWriteText();
    void shareOnX({ text: vm.shareText, open, writeText }).then((o) => {
      setText(shareStatus, translate(deps.i18n.locale, shareOutcomeKey(o)));
      manual.value = o === 'manual' ? vm.shareText : '';
      setHidden(manual, o !== 'manual');
      if (o === 'manual') manual.select();
    });
  });

  setHidden(manual, true);
  const unsub = deps.i18n.subscribe(refresh);
  refresh();

  return {
    update(patch) {
      input = { ...input, ...patch };
      if (patch.audio) settingsHandle?.update({ audio: patch.audio });
      refresh();
    },
    dispose() {
      unsub();
      closeSettings();
      scr.remove();
    },
  };
}
