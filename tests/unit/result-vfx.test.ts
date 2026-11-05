import { describe, expect, it } from 'vitest';
import { playResultCelebration } from '../../src/view/result-vfx';

// Minimal DOM double: the helper only needs createElement / append / remove / style.
class FakeEl {
  style: Record<string, string> & { cssText: string } = { cssText: '' } as never;
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  attrs: Record<string, string> = {};
  textContent = '';
  constructor(public tag: string) {}
  append(...c: FakeEl[]) {
    for (const x of c) this.appendChild(x);
  }
  appendChild(c: FakeEl) {
    c.parent = this;
    this.children.push(c);
    return c;
  }
  setAttribute(k: string, v: string) {
    this.attrs[k] = v;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this);
    this.parent = null;
  }
  count(): number {
    return 1 + this.children.reduce((a, c) => a + c.count(), 0);
  }
  animated(): number {
    let n = /animation/.test(this.style.cssText) ? 1 : 0;
    for (const c of this.children) n += c.animated();
    return n;
  }
}
function container() {
  const el = new FakeEl('div');
  (el as unknown as { ownerDocument: unknown }).ownerDocument = { createElement: (t: string) => new FakeEl(t) };
  return el;
}

describe('playResultCelebration', () => {
  it('adds a decorative non-interactive layer and removes it on cleanup', () => {
    const c = container();
    const stop = playResultCelebration(c as unknown as HTMLElement, { newBest: false, sets: 0, reducedMotion: false });
    expect(c.children.length).toBe(1);
    expect(c.children[0]!.style.cssText).toContain('pointer-events:none');
    expect(c.children[0]!.attrs['aria-hidden']).toBe('true');
    stop();
    expect(c.children.length).toBe(0);
    expect(() => stop()).not.toThrow();
  });

  it('does more for a new best with completed sets than for a plain result', () => {
    const a = container();
    playResultCelebration(a as unknown as HTMLElement, { newBest: false, sets: 0, reducedMotion: false });
    const b = container();
    playResultCelebration(b as unknown as HTMLElement, { newBest: true, sets: 3, reducedMotion: false });
    expect(b.count()).toBeGreaterThan(a.count());
  });

  it('with reduced motion nothing is animated', () => {
    const c = container();
    playResultCelebration(c as unknown as HTMLElement, { newBest: true, sets: 3, reducedMotion: true });
    expect(c.animated()).toBe(0);
    const d = container();
    playResultCelebration(d as unknown as HTMLElement, { newBest: true, sets: 3, reducedMotion: false });
    expect(d.animated()).toBeGreaterThan(0);
  });

  it('survives a container without a document', () => {
    expect(() => playResultCelebration({} as HTMLElement, { newBest: true, sets: 1, reducedMotion: false })()).not.toThrow();
  });
});
