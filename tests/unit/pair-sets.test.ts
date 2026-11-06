import { describe, expect, it } from 'vitest';
import { completedSetsFor } from '../../src/catalog/sets';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { spawnPrize } from '../../src/core/replenish';
import { resolveShot } from '../../src/core/settlement';
import { BOOTH_LAYOUT, asPrizeTypeId, asSetId, mintId, type PrizeInstanceState, type PrizeTypeId, type RunState, type RuntimeCatalog, type SetId, type SetRuntimeConfig } from '../../src/contracts';
import { T, fired, newRun, syntheticRecord } from './helpers';

const tid = asPrizeTypeId;
const sid = asSetId;
const slots = BOOTH_LAYOUT.slots;
const expanded = getGameplayBundle('expanded-proposed');

/** Prize table of the real catalog, with a hand-picked set list (2- and 3-prize sets). */
function catalogWith(sets: readonly SetRuntimeConfig[]): RuntimeCatalog {
  return { rulesVersion: 'test', prizes: expanded.catalog.prizes, sets: new Map(sets.map((s) => [s.setId, s])) };
}
const pairCfg = (id: string, a: string, b: string, bonus = 50): SetRuntimeConfig => ({ setId: sid(id), requiredTypeIds: [tid(a), tid(b)], bonusScore: bonus, hintKey: `exp.pair.${id}.hint`, valueStatus: 'prototype' });
const trioCfg = (id: string, a: string, b: string, c: string, bonus = 100): SetRuntimeConfig => ({ setId: sid(id), requiredTypeIds: [tid(a), tid(b), tid(c)], bonusScore: bonus, hintKey: `set.${id}.hint`, valueStatus: 'prototype' });

function withShelf(s: RunState, cat: RuntimeCatalog, entries: readonly (readonly [string, number])[]): RunState {
  const prizes: PrizeInstanceState[] = entries.map(([type, n], i) => spawnPrize(cat, tid(type), slots[i]!, n, 0));
  return { ...s, shelf: { prizes, deferredSlots: [], nextInstanceNumber: 9000 } };
}
/** Fire from position phase and settle a record that collects exactly these instance numbers. */
function play(s: RunState, cat: RuntimeCatalog, collect: readonly number[]) {
  const f = fired(s);
  return resolveShot(f, syntheticRecord(f, collect.map(mintId.instance)), cat, T);
}
const setPoints = (r: ReturnType<typeof play>) => r.state.ledger.at(-1)!.setPoints;

describe('completedSetsFor with 2- and 3-prize sets', () => {
  const cat = catalogWith([pairCfg('PAIR001', 'P001', 'P002'), trioCfg('S001', 'P001', 'P002', 'P003')]);
  const kinds = (...ids: string[]) => new Set<PrizeTypeId>(ids.map(tid));

  it('completes a pair from two distinct kinds and a trio from three', () => {
    expect(completedSetsFor(cat, kinds('P001'), [])).toEqual([]);
    expect(completedSetsFor(cat, kinds('P001', 'P002'), [])).toEqual(['PAIR001']);
    expect(completedSetsFor(cat, kinds('P001', 'P002', 'P003'), [])).toEqual(['PAIR001', 'S001']);
  });
  it('completes a pair and a trio on the same collection, and never returns a completed set again', () => {
    const all = kinds('P001', 'P002', 'P003');
    expect(completedSetsFor(cat, all, [])).toHaveLength(2);
    expect(completedSetsFor(cat, all, [sid('PAIR001')])).toEqual(['S001']);
    expect(completedSetsFor(cat, all, [sid('PAIR001'), sid('S001')])).toEqual([]);
  });
  it('lets one kind finish several pairs because collected kinds are not consumed', () => {
    const c = catalogWith([pairCfg('PAIR001', 'P001', 'P002'), pairCfg('PAIR002', 'P001', 'P003')]);
    expect(completedSetsFor(c, kinds('P001', 'P002', 'P003'), [])).toEqual(['PAIR001', 'PAIR002']);
  });
  it('real expanded catalog: PAIR001 is P001 + P002 and completes from exactly those kinds', () => {
    const real = expanded.catalog;
    const got = completedSetsFor(real, kinds('P001', 'P002'), []);
    expect(got).toContain('PAIR001');
    expect(completedSetsFor(real, kinds('P001'), []).filter((s: SetId) => s.startsWith('PAIR'))).toEqual([]);
  });
});

