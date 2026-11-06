import { describe, expect, it } from 'vitest';
import { STORAGE_KEYS, createProfileStore, createVersionedProfileStore, expandedRunKey, readQuarantine } from '../../src/persistence';
import type { SetId } from '../../src/contracts';
import { FakeStorage } from '../integration/fake-storage';

const NOW = () => '2026-11-06T00:00:00.000Z';
const V1 = 'rules-v1';
const V2 = 'rules-v2-proposed-r001';
const mk = (s: FakeStorage, rulesVersion = V2) => createVersionedProfileStore(s, { rulesVersion, now: NOW });
const sid = (x: string) => x as SetId;
const done = (score: number, rulesVersion: string | undefined = V2) => ({ status: 'completed' as const, score, rulesVersion });

function v1Profile(best: number | null, sets: string[]): string {
  return JSON.stringify({ schemaVersion: 1, bestScore: best, discoveredSets: sets });
}

describe('storage keys', () => {
  it('keeps the old keys and never maps an expanded version onto the rules-v1 run key', () => {
    expect(STORAGE_KEYS.run).toBe('shatekki.run.v1');
    expect(STORAGE_KEYS.profile).toBe('shatekki.profile.v1');
    expect(STORAGE_KEYS.profileV2).toBe('shatekki.profile.v2');
    expect(expandedRunKey(V2)).toBe('shatekki.run.rules-v2-proposed-r001');
    expect(expandedRunKey(V2)).not.toBe(STORAGE_KEYS.run);
    expect(() => expandedRunKey('Bad Key')).toThrow();
    expect(() => expandedRunKey('')).toThrow();
  });
});

