/**
 * Reward panel (plan T3/T4, UI; expanded builds with rewards only).
 *
 * Three parts in one column under the overview map, clear of the aim and fire controls:
 *  - the order card (A9 = E2) before the first shot, with accept / decline;
 *  - a progress strip (prizes in the bag, next stamp, lanterns, piggy bank, order shots left);
 *  - one card per settled shot: what each reward really gave, and at most ONE big moment,
 *    chosen in the plan's order: first set discovery > continuing from the last cork > several
 *    prizes at once (P1-P3). Everything else stays readable on the card, also without sound or
 *    motion.
 *
 * Pure model + a small DOM mount. Text comes only from the injected translator; nothing here
 * changes the run (the order buttons go through the normal command path).
 */
import { mintId, type CollectedPrize, type RewardId, type RewardOutcome, type RewardViewState, type SetId } from '../contracts';
import './expanded.css';
import { prizePortrait } from '../view/prize-portrait';

type Params = Readonly<Record<string, string | number>>;
export type RewardText = (key: string, params?: Params) => string;

/** How long the per-shot card stays (ms); a tap dismisses it earlier. */
export const REWARD_CARD_SHOW_MS = 5000;

// --------------------------------------------------------------- moments

export type ShotMomentKind = 'setFirst' | 'continue' | 'multiTake';

export interface ShotMomentInput {
  /** Prizes confirmed won in the shot. */
  readonly collected: number;
  /** Sets completed in the shot (this game). */
  readonly completedSets: readonly SetId[];
  /** Of those, the ones that entered the device's set book for the first time. */
  readonly freshSets: readonly SetId[];
  /** The shot was fired with the last cork (1 before firing). */
  readonly firedWithLastCork: boolean;
  readonly ammoAfter: number;
  readonly runEnded: boolean;
  readonly rewards: readonly RewardOutcome[];
}

export interface ShotMoment {
  /** The one big moment of the shot, or null. */
  readonly big: ShotMomentKind | null;
  /** Fired with the last cork, nothing could be added and the game ends: a calm card with the reason. */
  readonly capped: boolean;
}

/** P1-P3 priority: first set discovery > continuing from the last cork > several prizes at once. */
export function shotMoment(i: ShotMomentInput): ShotMoment {
  const capped = i.firedWithLastCork && i.runEnded && i.rewards.some((r) => r.offered > 0 && r.granted < r.offered);
  if (i.freshSets.length > 0) return { big: 'setFirst', capped };
  if (i.firedWithLastCork && !i.runEnded && i.ammoAfter > 0) return { big: 'continue', capped };
  if (i.collected >= 2) return { big: 'multiTake', capped };
  return { big: null, capped };
}

/** The one cue a shot plays for its moment (never stacked with the per-reward lines). */
export function momentCue(m: ShotMoment, collected: number): { readonly cue: 'setDiscovered' | 'lastShotContinue' | 'takeTier'; readonly count?: number } | null {
  switch (m.big) {
    case 'setFirst':
      return { cue: 'setDiscovered' };
    case 'continue':
      return { cue: 'lastShotContinue' };
    case 'multiTake':
      return { cue: 'takeTier', count: collected };
    default:
      return collected === 1 ? { cue: 'takeTier', count: 1 } : null;
  }
}

// ------------------------------------------------------------------ model

export interface RewardLine {
  readonly id: RewardId;
  readonly name: string;
  readonly text: string;
  readonly granted: number;
}

export interface RewardCardModel {
  readonly title: string;
  /** The big moment's headline ('' when none). */
  readonly headline: string;
  readonly big: ShotMomentKind | null;
  /** P2: set names, the first-time ones marked. */
  readonly sets: ReadonlyArray<{ readonly setId: SetId; readonly name: string; readonly fresh: boolean; readonly members: readonly string[] }>;
  readonly lines: readonly RewardLine[];
  /** Calm reason when the last cork could not be refilled. */
  readonly calm: string | null;
  readonly any: boolean;
}

