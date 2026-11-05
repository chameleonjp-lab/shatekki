/**
 * Integration wiring (owner: Opus). P0 shows the boot screen and the
 * page-environment overlay only; later tasks plug the game, view and UI here.
 */
import './app.css';
import { environmentPauseReasons, type EnvironmentSnapshot } from './environment';
import type { PauseReason } from './contracts';

export interface AppHandle {
  readonly root: HTMLElement;
  currentPauseReasons(): readonly PauseReason[];
  dispose(): void;
}

function snapshot(win: Window): EnvironmentSnapshot {
  return { hidden: win.document.visibilityState === 'hidden', width: win.innerWidth, height: win.innerHeight };
}

export function createApp(root: HTMLElement, win: Window): AppHandle {
  const doc = win.document;
  root.innerHTML = '';

  const boot = doc.createElement('main');
  boot.className = 'boot';
  boot.dataset.testid = 'boot';
  const title = doc.createElement('h1');
  title.textContent = '屋台の射的ゲーム';
  const note = doc.createElement('p');
  note.textContent = '開発中の試作です（公開タイトル未確定）。';
  boot.append(title, note);

  const rotate = doc.createElement('div');
  rotate.className = 'rotate-overlay';
  rotate.dataset.testid = 'rotate-overlay';
  rotate.setAttribute('role', 'alert');
  rotate.hidden = true;
  rotate.textContent = '縦向きに戻してください';

  root.append(boot, rotate);

  let reasons: PauseReason[] = [];
  const update = () => {
    reasons = environmentPauseReasons(snapshot(win));
    rotate.hidden = !reasons.includes('landscape');
    root.dataset.pause = reasons.join(' ');
  };
  update();
  win.addEventListener('resize', update);
  win.addEventListener('orientationchange', update);
  doc.addEventListener('visibilitychange', update);

  return {
    root,
    currentPauseReasons: () => reasons,
    dispose() {
      win.removeEventListener('resize', update);
      win.removeEventListener('orientationchange', update);
      doc.removeEventListener('visibilitychange', update);
      root.innerHTML = '';
    },
  };
}
