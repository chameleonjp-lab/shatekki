/**
 * Effect result lines (D34-D37, plan EG09, UI only).
 *
 * After an expanded shot settles, a short non-blocking card tells the player
 * what the post-flight plan did, in the order of `ShotSummary.effects`:
 *   [source] effect name: result line
 * For an effect that changed nothing the reason line is shown instead
 * ("今は使える効果がありません" for the answer draw, a generic line otherwise).
 * Text comes only from the injected translator; this module draws no random
 * numbers and never touches game state. Expanded build only (loaded through
 * src/app/expanded-ui.ts).
 *
 * The card sits under the HUD at the left, clear of the aim/fire controls, the
 * overview map and the question panel. It hides itself after a few seconds, a
 * tap on it dismisses it, and its events never reach anything underneath.
 */
import type { DeferredTransform, PlannedEffect } from '../contracts';
import type { ExpandedLineKey } from '../i18n/expanded/types';
import './expanded.css';

/** Most lines shown at once, the "more" line included. */
export const EFFECT_RESULT_MAX_LINES = 5;
/** How long the card stays (ms). */
export const EFFECT_RESULT_SHOW_MS = 5000;

type Params = Readonly<Record<string, string | number>>;

export interface EffectResultTextDeps {
  /** UI keys and `exp.*` content keys (createExpansionTranslator). */
  t(key: string, params?: Params): string;
  /** Fixed expanded lines (expandedLine for the current locale). */
  line(key: ExpandedLineKey): string;
}

export interface EffectResultLine {
  readonly source: 'cell' | 'answer' | 'device' | 'carryOver';
  readonly sourceLabel: string;
  /** '' when the effect is unknown (no effect id) or its name is unavailable. */
  readonly name: string;
  /** The result line, or the reason line when the effect changed nothing. */
  readonly text: string;
  /** FX090-FX092 only: the temporary "outside the series" notice. */
  readonly note: string | null;
  readonly applied: boolean;
}

export interface EffectResultsModel {
  readonly title: string;
  readonly lines: readonly EffectResultLine[];
  /** "ほか N件" when lines were summarised. */
  readonly more: string | null;
  /** "N個の景品は形が合わないため、あとで変わります". */
  readonly deferred: string | null;
  /** True when there is anything to show. */
  readonly any: boolean;
}

export interface EffectResultInput {
  readonly effects?: readonly PlannedEffect[];
  readonly deferredTransforms?: readonly DeferredTransform[];
}

const SOURCE_KEY = {
  cell: 'fxres.src.cell',
  answer: 'fxres.src.answer',
  device: 'fxres.src.device',
  carryOver: 'fxres.src.carry',
} as const;

/** FX061-FX080 outline a series. */
const OUTLINE_FX = /^FX0(6\d|7\d|80)$/;
/** FX090-FX092 may leave a prize outside the series. */
const OUTSIDE_SERIES_FX = /^FX09[0-2]$/;

function reasonLine(e: PlannedEffect, line: EffectResultTextDeps['line']): string {
  const fx = e.effectId === null ? '' : String(e.effectId);
  if (e.reason === 'noApplicableEffect' || (e.source.kind === 'answer' && e.effectId === null)) return line('noApplicableEffect');
  if (OUTLINE_FX.test(fx) && e.reason === 'noTarget') return line('noOutlineTarget');
  return line('effectNotApplicable');
}

export function effectResultLine(e: PlannedEffect, deps: EffectResultTextDeps): EffectResultLine {
  const fx = e.effectId === null ? null : String(e.effectId);
  const applied = e.outcome === 'applied' && fx !== null;
  const name = fx === null ? '' : deps.t(`exp.fx.${fx}.name`);
  const text = applied ? deps.t(`exp.fx.${fx}.result`, { n: Math.abs(e.ammoDelta) }) : reasonLine(e, deps.line);
  const note = applied && fx !== null && OUTSIDE_SERIES_FX.test(fx) ? deps.line('sideEffectTemporaryOutsideSeries') : null;
  return { source: e.source.kind, sourceLabel: deps.t(SOURCE_KEY[e.source.kind]), name, text, note, applied };
}

/** Pure: what the card shows for a settled shot. Order follows `effects`; capped at {@link EFFECT_RESULT_MAX_LINES}. */
export function effectResultsModel(input: EffectResultInput, deps: EffectResultTextDeps): EffectResultsModel {
  const all = (input.effects ?? []).map((e) => effectResultLine(e, deps)).filter((l) => l.text !== '');
  const deferredCount = input.deferredTransforms?.length ?? 0;
  const deferred = deferredCount > 0 ? deps.t('fxres.deferred', { n: deferredCount }) : null;
  const budget = EFFECT_RESULT_MAX_LINES - (deferred !== null ? 1 : 0);
  let lines = all;
  let more: string | null = null;
  if (all.length > budget) {
    lines = all.slice(0, budget - 1);
    more = deps.t('fxres.more', { n: all.length - (budget - 1) });
  }
  return { title: deps.t('fxres.title'), lines, more, deferred, any: all.length > 0 || deferred !== null };
}

// ------------------------------------------------------------------- mount

export interface EffectResultsDeps extends EffectResultTextDeps {
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (id: unknown) => void;
  readonly showMs?: number;
}

export interface EffectResultsHandle {
  /** Shows the result of a settled shot (hides instead when there is nothing to say). */
  show(input: EffectResultInput): void;
  hide(): void;
  isShown(): boolean;
  destroy(): void;
}

export function mountEffectResults(root: HTMLElement, deps: EffectResultsDeps): EffectResultsHandle {
  const doc = root.ownerDocument;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    e.className = cls;
    return e;
  };
  const card = mk('div', 'fxres');
  card.dataset.testid = 'effect-results';
  card.hidden = true;
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const title = mk('div', 'fxres-title');
  const list = mk('ul', 'fxres-list');
  const deferredEl = mk('p', 'fxres-deferred');
  card.append(title, list, deferredEl);
  root.appendChild(card);

  const setT = deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearT = deps.clearTimeout ?? ((id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let shown = false;

  const stopTimer = () => {
    if (timer !== null) clearT(timer);
    timer = null;
  };
  const hide = () => {
    stopTimer();
    shown = false;
    card.hidden = true;
  };
  // A tap on the card only dismisses it; it never reaches anything underneath.
  card.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    hide();
  });

  return {
    show(input) {
      const m = effectResultsModel(input, deps);
      if (!m.any) {
        hide();
        return;
      }
      title.textContent = m.title;
      const items: HTMLElement[] = m.lines.map((l) => {
        const li = mk('li', l.applied ? 'fxres-item' : 'fxres-item fxres-none');
        li.dataset.source = l.source;
        const src = mk('span', 'fxres-src');
        src.textContent = l.sourceLabel;
        const body = mk('span', 'fxres-text');
        body.textContent = (l.name !== '' ? `${l.name}: ` : '') + l.text;
        li.append(src, body);
        if (l.note !== null) {
          const n = mk('span', 'fxres-note');
          n.textContent = l.note;
          li.appendChild(n);
        }
        return li;
      });
      if (m.more !== null) {
        const li = mk('li', 'fxres-item fxres-more');
        li.textContent = m.more;
        items.push(li);
      }
      list.replaceChildren(...items);
      deferredEl.textContent = m.deferred ?? '';
      deferredEl.hidden = m.deferred === null;
      card.hidden = false;
      shown = true;
      stopTimer();
      timer = setT(hide, deps.showMs ?? EFFECT_RESULT_SHOW_MS);
    },
    hide,
    isShown: () => shown,
    destroy() {
      hide();
      card.remove();
    },
  };
}
