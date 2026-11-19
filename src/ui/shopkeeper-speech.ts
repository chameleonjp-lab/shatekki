/**
 * r007 speech bubbles (plan 工程4d). View only: the timer lives here, never in the game
 * clock, the random effects, the score or the save. Its own random stream picks one line
 * among those whose condition holds now, never one of the last `recentWindow` lines.
 *
 * Time counts only while the player can calmly aim (aiming, not paused, no question,
 * talk panel, order card or save prompt). Time spent elsewhere is never caught up: a
 * pause, a hidden tab or the gauge never releases a backlog of lines.
 */
import type { SpeechCondition, SpeechLineDef } from '../i18n/stall-speech';

export interface SpeechTiming {
  readonly firstSec: number;
  readonly intervalSec: number;
  readonly showSec: number;
  readonly recentWindow: number;
}

/** One frame never adds more than this (a long frame after a background tab is not a backlog). */
export const MAX_SPEECH_STEP_SEC = 0.25;

export interface SpeechTick {
  /** A new line to show now, or null. */
  readonly start: string | null;
  /** The line on screen after this tick (null = none). */
  readonly showing: string | null;
}

export class SpeechScheduler {
  private calmSec = 0;
  private nextAt: number;
  private showing: { id: string; left: number } | null = null;
  private readonly recent: string[] = [];
  private rng: number;

  constructor(seed: number, private readonly timing: SpeechTiming, private readonly lines: readonly SpeechLineDef[]) {
    this.nextAt = timing.firstSec;
    this.rng = (seed ^ 0x6d2b79f5) >>> 0 || 1;
  }

  /** Lines said so far, newest last (at most recentWindow). */
  get recentIds(): readonly string[] {
    return this.recent;
  }

  get calmSeconds(): number {
    return this.calmSec;
  }

  /** Close the bubble now (question, talk, order, pause, gauge). The schedule is not moved. */
  hide(): void {
    this.showing = null;
  }

  private random(): number {
    // xorshift32: the stream depends only on the run, never on language or frame rate
    let x = this.rng;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    this.rng = x >>> 0;
    return this.rng / 0x100000000;
  }

  tick(dtSec: number, calm: boolean, conditions: ReadonlySet<SpeechCondition>): SpeechTick {
    const dt = Number.isFinite(dtSec) && dtSec > 0 ? Math.min(dtSec, MAX_SPEECH_STEP_SEC) : 0;
    if (!calm) {
      this.showing = null;
      return { start: null, showing: null };
    }
    if (this.showing) {
      this.showing.left -= dt;
      if (this.showing.left <= 0) this.showing = null;
    }
    this.calmSec += dt;
    let start: string | null = null;
    if (this.calmSec >= this.nextAt) {
      // the next one counts from now, so a slow frame never queues several
      this.nextAt = this.calmSec + this.timing.intervalSec;
      const pool = this.lines.filter((l) => (l.when === 'always' || conditions.has(l.when)) && !this.recent.includes(l.id));
      if (pool.length > 0) {
        const pick = pool[Math.min(pool.length - 1, Math.floor(this.random() * pool.length))]!;
        start = pick.id;
        this.showing = { id: pick.id, left: this.timing.showSec };
        this.recent.push(pick.id);
        while (this.recent.length > this.timing.recentWindow) this.recent.shift();
      }
    }
    return { start, showing: this.showing?.id ?? null };
  }
}

export interface SpeechBubbleHandle {
  /** Show a line near the shopkeeper's head (x, y in CSS px) or, when off screen, at the top with the speaker. */
  show(text: string, speaker: string, at: { readonly x: number; readonly y: number } | null): void;
  hide(): void;
  destroy(): void;
}

/** White washi bubble with a short tail; it never takes input. */
export function mountSpeechBubble(root: HTMLElement): SpeechBubbleHandle {
  const doc = root.ownerDocument;
  const el = doc.createElement('div');
  el.className = 'af-speech';
  el.dataset.testid = 'shopkeeper-speech';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.hidden = true;
  const who = doc.createElement('span');
  who.className = 'af-speech-who';
  const text = doc.createElement('span');
  text.className = 'af-speech-text';
  el.append(who, text);
  root.appendChild(el);
  return {
    show(line, speaker, at) {
      text.textContent = line;
      who.textContent = speaker;
      el.hidden = false;
      el.dataset.anchor = at ? 'head' : 'top';
      if (at) {
        // keep inside the stage and above the head (never over the reticle centre or the controls)
        el.style.setProperty('--x', `${Math.round(at.x)}px`);
        el.style.setProperty('--y', `${Math.round(at.y)}px`);
      } else {
        el.style.removeProperty('--x');
        el.style.removeProperty('--y');
      }
    },
    hide() {
      el.hidden = true;
    },
    destroy() {
      el.remove();
    },
  };
}
