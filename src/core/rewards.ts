/**
 * Ammo rewards A1-A10 of the post-#19 plan (pure; owner: Game, contract: Opus).
 *
 * Order inside one shot (plan "一射の確定順"): the existing post-flight plan
 * first (legacy plates, cells, the answer), then the rewards on the SAME working
 * ammo in the order A1 → A10 (A6 inside: lower milestone first). Every grant is
 * the capped add of the effects (withAmmoAdded): 10 corks at the start, at most
 * 10 added in total, at most 20 shots, and
 *   shotsFired + ammo + ammoLostTotal === 10 + bonusAmmoTotal.
 * A reward that triggers with no room left is still recorded as met and used;
 * it never pays later.
 *
 * Nothing here reads the clock, the DOM, the physics world or storage, and
 * nothing is derived from what the screen shows.
 */
import type {
  BoothLayout,
  CollectedPrize,
  ExpandedRunState,
  ExpansionCatalog,
  GameCommand,
  PrizeInstanceId,
  PrizeInstanceState,
  PrizeTypeId,
  RewardConfig,
  RewardContacts,
  RewardDeviceLayout,
  RewardId,
  RewardOutcome,
  RewardRunState,
  RewardTargetGeometry,
  RewardTargetState,
  RewardViewState,
  RunState,
  RuntimeCatalog,
  SetId,
  ShelfState,
  SlotGeometry,
  TuningConfig,
} from '../contracts';
import { BASE_SHOT_MODIFIERS, aimDirection, ballisticFor, corkFreeFlightPath, isExpandedRunState, muzzlePosition, NO_REWARD_CONTACTS, slotRowColumn } from '../contracts';
import { rngNext, seedRng } from '../catalog/rng';
import { realAmmoAdd, withAmmoAdded, type EffectWork } from './gameplay-effects';

// ------------------------------------------------------------------ config

export function rewardConfigOf(expansion: ExpansionCatalog | null | undefined): RewardConfig | null {
  return expansion?.profile.rewards ?? null;
}

export const rewardEnabled = (cfg: RewardConfig | null, id: RewardId): boolean => cfg !== null && cfg.enabled.includes(id);

// ------------------------------------------------------------- A1: the bag

/**
 * Columns (1-based) of the front row well inside the view from the start position (stand x = 0),
 * also on a short 375 px portrait screen where columns 5 and 8 sit at the very edges.
 */
export const BAG_COLUMNS: readonly number[] = [6, 7];
/** The front-center slot kept free for the bag when no candidate was drawn there. */
export const BAG_RESERVED_SLOT = 'slot-r3-c06';

const slotOrder = (a: PrizeInstanceState, b: PrizeInstanceState): number => (a.homeSlot < b.homeSlot ? -1 : a.homeSlot > b.homeSlot ? 1 : 0);

/** Easiest to win first: lower durability, then lighter, then slot order. */
function byEase(catalog: RuntimeCatalog): (a: PrizeInstanceState, b: PrizeInstanceState) => number {
  return (a, b) => a.maxHp - b.maxHp || (catalog.prizes.get(a.typeId)?.massKg ?? 0) - (catalog.prizes.get(b.typeId)?.massKg ?? 0) || slotOrder(a, b);
}

const isBagCandidate = (p: PrizeInstanceState): boolean => {
  const rc = slotRowColumn(p.homeSlot);
  return rc !== null && rc.row === 3 && BAG_COLUMNS.includes(rc.column) && !p.collected;
};

/** Move one prize to another slot keeping its height above its own board. */
function moveTo(p: PrizeInstanceState, from: SlotGeometry, to: SlotGeometry): PrizeInstanceState {
  const pos = p.pose.position;
  return { ...p, homeSlot: to.slotId, pose: { ...p.pose, position: { x: to.spawnBase.x, y: to.spawnBase.y + (pos.y - from.spawnBase.y), z: to.spawnBase.z + (pos.z - from.spawnBase.z) } } };
}

