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
  BOOTH_LAYOUT,
  catalogValueStatus,
  mintId,
  type FinalResult,
  type KeyValueStorage,
  type PauseReason,
  type RunState,
  type RuntimeCatalog,
  type ShotWorld,
  type TuningConfig,
} from './contracts';
import { GameController, type ControllerSnapshot } from './app/controller';
import { CORE_RULES } from './app/rules';
import { PROTOTYPE_TUNING } from './catalog/config';
import { PROTOTYPE_CATALOG } from './catalog/runtime-config';
import type { ThreeRenderer } from './view';
import { mountControls, type PanelHandle } from './ui/controls/panel';
import { controlsModel } from './ui/controls/model';
import { setControlsLocale, t } from './ui/controls/strings';
import {
  createPlayerNameStore,
  createProfileStore,
  createRunStore,
  createSettingsStore,
  STORAGE_KEYS,
  type RestoreResult,
  type RunStore,
} from './persistence';
import { finalResult } from './core/result';
import { createI18n, LANGUAGE_STORAGE_KEY, type I18n } from './i18n';
import { mountHome } from './ui/home';
import { mountResult } from './ui/result';
import { mountSetBook, setBookEntriesFromCatalog } from './ui/set-book';
import type { ScreenHandle } from './ui/dom';
import { createRankingService } from './ranking/client';
import { publicLinks } from './ranking/config';
import { normalizePlayerName } from './ranking/name';

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
function restoreNotice(r: RestoreResult): string {
  switch (r.kind) {
    case 'abandoned':
      return '前回は撃っている途中で中断されたため、そのプレイは記録されません。';
    case 'ended':
      return '前回のプレイは終わっています。';
    case 'quarantined':
      return '保存データを読めなかったため、新しく始めます（データは別の場所に残しています）。';
    case 'resume':
    case 'none':
      return '';
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

export function createApp(root: HTMLElement, win: Window): AppHandle {
  const doc = win.document;
  const catalog: RuntimeCatalog = PROTOTYPE_CATALOG;
  const tuning: TuningConfig = PROTOTYPE_TUNING;
  const isPrototype = catalogValueStatus(catalog) !== 'approved' || tuning.valueStatus !== 'approved';
  const e2e = new URLSearchParams(win.location.search).has('e2e');
  root.innerHTML = '';

  // ------------------------------------------------------------ stores
  const storage = browserStorage(win);
  const runStore: RunStore = createRunStore(storage, newRunId(win), { catalog, tuning, layout: BOOTH_LAYOUT });
  const profile = createProfileStore(storage);
  const settingsStore = createSettingsStore(storage);
  const nameStore = createPlayerNameStore(storage);
  const ranking = createRankingService({ storage });
  const links = publicLinks();
  let restore: RestoreResult = runStore.load();
  const bootNotice = restoreNotice(restore);
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
  resumeTitle.textContent = '前回のプレイの続きがあります';
  const resumeBtn = doc.createElement('button');
  resumeBtn.type = 'button';
  resumeBtn.className = 'btn btn-primary boot-start';
  resumeBtn.dataset.testid = 'btn-resume-run';
  resumeBtn.textContent = '続きから';
  const newBtn = doc.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn boot-start';
  newBtn.dataset.testid = 'btn-new-run';
  newBtn.textContent = 'はじめから（ホームへ）';
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
  stale.textContent = 'このプレイは別のタブで続いています。このタブでは操作できません。';

  root.append(canvas, ui, screens, overlay, resumeBox, notice, rotate, stale);

  // ------------------------------------------------------------ state
  let screen: Screen = 'home';
  let reasons: PauseReason[] = [];
  let controller: GameController | null = null;
  let renderer: ThreeRenderer | null = null;
  let world: ShotWorld | null = null;
  let panel: PanelHandle | null = null;
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
  const retryRanking = () => void ranking.retryPending().catch(() => undefined);
  retryRanking();
  win.addEventListener('online', retryRanking);

  // ------------------------------------------------------------ game
  const onChange = (snap: ControllerSnapshot) => {
    panel?.update(controlsModel(snap.state, snap.view, tuning.maxBonusAmmoTotal, snap.lastSummary));
    root.dataset.phase = snap.state.phase;
  };

  const loop = (ts: number) => {
    if (disposed) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    if (screen === 'game') controller?.frame(dt);
    raf = win.requestAnimationFrame(loop);
  };

  const mountPanel = () => {
    panel?.dispose();
    panel = mountControls(ui, {
      dispatch: (cmd) => (markStale() ? false : (controller?.dispatch(cmd) ?? false)),
      currentAim: () => controller?.current.aim ?? { yaw: 0, pitch: 0 },
      currentStandX: () => controller?.current.standX ?? 0,
      onRetry: () => void startRun({ name: runName }),
    });
    if (controller) onChange(controller.snapshot());
  };

  const ensureEngine = async (): Promise<ShotWorld> => {
    if (world) return world;
    const { sim, view } = await loadHeavyModules();
    const w = await sim.createShotWorld(BOOTH_LAYOUT, catalog, tuning);
    world = w;
    try {
      renderer = view.createThreeRenderer(canvas, {
        layout: BOOTH_LAYOUT,
        corkRadius: tuning.cork.radius,
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
      notice.textContent = '3D表示を開始できませんでした。お使いのブラウザでは表示できない可能性があります。';
      notice.hidden = false;
    }
    return w;
  };

  const onRunEnded = (state: RunState) => {
    const result = finalResult(state);
    const selfBestBefore = profile.load().bestScore;
    profile.recordRunEnd(result);
    const fireSaveFailed = runStore.status().fireSaveFailed;
    runStore.clear();
    // A run whose pre-shot save failed cannot prove a lost shot on reload: never submit it (persistence-design §5).
    if (!fireSaveFailed) void ranking.submit(result).catch(() => undefined);
    // Let the last settle presentation play briefly before the result screen.
    win.setTimeout(() => {
      if (disposed || controller?.current.runId !== state.runId) return;
      showResult(result, selfBestBefore);
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
        layout: BOOTH_LAYOUT,
        onChange,
        // Checkpoints (persistence-design.md §2): before the sim runs, after STOP_LOAD, after settlement.
        onShotFired: (s) => {
          runStore.saveAfterFire(s);
          markStale();
        },
        onCommandApplied: (cmd, s) => {
          if (cmd.type === 'STOP_LOAD') runStore.saveStable(s);
        },
        onShotSettled: (summary, s) => {
          if (summary.newlyCompletedSets.length > 0) profile.discoverSets(summary.newlyCompletedSets);
          if (s.phase === 'ended') onRunEnded(s);
          else runStore.saveStable(s);
        },
      },
      initial,
    );

  /** Start a new run with the name fixed now (null = anonymous), or continue a saved one. */
  const startRun = async (opts: { name: string | null; resume?: RunState }): Promise<void> => {
    if (starting) return;
    starting = true;
    status.textContent = '準備中…';
    try {
      const w = await ensureEngine();
      clearScreen();
      let initial: RunState;
      if (opts.resume) {
        initial = opts.resume;
        runName = initial.playerName;
      } else {
        runName = opts.name;
        initial = CORE_RULES.createRun({ runId: mintId.run(newRunId(win)), seed: newSeed(win), tuning, playerName: runName }, catalog);
        runStore.saveStable(initial);
      }
      ranking.beginRun({ runId: initial.runId, playerName: runName });
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
      notice.textContent = '開始できませんでした。ページを再読み込みしてください。';
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
      },
      {
        sets: setBookEntriesFromCatalog(catalog),
        discovered: profile.load().discoveredSets,
        completedThisRun: last && screen === 'result' ? last.completedSets : [],
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
        onStart: (name) => void startRun({ name: normalizePlayerName(name) }),
        onNameChange: (draft) => {
          nameStore.set(draft);
        },
        onAudioChange: (audio) => {
          settingsStore.save({ audio });
        },
        onOpenSetBook: openSetBook,
      },
      { nameDraft: nameStore.get() ?? '', selfBest: profile.load().bestScore, audio: settings.audio, prototype: isPrototype },
    );
  };

  const showResult = (result: FinalResult, selfBestBefore: number | null) => {
    clearScreen();
    setScreen('result');
    const handle = mountResult(
      screens,
      {
        i18n,
        onRetry: () => void startRun({ name: runName }),
        onHome: showHome,
        onRetrySubmit: () => void ranking.retryPending({ includePermanent: false }).catch(() => undefined),
        onRetryTop: () => void ranking.fetchTop().catch(() => undefined),
        onOpenSetBook: openSetBook,
      },
      { result, selfBestBefore, submit: ranking.getStatus(result.runId), top: ranking.getTop(), links },
    );
    screenHandle = handle;
    rankingUnsub = ranking.subscribe(() => handle.update({ submit: ranking.getStatus(result.runId), top: ranking.getTop() }));
    void ranking.fetchTop().catch(() => undefined);
  };

  // Language changes re-render text only: ids, scoring and the current run are untouched.
  const unsubLocale = i18n.subscribe((locale) => {
    setControlsLocale(locale);
    rotate.textContent = t('rotate');
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
      clearScreen();
      bookHandle?.dispose();
      panel?.dispose();
      renderer?.dispose();
      world?.dispose();
      root.innerHTML = '';
    },
  };
}
