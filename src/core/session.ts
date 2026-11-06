/**
 * Run restore rules and saved-state validation (Task 10; decisions 24, 27).
 * Pure: no storage here. src/persistence reads and writes; these functions
 * decide what a saved RunState means.
 *
 *  - inFlight marker (or phase "resolving") found  -> the shot was lost: the run is
 *    abandoned, never ranked, and there is no free re-shot (decision 27).
 *  - position / loading / aiming                   -> resume exactly (decision 24).
 *  - ended / abandoned                             -> show the result.
 */
import type { BoothLayout, ExpansionCatalog, RunState, RuntimeCatalog, SetId, TuningConfig } from '../contracts';
import {
  BOOTH_LAYOUT,
  EXPANDED_RUN_STATE_SCHEMA_VERSION,
  HINT_KINDS,
  RUN_STATE_SCHEMA_VERSION,
  isExpandedRunState,
  isLedgerEntryConsistent,
  isPrizeTypeId,
  isSetId,
  isSlotId,
} from '../contracts';
import { isValidRngState } from '../catalog/rng';

export type RestorePlan =
  | { readonly kind: 'resume'; readonly state: RunState }
  | { readonly kind: 'abandoned'; readonly state: RunState; readonly cause: 'inFlight' | 'saved' }
  | { readonly kind: 'ended'; readonly state: RunState };

/** The abandoned form of a run: terminal, no marker, no pending load. Ammo and score stay as saved. */
export function abandonRun(state: RunState): RunState {
  const base: RunState = { ...state, phase: 'abandoned', pauseReasons: [], inFlight: null, load: null };
  // Expanded rules: the reservation of the lost shot goes with it (never replayed).
  return isExpandedRunState(state) ? { ...base, expansion: { ...state.expansion, active: null } } : base;
}

/**
 * Decide what a validated saved state means. Resuming keeps everything
 * (shelf, ammo, score, draw state, first-hit flags, load result) and only
 * adds a manual pause: nothing runs until the player presses resume.
 */
export function planRestore(state: RunState): RestorePlan {
  if (state.inFlight !== null || state.phase === 'resolving') return { kind: 'abandoned', state: abandonRun(state), cause: 'inFlight' };
  if (state.phase === 'abandoned') return { kind: 'abandoned', state: abandonRun(state), cause: 'saved' };
  if (state.phase === 'ended') return { kind: 'ended', state };
  return { kind: 'resume', state: { ...state, pauseReasons: ['manual'] } };
}

// ------------------------------------------------------------- validation

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const PHASES = ['position', 'loading', 'aiming', 'resolving', 'ended', 'abandoned'];
const PAUSES = ['hidden', 'landscape', 'manual'];
const STATUSES = ['prototype', 'proposed', 'approved'];
const TIERS = ['perfect', 'good', 'normal', 'weak'];

function isVec(v: unknown): boolean {
  return isObj(v) && isNum(v.x) && isNum(v.y) && isNum(v.z);
}
function isPose(v: unknown): boolean {
  return isObj(v) && isVec(v.position) && isObj(v.rotation) && isNum(v.rotation.x) && isNum(v.rotation.y) && isNum(v.rotation.z) && isNum(v.rotation.w);
}

function ledgerShapeOk(e: unknown): boolean {
  if (!isObj(e) || !isStr(e.shotId) || !Array.isArray(e.items)) return false;
  for (const k of ['scoreBefore', 'prizePoints', 'trickPoints', 'setPoints', 'firstHitPoints', 'nominalPenalty', 'appliedPenalty', 'scoreAfter']) {
    if (!isInt(e[k])) return false;
  }
  return e.items.every((i) => isObj(i) && isStr(i.kind) && typeof i.refId === 'string' && isInt(i.points));
}

/**
 * Structural and invariant check of an untrusted RunState. Returns the first
 * problem found, or null when the state is usable. Cheap enough to run on
 * every load; it does not run on the hot path.
 */
