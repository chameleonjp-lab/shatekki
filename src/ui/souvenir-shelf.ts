/**
 * E3 souvenir shelf UI (plan T4c; rewards versions only).
 *
 * On a completed result: the kinds won in this game as buttons; with a free slot one tap places
 * it; with a full shelf the player first picks the slot to replace (cancel keeps all three). An
 * abandoned game or a game without prizes adds nothing. Saving goes only through the store's
 * explicit place(); a failure is shown and the player can choose again.
 */
import type { PrizeTypeId } from '../contracts';
import type { PlaceResult, SouvenirShelf, SouvenirStore } from '../persistence/souvenirs';

type Text = (key: string, params?: Readonly<Record<string, string | number>>) => string;

export interface SouvenirInput {
  readonly runId: string;
  readonly completed: boolean;
  /** Distinct kinds won in this game, in order of first win. */
  readonly wonTypeIds: readonly string[];
}

export interface SouvenirModel {
  readonly title: string;
  readonly slots: readonly string[];
  /** Kinds that can still be placed (won here, not already on the shelf). */
  readonly choices: ReadonlyArray<{ readonly typeId: string; readonly name: string }>;
  readonly full: boolean;
  readonly note: string;
}

export function souvenirModel(shelf: SouvenirShelf, input: SouvenirInput, t: Text, name: (typeId: string) => string): SouvenirModel {
  const shown = new Set(shelf.slots.filter((s) => s !== null).map((s) => s!.typeId as string));
  const choices = input.completed ? input.wonTypeIds.filter((k) => !shown.has(k)).map((k) => ({ typeId: k, name: name(k) })) : [];
  const full = shelf.slots.every((s) => s !== null);
  let note = '';
  if (!input.completed || input.wonTypeIds.length === 0) note = t('souvenir.nothing');
  else if (choices.length === 0) note = t('souvenir.allShown');
  else note = full ? t('souvenir.full') : t('souvenir.pick');
  return { title: t('souvenir.title'), slots: shelf.slots.map((s) => (s ? name(s.typeId) : t('souvenir.empty'))), choices, full, note };
}

export interface SouvenirShelfHandle {
  readonly element: HTMLElement;
  dispose(): void;
}

export function mountSouvenirShelf(host: HTMLElement, deps: { readonly store: SouvenirStore; readonly t: Text; readonly name: (typeId: string) => string; readonly onSaved?: () => void }, input: SouvenirInput): SouvenirShelfHandle {
  const doc = host.ownerDocument;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = ''): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  };
  const sec = mk('section', 'sec souvenir');
  sec.dataset.testid = 'souvenir-shelf';
  host.appendChild(sec);
  let replacing: string | null = null;
  let status = '';

  const render = () => {
    const shelf = deps.store.load();
    const m = souvenirModel(shelf, input, deps.t, deps.name);
    const title = mk('h3', 'sec-title', m.title);
    const slots = mk('div', 'chips');
    m.slots.forEach((label, i) => {
      if (replacing !== null) {
        const b = mk('button', 'btn chip-btn', `${i + 1}: ${label}`);
        b.type = 'button';
        b.dataset.slot = String(i);
        b.addEventListener('click', () => save(replacing!, i));
        slots.appendChild(b);
      } else slots.appendChild(mk('span', 'chip', label));
    });
    const note = mk('p', 'note', replacing !== null ? deps.t('souvenir.chooseSlot') : m.note);
    const choices = mk('div', 'chips');
    for (const c of m.choices) {
      const b = mk('button', 'btn chip-btn', c.name);
      b.type = 'button';
      b.dataset.typeId = c.typeId;
      b.addEventListener('click', () => {
        if (m.full) {
          replacing = c.typeId;
          status = '';
          render();
        } else save(c.typeId);
      });
      choices.appendChild(b);
    }
    const parts: HTMLElement[] = [title, slots, note];
    if (replacing === null && m.choices.length > 0) parts.push(choices);
    if (replacing !== null) {
      const cancel = mk('button', 'btn', deps.t('souvenir.cancel'));
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        replacing = null;
        render();
      });
      parts.push(cancel);
    }
    if (status) parts.push(mk('p', 'note', status));
    sec.replaceChildren(...parts);
  };

  const save = (typeId: string, slot?: number) => {
    const r: PlaceResult = deps.store.place({ runId: input.runId, wonTypeIds: input.wonTypeIds, typeId: typeId as PrizeTypeId, ...(slot !== undefined ? { slot } : {}) });
    replacing = null;
    status = r.ok ? (r.changed ? deps.t('souvenir.saved') : '') : r.reason === 'saveFailed' ? deps.t('souvenir.saveFailed') : '';
    if (r.ok && r.changed) deps.onSaved?.();
    render();
  };

  render();
  return { element: sec, dispose: () => sec.remove() };
}