export interface RewardCardInput extends ShotMomentInput {
  /** The kind at collection, including a change made during the shot. */
  readonly collectedPrizes?: readonly CollectedPrize[];
  readonly setMembers?: (id: SetId) => readonly string[];
  readonly staticCard?: boolean;
  readonly setName: (id: SetId) => string;
}

/** The same confirmed set, member artwork and first-discovery stamp on the slip and result. */
export function renderRewardSet(doc: Document, set: RewardCardModel['sets'][number], prizeName: (id: string) => string, discoveryLabel: string): HTMLElement {
  const row = doc.createElement('div');
  row.className = set.fresh ? 'rwd-set rwd-set-fresh' : 'rwd-set';
  row.dataset.set = set.setId;
  if (set.fresh) {
    const seal = doc.createElement('span');
    seal.className = 'rwd-seal';
    seal.textContent = discoveryLabel;
    row.appendChild(seal);
  }
  const title = doc.createElement('span');
  title.className = 'rwd-set-name';
  title.textContent = set.name;
  row.appendChild(title);
  if (set.members.length > 0) {
    const members = doc.createElement('div');
    members.className = 'rwd-members';
    for (const id of set.members) {
      const tile = doc.createElement('span');
      tile.className = 'rwd-member';
      const name = doc.createElement('span');
      name.className = 'rwd-prize-name';
      name.textContent = prizeName(id);
      tile.append(prizePortrait(doc, id), name);
      members.appendChild(tile);
    }
    row.appendChild(members);
  }
  return row;
}

interface RewardDetails {
  readonly collected: readonly CollectedPrize[];
  readonly prizeName?: (typeId: string) => string;
}

export function rewardLine(o: RewardOutcome, t: RewardText, details?: RewardDetails): RewardLine {
  let name = t(`reward.name.${o.id}`);
  if (details && o.id === 'A5' && (o.key === 'target:center' || o.key === 'target:outer')) {
    const hit = t(o.key === 'target:center' ? 'reward.target.hitCenter' : 'reward.target.hitOuter');
    name = `${name} · ${hit}`;
  }
  if (details?.prizeName && o.id === 'A3') {
    const shot = mintId.shot(o.shotNumber);
    const prize = details.collected.find(p => p.shotId === shot && o.key === `seesaw:${p.instanceId}`);
    if (prize) name = `${name} · ${details.prizeName(prize.typeId)}`;
  }
  let text: string;
  if (o.granted <= 0) text = t('reward.capped');
  else if (o.granted < o.offered) text = t('reward.partial', { n: o.granted, req: o.offered });
  else text = t('reward.granted', { n: o.granted });
  return { id: o.id, name, text, granted: o.granted };
}

export function rewardCardModel(i: RewardCardInput, t: RewardText, prizeName?: (typeId: string) => string): RewardCardModel {
  const m = shotMoment(i);
  const fresh = new Set<string>(i.freshSets);
  let headline = '';
  if (m.big === 'setFirst') headline = i.completedSets.length > 1 ? t('reward.set.many', { n: i.completedSets.length }) : t('reward.set.first');
  else if (m.big === 'continue') headline = t('reward.continue', { n: i.ammoAfter });
  else if (m.big === 'multiTake') headline = t('reward.take.many', { n: i.collected });
  const sets = i.completedSets.map((id) => ({ setId: id, name: i.setName(id), fresh: fresh.has(id), members: i.setMembers?.(id) ?? [] }));
  const details = i.collectedPrizes || i.setMembers ? { collected: i.collectedPrizes ?? [], prizeName } : undefined;
  const lines = i.rewards.map(o => rewardLine(o, t, details));
  const calm = m.capped ? t('reward.continue.none') : null;
  return { title: t('reward.card.title'), headline, big: m.big, sets, lines, calm, any: headline !== '' || lines.length > 0 || sets.length > 0 || calm !== null };
}

export interface RewardStripModel {
  readonly chips: ReadonlyArray<{ readonly id: string; readonly text: string }>;
}