describe('versioned profile', () => {
  it('keeps the old best as the legacy best, never as rules-v1, and does not touch the v1 key', () => {
    const fake = new FakeStorage();
    const old = v1Profile(777, ['S001']);
    fake.poke(STORAGE_KEYS.profile, old);
    const p = mk(fake);
    expect(p.load().bestScore).toBeNull();
    expect(p.legacyBestScore()).toBe(777);
    expect(p.bestFor(V1)).toBeNull();
    expect(p.bestFor(V2)).toBeNull();
    expect(p.load().discoveredSets).toEqual(['S001']);
    expect(fake.data.get(STORAGE_KEYS.profile)).toBe(old);
  });

  it('keeps one best per rules version independently; abandoned runs never set one', () => {
    const fake = new FakeStorage();
    const p = mk(fake);
    expect(p.recordRunEnd(done(500))).toEqual({ newBest: true });
    expect(p.recordRunEnd(done(300))).toEqual({ newBest: false });
    expect(p.recordRunEnd(done(900, V1))).toEqual({ newBest: true });
    expect(p.recordRunEnd({ status: 'abandoned', score: 5000, rulesVersion: V2 })).toEqual({ newBest: false });
    expect(p.bestFor(V2)).toBe(500);
    expect(p.bestFor(V1)).toBe(900);
    expect(p.load().bestScore).toBe(500);
    expect(mk(fake, V1).load().bestScore).toBe(900);
    expect(p.recordRunEnd(done(0, 'rules-v3'))).toEqual({ newBest: true }); // a zero score is a score
  });

  it('refuses a result without a rules version', () => {
    const fake = new FakeStorage();
    const p = mk(fake);
    expect(p.recordRunEnd({ status: 'completed', score: 100 })).toEqual({ newBest: false });
    expect(fake.data.has(STORAGE_KEYS.profileV2)).toBe(false);
  });

  it('merges old discoveries and re-merges what an old app wrote later; PAIR sets are stored', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.profile, v1Profile(10, ['S001', 'S002']));
    const p = mk(fake);
    expect(p.discoverSets([sid('PAIR007'), sid('S002')])).toEqual(['PAIR007']);
    expect(p.load().discoveredSets).toEqual(['S001', 'S002', 'PAIR007']);
    fake.poke(STORAGE_KEYS.profile, v1Profile(50, ['S001', 'S002', 'S003']));
    const again = p.load();
    expect(again.discoveredSets).toEqual(['S001', 'S002', 'PAIR007', 'S003']);
    expect(p.legacyBestScore()).toBe(50);
    expect(JSON.parse(fake.data.get(STORAGE_KEYS.profileV2)!)).toMatchObject({ schemaVersion: 2, legacyBestScore: 50, bestScores: {} });
  });

  it('leaves the v1 key byte-identical after expanded writes, and the v1 store still works', () => {
    const fake = new FakeStorage();
    const old = v1Profile(40, ['S001']);
    fake.poke(STORAGE_KEYS.profile, old);
    const p = mk(fake);
    p.discoverSets([sid('PAIR001')]);
    p.recordRunEnd(done(1234));
    expect(fake.data.get(STORAGE_KEYS.profile)).toBe(old);
    const v1 = createProfileStore(fake, NOW).load();
    expect(v1.bestScore).toBe(40);
    expect(v1.discoveredSets).toEqual(['S001']);
  });

  it('re-running the migration is idempotent', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.profile, v1Profile(70, ['S001', 'S002']));
    const a = mk(fake);
    a.load();
    const first = fake.data.get(STORAGE_KEYS.profileV2);
    const writes = fake.setCalls;
    a.load();
    mk(fake, 'rules-v9').load();
    expect(fake.data.get(STORAGE_KEYS.profileV2)).toBe(first);
    expect(fake.setCalls).toBe(writes);
    expect(a.load().discoveredSets).toEqual(['S001', 'S002']);
  });

  it('two stores (tabs) never lose a discovery or a higher best', () => {
    const fake = new FakeStorage();
    const a = mk(fake);
    const b = mk(fake);
    a.discoverSets([sid('PAIR001')]);
    b.discoverSets([sid('PAIR002')]);
    a.recordRunEnd(done(300));
    b.recordRunEnd(done(900));
    a.recordRunEnd(done(600));
    expect(a.load().discoveredSets).toEqual(['PAIR001', 'PAIR002']);
    expect(b.load().discoveredSets).toEqual(['PAIR001', 'PAIR002']);
    expect(a.bestFor(V2)).toBe(900);
  });

  it('quarantines invalid v2 data and keeps the in-memory value', () => {
    const fake = new FakeStorage();
    const p = mk(fake);
    p.discoverSets([sid('PAIR001')]);
    fake.poke(STORAGE_KEYS.profileV2, '{broken');
    expect(p.load().discoveredSets).toEqual(['PAIR001']);
    expect(readQuarantine(fake).some((q) => q.key === STORAGE_KEYS.profileV2 && q.raw === '{broken')).toBe(true);
    const q = readQuarantine(fake).length;
    p.load();
    expect(readQuarantine(fake)).toHaveLength(q); // the same raw is not quarantined twice
    p.discoverSets([sid('PAIR002')]);
    expect(JSON.parse(fake.data.get(STORAGE_KEYS.profileV2)!).discoveredSets).toEqual(['PAIR001', 'PAIR002']);
  });

  it('keeps the trusted part of a partly invalid v2 value and keeps the original aside', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.profileV2, JSON.stringify({ schemaVersion: 2, bestScores: { [V2]: 10, bad: -3 }, legacyBestScore: null, discoveredSets: ['PAIR001', 'nope'] }));
    const p = mk(fake);
    expect(p.bestFor(V2)).toBe(10);
    expect(p.load().discoveredSets).toEqual(['PAIR001']);
    expect(readQuarantine(fake)).toHaveLength(1);
  });

  it('a wrong schema version is quarantined, not interpreted', () => {
    const fake = new FakeStorage();
    fake.poke(STORAGE_KEYS.profileV2, JSON.stringify({ schemaVersion: 3, bestScores: { [V2]: 99 } }));
    expect(mk(fake).bestFor(V2)).toBeNull();
    expect(readQuarantine(fake)).toHaveLength(1);
  });

  it('keeps playing in memory when storage fails, and a failed v2 write leaves v1 untouched', () => {
    const fake = new FakeStorage();
    const old = v1Profile(5, ['S001']);
    fake.poke(STORAGE_KEYS.profile, old);
    const p = mk(fake);
    fake.failSet.add('*');
    expect(p.recordRunEnd(done(80))).toEqual({ newBest: true });
    expect(p.status().available).toBe(false);
    expect(p.bestFor(V2)).toBe(80);
    expect(fake.data.get(STORAGE_KEYS.profile)).toBe(old);
    fake.failSet.clear();
    p.discoverSets([sid('PAIR003')]);
    expect(p.status().available).toBe(true);
    expect(JSON.parse(fake.data.get(STORAGE_KEYS.profileV2)!)).toMatchObject({ bestScores: { [V2]: 80 }, discoveredSets: ['S001', 'PAIR003'] });
  });

  it('survives unreadable storage', () => {
    const fake = new FakeStorage();
    const p = mk(fake);
    p.discoverSets([sid('PAIR001')]);
    fake.failGet = true;
    expect(p.load().discoveredSets).toEqual(['PAIR001']);
    expect(p.status().available).toBe(false);
    expect(p.recordRunEnd(done(10))).toEqual({ newBest: true });
  });
});
