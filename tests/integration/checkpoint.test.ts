import { describe, expect, it } from 'vitest';
import { createProfileStore, createSettingsStore, createRunStore, STORAGE_KEYS, readQuarantine, DEFAULT_SETTINGS, type RunStore } from '../../src/persistence';
import { finalResult } from '../../src/core/result';
import { resolveShot } from '../../src/core/settlement';
import { createRun } from '../../src/core/state';
import { reduceGame } from '../../src/core/transitions';
import { createTransformChooser } from '../../src/core/gimmicks';
import { createShotWorld } from '../../src/sim/world';
import { validateRunState } from '../../src/core/session';
import {
  BOOTH_LAYOUT,
  isOfficialRankingEligible,
  mintId,
  type DeviceActivation,
  type RunState,
  type SetId,
} from '../../src/contracts';
import { CAT, T, ctx, fired, newRun, send, syntheticRecord, toAiming } from '../unit/helpers';
import { FakeStorage } from './fake-storage';

const NOW = () => '2026-11-05T00:00:00.000Z';
const store = (s: FakeStorage, tab = 'tab-A'): RunStore => createRunStore(s, tab, { catalog: CAT, tuning: T, now: NOW });
const act = (id: string, kind: DeviceActivation['kind']): DeviceActivation => ({ deviceId: mintId.device(id), kind, projectileId: mintId.projectile(mintId.shot(1), 0) });

/** Settle a shot that collected the first `n` prizes and earned some devices. */
function settle(s: RunState, collect: number, activations: DeviceActivation[] = [], extra: Parameters<typeof syntheticRecord>[2] = {}) {
  const f = fired(s);
  const ids = f.shelf.prizes.slice(0, collect).map((p) => p.instanceId);
  return { fired: f, ...resolveShot(f, syntheticRecord(f, ids, { deviceActivations: activations, firstHitCandidates: ['shopkeeper:hat'], ...extra }), CAT, T) };
}
const resumed = (s: RunState): RunState => send(s, { type: 'RESUME', reason: 'manual' });

describe('restore between shots (AC38, AC39)', () => {
  it('restores the aiming state with the same load result (no re-roll of the load, AC05)', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    const aiming = toAiming(newRun(3));
    expect(aiming.phase).toBe('aiming');
    expect(a.saveStable(aiming)).toMatchObject({ ok: true, revision: 1 });
    const r = store(fake, 'tab-A2').load();
    expect(r.kind).toBe('resume');
    if (r.kind !== 'resume') return;
    expect(r.state.load).toEqual(aiming.load);
    expect(r.state.phase).toBe('aiming');
    expect({ ...r.state, pauseReasons: [] }).toEqual(aiming);
    expect(r.state.pauseReasons).toEqual(['manual']); // nothing runs until the player resumes
  });

  it('restores shelf, ammo, score, draw state and first-hit flags exactly; continuing gives the same result as never having reloaded', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    const first = settle(newRun(5), 2, [act('dev-ammo-1', 'ammo')]);
    expect(first.state.firstHitsScored).toEqual(['shopkeeper:hat']);
    expect(a.saveStable(first.state).ok).toBe(true);

    const loaded = store(fake, 'tab-B').load();
    expect(loaded.kind).toBe('resume');
    if (loaded.kind !== 'resume') return;
    const restored = resumed(loaded.state);
    expect(restored).toEqual(first.state);
    expect(restored.ammo).toBe(10 - 1 + 2); // no ammo used twice, bonus counted once
    expect(restored.bonusAmmoTotal).toBe(2);
    expect(restored.draw).toEqual(first.state.draw); // no double draw
    expect(restored.shelf).toEqual(first.state.shelf);

    // the next shot from both worlds is identical (same draws, same score, same flags)
    const live = settle(first.state, 1, [], { firstHitCandidates: ['shopkeeper:hat', 'shopkeeper:fan'] });
    const again = settle(restored, 1, [], { firstHitCandidates: ['shopkeeper:hat', 'shopkeeper:fan'] });
    expect(again.state).toEqual(live.state);
    expect(again.summary.ledger.firstHitPoints).toBe(T.scoring.shopkeeperPoints.fan); // hat was not scored twice
    expect(again.state.score).toBe(live.state.score);
  });

  it('a loaded checkpoint is never applied twice: loading does not change the saved revision of a resumable state', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    a.saveStable(newRun(1));
    const before = fake.data.get(STORAGE_KEYS.run);
    const b = store(fake, 'tab-B');
    b.load();
    b.load();
    expect(fake.data.get(STORAGE_KEYS.run)).toBe(before);
  });

  it('an ended run comes back as a result', () => {
    const fake = new FakeStorage();
    let s = newRun(2);
    let end = settle(s, 1);
    for (let i = 0; i < 9; i++) end = settle(end.state, 1, [], { firstHitCandidates: [] });
    expect(end.state.phase).toBe('ended');
    expect(end.state.shotsFired).toBe(10);
    store(fake).saveStable(end.state);
    const r = store(fake, 'tab-B').load();
    expect(r.kind).toBe('ended');
    if (r.kind !== 'ended') return;
    expect(finalResult(r.state).status).toBe('completed');
    expect(finalResult(r.state).score).toBe(end.state.score);
  });
});

