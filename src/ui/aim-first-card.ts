/**
 * r007 shot card (plan 工程3). Built only from the confirmed ShotSummary: one big moment
 * per shot in the order set → continue from the last cork → several at once → a short line,
 * with the parts, the talk-free ammo facts and every source's real gain on the same card.
 * A shot that touched nothing gets a direction-based hint; nothing is read from the picture.
 */
import type { PartOutcome, SetId, ShotSummary } from '../contracts';

export type CardKind = 'set' | 'continue' | 'multi' | 'line';

export interface AimFirstCardText {
  t(key: string, params?: Readonly<Record<string, string | number>>): string;
  prizeName(typeId: string): string;
  setName(id: SetId): string;
  /** Member kinds of a set, in set order (pictures and names on the card). */
  setMembers?(id: SetId): readonly string[];
}

export interface AimFirstCardInput {
  readonly summary: ShotSummary;
  /** Sets that entered the set book for the first time with this shot. */
  readonly freshSets: readonly SetId[];
  /** Ammo just before the shot was fired. */
  readonly ammoBeforeShot: number;
  /** What the cells, devices and the answer did, already worded (every line, never cut to "N more"). */
  readonly effectLines?: readonly string[];
  /** The settings left for the next shot, worded like the HUD mark ("次の1射: …"); '' when none. */
  readonly nextLine?: string;
}

export interface AimFirstCardModel {
  readonly kind: CardKind;
  /** The big line: "セット完成", "最後の一発から続行", "3個まとめて獲得" or the short line. */
  readonly headline: string;
  readonly sets: readonly { readonly setId: SetId; readonly name: string; readonly points: number; readonly fresh: boolean; readonly members: readonly { readonly typeId: string; readonly name: string }[] }[];
  /** "合計 180点" (sets only). */
  readonly total: string | null;
  /** Real ammo facts: "弾 ＋2（実際に増えた数）", "弾 −1", "補給は上限のため ＋0", "残り 5 発". */
  readonly ammo: readonly string[];
  readonly parts: readonly string[];
  /** Short facts under the headline (what was won / touched / where it went). */
  readonly lines: readonly string[];
  /** Points this shot really added. */
  readonly delta: number;
  /** Same words and mark as next to the ammo. */
  readonly next: string | null;
}

/** One source's real ammo change in this shot (+ granted, − removed) with its words. */
export interface SupplyRow {
  readonly n: number;
  readonly text: string;
}

/** Every ammo source of the shot: cells, gadgets, the answer, the hat and A1-A10, in that order. */
export function supplyRows(s: ShotSummary, tx: AimFirstCardText): SupplyRow[] {
  const { t } = tx;
  const rows: SupplyRow[] = [];
  const row = (who: string, granted: number, requested: number | undefined) => {
    if (granted < 0) rows.push({ n: granted, text: t('af.ammo.rowLost', { who, n: -granted }) });
    else if (requested !== undefined && granted === 0) rows.push({ n: 0, text: t('af.ammo.rowCap', { who }) });
    else if (requested !== undefined && granted < requested) rows.push({ n: granted, text: t('af.ammo.rowPartial', { who, n: granted, req: requested }) });
    else if (granted > 0) rows.push({ n: granted, text: t('af.ammo.row', { who, n: granted }) });
  };
  for (const e of s.effects ?? []) {
    if (e.ammoRequested === undefined && e.ammoDelta === 0) continue;
    const src = t(e.source.kind === 'cell' ? 'fxres.src.cell' : e.source.kind === 'answer' ? 'fxres.src.answer' : e.source.kind === 'device' ? 'fxres.src.device' : 'fxres.src.carry');
    const who = e.effectId ? `${src}「${t(`exp.fx.${e.effectId}.name`)}」` : src;
    row(who, e.ammoDelta, e.ammoRequested);
  }
  for (const p of s.parts ?? []) if (p.effect === 'ammo') row(`${t('af.speaker')}・${t(`af.part.${p.part}`)}`, p.ammoGranted, p.ammoRequested);
  for (const r of s.rewards ?? []) if (r.offered > 0) row(t(`reward.name.${r.id}`), r.granted, r.offered);
  return rows;
}

