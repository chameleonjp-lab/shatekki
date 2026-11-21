/**
 * Integration wiring (owner: Opus).
 *
 * Screens: (resume prompt) → home → game → result, with the set book as an
 * overlay. Persistence (checkpoints, profile, settings, name), the ranking
 * client (v1 contract; sends nothing while the game is unregistered or values
 * are prototype), 15-language i18n and page-environment pauses are wired here.
 */
import './app.css';
import { environmentPauseReasons, type EnvironmentSnapshot } from './environment';
import {
  catalogValueStatus,
  isExpandedRunState,
  mintId,
  type FinalResult,
  type GameplayBundle,
  type KeyValueStorage,
  type PauseReason,
  type RunState,
  type RuntimeCatalog,
  type SetId,
  type ShotSummary,
  type ShotWorld,
  type TuningConfig,
} from './contracts';
import { GameController, type ControllerSnapshot } from './app/controller';
import { AtomicGame } from './app/atomic-game';
import { PersistedSession } from './app/persisted-session';
import type { PersistedRecord, RunScope } from './contracts/persistence';
import { CORE_RULES } from './app/rules';
import { OFFICIAL_BUNDLE, type ExpandedUiKit } from './app/bundle';
import { createExpandedRun } from './core/expanded-run';
import type { ThreeRenderer } from './view';
import { mountControls, type PanelHandle } from './ui/controls/panel';
import { standRangeOf } from './ui/controls/stand';
import type { QuestionPanelHandle } from './ui/shopkeeper-question';
import type { BoothMapHandle } from './ui/booth-map';
import { prizeName } from './i18n/content';
import { controlsModel } from './ui/controls/model';
import { setControlsLocale, t } from './ui/controls/strings';
import {
  createPlayerNameStore,
  createProfileStore,
  createRunStore,
  createSettingsStore,
  createVersionedProfileStore,
  expandedRunKey,
  STORAGE_KEYS,
  withKeySuffix,
  type RestoreResult,
  type RunStore,
} from './persistence';
import { finalResult } from './core/result';
import { createI18n, LANGUAGE_STORAGE_KEY, type I18n, type UiKey } from './i18n';
import { JA as UI_KEYS } from './i18n/locales/ja';
import { mountHome } from './ui/home';
import { mountResult, type LastShotInput, type ResultTextOptions } from './ui/result';
import { setDisplayName } from './ui/set-book';
import { rewardDevicesFor } from './core/rewards';
import { dailyStart, jstDateOf } from './core/daily';
import { createSouvenirStore } from './persistence/souvenirs';
import { mountSouvenirShelf, type SouvenirShelfHandle } from './ui/souvenir-shelf';
import { mountSetBook, setBookEntriesFromCatalog } from './ui/set-book';
import type { ScreenHandle } from './ui/dom';
import { createRankingService } from './ranking/client';
import { publicLinks, RANKING_CONFIG } from './ranking/config';
import { normalizePlayerName } from './ranking/name';
import { createAudioEngine, effectCueFor } from './audio';
import type { AudioSettings, GameCommand, UiCue } from './contracts';

/** Commands still taken while the r007 talk panel is open. */
const TALK_COMMANDS: ReadonlySet<GameCommand['type']> = new Set(['CHOOSE_SHOPKEEPER_TALK', 'PAUSE', 'RESUME']);

export interface AppHandle {
  readonly root: HTMLElement;
  currentPauseReasons(): readonly PauseReason[];
  dispose(): void;
}

/** Read-only probe for browser automation (only with ?e2e=1). Exposes no way to change the game. */
export interface E2eProbe {
  screen(): string;
  phase(): string | null;
  prizeCount(): number;
  ammo(): number;
  score(): number;
  playerName(): string | null;
  reticle(): { x: number; y: number; z: number } | null;
  stats(): { triangles: number; meshes: number; drawCalls: number } | null;
}

type Screen = 'resume' | 'home' | 'game' | 'result';

function snapshot(win: Window): EnvironmentSnapshot {
  return { hidden: win.document.visibilityState === 'hidden', width: win.innerWidth, height: win.innerHeight };
}

