/**
 * r007 controls (plan 工程1): aim first, then the power gauge, with one button.
 *
 *   ◀  [ 撃つ / 発射 ]  ▶      the same centre button opens the gauge and fires
 *   [   照準枠 (drag)   ]       relative drag of the aim; no sway
 *   gauge on top of the panel   zones from the rules (same numbers as the classifier)
 *
 * ◀/▶: a press shorter than holdDelayMs is one step (added only when released as a tap);
 * holding glides at holdSpeed until released, stopped at the ends. Release, cancel, a lost
 * pointer capture, window blur and hiding the page all end the hold. A second finger is
 * ignored while one gesture is held. Each finished move or drag is saved once (commitAim).
 * The gauge button acts on press; the press that opened the gauge must be released before
 * a new press can fire, and key auto-repeat never fires.
 */
import type { AimAngles, ControllerSnapshotLike, LoadTier } from './aim-first-types';
import { AIM_SENSITIVITY } from './panel';
import './controls.css';
import '../aim-first.css';

export interface AimFirstPanelDeps {
  dispatch(command: unknown): boolean | Promise<boolean>;
  /** Save the finished move/aim (r007 numbered save). */
  commitAim(): void;
  /** Drop the interrupted move/aim: back to the last position and aim whose save succeeded. */
  revertAim(): void;
  currentAim(): AimAngles;
  currentStandX(): number;
  onRetry(): void;
  onTalk(): void;
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
  readonly move: { readonly step: number; readonly holdDelayMs: number; readonly holdSpeed: number; readonly min: number; readonly max: number };
}

export interface AimFirstPanelHandle {
  cancelGestures(): void;
  update(snap: ControllerSnapshotLike, saving: boolean): void;
  dispose(): void;
}

