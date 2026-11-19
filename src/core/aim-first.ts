/**
 * r007 "aim first" rules (plan 2026-11-19 工程1・4). Pure: no clock, no storage, no DOM.
 *
 *   aiming --OPEN_GAUGE--> loading --FIRE--> resolving --(settle)--> aiming | ended
 *   loading --CANCEL_GAUGE--> aiming (no cork used, same position and aim)
 *
 * Position and aim change only while aiming; the gauge fixes both. FIRE reads the
 * gauge from the core's own loading clock at the accepted tick, classifies it with
 * the reserved power-zone width, and fires the shot in the same update. There is
 * no hand sway: the requested aim is the shot's aim.
 *
 * Also here: "店主と話す" (once per run, saved with its effect) and the two-prize
 * set hint shared by the talk and the body hit.
 */
import type {
  BoothLayout,
  ExpandedRunState,
  ExpansionCatalog,
  GameCommand,
  LoadResult,
  LoadTier,
  PrizeTypeId,
  RunState,
  RuntimeCatalog,
  SetHint,
  SetId,
  ShotRequest,
  TalkChoice,
  TalkOutcome,
  TuningConfig,
} from '../contracts';
import { BASE_SHOT_MODIFIERS, isExpandedRunState, mintId } from '../contracts';
import { aimToDirection, clampAim, muzzleAt } from './aim';
import { loadingBarValue, loadPeriodMultiplierFor } from './loading';
import { mergeModifiers, realAmmoAdd } from './gameplay-effects';

export interface AimFirstContext {
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  readonly catalog: RuntimeCatalog;
  readonly expansion: ExpansionCatalog;
}

/** True for r007 runs (the expansion state carries the aim-first part). */
export function isAimFirstState(state: RunState): state is ExpandedRunState & { readonly expansion: { readonly aimFirst: NonNullable<ExpandedRunState['expansion']['aimFirst']> } } {
  return isExpandedRunState(state) && state.expansion.aimFirst !== undefined;
}

// ------------------------------------------------------------- power zones

/** Width multiplier reserved for the next real shot (1 when none). */
export function powerZoneWidthFor(state: RunState): number {
  if (!isExpandedRunState(state)) return 1;
  const m = state.expansion.next.modifiers.powerZoneWidthMult;
  return typeof m === 'number' && Number.isFinite(m) && m > 0 ? m : 1;
}

export interface PowerZone {
  readonly tier: LoadTier;
  /** Bar values min..max (0..1) inside this tier's distance; nested around the sweet spot. */
  readonly min: number;
  readonly max: number;
}

/**
 * The zones the gauge draws and the classifier uses: each tier's distance times the multiplier,
 * with the edges kept inside 0..1. The weak tier is whatever remains.
 */
export function powerZones(tuning: TuningConfig, widthMult: number): readonly PowerZone[] {
  const s = tuning.loading.sweetSpot;
  return tuning.loading.tiers.map((t) => {
    const d = t.tier === 'weak' ? Infinity : t.maxDistance * widthMult;
    return { tier: t.tier, min: Math.max(0, s - d), max: Math.min(1, s + d) };
  });
}

/** Classify a bar value with widened/narrowed zones. A value on a boundary belongs to the stronger tier. */
export function classifyLoadWithWidth(barValue: number, tuning: TuningConfig, widthMult: number): LoadResult {
  const bar = Math.min(1, Math.max(0, Number.isFinite(barValue) ? barValue : 0));
  const dist = Math.abs(bar - tuning.loading.sweetSpot);
  const tiers = tuning.loading.tiers;
  const hit = tiers.find((t) => t.tier === 'weak' || dist <= t.maxDistance * widthMult + 1e-9) ?? tiers[tiers.length - 1];
  if (!hit) throw new RangeError('loading.tiers is empty');
  return { barValue: bar, tier: hit.tier, damageMultiplier: hit.damageMultiplier, pushMultiplier: hit.pushMultiplier };
}

/** Gauge value right now (FX037/038 period multiplier included). */
export function gaugeValue(state: RunState, tuning: TuningConfig): number {
  return loadingBarValue(state.clocks.loadingSec, tuning, loadPeriodMultiplierFor(state));
}

