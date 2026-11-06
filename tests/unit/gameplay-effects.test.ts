import { describe, expect, it } from 'vitest';
import { seedRng } from '../../src/catalog/rng';
import { EMPTY_RESERVATION, applyOperation, inapplicableReason, mergeModifiers, realAmmoAdd, realAmmoRemove, type EffectEnv, type EffectWork } from '../../src/core/gameplay-effects';
import { outlineTargets, refillCandidates, seriesOfType, sortPrizesByBoardOrder } from '../../src/core/series';
import { BASE_SHOT_MODIFIERS, asPrizeTypeId, mintId, type EffectOperation, type PrizeInstanceState, type SeriesId } from '../../src/contracts';
import { EXP, SHOT1, bundle, expandedRun, inFlight, withKinds } from './expanded-helpers';

const T = bundle.tuning;
const REQ = mintId.effectRequest(SHOT1, 1);

function workOf(over: Partial<EffectWork> = {}): EffectWork {
  return { ammo: 5, bonusAmmoTotal: 0, ammoLostTotal: 0, bulletType: 'standard', next: EMPTY_RESERVATION, assortmentSeries: null, outlineSeries: null, penaltyPoints: 0, transforms: [], rng: seedRng(42), ...over };
}
/** 36 prizes; prize 0 was placed as P001 but is now P050 (a transformed one). */
function prizesWithTransformed(): PrizeInstanceState[] {
  const run = withKinds(inFlight(expandedRun(3)), { 0: 'P001', 1: 'P002', 2: 'P002' });
  return run.shelf.prizes.map((p, i) => (i === 0 ? { ...p, typeId: asPrizeTypeId('P050') } : p));
}
function envOf(over: Partial<EffectEnv> = {}): EffectEnv {
  return { tuning: T, expansion: EXP, shotsFired: 1, prizes: prizesWithTransformed(), lastCollectedTypeId: asPrizeTypeId('P077'), ...over };
}
const ops = (id: string): EffectOperation => EXP.effects.get(id as never)!.operation;

describe('every one of the 100 effects has a handler (table driven)', () => {
  const all = [...EXP.effects.values()];
  it('covers all 100 effects', () => expect(all).toHaveLength(100));

  for (const def of all) {
    it(`${def.effectId} (${def.operation.kind}) applies and does what its operation says`, () => {
      const work = workOf();
      const env = envOf();
      const r = applyOperation(def.operation, REQ, work, env);
      const op = def.operation;
      expect(r.outcome, `${def.effectId} ${r.reason}`).toBe('applied');
      switch (op.kind) {
        case 'ammoAdd':
          expect(r.ammoDelta).toBe(op.amount);
          expect(r.work.ammo).toBe(5 + op.amount);
          expect(r.work.bonusAmmoTotal).toBe(op.amount);
          break;
        case 'ammoRemove':
          expect(r.ammoDelta).toBe(-op.amount);
          expect(r.work.ammo).toBe(5 - op.amount);
          expect(r.work.ammoLostTotal).toBe(op.amount);
          expect(r.work.bonusAmmoTotal).toBe(0);
          break;
        case 'shotModifiers':
          for (const [k, v] of Object.entries(op.set)) expect((r.work.next.modifiers as unknown as Record<string, unknown>)[k], k).toEqual(v);
          for (const k of Object.keys(BASE_SHOT_MODIFIERS)) if (!(k in op.set)) expect((r.work.next.modifiers as unknown as Record<string, unknown>)[k], k).toEqual((BASE_SHOT_MODIFIERS as unknown as Record<string, unknown>)[k]);
          expect(r.work.ammo).toBe(5);
          break;
        case 'resetShotModifiers':
          expect(r.work.next.modifiers).toEqual({ ...BASE_SHOT_MODIFIERS, bulletType: 'standard' });
          break;
        case 'hint':
          expect(r.work.next.hint).toBe(op.hint);
          break;
        case 'seriesOutline':
          expect(r.work.outlineSeries).toBe(op.seriesId);
          expect(r.work.assortmentSeries).toBeNull();
          expect(r.work.transforms).toEqual([]);
          break;
        case 'seriesAssortment': {
          expect(r.work.assortmentSeries).toBe(op.seriesId);
          expect(r.work.outlineSeries).toBeNull();
          const members = [...EXP.series.get(op.seriesId)!.typeIds].sort();
          expect(r.work.transforms.length).toBeGreaterThan(0);
          for (const t of r.work.transforms) expect([...t.candidateTypeIds].sort()).toEqual(members);
          break;
        }
        case 'transformCopyType':
        case 'transformRevert':
        case 'transformToLastCollected':
          expect(r.work.transforms).toHaveLength(1);
          expect(r.targets).toEqual([r.work.transforms[0]!.instanceId]);
          break;
      }
      // an operation never touches fields it does not own
      if (op.kind !== 'seriesAssortment') expect(r.work.rng).toEqual(work.rng);
    });
  }

  it('unknown operation kinds are rejected, never ignored', () => {
    expect(() => applyOperation({ kind: 'explode' } as unknown as EffectOperation, REQ, workOf(), envOf())).toThrow(RangeError);
    expect(() => inapplicableReason({ kind: 'explode' } as unknown as EffectOperation, workOf(), envOf())).toThrow(RangeError);
  });
});

