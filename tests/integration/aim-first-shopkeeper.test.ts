import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { answerShopkeeper, planFlightEnd } from '../../src/core/effect-plan';
import { resolveExpandedShot } from '../../src/core/expanded-settlement';
import { spawnPrize } from '../../src/core/replenish';
import { powerZoneWidthFor } from '../../src/core/aim-first';
import { validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import {
  aimDirection,
  asPrizeTypeId,
  isAmmoBalanced,
  mintId,
  muzzlePosition,
  type EffectGroupId,
  type EffectId,
  type ExpandedRunState,
  type ExpansionCatalog,
  type FlightBarrier,
  type ImpactEvent,
  type RunState,
  type ShotRecord,
  type ShotSummary,
  type Vec3,
} from '../../src/contracts';
import { aimThrough } from '../helpers/aim-v3';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

const B = getGameplayBundle('expanded-aim-first');
const { layout: L, catalog, tuning } = B;
const EXP = B.expansion!;
const CTX = { tuning, catalog, layout: L, expansion: EXP, transformPolicy: B.behavior!.transformPolicy };
const fan = L.reflectors!.find((r) => r.reflectorId === 'fan')!;
const tray = L.reflectors!.find((r) => r.reflectorId === 'tray')!;
const part = (p: 'hat' | 'body' | 'feet') => L.shopkeeper.find((x) => x.part === p)!.box;

/** A fixed display: the same narrow prize in all 36 slots (reproducible reflections). */
function fixedRun(seed: number, over: Partial<ExpandedRunState> = {}): ExpandedRunState {
  const base = createExpandedRun({ runId: mintId.run(`r007-sk-${seed}`), seed, tuning, playerName: null }, { catalog, tuning, layout: L, expansion: EXP });
  const prizes = L.slots.map((slot, i) => spawnPrize(catalog, asPrizeTypeId('P009'), slot, i + 1, 0));
  const r = base.expansion.rewards!;
  return {
    ...base,
    shelf: { prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 },
    // the order card is answered and the A1 bag points nowhere, so only the shopkeeper acts
    expansion: { ...base.expansion, rewards: { ...r, order: r.order ? { ...r.order, status: 'declined' } : null, bag: null } },
    ...over,
  };
}

async function controller(initial: RunState) {
  const world = await createShotWorld(L, catalog, tuning, { transformPolicy: B.behavior!.transformPolicy });
  const settled: ShotSummary[] = [];
  const impacts: ImpactEvent[] = [];
  const c = new GameController(
    {
      rules: CORE_RULES, world, renderer: null, catalog, tuning, layout: L, expansion: EXP, transformPolicy: B.behavior!.transformPolicy,
      clockPolicy: 'fixed',
      onShotSettled: (s) => settled.push(s),
      onSimEvents: (es) => impacts.push(...es.filter((e): e is ImpactEvent => e.type === 'impact')),
    },
    initial,
  );
  return { c, world, settled, impacts };
}

/** Move and aim with the normal commands, open the gauge, wait for a good bar, fire. */
function shootAt(c: GameController, standX: number, target: Vec3): void {
  const aim = aimThrough(B, standX, target);
  expect(aim, `aim for ${JSON.stringify(target)} from ${standX}`).not.toBeNull();
  c.dispatch({ type: 'SET_POSITION', x: standX });
  expect(c.current.standX).toBe(standX);
  c.dispatch({ type: 'AIM', ...aim! });
  expect(c.dispatch({ type: 'OPEN_GAUGE' })).toBe(true);
  for (let i = 0; i < 36; i++) c.frame(1 / 60); // ~0.6 s → bar near the sweet spot
  expect(c.dispatch({ type: 'FIRE' })).toBe(true);
}

/** Run the shot; answer any question with `choice`; stop once settled. */
function finish(c: GameController, settled: ShotSummary[], choice: 'A' | 'B' = 'A'): { summary: ShotSummary; asked: boolean } {
  const before = settled.length;
  let asked = false;
  for (let i = 0; i < 4000 && settled.length === before; i++) {
    if (c.awaitingAnswer) {
      asked = true;
      const q = c.current.inFlight!.plan!.question!;
      expect(c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: c.current.inFlight!.shotId, questionId: q.questionId, choice })).toBe(true);
    }
    c.frame(1 / 60);
  }
  expect(settled.length).toBe(before + 1);
  return { summary: settled.at(-1)!, asked };
}

