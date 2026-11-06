/**
 * Shopkeeper question panel (D34-D37, requirements §5.1 / §10, plan EG08, UI only).
 *
 * Shows one question with two choice buttons, each with the short description
 * of its lottery range. It decides nothing: no timer, no auto-answer, no effect
 * id, no points. The only thing it can send is
 *   { type: 'ANSWER_SHOPKEEPER', shotId, questionId, choice }
 * exactly as the rules' parseCommand expects (extra fields are rejected there).
 *
 * Rules of the buttons:
 *  - the first accepted tap disables BOTH buttons at once and calls onAnswer once;
 *  - a press that began before the panel appeared (e.g. a held fire button) can
 *    never answer: a choice needs its own pointerdown on the button after show();
 *  - keyboard / screen-reader activation (click without a pointer) is accepted;
 *  - showing the same question again keeps it answered; a NEW question re-enables;
 *  - if onAnswer returns false (the rules rejected the command, e.g. while the
 *    game is paused) the panel re-enables so the player can answer again.
 *
 * Long texts: the question scrolls inside its own region; the two choices stay
 * on screen (they scroll inside their own region only if a translation is huge).
 * Text is set with textContent only.
 */
import type { AnswerShopkeeperCommand, ExpansionCatalog, QuestionChoice, QuestionId, ShotId } from '../contracts';
import './expanded.css';

export interface QuestionChoiceText {
  readonly text: string;
  /** Short lottery-range description (the group label), e.g. "弾を増やす・弾を変える". May be '' when unavailable. */
  readonly groupLabel: string;
}

export interface QuestionPanelContent {
  readonly shotId: ShotId;
  readonly questionId: QuestionId;
  readonly questionText: string;
  readonly choices: Readonly<Record<QuestionChoice, QuestionChoiceText>>;
}

export interface QuestionPanelDeps {
  /** Return false when the command was rejected (the panel then re-enables). */
  onAnswer(command: AnswerShopkeeperCommand): boolean | void;
  /** UI strings (shopq.*). */
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
}

export interface QuestionPanelHandle {
  show(content: QuestionPanelContent): void;
  hide(): void;
  /** Dims the panel and shows the paused note. Never lifts the pause itself. */
  setPaused(paused: boolean): void;
  /** True while the panel is visible. */
  isShown(): boolean;
  /** True once an answer was accepted for the shown question. */
  isAnswered(): boolean;
  destroy(): void;
}

/**
 * Builds the panel content from the expansion catalog (pure). `text(key)` returns
 * the display text for `exp.*` content keys (Japanese fallback until translated).
 * Returns null for a question id the catalog does not know.
 */
export function questionContentFor(
  expansion: ExpansionCatalog,
  ref: { readonly shotId: ShotId; readonly questionId: QuestionId },
  text: (key: string) => string,
): QuestionPanelContent | null {
  const q = expansion.questions.get(ref.questionId);
  if (!q) return null;
  const side = (c: QuestionChoice): QuestionChoiceText => {
    const def = q.choices[c];
    const label = expansion.groups.get(def.groupId)?.labelKey;
    return { text: text(def.textKey), groupLabel: label ? text(label) : '' };
  };
  return { shotId: ref.shotId, questionId: ref.questionId, questionText: text(q.textKey), choices: { A: side('A'), B: side('B') } };
}

const CHOICES: readonly QuestionChoice[] = ['A', 'B'];