export function validateRunState(
  raw: unknown,
  catalog: RuntimeCatalog,
  tuning: TuningConfig,
  layout: BoothLayout = BOOTH_LAYOUT,
  expansion: ExpansionCatalog | null = null,
): string | null {
  if (!isObj(raw)) return 'state is not an object';
  const s = raw;
  const expanded = expansion !== null;
  if (s.schemaVersion !== (expanded ? EXPANDED_RUN_STATE_SCHEMA_VERSION : RUN_STATE_SCHEMA_VERSION)) return 'state schemaVersion mismatch';
  if (!isStr(s.runId)) return 'runId missing';
  if (s.rulesVersion !== catalog.rulesVersion) return 'rulesVersion mismatch';
  if (typeof s.phase !== 'string' || !PHASES.includes(s.phase)) return 'invalid phase';
  const phase = s.phase;
  if (typeof s.valueStatus !== 'string' || !STATUSES.includes(s.valueStatus)) return 'invalid valueStatus';
  if (!Array.isArray(s.pauseReasons) || !s.pauseReasons.every((r) => typeof r === 'string' && PAUSES.includes(r))) return 'invalid pauseReasons';
  for (const k of ['ammo', 'bonusAmmoTotal', 'shotsFired', 'score', 'maxChain']) if (!isInt(s[k])) return `invalid ${k}`;
  const ammo = s.ammo as number;
  const bonus = s.bonusAmmoTotal as number;
  const shots = s.shotsFired as number;
  let ammoLost = 0;
  if (expanded) {
    if (!isInt(s.ammoLostTotal)) return 'invalid ammoLostTotal';
    ammoLost = s.ammoLostTotal;
  } else if (s.ammoLostTotal !== undefined || s.expansion !== undefined) return 'expanded fields in a rules-v1 state';
  if (bonus > tuning.maxBonusAmmoTotal) return 'bonusAmmoTotal exceeds the cap';
  if (shots + ammo + ammoLost !== tuning.initialAmmo + bonus) return 'ammo does not match shotsFired and bonusAmmoTotal';
  if (shots > tuning.initialAmmo + tuning.maxBonusAmmoTotal) return 'shotsFired exceeds the maximum';
  if (phase === 'ended' && ammo !== 0) return 'ended run still has ammo';
  if (!isInt(s.seed, Number.MIN_SAFE_INTEGER) || !(s.playerName === null || typeof s.playerName === 'string')) return 'invalid seed or playerName';
  if (typeof s.bulletType !== 'string' || !(s.bulletType in tuning.bulletTypes)) return 'invalid bulletType';
  if (!isNum(s.standX) || s.standX < layout.camera.standMinX - 1e-9 || s.standX > layout.camera.standMaxX + 1e-9) return 'invalid standX';
  if (!isObj(s.aim) || !isNum(s.aim.yaw) || !isNum(s.aim.pitch)) return 'invalid aim';
  if (!isObj(s.clocks) || !['loadingSec', 'aimingSec', 'heartPhase', 'motionSec'].every((k) => isNum((s.clocks as Obj)[k]) && ((s.clocks as Obj)[k] as number) >= 0)) {
    return 'invalid clocks';
  }

  // load result
  if (s.load !== null) {
    const l = s.load;
    if (!isObj(l) || !isNum(l.barValue) || l.barValue < 0 || l.barValue > 1 || typeof l.tier !== 'string' || !TIERS.includes(l.tier)) return 'invalid load';
    if (!isNum(l.damageMultiplier) || !isNum(l.pushMultiplier) || l.damageMultiplier <= 0 || l.pushMultiplier <= 0) return 'invalid load multipliers';
  }
  if (phase === 'aiming' && s.load === null) return 'aiming without a load result';

  // ledger and score
  if (!Array.isArray(s.ledger) || !s.ledger.every(ledgerShapeOk)) return 'invalid ledger shape';
  const ledger = s.ledger as { shotId: string; scoreBefore: number; scoreAfter: number }[];
  let prev = 0;
  for (const e of ledger) {
    if (!isLedgerEntryConsistent(e as never)) return `ledger entry ${e.shotId} is inconsistent`;
    if (e.scoreBefore !== prev) return 'ledger does not chain';
    prev = e.scoreAfter;
  }
  if (s.score !== prev) return 'score does not match the ledger';

  // in-flight marker and ledger length
  const inFlight = s.inFlight;
  if (inFlight !== null) {
    if (!isObj(inFlight) || !isStr(inFlight.shotId) || inFlight.shotNumber !== shots || !isObj(inFlight.request) || inFlight.request.shotId !== inFlight.shotId) return 'invalid inFlight marker';
    if (phase !== 'resolving' && phase !== 'abandoned') return 'inFlight marker in a stable phase';
    if (inFlight.stage !== undefined && (!expanded || !['flight', 'question', 'postEffects'].includes(inFlight.stage as string))) return 'invalid inFlight stage';
    if (!expanded && (inFlight.barrier !== undefined || inFlight.plan !== undefined)) return 'expanded inFlight fields in a rules-v1 state';
    if (inFlight.barrier !== undefined && !isObj(inFlight.barrier)) return 'invalid inFlight barrier';
    if (inFlight.plan !== undefined && !isObj(inFlight.plan)) return 'invalid inFlight plan';
  } else if (phase === 'resolving') return 'resolving without an inFlight marker';
  const lost = inFlight !== null || phase === 'resolving';
  if (phase === 'abandoned') {
    if (ledger.length !== shots && ledger.length !== shots - 1) return 'ledger length does not match shotsFired';
  } else if (ledger.length !== shots - (lost ? 1 : 0)) return 'ledger length does not match shotsFired';

  // collection
  if (!Array.isArray(s.collected)) return 'invalid collected';
  const collectedIds = new Set<string>();
  const collectedTypes = new Set<string>();
  for (const c of s.collected) {
    if (!isObj(c) || !isStr(c.instanceId) || !isPrizeTypeId(c.typeId) || !catalog.prizes.has(c.typeId) || !isStr(c.shotId)) return 'invalid collected entry';
    if (collectedIds.has(c.instanceId)) return 'a prize instance was collected twice';
    collectedIds.add(c.instanceId);
    collectedTypes.add(c.typeId);
  }
  if (!Array.isArray(s.collectedTypeIds) || new Set(s.collectedTypeIds).size !== s.collectedTypeIds.length) return 'invalid collectedTypeIds';
  if (s.collectedTypeIds.length !== collectedTypes.size || !s.collectedTypeIds.every((t) => typeof t === 'string' && collectedTypes.has(t))) return 'collectedTypeIds do not match collected';

  // sets
  if (!Array.isArray(s.completedSets) || new Set(s.completedSets).size !== s.completedSets.length) return 'invalid completedSets';
  for (const id of s.completedSets) {
    if (!isSetId(id)) return 'invalid set id';
    const cfg = catalog.sets.get(id as SetId);
    if (!cfg) return `unknown set ${String(id)}`;
    if (!cfg.requiredTypeIds.every((t) => collectedTypes.has(t))) return `set ${id} is completed without its kinds`;
  }

  // first hits
  if (!Array.isArray(s.firstHitsScored) || new Set(s.firstHitsScored).size !== s.firstHitsScored.length) return 'invalid firstHitsScored';
  const parts = new Set(layout.shopkeeper.map((p) => `shopkeeper:${p.part}`));
  const hidden = new Set(layout.hiddenTargets.map((h) => `hidden:${h.targetId}`));
  for (const k of s.firstHitsScored) if (typeof k !== 'string' || !(parts.has(k) || hidden.has(k))) return 'unknown first-hit key';

  // shelf
  const shelf = s.shelf;
  if (!isObj(shelf) || !Array.isArray(shelf.prizes) || !Array.isArray(shelf.deferredSlots) || !isInt(shelf.nextInstanceNumber, 1)) return 'invalid shelf';
  if (shelf.prizes.length > tuning.shelfSlotCount) return 'too many prizes on the shelf';
  const seen = new Set<string>();
  for (const p of shelf.prizes) {
    if (!isObj(p) || !isStr(p.instanceId) || !isPrizeTypeId(p.typeId) || !isPrizeTypeId(p.drawnTypeId) || !isSlotId(p.homeSlot)) return 'invalid prize on the shelf';
    if (expanded) {
      if (!layout.slots.some((g) => g.slotId === p.homeSlot)) return 'prize home slot is not in the layout';
      if (p.motionTypeId !== undefined && !(isPrizeTypeId(p.motionTypeId) && catalog.prizes.has(p.motionTypeId))) return 'unknown motionTypeId';
    }
    const cfg = catalog.prizes.get(p.typeId);
    if (!cfg || !catalog.prizes.has(p.drawnTypeId)) return 'unknown prize type on the shelf';
    if (seen.has(p.instanceId) || collectedIds.has(p.instanceId)) return 'duplicate prize instance';
    seen.add(p.instanceId);
    if (!isNum(p.hp) || !isNum(p.maxHp) || p.maxHp <= 0 || p.hp < 0 || p.hp > p.maxHp + 1e-9) return 'invalid prize hp';
    if (!isPose(p.pose) || typeof p.mounted !== 'boolean' || p.collected !== false) return 'invalid prize pose or flags';
    const n = Number.parseInt(p.instanceId.slice(1), 10);
    if (!Number.isInteger(n) || n >= shelf.nextInstanceNumber) return 'instance number is not below nextInstanceNumber';
  }
  if (!shelf.deferredSlots.every((d) => isSlotId(d)) || new Set(shelf.deferredSlots).size !== shelf.deferredSlots.length) return 'invalid deferredSlots';

  // draw state
  const d = s.draw;
  if (!isObj(d) || !isValidRngState(d.rng) || !isInt(d.drawCount) || !Array.isArray(d.history) || !d.history.every((t) => isPrizeTypeId(t) && catalog.prizes.has(t))) return 'invalid draw state';
  if (expansion !== null) {
    const shelfIds = new Set<string>(shelf.prizes.map((p) => (p as Obj).instanceId as string));
    return validateExpansionState(s, expansion, layout, tuning, catalog, shots, phase, shelfIds);
  }
  return null;
}

