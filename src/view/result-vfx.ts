/**
 * Result screen celebration (Task 12). Decorative DOM/CSS only: lantern
 * sparkles behind the score and prize-colored dots popping in. No game logic,
 * no text, not interactive (`pointer-events:none`, `aria-hidden`), so the
 * result is never conveyed by this layer alone. The caller puts the container
 * behind the score (the layer uses z-index:0 and fills the container).
 *
 * Reduced motion: the layer shows static dots with no animation.
 */
export interface ResultCelebrationOptions {
  readonly newBest: boolean;
  /** Number of completed sets this run (more sets, more sparkle). */
  readonly sets: number;
  readonly reducedMotion: boolean;
}

const STYLE_ID_ATTR = 'data-result-vfx';
const LANTERN = ['#ff7a45', '#ffd24a', '#ff9ec0', '#fff0a0'];

export function playResultCelebration(container: HTMLElement, opts: ResultCelebrationOptions): () => void {
  const doc = container.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function') return () => undefined;

  const layer = doc.createElement('div');
  layer.setAttribute(STYLE_ID_ATTR, '');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:0';

  if (!opts.reducedMotion) {
    const css = doc.createElement('style');
    css.textContent =
      '@keyframes rvfx-rise{0%{opacity:0;transform:translateY(12px) scale(.4)}25%{opacity:1}100%{opacity:0;transform:translateY(-70px) scale(1)}}' +
      '@keyframes rvfx-pop{0%{opacity:0;transform:scale(0)}60%{opacity:1;transform:scale(1.25)}100%{opacity:1;transform:scale(1)}}';
    layer.appendChild(css);
  }

  const sets = Math.max(0, Math.min(6, Math.floor(opts.sets)));
  const count = 8 + sets * 3 + (opts.newBest ? 10 : 0);
  // deterministic scatter: presentation only, no Math.random so the layer is reproducible
  for (let i = 0; i < count; i++) {
    const dot = doc.createElement('span');
    const x = (i * 37 + 11) % 100;
    const y = 30 + ((i * 53 + 7) % 55);
    const size = 5 + ((i * 13) % 7);
    const color = LANTERN[i % LANTERN.length]!;
    const anim = opts.reducedMotion ? '' : `animation:rvfx-rise ${(1.6 + (i % 5) * 0.25).toFixed(2)}s ease-out ${((i % 7) * 0.12).toFixed(2)}s infinite;`;
    dot.style.cssText = `position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size * 2}px ${color};opacity:${opts.reducedMotion ? 0.55 : 0};${anim}`;
    layer.appendChild(dot);
  }

  // a few lantern discs popping in near the score (more for new best)
  const lanterns = opts.newBest ? 5 : 3;
  for (let i = 0; i < lanterns; i++) {
    const l = doc.createElement('span');
    const color = LANTERN[(i + 1) % LANTERN.length]!;
    const anim = opts.reducedMotion ? '' : `animation:rvfx-pop .5s cubic-bezier(.3,1.4,.5,1) ${(0.15 + i * 0.12).toFixed(2)}s both;`;
    l.style.cssText = `position:absolute;left:${14 + i * (72 / Math.max(1, lanterns - 1))}%;top:12%;width:22px;height:28px;border-radius:40% 40% 45% 45%;background:${color};opacity:.9;${anim}`;
    layer.appendChild(l);
  }

  container.appendChild(layer);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    layer.remove();
  };
}