describe('settlement of pair sets', () => {
  const cat = catalogWith([pairCfg('PAIR001', 'P001', 'P002'), trioCfg('S001', 'P001', 'P002', 'P003')]);
  const base = () => newRun(7);

  it('two prizes of the same kind never complete a pair', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P001', 2]]);
    const r = play(s, cat, [1, 2]);
    expect(r.summary.newlyCompletedSets).toEqual([]);
    expect(setPoints(r)).toBe(0);
  });

  it('two different kinds in one shot complete the pair once with the set config points (50)', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P002', 2]]);
    const r = play(s, cat, [1, 2]);
    expect(r.summary.newlyCompletedSets).toEqual(['PAIR001']);
    expect(setPoints(r)).toBe(50);
    expect(r.state.completedSets).toEqual(['PAIR001']);
  });

  it('two different kinds over two shots complete the pair on the second shot', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P002', 2]]);
    const first = play(s, cat, [1]);
    expect(first.summary.newlyCompletedSets).toEqual([]);
    const next = { ...first.state, shelf: { ...first.state.shelf, prizes: [spawnPrize(cat, tid('P002'), slots[1]!, 9100, 0)] } };
    const second = play(next, cat, [9100]);
    expect(second.summary.newlyCompletedSets).toEqual(['PAIR001']);
    expect(setPoints(second)).toBe(50);
  });

  it('a pair and a trio completing on the same shot each score once, from their own config (50 vs 100)', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P002', 2], ['P003', 3]]);
    const r = play(s, cat, [1, 2, 3]);
    expect([...r.summary.newlyCompletedSets].sort()).toEqual(['PAIR001', 'S001']);
    expect(setPoints(r)).toBe(150);
    const items = r.summary.ledger.items.filter((i) => i.kind === 'set');
    expect(items.map((i) => [i.refId, i.points]).sort()).toEqual([['PAIR001', 50], ['S001', 100]]);
  });

  it('collecting the same kind again later adds no second set score', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P002', 2]]);
    const first = play(s, cat, [1, 2]);
    const again = { ...first.state, shelf: { ...first.state.shelf, prizes: [spawnPrize(cat, tid('P001'), slots[0]!, 9200, 0), spawnPrize(cat, tid('P002'), slots[1]!, 9201, 0)] } };
    const second = play(again, cat, [9200, 9201]);
    expect(second.summary.newlyCompletedSets).toEqual([]);
    expect(setPoints(second)).toBe(0);
    expect(second.state.completedSets).toEqual(['PAIR001']);
  });

  it('re-processing the same record adds 0 points and no set', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P002', 2]]);
    const f = fired(s);
    const rec = syntheticRecord(f, [mintId.instance(1), mintId.instance(2)]);
    const first = resolveShot(f, rec, cat, T);
    expect(first.summary.newlyCompletedSets).toEqual(['PAIR001']);
    // feed the same record to the settled state as if it were in flight again
    const replay: RunState = { ...first.state, phase: 'resolving', inFlight: f.inFlight };
    const second = resolveShot(replay, rec, cat, T);
    expect(second.summary.newlyCompletedSets).toEqual([]);
    expect(second.summary.collected).toEqual([]);
    expect(second.state.score).toBe(first.state.score);
    expect(second.state.completedSets).toEqual(['PAIR001']);
  });

  it('pair points are read from the config: prototype 50 in the expanded catalog, 100 in rules-v1 sets', () => {
    expect(expanded.catalog.sets.get(sid('PAIR001'))!.bonusScore).toBe(50);
    expect(expanded.catalog.sets.get(sid('S001'))!.bonusScore).toBe(100);
    const custom = catalogWith([pairCfg('PAIR001', 'P001', 'P002', 77)]);
    const s = withShelf(base(), custom, [['P001', 1], ['P002', 2]]);
    expect(setPoints(play(s, custom, [1, 2]))).toBe(77);
  });

  it('uses the kind at collection time, so a transformed prize counts as its new kind', () => {
    const s = withShelf(base(), cat, [['P001', 1], ['P003', 2]]);
    const f = fired(s);
    // instance 2 was P003 on the shelf but is collected as P002 after a transform
    const rec = syntheticRecord(f, [mintId.instance(1)], { collected: [{ instanceId: mintId.instance(1), typeId: tid('P001') }, { instanceId: mintId.instance(2), typeId: tid('P002') }] });
    const r = resolveShot(f, rec, cat, T);
    expect(r.summary.newlyCompletedSets).toEqual(['PAIR001']);
  });
});