const uniq = (a: readonly unknown[]): boolean => new Set(a).size === a.length;

function validateReservation(r: unknown, exp: ExpansionCatalog, tuning: TuningConfig): string | null {
  if (!isObj(r) || !isObj(r.modifiers)) return 'invalid reservation';
  const m = r.modifiers;
  const lim = exp.profile.limits;
  const within = (v: unknown, range: { readonly min: number; readonly max: number }): boolean => isNum(v) && v >= range.min - 1e-9 && v <= range.max + 1e-9;
  if (!within(m.damageMult, lim.damagePushMult) || !within(m.pushMult, lim.damagePushMult)) return 'reservation damage/push outside the limits';
  if (!within(m.speedMult, lim.speedMult)) return 'reservation speed outside the limits';
  if (!within(m.gravityMult, lim.gravityMult)) return 'reservation gravity outside the limits';
  if (!within(m.restitutionMult, lim.restitutionMult)) return 'reservation restitution outside the limits';
  if (!within(m.swayMult, lim.swayMult)) return 'reservation sway outside the limits';
  if (!within(m.loadPeriodMult, lim.loadPeriodMult)) return 'reservation load period outside the limits';
  if (!within(m.radiusMult, lim.radiusMult)) return 'reservation radius outside the limits';
  if (!within(m.splitSpreadMult, lim.splitSpreadMult)) return 'reservation split spread outside the limits';
  if (!Number.isInteger(m.extraReflections) || !within(m.extraReflections, lim.reflections)) return 'reservation extraReflections outside the limits';
  if (m.bulletType !== null && !(typeof m.bulletType === 'string' && m.bulletType in tuning.bulletTypes)) return 'reservation bulletType unknown';
  const l = m.launch;
  if (!isObj(l) || (l.count !== 1 && l.count !== 2 && l.count !== 3) || !isNum(l.spreadRad) || l.spreadRad < 0) return 'invalid reservation launch';
  if (r.hint !== null && !(typeof r.hint === 'string' && (HINT_KINDS as readonly string[]).includes(r.hint))) return 'unknown hint';
  return null;
}