/** The shot request for the current aim (no sway). Shared by FIRE and the side-effect-free preview. */
export function aimFirstRequest(state: RunState, load: LoadResult, layout: BoothLayout): ShotRequest {
  const shotId = mintId.shot(state.shotsFired + 1);
  const bulletType = (isExpandedRunState(state) ? state.expansion.next.modifiers.bulletType : null) ?? state.bulletType;
  return { shotId, origin: muzzleAt(state.standX, layout), direction: aimToDirection(state.standX, state.aim, layout), load, bulletType };
}

/** Load used only to draw the trajectory before the power is chosen (the flight path does not depend on it). */
export const PREVIEW_LOAD: LoadResult = Object.freeze({ barValue: 0, tier: 'normal', damageMultiplier: 1, pushMultiplier: 1 });

// --------------------------------------------------------------- commands

const playable = (s: RunState): boolean => s.pauseReasons.length === 0 && s.inFlight === null && s.phase !== 'ended' && s.phase !== 'abandoned';

/**
 * The r007 reducer for the commands that differ from r001-r006. Returns `state` itself
 * when a command is rejected. Commands it does not own go to `fallback`.
 */
export function reduceAimFirst(state: RunState, command: GameCommand, ctx: AimFirstContext, fallback: (s: RunState, c: GameCommand) => RunState): RunState {
  if (!isAimFirstState(state)) {
    // Older versions never take the r007-only commands.
    return command.type === 'OPEN_GAUGE' || command.type === 'CANCEL_GAUGE' || command.type === 'CHOOSE_SHOPKEEPER_TALK' ? state : fallback(state, command);
  }
  switch (command.type) {
    case 'CONFIRM_POSITION':
    case 'STOP_LOAD':
      return state; // r001-r006 steps; r007 has no position confirmation
    case 'SET_POSITION': {
      if (!playable(state) || state.phase !== 'aiming') return state;
      const c = ctx.layout.camera;
      const x = Math.min(c.standMaxX, Math.max(c.standMinX, command.x));
      return x === state.standX ? state : { ...state, standX: x };
    }
    case 'AIM': {
      if (!playable(state) || state.phase !== 'aiming') return state;
      const aim = clampAim({ yaw: command.yaw, pitch: command.pitch }, ctx.layout);
      return aim.yaw === state.aim.yaw && aim.pitch === state.aim.pitch ? state : { ...state, aim };
    }
    case 'OPEN_GAUGE': {
      if (!playable(state) || state.phase !== 'aiming' || state.ammo < 1) return state;
      return { ...state, phase: 'loading', load: null, clocks: { ...state.clocks, loadingSec: 0 } };
    }
    case 'CANCEL_GAUGE': {
      if (!playable(state) || state.phase !== 'loading') return state;
      // The cork, the reservations and the position/aim fixed at OPEN_GAUGE all stay.
      return { ...state, phase: 'aiming', load: null, clocks: { ...state.clocks, loadingSec: 0 } };
    }
    case 'FIRE': {
      if (!playable(state) || state.phase !== 'loading' || state.ammo < 1) return state;
      const load = classifyLoadWithWidth(gaugeValue(state, ctx.tuning), ctx.tuning, powerZoneWidthFor(state));
      const request = aimFirstRequest(state, load, ctx.layout);
      const shotNumber = state.shotsFired + 1;
      const exp = state.expansion;
      return {
        ...state,
        phase: 'resolving',
        load,
        ammo: state.ammo - 1,
        shotsFired: shotNumber,
        inFlight: { shotId: request.shotId, shotNumber, request, stage: 'flight' },
        // The reservation (power zone included) is used by this shot only.
        expansion: { ...exp, active: exp.next, next: { modifiers: BASE_SHOT_MODIFIERS, hint: null } },
      };
    }
    case 'CHOOSE_SHOPKEEPER_TALK':
      return chooseTalk(state, command.choice, ctx);
    default:
      return fallback(state, command);
  }
}

// ------------------------------------------------------------------- talk

export type TalkBlock = 'used' | 'notAiming' | 'noAmmo' | 'paused' | 'orderOpen';
export type TalkAmmoBlock = 'ammoCap' | 'zoneReserved';

export interface TalkAvailability {
  /** null when the panel may open. */
  readonly blocked: TalkBlock | null;
  /** Why "弾を1発もらう" cannot be chosen right now (shown before choosing). */
  readonly ammoBlocked: TalkAmmoBlock | null;
  readonly ammoOffer: number;
  readonly powerZoneWidthMult: number;
}