/**
 * A1: tie the bag to the easiest front-center prize of the starting shelf. When the draw left
 * none there, swap (once) the easiest prize of the whole shelf with whatever holds the reserved
 * front-center slot: counts, kinds and the draw RNG stay as drawn.
 */
export function placeBag(shelf: ShelfState, catalog: RuntimeCatalog, layout: BoothLayout): { readonly shelf: ShelfState; readonly instanceId: PrizeInstanceId | null } {
  const ease = byEase(catalog);
  const direct = shelf.prizes.filter(isBagCandidate).sort(ease)[0];
  if (direct) return { shelf, instanceId: direct.instanceId };
  const easiest = [...shelf.prizes].filter((p) => !p.collected).sort(ease)[0];
  const slots = new Map(layout.slots.map((s) => [s.slotId as string, s]));
  const reserved = slots.get(BAG_RESERVED_SLOT);
  if (!easiest || !reserved) return { shelf, instanceId: easiest?.instanceId ?? null };
  const from = slots.get(easiest.homeSlot);
  if (!from) return { shelf, instanceId: easiest.instanceId };
  const occupant = shelf.prizes.find((p) => p.homeSlot === reserved.slotId);
  const prizes = shelf.prizes.map((p) => {
    if (p.instanceId === easiest.instanceId) return moveTo(p, from, reserved);
    if (occupant && p.instanceId === occupant.instanceId) return moveTo(p, reserved, from);
    return p;
  });
  return { shelf: { ...shelf, prizes }, instanceId: easiest.instanceId };
}

// ------------------------------------------------------ A2-A4: the devices

const box = (cx: number, cy: number, cz: number, hx: number, hy: number, hz: number) => ({ center: { x: cx, y: cy, z: cz }, halfExtents: { x: hx, y: hy, z: hz } });
/** In the open space left of the shelf (x -2.55 … -3.0), in view from the left end of the stand. */
export const CHIME_BOX = box(-2.78, 1.62, -1.95, 0.04, 0.07, 0.04);
export const PIGGY_SLOT_BOX = box(-2.78, 1.02, -1.85, 0.07, 0.05, 0.05);
/**
 * Behind the bottom board, columns 3-4, where pushed prizes fall (the board's back edge is at
 * z -1.89, the back wall at -2.45), above the collection height (0.45).
 */
export const SEESAW_TRAY_BOX = box(-1.26, 0.56, -2.1, 0.42, 0.06, 0.2);

/** Which device colliders the physics world builds for this rules version. */
export function rewardDevicesFor(cfg: RewardConfig | null): RewardDeviceLayout {
  return {
    chime: rewardEnabled(cfg, 'A2') ? CHIME_BOX : null,
    piggySlot: rewardEnabled(cfg, 'A4') ? PIGGY_SLOT_BOX : null,
    seesawTray: rewardEnabled(cfg, 'A3') ? SEESAW_TRAY_BOX : null,
  };
}

// --------------------------------------------------------- A5: the target

/** Plane of the target: the open space in front of the bottom board. */
export const TARGET_Z = -1.0;
/** The target sits where this aim (relative to zero aim, inside the ±0.3 rad limits) crosses TARGET_Z. */
export const TARGET_AIM = { yaw: 0.17, pitch: -0.17 } as const;
export const TARGET_OUTER_RADIUS = 0.075;
export const TARGET_CENTER_RADIUS = 0.03;

/** Where the target is for a stand position: on the path of a reachable aim, so both ends of the stand work. */
export function targetGeometryAt(layout: BoothLayout, tuning: TuningConfig, standX: number): RewardTargetGeometry {
  const muzzle = muzzlePosition(layout, standX);
  const path = corkFreeFlightPath(muzzle, aimDirection(layout, standX, TARGET_AIM), ballisticFor(tuning, 'standard'), 2);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    if (b.z <= TARGET_Z && a.z > TARGET_Z) {
      const t = (a.z - TARGET_Z) / (a.z - b.z);
      return { center: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: TARGET_Z }, outerRadius: TARGET_OUTER_RADIUS, centerRadius: TARGET_CENTER_RADIUS };
    }
  }
  throw new RangeError('targetGeometryAt: the aim path never reaches the target plane');
}