function validateExpansionState(s: Obj, exp: ExpansionCatalog, layout: BoothLayout, tuning: TuningConfig, catalog: RuntimeCatalog, shots: number, phase: string, shelfIds: ReadonlySet<string>): string | null {
  const x = s.expansion;
  if (!isObj(x)) return 'expansion state missing';
  const geoms = layout.backgroundCells;
  if (!geoms) return 'layout has no background cells';
  if (!Array.isArray(x.cells) || x.cells.length !== geoms.length) return 'wrong number of background cells';
  const requests = new Set<string>();
  for (let i = 0; i < geoms.length; i++) {
    const c = x.cells[i] as unknown;
    if (!isObj(c) || c.cellId !== geoms[i]!.cellId) return 'background cells are out of order';
    if (typeof c.effectId !== 'string' || !exp.effects.has(c.effectId as never)) return 'unknown cell effect';
    if (typeof c.used !== 'boolean') return 'invalid cell used flag';
    if (c.used) {
      if (typeof c.usedOnShot !== 'string' || c.usedOnShot === '') return 'used cell without a shot';
      const n = Number.parseInt(c.usedOnShot.slice(c.usedOnShot.lastIndexOf('-') + 1), 10);
      if (Number.isInteger(n) && n > shots) return 'cell used on a shot that was not fired';
      if (typeof c.requestId !== 'string' || c.requestId === '' || requests.has(c.requestId)) return 'cell request id missing or repeated';
      requests.add(c.requestId);
    } else if (c.usedOnShot !== null || c.requestId !== null) return 'unused cell with shot data';
  }
  if (!Array.isArray(x.questionOrder) || x.questionOrder.length !== exp.questions.size || !uniq(x.questionOrder) || !x.questionOrder.every((q) => typeof q === 'string' && exp.questions.has(q as never))) {
    return 'questionOrder is not a permutation of the questions';
  }
  if (!isInt(x.questionCursor) || x.questionCursor > x.questionOrder.length || x.questionCursor > shots) return 'invalid questionCursor';
  const nextProblem = validateReservation(x.next, exp, tuning);
  if (nextProblem !== null) return nextProblem;
  if (x.active !== null) {
    if (phase !== 'resolving') return 'active reservation in a stable phase';
    const p = validateReservation(x.active, exp, tuning);
    if (p !== null) return p;
  }
  for (const k of ['assortmentSeries', 'outlineSeries']) {
    const v = x[k];
    if (v !== null && !(typeof v === 'string' && exp.series.has(v as never))) return `unknown ${k}`;
  }
  if (!Array.isArray(x.deferredTransforms)) return 'invalid deferredTransforms';
  const seen = new Set<string>();
  for (const d of x.deferredTransforms) {
    if (!isObj(d) || typeof d.instanceId !== 'string' || !shelfIds.has(d.instanceId) || seen.has(d.instanceId)) return 'invalid deferred transform';
    seen.add(d.instanceId);
    if (typeof d.requestId !== 'string' || d.requestId === '') return 'invalid deferred transform request';
    if (!Array.isArray(d.candidateTypeIds) || d.candidateTypeIds.length === 0 || !d.candidateTypeIds.every((t) => isPrizeTypeId(t) && catalog.prizes.has(t))) return 'invalid deferred transform candidates';
  }
  const rng = x.rng;
  if (!isObj(rng) || !isValidRngState(rng.cells) || !isValidRngState(rng.questions) || !isValidRngState(rng.effects)) return 'invalid expansion rng';
  return null;
}
