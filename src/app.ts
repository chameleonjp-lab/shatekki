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
  mintId,
  type FinalResult,
  type GameplayBundle,
  type KeyValueStorage,
  type PauseReason,
  type RunState,
  type RuntimeCatalog,
  type ShotSummary,
  type ShotWorld,
  type TuningConfig,
} from './contracts';
import { GameController, type ControllerSnapshot } from './app/controller';
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
  type RestoreResult,
  type RunStore,
} from './persistence';
import { finalResult } from './core/result';
import { createI18n, LANGUAGE_STORAGE_KEY, type I18n, type UiKey } from './i18n';
import { JA as UI_KEYS } from './i18n/locales/ja';
import { mountHome } from './ui/home';
import { mountResult, type LastShotInput, type ResultTextOptions } from './ui/result';
import { mountSetBook, setBookEntriesFromCatalog } from './ui/set-book';
import type { ScreenHandle } from './ui/dom';
import { createRankingService } from './ranking/client';
import { publicLinks, RANKING_CONFIG } from './ranking/config';
import { normalizePlayerName } from './ranking/name';
import { createAudioEngine, effectCueFor } from './audio';
import type { AudioSettings, GameCommand, UiCue } from './contracts';

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
  const e2e = new URLSearchParams(win.location.search).has('e2e');
  root.innerHTML = '';

  // ------------------------------------------------------------ stores
  const storage = browserStorage(win);
  // Expanded rules write their own keys (EG06); rules-v1 keys and records are never touched by them.
  const runStore: RunStore = expansion
    ? createRunStore(storage, newRunId(win), { catalog, tuning, layout, expansion, key: expandedRunKey(catalog.rulesVersion) })
    : createRunStore(storage, newRunId(win), { catalog, tuning, layout });
  const profile = expansion ? createVersionedProfileStore(storage, { rulesVersion: catalog.rulesVersion }) : createProfileStore(storage);
  const settingsStore = createSettingsStore(storage);
  const nameStore = createPlayerNameStore(storage);
  const ranking = createRankingService({ storage });
  const links = publicLinks();
  // The expanded prototype is never ranked (prototype values, internal builds only).
  const rankingAvailable = RANKING_CONFIG.gameSlug !== null && expansion === null;
  let restore: RestoreResult = runStore.load();
  // An abandoned or finished run is shown once and never resumed or ranked from here (decision 27).
  if (restore.kind === 'abandoned' || restore.kind === 'ended') runStore.clear();

  // The settings store is the single saved source of the language (saved → browser → English).
  const languageStorage: KeyValueStorage = {
    getItem: (k) => (k === LANGUAGE_STORAGE_KEY ? settingsStore.load().language : null),
    setItem: (k, v) => {
      if (k === LANGUAGE_STORAGE_KEY) settingsStore.save({ language: v });
    },
    removeItem: () => undefined,
  };
  const i18n: I18n = createI18n(languageStorage, win.navigator.languages ?? [win.navigator.language]);
  setControlsLocale(i18n.locale);
  let noticeKey = restoreNoticeKey(restore);
  const bootNotice = noticeKey ? i18n.t(noticeKey) : '';

  // Sound: first run ON with volume > 0; saved off / 0 respected (settings store). The context is
  // created/resumed from a user gesture; failures never stop the game.
  const audio = createAudioEngine();
  let audioSettings: AudioSettings = settingsStore.load().audio;
  const cue = (c: UiCue['cue'], extra: Partial<Pick<UiCue, 'tier' | 'count'>> = {}) =>
    audio.handle({ type: 'ui', cue: c, ...extra } as UiCue, audioSettings);
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
  resumeBox.append(resumeTitle, resumeBtn, newBtn, status);
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
  let mapUpdatedAt = -Infinity;
  let shownQuestion = '';
  let screenHandle: ScreenHandle<never> | null = null;
  let bookHandle: ScreenHandle<never> | null = null;
  let rankingUnsub: (() => void) | null = null;
  let runName: string | null = null;
  let raf = 0;
  let lastTs = 0;
  let disposed = false;
  let starting = false;

  const setScreen = (s: Screen) => {
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
    reasons = environmentPauseReasons(snapshot(win));
    rotate.hidden = !reasons.includes('landscape');
    root.dataset.pause = reasons.join(' ');
    if (reasons.length > 0) audio.silence(); // nothing piles up while hidden / rotated (AC36)
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
  const onChange = (snap: ControllerSnapshot) => {
    panel?.update(controlsModel(snap.state, snap.view, tuning.maxBonusAmmoTotal, snap.lastSummary));
    root.dataset.phase = snap.state.phase;
    if (expansion) updateExpandedUi(snap);
  };

  // Text for the expanded view and panel: UI keys through i18n, exp.* content keys through the content resolvers.
  const uiText = (k: string, p?: Readonly<Record<string, string | number>>) => (k in UI_KEYS ? i18n.t(k as UiKey, p) : k);
  const expText = expandedUi ? expandedUi.createExpansionTranslator(() => i18n.locale, uiText) : uiText;

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
      questionPanel.setPaused(snap.view.paused);
    }
    // The overview is display only; a few updates per second are enough on a phone.
    const now = win.performance.now();
    if (boothMap && (now - mapUpdatedAt > 150 || snap.state.phase !== 'resolving')) {
      mapUpdatedAt = now;
      boothMap.update({
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
    if (screen === 'game') controller?.frame(dt);
    raf = win.requestAnimationFrame(loop);
  };

  const playCommandCue = (cmd: GameCommand) => {
    const s = controller?.current;
    switch (cmd.type) {
      case 'CONFIRM_POSITION':
        return cue('loadStart');
      case 'STOP_LOAD':
        return cue('loadStop', s?.load ? { tier: s.load.tier } : {});
      case 'FIRE':
        return cue('fire');
      case 'PAUSE':
        audio.silence();
        return cue('cancel');
      case 'RESUME':
        return cue('confirm');
      default:
        return undefined;
    }
  };

  const mountPanel = () => {
    panel?.dispose();
    panel = mountControls(ui, {
      dispatch: (cmd) => {
        if (markStale() || !controller) return false;
        const ok = controller.dispatch(cmd);
        if (ok) playCommandCue(cmd as GameCommand);
        return ok;
      },
      currentAim: () => controller?.current.aim ?? { yaw: 0, pitch: 0 },
      currentStandX: () => controller?.current.standX ?? 0,
      onRetry: () => void startRun({ name: runName }),
      ...(expansion ? { stand: standRangeOf(layout) } : {}),
    });
    questionPanel?.destroy();
    questionPanel = null;
    boothMap?.destroy();
    boothMap = null;
    effectResults?.destroy();
    effectResults = null;
    if (expansion && expandedUi) {
      boothMap = expandedUi.mountBoothMap(ui, {
        layout,
        t: expText,
        onJump: (x) => {
          if (markStale() || !controller) return;
          if (controller.dispatch({ type: 'SET_POSITION', x })) cue('select');
        },
      });
      // Mounted after the controls so it sits above them; its backdrop takes the touches while shown.
      questionPanel = expandedUi.createShopkeeperQuestionPanel(ui, {
        t: expText,
        onAnswer: (cmd) => {
          if (markStale() || !controller) return false;
          const ok = controller.dispatch(cmd);
          if (ok) cue('answerAccepted');
          return ok;
        },
      });
      effectResults = expandedUi.mountEffectResults(ui, {
        t: expText,
        line: (key) => expandedUi.expandedLine(i18n.locale, key),
      });
      mapUpdatedAt = -Infinity;
    }
    if (controller) onChange(controller.snapshot());
  };

  const ensureEngine = async (): Promise<ShotWorld> => {
    if (world) return world;
    const { sim, view } = await loadHeavyModules();
    const w = await sim.createShotWorld(layout, catalog, tuning);
    world = w;
    try {
      renderer = view.createThreeRenderer(canvas, {
        layout,
        ...(expansion ? { expanded: { catalog, expansion, translate: expText, prizeName: (typeId) => prizeName(i18n.locale, typeId) } } : {}),
        corkRadius: tuning.cork.radius,
        translate: (key, params) => (key in UI_KEYS ? i18n.t(key as UiKey, params) : key),
        // Miss / near-miss are decided only after settlement (AC27).
        onSettled: (cls) => {
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
  const lastShotOf = (summary: ShotSummary | null): LastShotInput | null =>
    expansion && summary
      ? { shotNumber: summary.shotNumber, effects: summary.effects ?? [], deferredTransforms: summary.deferredTransforms ?? [], ammoAfter: summary.ammoAfter }
      : null;

  const onRunEnded = (state: RunState, summary: ShotSummary | null) => {
    const result = finalResult(state);
    const lastShot = lastShotOf(summary);
    const selfBestBefore = profile.load().bestScore;
    const { newBest } = profile.recordRunEnd(result);
    cue('runEnd');
    const fireSaveFailed = runStore.status().fireSaveFailed;
    runStore.clear();
    // A run whose pre-shot save failed cannot prove a lost shot on reload: never submit it (persistence-design §5).
    if (rankingAvailable && !fireSaveFailed) void ranking.submit(result).catch(() => undefined);
    // Let the last settle presentation play briefly before the result screen.
    win.setTimeout(() => {
      if (disposed || controller?.current.runId !== state.runId) return;
      showResult(result, selfBestBefore, newBest, lastShot);
    }, 900);
  };

  const makeController = (w: ShotWorld, initial: RunState): GameController =>
    new GameController(
      {
        rules: CORE_RULES,
        world: w,
        renderer,
        catalog,
        tuning,
        layout,
        expansion,
        onChange,
        onSimEvents: (events) => {
          for (const e of events) audio.handle(e, audioSettings);
        },
        // Checkpoints (persistence-design.md §2): before the sim runs, after STOP_LOAD, after settlement.
        onShotFired: (s) => {
          effectResults?.hide();
          runStore.saveAfterFire(s);
          markStale();
        },
        onCommandApplied: (cmd, s) => {
          if (cmd.type === 'STOP_LOAD') runStore.saveStable(s);
        },
        onShotSettled: (summary, s) => {
          effectResults?.show({ effects: summary.effects, deferredTransforms: summary.deferredTransforms });
          // One coalesced cue for what the post-flight effects did (expanded rules only).
          const effectCue = effectCueFor(summary.effects);
          if (effectCue) cue(effectCue);
          if (summary.chainCount > 0) cue('collect', { count: summary.chainCount });
          if (summary.newlyCompletedSets.length > 0) {
            cue('setComplete');
            const fresh = profile.discoverSets(summary.newlyCompletedSets);
            if (fresh.length > 0) cue('setDiscovered');
          }
          if (summary.ledger.nominalPenalty > 0) cue('penalty');
          if (summary.bonusAmmoGranted > 0) cue('ammoBonus');
          if (s.phase === 'ended') onRunEnded(s, summary);
          else runStore.saveStable(s);
        },
      },
      initial,
    );

  /** Start a new run with the name fixed now (null = anonymous), or continue a saved one. */
  const startRun = async (opts: { name: string | null; resume?: RunState }): Promise<void> => {
    if (starting) return;
    starting = true;
    status.textContent = i18n.t('app.status.preparing');
    try {
      const w = await ensureEngine();
      clearScreen();
      let initial: RunState;
      if (opts.resume) {
        initial = rankingAvailable ? opts.resume : { ...opts.resume, playerName: null };
        runName = initial.playerName;
      } else {
        runName = rankingAvailable ? opts.name : null;
        const config = { runId: mintId.run(newRunId(win)), seed: newSeed(win), tuning, playerName: runName };
        initial = expansion ? createExpandedRun(config, { catalog, tuning, layout, expansion }) : CORE_RULES.createRun(config, catalog);
        runStore.saveStable(initial);
      }
      if (rankingAvailable) ranking.beginRun({ runId: initial.runId, playerName: runName, valueStatus: initial.valueStatus });
      controller = makeController(w, initial);
      controller.setEnvironmentPause(reasons);
      setScreen('game');
      mountPanel();
      root.dataset.started = 'true';
      notice.hidden = true;
      if (!raf) {
        lastTs = 0;
        raf = win.requestAnimationFrame(loop);
      }
    } catch (err) {
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
  const openSetBook = () => {
    bookHandle?.dispose();
    const last = controller?.current;
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
        discovered: profile.load().discoveredSets,
        completedThisRun: last && screen === 'result' ? last.completedSets : [],
        prototypeHints: isPrototype,
      },
    );
  };

  const showHome = () => {
    clearScreen();
    setScreen('home');
    const settings = settingsStore.load();
    screenHandle = mountHome(
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
      { nameDraft: nameStore.get() ?? '', selfBest: profile.load().bestScore, audio: settings.audio, prototype: isPrototype, rankingAvailable },
    );
  };

  let stopCelebration: (() => void) | null = null;
  // Expanded build: pair-set names from the same source as the book, every last-shot line (no 5-line cap).
  const resultText: ResultTextOptions | undefined =
    expansion && expandedUi
      ? {
          expandedText: (k: string) => expText(k),
          describeEffects: (i) => expandedUi.effectResultsModel(i, { t: expText, line: (key) => expandedUi.expandedLine(i18n.locale, key) }, { maxLines: Infinity }),
        }
      : undefined;

  const showResult = (result: FinalResult, selfBestBefore: number | null, newBest = false, lastShot: LastShotInput | null = null) => {
    clearScreen();
    setScreen('result');
    cue('resultShow');
    if (newBest) cue('newBest');
    const handle = mountResult(
      screens,
      {
        i18n,
        onRetry: () => void startRun({ name: runName }),
        onHome: showHome,
        onRetrySubmit: () => void ranking.retryPending({ includePermanent: false }).catch(() => undefined),
        onRetryTop: () => void ranking.fetchTop().catch(() => undefined),
        onOpenSetBook: openSetBook,
        ...(resultText ? { text: resultText } : {}),
      },
      { result, selfBestBefore, submit: ranking.getStatus(result.runId), top: ranking.getTop(), links, rankingAvailable, lastShot },
    );
    screenHandle = handle;
    void loadHeavyModules().then(({ view }) => {
      if (screen !== 'result') return;
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

  resumeBtn.addEventListener('click', () => {
    if (restore.kind === 'resume') {
      const s = restore.state;
      restore = { kind: 'none' };
      void startRun({ name: s.playerName, resume: s });
    }
  });
  newBtn.addEventListener('click', () => {
    restore = { kind: 'none' };
    showHome();
  });

  if (restore.kind === 'resume') setScreen('resume');
  else showHome();

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
      panel?.dispose();
      renderer?.dispose();
      world?.dispose();
      root.innerHTML = '';
    },
  };
}
