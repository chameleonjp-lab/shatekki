import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPANSION_RAW_DATA, getGameplayBundle, resolveBundleKey } from '../../src/catalog/gameplay-config';
import { buildExpandedCatalog, expansionStatusSummary, ExpansionDataError } from '../../src/catalog/expanded-config';
import { validateExpansionData } from '../../src/catalog/expansion-validate';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../../src/catalog/release-config';
import { BOOTH_LAYOUT, BOOTH_LAYOUT_V2, EFFECT_OPERATION_KINDS, catalogValueStatus, isOfficialRankingEligible, type FinalResult } from '../../src/contracts';

const raw = () => JSON.parse(JSON.stringify(EXPANSION_RAW_DATA)) as any;
const reasons = (data: unknown) => validateExpansionData(RELEASE_CATALOG, data).map((e) => `${e.targetId}: ${e.reason}`);

describe('expanded gameplay data (EG01)', () => {
  it('validates the shipped appendix data without errors', () => {
    expect(validateExpansionData(RELEASE_CATALOG, EXPANSION_RAW_DATA)).toEqual([]);
  });

  it('has 300 pairs over 600 references covering all 100 prizes, no duplicate unordered pair', () => {
    const { pairSets } = EXPANSION_RAW_DATA;
    expect(pairSets).toHaveLength(300);
    const refs = pairSets.flatMap((p) => p.prizeIds);
    expect(refs).toHaveLength(600);
    expect(new Set(refs).size).toBe(100);
    expect(new Set(pairSets.map((p) => [...p.prizeIds].sort().join('+'))).size).toBe(300);
    expect(new Set(pairSets.map((p) => p.id)).size).toBe(300);
    for (const p of pairSets) expect(p.prizeIds[0]).not.toBe(p.prizeIds[1]);
  });

  it('has 200 questions with 400 choices whose A and B groups differ', () => {
    const { questions } = EXPANSION_RAW_DATA;
    expect(questions).toHaveLength(200);
    expect(questions.flatMap((q) => [q.A, q.B])).toHaveLength(400);
    for (const q of questions) expect(q.A.group, q.id).not.toBe(q.B.group);
    expect(new Set(questions.map((q) => q.id)).size).toBe(200);
  });

  it('has 100 effects with known operations, 20 series with >=3 prizes and 6 groups', () => {
    const { effects, series, groups } = EXPANSION_RAW_DATA;
    expect(effects).toHaveLength(100);
    for (const e of effects) expect(EFFECT_OPERATION_KINDS as readonly string[]).toContain(e.operation.kind);
    expect(series).toHaveLength(20);
    for (const s of series) {
      expect(new Set(s.prizeIds).size).toBeGreaterThanOrEqual(3);
      expect(s.color).toMatch(/^#[0-9A-F]{6}$/);
    }
    expect(groups.map((g) => [g.id, g.effectIds.length])).toEqual([
      ['GAIN', 20],
      ['RISK', 40],
      ['STOCK', 20],
      ['GUIDE', 20],
      ['MIX', 20],
      ['CHAOS', 100],
    ]);
  });

  it('the committed JSON equals a fresh extraction of the appendices', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['scripts/expansion/extract-appendices.mjs', '--check'], { encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
  });

  it('keeps the designer note out of the in-game hint key', () => {
    const b = getGameplayBundle('expanded-proposed');
    expect(b.catalog.sets.get('PAIR001' as never)?.hintKey).toBe('exp.pair.PAIR001.hint');
  });

  it('does not touch the approved rules-v1 data', () => {
    const sha = createHash('sha256').update(readFileSync('data/release-approved-v1.json')).digest('hex');
    expect(sha).toBe('1f5b15d50f69ca79462c91af72fde9c4cf9a4a1a45bbb836601bf7946b2a7927');
    const cand = createHash('sha256').update(readFileSync('data/catalog-candidates.json')).digest('hex');
    expect(cand).toBe('23346bb5531a45b8c8ec1ff9ead6af7e9720e3371f0b60dd430bf27dcd32d257');
  });
});

describe('validation failures', () => {
  it('rejects a reversed duplicate pair', () => {
    const d = raw();
    d.pairSets[1].prizeIds = [...d.pairSets[0].prizeIds].reverse();
    expect(reasons(d).join('\n')).toContain('duplicate pair');
  });
  it('rejects undefined ids and an undefined inside a tuple', () => {
    const d = raw();
    d.pairSets[0].id = undefined;
    expect(reasons(d).join('\n')).toContain('invalid pair set id');
    const e = raw();
    e.pairSets[3].prizeIds = ['P001', undefined];
    expect(reasons(e).join('\n')).toContain('not a prize type id');
    const f = raw();
    f.pairSets[3].prizeIds = ['P001', 'P002', undefined];
    expect(reasons(f).join('\n')).toContain('exactly 2 entries');
  });
  it('rejects a missing prize in the coverage, wrong counts and unknown prizes', () => {
    const d = raw();
    d.pairSets = d.pairSets.filter((p: any) => !p.prizeIds.includes('P100'));
    expect(reasons(d).join('\n')).toMatch(/P100: prize appears in no pair set/);
    const e = raw();
    e.pairSets[0].prizeIds = ['P001', 'P999'];
    expect(reasons(e).join('\n')).toContain('prize does not exist: P999');
  });
  it('rejects equal A/B groups and unknown groups', () => {
    const d = raw();
    d.questions[0].B.group = d.questions[0].A.group;
    expect(reasons(d).join('\n')).toContain('different effect groups');
    const e = raw();
    e.questions[0].A.group = 'NOPE';
    expect(reasons(e).join('\n')).toContain('group does not exist');
  });
  it('rejects unknown operations, NaN/Infinity, out-of-range values and unknown series', () => {
    const d = raw();
    d.effects[0].operation = { kind: 'explode' };
    expect(reasons(d).join('\n')).toContain('unknown operation kind');
    const e = raw();
    e.effects[3].operation = { kind: 'shotModifiers', set: { damageMult: NaN } };
    expect(reasons(e).join('\n')).toContain('finite');
    const f = raw();
    f.effects[3].operation = { kind: 'shotModifiers', set: { damageMult: Infinity } };
    expect(reasons(f).join('\n')).toContain('finite');
    const g = raw();
    g.effects[3].operation = { kind: 'shotModifiers', set: { damageMult: 9 } };
    expect(reasons(g).join('\n')).toContain('outside the profile range');
    const h = raw();
    h.effects[40].operation = { kind: 'seriesAssortment', seriesId: 'SER99' };
    expect(reasons(h).join('\n')).toContain('series does not exist');
    const i = raw();
    i.effects[3].operation = { kind: 'shotModifiers', set: { bogus: 1 } };
    expect(reasons(i).join('\n')).toContain('unknown shot modifier field');
  });
  it('rejects small series, bad colours and non-finite profile values', () => {
    const d = raw();
    d.series[0].prizeIds = ['P001', 'P002'];
    expect(reasons(d).join('\n')).toContain('at least 3');
    const e = raw();
    e.series[0].color = 'orange';
    expect(reasons(e).join('\n')).toContain('#RRGGBB');
    const f = raw();
    f.profile.pairSetBonusScore = NaN;
    expect(reasons(f).join('\n')).toContain('pairSetBonusScore');
    const g = raw();
    g.profile.limits.speedMult.max = Infinity;
    expect(reasons(g).join('\n')).toContain('limits.speedMult');
  });
  it('buildExpandedCatalog throws with the error list', () => {
    const d = raw();
    d.effects.pop();
    expect(() => buildExpandedCatalog(RELEASE_CATALOG, d)).toThrow(ExpansionDataError);
  });
  it('an effect or profile claiming a status other than prototype is rejected, never promoting the bundle', () => {
    const d = raw();
    d.effects[0].valueStatus = 'approved';
    expect(() => buildExpandedCatalog(RELEASE_CATALOG, d)).toThrow(ExpansionDataError);
    const e = raw();
    e.profile.valueStatus = 'approved';
    expect(() => buildExpandedCatalog(RELEASE_CATALOG, e)).toThrow(ExpansionDataError);
  });
});

describe('gameplay bundles', () => {
  it('official-v1 is exactly the release config objects', () => {
    const b = getGameplayBundle('official-v1');
    expect(b.catalog).toBe(RELEASE_CATALOG);
    expect(b.tuning).toBe(RELEASE_TUNING);
    expect(b.layout).toBe(BOOTH_LAYOUT);
    expect(b.expansion).toBeNull();
    expect(b.catalog.rulesVersion).toBe('rules-v1');
    expect(catalogValueStatus(b.catalog)).toBe('approved');
  });

  it('expanded-proposed adds 300 prototype pair sets and keeps S001-S100 and the 100 prizes', () => {
    const b = getGameplayBundle('expanded-proposed');
    expect(b.key).toBe('expanded-proposed');
    expect(b.catalog.rulesVersion).toBe('rules-v2-proposed-r001');
    expect(b.catalog.prizes).toBe(RELEASE_CATALOG.prizes);
    expect(b.catalog.sets.size).toBe(400);
    for (const [id, s] of RELEASE_CATALOG.sets) expect(b.catalog.sets.get(id)).toBe(s);
    const pair = b.catalog.sets.get('PAIR001' as never)!;
    expect(pair.requiredTypeIds).toHaveLength(2);
    expect(pair.bonusScore).toBe(50);
    expect(pair.valueStatus).toBe('prototype');
    expect(b.expansion!.pairSetIds).toHaveLength(300);
    expect(b.tuning.shelfSlotCount).toBe(36);
    expect(b.tuning.draw.tierTargets).toEqual({ easy: 12, normal: 16, hard: 8 });
    expect(b.tuning.valueStatus).toBe('prototype');
    expect(b.tuning.initialAmmo).toBe(RELEASE_TUNING.initialAmmo);
    expect(b.layout).toBe(BOOTH_LAYOUT_V2);
  });

  it('is never ranking-eligible: the expanded catalog and expansion are prototype', () => {
    const b = getGameplayBundle('expanded-proposed');
    expect(catalogValueStatus(b.catalog)).toBe('prototype');
    const summary = expansionStatusSummary(b.expansion!, b.catalog);
    expect(summary.overall).toBe('prototype');
    expect(summary.counts.approved).toBe(0);
    expect(summary.counts.prototype).toBe(1 + 300 + 100);
    const result: FinalResult = {
      runId: 'r' as never,
      rulesVersion: b.catalog.rulesVersion,
      valueStatus: catalogValueStatus(b.catalog),
      status: 'completed',
      score: 1,
      shotsFired: 1,
      collected: [],
      completedSets: [],
      maxChain: 0,
      ledger: [],
      playerName: 'x',
    };
    expect(isOfficialRankingEligible(result)).toBe(false);
  });

  it('builds once and freezes the result', () => {
    const a = getGameplayBundle('expanded-proposed');
    expect(getGameplayBundle('expanded-proposed')).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.expansion)).toBe(true);
    expect(Object.isFrozen(a.tuning)).toBe(true);
    expect(Object.isFrozen(a.expansion!.effects.get('FX019' as never)!.operation)).toBe(true);
  });

  it('exposes stable i18n keys and expected effect operations', () => {
    const e = getGameplayBundle('expanded-proposed').expansion!;
    expect(e.questions.get('Q001' as never)).toMatchObject({ textKey: 'exp.q.Q001', choices: { A: { textKey: 'exp.q.Q001.A', groupId: 'GUIDE' }, B: { groupId: 'STOCK' } } });
    expect(e.effects.get('FX001' as never)).toMatchObject({ nameKey: 'exp.fx.FX001.name', resultKey: 'exp.fx.FX001.result', timing: 'afterFlight', operation: { kind: 'ammoAdd', amount: 1 } });
    expect(e.groups.get('GAIN' as never)?.labelKey).toBe('exp.group.GAIN');
    expect(e.series.get('SER01' as never)).toMatchObject({ labelKey: 'exp.series.SER01.label', symbolKey: 'exp.series.SER01.symbol', color: '#F28C28' });
    expect(e.effects.get('FX092' as never)?.operation.kind).toBe('transformToLastCollected');
    expect(e.effects.get('FX100' as never)?.operation).toEqual({ kind: 'hint', hint: 'angleTicks' });
  });
});

describe('resolveBundleKey', () => {
  it('returns expanded only for the exact string', () => {
    expect(resolveBundleKey('expanded-proposed')).toBe('expanded-proposed');
    for (const v of [undefined, null, '', 'official-v1', 'Expanded-Proposed', 'expanded-proposed ', 1, {}, ['expanded-proposed']]) expect(resolveBundleKey(v)).toBe('official-v1');
  });
});