describe('4a: the humanoid shopkeeper, parts, fan and tray in the real world', () => {
  it('hat: 30 points, +1 cork on its first hit, one question; the second hat hit asks again but pays nothing', async () => {
    const { c, world, settled } = await controller(fixedRun(1));
    try {
      const hat = part('hat');
      shootAt(c, 2.65, { x: hat.center.x, y: hat.center.y, z: hat.center.z + hat.halfExtents.z });
      const first = finish(c, settled);
      expect(first.asked).toBe(true);
      const hatOut = first.summary.parts!.find((p) => p.part === 'hat')!;
      expect(hatOut).toMatchObject({ first: true, firstPoints: 30, effect: 'ammo', ammoRequested: 1, ammoGranted: 1, reason: null });
      expect(first.summary.ledger.items).toContainEqual({ kind: 'shopkeeper', refId: 'hat', points: 30 });
      expect(c.current.phase).toBe('aiming');
      expect(isAmmoBalanced(c.current, tuning.initialAmmo)).toBe(true);
      const ammoBefore = c.current.ammo;
      shootAt(c, 2.65, { x: hat.center.x, y: hat.center.y, z: hat.center.z + hat.halfExtents.z });
      const second = finish(c, settled);
      expect(second.asked).toBe(true);
      expect(second.summary.parts!.find((p) => p.part === 'hat')).toMatchObject({ first: false, firstPoints: 0, effect: 'none', ammoGranted: 0, reason: 'alreadyHit' });
      expect(second.summary.ledger.items.filter((i) => i.kind === 'shopkeeper')).toEqual([]);
      // nothing extra from the hat: only what the answer did changes the count
      const answerDelta = (second.summary.effects ?? []).reduce((a, e) => a + e.ammoDelta, 0);
      expect(c.current.ammo).toBe(ammoBefore - 1 + answerDelta);
    } finally {
      world.dispose();
    }
  });

  it('feet: 15 points and a 1.25 power zone for the next shot (kept only when nothing later overwrote it)', async () => {
    const { c, world, settled } = await controller(fixedRun(2));
    try {
      const feet = part('feet');
      shootAt(c, 2.65, { x: feet.center.x - 0.05, y: feet.center.y + 0.02, z: feet.center.z + feet.halfExtents.z });
      const { summary } = finish(c, settled);
      const out = summary.parts!.find((p) => p.part === 'feet')!;
      expect(out.firstPoints).toBe(15);
      expect(out.effect).toBe('powerZone');
      const kept = powerZoneWidthFor(c.current);
      if (out.powerZoneWidthMult === null) expect(out.reason).toBe('overwritten');
      else expect(kept).toBe(1.25);
    } finally {
      world.dispose();
    }
  });

  it('body: 10 points and a pair hint chosen from the shelf after the shot', async () => {
    const { c, world, settled } = await controller(fixedRun(3));
    try {
      const body = part('body');
      // right of the tray and the fan, which stand in front of the body
      shootAt(c, 2.65, { x: body.center.x + 0.1, y: 1.0, z: body.center.z + body.halfExtents.z });
      const { summary } = finish(c, settled);
      const out = summary.parts!.find((p) => p.part === 'body')!;
      expect(out).toMatchObject({ first: true, firstPoints: 10, effect: 'setHint' });
      expect(out.hint).not.toBeNull();
    } finally {
      world.dispose();
    }
  });

  it('fan: one contact on the front face (one part hit, one reflection) sends the cork on to knock a middle-row prize down', async () => {
    const { c, world, settled, impacts } = await controller(fixedRun(4));
    try {
      shootAt(c, 2.4, { x: fan.center.x, y: fan.center.y + 0.04, z: fan.center.z });
      const { summary, asked } = finish(c, settled);
      const fanHits = impacts.filter((i) => i.target.kind === 'shopkeeper' && i.target.part === 'fan');
      expect(fanHits).toHaveLength(1);
      expect(fanHits[0]!.target).toMatchObject({ face: 'front' });
      const after = impacts.slice(impacts.indexOf(fanHits[0]!) + 1);
      expect(after.find((i) => i.target.kind === 'prize')).toBeDefined();
      expect(summary.collected.length).toBeGreaterThanOrEqual(1);
      expect(summary.collected.some((p) => /^i00(1[3-9]|2[0-4])$/.test(p.instanceId))).toBe(true); // a middle-row slot
      expect(summary.ledger.items.filter((i) => i.kind === 'shopkeeper')).toEqual([{ kind: 'shopkeeper', refId: 'fan', points: 20 }]);
      expect(summary.touchedFirstHitTargets).toEqual(['shopkeeper:fan']);
      expect(asked).toBe(true);
      expect(summary.ledger.items.some((i) => i.kind === 'trick')).toBe(true); // the existing reflection-take bonus
    } finally {
      world.dispose();
    }
  });

  it('T04: the fan is round where it is drawn (a square corner is not the fan) and the forearm counts as the body', async () => {
    expect(fan.shape).toBe('disc');
    // a point in the panel's own frame, turned into the world (yaw -0.62 about y)
    const onPanel = (u: number, v: number): Vec3 => ({ x: fan.center.x + u * Math.cos(-0.62), y: fan.center.y + v, z: fan.center.z - u * Math.sin(-0.62) });
    const corner = await controller(fixedRun(41));
    try {
      // 0.105 along both edges: inside the old 0.12 square, outside the 0.12 circle (0.148 from the middle)
      shootAt(corner.c, 2.4, onPanel(0.105, 0.105));
      finish(corner.c, corner.settled);
      expect(corner.impacts.some((i) => i.target.kind === 'shopkeeper' && i.target.part === 'fan')).toBe(false);
    } finally {
      corner.world.dispose();
    }
    const inside = await controller(fixedRun(42));
    try {
      shootAt(inside.c, 2.4, onPanel(0.06, 0.06)); // 0.085 from the middle: on the disc
      finish(inside.c, inside.settled);
      expect(inside.impacts[0]?.target).toMatchObject({ kind: 'shopkeeper', part: 'fan' });
    } finally {
      inside.world.dispose();
    }
    const arm = L.shopkeeper.filter((p) => p.part === 'body')[1]!.box;
    const fore = await controller(fixedRun(43));
    try {
      // below the fan's lower edge, on the forearm's front face
      shootAt(fore.c, 2.65, { x: arm.center.x, y: arm.center.y - arm.halfExtents.y + 0.02, z: arm.center.z + arm.halfExtents.z });
      const { summary } = finish(fore.c, fore.settled);
      expect(fore.impacts[0]?.target).toMatchObject({ kind: 'shopkeeper', part: 'body' });
      expect(summary.touchedFirstHitTargets).toEqual(['shopkeeper:body']);
    } finally {
      fore.world.dispose();
    }
  });

  it('tray: the reflected cork knocks a bottom-row prize down; no shopkeeper points and no question', async () => {
    const { c, world, settled, impacts } = await controller(fixedRun(5));
    try {
      shootAt(c, 2.0, { x: tray.center.x - 0.04 * Math.cos(0.62), y: tray.center.y + 0.04, z: tray.center.z - 0.04 * Math.sin(0.62) });
      const { summary, asked } = finish(c, settled);
      const trayHits = impacts.filter((i) => i.target.kind === 'surface' && i.target.surfaceId === 'reflector-tray');
      expect(trayHits.length).toBeGreaterThanOrEqual(1);
      expect(summary.collected.some((p) => /^i00(2[5-9]|3[0-6])$/.test(p.instanceId))).toBe(true); // a bottom-row slot
      expect(asked).toBe(false);
      expect(summary.ledger.items.filter((i) => i.kind === 'shopkeeper')).toEqual([]);
      expect(summary.parts ?? []).toEqual([]);
    } finally {
      world.dispose();
    }
  });

  it('the cells behind the shopkeeper are covered by the body: a body shot uses no cell', async () => {
    const w = await createShotWorld(L, catalog, tuning, { transformPolicy: B.behavior!.transformPolicy });
    try {
      w.syncShelf({ prizes: [], deferredSlots: [], nextInstanceNumber: 1 }, 0);
      const body = part('body');
      const aim = aimThrough(B, 2.65, { x: body.center.x + 0.1, y: 1.0, z: body.center.z + body.halfExtents.z })!;
      const run = runExpanded(w, makeRequest({ origin: muzzlePosition(L, 2.65), direction: aimDirection(L, 2.65, aim) }), expandedCtx({ usableCells: L.backgroundCells!.map((x) => x.cellId) }), { dt: tuning.limits.fixedStepSec });
      expect(run.impacts[0]!.target, JSON.stringify(run.impacts[0])).toMatchObject({ kind: 'shopkeeper', part: 'body' });
    } finally {
      w.dispose();
    }
  });
});