describe('ammo effects', () => {
  it('bonus 9 and a request of +2 really gives +1 and the cumulative bonus is 10', () => {
    const r = applyOperation(ops('FX002'), REQ, workOf({ bonusAmmoTotal: 9 }), envOf());
    expect(r.outcome).toBe('applied');
    expect(r.ammoDelta).toBe(1);
    expect(r.work.ammo).toBe(6);
    expect(r.work.bonusAmmoTotal).toBe(10);
  });
  it('bonus already 10 is an explicit not-applicable outcome', () => {
    const r = applyOperation(ops('FX001'), REQ, workOf({ bonusAmmoTotal: 10 }), envOf());
    expect(r).toMatchObject({ outcome: 'notApplicable', reason: 'noAmmoRoom', ammoDelta: 0 });
  });
  it('the firing-room cap also limits an add', () => {
    // initial 10 + max 10 - shotsFired 19 - ammo 0 = 1 firing chance left
    expect(realAmmoAdd(3, { ammo: 0, bonusAmmoTotal: 2 }, 19, T)).toBe(1);
    expect(realAmmoAdd(3, { ammo: 1, bonusAmmoTotal: 2 }, 19, T)).toBe(0);
  });
  it('ammo 2 with remove 3 really removes 1; the bonus total is not reduced', () => {
    const r = applyOperation(ops('FX023'), REQ, workOf({ ammo: 2, bonusAmmoTotal: 4 }), envOf());
    expect(r.ammoDelta).toBe(-1);
    expect(r.work.ammo).toBe(1);
    expect(r.work.ammoLostTotal).toBe(1);
    expect(r.work.bonusAmmoTotal).toBe(4);
  });
  it('ammo 1 or 0 cannot be removed and 0 is not raised to 1', () => {
    for (const ammo of [1, 0]) {
      const r = applyOperation(ops('FX021'), REQ, workOf({ ammo }), envOf());
      expect(r).toMatchObject({ outcome: 'notApplicable', reason: 'ammoAtMostOne', ammoDelta: 0 });
      expect(r.work.ammo).toBe(ammo);
      expect(r.work.ammoLostTotal).toBe(0);
    }
    expect(realAmmoRemove(3, 0)).toBe(0);
    expect(realAmmoRemove(3, 4)).toBe(3);
    expect(realAmmoRemove(3, 3)).toBe(2);
  });
  it('requests are processed one after another and each adds the real amount', () => {
    const a = applyOperation(ops('FX003'), REQ, workOf({ bonusAmmoTotal: 8 }), envOf());
    const b = applyOperation(ops('FX003'), REQ, a.work, envOf());
    expect([a.ammoDelta, b.ammoDelta]).toEqual([2, 0]);
    expect(b.work.bonusAmmoTotal).toBe(10);
  });
});

