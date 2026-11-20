import { aimAt } from './aim-at';
import { aimThrough } from './aim-v3';
import { rewardConfigOf, rewardDevicesFor } from '../../src/core/rewards';
import { GameController, type RulesApi } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { createExpandedRun } from '../../src/core/expanded-run';
import { createShotWorld } from '../../src/sim/world';
import {
  isAmmoBalanced,
  isExpandedRunState,
  isPairSetId,
  mintId,
  type EffectPlan,
  type RewardId,
  type RunState,
  type ShotSummary,
  type GameplayBundle,
  type PrizeTypeId,
  type ShotRecord,
  type Vec3,
} from '../../src/contracts';

export const SEEDS = Array.from({ length: 24 }, (_, i) => (i + 1) * 7919);
const LOAD_BARS = [0.85, 0.82, 0.88, 0.78, 0.9];

interface ShotStats {
  plans: EffectPlan[];
  records: ShotRecord[];
}

export interface ProbeShot {
  beforeFire: RunState;
  afterShot: RunState;
  gameTick: number;
  summary: ShotSummary;
}

export async function playRun(b: GameplayBundle, seed: number, observeShot?: (shot: ProbeShot) => void, targetKinds: readonly PrizeTypeId[] = []) {
  const rewardConfig = rewardConfigOf(b.expansion);
  const world = await createShotWorld(b.layout, b.catalog, b.tuning, { rewardDevices: rewardDevicesFor(rewardConfig), transformPolicy: b.behavior?.transformPolicy });
  const stats: ShotStats = { plans: [], records: [] };
  const attempts: Partial<Record<RewardId, number>> = {};
  const rules: RulesApi = {
    ...CORE_RULES,
    resolveShot: (state, record, catalog, tuning) => {
      stats.records.push(record);
      return CORE_RULES.resolveShot(state, record, catalog, tuning);
    },
    resolveExpandedShot: (s, rec, ctx) => {
      if (s.inFlight?.plan) stats.plans.push(s.inFlight.plan);
      stats.records.push(rec);
      return CORE_RULES.resolveExpandedShot!(s, rec, ctx);
    },
  };
  const config = { runId: mintId.run(`probe-${b.key}-${seed}`), seed, tuning: b.tuning, playerName: null };
  const initial = b.expansion ? createExpandedRun(config, { ...b, expansion: b.expansion }) : CORE_RULES.createRun(config, b.catalog);
  const c = new GameController({ rules, clockPolicy: b.behavior?.clock, transformPolicy: b.behavior?.transformPolicy, world, renderer: null, catalog: b.catalog, tuning: b.tuning, layout: b.layout, expansion: b.expansion }, initial);
  let rng = seed >>> 0;
  const rand = () => {
    rng = (Math.imul(rng ^ (rng >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
    return rng / 2 ** 32;
  };
  const cam = b.layout.camera;
  let questions = 0;
  let missShots = 0;
  let maxCorks = 0;
  const started = performance.now();
  for (let guard = 0; c.current.phase !== 'ended' && guard < 25; guard++) {
    const s0 = c.current;
    const roll = rand();
    let target: Vec3;
    let standX: number;
    const cells = b.layout.backgroundCells ?? [];
    const wanted = s0.shelf.prizes.find(p => targetKinds.includes(p.typeId) && !s0.collectedTypeIds.includes(p.typeId));
    if (wanted) {
      target = wanted.pose.position;
      standX = Math.min(cam.standMaxX, Math.max(cam.standMinX, target.x + (rand() - 0.5) * 0.3));
    } else if (b.expansion && roll < 0.1) {
      const body = b.layout.shopkeeper.find((p) => p.part === 'body')!.box.center;
      standX = cam.standMaxX;
      target = { x: body.x, y: 1.1, z: body.z + 0.1 };
    } else if (b.expansion && roll < 0.3 && cells.length > 0) {
      const cell = cells[Math.floor(rand() * cells.length)]!;
      standX = Math.min(cam.standMaxX, Math.max(cam.standMinX, cell.box.center.x));
      target = { x: cell.box.center.x + (rand() < 0.5 ? -0.12 : 0.12), y: cell.box.center.y - 0.05, z: cell.box.center.z };
    } else {
      const pick = s0.shelf.prizes[Math.floor(rand() * s0.shelf.prizes.length)]!;
      standX = Math.min(cam.standMaxX, Math.max(cam.standMinX, pick.pose.position.x + (rand() - 0.5) * 0.3));
      target = pick.pose.position;
    }
    const aimFirst = b.behavior?.controls === 'aim-first';
    c.dispatch({ type: 'SET_POSITION', x: standX });
    if (aimFirst) {
      // r007: aim first (no sway), then open the gauge; the same bar targets as the other versions.
      const st = c.current;
      const bt0 = isExpandedRunState(st) ? (st.expansion.next.modifiers.bulletType ?? st.bulletType) : st.bulletType;
      c.dispatch({ type: 'AIM', ...(aimThrough(b, st.standX, target) ?? aimAt(b, st.standX, target, bt0)) });
      c.dispatch({ type: 'OPEN_GAUGE' });
    } else c.dispatch({ type: 'CONFIRM_POSITION' });
    const bar = LOAD_BARS[Math.floor(rand() * LOAD_BARS.length)]!;
    const period = b.tuning.loading.barPeriodSec * (isExpandedRunState(c.current) ? c.current.expansion.next.modifiers.loadPeriodMult : 1);
    let left = (bar * period) / 2;
    while (left > 1e-9) {
      const dt = Math.min(0.05, left);
      c.frame(dt);
      left -= dt;
    }
    if (!aimFirst) c.dispatch({ type: 'STOP_LOAD' });
    const s1 = c.current;
    const bt = isExpandedRunState(s1) ? (s1.expansion.next.modifiers.bulletType ?? s1.bulletType) : s1.bulletType;
    if (!aimFirst) {
      c.dispatch({ type: 'AIM', ...aimAt(b, s1.standX, target, bt) });
      for (let i = 0; i < 5; i++) c.frame(0.1);
    }
    const beforeFire = c.current;
    const gameTick = c.gameTick;
    if (!c.dispatch({ type: 'FIRE' })) throw new Error(`FIRE rejected in ${s1.phase}`);
    // Count an opportunity at an accepted FIRE, using the offer visible
    // before the shot. A missed target still contributes to its denominator.
    const r = s1.expansion?.rewards;
    if (r && rewardConfig) {
      const eligible: Record<RewardId, boolean> = {
        A1: !!r.bag && !r.bag.used, A2: !r.chimeUsed, A3: !r.seesawUsed,
        A4: !r.piggyDone, A5: r.target?.forShot === s1.shotsFired + 1,
        A6: r.stampsReached.length < rewardConfig.stamps.milestones.length,
        A7: true, A8: true, A9: r.order?.status === 'accepted', A10: !r.lanternsDone,
      };
      for (const id of rewardConfig.enabled) {
        if (eligible[id]) attempts[id] = (attempts[id] ?? 0) + 1;
      }
    }
    for (let i = 0; i < 6000 && c.current.phase === 'resolving'; i++) {
      if (c.awaitingAnswer) {
        const f = c.current.inFlight!;
        questions += 1;
        c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: f.shotId, questionId: f.plan!.question!.questionId, choice: rand() < 0.5 ? 'A' : 'B' });
        continue;
      }
      c.frame(1 / 60);
      maxCorks = Math.max(maxCorks, world.frame().projectiles.length);
    }
    if (c.current.phase === 'resolving') throw new Error('a shot never settled');
    const last = c.snapshot().lastSummary!;
    if (last.collected.length === 0) missShots += 1;
    if (observeShot) observeShot({ beforeFire, afterShot: c.current, gameTick, summary: last });
  }
  const end = c.current;
  if (end.phase !== 'ended') throw new Error(`incomplete run: ${b.key}/${seed}`);
  world.dispose();
  const kindOf = (fx: string | null) => (fx && b.expansion ? (b.expansion.effects.get(fx as never)?.operation.kind ?? 'unknown') : '-');
  const effects: Record<string, { applied: number; notApplicable: number }> = {};
  for (const p of stats.plans)
    for (const e of p.processed) {
      const k = `${e.source.kind}:${kindOf(e.effectId)}`;
      effects[k] ??= { applied: 0, notApplicable: 0 };
      effects[k]![e.outcome === 'applied' ? 'applied' : 'notApplicable'] += 1;
    }
  const intents = stats.plans.reduce((n, p) => n + p.transforms.length, 0);
  const applied = stats.records.reduce((n, r) => n + (r.appliedTransforms?.length ?? 0), 0);
  const deferredAtShot = stats.records.reduce((n, r) => n + (r.deferredTransforms?.length ?? 0), 0);
  return {
    seed,
    score: end.score,
    shots: end.shotsFired,
    prizes: end.collected.length,
    trioSets: end.completedSets.filter((id) => !isPairSetId(id)).length,
    pairSets: end.completedSets.filter((id) => isPairSetId(id)).length,
    bonusAmmo: end.bonusAmmoTotal,
    ammoLost: end.ammoLostTotal ?? 0,
    questions,
    cellsUsed: end.expansion?.cells.filter((x) => x.used).length ?? 0,
    /** T09: shots that won no prize, and the used cells by wall (layout v3 faces; 'back' otherwise). */
    missShots,
    usedCellIds: end.expansion?.cells.filter((x) => x.used).map((x) => x.cellId as string) ?? [],
    transformIntents: intents,
    transformsApplied: applied,
    transformsDeferredAtShotEnd: deferredAtShot,
    maxCorks,
    attempts,
    rewards: end.expansion?.rewards?.outcomes ?? [],
    occupiedSlotsDeferred: end.shelf.deferredSlots.length,
    noTransformCandidateAtShotEnd: deferredAtShot,
    zonesLit: end.expansion?.rewards?.lanternsLit ?? [],
    gameSeconds: end.clocks.motionSec,
    shotSeconds: stats.records.reduce((total, shot) => total + shot.simTimeSec, 0),
    ammoBalanced: isAmmoBalanced(end, b.tuning.initialAmmo),
    effects,
    wallMs: Math.round(performance.now() - started),
  };
}