export function rewardStripModel(v: RewardViewState, t: RewardText, prizeName: (typeId: string) => string): RewardStripModel {
  const on = (id: RewardId) => v.enabled.includes(id);
  const chips: { id: string; text: string }[] = [{ id: 'bag', text: t('reward.strip.bag', { n: v.prizesWon }) }];
  if (on('A6') && v.nextStamp !== null) chips.push({ id: 'stamp', text: t('reward.strip.stamp', { n: Math.max(0, v.nextStamp - v.prizesWon) }) });
  if (on('A10')) chips.push({ id: 'lanterns', text: t('reward.strip.lanterns', { lit: v.lanternsLit.length, total: v.lanternZones }) });
  if (on('A4')) chips.push({ id: 'piggy', text: t('reward.strip.piggy', { n: v.piggyDeposits }) });
  // P4: a reservation for the next shot is marked next to the corks.
  if (v.nextReserved) chips.push({ id: 'next', text: t('reward.strip.next') });
  if (on('A9') && v.order) {
    const name = prizeName(v.order.typeId);
    if (v.order.status === 'accepted') chips.push({ id: 'order', text: t('reward.strip.order', { name, left: v.orderShotsLeft ?? 0 }) });
    else if (v.order.status === 'done') chips.push({ id: 'order', text: t('reward.strip.orderDone') });
    else if (v.order.status === 'expired') chips.push({ id: 'order', text: t('reward.strip.orderExpired') });
  }
  return { chips };
}

export interface OrderCardModel {
  readonly title: string;
  readonly body: string;
  readonly accept: string;
  readonly decline: string;
}

/** A9: shown only while the order is offered (before the first shot). */
export function orderCardModel(v: RewardViewState | undefined, shots: number, amount: number, t: RewardText, prizeName: (typeId: string) => string): OrderCardModel | null {
  if (!v || !v.enabled.includes('A9') || v.order?.status !== 'offered') return null;
  return {
    title: t('order.title'),
    body: t('order.body', { name: prizeName(v.order.typeId), shots, n: amount }),
    accept: t('order.accept'),
    decline: t('order.decline'),
  };
}

// ------------------------------------------------------------------ mount

export interface RewardPanelDeps {
  readonly t: RewardText;
  readonly prizeName: (typeId: string) => string;
  /** Goes through the controller; returns true when the rules accepted it. */
  readonly onOrder: (accept: boolean) => boolean | Promise<boolean>;
  readonly setTimeout?: (fn: () => void, ms: number) => unknown;
  readonly clearTimeout?: (id: unknown) => void;
}

export interface RewardPanelHandle {
  /** Progress and the order card (cheap; call on every state change). */
  update(view: RewardViewState | undefined, order: { readonly shots: number; readonly amount: number }): void;
  /** The card of a settled shot. */
  showShot(input: RewardCardInput): void;
  hideCard(): void;
  destroy(): void;
}

