import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { CORE_RULES } from '../../src/app/rules';
import { createExpandedRun } from '../../src/core/expanded-run';
import { validateRunState } from '../../src/core/session';
import { classifyLoadWithWidth, powerZones, powerZoneWidthFor, setHintFor, talkAvailability } from '../../src/core/aim-first';
import { mergeModifiers } from '../../src/core/gameplay-effects';
import { BASE_SHOT_MODIFIERS, isExpandedRunState, mintId, parseCommand, type ExpandedRunState, type GameCommand, type RunState } from '../../src/contracts';

const B = getGameplayBundle('expanded-aim-first');
const R6 = getGameplayBundle('expanded-next');
const EXP = B.expansion!;
const CTX = { tuning: B.tuning, catalog: B.catalog, layout: B.layout, expansion: EXP };
const send = (s: RunState, c: GameCommand): RunState => CORE_RULES.reduceGame(s, c, CTX);
const fresh = (seed = 7): ExpandedRunState =>
  createExpandedRun({ runId: mintId.run(`r007-${seed}`), seed, tuning: B.tuning, playerName: null }, { catalog: B.catalog, tuning: B.tuning, layout: B.layout, expansion: EXP });
/** A new run with the A9 order card answered (declined), as after the first screen. */
const run = (seed = 7): ExpandedRunState => send(fresh(seed), { type: 'ORDER', accept: false }) as ExpandedRunState;
/** Advance the core clock in small steps (one tick never applies more than 0.1 s). */
function tick(s: RunState, sec: number): RunState {
  let left = sec;
  while (left > 1e-12) {
    const dt = Math.min(0.02, left);
    s = CORE_RULES.tickRun(s, dt, B.tuning);
    left -= dt;
  }
  return s;
}
const valid = (s: RunState) => validateRunState(s, B.catalog, B.tuning, B.layout, EXP);

describe('r007 bundle', () => {
  it('is its own version with 100 cells and the aim-first profile; r006 keeps its own', () => {
    expect(B.catalog.rulesVersion).toBe('rules-v2-proposed-r007');
    expect(B.behavior?.controls).toBe('aim-first');
    expect(EXP.profile.cellCount).toBe(100);
    expect(B.layout.backgroundCells).toHaveLength(100);
    expect(EXP.profile.aimFirst?.moveStep).toBe(0.14);
    expect(R6.catalog.rulesVersion).toBe('rules-v2-proposed-r006');
    expect(R6.behavior?.controls).toBeUndefined();
    expect(R6.expansion!.profile.aimFirst).toBeUndefined();
    expect(R6.layout.backgroundCells).toHaveLength(36);
  });

  it('FX012/013/035/036 change the power-zone width in r007 only', () => {
    const op = (b: typeof B, id: string) => b.expansion!.effects.get(id as never)!.operation;
    expect(op(B, 'FX012')).toEqual({ kind: 'shotModifiers', set: { powerZoneWidthMult: 1.25 } });
    expect(op(B, 'FX013')).toEqual({ kind: 'shotModifiers', set: { powerZoneWidthMult: 1.5 } });
    expect(op(B, 'FX035')).toEqual({ kind: 'shotModifiers', set: { powerZoneWidthMult: 0.85 } });
    expect(op(B, 'FX036')).toEqual({ kind: 'shotModifiers', set: { powerZoneWidthMult: 0.7 } });
    expect(EXP.effects.get('FX012' as never)!.nameKey).toBe('exp.fx.FX012.r007.name');
    expect(op(R6, 'FX012')).toEqual({ kind: 'shotModifiers', set: { swayMult: 0.75 } });
  });
});

describe('r007 starts aiming and moves freely', () => {
  it('starts in aiming without a load result, valid for the save check', () => {
    const s = fresh();
    expect(s.phase).toBe('aiming');
    expect(s.load).toBeNull();
    expect(s.expansion.aimFirst).toEqual({ aimSeq: 0, talk: null });
    expect(valid(s)).toBeNull();
  });

  it('moves with SET_POSITION and aims with AIM while aiming, clamped to the wider stall', () => {
    let s: RunState = run();
    s = send(s, { type: 'SET_POSITION', x: 9 });
    expect(s.standX).toBe(2.65);
    s = send(s, { type: 'AIM', yaw: 5, pitch: -5 });
    expect(s.aim).toEqual({ yaw: 0.72, pitch: -0.7 });
    // no position confirmation and no old loading step
    expect(send(s, { type: 'CONFIRM_POSITION' })).toBe(s);
    expect(send(s, { type: 'STOP_LOAD' })).toBe(s);
  });

  it('uses the requested aim with no sway, however long the player aims', () => {
    let s: RunState = send(run(), { type: 'AIM', yaw: 0.1, pitch: 0.05 });
    s = tick(tick(s, 0.1), 0.1);
    for (let i = 0; i < 80; i++) s = tick(s, 0.1);
    expect(CORE_RULES.effectiveAim(s, B.tuning)).toEqual({ yaw: 0.1, pitch: 0.05 });
  });
});