// ------------------------------------------------------------ 4b ordering

function inFlight(state: ExpandedRunState): ExpandedRunState {
  const fired = CORE_RULES.reduceGame(CORE_RULES.reduceGame(state, { type: 'OPEN_GAUGE' }, CTX), { type: 'FIRE' }, CTX) as ExpandedRunState;
  expect(fired.phase).toBe('resolving');
  return fired;
}

function barrier(s: ExpandedRunState, parts: FlightBarrier['shopkeeperParts']): FlightBarrier {
  return {
    runId: s.runId, shotId: s.inFlight!.shotId, barrierId: mintId.barrier(s.inFlight!.shotId), requests: [], shopkeeperHit: parts.length > 0,
    shopkeeperParts: parts, collectedDuringFlight: [], prizes: s.shelf.prizes, motion: [], simTimeSec: 1,
  };
}

function record(s: ExpandedRunState, firstHits: string[]): ShotRecord {
  return {
    runId: s.runId, shotId: s.inFlight!.shotId, collected: [], prizeOutcomes: [], deviceActivations: [], firstHitCandidates: firstHits as never,
    transforms: [], endedByLimit: false, remainingPrizes: s.shelf.prizes, simTimeSec: 1, barrierId: s.inFlight!.plan!.barrierId, appliedTransforms: [], deferredTransforms: [],
    rewardContacts: { targetHit: null, chimeAfterReflection: false, seesawInstances: [], piggyDeposit: false },
  };
}