const TIERS: readonly LoadTier[] = ['normal', 'good', 'perfect'];

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] {
  const e = doc.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function mountAimFirstControls(root: HTMLElement, deps: AimFirstPanelDeps): AimFirstPanelHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const t = deps.t;

  // ---- HUD: ammo / score / pause, and "店主と話す" under the ammo
  const hud = el(doc, 'div', 'hud af-hud');
  hud.dataset.testid = 'hud';
  const ammoBox = el(doc, 'div', 'af-ammo-box');
  const ammo = el(doc, 'span', 'hud-ammo');
  ammo.dataset.testid = 'hud-ammo';
  const nextMark = el(doc, 'span', 'af-next-mark');
  nextMark.dataset.testid = 'next-shot-mark';
  nextMark.hidden = true;
  const talkBtn = el(doc, 'button', 'af-talk-open', t('af.talk.open'));
  talkBtn.type = 'button';
  talkBtn.dataset.testid = 'btn-talk';
  ammoBox.append(ammo, nextMark, talkBtn);
  const bonus = el(doc, 'span', 'hud-bonus');
  const score = el(doc, 'span', 'hud-score');
  score.dataset.testid = 'hud-score';
  const pauseBtn = el(doc, 'button', 'hud-pause', t('btn.pause'));
  pauseBtn.type = 'button';
  pauseBtn.dataset.testid = 'btn-pause';
  const proto = el(doc, 'div', 'proto-badge', t('prototype'));
  proto.dataset.testid = 'prototype-badge';
  hud.append(ammoBox, bonus, score, pauseBtn, proto);

  // ---- panel
  const panel = el(doc, 'div', 'controls af-controls');
  panel.dataset.testid = 'controls';
  const hint = el(doc, 'p', 'controls-hint');
  hint.dataset.testid = 'hint';

  const gauge = el(doc, 'div', 'af-gauge');
  gauge.dataset.testid = 'load-meter';
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-label', t('af.aria.gauge'));
  const zoneEls = TIERS.map((tier) => {
    const z = el(doc, 'div', `af-zone af-zone-${tier}`);
    z.dataset.tier = tier;
    return z;
  });
  const marker = el(doc, 'div', 'load-marker af-marker');
  gauge.append(...zoneEls, marker);
  const gaugeLabel = el(doc, 'div', 'af-gauge-label');
  gaugeLabel.dataset.testid = 'load-label';

  const pad = el(doc, 'div', 'aim-pad af-pad');
  pad.setAttribute('role', 'application');
  pad.setAttribute('aria-label', t('aria.aimPad'));
  pad.dataset.testid = 'aim-pad';

  const row = el(doc, 'div', 'row af-row');
  const left = el(doc, 'button', 'btn btn-side af-move', '◀');
  left.type = 'button';
  left.dataset.testid = 'btn-left';
  left.setAttribute('aria-label', t('af.aria.left'));
  const shoot = el(doc, 'button', 'btn af-shoot', t('af.shoot'));
  shoot.type = 'button';
  shoot.dataset.testid = 'btn-fire';
  const right = el(doc, 'button', 'btn btn-side af-move', '▶');
  right.type = 'button';
  right.dataset.testid = 'btn-right';
  right.setAttribute('aria-label', t('af.aria.right'));
  row.append(left, shoot, right);
  const cancel = el(doc, 'button', 'btn btn-quiet af-cancel', t('af.cancel'));
  cancel.type = 'button';
  cancel.dataset.testid = 'btn-cancel-gauge';

  const skipBtn = el(doc, 'button', 'btn btn-quiet', t('btn.skip'));
  skipBtn.type = 'button';
  skipBtn.dataset.testid = 'btn-skip';
  const resumeBtn = el(doc, 'button', 'btn btn-primary', t('btn.resume'));
  resumeBtn.type = 'button';
  resumeBtn.dataset.testid = 'btn-resume';
  const retryBtn = el(doc, 'button', 'btn btn-primary', t('btn.retry'));
  retryBtn.type = 'button';
  retryBtn.dataset.testid = 'btn-retry';

  panel.append(hint, gauge, gaugeLabel, cancel, pad, row, skipBtn, resumeBtn, retryBtn);
  root.append(hud, panel);

  // ------------------------------------------------------------ behaviour
  let mode = 'aiming';
  let saving = false;
  const offs: Array<() => void> = [];
  const on = <T extends Event>(target: EventTarget, type: string, fn: (e: T) => void, opts?: AddEventListenerOptions) => {
    const h = fn as EventListener;
    target.addEventListener(type, h, opts);
    offs.push(() => target.removeEventListener(type, h, opts));
  };
  const canMove = () => mode === 'aiming' && !saving;
  /** Pointer capture keeps the release on the same element; a pointer that is already gone cannot be captured. */
  const capture = (target: HTMLElement, pointerId: number) => {
    try {
      target.setPointerCapture?.(pointerId);
    } catch {
      /* the release still arrives on the element or as pointercancel */
    }
  };

  // one gesture at a time (a second finger is ignored)
  let gesture: { kind: 'move' | 'aim' | 'shoot'; pointerId: number } | null = null;

  // ---- ◀ / ▶
  let holdDir: -1 | 0 | 1 = 0;
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let gliding = false;
  let raf = 0;
  let lastTs = 0;
  const clampX = (x: number) => Math.min(deps.move.max, Math.max(deps.move.min, x));
  const glide = (ts: number) => {
    if (!gliding || holdDir === 0) return;
    const dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0;
    lastTs = ts;
    if (dt > 0) {
      const x = clampX(deps.currentStandX() + holdDir * deps.move.holdSpeed * dt);
      void deps.dispatch({ type: 'SET_POSITION', x });
    }
    raf = win.requestAnimationFrame(glide);
  };
  /**
   * End the hold. `asTap`: released before the hold delay, so the one step is added now.
   * `interrupted`: cancelled, capture lost, blur, hidden, rotated or paused: nothing of this
   * gesture is kept (the last saved position comes back) and nothing is saved.
   */
  const endHold = (asTap: boolean, interrupted = false) => {
    if (holdDir === 0) return;
    const dir = holdDir;
    const wasGliding = gliding;
    holdDir = 0;
    gliding = false;
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    win.cancelAnimationFrame(raf);
    if (gesture?.kind === 'move') gesture = null;
    if (interrupted) {
      deps.revertAim();
      return;
    }
    if (asTap && !wasGliding && canMove()) void deps.dispatch({ type: 'SET_POSITION', x: clampX(deps.currentStandX() + dir * deps.move.step) });
    deps.commitAim();
  };
  const startHold = (dir: -1 | 1) => (e: PointerEvent) => {
    e.preventDefault();
    if (!canMove() || gesture) return;
    gesture = { kind: 'move', pointerId: e.pointerId };
    capture(e.currentTarget as HTMLElement, e.pointerId);
    holdDir = dir;
    lastTs = 0;
    holdTimer = setTimeout(() => {
      holdTimer = null;
      if (holdDir !== dir || !canMove()) return;
      gliding = true;
      raf = win.requestAnimationFrame(glide);
    }, deps.move.holdDelayMs);
  };
  for (const [b, dir] of [[left, -1], [right, 1]] as const) {
    on(b, 'pointerdown', startHold(dir));
    on(b, 'pointerup', (e: PointerEvent) => {
      if (gesture?.kind === 'move' && gesture.pointerId === e.pointerId) endHold(true);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) {
      on(b, type, (e: PointerEvent) => {
        // after a normal release the gesture is already over, so a late capture loss changes nothing
        if (gesture?.kind === 'move' && gesture.pointerId === e.pointerId) endHold(false, true);
      });
    }
    // keyboard: one step per press, never the auto-repeat
    on(b, 'keydown', (e: KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.repeat && canMove()) {
        e.preventDefault();
        void deps.dispatch({ type: 'SET_POSITION', x: clampX(deps.currentStandX() + dir * deps.move.step) });
        deps.commitAim();
      }
    });
  }
  on(win, 'blur', () => interruptGestures());
  on(doc, 'visibilitychange', () => {
    if (doc.visibilityState === 'hidden') interruptGestures();
  });

  // ---- aim pad (relative drag)
  let lastX = 0;
  let lastY = 0;
  let dragged = false;
  on(pad, 'pointerdown', (e: PointerEvent) => {
    if (!canMove() || gesture) return;
    e.preventDefault();
    gesture = { kind: 'aim', pointerId: e.pointerId };
    lastX = e.clientX;
    lastY = e.clientY;
    dragged = false;
    capture(pad, e.pointerId);
  });
  on(pad, 'pointermove', (e: PointerEvent) => {
    if (gesture?.kind !== 'aim' || gesture.pointerId !== e.pointerId || !canMove()) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (dx === 0 && dy === 0) return;
    dragged = true;
    const a = deps.currentAim();
    void deps.dispatch({ type: 'AIM', yaw: a.yaw + dx * AIM_SENSITIVITY, pitch: a.pitch - dy * AIM_SENSITIVITY });
  });
  const endDrag = (e?: PointerEvent, interrupted = false) => {
    if (gesture?.kind !== 'aim' || (e && gesture.pointerId !== e.pointerId)) return;
    gesture = null;
    const moved = dragged;
    dragged = false;
    if (interrupted) {
      if (moved) deps.revertAim();
    } else if (moved) deps.commitAim();
  };
  on(pad, 'pointerup', (e: PointerEvent) => endDrag(e));
  // a cancelled pointer or a capture lost before the release drops the drag
  on(pad, 'pointercancel', (e: PointerEvent) => endDrag(e, true));
  on(pad, 'lostpointercapture', (e: PointerEvent) => endDrag(e, true));
  /** Drop whatever move or drag is under way (blur, hidden, rotation, pause, a panel opening). */
  function interruptGestures(): void {
    endHold(false, true);
    endDrag(undefined, true);
    gesture = null;
  }

  // ---- 撃つ / 発射 on press; the opening press must be released first
  let openedBy: number | null = null;
  on(shoot, 'pointerdown', (e: PointerEvent) => {
    e.preventDefault();
    if (saving || (e.pointerType === 'touch' && !e.isPrimary)) return;
    if (mode === 'aiming' && !gesture) {
      openedBy = e.pointerId;
      void deps.dispatch({ type: 'OPEN_GAUGE' });
    } else if (mode === 'loading' && openedBy === null) {
      void deps.dispatch({ type: 'FIRE' });
    }
  });
  const release = (e: PointerEvent) => {
    if (openedBy === e.pointerId) openedBy = null;
  };
  on(shoot, 'pointerup', release);
  on(shoot, 'pointercancel', release);
  on(shoot, 'lostpointercapture', release);
  on(shoot, 'keydown', (e: KeyboardEvent) => {
    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat || saving) return;
    e.preventDefault();
    if (mode === 'aiming') void deps.dispatch({ type: 'OPEN_GAUGE' });
    else if (mode === 'loading') void deps.dispatch({ type: 'FIRE' });
  });
  on(shoot, 'click', (e: MouseEvent) => e.preventDefault());
  on(cancel, 'click', () => {
    if (mode === 'loading' && !saving) {
      openedBy = null;
      void deps.dispatch({ type: 'CANCEL_GAUGE' });
    }
  });

  on(talkBtn, 'click', () => deps.onTalk());
  on(skipBtn, 'click', () => void deps.dispatch({ type: 'SKIP_PRESENTATION' }));
  on(resumeBtn, 'click', () => void deps.dispatch({ type: 'RESUME', reason: 'manual' }));
  on(pauseBtn, 'click', () => {
    interruptGestures();
    void deps.dispatch({ type: 'PAUSE', reason: 'manual' });
  });
  on(retryBtn, 'click', () => deps.onRetry());
  on(panel, 'touchmove', (e: TouchEvent) => e.preventDefault(), { passive: false });

  /** Drop held moves and drags (never saved). `keepPress`: the press that opened the gauge is still down. */
  const cancelGestures = (keepPress = false) => {
    interruptGestures();
    if (!keepPress) openedBy = null;
  };

  return {
    cancelGestures: () => cancelGestures(),
    update(snap, isSaving) {
      saving = isSaving;
      const s = snap.state;
      const paused = snap.view.paused;
      const next = paused && s.phase !== 'ended' && s.phase !== 'abandoned' ? 'paused' : s.phase;
      if (next !== mode) {
        // leaving aiming (pause, rotation, a question) drops any held move or drag
        if (mode === 'aiming') cancelGestures(next === 'loading');
        if (next !== 'loading') openedBy = null;
      }
      mode = next;
      panel.dataset.mode = mode === 'loading' ? 'loading' : mode === 'aiming' ? 'aiming' : mode;
      hint.textContent = saving ? t('af.hint.saving') : mode === 'aiming' ? t('af.hint.aiming') : mode === 'loading' ? t('af.hint.loading') : t(`hint.${mode}`);
      ammo.textContent = `${t('hud.ammo')} ${s.ammo}`;
      bonus.textContent = `${t('hud.bonus')} ${s.bonusAmmoTotal}/${snap.maxBonusAmmo}`;
      score.textContent = `${s.score} ${t('hud.score')}`;
      const af = snap.view.aimFirst;
      const zoneMult = af?.powerZoneWidthMult ?? 1;
      nextMark.hidden = zoneMult === 1;
      nextMark.textContent = zoneMult === 1 ? '' : `${t('af.next.mark')}: ${t('af.gauge.width', { m: zoneMult })}`;
      const talk = af?.talk;
      talkBtn.hidden = !talk || talk.used !== null || mode === 'ended' || mode === 'abandoned';
      talkBtn.disabled = !talk || talk.blocked !== null || saving;
      talkBtn.title = talk?.blocked ? t(`af.talk.blocked.${talk.blocked}`) : '';
      const aiming = mode === 'aiming';
      const loading = mode === 'loading';
      gauge.hidden = !(aiming || loading);
      gauge.dataset.open = String(loading);
      gaugeLabel.hidden = !loading;
      for (const z of zoneEls) {
        const zone = af?.zones.find((x) => x.tier === z.dataset.tier);
        if (!zone) continue;
        z.style.left = `${(zone.min * 100).toFixed(1)}%`;
        z.style.width = `${((zone.max - zone.min) * 100).toFixed(1)}%`;
      }
      const bar = snap.view.loadingBar;
      marker.hidden = bar === null;
      if (bar !== null) marker.style.left = `${(bar * 100).toFixed(1)}%`;
      if (loading && bar !== null && af) {
        const z = [...af.zones].filter((x) => x.tier !== 'weak').reverse().find((x) => bar >= x.min - 1e-9 && bar <= x.max + 1e-9);
        gaugeLabel.textContent = `${t('af.gauge.label')}: ${t(`af.tier.${z?.tier ?? 'weak'}`)}${zoneMult !== 1 ? ` · ${t('af.gauge.width', { m: zoneMult })}` : ''}`;
        gaugeLabel.dataset.tier = z?.tier ?? 'weak';
      }
      pad.hidden = !(aiming || loading);
      pad.dataset.locked = String(!aiming || saving);
      row.hidden = !(aiming || loading);
      left.disabled = right.disabled = !aiming || saving;
      shoot.textContent = loading ? t('af.fire') : t('af.shoot');
      shoot.dataset.state = loading ? 'fire' : 'shoot';
      shoot.disabled = saving || !(aiming || loading) || s.ammo < 1;
      cancel.hidden = !loading;
      cancel.disabled = saving;
      skipBtn.hidden = mode !== 'resolving';
      resumeBtn.hidden = mode !== 'paused';
      retryBtn.hidden = !(mode === 'ended' || mode === 'abandoned');
      pauseBtn.hidden = mode === 'paused' || mode === 'ended' || mode === 'abandoned';
      left.dataset.atEnd = String(deps.currentStandX() <= deps.move.min + 1e-6);
      right.dataset.atEnd = String(deps.currentStandX() >= deps.move.max - 1e-6);
    },
    dispose() {
      cancelGestures();
      for (const off of offs) off();
      hud.remove();
      panel.remove();
    },
  };
}
