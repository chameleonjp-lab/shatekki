/**
 * Tiny DOM helpers. Text is only ever set through textContent / attributes:
 * names and any other data are never interpreted as HTML.
 */
export interface ElProps {
  readonly class?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, children: readonly Node[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (props.class) e.className = props.class;
  if (props.text !== undefined) e.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) e.setAttribute(k, v);
  for (const c of children) e.appendChild(c);
  return e;
}

export function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function setHidden(node: HTMLElement, hidden: boolean): void {
  node.hidden = hidden;
}

/** Replace all children of `parent` with `children`. */
export function replaceChildren(parent: HTMLElement, children: readonly Node[]): void {
  parent.replaceChildren(...children);
}

export interface ScreenHandle<I> {
  update(patch: Partial<I>): void;
  dispose(): void;
}