/**
 * A5: the most each ring can give for the shot about to be fired, or null when no target
 * appears: only with 1 cork left before firing, once per game, and only while an add can still
 * give something (no room = no target).
 */
export function targetOffer(state: RunState, cfg: RewardConfig | null, tuning: TuningConfig): { readonly outer: number; readonly center: number } | null {
  if (!rewardEnabled(cfg, 'A5') || !isExpandedRunState(state)) return null;
  const r = state.expansion.rewards;
  if (!r || r.targetUsed || state.ammo !== 1) return null;
  // After the FIRE that uses the last cork: ammo 0, shotsFired + 1.
  const room = realAmmoAdd(cfg!.lastShotTarget.center, { ammo: 0, bonusAmmoTotal: state.bonusAmmoTotal }, state.shotsFired + 1, tuning);
  if (room <= 0) return null;
  return { outer: Math.min(cfg!.lastShotTarget.outer, room), center: Math.min(cfg!.lastShotTarget.center, room) };
}

// ---------------------------------------------------------- A9: the order

const salt = (seed: number, k: number): number => (Math.trunc(seed) ^ k) | 0;

/** One kind that really stands on the starting shelf, drawn from its own stream (no other stream moves). */
export function chooseOrderKind(shelf: ShelfState, seed: number): PrizeTypeId | null {
  const kinds = [...new Set(shelf.prizes.map((p) => p.typeId))].sort();
  if (kinds.length === 0) return null;
  const r = rngNext(seedRng(salt(seed, 0x27d4eb2f)));
  return kinds[Math.min(kinds.length - 1, Math.floor(r.value * kinds.length))]!;
}

// ------------------------------------------------------------ run start

export function initialRewards(shelf: ShelfState, seed: number, cfg: RewardConfig, catalog: RuntimeCatalog, layout: BoothLayout): { readonly shelf: ShelfState; readonly rewards: RewardRunState } {
  const bag = rewardEnabled(cfg, 'A1') ? placeBag(shelf, catalog, layout) : { shelf, instanceId: null };
  const orderKind = rewardEnabled(cfg, 'A9') ? chooseOrderKind(bag.shelf, seed) : null;
  return {
    shelf: bag.shelf,
    rewards: {
      bag: bag.instanceId ? { instanceId: bag.instanceId, used: false } : null,
      target: null,
      targetUsed: false,
      chimeUsed: false,
      seesawUsed: false,
      piggyDeposits: [],
      piggyDone: false,
      stampsReached: [],
      order: orderKind ? { typeId: orderKind, status: 'offered', acceptedAfterShots: null, doneOnShot: null } : null,
      lanternsLit: [],
      lanternsDone: false,
      outcomes: [],
      lastShot: null,
    },
  };
}

// ------------------------------------------------------------ commands

const withRewards = (s: ExpandedRunState, rewards: RewardRunState): ExpandedRunState => ({ ...s, expansion: { ...s.expansion, rewards } });

export interface RewardCommandContext {
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  readonly expansion: ExpansionCatalog | null | undefined;
}

/**
 * Wraps the core reducer: A9 accept/decline, A5 placement when the stand is confirmed and its
 * use when the shot is fired. Returns the reducer's result untouched for runs without rewards.
 */