export function createShopkeeperQuestionPanel(root: HTMLElement, deps: QuestionPanelDeps): QuestionPanelHandle {
  const doc = root.ownerDocument;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    e.className = cls;
    return e;
  };

  const overlay = mk('div', 'shopq');
  overlay.dataset.testid = 'shopkeeper-question';
  overlay.hidden = true;
  const card = mk('div', 'shopq-card');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.tabIndex = -1;
  const titleEl = mk('h2', 'shopq-title');
  titleEl.id = 'shopq-title';
  card.setAttribute('aria-labelledby', 'shopq-title');

  const body = mk('div', 'shopq-body');
  const questionEl = mk('p', 'shopq-question');
  questionEl.dataset.testid = 'shopq-question';
  const hintEl = mk('p', 'shopq-hint');
  const pausedEl = mk('p', 'shopq-paused');
  pausedEl.hidden = true;
  pausedEl.setAttribute('role', 'status');
  body.append(questionEl, hintEl, pausedEl);

  const choicesEl = mk('div', 'shopq-choices');
  const buttons = {} as Record<QuestionChoice, HTMLButtonElement>;
  const texts = {} as Record<QuestionChoice, HTMLElement>;
  const ranges = {} as Record<QuestionChoice, HTMLElement>;
  for (const c of CHOICES) {
    const b = mk('button', 'shopq-choice');
    b.type = 'button';
    b.dataset.testid = `shopq-choice-${c}`;
    b.dataset.choice = c;
    const letter = mk('span', 'shopq-letter');
    letter.textContent = c;
    letter.setAttribute('aria-hidden', 'true');
    const wrap = mk('span', 'shopq-choice-text');
    const text = mk('span', 'shopq-choice-main');
    const range = mk('span', 'shopq-range');
    wrap.append(text, range);
    b.append(letter, wrap);
    choicesEl.appendChild(b);
    buttons[c] = b;
    texts[c] = text;
    ranges[c] = range;
  }
  card.append(titleEl, body, choicesEl);
  overlay.appendChild(card);
  root.appendChild(overlay);

  // ----------------------------------------------------------------- state
  let current: QuestionPanelContent | null = null;
  let shown = false;
  let paused = false;
  /** The question key an answer was accepted for (survives hide/show of the same question). */
  let answeredKey: string | null = null;
  /** choice whose pointerdown started on the button after show() */
  let downOn: QuestionChoice | null = null;
  let downPointer: number | null = null;
  const keyOf = (c: QuestionPanelContent) => `${c.shotId}|${c.questionId}`;
  const answered = () => current !== null && answeredKey === keyOf(current);

  const refresh = () => {
    const locked = answered() || paused || !shown;
    for (const c of CHOICES) {
      buttons[c].disabled = locked;
      buttons[c].setAttribute('aria-disabled', locked ? 'true' : 'false');
    }
    overlay.dataset.answered = answered() ? '1' : '0';
    overlay.dataset.paused = paused ? '1' : '0';
    pausedEl.hidden = !paused;
    pausedEl.textContent = paused ? deps.t('shopq.paused') : '';
    hintEl.textContent = answered() ? deps.t('shopq.answered') : deps.t('shopq.hint');
  };

  const accept = (choice: QuestionChoice) => {
    if (!shown || !current || answered() || paused) return;
    const content = current;
    answeredKey = keyOf(content);
    refresh(); // both buttons are disabled before the command leaves
    const cmd: AnswerShopkeeperCommand = { type: 'ANSWER_SHOPKEEPER', shotId: content.shotId, questionId: content.questionId, choice };
    let result: boolean | void;
    try {
      result = deps.onAnswer(cmd);
    } catch {
      result = false;
    }
    if (result === false) {
      answeredKey = null; // rejected: let the player answer again
      refresh();
    }
  };

  const listeners: Array<() => void> = [];
  const on = <E extends Event>(target: EventTarget, type: string, fn: (e: E) => void) => {
    const h = fn as EventListener;
    target.addEventListener(type, h);
    listeners.push(() => target.removeEventListener(type, h));
  };
  for (const c of CHOICES) {
    const b = buttons[c];
    on<PointerEvent>(b, 'pointerdown', (e) => {
      if (!shown || answered() || paused) return;
      downOn = c;
      downPointer = e.pointerId ?? null;
    });
    on<PointerEvent>(b, 'pointerup', (e) => {
      const armed = downOn === c && (downPointer === null || e.pointerId === undefined || e.pointerId === downPointer);
      downOn = null;
      downPointer = null;
      if (armed) accept(c);
    });
    on<PointerEvent>(b, 'pointercancel', () => {
      downOn = null;
      downPointer = null;
    });
    on<PointerEvent>(b, 'pointerleave', () => {
      downOn = null;
      downPointer = null;
    });
    // Keyboard / screen reader activation has no pointer: accept it. A pointer click is handled by pointerup above.
    on<MouseEvent>(b, 'click', (e) => {
      if (e.detail === 0) accept(c);
    });
  }
  // The backdrop swallows touches so nothing underneath (fire, home, resume) can react to a stray tap.
  on<Event>(overlay, 'touchmove', (e) => e.preventDefault());

  const render = (c: QuestionPanelContent) => {
    titleEl.textContent = deps.t('shopq.title');
    questionEl.textContent = c.questionText;
    for (const k of CHOICES) {
      texts[k].textContent = c.choices[k].text;
      const g = c.choices[k].groupLabel;
      ranges[k].textContent = g ? deps.t('shopq.range', { range: g }) : '';
      ranges[k].hidden = g === '';
      buttons[k].setAttribute(
        'aria-label',
        `${deps.t(k === 'A' ? 'shopq.choiceA' : 'shopq.choiceB')}: ${c.choices[k].text}${g ? `. ${deps.t('shopq.range', { range: g })}` : ''}`,
      );
    }
  };

  return {
    show(content) {
      const isNew = current === null || keyOf(current) !== keyOf(content);
      current = content;
      if (isNew) {
        // a new question: nothing pressed earlier counts
        downOn = null;
        downPointer = null;
        if (answeredKey !== keyOf(content)) answeredKey = null;
      }
      render(content);
      const wasShown = shown;
      shown = true;
      overlay.hidden = false;
      refresh();
      if (!wasShown || isNew) {
        body.scrollTop = 0;
        card.focus();
      }
    },
    hide() {
      shown = false;
      downOn = null;
      downPointer = null;
      overlay.hidden = true;
      refresh();
    },
    setPaused(p) {
      if (paused === p) return;
      paused = p;
      downOn = null;
      downPointer = null;
      refresh();
    },
    isShown: () => shown,
    isAnswered: () => answered(),
    destroy() {
      for (const off of listeners) off();
      listeners.length = 0;
      overlay.remove();
      current = null;
      shown = false;
    },
  };
}
