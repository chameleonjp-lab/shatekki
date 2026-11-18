import { expect, it, vi } from 'vitest';
import { createDomHud } from '../../src/view/hud';
import { fakeRoot } from './fake-dom';

it('keeps a new edge label visible for its own lifetime when the three arrows are reused', () => {
  vi.useFakeTimers();
  const host = fakeRoot();
  const canvas = host.ownerDocument.createElement('canvas');
  host.append(canvas);
  Object.assign(canvas, { parentElement: host });
  const hud = createDomHud(canvas as unknown as HTMLElement, { translate: () => 'Hintergrundfeld' })!;
  try {
    const layer = host.children[1]!;
    Object.assign(layer, { clientWidth: 375, clientHeight: 600 });
    for (const el of layer.children) {
      Object.assign(el, { getBoundingClientRect: () => ({ width: 132.75, height: 18 }) });
    }
    const cue = { key: 'fx.offscreen.cell', x: 347, y: 120, angle: 0 };
    hud.offscreen(cue);
    expect(layer.children[0]!.style.transform).toBe('translate(242.25px, 111px)');
    vi.advanceTimersByTime(1250);
    hud.offscreen(cue);
    hud.offscreen(cue);
    hud.offscreen(cue);
    vi.advanceTimersByTime(400);
    expect(layer.children[0]!.style.display).toBe('flex');
    vi.advanceTimersByTime(1200);
    expect(layer.children[0]!.style.display).toBe('none');
  } finally {
    hud.dispose();
    vi.useRealTimers();
  }
});