export function reduceWithRewards(state: RunState, command: GameCommand, ctx: RewardCommandContext, reduce: (s: RunState, c: GameCommand) => RunState): RunState {
  const cfg = rewardConfigOf(ctx.expansion);
  if (!cfg || !isExpandedRunState(state) || !state.expansion.rewards) return command.type === 'ORDER' ? state : reduce(state, command);
  const r = state.expansion.rewards;

  if (command.type === 'ORDER') {
    // Before the first shot only, while playable and not paused; one answer per game.
    if (!r.order || r.order.status !== 'offered' || state.shotsFired !== 0 || state.pauseReasons.length > 0) return state;
    if (state.phase !== 'position' && state.phase !== 'loading' && state.phase !== 'aiming') return state;
    return withRewards(state, { ...r, order: { ...r.order, status: command.accept ? 'accepted' : 'declined', acceptedAfterShots: command.accept ? 0 : null } });
  }

  const after = reduce(state, command);
  if (after === state || !isExpandedRunState(after)) return after;
  const ar = after.expansion.rewards ?? r;

  if (command.type === 'CONFIRM_POSITION' && state.phase === 'position' && after.phase === 'loading') {
    const offered = targetOffer(after, cfg, ctx.tuning);
    if (!offered) return after;
    const target: RewardTargetState = { forShot: after.shotsFired + 1, geometry: targetGeometryAt(ctx.layout, ctx.tuning, after.standX), offered };
    return withRewards(after, { ...ar, target });
  }
  if (command.type === 'FIRE' && after.phase === 'resolving' && after.inFlight) {
    let next = ar;
    // The target is used together with the recorded FIRE; it stays out for this shot's flight.
    if (next.target && next.target.forShot === after.shotsFired) next = { ...next, targetUsed: true };
    // An order not taken by the first shot is declined (no penalty).
    if (next.order?.status === 'offered' && after.shotsFired >= 1) next = { ...next, order: { ...next.order, status: 'declined' } };
    return next === ar ? after : withRewards(after, next);
  }
  return after;
}

// ----------------------------------------------------------- settlement

export interface RewardSettlementInput {
  readonly state: ExpandedRunState;
  readonly cfg: RewardConfig;
  readonly tuning: TuningConfig;
  readonly catalog: RuntimeCatalog;
  /** Ammo after the effect plan (the "working ammo" the rewards continue). */
  readonly work: Pick<EffectWork, 'ammo' | 'bonusAmmoTotal'>;
  readonly shotNumber: number;
  /** Prizes confirmed won in this shot, with the kind at collection. */
  readonly collectedNow: readonly CollectedPrize[];
  /** Sets first completed in this game by this shot. */
  readonly newSets: readonly SetId[];
  readonly contacts: RewardContacts | undefined;
}

export interface RewardSettlement {
  readonly ammo: number;
  readonly bonusAmmoTotal: number;
  readonly outcomes: readonly RewardOutcome[];
  readonly rewards: RewardRunState;
}

/** Which A10 zone (0-based) a 1-based column belongs to, or -1. */
export function lanternZoneOf(cfg: RewardConfig, column: number): number {
  return cfg.lanterns.zones.findIndex(([lo, hi]) => column >= lo && column <= hi);
}

