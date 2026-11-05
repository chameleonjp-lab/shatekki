/**
 * Tiny DOM overlay for the effects HUD pieces that must stay readable and
 * crisp over the canvas: the off-screen edge arrows (AC26) and the chain
 * count. Presentation only; text comes from i18n keys translated by the
 * caller (`translate`). No game logic.
 */
import type { EffectsHud, OffscreenCue } from './effects';

export interface DomHudOptions {
  /** Resolves an i18n key (UI/QA's translator). Without it only the arrow is shown. */
  readonly translate?: (key: string, params?: Record<string, string | number>) => string;
  /** Chain label key: `fx.chain` with {count}. Falls back to "xN". */
  readonly reducedMotion?: () => boolean;
}

export interface DomHud extends EffectsHud {
  dispose(): void;
}

const ARROW_LIFE_MS = 1600;
const CHAIN_LIFE_MS = 1500;

export function createDomHud(canvas: HTMLElement, options: DomHudOptions = {}): DomHud | null {
  const host = canvas.parentElement;
  const doc = canvas.ownerDocument;
  if (!host || !doc) return null;
  const layer = doc.createElement('div');
  layer.setAttribute('data-fx-hud', '');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:5';
  host.appendChild(layer);

  const timers = new Set<ReturnType<typeof setTimeout>>();
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };

  const arrows: HTMLElement[] = [];
  for (let i = 0; i < 3; i++) {
    const el = doc.createElement('div');
    el.style.cssText =
      'position:absolute;left:0;top:0;display:none;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(255,236,170,.92);color:#3a1d12;font:700 12px/1.2 system-ui,sans-serif;white-space:nowrap;box-shadow:0 1px 6px rgba(0,0,0,.4)';
    const glyph = doc.createElement('span');
    glyph.textContent = '▶';
    glyph.setAttribute('aria-hidden', 'true');
    const label = doc.createElement('span');
    el.append(glyph, label);
    layer.appendChild(el);
    arrows.push(el);
  }
  let nextArrow = 0;

  const chainEl = doc.createElement('div');
  chainEl.style.cssText =
    'position:absolute;left:50%;top:22%;transform:translateX(-50%);display:none;font:800 44px/1 system-ui,sans-serif;color:#fff3b0;text-shadow:0 2px 0 #7a2a12,0 0 12px #ff9a3c';
  chainEl.setAttribute('aria-hidden', 'true'); // the result screen states the number as text
  layer.appendChild(chainEl);

  return {
    offscreen(cue: OffscreenCue): void {
      const el = arrows[nextArrow++ % arrows.length]!;
      const label = el.children[1] as HTMLElement;
      const glyph = el.children[0] as HTMLElement;
      const text = options.translate ? options.translate(cue.key) : '';
      label.textContent = text === cue.key ? '' : text;
      // keep the label on the screen side where the arrow sits
      glyph.style.display = 'inline-block';
      glyph.style.transform = `rotate(${cue.angle}rad)`;
      el.style.display = 'flex';
      el.style.transform = `translate(calc(${cue.x}px - 50%), calc(${cue.y}px - 50%))`;
      later(() => {
        el.style.display = 'none';
      }, ARROW_LIFE_MS);
    },
    chain(count: number): void {
      const text = options.translate ? options.translate('fx.chain', { count }) : '';
      chainEl.textContent = text && text !== 'fx.chain' ? text : `×${count}`;
      chainEl.style.display = 'block';
      chainEl.style.transform = 'translateX(-50%)' + (options.reducedMotion?.() ? '' : ' scale(1.1)');
      later(() => {
        chainEl.style.display = 'none';
      }, CHAIN_LIFE_MS);
    },
    dispose(): void {
      for (const t of timers) clearTimeout(t);
      timers.clear();
      layer.remove();
    },
  };
}
