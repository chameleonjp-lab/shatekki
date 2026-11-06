/**
 * Minimal DOM controls (Task 07). The panel sits at the bottom so fingers do
 * not cover the shelves. "込める" (pointerdown, timing) and "撃つ" (separate
 * button, fires on release only if the press began on it while aiming) are
 * different elements in different places, so a finger left on the load button
 * cannot fire (AC04).
 */
import type { AimAngles } from '../../contracts';
import type { ControlsModel } from './model';
import { t } from './strings';
import { HOLD_DELAY_MS, WIDE_STAND_SPEED, nextStandX, type StandRange } from './stand';
import './controls.css';

export interface PanelDeps {
  dispatch(command: unknown): boolean;
  /** The requested aim currently held by the rules (to continue relative drags). */
  currentAim(): AimAngles;
  /** Stand position currently held by the rules. */
  currentStandX(): number;
  /** "もう一回" after the run ended. */
  onRetry(): void;
  /** Wide stall (layout v2): column steps, hold-to-glide and a slider. Absent = rules-v1 controls, unchanged. */
  stand?: StandRange;
}

export interface PanelHandle {
  update(model: ControlsModel): void;
  dispose(): void;
}

/** Radians of aim per CSS pixel of drag (prototype, O09). */
export const AIM_SENSITIVITY = 0.0022;
/** Stand movement per second while ◀/▶ is held (prototype). */
export const STAND_SPEED = 0.5;

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountControls(root: HTMLElement, deps: PanelDeps): PanelHandle {
  const doc = root.ownerDocument;
  const hud = el(doc, 'div', 'hud');
  hud.dataset.testid = 'hud';
  const ammo = el(doc, 'span', 'hud-ammo');
  ammo.dataset.testid = 'hud-ammo';
  const bonus = el(doc, 'span', 'hud-bonus');
  const score = el(doc, 'span', 'hud-score');
  score.dataset.testid = 'hud-score';
  const pauseBtn = el(doc, 'button', 'hud-pause', t('btn.pause'));
  pauseBtn.type = 'button';
  pauseBtn.dataset.testid = 'btn-pause';
  hud.append(ammo, bonus, score, pauseBtn);

  const proto = el(doc, 'div', 'proto-badge', t('prototype'));
  proto.dataset.testid = 'prototype-badge';

  const panel = el(doc, 'div', 'controls');
  panel.dataset.testid = 'controls';
  const hint = el(doc, 'p', 'controls-hint');
  hint.dataset.testid = 'hint';
  const lastShot = el(doc, 'p', 'controls-last');
  lastShot.dataset.testid = 'last-shot';

  // position
  const posRow = el(doc, 'div', 'row row-position');
  const left = el(doc, 'button', 'btn btn-side', t('btn.left'));
  left.setAttribute('aria-label', t('aria.leftPos'));
  left.dataset.testid = 'btn-left';
  const confirm = el(doc, 'button', 'btn btn-primary', t('btn.confirmPosition'));
  confirm.dataset.testid = 'btn-confirm-position';
  const right = el(doc, 'button', 'btn btn-side', t('btn.right'));
  right.setAttribute('aria-label', t('aria.rightPos'));
  right.dataset.testid = 'btn-right';
  posRow.append(left, confirm, right);
  let slider: HTMLInputElement | null = null;
  if (deps.stand) {
    slider = doc.createElement('input');
    slider.type = 'range';
    slider.className = 'stand-slider';
    slider.min = String(deps.stand.min);
    slider.max = String(deps.stand.max);
    slider.step = '0.01';
    slider.value = String(deps.currentStandX());
    slider.setAttribute('aria-label', t('aria.leftPos') + ' / ' + t('aria.rightPos'));
    slider.dataset.testid = 'stand-slider';
    posRow.classList.add('row-position-wide');
    posRow.prepend(slider);
  }

  // loading
  const loadRow = el(doc, 'div', 'row row-loading');
  const meter = el(doc, 'div', 'load-meter');
  meter.dataset.testid = 'load-meter';
  const sweet = el(doc, 'div', 'load-sweet');
  const marker = el(doc, 'div', 'load-marker');
  meter.append(sweet, marker);
  const loadBtn = el(doc, 'button', 'btn btn-primary btn-load', t('btn.load'));
  loadBtn.dataset.testid = 'btn-load';
  loadRow.append(meter, loadBtn);

  // aiming
  const aimRow = el(doc, 'div', 'row row-aiming');
  const pad = el(doc, 'div', 'aim-pad');
  pad.setAttribute('role', 'application');
  pad.setAttribute('aria-label', t('aria.aimPad'));
  pad.dataset.testid = 'aim-pad';
  const loadLabel = el(doc, 'span', 'load-label');
  loadLabel.dataset.testid = 'load-label';
  pad.append(loadLabel);
  const fireBtn = el(doc, 'button', 'btn btn-fire', t('btn.fire'));
  fireBtn.dataset.testid = 'btn-fire';
  aimRow.append(pad, fireBtn);

  // resolving / paused / ended
  const skipBtn = el(doc, 'button', 'btn btn-quiet', t('btn.skip'));
  skipBtn.dataset.testid = 'btn-skip';
  const resumeBtn = el(doc, 'button', 'btn btn-primary', t('btn.resume'));
  resumeBtn.dataset.testid = 'btn-resume';
  const retryBtn = el(doc, 'button', 'btn btn-primary', t('btn.retry'));
  retryBtn.dataset.testid = 'btn-retry';

  for (const b of [left, confirm, right, loadBtn, fireBtn, skipBtn, resumeBtn, retryBtn]) b.type = 'button';

  panel.append(hint, lastShot, posRow, loadRow, aimRow, skipBtn, resumeBtn, retryBtn);
  hud.append(proto); // inside the HUD so a wrapped HUD never overlaps it
  root.append(hud, panel);

  // ------------------------------------------------------------ behaviour
  let mode: ControlsModel['mode'] = 'position';
  const listeners: Array<() => void> = [];
  const on = <T extends Event>(target: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
    const h = fn as EventListener;
    target.addEventListener(type, h, opts);
    listeners.push(() => target.removeEventListener(type, h, opts));
  };

  // Hold-to-move stand buttons.
  let holdDir = 0;
  let raf = 0;
  let lastTs = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  const speed = deps.stand ? WIDE_STAND_SPEED : STAND_SPEED;
  const tick = (ts: number) => {
    if (holdDir === 0) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dt > 0) deps.dispatch({ type: 'SET_POSITION', x: deps.currentStandX() + holdDir * speed * dt });
    raf = requestAnimationFrame(tick);
  };
  const startHold = (dir: -1 | 1) => (e: PointerEvent) => {
    e.preventDefault();
    if (mode !== 'position') return;
    holdDir = dir;
    lastTs = 0;
    if (deps.stand) {
      // wide stall: a tap steps one column; holding longer glides continuously
      deps.dispatch({ type: 'SET_POSITION', x: nextStandX(deps.currentStandX(), dir, deps.stand) });
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (holdDir === dir && mode === 'position') raf = requestAnimationFrame(tick);
      }, HOLD_DELAY_MS);
      return;
    }
    deps.dispatch({ type: 'SET_POSITION', x: deps.currentStandX() + dir * 0.02 });
    raf = requestAnimationFrame(tick);
  };
  const endHold = () => {
    holdDir = 0;
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    cancelAnimationFrame(raf);
  };
  if (slider) {
    on(slider, 'input', () => {
      if (mode === 'position') deps.dispatch({ type: 'SET_POSITION', x: Number(slider!.value) });
    });
  }
  on(left, 'pointerdown', startHold(-1));
  on(right, 'pointerdown', startHold(1));
  for (const b of [left, right]) {
    on(b, 'pointerup', endHold);
    on(b, 'pointercancel', endHold);
    on(b, 'pointerleave', endHold);
  }
  on(confirm, 'click', () => deps.dispatch({ type: 'CONFIRM_POSITION' }));

  // Load: timing matters, so act on press.
  on(loadBtn, 'pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    if (mode === 'loading') deps.dispatch({ type: 'STOP_LOAD' });
  });

  // Aim pad: relative drag.
  let dragId: number | null = null;
  let lastX = 0;
  let lastY = 0;
  on(pad, 'pointerdown', (e: PointerEvent) => {
    if (mode !== 'aiming') return;
    e.preventDefault();
    dragId = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    pad.setPointerCapture?.(e.pointerId);
  });
  on(pad, 'pointermove', (e: PointerEvent) => {
    if (dragId !== e.pointerId || mode !== 'aiming') return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const a = deps.currentAim();
    deps.dispatch({ type: 'AIM', yaw: a.yaw + dx * AIM_SENSITIVITY, pitch: a.pitch - dy * AIM_SENSITIVITY });
  });
  const endDrag = (e: PointerEvent) => {
    if (dragId === e.pointerId) dragId = null;
  };
  on(pad, 'pointerup', endDrag);
  on(pad, 'pointercancel', endDrag);

  // Fire: only a press that started on this button while aiming counts.
  let firePressArmed = false;
  on(fireBtn, 'pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    firePressArmed = mode === 'aiming';
  });
  on(fireBtn, 'pointerup', () => {
    if (firePressArmed && mode === 'aiming') deps.dispatch({ type: 'FIRE' });
    firePressArmed = false;
  });
  on(fireBtn, 'pointercancel', () => {
    firePressArmed = false;
  });
  // Keyboard / accessibility path (click without pointer events).
  on(fireBtn, 'click', (e: MouseEvent) => {
    if (e.detail === 0 && mode === 'aiming') deps.dispatch({ type: 'FIRE' });
  });
  on(loadBtn, 'click', (e: MouseEvent) => {
    if (e.detail === 0 && mode === 'loading') deps.dispatch({ type: 'STOP_LOAD' });
  });

  on(skipBtn, 'click', () => deps.dispatch({ type: 'SKIP_PRESENTATION' }));
  on(resumeBtn, 'click', () => deps.dispatch({ type: 'RESUME', reason: 'manual' }));
  on(pauseBtn, 'click', () => deps.dispatch({ type: 'PAUSE', reason: 'manual' }));

  // Stop page scroll / double-tap zoom on the game panel.
  on(panel, 'touchmove', (e: TouchEvent) => e.preventDefault(), { passive: false });

  on(retryBtn, 'click', () => deps.onRetry());

  const show = (node: HTMLElement, visible: boolean) => {
    node.hidden = !visible;
  };

  return {
    update(m) {
      if (m.mode !== mode) {
        // Leaving aiming disarms a half-pressed fire; leaving position stops holds.
        firePressArmed = false;
        endHold();
        dragId = null;
      }
      mode = m.mode;
      panel.dataset.mode = m.mode;
      hint.textContent = t(m.hintKey);
      ammo.textContent = `${t('hud.ammo')} ${m.ammo}`;
      bonus.textContent = `${t('hud.bonus')} ${m.bonusAmmoTotal}/${m.maxBonusAmmo}`;
      score.textContent = `${m.score} ${t('hud.score')}`;
      lastShot.textContent = m.lastShotPoints === null ? '' : `+${m.lastShotPoints}${t('hud.score')}`;
      show(posRow, m.mode === 'position');
      if (slider && m.mode === 'position' && doc.activeElement !== slider) slider.value = String(deps.currentStandX());
      show(loadRow, m.mode === 'loading');
      show(aimRow, m.mode === 'aiming');
      show(skipBtn, m.mode === 'resolving');
      show(resumeBtn, m.mode === 'paused');
      show(retryBtn, m.mode === 'ended' || m.mode === 'abandoned');
      show(pauseBtn, m.mode !== 'paused' && m.mode !== 'ended' && m.mode !== 'abandoned');
      fireBtn.disabled = !m.canFire;
      if (m.loadingBar !== null) marker.style.left = `${(m.loadingBar * 100).toFixed(1)}%`;
      loadLabel.textContent = m.loadTier ? t(`load.${m.loadTier}`) : '';
    },
    dispose() {
      endHold();
      for (const off of listeners) off();
      hud.remove();
      panel.remove();
    },
  };
}