/** Apply A1 → A10 for one confirmed shot. Pure; `state` is the run before this shot is confirmed. */
export function settleRewards(input: RewardSettlementInput): RewardSettlement {
  const { state, cfg, tuning, catalog, shotNumber, collectedNow } = input;
  const before = state.expansion.rewards;
  if (!before) throw new Error('settleRewards: the run has no reward state');
  const contacts = input.contacts ?? NO_REWARD_CONTACTS;
  const on = (id: RewardId) => cfg.enabled.includes(id);
  let work = { ammo: input.work.ammo, bonusAmmoTotal: input.work.bonusAmmoTotal };
  const outcomes: RewardOutcome[] = [];
  const grant = (id: RewardId, key: string, offered: number): void => {
    const r = withAmmoAdded({ ...work } as EffectWork, offered, state.shotsFired, tuning);
    work = { ammo: r.work.ammo, bonusAmmoTotal: r.work.bonusAmmoTotal };
    outcomes.push({ id, key, shotNumber, offered, granted: r.delta });
  };
  const won = new Set<string>(collectedNow.map((c) => c.instanceId));
  let r: RewardRunState = { ...before };

  // A1: the bag on that very instance.
  if (on('A1') && r.bag && !r.bag.used && won.has(r.bag.instanceId)) {
    r = { ...r, bag: { ...r.bag, used: true } };
    grant('A1', `bag:${r.bag!.instanceId}`, cfg.bonusBag);
  }
  // A2: the chime, after a real reflection of the same cork.
  if (on('A2') && !r.chimeUsed && contacts.chimeAfterReflection) {
    r = { ...r, chimeUsed: true };
    grant('A2', 'chime', cfg.windChime);
  }
  // A3: a prize that fell into the seesaw tray and was won.
  const trayWin = contacts.seesawInstances.find((id) => won.has(id));
  if (on('A3') && !r.seesawUsed && trayWin !== undefined) {
    r = { ...r, seesawUsed: true };
    grant('A3', `seesaw:${trayWin}`, cfg.seesaw);
  }
  // A4: one deposit per shot; pays on the shot that makes the count.
  if (on('A4') && !r.piggyDone && contacts.piggyDeposit && !r.piggyDeposits.includes(shotNumber)) {
    const deposits = [...r.piggyDeposits, shotNumber];
    r = { ...r, piggyDeposits: deposits };
    if (deposits.length >= cfg.piggyBank.deposits) {
      r = { ...r, piggyDone: true };
      grant('A4', 'piggy', cfg.piggyBank.amount);
    }
  }
  // A5: the target placed for this shot, best ring touched.
  if (on('A5') && r.target && r.target.forShot === shotNumber && contacts.targetHit !== null) {
    grant('A5', `target:${contacts.targetHit}`, r.target.offered[contacts.targetHit]);
  }
  if (r.target && r.target.forShot <= shotNumber) r = { ...r, target: null };
  // A6: milestones of prizes won in this game, lower first.
  const countBefore = state.collected.length;
  const countAfter = countBefore + collectedNow.length;
  if (on('A6')) {
    for (const m of [...cfg.stamps.milestones].sort((a, b) => a - b)) {
      if (countBefore < m && countAfter >= m && !r.stampsReached.includes(m)) {
        r = { ...r, stampsReached: [...r.stampsReached, m] };
        grant('A6', `stamp:${m}`, cfg.stamps.amount);
      }
    }
  }
  // A7: several prizes in one shot; only the larger amount.
  if (on('A7') && collectedNow.length >= 2) grant('A7', `multi:${collectedNow.length}`, collectedNow.length >= 3 ? cfg.multiTake.threePlus : cfg.multiTake.two);
  // A8: sets first completed in this game by this shot; the largest one pays.
  if (on('A8') && input.newSets.length > 0) {
    const sized = input.newSets.map((id) => ({ id, size: catalog.sets.get(id)?.requiredTypeIds.length ?? 0 }));
    const best = sized.reduce((a, b) => (b.size > a.size ? b : a));
    grant('A8', `set:${best.id}`, best.size >= 3 ? cfg.setVoucher.triple : cfg.setVoucher.pair);
  }
  // A9: the accepted order, within its shots, by the kind at collection.
  if (on('A9') && r.order && r.order.status === 'accepted' && r.order.acceptedAfterShots !== null) {
    const last = r.order.acceptedAfterShots + cfg.order.shots;
    if (shotNumber <= last && collectedNow.some((c) => c.typeId === r.order!.typeId)) {
      r = { ...r, order: { ...r.order, status: 'done', doneOnShot: shotNumber } };
      grant('A9', `order:${r.order!.typeId}`, cfg.order.amount);
    } else if (shotNumber >= last) {
      r = { ...r, order: { ...r.order, status: 'expired' } };
    }
  }
  // A10: zones by the slot each prize first appeared in.
  if (on('A10') && !r.lanternsDone && collectedNow.length > 0) {
    const home = new Map(state.shelf.prizes.map((p) => [p.instanceId as string, p.homeSlot]));
    const lit = new Set(r.lanternsLit);
    for (const c of collectedNow) {
      const slot = home.get(c.instanceId);
      const rc = slot ? slotRowColumn(slot) : null;
      const zone = rc ? lanternZoneOf(cfg, rc.column) : -1;
      if (zone >= 0) lit.add(zone);
    }
    r = { ...r, lanternsLit: [...lit].sort((a, b) => a - b) };
    if (lit.size >= cfg.lanterns.zones.length) {
      r = { ...r, lanternsDone: true };
      grant('A10', 'lanterns', cfg.lanterns.amount);
    }
  }
  return { ammo: work.ammo, bonusAmmoTotal: work.bonusAmmoTotal, outcomes, rewards: { ...r, outcomes: [...r.outcomes, ...outcomes] } };
}