export function mountRewardPanel(root: HTMLElement, deps: RewardPanelDeps): RewardPanelHandle {
  const doc = root.ownerDocument;
  const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string): HTMLElementTagNameMap[K] => {
    const e = doc.createElement(tag);
    e.className = cls;
    return e;
  };
  const column = mk('div', 'rwd');
  column.dataset.testid = 'reward-panel';
  const strip = mk('div', 'rwd-strip');
  strip.dataset.testid = 'reward-strip';
  const orderCard = mk('div', 'rwd-order');
  orderCard.dataset.testid = 'reward-order';
  orderCard.hidden = true;
  const orderTitle = mk('div', 'rwd-title');
  const orderBody = mk('p', 'rwd-body');
  const orderButtons = mk('div', 'rwd-buttons');
  const accept = mk('button', 'btn rwd-btn');
  accept.type = 'button';
  accept.dataset.testid = 'order-accept';
  const decline = mk('button', 'btn rwd-btn');
  decline.type = 'button';
  decline.dataset.testid = 'order-decline';
  orderButtons.append(accept, decline);
  orderCard.append(orderTitle, orderBody, orderButtons);
  const card = mk('div', 'rwd-card');
  card.dataset.testid = 'reward-card';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  card.hidden = true;
  column.append(orderCard, strip, card);
  root.appendChild(column);

  const setT = deps.setTimeout ?? ((fn, ms) => globalThis.setTimeout(fn, ms));
  const clearT = deps.clearTimeout ?? ((id) => globalThis.clearTimeout(id as ReturnType<typeof setTimeout>));
  let timer: unknown = null;
  let answered = false;
  let hasCloseButton = false;
  const hideCard = () => {
    if (timer !== null) clearT(timer);
    timer = null;
    card.hidden = true;
  };
  for (const el of [card, orderCard]) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  card.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!hasCloseButton) hideCard();
  });
  const answer = (yes: boolean) => (e: Event) => {
    e.stopPropagation();
    if (answered) return; // one answer per game, even for a double tap
    answered = true;
    const result = deps.onOrder(yes);
    if (result instanceof Promise) void result.then(ok => { answered = ok; }, () => { answered = false; });
    else answered = result;
  };
  accept.addEventListener('click', answer(true));
  decline.addEventListener('click', answer(false));

  let stripKey = '';
  return {
    update(view, order) {
      const om = orderCardModel(view, order.shots, order.amount, deps.t, deps.prizeName);
      orderCard.hidden = om === null;
      if (om) {
        orderTitle.textContent = om.title;
        orderBody.textContent = om.body;
        accept.textContent = om.accept;
        decline.textContent = om.decline;
      }
      const sm = view ? rewardStripModel(view, deps.t, deps.prizeName) : { chips: [] };
      const key = sm.chips.map((c) => `${c.id}:${c.text}`).join('|');
      if (key !== stripKey) {
        stripKey = key;
        strip.replaceChildren(
          ...sm.chips.map((c) => {
            const chip = mk('span', 'rwd-chip');
            chip.dataset.chip = c.id;
            chip.textContent = c.text;
            return chip;
          }),
        );
      }
      strip.hidden = sm.chips.length === 0;
    },
    showShot(input) {
      card.dataset.static = String(input.staticCard === true);
      const m = rewardCardModel(input, deps.t, deps.prizeName);
      hasCloseButton = input.setMembers !== undefined && m.sets.length > 0;
      if (!m.any) {
        hideCard();
        return;
      }
      const title = mk('div', 'rwd-title');
      title.textContent = m.title;
      const parts: HTMLElement[] = [title];
      if (m.headline) {
        const h = mk('div', 'rwd-headline');
        h.dataset.moment = m.big ?? '';
        h.textContent = m.headline;
        parts.push(h);
      }
      for (const s of m.sets) {
        parts.push(renderRewardSet(doc, s, deps.prizeName, deps.t('reward.set.seal')));
      }
      if (m.lines.length > 0) {
        const list = mk('ul', 'rwd-list');
        for (const l of m.lines) {
          const li = mk('li', l.granted > 0 ? 'rwd-item' : 'rwd-item rwd-none');
          li.dataset.reward = l.id;
          li.textContent = `${l.name}: ${l.text}`;
          list.appendChild(li);
        }
        parts.push(list);
      }
      if (m.calm) {
        const c = mk('p', 'rwd-calm');
        c.textContent = m.calm;
        parts.push(c);
      }
      if (hasCloseButton) {
        const close = mk('button', 'rwd-close');
        close.type = 'button';
        close.textContent = deps.t('settings.close');
        close.dataset.testid = 'reward-close';
        close.addEventListener('click', hideCard);
        parts.push(close);
      }
      card.replaceChildren(...parts);
      card.hidden = false;
      if (timer !== null) clearT(timer);
      // The first-discovery slip can contain several illustrated sets and long
      // translated names. The next shot or the close button dismisses it.
      timer = hasCloseButton ? null : setT(hideCard, REWARD_CARD_SHOW_MS);
    },
    hideCard,
    destroy() {
      hideCard();
      column.remove();
    },
  };
}