export function partLines(parts: readonly PartOutcome[], tx: AimFirstCardText): string[] {
  const { t } = tx;
  return parts.map((p) => {
    const name = t(`af.part.${p.part}`);
    if (!p.first) return t('af.part.again', { part: name });
    const head = t('af.part.points', { part: name, p: p.firstPoints });
    let tail = '';
    if (p.effect === 'ammo') tail = p.ammoGranted > 0 ? t('af.part.hat.ammo', { n: p.ammoGranted }) : t('af.part.hat.cap');
    else if (p.effect === 'powerZone') tail = p.powerZoneWidthMult !== null ? t('af.part.feet.zone', { m: p.powerZoneWidthMult }) : t('af.part.feet.lost');
    else if (p.effect === 'setHint') tail = p.hint?.setId ? t('af.part.body.hint', { set: tx.setName(p.hint.setId), names: p.hint.missingTypeIds.map(tx.prizeName).join('・') }) : t('af.part.body.none');
    return tail ? `${head} / ${tail}` : head;
  });
}

export function aimFirstCardModel(input: AimFirstCardInput, tx: AimFirstCardText): AimFirstCardModel {
  const { summary: s } = input;
  const { t } = tx;
  const setPoints = new Map(s.ledger.items.filter((i) => i.kind === 'set').map((i) => [i.refId, i.points]));
  const fresh = new Set(input.freshSets);
  const sets = s.newlyCompletedSets.map((id) => ({
    setId: id,
    name: tx.setName(id),
    points: setPoints.get(id) ?? 0,
    fresh: fresh.has(id),
    members: (tx.setMembers?.(id) ?? []).map((typeId) => ({ typeId, name: tx.prizeName(typeId) })),
  }));
  const delta = s.ledger.scoreAfter - s.ledger.scoreBefore;

  // ammo: total and what is left first, then every source with its real amount and why a +0 happened
  const rows = supplyRows(s, tx);
  const lost = rows.reduce((n, r) => n + Math.max(0, -r.n), 0);
  const ammo: string[] = [];
  if (rows.length > 0 || sets.length > 0) {
    const sum = [s.bonusAmmoGranted > 0 || lost === 0 ? `+${s.bonusAmmoGranted}` : '', lost > 0 ? `−${lost}` : ''].filter(Boolean).join(' ');
    ammo.push(t('af.ammo.total', { sum, n: s.ammoAfter }));
    for (const r of rows) ammo.push(r.text);
  }

  const parts = partLines(s.parts ?? [], tx);
  const lines: string[] = [];
  if (s.chainCount === 1) lines.push(t('af.shot.won', { name: tx.prizeName(s.collected[0]!.typeId) }));
  const f = s.facts;
  if (s.chainCount === 0 && f) {
    const r = f.representative;
    if (!r) lines.push(t(`af.miss.${f.exit ?? 'unknown'}`));
    else if (r.kind === 'prize') lines.push(t('af.fact.prize', { name: tx.prizeName(r.typeId) }));
    else if (r.kind === 'cell' && !r.activated) lines.push(t(f.unusedNeighbour ? 'af.fact.usedCell.near' : 'af.fact.usedCell'));
    else if (r.kind === 'device' && !r.activated) lines.push(t('af.fact.device'));
    else if (r.kind === 'tray') lines.push(t('af.fact.tray'));
    else if (r.kind === 'surface') lines.push(t('af.fact.surface'));
    else if (r.kind === 'hidden') lines.push(t('af.fact.hidden'));
    else if (r.kind === 'shopkeeper' && parts.length === 0) lines.push(t('af.fact.shopkeeper', { part: t(`af.part.${r.part}`) }));
  }
  lines.push(...(input.effectLines ?? []));
  if (delta > 0 && sets.length === 0) lines.push(t('af.shot.points', { p: delta }));

  let kind: CardKind = 'line';
  let headline = '';
  if (sets.length > 0) {
    kind = 'set';
    headline = sets.length > 1 ? t('af.set.many', { n: sets.length }) : t('af.set.ribbon');
  } else if (input.ammoBeforeShot === 1 && !s.runEnded && s.ammoAfter > 0) {
    kind = 'continue';
    headline = t('af.shot.continue', { n: s.ammoAfter });
  } else if (s.chainCount >= 2) {
    kind = 'multi';
    headline = t('af.shot.wonMany', { n: s.chainCount });
  } else {
    headline = lines.shift() ?? parts[0] ?? t('af.miss.unknown');
    if (parts[0] === headline) parts.shift();
  }
  return { kind, headline, sets, total: sets.length > 0 ? t('af.set.total', { score: s.ledger.scoreAfter }) : null, ammo, parts, lines, delta, next: input.nextLine ? input.nextLine : null };
}

