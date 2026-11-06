/**
 * A very small DOM stand-in for UI tests that run in Node (the repo has no
 * jsdom/happy-dom). It supports only what src/ui panels use: createElement,
 * className/dataset/attributes, textContent, append, listeners, hidden/disabled.
 * Not a test file.
 */
type Listener = (e: any) => void;

export class FakeEvent {
  defaultPrevented = false;
  stopped = false;
  constructor(
    readonly type: string,
    init: Record<string, unknown> = {},
  ) {
    Object.assign(this, init);
  }
  preventDefault(): void {
    this.defaultPrevented = true;
  }
  stopPropagation(): void {
    this.stopped = true;
  }
}

export class FakeElement {
  className = '';
  id = '';
  type = '';
  hidden = false;
  disabled = false;
  tabIndex = 0;
  scrollTop = 0;
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> & { setProperty(k: string, v: string): void } = Object.assign({} as Record<string, string>, {
    setProperty(this: Record<string, string>, k: string, v: string) {
      this[k] = v;
    },
  });
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  focused = false;
  private text = '';
  private readonly listeners = new Map<string, Set<Listener>>();
  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument,
  ) {}

  get textContent(): string {
    return this.children.length > 0 ? this.children.map((c) => c.textContent).join('') : this.text;
  }
  set textContent(v: string) {
    this.children.length = 0;
    this.text = v;
  }
  append(...nodes: FakeElement[]): void {
    for (const n of nodes) this.appendChild(n);
  }
  appendChild(n: FakeElement): FakeElement {
    n.parent = this;
    this.children.push(n);
    return n;
  }
  replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.append(...nodes);
  }
  remove(): void {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute(k: string, v: string): void {
    this.attributes.set(k, v);
  }
  getAttribute(k: string): string | null {
    return this.attributes.get(k) ?? null;
  }
  focus(): void {
    this.focused = true;
  }
  addEventListener(type: string, fn: Listener): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(fn);
  }
  removeEventListener(type: string, fn: Listener): void {
    this.listeners.get(type)?.delete(fn);
  }
  /** Dispatches like a browser would for a real user: nothing fires on a disabled button. */
  dispatch(type: string, init: Record<string, unknown> = {}): FakeEvent {
    const e = new FakeEvent(type, init);
    if (this.disabled && (type === 'click' || type.startsWith('pointer'))) return e;
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn(e);
    if (!e.stopped) this.parent?.bubble(e);
    return e;
  }
  private bubble(e: FakeEvent): void {
    for (const fn of [...(this.listeners.get(e.type) ?? [])]) fn(e);
    if (!e.stopped) this.parent?.bubble(e);
  }
  find(pred: (e: FakeElement) => boolean): FakeElement | null {
    if (pred(this)) return this;
    for (const c of this.children) {
      const f = c.find(pred);
      if (f) return f;
    }
    return null;
  }
  byTestId(id: string): FakeElement {
    const f = this.find((e) => e.dataset.testid === id);
    if (!f) throw new Error(`no element with data-testid=${id}`);
    return f;
  }
  all(pred: (e: FakeElement) => boolean, out: FakeElement[] = []): FakeElement[] {
    if (pred(this)) out.push(this);
    for (const c of this.children) c.all(pred, out);
    return out;
  }
}

export class FakeDocument {
  createElement(tag: string): FakeElement {
    return new FakeElement(tag, this);
  }
}

export function fakeRoot(): FakeElement {
  return new FakeDocument().createElement('div');
}

/** A real pointer tap on a button: down then up with the same pointer id (a click follows in browsers). */
export function tap(el: FakeElement, pointerId = 1): void {
  el.dispatch('pointerdown', { pointerId });
  el.dispatch('pointerup', { pointerId });
  el.dispatch('click', { detail: 1 });
}