describe('reload while a shot is in flight is abandoned (AC39, decision 27)', () => {
  it('flight, transform and fall all leave the FIRE marker in the checkpoint: abandoned, not ranked, no re-shot', async () => {
    const fake = new FakeStorage();
    const a = store(fake);
    const aiming = toAiming(newRun(7));
    const afterFire = send(aiming, { type: 'FIRE' });
    expect(afterFire.phase).toBe('resolving');
    expect(a.saveAfterFire(afterFire)).toMatchObject({ ok: true });

    // the sim runs for a while (flight, then transform and settle stages); nothing is written meanwhile
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf(afterFire.shelf, afterFire.clocks.motionSec);
    world.fire(afterFire.inFlight!.request, { runId: afterFire.runId, chooseTransform: createTransformChooser(afterFire, CAT) });
    const stages = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const step = world.step(1 / 60);
      if (step.frame.stage) stages.add(step.frame.stage);
      if (step.record) break;
      // "reload" at several points of the shot: same answer every time
      if (i % 50 === 0) {
        const r = store(fake, `reload-${i}`).load();
        expect(r.kind).toBe('abandoned');
        if (r.kind === 'abandoned' && i === 0) expect(r.cause).toBe('inFlight');
      }
    }
    world.dispose();
    expect(stages.has('flight')).toBe(true);

    const r = store(fake, 'tab-B').load();
    expect(r.kind).toBe('abandoned');
    if (r.kind !== 'abandoned') return;
    expect(r.state.phase).toBe('abandoned');
    expect(r.state.ammo).toBe(9); // the shot stays spent: no free re-shot
    expect(r.state.inFlight).toBeNull();
    const result = finalResult(r.state);
    expect(result.status).toBe('abandoned');
    expect(isOfficialRankingEligible({ ...result, valueStatus: 'approved', playerName: 'x' })).toBe(false);
    // no command revives it
    for (const c of [{ type: 'FIRE' }, { type: 'CONFIRM_POSITION' }, { type: 'STOP_LOAD' }] as const) expect(reduceGame(r.state, c, ctx)).toBe(r.state);

    // a second reload says the same thing
    const again = store(fake, 'tab-C').load();
    expect(again.kind).toBe('abandoned');
    if (again.kind === 'abandoned') expect(again.cause).toBe('saved');
    expect(again.kind === 'abandoned' && again.state).toEqual(r.state);
  });

  it('a checkpoint written after the settlement is no longer abandoned', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    const afterFire = send(toAiming(newRun(4)), { type: 'FIRE' });
    a.saveAfterFire(afterFire);
    const settled = resolveShot(afterFire, syntheticRecord(afterFire, []), CAT, T);
    expect(a.saveStable(settled.state).ok).toBe(true);
    expect(store(fake, 'tab-B').load().kind).toBe('resume');
  });

  it('refuses the wrong save for the state (a stable save with a marker, a fire save without one)', () => {
    const a = store(new FakeStorage());
    const afterFire = send(toAiming(newRun(4)), { type: 'FIRE' });
    expect(a.saveStable(afterFire)).toMatchObject({ ok: false, reason: 'invalid-call' });
    expect(a.saveAfterFire(newRun(4))).toMatchObject({ ok: false, reason: 'invalid-call' });
  });
});