/** The card's lines as elements, shared by the in-game card and the result screen (07). */
export function cardBody(doc: Document, m: AimFirstCardModel, t: AimFirstCardText['t'], portrait?: (doc: Document, typeId: string) => HTMLElement): HTMLElement[] {
  const mk = (tag: string, cls: string, text?: string) => {
    const e = doc.createElement(tag);
    e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const parts: HTMLElement[] = [];
  if (m.kind === 'set') {
    parts.push(mk('div', 'af-card-ribbon', m.headline));
    for (const s of m.sets) {
      const row = mk('div', s.fresh ? 'af-card-set af-card-set-fresh' : 'af-card-set');
      row.dataset.set = s.setId;
      if (s.fresh) row.appendChild(mk('span', 'af-card-seal', t('af.set.first')));
      row.append(mk('span', 'af-card-set-name', s.name), mk('span', 'af-card-set-points', t('af.set.points', { p: s.points })));
      if (s.members.length > 0 && portrait) {
        // each member's picture and name, so the set can be read without the book
        const members = mk('div', 'af-card-members');
        for (const m2 of s.members) {
          const tile = mk('span', 'af-card-member');
          tile.append(portrait(doc, m2.typeId), mk('span', 'af-card-member-name', m2.name));
          members.appendChild(tile);
        }
        row.appendChild(members);
      }
      parts.push(row);
    }
    if (m.total) parts.push(mk('div', 'af-card-total', m.total));
  } else {
    parts.push(mk('div', 'af-card-headline', m.headline));
  }
  for (const l of m.lines) parts.push(mk('p', 'af-card-line', l));
  for (const l of m.parts) {
    const p = mk('p', 'af-card-part', l);
    p.dataset.testid = 'shot-card-part';
    parts.push(p);
  }
  if (m.next) {
    const n = mk('p', 'af-card-next', m.next);
    n.dataset.testid = 'shot-card-next';
    parts.push(n);
  }
  if (m.ammo.length > 0) {
    // the total and the corks left first; each source below, readable without closing the card
    const a = mk('p', 'af-card-ammo', m.ammo[0]);
    a.dataset.testid = 'shot-card-ammo';
    parts.push(a);
    if (m.ammo.length > 1) {
      const list = mk('ul', 'af-card-ammo-rows');
      list.dataset.testid = 'shot-card-ammo-rows';
      for (const r of m.ammo.slice(1)) list.appendChild(mk('li', 'af-card-ammo-row', r));
      parts.push(list);
    }
  }
  return parts;
}

export interface AimFirstCardHandle {
  readonly isVisible: boolean;
  show(model: AimFirstCardModel, opts: { readonly quiet: boolean; readonly path?: HTMLElement | null }): void;
  hide(): void;
  destroy(): void;
}

/** Shows for a while; the next shot or a tap hides it. Never blocks the controls. */
export function mountAimFirstCard(root: HTMLElement, t: AimFirstCardText['t'], portrait?: (doc: Document, typeId: string) => HTMLElement): AimFirstCardHandle {
  const doc = root.ownerDocument;
  const win = doc.defaultView!;
  const card = doc.createElement('section');
  card.className = 'af-card';
  card.dataset.testid = 'shot-card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.hidden = true;
  root.appendChild(card);
  let timer: number | null = null;
  const hide = () => {
    card.hidden = true;
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  };
  card.addEventListener('click', hide);
  // reading the card (touching or scrolling it) keeps it until a tap or the next shot
  const hold = () => {
    if (timer !== null) win.clearTimeout(timer);
    timer = null;
  };
  card.addEventListener('pointerdown', hold);
  card.addEventListener('scroll', hold);
  /**
   * T05: the card goes between what is shown at the top (ammo, score, next-shot mark, overview map)
   * and the controls, measured on screen, so it covers none of them at 375×600..402×874. When the
   * gap is too small for a readable card, the map (a guide, not a number) may be covered first.
   */
  const MIN_CARD = 140;
  const bottomOf = (sel: string) => {
    let b = 0;
    for (const e of doc.querySelectorAll<HTMLElement>(sel)) {
      if (e.hidden || e === card || card.contains(e)) continue;
      const r = e.getBoundingClientRect();
      if (r.height > 0 && r.width > 0) b = Math.max(b, r.bottom);
    }
    return b;
  };
  const place = () => {
    const controls = doc.querySelector<HTMLElement>('[data-testid="controls"]');
    const limit = controls && controls.getBoundingClientRect().height > 0 ? controls.getBoundingClientRect().top : win.innerHeight;
    const numbers = bottomOf('[data-testid="hud"] > *');
    const withMap = Math.max(numbers, bottomOf('[data-testid="booth-map"]'));
    const top = Math.ceil((limit - withMap - 12 >= MIN_CARD ? withMap : numbers) + 6);
    card.style.top = `${top}px`;
    // The minimum is for choosing which HUD rows to avoid, not for extending
    // the card into the controls on a short screen. The card can scroll.
    card.style.maxHeight = `${Math.max(0, Math.floor(limit - top - 6))}px`;
  };
  // The controls grow back when aiming resumes after the shot, and the top rows change with the
  // next-shot mark: keep the card in the gap while it is open.
  let watched = false;
  const RO = (win as unknown as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver;
  const observer = RO ? new RO(() => { if (!card.hidden) place(); }) : null;
  const watch = () => {
    if (watched || !observer) return;
    const targets = [...doc.querySelectorAll<HTMLElement>('[data-testid="controls"], [data-testid="hud"], [data-testid="booth-map"]')];
    if (targets.length === 0) return;
    for (const e of targets) observer.observe(e);
    watched = true;
  };
  const onResize = () => { if (!card.hidden) place(); };
  win.addEventListener('resize', onResize);
  return {
    get isVisible() { return !card.hidden; },
    show(m, opts) {
      const parts = cardBody(doc, m, t, portrait);
      card.dataset.kind = m.kind;
      card.dataset.quiet = String(opts.quiet);
      card.replaceChildren(...parts);
      if (opts.path) card.firstElementChild?.after(opts.path);
      card.hidden = false;
      watch();
      place();
      hold();
      // A trajectory or a confirmed challenge stays available for review until dismissal or the next shot.
      if (opts.path) return;
      const rows = m.ammo.length + m.lines.length + m.parts.length + m.sets.length;
      timer = win.setTimeout(hide, (m.kind === 'set' ? 5200 : 3200) + Math.max(0, rows - 3) * 700);
    },
    hide,
    destroy() {
      hide();
      observer?.disconnect();
      win.removeEventListener('resize', onResize);
      card.remove();
    },
  };
}