describe('bullet settings', () => {
  it('the last value wins per field and values are never multiplied together', () => {
    const a = applyOperation(ops('FX004'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX005'), REQ, a.work, envOf());
    expect(b.work.next.modifiers.damageMult).toBe(1.5);
  });
  it('different fields combine', () => {
    const a = applyOperation(ops('FX004'), REQ, workOf(), envOf()); // damage 1.25
    const b = applyOperation(ops('FX007'), REQ, a.work, envOf()); // push 1.5
    const c = applyOperation(ops('FX010'), REQ, b.work, envOf()); // speed 1.1
    expect(c.work.next.modifiers).toMatchObject({ damageMult: 1.25, pushMult: 1.5, speedMult: 1.1 });
  });
  it('FX087 overwrites both damage and push; FX089 leaves damage alone', () => {
    const a = applyOperation(ops('FX005'), REQ, workOf(), envOf()); // damage 1.5
    const b = applyOperation(ops('FX089'), REQ, a.work, envOf()); // speed 1.2 + push 0.75
    expect(b.work.next.modifiers).toMatchObject({ damageMult: 1.5, speedMult: 1.2, pushMult: 0.75 });
    const c = applyOperation(ops('FX087'), REQ, b.work, envOf());
    expect(c.work.next.modifiers).toMatchObject({ damageMult: 1.5, pushMult: 0.75, speedMult: 1.2 });
  });
  it('launch and reflections are overwritten, not added to each other', () => {
    const a = applyOperation(ops('FX019'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX086'), REQ, a.work, envOf());
    expect(b.work.next.modifiers.launch).toEqual({ count: 3, spreadRad: 0.175 });
    const c = applyOperation(ops('FX020'), REQ, b.work, envOf());
    const d = applyOperation(ops('FX040'), REQ, c.work, envOf());
    expect(d.work.next.modifiers.extraReflections).toBe(-2);
  });
  it('FX082 resets every reserved setting to the base with standard bullets, and keeps a hint', () => {
    let w = applyOperation(ops('FX017'), REQ, workOf(), envOf()).work; // heavy bullets
    w = applyOperation(ops('FX005'), REQ, w, envOf()).work;
    w = applyOperation(ops('FX093'), REQ, w, envOf()).work;
    const r = applyOperation(ops('FX082'), REQ, w, envOf());
    expect(r.work.next.modifiers).toEqual({ ...BASE_SHOT_MODIFIERS, bulletType: 'standard' });
    expect(r.work.next.hint).toBe('hpRatio');
  });
  it('FX081 only sets the bullet type back to standard', () => {
    let w = applyOperation(ops('FX016'), REQ, workOf(), envOf()).work;
    expect(w.next.modifiers.bulletType).toBe('bouncy');
    w = applyOperation(ops('FX005'), REQ, w, envOf()).work;
    const r = applyOperation(ops('FX081'), REQ, w, envOf());
    expect(r.work.next.modifiers).toMatchObject({ bulletType: 'standard', damageMult: 1.5 });
  });
  it('the latest hint wins and shows one at a time', () => {
    const a = applyOperation(ops('FX093'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX100'), REQ, a.work, envOf());
    expect(b.work.next.hint).toBe('angleTicks');
  });
  it('values are clamped to the profile limits', () => {
    const m = mergeModifiers(BASE_SHOT_MODIFIERS, { damageMult: 9, speedMult: 0.1, extraReflections: 99, launch: { count: 2, spreadRad: 5 } }, EXP.profile.limits);
    expect(m.damageMult).toBe(1.5);
    expect(m.speedMult).toBe(0.8);
    expect(m.extraReflections).toBe(6);
    expect(m.launch.spreadRad).toBe(0.5);
  });
});

describe('series effects', () => {
  it('assortment changes every uncollected prize that is not already a member, also off-screen ones', () => {
    const env = envOf();
    const r = applyOperation(ops('FX047'), REQ, workOf(), env); // SER07 forest
    const members = EXP.series.get('SER07' as SeriesId)!.typeIds;
    const expected = env.prizes.filter((p) => !members.includes(p.typeId)).map((p) => p.instanceId);
    expect(r.work.transforms.map((t) => t.instanceId).sort()).toEqual([...expected].sort());
    expect(r.targets.length).toBe(expected.length);
    expect(r.work.assortmentSeries).toBe('SER07');
    for (const t of r.work.transforms) expect(t.requestId).toBe(REQ);
  });
  it('the candidate order is drawn once per prize and the same rng gives the same order', () => {
    const a = applyOperation(ops('FX041'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX041'), REQ, workOf(), envOf());
    expect(b.work.transforms).toEqual(a.work.transforms);
    expect(b.work.rng).toEqual(a.work.rng);
    expect(a.work.rng).not.toEqual(workOf().rng);
    const c = applyOperation(ops('FX041'), REQ, workOf({ rng: seedRng(43) }), envOf());
    expect(c.work.transforms).not.toEqual(a.work.transforms);
  });
  it('a later assortment overwrites the pending change of the same prize (latest wins)', () => {
    const a = applyOperation(ops('FX041'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX042'), mintId.effectRequest(SHOT1, 2), a.work, envOf());
    const ids = b.work.transforms.map((t) => t.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(b.work.transforms.every((t) => t.requestId === mintId.effectRequest(SHOT1, 2) || a.work.transforms.some((x) => x.instanceId === t.instanceId && x.requestId === REQ))).toBe(true);
    expect(b.work.assortmentSeries).toBe('SER02');
  });
  it('outline and assortment are kept apart', () => {
    const a = applyOperation(ops('FX041'), REQ, workOf(), envOf());
    const b = applyOperation(ops('FX072'), REQ, a.work, envOf()); // SER12 outline
    expect(b.work.assortmentSeries).toBe('SER01');
    expect(b.work.outlineSeries).toBe('SER12');
    expect(b.work.transforms).toEqual(a.work.transforms);
  });
  it('series helpers: membership, outline targets, refill candidates', () => {
    expect(seriesOfType(EXP, asPrizeTypeId('P009'))).toEqual(['SER02', 'SER14']);
    expect(refillCandidates(EXP, null)).toBeNull();
    expect(refillCandidates(EXP, 'SER15' as SeriesId)).toEqual(['P076', 'P077', 'P079']);
    const prizes = prizesWithTransformed();
    expect(outlineTargets(EXP, 'SER09' as SeriesId, prizes)).toEqual(prizes.filter((p) => ['P054', 'P062', 'P063', 'P064'].includes(p.typeId)).map((p) => p.instanceId));
    expect(outlineTargets(EXP, null, prizes)).toEqual([]);
    expect(outlineTargets(EXP, 'SER09' as SeriesId, prizes.map((p) => ({ ...p, collected: true })))).toEqual([]);
  });
});

describe('individual prize changes (FX090-FX092)', () => {
  it('FX090 uses the first two prizes of different kinds in row, column, id order; the earlier takes the later kind', () => {
    const run = inFlight(expandedRun(5));
    const prizes = withKinds(run, { 0: 'P001', 1: 'P001', 2: 'P002' }).shelf.prizes;
    const env = envOf({ prizes });
    const r = applyOperation(ops('FX090'), REQ, workOf(), env);
    expect(r.work.transforms).toEqual([{ instanceId: sortPrizesByBoardOrder(prizes)[0]!.instanceId, requestId: REQ, candidateTypeIds: ['P002'] }]);
  });
  it('FX090 is not applicable when every prize has the same kind', () => {
    const prizes = prizesWithTransformed().map((p) => ({ ...p, typeId: asPrizeTypeId('P001') }));
    expect(applyOperation(ops('FX090'), REQ, workOf(), envOf({ prizes }))).toMatchObject({ outcome: 'notApplicable', reason: 'noTarget' });
  });
  it('FX091 reverts the first prize whose kind differs from its placed kind', () => {
    const prizes = prizesWithTransformed();
    const r = applyOperation(ops('FX091'), REQ, workOf(), envOf({ prizes }));
    const moved = prizes[0]!;
    expect(r.work.transforms).toEqual([{ instanceId: moved.instanceId, requestId: REQ, candidateTypeIds: [moved.drawnTypeId] }]);
    const plain = prizes.map((p) => ({ ...p, typeId: p.drawnTypeId }));
    expect(applyOperation(ops('FX091'), REQ, workOf(), envOf({ prizes: plain }))).toMatchObject({ outcome: 'notApplicable', reason: 'noTarget' });
  });
  it('FX092 changes the first prize of another kind into the last confirmed collected kind', () => {
    const prizes = prizesWithTransformed();
    const r = applyOperation(ops('FX092'), REQ, workOf(), envOf({ prizes, lastCollectedTypeId: asPrizeTypeId('P077') }));
    expect(r.work.transforms[0]).toMatchObject({ requestId: REQ, candidateTypeIds: ['P077'] });
    expect(applyOperation(ops('FX092'), REQ, workOf(), envOf({ prizes, lastCollectedTypeId: null }))).toMatchObject({ outcome: 'notApplicable', reason: 'noCollectedPrize' });
    const same = prizes.map((p) => ({ ...p, typeId: asPrizeTypeId('P077') }));
    expect(applyOperation(ops('FX092'), REQ, workOf(), envOf({ prizes: same, lastCollectedTypeId: asPrizeTypeId('P077') }))).toMatchObject({ outcome: 'notApplicable', reason: 'noTarget' });
  });
  it('collected prizes are never targets', () => {
    const prizes = prizesWithTransformed().map((p, i) => (i === 0 ? { ...p, collected: true } : p));
    const r = applyOperation(ops('FX091'), REQ, workOf(), envOf({ prizes }));
    expect(r.outcome).toBe('notApplicable');
  });
});

describe('applicability checks never consume the PRNG', () => {
  it('listing every effect leaves the work object untouched', () => {
    const work = workOf();
    const before = JSON.stringify(work);
    for (const def of EXP.effects.values()) inapplicableReason(def.operation, work, envOf());
    expect(JSON.stringify(work)).toBe(before);
  });
});
