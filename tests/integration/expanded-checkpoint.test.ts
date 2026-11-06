import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { abandonRun, validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import { STORAGE_KEYS, createRunStore, expandedRunKey, readQuarantine, type RunStore } from '../../src/persistence';
import {
  aimDirection,
  ballisticFor,
  corkFreeFlightPath,
  isAmmoBalanced,
  isExpandedRunState,
  mintId,
  muzzlePosition,
  type ExpandedRunState,
  type Vec3,
} from '../../src/contracts';
import { FakeStorage } from './fake-storage';

const bundle = getGameplayBundle('expanded-proposed');
const L = bundle.layout;
const EXP = bundle.expansion!;
const KEY = expandedRunKey(EXP.profile.rulesVersion);
const NOW = () => '2026-11-06T00:00:00.000Z';
const store = (s: FakeStorage, tab = 'tab-A'): RunStore =>
  createRunStore(s, tab, { catalog: bundle.catalog, tuning: bundle.tuning, layout: L, expansion: EXP, key: KEY, now: NOW });
const fresh = (seed: number): ExpandedRunState => createExpandedRun({ runId: mintId.run(`run-cp-${seed}`), seed, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: EXP });
const problem = (s: unknown): string | null => validateRunState(s, bundle.catalog, bundle.tuning, L, EXP);
const tamper = (s: ExpandedRunState, f: (x: any) => void): unknown => {
  const copy = JSON.parse(JSON.stringify(s));
  f(copy);
  return copy;
};

function aimAt(standX: number, target: Vec3): { yaw: number; pitch: number } {
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(bundle.tuning, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

async function controller(seed: number) {
  const world = await createShotWorld(L, bundle.catalog, bundle.tuning);
  return new GameController({ rules: CORE_RULES, world, renderer: null, catalog: bundle.catalog, tuning: bundle.tuning, layout: L, expansion: EXP }, fresh(seed));
}
function fire(c: GameController, target: Vec3): void {
  c.dispatch({ type: 'SET_POSITION', x: L.camera.standMaxX });
  c.dispatch({ type: 'CONFIRM_POSITION' });
  c.frame(0.3);
  c.dispatch({ type: 'STOP_LOAD' });
  c.dispatch({ type: 'AIM', ...aimAt(c.current.standX, target) });
  expect(c.dispatch({ type: 'FIRE' })).toBe(true);
}
function runUntil(c: GameController, done: () => boolean): void {
  for (let i = 0; i < 2000 && !done(); i++) c.frame(1 / 60);
}
async function afterCellShot(): Promise<ExpandedRunState> {
  const c = await controller(22);
  const cell = L.backgroundCells!.find((x) => x.cellId === 'cell-r3-c12')!;
  fire(c, { x: cell.box.center.x + 0.12, y: cell.box.center.y - 0.05, z: cell.box.center.z });
  runUntil(c, () => c.awaitingAnswer || c.current.phase !== 'resolving');
  expect(c.current.phase).toBe('position');
  expect(isExpandedRunState(c.current)).toBe(true);
  return c.current as ExpandedRunState;
}
async function atQuestion(): Promise<ExpandedRunState> {
  const c = await controller(21);
  const body = L.shopkeeper.find((p) => p.part === 'body')!.box.center;
  fire(c, { x: body.x, y: 1.2, z: body.z + 0.1 });
  runUntil(c, () => c.awaitingAnswer || c.current.phase !== 'resolving');
  expect(c.awaitingAnswer).toBe(true);
  return c.current as ExpandedRunState;
}

describe('expanded checkpoints (EG06)', () => {
  it('the real states are valid under the expanded validator and invalid for the rules-v1 one', async () => {
    for (const s of [fresh(1), await afterCellShot()]) {
      expect(problem(s)).toBeNull();
      expect(isAmmoBalanced(s, bundle.tuning.initialAmmo)).toBe(true);
      expect(validateRunState(s, bundle.catalog, bundle.tuning, L)).not.toBeNull();
    }
  });

  it('a fresh and a post-shot state restore with the same shelf, cells, question order and cursor, reservation and series', async () => {
    const post = await afterCellShot();
    const withDeferred: ExpandedRunState = {
      ...post,
      expansion: {
        ...post.expansion,
        assortmentSeries: [...EXP.series.keys()][0]!,
        outlineSeries: [...EXP.series.keys()][1]!,
        deferredTransforms: [{ instanceId: post.shelf.prizes[0]!.instanceId, requestId: mintId.effectRequest(mintId.shot(1), 9), candidateTypeIds: [post.shelf.prizes[1]!.typeId, post.shelf.prizes[2]!.typeId] }],
      },
    };
    for (const original of [fresh(5), post, withDeferred]) {
      const fake = new FakeStorage();
      expect(problem(original)).toBeNull();
      expect(store(fake).saveStable(original)).toMatchObject({ ok: true });
      expect(fake.data.has(STORAGE_KEYS.run)).toBe(false);
      expect(fake.data.has(KEY)).toBe(true);
      const r = store(fake, 'tab-B').load();
      expect(r.kind).toBe('resume');
      if (r.kind !== 'resume') return;
      const s = r.state as ExpandedRunState;
      expect(s.pauseReasons).toEqual(['manual']);
      expect(s.shelf).toEqual(original.shelf);
      expect(s.expansion.cells).toEqual(original.expansion.cells);
      expect(s.expansion.questionOrder).toEqual(original.expansion.questionOrder);
      expect(s.expansion.questionCursor).toBe(original.expansion.questionCursor);
      expect(s.expansion.next).toEqual(original.expansion.next);
      expect(s.expansion.assortmentSeries).toBe(original.expansion.assortmentSeries);
      expect(s.expansion.deferredTransforms).toEqual(original.expansion.deferredTransforms);
      expect(s.expansion.rng).toEqual(original.expansion.rng);
      expect(s.ammoLostTotal).toBe(original.ammoLostTotal);
      expect({ ...s, pauseReasons: [] }).toEqual(original);
    }
  });

  it('a state waiting for the answer restores as abandoned: no ranking, no redo, no replayed reservation', async () => {
    const q = await atQuestion();
    expect(q.inFlight!.stage).toBe('question');
    const fake = new FakeStorage();
    const a = store(fake);
    expect(a.saveAfterFire(q)).toMatchObject({ ok: true });
    const r = store(fake, 'tab-B').load();
    expect(r.kind).toBe('abandoned');
    if (r.kind !== 'abandoned') return;
    expect(r.cause).toBe('inFlight');
    const s = r.state as ExpandedRunState;
    expect(s.phase).toBe('abandoned');
    expect(s.inFlight).toBeNull();
    expect(s.expansion.active).toBeNull();
    expect(s.expansion.questionCursor).toBe(q.expansion.questionCursor);
    expect(s).toEqual(abandonRun(q));
    // the abandoned form was saved; a second reload says the same
    const again = store(fake, 'tab-C').load();
    expect(again.kind).toBe('abandoned');
    expect(problem(JSON.parse(fake.data.get(KEY)!).checkpoint.state)).toBeNull();
  });

  it('a state in post-effects restores as abandoned too', async () => {
    const q = await atQuestion();
    const post: ExpandedRunState = { ...q, inFlight: { ...q.inFlight!, stage: 'postEffects' } };
    expect(problem(post)).toBeNull();
    const fake = new FakeStorage();
    store(fake).saveAfterFire(post);
    const r = store(fake, 'tab-B').load();
    expect(r.kind).toBe('abandoned');
    if (r.kind === 'abandoned') expect(r.state.phase).toBe('abandoned');
  });

  it('schema-1 data under the expanded key and schema-2 data under the v1 key are quarantined; the other key is not touched', () => {
    const fakeA = new FakeStorage();
    store(fakeA).saveStable(fresh(7));
    const rawV2 = fakeA.data.get(KEY)!;
    const v1Store = createRunStore(fakeA, 'tab-V1', { catalog: bundle.catalog, tuning: bundle.tuning });
    fakeA.poke(STORAGE_KEYS.run, rawV2);
    expect(v1Store.load().kind).toBe('quarantined');
    expect(fakeA.data.has(STORAGE_KEYS.run)).toBe(false);
    expect(readQuarantine(fakeA)[0]!.key).toBe(STORAGE_KEYS.run);

    const fakeB = new FakeStorage();
    const forged = JSON.parse(rawV2);
    forged.checkpoint.state.schemaVersion = 1;
    fakeB.poke(KEY, JSON.stringify(forged));
    expect(store(fakeB).load().kind).toBe('quarantined');
    expect(readQuarantine(fakeB)[0]!.key).toBe(KEY);
    expect(fakeB.data.has(KEY)).toBe(false);
  });

  it('rejects tampered states', async () => {
    const s = await afterCellShot();
    expect(problem(tamper(s, (x) => (x.ammoLostTotal += 1)))).toMatch(/ammo/);
    expect(problem(tamper(s, (x) => (x.ammoLostTotal = -1)))).toMatch(/ammoLostTotal/);
    expect(problem(tamper(s, (x) => (x.expansion.questionOrder[1] = x.expansion.questionOrder[0])))).toMatch(/questionOrder/);
    expect(problem(tamper(s, (x) => x.expansion.questionOrder.pop()))).toMatch(/questionOrder/);
    expect(problem(tamper(s, (x) => (x.expansion.questionCursor = 99)))).toMatch(/questionCursor/);
    expect(problem(tamper(s, (x) => (x.expansion.cells[3].effectId = 'FX999')))).toMatch(/cell effect/);
    expect(problem(tamper(s, (x) => x.expansion.cells.pop()))).toMatch(/background cells/);
    expect(problem(tamper(s, (x) => ([x.expansion.cells[0], x.expansion.cells[1]] = [x.expansion.cells[1], x.expansion.cells[0]])))).toMatch(/out of order/);
    expect(problem(tamper(s, (x) => (x.expansion.cells[0].used = true)))).toMatch(/used cell|request id/);
    expect(problem(tamper(s, (x) => (x.expansion.cells[0].usedOnShot = 'shot-1')))).toMatch(/unused cell/);
    expect(problem(tamper(s, (x) => (x.expansion.active = x.expansion.next)))).toMatch(/active/);
    expect(problem(tamper(s, (x) => (x.expansion.next.modifiers.damageMult = 1e9)))).toMatch(/damage/);
    expect(problem(tamper(s, (x) => (x.expansion.next.modifiers.damageMult = null)))).toMatch(/damage/);
    expect(problem(tamper(s, (x) => (x.expansion.next.modifiers.launch.count = 4)))).toMatch(/launch/);
    expect(problem(tamper(s, (x) => (x.expansion.next.modifiers.extraReflections = 0.5)))).toMatch(/extraReflections/);
    expect(problem(tamper(s, (x) => (x.expansion.next.modifiers.bulletType = 'laser')))).toMatch(/bulletType/);
    expect(problem(tamper(s, (x) => (x.expansion.next.hint = 'telepathy')))).toMatch(/hint/);
    expect(problem(tamper(s, (x) => (x.expansion.assortmentSeries = 'SER999')))).toMatch(/assortmentSeries/);
    expect(problem(tamper(s, (x) => (x.expansion.rng.cells = [0, 0, 0, 0])))).toMatch(/rng/);
    expect(problem(tamper(s, (x) => (x.shelf.prizes[0].homeSlot = 't2c2')))).toMatch(/slot/);
    expect(problem(tamper(s, (x) => (x.shelf.prizes[0].motionTypeId = 'P999')))).toMatch(/motionTypeId/);
    const dt = (x: any, n: number): void => {
      const d = { instanceId: x.shelf.prizes[0].instanceId, requestId: 'req-1', candidateTypeIds: [x.shelf.prizes[1].typeId] };
      x.expansion.deferredTransforms = Array.from({ length: n }, () => d);
    };
    expect(problem(tamper(s, (x) => dt(x, 1)))).toBeNull();
    expect(problem(tamper(s, (x) => dt(x, 2)))).toMatch(/deferred/);
    expect(problem(tamper(s, (x) => (dt(x, 1), (x.expansion.deferredTransforms[0].candidateTypeIds = []))))).toMatch(/candidates/);
    expect(problem(tamper(s, (x) => (dt(x, 1), (x.expansion.deferredTransforms[0].instanceId = 'p9999'))))).toMatch(/deferred/);
    expect(problem(tamper(s, (x) => delete x.expansion))).toMatch(/expansion/);
  });

  it('active is rejected in every stable phase', async () => {
    const q = await atQuestion();
    expect(q.expansion.active).not.toBeNull();
    expect(problem(q)).toBeNull();
    for (const phase of ['position', 'loading', 'aiming', 'ended', 'abandoned']) {
      expect(problem({ ...q, phase, inFlight: null })).not.toBeNull();
    }
    expect(problem({ ...abandonRun(q), expansion: { ...q.expansion } })).toMatch(/active/);
  });

  it('two tabs conflict like today', () => {
    const fake = new FakeStorage();
    const a = store(fake, 'tab-A');
    const b = store(fake, 'tab-B');
    const s = fresh(9);
    expect(a.saveStable(s)).toMatchObject({ ok: true, revision: 1 });
    b.load();
    expect(b.saveStable(s)).toMatchObject({ ok: true, revision: 2 });
    expect(a.isStale()).toBe(true);
    expect(a.saveStable(s)).toMatchObject({ ok: false, reason: 'conflict' });
    expect(a.status().conflict).toBe(true);
  });

  it('never touches the rules-v1 key, and the rules-v1 store ignores the expanded key', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.run, 'old-run-bytes');
    store(fake).saveStable(fresh(2));
    expect(fake.data.get(STORAGE_KEYS.run)).toBe('old-run-bytes');
    const fake2 = new FakeStorage();
    store(fake2).saveStable(fresh(2));
    const v1 = createRunStore(fake2, 'tab-V1', { catalog: bundle.catalog, tuning: bundle.tuning });
    expect(v1.load()).toEqual({ kind: 'none' });
    expect(fake2.data.has(KEY)).toBe(true);
  });

  it('a failed pre-shot save keeps the flags as before', async () => {
    const q = await atQuestion();
    const fake = new FakeStorage();
    const a = store(fake);
    fake.failSet.add('*');
    expect(a.saveAfterFire(q)).toMatchObject({ ok: false });
    expect(a.status().fireSaveFailed).toBe(true);
    expect(a.status().available).toBe(false);
  });
});
