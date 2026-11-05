/**
 * Integration wiring (owner: Opus).
 *
 * Boot screen → (start) → physics world + renderer + controller + controls.
 * Page-environment pauses (hidden / landscape) go to the controller. The
 * common home/result screens come in Task 14; this is the playable prototype.
 */
import './app.css';
import { environmentPauseReasons, type EnvironmentSnapshot } from './environment';
import { BOOTH_LAYOUT, mintId, type PauseReason, type RunState, type RuntimeCatalog, type TuningConfig } from './contracts';
import { GameController, type ControllerSnapshot } from './app/controller';
import { CORE_RULES } from './app/rules';
import { PROTOTYPE_TUNING } from './catalog/config';
import { PROTOTYPE_CATALOG } from './catalog/runtime-config';
import type { ThreeRenderer } from './view';
import { mountControls, type PanelHandle } from './ui/controls/panel';
import { controlsModel } from './ui/controls/model';
import { t } from './ui/controls/strings';

export interface AppHandle {
  readonly root: HTMLElement;
  currentPauseReasons(): readonly PauseReason[];
  dispose(): void;
}

/** Read-only probe for browser automation (only with ?e2e=1). Exposes no way to change the game. */
export interface E2eProbe {
  phase(): string | null;
  prizeCount(): number;
  ammo(): number;
  score(): number;
  reticle(): { x: number; y: number; z: number } | null;
  stats(): { triangles: number; meshes: number; drawCalls: number } | null;
}

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
  const e2e = new URLSearchParams(win.location.search).has('e2e');
  root.innerHTML = '';

  const canvas = doc.createElement('canvas');
  canvas.className = 'stage';
  canvas.dataset.testid = 'stage';
  const ui = doc.createElement('div');
  ui.className = 'ui-layer';

  const boot = doc.createElement('main');
  boot.className = 'boot';
  boot.dataset.testid = 'boot';
  const title = doc.createElement('h1');
  title.textContent = '屋台の射的ゲーム';
  const note = doc.createElement('p');
  note.textContent = '開発中の試作です（公開タイトル未確定）。';
  const start = doc.createElement('button');
  start.type = 'button';
  start.className = 'btn btn-primary boot-start';
  start.dataset.testid = 'btn-start';
  start.textContent = 'はじめる';
  const status = doc.createElement('p');
  status.className = 'boot-status';
  status.dataset.testid = 'boot-status';
  boot.append(title, note, start, status);

  const rotate = doc.createElement('div');
  rotate.className = 'rotate-overlay';
  rotate.dataset.testid = 'rotate-overlay';
  rotate.setAttribute('role', 'alert');
  rotate.hidden = true;
  rotate.textContent = t('rotate');

  root.append(canvas, ui, boot, rotate);

  let reasons: PauseReason[] = [];
  let controller: GameController | null = null;
  let renderer: ThreeRenderer | null = null;
  let panel: PanelHandle | null = null;
  let raf = 0;
  let lastTs = 0;
  let disposed = false;
  let worldDispose: (() => void) | null = null;

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

  const onChange = (snap: ControllerSnapshot) => {
    panel?.update(controlsModel(snap.state, snap.view, tuning.maxBonusAmmoTotal, snap.lastSummary));
    root.dataset.phase = snap.state.phase;
  };

  const loop = (ts: number) => {
    if (disposed) return;
    const dt = lastTs ? (ts - lastTs) / 1000 : 0;
    lastTs = ts;
    controller?.frame(dt);
    raf = win.requestAnimationFrame(loop);
  };

  const beginRun = (): RunState =>
    CORE_RULES.createRun({ runId: mintId.run(newRunId(win)), seed: newSeed(win), tuning, playerName: null }, catalog);

  const startGame = async () => {
    start.disabled = true;
    status.textContent = '準備中…';
    try {
      const { sim, view } = await loadHeavyModules();
      const world = await sim.createShotWorld(BOOTH_LAYOUT, catalog, tuning);
      worldDispose = () => world.dispose();
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
        status.textContent = '3D表示を開始できませんでした。お使いのブラウザでは表示できない可能性があります。';
      }
      const makeController = () =>
        new GameController({ rules: CORE_RULES, world, renderer, catalog, tuning, layout: BOOTH_LAYOUT, onChange }, beginRun());
      controller = makeController();
      panel = mountControls(ui, {
        dispatch: (cmd) => controller?.dispatch(cmd) ?? false,
        currentAim: () => controller?.current.aim ?? { yaw: 0, pitch: 0 },
        currentStandX: () => controller?.current.standX ?? 0,
        onRetry: () => {
          controller = makeController();
          controller.setEnvironmentPause(reasons);
          onChange(controller.snapshot());
        },
      });
      controller.setEnvironmentPause(reasons);
      onChange(controller.snapshot());
      boot.hidden = true;
      root.dataset.started = 'true';
      lastTs = 0;
      raf = win.requestAnimationFrame(loop);
    } catch (err) {
      console.error('start failed', err);
      status.textContent = '開始できませんでした。ページを再読み込みしてください。';
      start.disabled = false;
    }
  };
  start.addEventListener('click', () => void startGame());
  // Begin downloading the heavy chunks in the background; a failure surfaces on start.
  void loadHeavyModules().catch(() => {
    heavyModules = null;
  });

  if (e2e) {
    const probe: E2eProbe = {
      phase: () => controller?.current.phase ?? null,
      prizeCount: () => controller?.current.shelf.prizes.length ?? 0,
      ammo: () => controller?.current.ammo ?? 0,
      score: () => controller?.current.score ?? 0,
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
      doc.removeEventListener('visibilitychange', updateEnv);
      panel?.dispose();
      renderer?.dispose();
      worldDispose?.();
      root.innerHTML = '';
    },
  };
}