function newRunId(win: Window): string {
  const c = win.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function newSeed(win: Window): number {
  const buf = new Uint32Array(1);
  if (win.crypto?.getRandomValues) win.crypto.getRandomValues(buf);
  else buf[0] = Math.floor(Math.random() * 0xffffffff);
  return buf[0]! >>> 0;
}

/**
 * localStorage can be missing or throw (private mode, blocked site data). The
 * stores treat a throwing storage as "unavailable" and keep the game running
 * in memory (persistence-design.md §5).
 */
function browserStorage(win: Window): KeyValueStorage {
  let ls: Storage | null = null;
  try {
    ls = win.localStorage;
  } catch {
    ls = null;
  }
  const fail = (): never => {
    throw new Error('storage unavailable');
  };
  return {
    getItem: (k) => (ls ? ls.getItem(k) : fail()),
    setItem: (k, v) => (ls ? ls.setItem(k, v) : fail()),
    removeItem: (k) => (ls ? ls.removeItem(k) : fail()),
  };
}

/** Notice shown on the home screen for what was found in storage. */
function restoreNoticeKey(r: RestoreResult): UiKey | null {
  switch (r.kind) {
    case 'abandoned':
      return 'app.restore.abandoned';
    case 'ended':
      return 'app.restore.ended';
    case 'quarantined':
      return 'app.restore.quarantined';
    case 'resume':
    case 'none':
      return null;
  }
}

/**
 * Heavy modules (Rapier physics with its embedded wasm, three.js renderer) are
 * split into lazy chunks so the first screen appears quickly on a phone. The
 * download starts right after boot and is awaited when the player starts.
 */
type HeavyModules = { sim: typeof import('./sim/world'); view: typeof import('./view') };
let heavyModules: Promise<HeavyModules> | null = null;
function loadHeavyModules(): Promise<HeavyModules> {
  heavyModules ??= Promise.all([import('./sim/world'), import('./view')]).then(([sim, view]) => ({ sim, view }));
  return heavyModules;
}

export function createApp(root: HTMLElement, win: Window, bundle: GameplayBundle = OFFICIAL_BUNDLE, expandedUi: ExpandedUiKit | null = null): AppHandle {
  const doc = win.document;
  // One bundle for start, restore, physics, view and persistence (plan EG01/EG08).
  const catalog: RuntimeCatalog = bundle.catalog;
  const tuning: TuningConfig = bundle.tuning;
  const layout = bundle.layout;
  const expansion = bundle.expansion;
  if (expansion && !expandedUi) throw new Error('the expanded bundle needs its UI pieces (loadBuildSetup)');
  const isPrototype = catalogValueStatus(catalog) !== 'approved' || tuning.valueStatus !== 'approved';
  /** r007: aim first, the shopkeeper's parts, talk and speech bubbles (internal candidate only). */
  const aimFirstCfg = bundle.behavior?.controls === 'aim-first' ? expansion?.profile.aimFirst ?? null : null;
  const e2e = new URLSearchParams(win.location.search).has('e2e');
  root.innerHTML = '';

  // ------------------------------------------------------------ stores
  const storage = browserStorage(win);
  const atomic = bundle.behavior?.persistence === 'atomic'
    ? new AtomicGame(() => win.indexedDB, newRunId(win), bundle, storage, () => {
        session = null;
        clearEngine();
        savePrompt('save.blocked', () => void loadAtomic());
      })
    : null;
  root.dataset.rulesVersion = catalog.rulesVersion;
  let session: PersistedSession | null = null;
  // Expanded rules write their own keys (EG06); rules-v1 keys and records are never touched by them.
  const normalRunStore: RunStore = expansion
    ? createRunStore(storage, newRunId(win), { catalog, tuning, layout, expansion, key: expandedRunKey(catalog.rulesVersion) })
    : createRunStore(storage, newRunId(win), { catalog, tuning, layout });
  const normalProfile = expansion ? createVersionedProfileStore(storage, { rulesVersion: catalog.rulesVersion }) : createProfileStore(storage);
  // E4 "today's stall" (rewards versions): its own run, self best and set book under '<key>.daily' names.
  const hasDaily = Boolean(expansion?.profile.rewards);
  const dailyStorage: KeyValueStorage = withKeySuffix(storage, '.daily');
  const dailyRunStore: RunStore | null = hasDaily && expansion ? createRunStore(dailyStorage, newRunId(win), { catalog, tuning, layout, expansion, key: expandedRunKey(catalog.rulesVersion) }) : null;
  const dailyProfile = hasDaily ? createVersionedProfileStore(dailyStorage, { rulesVersion: catalog.rulesVersion }) : null;
  let mode: 'normal' | 'daily' = 'normal';
  let runStore: RunStore = normalRunStore;
  let profile: typeof normalProfile = normalProfile;
  /** The storage the current mode writes its own records to (result view, daily date). */
  let modeStorage: KeyValueStorage = storage;
  const setMode = (m: 'normal' | 'daily') => {
    mode = m;
    root.dataset.mode = m;
    runStore = m === 'daily' && dailyRunStore ? dailyRunStore : normalRunStore;
    profile = m === 'daily' && dailyProfile ? dailyProfile : normalProfile;
    modeStorage = m === 'daily' ? dailyStorage : storage;
  };
  const souvenirs = hasDaily ? createSouvenirStore(storage) : null;
  const settingsStore = createSettingsStore(storage, undefined, !atomic);
  const nameStore = createPlayerNameStore(storage);
  const ranking = createRankingService({ storage: atomic ? null : storage });
  const links = publicLinks();
  // The expanded prototype is never ranked (prototype values, internal builds only).
  const rankingAvailable = RANKING_CONFIG.gameSlug !== null && expansion === null;
  let restore: RestoreResult = atomic ? {kind:'none'} : runStore.load();
  // A daily game in progress (or a kept daily result) comes back when the normal mode has nothing.
  if (!atomic && dailyRunStore && restore.kind === 'none') {
    const d = dailyRunStore.load();
    if (d.kind !== 'none') {
      setMode('daily');
      restore = d;
    }
  }
  // Rewards versions (r002+) keep a finished run until it is closed, so a reload opens the same result (plan T2).
  const keepsEndedRun = Boolean(expansion?.profile.rewards);
  const keptEnded = keepsEndedRun && restore.kind === 'ended' ? restore.state : null;
  // An abandoned or finished run is shown once and never resumed or ranked from here (decision 27).
  if (restore.kind === 'abandoned' || (restore.kind === 'ended' && !keptEnded)) runStore.clear();

  // The settings store is the single saved source of the language (saved → browser → English).
  const languageStorage: KeyValueStorage = {
    getItem: (k) => (k === LANGUAGE_STORAGE_KEY ? settingsStore.load().language : null),
    setItem: (k, v) => {
      if (k === LANGUAGE_STORAGE_KEY) settingsStore.save({ language: v });
    },
    removeItem: () => undefined,
  };
  const i18n: I18n = createI18n(languageStorage, win.navigator.languages ?? [win.navigator.language]);
  doc.documentElement.lang = i18n.locale;
  setControlsLocale(i18n.locale);
  let noticeKey = keptEnded ? null : restoreNoticeKey(restore);
  const bootNotice = noticeKey ? i18n.t(noticeKey) : '';

  // Sound: first run ON with volume > 0; saved off / 0 respected (settings store). The context is
  // created/resumed from a user gesture; failures never stop the game.
  const festivalPreview = bundle.key === 'expanded-aim-first';
  const audio = createAudioEngine({ festival: festivalPreview, listener: () => ({ ...layout.camera.eye, x: controller?.current.standX ?? layout.camera.eye.x }) });
  let audioSettings: AudioSettings = settingsStore.load().audio;
  const cue = (c: UiCue['cue'], extra: Partial<Pick<UiCue, 'tier' | 'count'>> = {}) => {
    if (!atomic || reasons.length === 0) audio.handle({ type: 'ui', cue: c, ...extra } as UiCue, audioSettings);
  };
  const unlockAudio = () => void audio.unlock().catch(() => undefined);
  root.addEventListener('pointerdown', unlockAudio, { capture: true });
  root.addEventListener('keydown', unlockAudio, { capture: true });

  // ------------------------------------------------------------ layers
  const canvas = doc.createElement('canvas');
  canvas.className = 'stage';
  canvas.dataset.testid = 'stage';
  const ui = doc.createElement('div');
  ui.className = 'ui-layer';
  const screens = doc.createElement('div');
  screens.className = 'screen-layer';
  const overlay = doc.createElement('div');
  overlay.className = 'screen-layer overlay-layer';

  const resumeBox = doc.createElement('main');
  resumeBox.className = 'boot';
  resumeBox.dataset.testid = 'resume-prompt';
  const resumeTitle = doc.createElement('h1');
  resumeTitle.textContent = i18n.t('app.resume.title');
  const resumeBtn = doc.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.className = 'btn btn-primary boot-start';
  resumeBtn.dataset.testid = 'btn-resume-run';
  resumeBtn.textContent = i18n.t('app.resume.continue');
  const newBtn = doc.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn boot-start';
  newBtn.dataset.testid = 'btn-new-run';
  newBtn.textContent = i18n.t('app.resume.restart');
  const status = doc.createElement('p');
  status.className = 'boot-status';
  status.dataset.testid = 'boot-status';
  const scopeChoices = doc.createElement('div');
  resumeBox.append(resumeTitle, scopeChoices, resumeBtn, newBtn, status);
  resumeBox.hidden = true;

  const notice = doc.createElement('p');
  notice.className = 'app-notice';
  notice.dataset.testid = 'app-notice';
  notice.setAttribute('role', 'status');
  notice.textContent = bootNotice;
  notice.hidden = bootNotice === '';

  const rotate = doc.createElement('div');
  rotate.className = 'rotate-overlay';
  rotate.dataset.testid = 'rotate-overlay';
  rotate.setAttribute('role', 'alert');
  rotate.hidden = true;
  rotate.textContent = t('rotate');

  const stale = doc.createElement('div');
  stale.className = 'rotate-overlay';
  stale.dataset.testid = 'stale-overlay';
  stale.setAttribute('role', 'alert');
  stale.hidden = true;
  stale.textContent = i18n.t('app.error.stale');

  root.append(canvas, ui, screens, overlay, resumeBox, notice, rotate, stale);

  // ------------------------------------------------------------ state
  let screen: Screen = 'home';
  let reasons: PauseReason[] = [];
  let controller: GameController | null = null;
  let renderer: ThreeRenderer | null = null;
  let world: ShotWorld | null = null;
  let panel: PanelHandle | null = null;
  // Expanded rules only (EG07/EG08): the shopkeeper question and the 3×12 overview.
  let questionPanel: QuestionPanelHandle | null = null;
  let boothMap: BoothMapHandle | null = null;
  let effectResults: ReturnType<ExpandedUiKit['mountEffectResults']> | null = null;
  // Rewards (r002+): order card, progress strip and the per-shot reward card.
  let rewardPanel: ReturnType<ExpandedUiKit['mountRewardPanel']> | null = null;
  const illustratedRewards = bundle.behavior?.presentation === 'confirmed-motions';
  let rewardMotions: ReturnType<ExpandedUiKit['mountRewardMotions']> | null = null;
  // r007 pieces
  let afPanel: ReturnType<ExpandedUiKit['mountAimFirstControls']> | null = null;
  let talkPanel: ReturnType<ExpandedUiKit['mountTalkPanel']> | null = null;
  let speechBubble: ReturnType<ExpandedUiKit['mountSpeechBubble']> | null = null;
  let speech: InstanceType<ExpandedUiKit['SpeechScheduler']> | null = null;
  let afCard: ReturnType<ExpandedUiKit['mountAimFirstCard']> | null = null;
  let firedWithLastCork = false;
  let mapUpdatedAt = -Infinity;
  let shownQuestion = '';
  let screenHandle: ScreenHandle<never> | null = null;
  let bookHandle: ScreenHandle<never> | null = null;
  let bookRequest = 0;
  let rankingUnsub: (() => void) | null = null;
  let runName: string | null = null;
  let raf = 0;
  let lastTs = 0;
  let disposed = false;
  let starting = false;

  const setScreen = (s: Screen) => {
    bookRequest++;
    if (s !== 'game') {
      rewardMotions?.clear();
      effectResults?.hide();
      rewardPanel?.hideCard();
    }
    screen = s;
    root.dataset.screen = s;
    ui.hidden = s !== 'game';
    resumeBox.hidden = s !== 'resume';
  };

  const clearScreen = () => {
    stopCelebration?.();
    stopCelebration = null;
    rankingUnsub?.();
    rankingUnsub = null;
    screenHandle?.dispose();
    screenHandle = null;
  };

  // ------------------------------------------------------------ environment
  const updateEnv = () => {
    lastTs = 0;
    reasons = environmentPauseReasons(snapshot(win));
    rotate.hidden = !reasons.includes('landscape');
    root.dataset.pause = reasons.join(' ');
    if (reasons.length > 0) {
      audio.silence(); // nothing piles up while hidden / rotated (AC36)
      // r007: rotating or hiding closes an unchosen talk without using it
      talkPanel?.close();
      afPanel?.cancelGestures();
    }
    controller?.setEnvironmentPause(reasons);
  };
  const onResize = () => {
    updateEnv();
    renderer?.resize(canvas.clientWidth || win.innerWidth, canvas.clientHeight || win.innerHeight);
  };
  updateEnv();
  win.addEventListener('resize', onResize);
  win.addEventListener('orientationchange', onResize);
  doc.addEventListener('visibilitychange', updateEnv);

  const isStale = () => runStore.status().conflict || runStore.isStale();
  const markStale = () => {
    if (atomic) return false;
    if (!isStale()) return false;
    stale.hidden = false;
    controller?.dispatch({ type: 'PAUSE', reason: 'manual' });
    return true;
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEYS.run && screen === 'game') markStale();
  };
  win.addEventListener('storage', onStorage);

  // Resend queued ranking results (same submission ids) on load and when back online.
  const retryRanking = () => { if (rankingAvailable) void ranking.retryPending().catch(() => undefined); };
  retryRanking();
  win.addEventListener('online', retryRanking);

  // ------------------------------------------------------------ game
  const rewardCfg = expansion?.profile.rewards ?? null;
  const onChange = (snap: ControllerSnapshot) => {
    if (afPanel) {
      afPanel.update({ state: snap.state, view: snap.view, maxBonusAmmo: tuning.maxBonusAmmoTotal }, !!controller?.persistencePending);
      talkPanel?.update(snap.view.aimFirst?.talk);
    } else panel?.update(controlsModel(snap.state, snap.view, tuning.maxBonusAmmoTotal, snap.lastSummary));
    root.dataset.phase = snap.state.phase;
    if (expansion) updateExpandedUi(snap);
    if (rewardPanel && rewardCfg) rewardPanel.update(snap.view.expansion?.rewards, { shots: rewardCfg.order.shots, amount: rewardCfg.order.amount });
  };

  // Text for the expanded view and panel: UI keys through i18n, exp.* content keys through the content resolvers.
  const uiText = (k: string, p?: Readonly<Record<string, string | number>>) => (k in UI_KEYS ? i18n.t(k as UiKey, p) : k);
  const baseExpText = expandedUi ? expandedUi.createExpansionTranslator(() => i18n.locale, uiText) : uiText;
  // r007 words (af.*, the four r007 effect names) come from their own table; everything else as before.
  // r007: its own words, and FX012/013/035/036 read as power-zone effects everywhere (card, result, 3D labels).
  const expText = expandedUi ? expandedUi.aimFirstTranslator(() => i18n.locale, baseExpText, expansion) : baseExpText;

  const updateExpandedUi = (snap: ControllerSnapshot) => {
    const ex = snap.view.expansion;
    const q = ex?.question ?? null;
    if (questionPanel) {
      const content = q && q.answer === null && expansion && expandedUi ? expandedUi.questionContentFor(expansion, { shotId: q.shotId, questionId: q.questionId }, (k) => expText(k)) : null;
      if (content) {
        const key = `${content.shotId}/${content.questionId}`;
        if (key !== shownQuestion) cue('questionShown');
        shownQuestion = key;
        questionPanel.show(content);
      } else {
        shownQuestion = '';
        questionPanel.hide();
      }
      questionPanel.setPaused(snap.view.paused, !reasons.length && !controller?.persistencePending);
    }
    // During flight the overview only needs a few updates per second.
    const now = win.performance.now();
    if (boothMap && (now - mapUpdatedAt > 150 || snap.state.phase !== 'resolving')) {
      mapUpdatedAt = now;
      const series = ex?.outlineSeries && expansion?.series.get(ex.outlineSeries);
      boothMap.update({
        ...(series && expandedUi ? {
          outlined: new Set(expandedUi.seriesOutlineTargets(snap.frame.prizes, series)),
          outlineColor: series.color,
        } : {}),
        standX: snap.view.standX,
        aspect: (canvas.clientWidth || win.innerWidth) / Math.max(1, canvas.clientHeight || win.innerHeight),
        prizes: snap.frame.prizes,
        ...(ex ? { cells: ex.cells } : {}),
        interactive: snap.state.phase === 'position' && !snap.view.paused,
      });
    }
  };

  const loop = (ts: number) => {
    if (disposed) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    if (screen === 'game' && (!atomic || recovery.hidden) && controller) {
      controller.frame(dt);
      if (speech) tickSpeech(dt);
      if (import.meta.env.VITE_SHATEKKI_PREVIEW_METER === '1' && win.shatekkiMeasureFrame) {
        const state = controller.current;
        const graph = renderer?.graph;
        win.shatekkiMeasureFrame(ts, graph && !controller.persistencePending && !controller.awaitingAnswer && !state.pauseReasons.length ? {
          run: state.runId, shot: state.shotsFired, corks: graph.projectiles.size,
          prizes: [...graph.prizes.values()].filter(prize => prize.mesh.visible).length,
          cells: graph.cells?.cellCount ?? 0,
        } : null);
      }
    }
    raf = win.requestAnimationFrame(loop);
  };

  const playCommandCue = (cmd: GameCommand) => {
    const s = controller?.current;
    switch (cmd.type) {
      case 'CONFIRM_POSITION':
        return cue('loadStart');
      case 'STOP_LOAD':
        // P5 (rewards versions): the latch sounds at the same moment as the perfect-load sound.
        if (rewardCfg && s?.load?.tier === 'perfect') {
          if (!illustratedRewards) cue('critLatch');
          if (atomic) return;
        }
        return cue('loadStop', s?.load ? { tier: s.load.tier } : {});
      case 'FIRE':
        return cue('fire');
      // r007: the gauge opens and closes (no heartbeat or sway sounds exist in this candidate)
      case 'OPEN_GAUGE':
        return cue('loadStart');
      case 'CANCEL_GAUGE':
        return cue('cancel');
      case 'CHOOSE_SHOPKEEPER_TALK':
        return undefined;
      case 'PAUSE':
        audio.silence();
        return cue('cancel');
      case 'RESUME':
        return cue('confirm');
      default:
        return undefined;
    }
  };

  const uiCommand = (cmd: GameCommand): boolean | Promise<boolean> => {
    if (markStale() || !controller || (atomic && !recovery.hidden)) return false;
    // r007: while the talk panel is open nothing behind it acts, however the input arrives
    // (a pointer, Tab + Enter, a glide frame or a release that comes late).
    if (talkPanel?.isOpen && !TALK_COMMANDS.has(cmd.type)) return false;
    if (session) return controller.dispatchPersisted(cmd).then(status => status === 'applied');
    const accepted = controller.dispatch(cmd);
    if (accepted) playAcceptedCue(cmd);
    return accepted;
  };

  const playAcceptedCue = (cmd: GameCommand) => {
    if (cmd.type === 'ANSWER_SHOPKEEPER') cue('answerAccepted');
    else if (cmd.type === 'SET_POSITION') return;
    else if (cmd.type === 'ORDER') cue(cmd.accept ? 'confirm' : 'cancel');
    else playCommandCue(cmd);
  };

  const mountAimFirstPanel = (): PanelHandle => {
    const kit = expandedUi!;
    afPanel = kit.mountAimFirstControls(ui, {
      dispatch: (cmd) => uiCommand(cmd as GameCommand),
      commitAim: () => void controller?.commitAim(),
      revertAim: () => controller?.revertAim(),
      noteText: (n) => nextNoteText(n),
      currentAim: () => controller?.current.aim ?? { yaw: 0, pitch: 0 },
      currentStandX: () => controller?.current.standX ?? 0,
      onRetry: () => void leaveResult(true),
      onTalk: () => {
        // only from a stable aim: not while a save is running, the gauge is open or the stage is paused
        const c = controller;
        const talk = c?.viewState().aimFirst?.talk;
        if (!c || !talk || c.persistencePending || c.current.phase !== 'aiming' || reasons.length > 0) return;
        talkPanel?.open(talk);
      },
      t: (k, p) => (kit.isAfKey(k) ? kit.afText(i18n.locale, k, p) : t(k)),
      move: { step: aimFirstCfg!.moveStep, holdDelayMs: aimFirstCfg!.holdDelayMs, holdSpeed: aimFirstCfg!.holdSpeed, min: layout.camera.standMinX, max: layout.camera.standMaxX },
    });
    // Above the 3D labels (the stage overlay layers sit over the whole ui layer).
    talkPanel = kit.mountTalkPanel(overlay, {
      t: expText,
      choose: async (choice) => {
        const ok = await uiCommand({ type: 'CHOOSE_SHOPKEEPER_TALK', choice });
        if (ok) cue('confirm');
        return ok;
      },
      describe: (o) => talkText(o),
      onOpenChange: (open) => {
        // the controls cannot be focused or pressed behind the panel; closing gives them back
        ui.inert = open || !recovery.hidden;
        if (open) {
          afPanel?.cancelGestures();
          speech?.hide();
          speechBubble?.hide();
          cue('select');
        }
      },
    });
    speechBubble = kit.mountSpeechBubble(overlay);
    speech = new kit.SpeechScheduler(controller?.current.seed ?? 0, aimFirstCfg!.speech, kit.SPEECH_LINES);
    afCard = kit.mountAimFirstCard(overlay, expText, kit.prizePortrait);
    const handle = afPanel;
    return { cancelGestures: () => handle.cancelGestures(), update: () => undefined, dispose: () => handle.dispose() };
  };

  /** One reserved next-shot setting with its source, the same words on the HUD mark and the shot card. */
  const nextNoteText = (n: import('./contracts').NextNote): string => {
    const src = n.source === 'cell' ? i18n.t('fxres.src.cell') : n.source === 'answer' ? i18n.t('fxres.src.answer') : n.source === 'device' ? i18n.t('fxres.src.device')
      : n.source === 'talk' ? expText('af.talk.title') : expText('af.speaker') + '・' + expText(`af.part.${n.part ?? 'feet'}`);
    const what = n.effectId ? expText(`exp.fx.${n.effectId}.name`) : n.powerZoneWidthMult !== undefined ? expText('af.gauge.width', { m: n.powerZoneWidthMult }) : '';
    return what ? expText('af.next.note', { src, what }) : src;
  };

  const nextLineOf = (s: RunState | undefined): string => {
    const notes = s && isExpandedRunState(s) ? s.expansion.aimFirst?.nextNotes ?? [] : [];
    return notes.length > 0 ? `${expText('af.next.mark')}: ${notes.map(nextNoteText).join(' / ')}` : '';
  };

  /** Words for a saved talk result (hint names or the corks received). */
  const talkText = (o: NonNullable<NonNullable<RunState['expansion']>['aimFirst']>['talk'] & object, withAmmo = true): string => {
    if (o.choice === 'ammo') return withAmmo
      ? expText('af.talk.result.ammo', { n: o.ammoGranted, ammo: controller?.current.ammo ?? 0, m: o.powerZoneWidthMult ?? 1 })
      : expText('af.talk.result.ammoShort', { n: o.ammoGranted, m: o.powerZoneWidthMult ?? 1 });
    if (o.hint?.setId) return expText('af.talk.result.hint', { set: setDisplayName(i18n.locale, String(o.hint.setId), expText) || String(o.hint.setId), names: o.hint.missingTypeIds.map((id) => prizeName(i18n.locale, id)).join('・') });
    return expText('af.talk.result.noHint');
  };

  /** r007 speech: counts only calm aiming time; the bubble sits by the shopkeeper's head or at the top. */
  const tickSpeech = (dt: number) => {
    const c = controller;
    if (!c || !speech || !speechBubble || !expandedUi) return;
    const s = c.current;
    const view = c.viewState();
    const calm = s.phase === 'aiming' && s.pauseReasons.length === 0 && !c.persistencePending && !talkPanel?.isOpen && !afCard?.isVisible &&
      !view.expansion?.question && view.expansion?.rewards?.order?.status !== 'offered' && recovery.hidden && reasons.length === 0;
    const head = renderer?.projectShopkeeperHead?.() ?? null;
    const facts = { state: s, view, last: c.snapshot().lastSummary, maxBonusAmmo: tuning.maxBonusAmmoTotal, rewards: rewardCfg, mode, recorded: !atomic?.memory, shopkeeperVisible: head !== null };
    const r = speech.tick(dt, calm, expandedUi.speechConditions(facts));
    if (r.showing === null) speechBubble.hide();
    else if (r.start !== null) {
      speechBubble.show(expandedUi.speechText(i18n.locale, r.start), expText('af.speaker'), head);
      cue('speech');
    } else speechBubble.follow(head);
  };

  const mountPanel = () => {
    panel?.dispose();
    afPanel = null;
    talkPanel?.destroy();
    talkPanel = null;
    speechBubble?.destroy();
    speechBubble = null;
    speech = null;
    afCard?.destroy();
    afCard = null;
    panel = aimFirstCfg && expandedUi ? mountAimFirstPanel() : mountControls(ui, {
      dispatch: (cmd) => uiCommand(cmd as GameCommand),
      currentAim: () => controller?.current.aim ?? { yaw: 0, pitch: 0 },
      currentStandX: () => controller?.current.standX ?? 0,
      onRetry: () => {
        if (atomic) void leaveResult(true);
        else void startRun({ name: runName });
      },
      ...(expansion ? { stand: standRangeOf(layout) } : {}),
    });
    questionPanel?.destroy();
    questionPanel = null;
    boothMap?.destroy();
    boothMap = null;
    effectResults?.destroy();
    effectResults = null;
    rewardMotions?.destroy();
    rewardMotions = null;
    rewardPanel?.destroy();
    rewardPanel = null;
    if (expansion && expandedUi) {
      boothMap = expandedUi.mountBoothMap(ui, {
        layout,
        t: expText,
        onJump: (x) => {
          const accepted = uiCommand({type:'SET_POSITION', x});
          if (accepted instanceof Promise) void accepted.then(ok => { if (ok) cue('select'); });
          else if (accepted) cue('select');
        },
      });
      // Mounted after the controls so it sits above them; its backdrop takes the touches while shown.
      questionPanel = expandedUi.createShopkeeperQuestionPanel(ui, {
        scrollable: illustratedRewards,
        t: expText,
        onAnswer: uiCommand,
        onResume: bundle.behavior?.clock === 'fixed' ? () => {
          if (!reasons.length) void uiCommand({ type: 'RESUME', reason: 'manual' });
        } : undefined,
      });
      effectResults = expandedUi.mountEffectResults(ui, {
        t: expText,
        line: (key) => expandedUi.expandedLine(i18n.locale, key),
      });
      if (rewardCfg) {
        rewardPanel = expandedUi.mountRewardPanel(ui, {
          t: expText,
          prizeName: (typeId) => prizeName(i18n.locale, typeId),
          onOrder: (accept) => uiCommand({type:'ORDER', accept}),
        });
        if (illustratedRewards) {
          rewardMotions = expandedUi.mountRewardMotions(ui, {
            setsFirst: !!aimFirstCfg,
            cue,
            card: (input, event) => {
              if (afCard && expandedUi) {
                // r007: one card per shot built from the confirmed summary only.
                const fx = expandedUi.effectResultsModel(event.summary, { t: expText, line: (key) => expandedUi.expandedLine(i18n.locale, key) }, { maxLines: Infinity });
                const effectLines = [...fx.lines.map((l) => (l.name ? `${l.name}: ${l.text}` : l.text)), ...(fx.deferred ? [fx.deferred] : [])];
                const model = expandedUi.aimFirstCardModel(
                  { summary: event.summary, freshSets: event.freshSets, ammoBeforeShot: event.ammoBeforeShot, effectLines, nextLine: nextLineOf(controller?.current) },
                  { t: expText, prizeName: (id) => prizeName(i18n.locale, id), setName: (id) => setDisplayName(i18n.locale, String(id), expText) || String(id), setMembers: (id) => catalog.sets.get(id)?.requiredTypeIds ?? [] },
                );
                const bankShot = event.summary.prizeOutcomes.some(prize => prize.collected && prize.hits.some(hit => hit.reflectionIndex > 0));
                const replay = !event.replayed && bankShot
                  ? renderer?.shotReplay?.latest(event.summary.runId, event.summary.shotId)
                  : null;
                afCard.show(model, {
                  quiet: event.replayed || event.reducedMotion,
                  path: replay ? expandedUi.miniShotPath(doc, replay, i18n.locale, event.reducedMotion) : null,
                });
                return;
              }
              effectResults?.show(event.summary);
              rewardPanel?.showShot({
                ...input,
                collectedPrizes: event.summary.collected,
                staticCard: event.replayed || event.reducedMotion,
                setName: id => setDisplayName(i18n.locale, String(id), expText) || String(id),
                setMembers: id => catalog.sets.get(id)?.requiredTypeIds ?? [],
              });
            },
          });
        }
      }
      mapUpdatedAt = -Infinity;
    }
    if (controller) onChange(controller.snapshot());
  };

  const ensureEngine = async (): Promise<ShotWorld> => {
    if (world) return world;
    const { sim, view } = await loadHeavyModules();
    const w = await sim.createShotWorld(layout, catalog, tuning, {
      transformPolicy: bundle.behavior?.transformPolicy,
      reportPrizeContacts: illustratedRewards,
      rewardDevices: rewardCfg ? rewardDevicesFor(rewardCfg) : undefined,
    });
    world = w;
    try {
      renderer = view.createThreeRenderer(canvas, {
        layout,
        duskMaterials: festivalPreview,
        ...(expansion ? { expanded: { catalog, expansion, illustratedRewards, translate: expText, prizeName: (typeId) => prizeName(i18n.locale, typeId) } } : {}),
        corkRadius: tuning.cork.radius,
        translate: (key, params) => (key in UI_KEYS ? i18n.t(key as UiKey, params) : key),
        // Miss / near-miss are decided only after settlement (AC27).
        onSettled: (cls) => {
          // r007 never plays the old "miss" sound: every shot gets its own line on the card instead.
          if (aimFirstCfg) return;
          if (cls === 'miss') cue('miss');
          else if (cls === 'nearMiss') cue('nearMiss');
        },
        resolvePrize: (typeId) => {
          const p = catalog.prizes.get(typeId);
          if (!p) throw new Error(`unknown prize ${typeId}`);
          return { shape: p.shape, modelKey: p.modelKey, material: p.material };
        },
      });
      renderer.resize(canvas.clientWidth || win.innerWidth, canvas.clientHeight || win.innerHeight);
    } catch (err) {
      console.error('renderer init failed', err);
      renderer = null;
      noticeKey = 'app.error.renderer';
      notice.textContent = i18n.t(noticeKey);
      notice.hidden = false;
    }
    return w;
  };

  /** The settled summary of the shot that ended the run (expanded rules show it on the result). */
  const lastShotOf = (summary: ShotSummary | null, fresh: readonly SetId[] = []): LastShotInput | null => {
    if (!expansion || !summary) return null;
    return {
      shotNumber: summary.shotNumber,
      effects: summary.effects ?? [],
      deferredTransforms: summary.deferredTransforms ?? [],
      ammoAfter: summary.ammoAfter,
      ...(summary.rewards ? { rewards: summary.rewards } : {}),
      ...(illustratedRewards ? { sets: summary.newlyCompletedSets.map(setId => ({ setId, fresh: fresh.includes(setId) })) } : {}),
    };
  };
  /** Rewards versions keep the ended run so a reload opens the same result (plan T2); this records what the result showed. */
  const resultMetaKey = `shatekki.resultView.${catalog.rulesVersion}`;
  const saveResultMeta = (runId: string, selfBestBefore: number | null, newBest: boolean) => {
    try {
      modeStorage.setItem(resultMetaKey, JSON.stringify({ runId, selfBestBefore, newBest }));
    } catch {
      /* the result still shows; a reload then reads the stored best only */
    }
  };
  const readResultMeta = (runId: string): { selfBestBefore: number | null; newBest: boolean } | null => {
    try {
      const raw = modeStorage.getItem(resultMetaKey);
      const m = raw ? (JSON.parse(raw) as { runId?: unknown; selfBestBefore?: unknown; newBest?: unknown }) : null;
      if (!m || m.runId !== runId) return null;
      return { selfBestBefore: typeof m.selfBestBefore === 'number' ? m.selfBestBefore : null, newBest: m.newBest === true };
    } catch {
      return null;
    }
  };
  /** Leaving a kept result (new run, or home on purpose) closes it for good. */
  const closeKeptResult = () => {
    if (!rewardCfg) return;
    runStore.clear();
    try {
      modeStorage.removeItem(resultMetaKey);
    } catch {
      /* nothing to close */
    }
  };

  const onRunEnded = (state: RunState, summary: ShotSummary | null) => {
    const result = finalResult(state);
    const lastShot = lastShotOf(summary, session?.record.lastFreshSets);
    const selfBestBefore = atomic ? session!.record.selfBestBefore : profile.load().bestScore;
    const newBest = atomic ? session!.record.newBest : profile.recordRunEnd(result).newBest;
    cue('runEnd');
    const fireSaveFailed = runStore.status().fireSaveFailed;
    if (atomic) {
      atomic.keep(session!.record);
    } else if (rewardCfg) {
      // Save what the result shows before the screen changes, then keep the ended run (plan T2).
      saveResultMeta(state.runId, selfBestBefore, newBest);
      runStore.saveStable(state);
    } else runStore.clear();
    // A run whose pre-shot save failed cannot prove a lost shot on reload: never submit it (persistence-design §5).
    if (rankingAvailable && !fireSaveFailed) void ranking.submit(result).catch(() => undefined);
    // Let the last settle presentation play briefly before the result screen.
    win.setTimeout(() => {
      if (disposed || screen !== 'game' || controller?.current.runId !== state.runId) return;
      if (atomic && (!atomic.record?.resultViewOpen || !recovery.hidden)) return;
      showResult(result, selfBestBefore, newBest, lastShot);
    }, 900);
  };

  const makeController = (w: ShotWorld, initial: RunState): GameController =>
    new GameController(
      {
        rules: CORE_RULES,
        preciseRewardAim: illustratedRewards,
        world: w,
        renderer,
        catalog,
        tuning,
        layout,
        expansion,
        onConfirmed: (event) => {
          if (festivalPreview && event.kind === 'shot' && !event.replayed) {
            renderer?.presentFestivalShot(event.summary, event.freshSets.length, event.ammoBeforeShot, event.reducedMotion);
          }
          rewardMotions?.presentRewardMotion(event);
        },
        reducedMotion: () => win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        ...(session ? {session, onReplayed: showSavedRecord} : {}),
        clockPolicy: bundle.behavior?.clock,
        initialGameTick: session?.record.gameTick,
        transformPolicy: bundle.behavior?.transformPolicy,
        onChange,
        onSimEvents: (events) => {
          for (const e of events) audio.handle(e, audioSettings);
        },
        // Checkpoints (persistence-design.md §2): before the sim runs, after STOP_LOAD, after settlement.
        onShotFired: (s) => {
          afCard?.hide();
          speech?.hide();
          speechBubble?.hide();
          rewardMotions?.clear();
          effectResults?.hide();
          rewardPanel?.hideCard();
          firedWithLastCork = s.ammo === 0;
          if (festivalPreview && s.inFlight) renderer?.beginFestivalShot(s.inFlight.shotId, s.load?.tier === 'perfect');
          if (atomic) return;
          runStore.saveAfterFire(s);
          markStale();
        },
        onCommandApplied: (cmd, s) => {
          if (atomic) {
            if (s.pauseReasons.every(reason => reason === 'manual')) playAcceptedCue(cmd);
            return;
          }
          // ORDER (A9): the answer is part of the run, so a reload before the first shot keeps it.
          if (cmd.type === 'STOP_LOAD' || cmd.type === 'ORDER') runStore.saveStable(s);
        },
        onShotSettled: (summary, s) => {
          if (import.meta.env.VITE_SHATEKKI_PREVIEW_METER === '1') {
            win.shatekkiMeasureSettlement?.(win.performance.now(), s.runId, summary.shotNumber, summary.chainCount, summary.runEnded);
          }
          if (illustratedRewards) {
            if (s.phase === 'ended') onRunEnded(s, summary);
            return;
          }
          effectResults?.show({ effects: summary.effects, deferredTransforms: summary.deferredTransforms });
          // One coalesced cue for what the post-flight effects did (expanded rules only).
          const effectCue = effectCueFor(summary.effects);
          if (rewardCfg && expandedUi) {
            // Rewards versions (P1-P3): one big moment per shot; everything else stays on the card.
            const fresh = session ? session.record.lastFreshSets : summary.newlyCompletedSets.length > 0 ? profile.discoverSets(summary.newlyCompletedSets) : [];
            const input = {
              collected: summary.chainCount,
              completedSets: summary.newlyCompletedSets,
              freshSets: fresh,
              firedWithLastCork,
              ammoAfter: summary.ammoAfter,
              runEnded: summary.runEnded,
              rewards: summary.rewards ?? [],
            };
            const moment = expandedUi.momentCue(expandedUi.shotMoment(input), summary.chainCount);
            if (moment) cue(moment.cue, moment.count !== undefined ? { count: moment.count } : {});
            else if (effectCue) cue(effectCue);
            if (summary.ledger.nominalPenalty > 0) cue('penalty');
            rewardPanel?.showShot({ ...input, setName: (id) => setDisplayName(i18n.locale, String(id), (k) => expText(k)) || String(id) });
          } else {
          if (effectCue) cue(effectCue);
          if (summary.chainCount > 0) cue('collect', { count: summary.chainCount });
          if (summary.newlyCompletedSets.length > 0) {
            cue('setComplete');
            const fresh = profile.discoverSets(summary.newlyCompletedSets);
            if (fresh.length > 0) cue('setDiscovered');
          }
          if (summary.ledger.nominalPenalty > 0) cue('penalty');
          if (summary.bonusAmmoGranted > 0) cue('ammoBonus');
          }
          if (s.phase === 'ended') onRunEnded(s, summary);
          else if (!atomic) runStore.saveStable(s);
        },
      },
      initial,
    );

  const recovery = doc.createElement('section');
  recovery.className = 'save-dialog';
  recovery.dataset.testid = 'save-dialog';
  recovery.hidden = true;
  recovery.setAttribute('role', 'alert');
  root.append(recovery);

  const savePrompt = (key: UiKey, retry?: () => void, conflict = false) => {
    recovery.replaceChildren();
    recovery.hidden = false;
    root.dataset.saving = key;
    ui.inert = screens.inert = resumeBox.inert = true;
    panel?.cancelGestures();
    const message = doc.createElement('p');
    message.textContent = i18n.t(key);
    recovery.append(message);
    if (!retry) return;
    for (const [label, action] of [
      [conflict ? 'save.reload' : 'save.retry', retry],
      ['save.memory', () => {
        atomic!.useMemory();
        session = null;
        clearEngine();
        dismissPrompt();
        void startRun({name:null, daily:mode === 'daily'});
      }],
    ] as const) {
      const button = doc.createElement('button');
      button.className = 'btn';
      button.dataset.testid = label;
      button.textContent = i18n.t(label);
      button.onclick = action;
      recovery.append(button);
    }
  };

  const clearEngine = () => {
    controller = null;
    audio.silence();
    renderer?.dispose();
    renderer = null;
    world?.dispose();
    world = null;
  };

  const dismissPrompt = () => {
    recovery.hidden = true;
    delete root.dataset.saving;
    ui.inert = screens.inert = resumeBox.inert = false;
    if (talkPanel?.isOpen) ui.inert = true;
    lastTs = 0;
  };

  const saveError = (error: unknown, retry: () => void) => {
    const reason = (error as {reason?: string} | null)?.reason;
    if (reason === 'conflict' || reason === 'invalid') savePrompt('save.conflict', () => void loadAtomic(), true);
    else if (reason === 'blocked') savePrompt('save.blocked', retry);
    else savePrompt(reason === 'quota' ? 'save.quota' : 'save.failure', retry);
  };

  const saveStatus = (current: PersistedSession) => {
    if (session !== current || disposed) return;
    if (current.status === 'ready') {
      atomic!.keep(current.record);
      dismissPrompt();
    } else if (current.status === 'pending') savePrompt('save.pending');
    else saveError({reason:current.reason}, () => void current.retry());
  };

  const DAILY_DATE_KEY = 'shatekki.dailyDate';
  /** Start a new run with the name fixed now (null = anonymous), or continue a saved one. */
  const startRun = async (opts: { name: string | null; resume?: RunState; daily?: boolean }): Promise<void> => {
    if (starting) return;
    starting = true;
    status.textContent = i18n.t('app.status.preparing');
    try {
      const w = await ensureEngine();
      let initial: RunState;
      if (opts.resume) {
        initial = rankingAvailable ? opts.resume : { ...opts.resume, playerName: null };
        runName = initial.playerName;
      } else {
        runName = rankingAvailable ? opts.name : null;
        // E4: a new daily game takes today's Japan date; the same date and version give the same stall.
        setMode(opts.daily && hasDaily ? 'daily' : 'normal');
        let seed = newSeed(win);
        let scope: RunScope | undefined = atomic?.scope(mode);
        if (mode === 'daily') {
          const { date, seed: stallSeed } = dailyStart(Date.now(), catalog.rulesVersion);
          seed = stallSeed;
          if (atomic) scope = atomic.scope(mode, date);
          else try {
            modeStorage.setItem(DAILY_DATE_KEY, date);
          } catch {
            /* the stall is still fixed by the seed in the saved run */
          }
        }
        const config = { runId: mintId.run(newRunId(win)), seed, tuning, playerName: runName };
        initial = expansion ? createExpandedRun(config, { catalog, tuning, layout, expansion }) : CORE_RULES.createRun(config, catalog);
        if (atomic && scope) {
          savePrompt('save.pending');
          await atomic.start(scope, initial);
        } else runStore.saveStable(initial);
      }
      if (rankingAvailable) ranking.beginRun({ runId: initial.runId, playerName: runName, valueStatus: initial.valueStatus });
      clearScreen();
      if (atomic && atomic.record) {
        session = new PersistedSession(atomic.repo, atomic.record, saveStatus);
        root.dataset.dailyDate = atomic.record.scope.mode === 'daily' ? atomic.record.scope.startedDateJst : '';
        dismissPrompt();
      }
      renderer?.clearFestival();
      controller = makeController(w, initial);
      controller.setEnvironmentPause(reasons);
      setScreen('game');
      mountPanel();
      const record = session?.record;
      if (opts.resume && record?.lastSummary && !record.state.inFlight) {
        rewardMotions?.presentRewardMotion({
          kind: 'shot', runId: record.state.runId, shotId: record.lastSummary.shotId,
          summary: record.lastSummary, freshSets: record.lastFreshSets, ammoBeforeShot: record.ammoBeforeShot,
          replayed: true, reducedMotion: true,
        });
      }
      root.dataset.started = 'true';
      notice.hidden = true;
      if (atomic?.memory || atomic?.unreadable) {
        notice.textContent = i18n.t(atomic.memory ? 'save.memoryNotice' : 'save.unreadable');
        notice.hidden = false;
      }
      if (!raf) {
        lastTs = 0;
        raf = win.requestAnimationFrame(loop);
      }
    } catch (err) {
      if (atomic) { saveError(err, () => void startRun(opts)); return; }
      console.error('start failed', err);
      noticeKey = 'app.error.start';
      notice.textContent = i18n.t(noticeKey);
      notice.hidden = false;
    } finally {
      starting = false;
      status.textContent = '';
    }
  };

  // ------------------------------------------------------------ screens
  const openSetBook = async () => {
    let discovered: readonly SetId[];
    if (atomic) {
      const request = ++bookRequest;
      const current = () => request === bookRequest && !starting && !disposed && recovery.hidden;
      try {
        const scope = atomic.record?.scope ?? atomic.scope(mode);
        discovered = (await atomic.repo.readProfile(scope)).discoveredSets;
      } catch (err) {
        if (current()) saveError(err, () => { dismissPrompt(); void openSetBook(); });
        return;
      }
      if (!current()) return;
    } else discovered = profile.load().discoveredSets;
    bookHandle?.dispose();
    const last = controller?.current ?? shownEnded;
    bookHandle = mountSetBook(
      overlay,
      {
        i18n,
        onClose: () => {
          bookHandle?.dispose();
          bookHandle = null;
        },
        // Pair-set names and hints (expanded build only; the public build has no PAIR sets).
        ...(expansion ? { expandedText: (k: string) => expText(k) } : {}),
      },
      {
        sets: setBookEntriesFromCatalog(catalog),
        discovered,
        completedThisRun: last && screen === 'result' ? last.completedSets : [],
        prototypeHints: isPrototype,
      },
    );
  };

  const showHome = () => {
    clearScreen();
    setScreen('home');
    setMode('normal');
    const settings = settingsStore.load();
    const home = mountHome(
      screens,
      {
        i18n,
        links,
        onStart: (name) => {
          cue('start');
          void startRun({ name: normalizePlayerName(name) });
        },
        onNameChange: (draft) => {
          nameStore.set(draft);
        },
        onAudioChange: (next) => {
          audioSettings = settingsStore.save({ audio: next }).audio;
          if (!audioSettings.enabled || audioSettings.volume <= 0) audio.silence();
          else cue('select');
        },
        onOpenSetBook: openSetBook,
      },
      { ...(aimFirstCfg && expandedUi ? { howtoSteps: (loc: typeof i18n.locale) => [1, 2, 3, 4, 5].map((n) => expandedUi.afText(loc, `af.howto.${n}` as never)) } : {}), nameDraft: nameStore.get() ?? '', selfBest: atomic ? atomic.profile(atomic.scope('normal')).bestScore : normalProfile.load().bestScore, audio: settings.audio, prototype: isPrototype, rulesVersion: catalog.rulesVersion, rankingAvailable },
    );
    screenHandle = home;
    // Rewards versions: today's stall (E4) and the souvenir shelf (E3) under the normal start.
    if (hasDaily && dailyProfile) {
      const col = screens.querySelector<HTMLElement>('.scr-home .scr-col');
      if (col) {
        const sec = doc.createElement('section');
        sec.className = 'sec daily';
        sec.dataset.testid = 'home-daily';
        const date = jstDateOf(Date.now());
        const btn = doc.createElement('button');
        btn.type = 'button';
        btn.className = 'btn';
        btn.dataset.testid = 'home-daily-start';
        btn.addEventListener('click', () => {
          cue('start');
          void startRun({ name: null, daily: true });
        });
        const note = doc.createElement('p');
        note.className = 'note';
        const best = atomic ? atomic.profile(atomic.scope('daily', date)).bestScore : dailyProfile.load().bestScore;
        const oldBest = atomic?.profile(atomic.scope('daily', date)).legacyBestScore;
        const shelf = doc.createElement('p');
        shelf.className = 'note';
        shelf.dataset.testid = 'home-souvenirs';
        const slots = atomic ? atomic.shelf.slots : souvenirs?.load().slots ?? [];
        const updateLabels = () => {
          btn.textContent = expText('daily.start');
          const dailyLines = [expText('daily.note', { date })];
          if (best !== null) dailyLines.push(expText('daily.best', { score: best }));
          if (oldBest != null) dailyLines.push(i18n.t('save.legacyDailyBest', { score: oldBest }));
          note.textContent = dailyLines.join(' ');
          const names = slots.map(slot => slot ? prizeName(i18n.locale, slot.typeId) : expText('souvenir.empty'));
          shelf.textContent = `${expText('souvenir.title')}: ${names.join(' / ')}`;
        };
        updateLabels();
        const unsubscribe = i18n.subscribe(updateLabels);
        screenHandle = {
          ...home,
          dispose() {
            unsubscribe();
            home.dispose();
          },
        };
        sec.append(btn, note, shelf);
        col.appendChild(sec);
      }
    }
  };

  let stopCelebration: (() => void) | null = null;
  // Expanded build: pair-set names from the same source as the book, every last-shot line (no 5-line cap).
  const resultText: ResultTextOptions | undefined =
    expansion && expandedUi
      ? {
          expandedText: (k: string) => expText(k),
          describeEffects: (i) => expandedUi.effectResultsModel(i, { t: expText, line: (key) => expandedUi.expandedLine(i18n.locale, key) }, { maxLines: Infinity }),
          ...(rewardCfg
            ? {
                describeReward: (o, collected) => {
                  const details = illustratedRewards ? { collected, prizeName: (id: string) => prizeName(i18n.locale, id) } : undefined;
                  const l = expandedUi.rewardLine(o, expText, details);
                  return { sourceLabel: expText('reward.card.title'), name: l.name, text: l.text, note: null, applied: l.granted > 0 };
                },
                bestShot: (r) => expandedUi.bestShotOf(r),
              }
            : {}),
        }
      : undefined;

  let shownEnded: RunState | null = null;
  let souvenirView: SouvenirShelfHandle | null = null;
  const leaveResult = async (play: boolean) => {
    const daily = mode === 'daily';
    if (atomic) {
      if (!recovery.hidden) return;
      savePrompt('save.pending');
      try { await atomic.close(); }
      catch (err) { saveError(err, () => { dismissPrompt(); void leaveResult(play); }); return; }
      dismissPrompt();
      if (!play) { await loadAtomic(); return; }
    } else closeKeptResult();
    if (play) await startRun({name:runName, daily});
    else showHome();
  };

  const showResult = (result: FinalResult, selfBestBefore: number | null, newBest = false, lastShot: LastShotInput | null = null, readOnly = false) => {
    clearScreen();
    setScreen('result');
    afCard?.hide();
    speechBubble?.hide();
    // A result reopened after a reload is read only: no sounds or celebration again (plan T2).
    if (!readOnly) {
      cue('resultShow');
      if (newBest) cue('newBest');
    }
    const replay = result.status === 'completed' ? renderer?.shotReplay?.highlight(result.runId) : null;
    const quietResult = readOnly || (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
    const resultPrizeName = (id: string) => prizeName(i18n.locale, id);
    const handle = mountResult(
      screens,
      {
        i18n,
        onRetry: () => void leaveResult(true),
        onHome: () => void leaveResult(false),
        onRetrySubmit: () => void ranking.retryPending({ includePermanent: false }).catch(() => undefined),
        onRetryTop: () => void ranking.fetchTop().catch(() => undefined),
        onOpenSetBook: openSetBook,
        ...(illustratedRewards && expandedUi ? {
          renderLastSet: set => expandedUi.renderRewardSet(
            doc, { ...set, members: catalog.sets.get(set.setId)?.requiredTypeIds ?? [] },
            id => prizeName(i18n.locale, id), expText('reward.set.seal'),
          ),
        } : {}),
        ...(festivalPreview && expandedUi ? {
          renderPrizeShelf: saved => expandedUi.resultPrizeShelf(doc, saved, catalog, i18n.locale, resultPrizeName, quietResult),
          ...(replay ? { highlight: expandedUi.resultHighlight(doc, replay, i18n.locale, quietResult, resultPrizeName) } : {}),
          ...(newBest && selfBestBefore !== null && result.score > selfBestBefore
            ? { recordBreak: expandedUi.recordBreak(doc, selfBestBefore, result.score, i18n.locale, quietResult) } : {}),
        } : {}),
        ...(resultText ? { text: resultText } : {}),
      },
      { result, selfBestBefore, submit: ranking.getStatus(result.runId), top: ranking.getTop(), links, rankingAvailable, lastShot },
    );
    screenHandle = handle;
    // r007: the one talk of the run and the last shot's shopkeeper parts, read from the saved run (shown once).
    if (aimFirstCfg && expandedUi) {
      const col = screens.querySelector<HTMLElement>('.scr-result .scr-col');
      const ended = atomic?.record?.state ?? shownEnded ?? controller?.current ?? null;
      const talk = ended && isExpandedRunState(ended) ? ended.expansion.aimFirst?.talk ?? null : null;
      const lastSummary = atomic?.record?.lastSummary ?? controller?.snapshot().lastSummary ?? null;
      const parts = lastSummary?.parts ?? [];
      if (col && (talk || lastSummary)) {
        const sec = doc.createElement('section');
        sec.className = 'sec af-result';
        sec.dataset.testid = 'result-aim-first';
        if (lastSummary) {
          // 07: the last shot as it was confirmed and saved (read back, never recomputed)
          const h = doc.createElement('h3');
          h.textContent = expText('af.result.last');
          const tx = { t: expText, prizeName: (id: string) => prizeName(i18n.locale, id), setName: (id: SetId) => setDisplayName(i18n.locale, String(id), expText) || String(id), setMembers: (id: SetId) => catalog.sets.get(id)?.requiredTypeIds ?? [] };
          const fx = expandedUi.effectResultsModel(lastSummary, { t: expText, line: (key) => expandedUi.expandedLine(i18n.locale, key) }, { maxLines: Infinity });
          const model = expandedUi.aimFirstCardModel({ summary: lastSummary, freshSets: atomic?.record?.lastFreshSets ?? [], ammoBeforeShot: atomic?.record?.ammoBeforeShot ?? 0, effectLines: fx.lines.map((l) => (l.name ? `${l.name}: ${l.text}` : l.text)) }, tx);
          const box = doc.createElement('div');
          box.className = 'af-result-last';
          box.dataset.testid = 'result-last-shot';
          const delta = lastSummary.ledger.scoreAfter - lastSummary.ledger.scoreBefore;
          const score = doc.createElement('p');
          score.className = 'af-result-score';
          score.textContent = `${expText('af.result.delta', { p: delta >= 0 ? `+${delta}` : String(delta) })} · ${expText('af.result.total', { score: lastSummary.ledger.scoreAfter })}`;
          box.append(...expandedUi.cardBody(doc, model, expText, expandedUi.prizePortrait), score);
          sec.append(h, box);
        }
        if (talk) {
          const p = doc.createElement('p');
          p.dataset.testid = 'result-talk';
          p.textContent = expText('af.talk.used', { text: talkText(talk, false) });
          sec.appendChild(p);
        }
        if (parts.length > 0) {
          const h = doc.createElement('h3');
          h.textContent = expText('af.result.parts');
          sec.appendChild(h);
          for (const line of expandedUi.partLines(parts, { t: expText, prizeName: (id) => prizeName(i18n.locale, id), setName: (id) => setDisplayName(i18n.locale, String(id), expText) || String(id) })) {
            const p = doc.createElement('p');
            p.textContent = line;
            sec.appendChild(p);
          }
        }
        col.appendChild(sec);
      }
    }
    // E3: the souvenir shelf under the result (rewards versions; the same three slots in both modes).
    souvenirView?.dispose();
    souvenirView = null;
    if (souvenirs && !atomic?.memory) {
      const col = screens.querySelector<HTMLElement>('.scr-result .scr-col');
      const won = [...new Set(result.collected.map((c) => String(c.typeId)))];
      const store = atomic ? {
        load: () => atomic.shelf,
        place: async (input: Parameters<typeof souvenirs.place>[0]) => {
          const r = await atomic.repo.place({...input, expectedRevision:atomic.shelf.slotRevision});
          if (r.ok) atomic.shelf = r.shelf;
          else if (r.reason === 'conflict') {
            atomic.shelf = r.current;
            return {ok:false, reason:'saveFailed'} as const;
          }
          return r;
        },
      } : souvenirs;
      if (col) souvenirView = mountSouvenirShelf(col, { store, t: expText, name: (k) => prizeName(i18n.locale, k) }, { runId: result.runId, completed: result.status === 'completed', wonTypeIds: won });
    }
    void loadHeavyModules().then(({ view }) => {
      if (screen !== 'result' || readOnly) return;
      const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
      const host = screens.querySelector<HTMLElement>('.scr-result') ?? screens;
      stopCelebration = view.playResultCelebration(host, { newBest, sets: result.completedSets.length, reducedMotion });
    });
    if (rankingAvailable) {
      rankingUnsub = ranking.subscribe(() => handle.update({ submit: ranking.getStatus(result.runId), top: ranking.getTop() }));
      void ranking.fetchTop().catch(() => undefined);
    }
  };

  // Language changes re-render text only: ids, scoring and the current run are untouched.
  const unsubLocale = i18n.subscribe((locale) => {
    setControlsLocale(locale);
    rotate.textContent = t('rotate');
    resumeTitle.textContent = i18n.t('app.resume.title');
    resumeBtn.textContent = i18n.t('app.resume.continue');
    newBtn.textContent = i18n.t('app.resume.restart');
    stale.textContent = i18n.t('app.error.stale');
    if (!notice.hidden && noticeKey) notice.textContent = i18n.t(noticeKey);
    if (screen === 'game') mountPanel();
  });

  const showSavedRecord = (record: PersistedRecord) => {
    clearScreen();
    atomic!.keep(record);
    scopeChoices.replaceChildren();
    resumeBtn.hidden = false;
    session = null;
    clearEngine();
    setMode(record.scope.mode);
    root.dataset.dailyDate = record.scope.mode === 'daily' ? record.scope.startedDateJst : '';
    dismissPrompt();
    if (record.result) {
      if (!record.resultViewOpen) { showHome(); return; }
      shownEnded = record.state;
      showResult(record.result, record.selfBestBefore, record.newBest, lastShotOf(record.lastSummary, record.lastFreshSets), true);
    } else {
      setScreen('resume');
      const flight = !!record.state.inFlight;
      resumeTitle.textContent = i18n.t(flight ? 'save.inFlight' : 'app.resume.title');
      resumeBtn.textContent = i18n.t(flight ? 'save.abandon' : 'app.resume.continue');
      newBtn.hidden = flight;
    }
  };

  const loadAtomic = async () => {
    savePrompt('save.pending');
    session = null;
    clearEngine();
    try {
      const records = await atomic!.open();
      if (disposed) return;
      dismissPrompt();
      if (records.length > 1) {
        setScreen('resume');
        resumeTitle.textContent = i18n.t('save.chooseRun');
        resumeBtn.hidden = newBtn.hidden = true;
        scopeChoices.replaceChildren(...records.map(record => {
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'btn boot-start';
          button.dataset.testid = 'choose-' + record.scope.mode;
          button.textContent = record.scope.mode === 'daily'
            ? i18n.t('save.dailyRun', {date: record.scope.startedDateJst})
            : i18n.t('save.normalRun');
          button.onclick = () => showSavedRecord(record);
          return button;
        }));
      } else if (records[0]) showSavedRecord(records[0]);
      else showHome();
    } catch (error) { saveError(error, () => void loadAtomic()); }
  };

  const resumeAtomic = async (abandon: boolean) => {
    if (!atomic || !recovery.hidden) return;
    savePrompt('save.pending');
    try {
      const record = await atomic.claim();
      if (record.result) { showSavedRecord(record); return; }
      if (abandon) {
        const next = CORE_RULES.reduceGame(record.state,{type:'ABANDON'}, {catalog,tuning,layout,expansion});
        session = new PersistedSession(atomic.repo, record, saveStatus);
        await session.command(next, record.state.runId + '/abandon', record.gameTick, reply => showSavedRecord(reply.record));
      } else await startRun({name:null, resume:record.state});
    } catch (error) { saveError(error, () => { dismissPrompt(); void resumeAtomic(abandon); }); }
  };

  resumeBtn.addEventListener('click', () => {
    if (atomic) { void resumeAtomic(false); return; }
    if (restore.kind === 'resume') {
      const s = restore.state;
      restore = { kind: 'none' };
      void startRun({ name: s.playerName, resume: s });
    }
  });
  newBtn.addEventListener('click', () => {
    if (atomic) { void resumeAtomic(true); return; }
    restore = { kind: 'none' };
    showHome();
  });

  if (atomic) void loadAtomic();
  else if (restore.kind === 'resume') setScreen('resume');
  else if (keptEnded) {
    // Read only: no points, refills, stamps, sounds of the shot or self-best registration again.
    const meta = readResultMeta(keptEnded.runId);
    const kept = isExpandedRunState(keptEnded) ? keptEnded.expansion.rewards?.lastShot ?? null : null;
    const lastShot: LastShotInput | null = kept ? { shotNumber: kept.shotNumber, effects: kept.effects, deferredTransforms: kept.deferredTransforms, ammoAfter: kept.ammoAfter, rewards: kept.rewards } : null;
    shownEnded = keptEnded;
    showResult(finalResult(keptEnded), meta ? meta.selfBestBefore : profile.load().bestScore, meta?.newBest ?? false, lastShot, true);
  } else showHome();

  // Begin downloading the heavy chunks in the background; a failure surfaces on start.
  void loadHeavyModules().catch(() => {
    heavyModules = null;
  });

  if (e2e) {
    const probe: E2eProbe = {
      screen: () => screen,
      phase: () => controller?.current.phase ?? null,
      prizeCount: () => controller?.current.shelf.prizes.length ?? 0,
      ammo: () => controller?.current.ammo ?? 0,
      score: () => controller?.current.score ?? 0,
      playerName: () => controller?.current.playerName ?? null,
      reticle: () => {
        const r = renderer?.lastReticle();
        return r ? { x: r.point.x, y: r.point.y, z: r.point.z } : null;
      },
      stats: () => {
        const s = renderer?.stats();
        return s ? { triangles: s.triangles, meshes: s.meshes, drawCalls: s.drawCalls } : null;
      },
    };
    (win as unknown as { __shatekki: E2eProbe }).__shatekki = probe;
  }

  return {
    root,
    currentPauseReasons: () => reasons,
    dispose() {
      disposed = true;
      atomic?.repo?.close();
      win.cancelAnimationFrame(raf);
      win.removeEventListener('resize', onResize);
      win.removeEventListener('orientationchange', onResize);
      win.removeEventListener('storage', onStorage);
      win.removeEventListener('online', retryRanking);
      doc.removeEventListener('visibilitychange', updateEnv);
      unsubLocale();
      audio.silence();
      root.removeEventListener('pointerdown', unlockAudio, { capture: true });
      root.removeEventListener('keydown', unlockAudio, { capture: true });
      clearScreen();
      bookHandle?.dispose();
      rewardMotions?.destroy();
      rewardPanel?.destroy();
      effectResults?.destroy();
      questionPanel?.destroy();
      boothMap?.destroy();
      talkPanel?.destroy();
      speechBubble?.destroy();
      afCard?.destroy();
      panel?.dispose();
      renderer?.dispose();
      world?.dispose();
      root.innerHTML = '';
    },
  };
}
