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
  readonly prototypeHints?: boolean;
}

export interface SetBookEntryView {
  readonly setId: string;
  readonly discovered: boolean;
  readonly completedThisRun: boolean;
  readonly title: string;
  readonly hint: string | null;
  readonly hintIsPrototype: boolean;
  readonly required: ReadonlyArray<{ typeId: string; name: string }> | null;
  /** How many kinds the set needs (always shown, names stay hidden until discovered). */
  readonly kinds: number;
  readonly kindsText: string;
}

/** Kind-count filter of the expanded book: all sets, or only those that need 2 / 3 kinds. */
export type SetBookFilter = 'all' | 2 | 3;

export interface SetBookFilterView {
  readonly id: SetBookFilter;
  readonly label: string;
  readonly count: number;
}

/** Optional text source for sets the rules-v1 content tables do not know (PAIR001..: `exp.pair.<id>.name|hint`). */
export type SetBookExpandedText = (key: string) => string;

export interface SetBookViewOptions {
  readonly filter?: SetBookFilter;
  readonly expandedText?: SetBookExpandedText;
}

export interface SetBookViewModel {
  readonly title: string;
  readonly progressText: string;
  readonly hintLabel: string;
  readonly requiresLabel: string;
  readonly thisRunLabel: string;
  readonly prototypeHintLabel: string;
  readonly closeLabel: string;
  /** Empty (no filter shown) unless the catalog mixes sets of different kind counts. */
  readonly filters: readonly SetBookFilterView[];
  readonly filter: SetBookFilter;
  readonly entries: readonly SetBookEntryView[];
}

/** Adapt the runtime catalog (owned by src/catalog) to the book's input. */
export function setBookEntriesFromCatalog(catalog: RuntimeCatalog): SetBookEntryInput[] {
  return [...catalog.sets.values()].map((s) => ({ setId: String(s.setId), requiredTypeIds: s.requiredTypeIds.map(String) }));
}

export function setBookViewModel(input: SetBookInput, locale: Locale, options: SetBookViewOptions = {}): SetBookViewModel {
  const found = new Set<string>(input.discovered);
  const run = new Set<string>(input.completedThisRun);
  const sorted = [...input.sets].sort((a, b) => (a.setId < b.setId ? -1 : a.setId > b.setId ? 1 : 0));
  const all = sorted.map<SetBookEntryView>((s) => {
    const discovered = found.has(s.setId);
    const isPair = s.setId.startsWith('PAIR');
    const pairText = (part: 'name' | 'hint'): string => (isPair ? (options.expandedText?.(`exp.pair.${s.setId}.${part}`) ?? '') : '');
    const name = isPair ? pairText('name') : setName(locale, s.setId);
    const hint = isPair ? pairText('hint') : setHint(locale, s.setId);
    return {
      setId: s.setId,
      discovered,
      completedThisRun: run.has(s.setId),
      title: discovered && name !== '' ? name : translate(locale, 'setbook.undiscovered'),
      hint: discovered || hint === '' ? null : hint,
      hintIsPrototype: input.prototypeHints ?? HINT_IS_PROTOTYPE,
      required: discovered ? s.requiredTypeIds.map((id) => ({ typeId: id, name: prizeName(locale, id) })) : null,
      kinds: s.requiredTypeIds.length,
      kindsText: translate(locale, 'setbook.kinds', { n: s.requiredTypeIds.length }),
    };
  });
  const mixed = all.some((e) => e.kinds === 2) && all.some((e) => e.kinds === 3);
  const filter: SetBookFilter = mixed ? (options.filter ?? 'all') : 'all';
  const entries = filter === 'all' ? all : all.filter((e) => e.kinds === filter);
  const filters: SetBookFilterView[] = mixed
    ? [
        { id: 'all', label: translate(locale, 'setbook.filter.all'), count: all.length },
        { id: 2, label: translate(locale, 'setbook.filter.pair'), count: all.filter((e) => e.kinds === 2).length },
        { id: 3, label: translate(locale, 'setbook.filter.triple'), count: all.filter((e) => e.kinds === 3).length },
      ]
    : [];
  return {
    title: translate(locale, 'setbook.title'),
    progressText: translate(locale, 'setbook.progress', { found: entries.filter((e) => e.discovered).length, total: entries.length }),
    hintLabel: translate(locale, 'setbook.hint'),
    requiresLabel: translate(locale, 'setbook.requires'),
    thisRunLabel: translate(locale, 'setbook.thisRun'),
    prototypeHintLabel: translate(locale, 'setbook.hint.prototype'),
    closeLabel: translate(locale, 'setbook.close'),
    filters,
    filter,
    entries,
  };
}

export interface SetBookDeps {
  readonly i18n: I18n;
  readonly onClose: () => void;
  /** Expanded bundle only: resolves `exp.pair.<id>.name|hint` for PAIR sets. */
  readonly expandedText?: SetBookExpandedText;
}

export function mountSetBook(root: HTMLElement, deps: SetBookDeps, initial: SetBookInput): ScreenHandle<SetBookInput> {
  let input = initial;
  let filter: SetBookFilter = 'all';
  const title = el('h2', { class: 'ov-title' });
  const progress = el('p', { class: 'note' });
  const filterBar = el('div', { class: 'book-filters', attrs: { role: 'group', 'data-testid': 'setbook-filters' } });
  const list = el('ul', { class: 'book-list' });
  const close = el('button', { class: 'btn primary', attrs: { type: 'button' } });
  const scr = el('div', { class: 'scr scr-book' }, [el('main', { class: 'scr-col' }, [title, progress, filterBar, list, close])]);
  root.appendChild(scr);

  function refresh(): void {
    const vm = setBookViewModel(input, deps.i18n.locale, { filter, ...(deps.expandedText ? { expandedText: deps.expandedText } : {}) });
    filter = vm.filter;
    filterBar.hidden = vm.filters.length === 0;
    replaceChildren(
      filterBar,
      vm.filters.map((f) => {
        const b = el('button', { class: f.id === vm.filter ? 'btn chip-btn on' : 'btn chip-btn', text: `${f.label} (${f.count})`, attrs: { type: 'button', 'data-filter': String(f.id), 'aria-pressed': f.id === vm.filter ? 'true' : 'false' } });
        b.addEventListener('click', () => {
          filter = f.id;
          refresh();
        });
        return b;
      }),
    );
    setText(title, vm.title);
    setText(progress, vm.progressText);
    setText(close, vm.closeLabel);
    replaceChildren(
      list,
      vm.entries.map((e) => {
        const kids: Node[] = [el('div', { class: 'book-title', text: e.title }), el('span', { class: 'note', text: e.kindsText })];
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