/** Whether "店主と話す" can open, and whether its ammo choice can be taken. Read-only. */
export function talkAvailability(state: RunState, ctx: Pick<AimFirstContext, 'tuning' | 'expansion'>): TalkAvailability {
  const cfg = ctx.expansion.profile.aimFirst;
  const zone = cfg?.talk.ammoPowerZoneWidthMult ?? 1;
  if (!cfg || !isAimFirstState(state)) return { blocked: 'notAiming', ammoBlocked: null, ammoOffer: 0, powerZoneWidthMult: zone };
  let blocked: TalkBlock | null = null;
  if (state.expansion.aimFirst.talk !== null) blocked = 'used';
  else if (state.pauseReasons.length > 0) blocked = 'paused';
  else if (state.phase !== 'aiming' || state.inFlight !== null) blocked = 'notAiming';
  else if (state.ammo < 1) blocked = 'noAmmo';
  else if (state.expansion.rewards?.order?.status === 'offered') blocked = 'orderOpen';
  const offer = realAmmoAdd(cfg.talk.ammo, state, state.shotsFired, ctx.tuning);
  const ammoBlocked: TalkAmmoBlock | null = offer <= 0 ? 'ammoCap' : powerZoneWidthFor(state) !== 1 ? 'zoneReserved' : null;
  return { blocked, ammoBlocked, ammoOffer: offer, powerZoneWidthMult: zone };
}

/** Apply the one talk choice of the run. Rejected (same object) unless every condition holds now. */
export function chooseTalk(state: RunState, choice: TalkChoice, ctx: AimFirstContext): RunState {
  if (!isAimFirstState(state)) return state;
  const cfg = ctx.expansion.profile.aimFirst;
  if (!cfg) return state;
  const a = talkAvailability(state, ctx);
  if (a.blocked !== null) return state;
  const exp = state.expansion;
  if (choice === 'hint') {
    const talk: TalkOutcome = { choice, afterShot: state.shotsFired, ammoRequested: 0, ammoGranted: 0, powerZoneWidthMult: null, hint: setHintFor(state, ctx.catalog, ctx.expansion) };
    return { ...state, expansion: { ...exp, aimFirst: { ...exp.aimFirst, talk } } };
  }
  if (a.ammoBlocked !== null) return state;
  const granted = a.ammoOffer;
  // The cork and the narrower zone for the next real shot are one change (saved together).
  const modifiers = mergeModifiers(exp.next.modifiers, { powerZoneWidthMult: cfg.talk.ammoPowerZoneWidthMult }, ctx.expansion.profile.limits);
  const talk: TalkOutcome = { choice, afterShot: state.shotsFired, ammoRequested: cfg.talk.ammo, ammoGranted: granted, powerZoneWidthMult: modifiers.powerZoneWidthMult ?? null, hint: null };
  return {
    ...state,
    ammo: state.ammo + granted,
    bonusAmmoTotal: state.bonusAmmoTotal + granted,
    expansion: { ...exp, next: { ...exp.next, modifiers }, aimFirst: { ...exp.aimFirst, talk } },
  };
}

// ---------------------------------------------------------------- set hint

/**
 * The two-prize set the shopkeeper points out: an unfinished pair whose missing kinds are all on
 * the shelf now; a pair with one kind already won comes first, then the lower id.
 */
export function setHintFor(state: Pick<RunState, 'shelf' | 'collectedTypeIds' | 'completedSets'>, catalog: RuntimeCatalog, expansion: ExpansionCatalog): SetHint {
  const won = new Set<PrizeTypeId>(state.collectedTypeIds);
  const done = new Set<SetId>(state.completedSets);
  const onShelf = new Set<PrizeTypeId>(state.shelf.prizes.filter((p) => !p.collected).map((p) => p.typeId));
  let best: { setId: SetId; missing: PrizeTypeId[] } | null = null;
  for (const setId of expansion.pairSetIds) {
    if (done.has(setId)) continue;
    const set = catalog.sets.get(setId);
    if (!set) continue;
    const missing = set.requiredTypeIds.filter((t) => !won.has(t));
    if (missing.length === 0 || !missing.every((t) => onShelf.has(t))) continue;
    if (!best || missing.length < best.missing.length) best = { setId, missing };
    if (best.missing.length === 1) break; // ids are sorted: the first one-missing pair wins
  }
  return best ? { setId: best.setId, missingTypeIds: best.missing } : { setId: null, missingTypeIds: [] };
}

/** Initial aim-first part of the expansion state. */
export const INITIAL_AIM_FIRST = Object.freeze({ aimSeq: 0, talk: null });
