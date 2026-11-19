/**
 * r007 "店主と話す" panel (plan 工程4c). Opening and closing never use the right: only a
 * choice whose save succeeded does. The panel itself is temporary screen state; the
 * choice and its result come back from the rules/save as `TalkOutcome`.
 */
import type { AimFirstViewState, TalkChoice, TalkOutcome } from '../contracts';

export interface TalkPanelDeps {
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
  /** Resolves true when the rules accepted the choice and its save succeeded. */
  choose(choice: TalkChoice): Promise<boolean> | boolean;
  /** Text of the saved result (hint names or the corks received). */
  describe(outcome: TalkOutcome): string;
  onOpenChange?(open: boolean): void;
}

export interface TalkPanelHandle {
  open(talk: AimFirstViewState['talk']): void;
  /** Refresh the reasons while open (e.g. after a save); closes itself when the right is gone. */
  update(talk: AimFirstViewState['talk'] | undefined): void;
  close(): void;
  readonly isOpen: boolean;
  destroy(): void;
}

export function mountTalkPanel(root: HTMLElement, deps: TalkPanelDeps): TalkPanelHandle {
  const doc = root.ownerDocument;
  const t = deps.t;
  const backdrop = doc.createElement('div');
  backdrop.className = 'af-talk-backdrop';
  backdrop.dataset.testid = 'talk-panel';
  backdrop.hidden = true;
  const card = doc.createElement('section');
  card.className = 'af-talk';
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  const title = doc.createElement('h2');
  title.className = 'af-talk-title';
  title.textContent = t('af.talk.title');
  card.setAttribute('aria-label', title.textContent);
  const lead = doc.createElement('p');
  lead.className = 'af-talk-lead';
  lead.textContent = t('af.talk.lead');
  const choice = (key: 'hint' | 'ammo') => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'af-talk-choice';
    b.dataset.testid = `talk-${key}`;
    const name = doc.createElement('span');
    name.className = 'af-talk-name';
    const note = doc.createElement('span');
    note.className = 'af-talk-note';
    const why = doc.createElement('span');
    why.className = 'af-talk-why';
    why.dataset.testid = `talk-${key}-why`;
    b.append(name, note, why);
    return { b, name, note, why };
  };
  const hint = choice('hint');
  const ammo = choice('ammo');
  const result = doc.createElement('p');
  result.className = 'af-talk-result';
  result.dataset.testid = 'talk-result';
  result.hidden = true;
  const close = doc.createElement('button');
  close.type = 'button';
  close.className = 'btn af-talk-close';
  close.dataset.testid = 'talk-close';
  close.textContent = t('af.talk.close');
  card.append(title, lead, hint.b, ammo.b, result, close);
  backdrop.appendChild(card);
  root.appendChild(backdrop);

  let open = false;
  let busy = false;
  let shown: TalkOutcome | null = null;
  let current: AimFirstViewState['talk'] | null = null;

  const render = () => {
    const tk = current;
    hint.name.textContent = t('af.talk.hint');
    hint.note.textContent = t('af.talk.hint.note');
    hint.why.textContent = '';
    ammo.name.textContent = t('af.talk.ammo');
    ammo.note.textContent = t('af.talk.ammo.note', { n: Math.max(1, tk?.ammoOffer ?? 1), m: tk?.powerZoneWidthMult ?? 0.85 });
    const ammoWhy = tk?.ammoBlocked ? t(tk.ammoBlocked === 'ammoCap' ? 'af.talk.ammo.cap' : 'af.talk.ammo.reserved') : '';
    ammo.why.textContent = ammoWhy;
    const blocked = !tk || tk.blocked !== null || tk.used !== null;
    hint.b.disabled = blocked || busy;
    ammo.b.disabled = blocked || busy || tk!.ammoBlocked !== null;
    ammo.b.setAttribute('aria-describedby', '');
    close.disabled = busy;
    if (shown) {
      result.hidden = false;
      result.textContent = deps.describe(shown);
      hint.b.hidden = ammo.b.hidden = true;
      lead.hidden = true;
    } else {
      result.hidden = true;
      hint.b.hidden = ammo.b.hidden = false;
      lead.hidden = false;
    }
  };

  const setOpen = (v: boolean) => {
    open = v;
    backdrop.hidden = !v;
    deps.onOpenChange?.(v);
  };

  const pick = async (c: TalkChoice) => {
    if (busy || !open) return;
    busy = true;
    render();
    let ok = false;
    try {
      ok = await deps.choose(c);
    } finally {
      busy = false;
    }
    // The shown result is the saved one, read back from the state (never from this click).
    if (ok && current?.used) shown = current.used;
    render();
  };
  hint.b.addEventListener('click', () => void pick('hint'));
  ammo.b.addEventListener('click', () => void pick('ammo'));
  close.addEventListener('click', () => {
    if (!busy) handle.close();
  });

  const handle: TalkPanelHandle = {
    open(talk) {
      if (open || talk.blocked !== null || talk.used !== null) return;
      current = talk;
      shown = null;
      setOpen(true);
      render();
      hint.b.focus?.();
    },
    update(talk) {
      if (!open) return;
      current = talk ?? null;
      if (current?.used && !shown) shown = current.used;
      render();
    },
    close() {
      if (!open) return;
      shown = null;
      setOpen(false);
    },
    get isOpen() {
      return open;
    },
    destroy() {
      backdrop.remove();
    },
  };
  return handle;
}