/** An expansion where both answers of every question draw exactly `effect`. */
function forcing(effect: string): ExpansionCatalog {
  const groups = new Map([...EXP.groups].map(([id, g]) => [id, { ...g, effectIds: [effect as EffectId] }] as [EffectGroupId, typeof g]));
  return { ...EXP, groups };
}

function settleWith(s: ExpandedRunState, parts: FlightBarrier['shopkeeperParts'], hits: string[], answer: 'A' | null, expansion = EXP) {
  const ctx = { ...CTX, expansion };
  let planned = planFlightEnd(s, barrier(s, parts), ctx) as ExpandedRunState;
  if (answer) {
    const q = planned.inFlight!.plan!.question!;
    planned = answerShopkeeper(planned, { type: 'ANSWER_SHOPKEEPER', shotId: planned.inFlight!.shotId, questionId: q.questionId, choice: answer }, ctx) as ExpandedRunState;
  }
  return resolveExpandedShot(planned, record(planned, hits), ctx);
}

describe('4b: one shot, every part once, in a fixed order', () => {
  it('a split cork on the hat twice and the feet once: 45 first points, one ammo request, one question', () => {
    const s = inFlight(fixedRun(10, { ammo: 5, shotsFired: 5 }));
    const planned = planFlightEnd(s, barrier(s, ['hat', 'feet']), CTX) as ExpandedRunState;
    expect(planned.inFlight!.stage).toBe('question');
    expect(planned.inFlight!.plan!.parts!.map((p) => p.part)).toEqual(['hat', 'feet']);
    const { summary } = settleWith(s, ['hat', 'feet'], ['shopkeeper:hat', 'shopkeeper:hat', 'shopkeeper:feet'], 'A');
    expect(summary.ledger.firstHitPoints).toBe(45);
    expect(summary.parts!.filter((p) => p.effect === 'ammo')).toHaveLength(1);
    expect(summary.parts![0]).toMatchObject({ part: 'hat', ammoRequested: 1 });
  });

  it('the last cork on the hat: +1 then the answer, and the end is decided only after both', () => {
    const s = inFlight(fixedRun(11, { ammo: 1, shotsFired: 9 }));
    expect(s.ammo).toBe(0);
    const { state, summary } = settleWith(s, ['hat'], ['shopkeeper:hat'], 'A', forcing('FX001'));
    expect(summary.parts![0]).toMatchObject({ effect: 'ammo', ammoGranted: 1 });
    expect(summary.runEnded).toBe(false);
    expect(state.phase).toBe('aiming');
    expect(state.ammo).toBeGreaterThanOrEqual(1);
  });

  it('the last cork on the hat and the feet: ammo is 0 in the middle, yet the +1 and the 1.25 zone both survive to the next shot', () => {
    const s = inFlight(fixedRun(16, { ammo: 1, shotsFired: 9 }));
    expect(s.ammo).toBe(0);
    const { state, summary } = settleWith(s, ['hat', 'feet'], ['shopkeeper:hat', 'shopkeeper:feet'], 'A', forcing('FX001'));
    expect(summary.runEnded).toBe(false);
    expect(summary.parts!.find((p) => p.part === 'feet')).toMatchObject({ powerZoneWidthMult: 1.25, reason: null });
    expect(powerZoneWidthFor(state)).toBe(1.25);
  });

  it('at the cap the hat still scores but gives +0 with the reason; with no cork left the run ends after the answer', () => {
    const capped = fixedRun(12, { ammo: 1, shotsFired: 19, bonusAmmoTotal: 10 });
    const s = inFlight(capped);
    const { state, summary } = settleWith(s, ['hat'], ['shopkeeper:hat'], 'A', forcing('FX004'));
    expect(summary.parts![0]).toMatchObject({ first: true, firstPoints: 30, effect: 'ammo', ammoGranted: 0, reason: 'noAmmoRoom' });
    expect(summary.runEnded).toBe(true);
    expect(state.phase).toBe('ended');
  });

  it('feet then an answer that resets (FX082): the 1.25 zone is gone and the result says so', () => {
    const s = inFlight(fixedRun(13, { ammo: 5, shotsFired: 5 }));
    const { state, summary } = settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX082'));
    expect(summary.effects!.at(-1)!.effectId).toBe('FX082');
    expect(summary.parts![0]).toMatchObject({ part: 'feet', powerZoneWidthMult: null, reason: 'overwritten' });
    expect(powerZoneWidthFor(state)).toBe(1);
  });

  it('feet then an answer that narrows the zone (FX036 in r007): the answer wins', () => {
    const s = inFlight(fixedRun(14, { ammo: 5, shotsFired: 5 }));
    const { state, summary } = settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX036'));
    expect(powerZoneWidthFor(state)).toBe(0.7);
    expect(summary.parts![0]!.reason).toBe('overwritten');
  });

  it('feet on the last cork: the zone is not shown as kept when the game ends', () => {
    const s = inFlight(fixedRun(15, { ammo: 1, shotsFired: 19, bonusAmmoTotal: 10 }));
    const { summary } = settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX021'));
    expect(summary.runEnded).toBe(true);
    expect(summary.parts![0]).toMatchObject({ powerZoneWidthMult: null, reason: 'runEnded' });
  });
});