describe('set book vs the run (AC22)', () => {
  it('a new run starts with no completed sets while the book keeps every discovery; abandoned runs never set the best', () => {
    const fake = new FakeStorage();
    const profile = createProfileStore(fake, NOW);
    // run 1 completes a set
    const sid = [...CAT.sets.keys()][0]!;
    const need = CAT.sets.get(sid)!.requiredTypeIds;
    let s = newRun(9);
    const shelfPrizes = need.map((t, i) => ({ ...s.shelf.prizes[i]!, typeId: t, drawnTypeId: t, hp: 1, maxHp: 1 }));
    s = { ...s, shelf: { ...s.shelf, prizes: shelfPrizes } };
    const r = settle(s, 3);
    expect(r.summary.newlyCompletedSets).toContain(sid);
    expect(profile.discoverSets(r.summary.newlyCompletedSets)).toContain(sid);
    expect(r.state.completedSets).toContain(sid);

    const ended: RunState = { ...r.state, phase: 'ended', ammo: 0 };
    expect(profile.recordRunEnd(finalResult(ended)).newBest).toBe(true);
    const best = profile.load().bestScore;
    expect(best).toBe(ended.score);

    // run 2: sets are reset, the book is kept
    const run2 = createRun({ runId: mintId.run('run-2'), seed: 10, tuning: T, playerName: null }, CAT);
    expect(run2.completedSets).toEqual([]);
    expect(run2.collectedTypeIds).toEqual([]);
    const reloaded = createProfileStore(fake, NOW).load();
    expect(reloaded.discoveredSets).toContain(sid);
    expect(reloaded.bestScore).toBe(best);

    // abandoned runs never change the best
    expect(profile.recordRunEnd({ status: 'abandoned', score: 99999 }).newBest).toBe(false);
    expect(profile.load().bestScore).toBe(best);
    // no run finished yet -> null, never 0
    expect(createProfileStore(new FakeStorage(), NOW).load().bestScore).toBeNull();
  });

  it('merges discoveries from two tabs and ignores bad ids', () => {
    const fake = new FakeStorage();
    const a = createProfileStore(fake, NOW);
    const b = createProfileStore(fake, NOW);
    a.discoverSets(['S001' as SetId]);
    b.discoverSets(['S002' as SetId, 'S001' as SetId, 'nope' as SetId]);
    expect(a.load().discoveredSets).toEqual(['S001', 'S002']);
  });
});