// ------------------------------------------------------------ the view

function isBaseReservation(next: ExpandedRunState['expansion']['next']): boolean {
  if (next.hint !== null) return false;
  const m = next.modifiers;
  const b = BASE_SHOT_MODIFIERS;
  return (Object.keys(b) as (keyof typeof b)[]).every((k) => JSON.stringify(m[k]) === JSON.stringify(b[k]));
}

/** Display facts for the view and the panel. Never read back into the run. */
export function rewardViewState(state: RunState, cfg: RewardConfig | null, layout: BoothLayout, tuning: TuningConfig): RewardViewState | undefined {
  if (!cfg || !isExpandedRunState(state) || !state.expansion.rewards) return undefined;
  const r = state.expansion.rewards;
  let target: RewardViewState['target'] = null;
  if (r.target) target = { geometry: r.target.geometry, offered: r.target.offered, mode: 'fixed' };
  else if (state.phase === 'position') {
    const offered = targetOffer(state, cfg, tuning);
    if (offered) target = { geometry: targetGeometryAt(layout, tuning, state.standX), offered, mode: 'preview' };
  }
  const won = state.collected.length;
  const nextStamp = cfg.enabled.includes('A6') ? ([...cfg.stamps.milestones].sort((a, b) => a - b).find((m) => !r.stampsReached.includes(m)) ?? null) : null;
  let orderShotsLeft: number | null = null;
  if (r.order?.status === 'accepted' && r.order.acceptedAfterShots !== null) {
    const last = r.order.acceptedAfterShots + cfg.order.shots;
    const preparing = state.phase === 'resolving' ? state.shotsFired : state.shotsFired + 1;
    orderShotsLeft = Math.max(0, last - preparing + 1);
  }
  return {
    bagInstanceId: r.bag && !r.bag.used ? r.bag.instanceId : null,
    bagOffer: Math.max(0, Math.min(cfg.bonusBag, tuning.maxBonusAmmoTotal - state.bonusAmmoTotal)),
    target,
    order: r.order,
    orderShotsLeft,
    lanternsLit: r.lanternsLit,
    lanternZones: cfg.lanterns.zones.length,
    prizesWon: won,
    nextStamp,
    piggyDeposits: r.piggyDeposits.length,
    enabled: cfg.enabled,
    devices: rewardDevicesFor(cfg),
    chimeUsed: r.chimeUsed,
    seesawUsed: r.seesawUsed,
    piggyDone: r.piggyDone,
    nextReserved: !isBaseReservation(state.expansion.next),
  };
}

// ------------------------------------------------------- E1 best shot

export interface BestShot {
  readonly shotNumber: number;
  readonly prizes: number;
  readonly points: number;
  readonly sets: number;
}

/**
 * E1: the shot with the most prizes won, then the most points it really added (after − before),
 * then the earlier one. Null when no shot won anything. Read from the confirmed ledger and
 * collection only.
 */
export function bestShotOf(result: { readonly ledger: readonly { readonly shotId: string; readonly scoreBefore: number; readonly scoreAfter: number; readonly items: readonly { readonly kind: string }[] }[]; readonly collected: readonly { readonly shotId: string }[] }): BestShot | null {
  let best: BestShot | null = null;
  result.ledger.forEach((e, i) => {
    const prizes = result.collected.filter((c) => c.shotId === e.shotId).length;
    if (prizes === 0) return;
    const n = Number.parseInt(e.shotId.replace(/^\D+/, ''), 10);
    const cand: BestShot = { shotNumber: Number.isInteger(n) && n > 0 ? n : i + 1, prizes, points: e.scoreAfter - e.scoreBefore, sets: e.items.filter((it) => it.kind === 'set').length };
    if (!best || cand.prizes > best.prizes || (cand.prizes === best.prizes && cand.points > best.points)) best = cand;
  });
  return best;
}