describe('r007 gauge: 撃つ → 発射', () => {
  it('opens the gauge with the aim fixed, then FIRE classifies at the accepted tick and fires once', () => {
    let s: RunState = send(send(run(), { type: 'SET_POSITION', x: 1.0 }), { type: 'AIM', yaw: 0.2, pitch: 0.1 });
    const open = send(s, { type: 'OPEN_GAUGE' });
    expect(open.phase).toBe('loading');
    expect(open.clocks.loadingSec).toBe(0);
    // position and aim no longer move
    expect(send(open, { type: 'SET_POSITION', x: 0 })).toBe(open);
    expect(send(open, { type: 'AIM', yaw: 0, pitch: 0 })).toBe(open);
    s = tick(open, 0.6); // 0.6 / 1.4 → bar 0.857 (perfect)
    const fired = send(s, { type: 'FIRE' });
    expect(fired.phase).toBe('resolving');
    expect(fired.ammo).toBe(9);
    expect(fired.shotsFired).toBe(1);
    expect(fired.load?.tier).toBe('perfect');
    expect(fired.inFlight?.request.load).toEqual(fired.load);
    expect(fired.inFlight?.request.origin).toEqual({ x: 1, y: 1.25, z: 0.35 });
    expect(send(fired, { type: 'FIRE' })).toBe(fired);
  });

  it('FIRE is rejected unless the gauge is open; a weak press still fires', () => {
    const s = run();
    expect(send(s, { type: 'FIRE' })).toBe(s);
    const fired = send(send(s, { type: 'OPEN_GAUGE' }), { type: 'FIRE' });
    expect(fired.load?.tier).toBe('weak');
    expect(fired.phase).toBe('resolving');
  });

  it('CANCEL_GAUGE goes back to aiming with the same position, aim, cork and reservation', () => {
    let s = run() as RunState;
    s = { ...s, expansion: { ...(s as ExpandedRunState).expansion, next: { modifiers: { ...BASE_SHOT_MODIFIERS, powerZoneWidthMult: 1.25 }, hint: null } } } as RunState;
    s = send(send(s, { type: 'SET_POSITION', x: -1 }), { type: 'AIM', yaw: -0.3, pitch: 0.2 });
    const cancelled = send(tick(send(s, { type: 'OPEN_GAUGE' }), 0.3), { type: 'CANCEL_GAUGE' });
    expect(cancelled.phase).toBe('aiming');
    expect(cancelled.standX).toBe(-1);
    expect(cancelled.aim).toEqual({ yaw: -0.3, pitch: 0.2 });
    expect(cancelled.ammo).toBe(10);
    expect(powerZoneWidthFor(cancelled)).toBe(1.25);
  });

  it('pausing in the gauge freezes it; FIRE and CANCEL are refused until resumed', () => {
    const open = tick(send(run(), { type: 'OPEN_GAUGE' }), 0.2);
    const paused = send(open, { type: 'PAUSE', reason: 'manual' });
    expect(tick(paused, 0.5).clocks.loadingSec).toBe(open.clocks.loadingSec);
    expect(send(paused, { type: 'FIRE' })).toBe(paused);
    expect(send(paused, { type: 'CANCEL_GAUGE' })).toBe(paused);
  });

  it('the r007 commands parse with exact fields only and do nothing in r006', () => {
    expect(parseCommand({ type: 'OPEN_GAUGE' }).ok).toBe(true);
    expect(parseCommand({ type: 'OPEN_GAUGE', power: 1 }).ok).toBe(false);
    expect(parseCommand({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }).ok).toBe(true);
    expect(parseCommand({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo', ammo: 9 }).ok).toBe(false);
    expect(parseCommand({ type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'both' }).ok).toBe(false);
    const r6ctx = { tuning: R6.tuning, catalog: R6.catalog, layout: R6.layout, expansion: R6.expansion };
    const r6 = createExpandedRun({ runId: mintId.run('r6'), seed: 3, tuning: R6.tuning, playerName: null }, { catalog: R6.catalog, tuning: R6.tuning, layout: R6.layout, expansion: R6.expansion! });
    expect(r6.phase).toBe('position');
    expect(CORE_RULES.reduceGame(r6, { type: 'OPEN_GAUGE' }, r6ctx)).toBe(r6);
    expect(CORE_RULES.reduceGame(r6, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }, r6ctx)).toBe(r6);
  });
});

describe('r007 power-zone width', () => {
  it('scales the base distances 0.05 / 0.15 / 0.35 around the same centre, nested and inside 0..1', () => {
    for (const m of [0.7, 0.85, 1, 1.25, 1.5]) {
      const z = powerZones(B.tuning, m);
      const [p, g, n, w] = z;
      expect(p!.tier).toBe('perfect');
      expect(p!.min).toBeCloseTo(Math.max(0, 0.85 - 0.05 * m));
      expect(g!.min).toBeCloseTo(Math.max(0, 0.85 - 0.15 * m));
      expect(n!.min).toBeCloseTo(Math.max(0, 0.85 - 0.35 * m));
      for (const zz of z) expect(zz.min >= 0 && zz.max <= 1).toBe(true);
      expect(g!.min <= p!.min && p!.max <= g!.max && n!.min <= g!.min && g!.max <= n!.max).toBe(true);
      expect(w).toEqual({ tier: 'weak', min: 0, max: 1 });
    }
  });

  it('a value on a boundary belongs to the stronger tier; 1.25 turns a good press perfect', () => {
    expect(classifyLoadWithWidth(0.8, B.tuning, 1).tier).toBe('perfect');
    expect(classifyLoadWithWidth(0.79, B.tuning, 1).tier).toBe('good');
    expect(classifyLoadWithWidth(0.79, B.tuning, 1.25).tier).toBe('perfect');
    expect(classifyLoadWithWidth(0.7, B.tuning, 0.85).tier).toBe('normal');
    expect(classifyLoadWithWidth(0.7, B.tuning, 1).tier).toBe('good');
  });

  it('the latest reservation wins and FX082 (reset) brings it back to 1', () => {
    const limits = EXP.profile.limits;
    const a = mergeModifiers(BASE_SHOT_MODIFIERS, { powerZoneWidthMult: 1.25 }, limits);
    const b = mergeModifiers(a, { powerZoneWidthMult: 0.7 }, limits);
    expect(b.powerZoneWidthMult).toBe(0.7);
    // out of range values are clamped; r006 limits have no range so the field is never added
    expect(mergeModifiers(BASE_SHOT_MODIFIERS, { powerZoneWidthMult: 9 }, limits).powerZoneWidthMult).toBe(1.5);
    expect(mergeModifiers(BASE_SHOT_MODIFIERS, { powerZoneWidthMult: 1.25 }, R6.expansion!.profile.limits).powerZoneWidthMult).toBeUndefined();
    const reset = EXP.effects.get('FX082' as never)!.operation;
    expect(reset.kind).toBe('resetShotModifiers');
  });

  it('FIRE uses the reserved width and moves it to the shot; the next shot is back to 1', () => {
    const s0 = run();
    const s = { ...s0, expansion: { ...s0.expansion, next: { modifiers: { ...BASE_SHOT_MODIFIERS, powerZoneWidthMult: 1.25 }, hint: null } } };
    // bar at 0.79 (good at width 1) → perfect with 1.25
    const t = (0.79 / 2) * 1.4; // rising half of the triangle wave
    const fired = send(tick(send(s, { type: 'OPEN_GAUGE' }), t), { type: 'FIRE' });
    expect(fired.load?.tier).toBe('perfect');
    expect(isExpandedRunState(fired) && fired.expansion.active?.modifiers.powerZoneWidthMult).toBe(1.25);
    expect(powerZoneWidthFor(fired)).toBe(1);
  });
});

describe('r007 power-zone width with the FX037/038 bar speed', () => {
  it('a slower bar (period ×1.15) and a wider zone (×1.25) both apply to the same press', () => {
    const s0 = run();
    const s = { ...s0, expansion: { ...s0.expansion, next: { modifiers: { ...BASE_SHOT_MODIFIERS, loadPeriodMult: 1.15, powerZoneWidthMult: 1.25 }, hint: null } } };
    // with period 1.4 × 1.15 the bar reaches 0.79 at 0.79/2 × 1.61 s; 0.79 is perfect only with the wider zone
    const fired = send(tick(send(s, { type: 'OPEN_GAUGE' }), (0.79 / 2) * 1.4 * 1.15), { type: 'FIRE' });
    expect(fired.load?.barValue).toBeCloseTo(0.79, 2);
    expect(fired.load?.tier).toBe('perfect');
  });
});

describe('r007 talk (店主と話す)', () => {
  it('hint: once per run, changes no ammo, score, shot count or random stream', () => {
    const s = run();
    const after = send(s, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' }) as ExpandedRunState;
    expect(after).not.toBe(s);
    expect(after.expansion.aimFirst?.talk?.choice).toBe('hint');
    expect(after.expansion.aimFirst?.talk?.hint).toEqual(setHintFor(s, B.catalog, EXP));
    expect(after.ammo).toBe(s.ammo);
    expect(after.score).toBe(s.score);
    expect(after.shotsFired).toBe(0);
    expect(after.expansion.rng).toEqual(s.expansion.rng);
    expect(after.expansion.questionCursor).toBe(s.expansion.questionCursor);
    expect(send(after, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe(after);
    expect(valid(after)).toBeNull();
  });

  it('ammo: +1 now and a 0.85 power zone for the next real shot, in one change', () => {
    const s = run();
    const after = send(s, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }) as ExpandedRunState;
    expect(after.ammo).toBe(11);
    expect(after.bonusAmmoTotal).toBe(1);
    expect(powerZoneWidthFor(after)).toBe(0.85);
    expect(after.expansion.aimFirst?.talk).toMatchObject({ choice: 'ammo', ammoRequested: 1, ammoGranted: 1, powerZoneWidthMult: 0.85, afterShot: 0 });
    expect(valid(after)).toBeNull();
    // cancelling the gauge does not use the condition; only a fired shot does
    const back = send(send(after, { type: 'OPEN_GAUGE' }), { type: 'CANCEL_GAUGE' });
    expect(powerZoneWidthFor(back)).toBe(0.85);
    const fired = send(send(back, { type: 'OPEN_GAUGE' }), { type: 'FIRE' }) as ExpandedRunState;
    expect(fired.expansion.active?.modifiers.powerZoneWidthMult).toBe(0.85);
    expect(powerZoneWidthFor(fired)).toBe(1);
  });

  it('ammo cannot be chosen at the cap or with a width already reserved, and says why before choosing', () => {
    const s0 = run();
    const capped = { ...s0, ammo: s0.ammo + 10, bonusAmmoTotal: 10 } as ExpandedRunState;
    expect(talkAvailability(capped, CTX)).toMatchObject({ blocked: null, ammoBlocked: 'ammoCap', ammoOffer: 0 });
    expect(send(capped, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe(capped);
    const reserved = { ...s0, expansion: { ...s0.expansion, next: { modifiers: { ...BASE_SHOT_MODIFIERS, powerZoneWidthMult: 0.7 }, hint: null } } };
    expect(talkAvailability(reserved, CTX).ammoBlocked).toBe('zoneReserved');
    expect(send(reserved, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' })).toBe(reserved);
    // the hint stays available in both cases
    expect(send(reserved, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' })).not.toBe(reserved);
  });

  it('is refused while paused, in the gauge, with no ammo, or while the order card waits', () => {
    const s = run();
    const paused = send(s, { type: 'PAUSE', reason: 'manual' });
    expect(talkAvailability(paused, CTX).blocked).toBe('paused');
    expect(send(paused, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' })).toBe(paused);
    const open = send(s, { type: 'OPEN_GAUGE' });
    expect(send(open, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' })).toBe(open);
    const ordered = fresh();
    expect(ordered.expansion.rewards?.order?.status).toBe('offered');
    expect(talkAvailability(ordered, CTX).blocked).toBe('orderOpen');
    expect(send(ordered, { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'hint' })).toBe(ordered);
  });

  it('the save check refuses a forged talk that pays more than the version allows', () => {
    const after = send(run(), { type: 'CHOOSE_SHOPKEEPER_TALK', choice: 'ammo' }) as ExpandedRunState;
    const forged = { ...after, ammo: after.ammo + 2, bonusAmmoTotal: after.bonusAmmoTotal + 2, expansion: { ...after.expansion, aimFirst: { aimSeq: 0, talk: { ...after.expansion.aimFirst!.talk!, ammoRequested: 3, ammoGranted: 3 } } } };
    expect(valid(forged)).toBe('talk paid more than the version allows');
  });
});

describe('set hint', () => {
  it('prefers an unfinished pair with one kind won and the other on the shelf, then the lower id', () => {
    const s = run(11);
    const onShelf = new Set(s.shelf.prizes.map((p) => p.typeId));
    // pick a pair with both members on the shelf, and pretend one is won
    const pair = EXP.pairSetIds.map((id) => B.catalog.sets.get(id)!).find((c) => c.requiredTypeIds.every((t) => onShelf.has(t)))!;
    expect(pair).toBeDefined();
    const won = { ...s, collectedTypeIds: [pair.requiredTypeIds[0]!] };
    const hint = setHintFor(won, B.catalog, EXP);
    expect(hint.missingTypeIds).toHaveLength(1);
    const none = setHintFor({ ...s, shelf: { ...s.shelf, prizes: [] } }, B.catalog, EXP);
    expect(none).toEqual({ setId: null, missingTypeIds: [] });
  });
});
