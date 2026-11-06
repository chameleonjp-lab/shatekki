/**
 * DOM overlay for the expanded presentation (plan EG07): the info column
 * (series legend, refill series, current hint title, angle readout) and the
 * floating labels (series symbol badges, hint labels, cork numbers, "目安").
 *
 * Text is only ever set through textContent. The layer ignores pointer events,
 * so it can never fire, move or answer anything. It sits under the HUD and the
 * controls (low z-index) and never replaces them.
 */
import type { ExpandedViewModel, ScreenLabel, SeriesRow } from './expanded-view';

export interface ExpandedOverlay {
  render(model: ExpandedViewModel | null): void;
  dispose(): void;
}

const LABEL_POOL = 48;

const TONE_STYLE: Readonly<Record<string, string>> = {
  info: 'background:rgba(24,14,10,.88);color:#fff7ec;border:1px solid rgba(255,247,236,.55)',
  warn: 'background:#ffd36b;color:#3a1d12;border:1px solid #fff3b0',
  zero: 'background:#c8261b;color:#fff;border:1px solid #ffd9d4',
  guide: 'background:#fff6c8;color:#3a1d12;border:1px solid #3a1d12',
  badge: 'color:#1b1209;border:2px solid rgba(255,255,255,.9)',
  cork: 'color:#1b1209;border:2px solid #1b1209;border-radius:50%;min-width:20px;height:20px;padding:0',
};

/** Black or white, whichever reads better on the colour. */
export function readableTextColor(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#1b1209';
  const l = (0.299 * parseInt(m[1]!, 16) + 0.587 * parseInt(m[2]!, 16) + 0.114 * parseInt(m[3]!, 16)) / 255;
  return l > 0.55 ? '#1b1209' : '#ffffff';
}

export function createExpandedOverlay(host: HTMLElement): ExpandedOverlay | null {
  const doc = host.ownerDocument;
  if (!doc) return null;
  const layer = doc.createElement('div');
  layer.setAttribute('data-exp-hud', '');
  layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:4';
  host.appendChild(layer);

  // ------------------------------------------------------------ info column
  const info = doc.createElement('div');
  info.setAttribute('data-exp-info', '');
  info.setAttribute('role', 'status');
  info.style.cssText =
    'position:absolute;left:10px;top:calc(env(safe-area-inset-top,0px) + 64px);max-width:calc(100% - 150px);display:flex;flex-direction:column;gap:4px;align-items:flex-start;font:700 12px/1.3 system-ui,sans-serif;color:#fff7ec';
  layer.appendChild(info);

  const row = (testid: string): HTMLElement => {
    const r = doc.createElement('div');
    r.setAttribute('data-testid', testid);
    r.style.cssText = 'display:none;align-items:center;gap:6px;padding:3px 8px;border-radius:10px;background:rgba(24,14,10,.82);border:1px solid rgba(255,247,236,.4);overflow-wrap:anywhere';
    info.appendChild(r);
    return r;
  };
  const swatch = (): HTMLElement => {
    const s = doc.createElement('span');
    s.style.cssText = 'display:inline-block;min-width:26px;padding:1px 4px;border-radius:6px;text-align:center;border:2px solid rgba(255,255,255,.9);font-weight:800';
    return s;
  };
  const outlineRow = row('exp-outline');
  const outlineSwatch = swatch();
  const outlineText = doc.createElement('span');
  outlineRow.append(outlineSwatch, outlineText);
  const noTargetRow = row('exp-notarget');
  const assortRow = row('exp-assortment');
  const assortSwatch = swatch();
  const assortText = doc.createElement('span');
  assortRow.append(assortSwatch, assortText);
  const hintRow = row('exp-hint');
  const angleRow = row('exp-angle');

  const paintSwatch = (el: HTMLElement, r: SeriesRow | { color: string; symbol: string; label: string }) => {
    el.style.background = r.color;
    el.style.color = readableTextColor(r.color);
    el.textContent = r.symbol || '■';
  };

  // ---------------------------------------------------------------- labels
  const pool: HTMLElement[] = [];
  const shown: string[] = [];
  for (let i = 0; i < LABEL_POOL; i++) {
    const e = doc.createElement('div');
    e.style.cssText =
      'position:absolute;left:0;top:0;display:none;box-sizing:border-box;padding:1px 6px;border-radius:999px;font:700 11px/1.25 system-ui,sans-serif;text-align:center;max-width:128px;white-space:normal;box-shadow:0 1px 4px rgba(0,0,0,.45)';
    layer.appendChild(e);
    pool.push(e);
    shown.push('');
  }

  const place = (e: HTMLElement, i: number, l: ScreenLabel, dy: string) => {
    const style = TONE_STYLE[l.tone] ?? TONE_STYLE.info!;
    const key = `${l.text}|${l.tone}|${l.color ?? ''}|${Math.round(l.x)}|${Math.round(l.y)}|${dy}`;
    if (shown[i] === key) return;
    shown[i] = key;
    e.style.cssText =
      `position:absolute;left:0;top:0;display:block;box-sizing:border-box;padding:1px 6px;border-radius:999px;font:700 11px/1.25 system-ui,sans-serif;text-align:center;max-width:128px;white-space:normal;box-shadow:0 1px 4px rgba(0,0,0,.45);${style};` +
      (l.color ? `background:${l.color};color:${l.tone === 'badge' ? readableTextColor(l.color) : '#1b1209'};` : '') +
      `transform:translate(calc(${Math.round(l.x)}px - 50%), calc(${Math.round(l.y)}px + ${dy}))`;
    e.textContent = l.text;
  };

  return {
    render(model) {
      if (!model) {
        for (const r of [outlineRow, noTargetRow, assortRow, hintRow, angleRow]) r.style.display = 'none';
        for (let i = 0; i < pool.length; i++) {
          if (shown[i] !== '') pool[i]!.style.display = 'none';
          shown[i] = '';
        }
        return;
      }
      // info column
      if (model.outline) {
        paintSwatch(outlineSwatch, model.outline);
        outlineText.textContent = model.outline.label;
        outlineRow.style.display = 'flex';
        noTargetRow.textContent = model.noTargetText;
        noTargetRow.style.display = model.outline.empty ? 'flex' : 'none';
      } else {
        outlineRow.style.display = 'none';
        noTargetRow.style.display = 'none';
      }
      if (model.assortment) {
        paintSwatch(assortSwatch, model.assortment);
        assortText.textContent = model.assortment.label;
        assortRow.style.display = 'flex';
      } else assortRow.style.display = 'none';
      if (model.hint) {
        hintRow.textContent = model.hintEmpty ? `${model.hintTitle}　${model.noTargetText}` : model.hintTitle;
        hintRow.style.display = 'flex';
      } else hintRow.style.display = 'none';
      if (model.angle) {
        angleRow.textContent = model.angle.text;
        angleRow.style.display = 'flex';
      } else angleRow.style.display = 'none';

      // floating labels, pooled
      let n = 0;
      const put = (list: readonly ScreenLabel[], dy: string) => {
        for (const l of list) {
          if (n >= pool.length) return;
          place(pool[n]!, n, l, dy);
          n++;
        }
      };
      put(model.badges, '-135%');
      put(model.labels, '30%');
      put(model.corks, '-160%');
      put(model.rewardLabels, '-150%');
      if (model.aim) put([model.aim], '-170%');
      for (let i = n; i < pool.length; i++) {
        if (shown[i] !== '') {
          pool[i]!.style.display = 'none';
          shown[i] = '';
        }
      }
    },
    dispose() {
      layer.remove();
    },
  };
}