describe('validation and quarantine (never silently deleted)', () => {
  const settledState = (): RunState => settle(newRun(6), 2).state;
  const tamper = (mut: (s: Record<string, unknown>) => void): string => {
    const fake = new FakeStorage();
    store(fake).saveStable(settledState());
    const env = JSON.parse(fake.data.get(STORAGE_KEYS.run)!);
    mut(env.checkpoint.state);
    return JSON.stringify(env);
  };

  it('accepts what the store itself wrote', () => {
    expect(validateRunState(JSON.parse(JSON.stringify(settledState())), CAT, T)).toBeNull();
  });

  const cases: [string, (s: Record<string, unknown>) => void][] = [
    ['ammo does not match shots', (s) => (s.ammo = 3)],
    ['score does not match the ledger', (s) => (s.score = 99999)],
    ['negative score', (s) => (s.score = -5)],
    ['duplicate collected instance', (s) => (s.collected = [...(s.collected as unknown[]), (s.collected as unknown[])[0]])],
    ['set completed without kinds', (s) => (s.completedSets = ['S001'])],
    ['broken rng', (s) => ((s.draw as Record<string, unknown>).rng = [0, 0, 0, 0])],
    ['unknown prize type', (s) => (((s.shelf as { prizes: Record<string, unknown>[] }).prizes[0]!).typeId = 'P999')],
    ['bonus over the cap', (s) => (s.bonusAmmoTotal = 11)],
    ['unknown first-hit key', (s) => (s.firstHitsScored = ['shopkeeper:nose'])],
  ];
  for (const [name, mut] of cases) {
    it(`quarantines a checkpoint where: ${name}`, () => {
      const fake = new FakeStorage();
      const raw = tamper(mut);
      fake.poke(STORAGE_KEYS.run, raw);
      const r = store(fake, 'tab-B').load();
      expect(r.kind).toBe('quarantined');
      expect(fake.data.has(STORAGE_KEYS.run)).toBe(false);
      const q = readQuarantine(fake);
      expect(q).toHaveLength(1);
      expect(q[0]!.raw).toBe(raw); // the exact bytes are kept
    });
  }

  it('quarantines unparseable data, a foreign format and a rules-version mismatch', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.run, '{not json');
    expect(store(fake).load()).toMatchObject({ kind: 'quarantined', reason: 'json' });
    fake.poke(STORAGE_KEYS.run, JSON.stringify({ hello: 1 }));
    expect(store(fake).load()).toMatchObject({ kind: 'quarantined', reason: 'format' });

    const ok = new FakeStorage();
    store(ok).saveStable(settledState());
    const env = JSON.parse(ok.data.get(STORAGE_KEYS.run)!);
    env.checkpoint.rulesVersion = 'rules-v0-old';
    env.checkpoint.state.rulesVersion = 'rules-v0-old';
    fake.poke(STORAGE_KEYS.run, JSON.stringify(env));
    const r = store(fake).load();
    expect(r.kind).toBe('quarantined');
    if (r.kind === 'quarantined') expect(r.reason).toMatch(/^rules-version/);
    expect(readQuarantine(fake)).toHaveLength(3);
  });

  it('when the quarantine itself cannot be written, the original stays in place and is not overwritten', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.run, '{broken');
    fake.failSet.add(STORAGE_KEYS.quarantine);
    const a = store(fake);
    expect(a.load()).toMatchObject({ kind: 'quarantined', preserved: false });
    expect(fake.data.get(STORAGE_KEYS.run)).toBe('{broken');
    expect(a.saveStable(newRun(1))).toMatchObject({ ok: false, reason: 'quarantine-failed' });
    expect(fake.data.get(STORAGE_KEYS.run)).toBe('{broken');
  });

  it('a corrupted profile is quarantined and the trustworthy part is kept; invalid settings fall back to defaults', () => {
    const fake = new FakeStorage();
    const raw = JSON.stringify({ schemaVersion: 1, bestScore: 'many', discoveredSets: ['S001', 7, 'S002'] });
    fake.poke(STORAGE_KEYS.profile, raw);
    const p = createProfileStore(fake, NOW).load();
    expect(p.discoveredSets).toEqual(['S001', 'S002']);
    expect(p.bestScore).toBeNull();
    expect(readQuarantine(fake).some((e) => e.key === STORAGE_KEYS.profile && e.raw === raw)).toBe(true);

    fake.poke(STORAGE_KEYS.settings, '{"audio":"loud"}');
    const settings = createSettingsStore(fake, NOW);
    expect(settings.load()).toEqual(DEFAULT_SETTINGS);
    expect(settings.save({ audio: { volume: 5 }, language: 'ja' })).toMatchObject({ audio: { enabled: true, volume: 1 }, language: 'ja' });
    expect(createSettingsStore(fake, NOW).load().language).toBe('ja');
  });
});

