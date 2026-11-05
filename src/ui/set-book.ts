/**
 * Set book (図鑑, Task 14). 100 sets. Undiscovered: the name and the required
 * prizes stay hidden and a hint is shown (decision 15). Discovered: name plus
 * the three required prizes. "Discovered in the book" (persisted across plays,
 * owned by src/persistence) is kept strictly apart from "completed in this
 * run": a set completed this run but not yet recorded in the book is flagged
 * but never reveals its name here.
 */
import type { RuntimeCatalog } from '../contracts';
import { translate, type I18n, type Locale } from '../i18n';
import { HINT_IS_PROTOTYPE, prizeName, setHint, setName } from '../i18n/content';
import { el, replaceChildren, setText, type ScreenHandle } from './dom';
import './screens.css';

export interface SetBookEntryInput {
  readonly setId: string;
  readonly requiredTypeIds: readonly string[];
}

export interface SetBookInput {
  readonly sets: readonly SetBookEntryInput[];
  /** Persisted discovery record (all plays). */
  readonly discovered: ReadonlySet<string> | readonly string[];
  /** Sets completed in the current/last run only. */
  readonly completedThisRun: readonly string[];
}

export interface SetBookEntryView {
  readonly setId: string;
  readonly discovered: boolean;
  readonly completedThisRun: boolean;
  readonly title: string;
  readonly hint: string | null;
  readonly hintIsPrototype: boolean;
  readonly required: ReadonlyArray<{ typeId: string; name: string }> | null;
}

export interface SetBookViewModel {
  readonly title: string;
  readonly progressText: string;
  readonly hintLabel: string;
  readonly requiresLabel: string;
  readonly thisRunLabel: string;
  readonly prototypeHintLabel: string;
  readonly closeLabel: string;
  readonly entries: readonly SetBookEntryView[];
}

/** Adapt the runtime catalog (owned by src/catalog) to the book's input. */
export function setBookEntriesFromCatalog(catalog: RuntimeCatalog): SetBookEntryInput[] {
  return [...catalog.sets.values()].map((s) => ({ setId: String(s.setId), requiredTypeIds: s.requiredTypeIds.map(String) }));
}

export function setBookViewModel(input: SetBookInput, locale: Locale): SetBookViewModel {
  const found = new Set<string>(input.discovered);
  const run = new Set<string>(input.completedThisRun);
  const sorted = [...input.sets].sort((a, b) => (a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0));
  const entries = sorted.map<SetBookEntryView>((s) => {
    const discovered = found.has(s.setId);
    return {
      setId: s.setId,
      discovered,
      completedThisRun: run.has(s.setId),
      title: discovered ? setName(locale, s.setId) : translate(locale, 'setbook.undiscovered'),
      hint: discovered ? null : setHint(locale, s.setId),
      hintIsPrototype: HINT_IS_PROTOTYPE,
      required: discovered ? s.requiredTypeIds.map((id) => ({ typeId: id, name: prizeName(locale, id) })) : null,
    };
  });
  return {
    title: translate(locale, 'setbook.title'),
    progressText: translate(locale, 'setbook.progress', { found: entries.filter((e) => e.discovered).length, total: entries.length }),
    hintLabel: translate(locale, 'setbook.hint'),
    requiresLabel: translate(locale, 'setbook.requires'),
    thisRunLabel: translate(locale, 'setbook.thisRun'),
    prototypeHintLabel: translate(locale, 'setbook.hint.prototype'),
    closeLabel: translate(locale, 'setbook.close'),
    entries,
  };
}

export interface SetBookDeps {
  readonly i18n: I18n;
  readonly onClose: () => void;
}

export function mountSetBook(root: HTMLElement, deps: SetBookDeps, initial: SetBookInput): ScreenHandle<SetBookInput> {
  let input = initial;
  const title = el('h2', { class: 'ov-title' });
  const progress = el('p', { class: 'note' });
  const list = el('ul', { class: 'book-list' });
  const close = el('button', { class: 'btn primary', attrs: { type: 'button' } });
  const scr = el('div', { class: 'scr scr-book' }, [el('main', { class: 'scr-col' }, [title, progress, list, close])]);
  root.appendChild(scr);

  function refresh(): void {
    const vm = setBookViewModel(input, deps.i18n.locale);
    setText(title, vm.title);
    setText(progress, vm.progressText);
    setText(close, vm.closeLabel);
    replaceChildren(
      list,
      vm.entries.map((e) => {
        const kids: Node[] = [el('div', { class: 'book-title', text: e.title })];
        if (e.completedThisRun) kids.push(el('span', { class: 'badge', text: vm.thisRunLabel }));
        if (e.hint !== null) kids.push(el('p', { class: 'note' }, [el('b', { text: `${vm.hintLabel}: ` }), el('span', { text: e.hint }), el('i', { class: 'dim', text: e.hintIsPrototype ? ` ${vm.prototypeHintLabel}` : '' })]));
        if (e.required) kids.push(el('div', { class: 'chips' }, e.required.map((r) => el('span', { class: 'chip', text: r.name }))));
        return el('li', { class: e.discovered ? 'book-item found' : 'book-item', attrs: { 'data-set-id': e.setId } }, kids);
      }),
    );
  }
  close.addEventListener('click', () => deps.onClose());
  const unsub = deps.i18n.subscribe(refresh);
  refresh();
  return {
    update(patch) {
      input = { ...input, ...patch };
      refresh();
    },
    dispose() {
      unsub();
      scr.remove();
    },
  };
}