describe('06 next-shot notes: source and effect of what is still reserved', () => {
  const notes = (s: RunState) => (s as ExpandedRunState).expansion.aimFirst?.nextNotes ?? [];
  it('feet then a damage answer: both remain, each with its source', () => {
    const s = inFlight(fixedRun(20, { ammo: 5, shotsFired: 5 }));
    const { state } = settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX004'));
    expect(notes(state)).toEqual([
      { source: 'part', effectId: null, part: 'feet', fields: ['powerZoneWidthMult'], powerZoneWidthMult: 1.25 },
      { source: 'answer', effectId: 'FX004', fields: ['damageMult'] },
    ]);
  });
  it('an answer that overwrites the width replaces the feet note; a reset (FX082) leaves none', () => {
    const s = inFlight(fixedRun(21, { ammo: 5, shotsFired: 5 }));
    expect(notes(settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX036')).state)).toEqual([{ source: 'answer', effectId: 'FX036', fields: ['powerZoneWidthMult'], powerZoneWidthMult: 0.7 }]);
    expect(notes(settleWith(s, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX082')).state)).toEqual([]);
  });
  it('the game end shows nothing as kept; the talk note goes into the shot that really fires, once', () => {
    const last = inFlight(fixedRun(22, { ammo: 1, shotsFired: 19, bonusAmmoTotal: 10 }));
    expect(notes(settleWith(last, ['feet'], ['shopkeeper:feet'], 'A', forcing('FX004')).state)).toEqual([]);
    const talked = CORE_RULES.reduceGame(fixedRun(23, { ammo: 5, shotsFired: 5 }), { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }, CTX) as ExpandedRunState;
    expect(notes(talked)).toEqual([{ source: 'talk', effectId: null, fields: ['powerZoneWidthMult'], powerZoneWidthMult: 0.85 }]);
    const cancelled = CORE_RULES.reduceGame(CORE_RULES.reduceGame(talked, { type: 'OPEN_GAUGE' }, CTX), { type: 'CANCEL_GAUGE' }, CTX);
    expect(notes(cancelled)).toEqual(notes(talked));
    expect(notes(inFlight(talked))).toEqual([]);
    // a real new run (the fixtures above only fake the shot count) passes the save check with the note
    const fresh = CORE_RULES.reduceGame(fixedRun(24), { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }, CTX);
    expect(validateRunState(fresh, catalog, tuning, L, EXP)).toBeNull();
  });
});