describe('several tabs', () => {
  it('a second tab that fell behind cannot overwrite the first: conflict, nothing written, reload catches up', () => {
    const fake = new FakeStorage();
    const A = store(fake, 'tab-A');
    const s1 = newRun(8);
    expect(A.saveStable(s1)).toMatchObject({ ok: true, revision: 1 });
    const B = store(fake, 'tab-B');
    expect(B.load().kind).toBe('resume');
    expect(B.isStale()).toBe(false);

    const s2 = toAiming(s1);
    expect(A.saveStable(s2)).toMatchObject({ ok: true, revision: 2 });
    expect(B.isStale()).toBe(true);
    const snapshot = fake.data.get(STORAGE_KEYS.run);
    expect(B.saveStable(s1)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(B.status().conflict).toBe(true);
    expect(fake.data.get(STORAGE_KEYS.run)).toBe(snapshot);
    expect(B.saveAfterFire(send(s2, { type: 'FIRE' }))).toMatchObject({ ok: false, reason: 'conflict' });
    expect(B.status().fireSaveFailed).toBe(false); // a conflict is not a storage failure
    expect(fake.data.get(STORAGE_KEYS.run)).toBe(snapshot);

    // B reloads, sees A's progress and continues from it
    const r = B.load();
    expect(r.kind).toBe('resume');
    if (r.kind === 'resume') expect(r.state.phase).toBe('aiming');
    expect(B.status().conflict).toBe(false);
    expect(B.saveStable(s2)).toMatchObject({ ok: true, revision: 3 });
    expect(A.saveStable(s2)).toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('two tabs starting a run at the same time: the second is refused', () => {
    const fake = new FakeStorage();
    const A = store(fake, 'A');
    const B = store(fake, 'B');
    expect(A.load().kind).toBe('none');
    expect(B.load().kind).toBe('none');
    expect(A.saveStable(newRun(1)).ok).toBe(true);
    expect(B.saveStable(newRun(2))).toMatchObject({ ok: false, reason: 'conflict' });
  });

  it('clear removes the run only for the tab that owns the newest revision', () => {
    const fake = new FakeStorage();
    const A = store(fake, 'A');
    const B = store(fake, 'B');
    A.saveStable(newRun(1));
    B.load();
    A.saveStable(toAiming(newRun(1)));
    expect(B.clear()).toBe(false);
    expect(fake.data.has(STORAGE_KEYS.run)).toBe(true);
    expect(A.clear()).toBe(true);
    expect(fake.data.has(STORAGE_KEYS.run)).toBe(false);
    expect(A.saveStable(newRun(3)).ok).toBe(true); // a fresh run after the result was taken over
  });
});

describe('storage failures keep the game going in memory', () => {
  it('quota error on a save: reported, flagged, nothing thrown, and the next save recovers', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    a.saveStable(newRun(1));
    fake.failSet.add('*');
    const r = a.saveStable(toAiming(newRun(1)));
    expect(r).toMatchObject({ ok: false, reason: 'quota' });
    expect(a.status().available).toBe(false);
    expect(a.status().lastError).toMatch(/quota/i);
    fake.failSet.clear();
    expect(a.saveStable(toAiming(newRun(1))).ok).toBe(true);
    expect(a.status().available).toBe(true);
  });

  it('a failed pre-shot save removes the stale checkpoint (no free re-shot after a reload) and excludes the run from the ranking', () => {
    const fake = new FakeStorage();
    const a = store(fake);
    const aiming = toAiming(newRun(2));
    a.saveStable(aiming);
    fake.failSet.add(STORAGE_KEYS.run);
    const r = a.saveAfterFire(send(aiming, { type: 'FIRE' }));
    expect(r.ok).toBe(false);
    expect(a.status().fireSaveFailed).toBe(true);
    expect(fake.data.has(STORAGE_KEYS.run)).toBe(false);
    expect(store(fake, 'tab-B').load().kind).toBe('none'); // not the pre-shot aiming state
  });

  it('unreadable storage: load starts fresh and says so; saves report unavailable', () => {
    const fake = new FakeStorage();
    fake.failGet = true;
    fake.failSet.add('*');
    const a = store(fake);
    expect(a.load()).toEqual({ kind: 'none' });
    expect(a.status().available).toBe(false);
    expect(a.saveStable(newRun(1))).toMatchObject({ ok: false, reason: 'unavailable' });
    const p = createProfileStore(fake, NOW);
    expect(p.discoverSets(['S001' as SetId])).toEqual(['S001']); // kept in memory
    expect(p.status().available).toBe(false);
    expect(p.load().discoveredSets).toEqual(['S001']);
  });
});
