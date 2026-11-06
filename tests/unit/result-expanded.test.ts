/**
 * Plan T1 (F2): the result screen names pair sets the way the set book does, keeps every
 * effect of the last shot with the reason the run ended, and tells a legacy "+2" plate
 * that gave +1 apart from one that gave nothing.
 */
import { describe, expect, it } from 'vitest';
import type { EffectId, FinalResult, PlannedEffect, SetId } from '../../src/contracts';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { LOCALES, translate, type Locale, type UiKey } from '../../src/i18n';
import { expandedLine } from '../../src/i18n/expanded-content';
import { createExpansionTranslator } from '../../src/i18n/expansion-text';
import { effectResultsModel } from '../../src/ui/effect-results';
import { resultViewModel, type LastShotInput, type ResultInput } from '../../src/ui/result';
import { setBookEntriesFromCatalog, setBookViewModel } from '../../src/ui/set-book';

const bundle = getGameplayBundle('expanded-proposed');
const entries = setBookEntriesFromCatalog(bundle.catalog);

function textFor(locale: Locale) {
  const ui = (k: string, p?: Readonly<Record<string, string | number>>) => translate(locale, k as UiKey, p);
  const t = createExpansionTranslator(() => locale, ui);
  return { t, line: (k: Parameters<typeof expandedLine>[1]) => expandedLine(locale, k) };
}

const fx = (n: number) => `FX${String(n).padStart(3, '0')}` as EffectId;
const planned = (o: Partial<PlannedEffect>): PlannedEffect => ({
  requestId: 'r' as never,
  source: { kind: 'cell', cellId: 'cell-r1-c01' as never },
  effectId: null,
  outcome: 'applied',
  reason: null,
  ammoDelta: 0,
  targets: [],
  ...o,
});
const ammoPlate = { kind: 'device', deviceId: 'dev-ammo-1' as never, deviceKind: 'ammo' } as const;

function result(sets: string[], status: FinalResult['status'] = 'completed'): FinalResult {
  return {
    runId: 'run-1' as never,
    rulesVersion: bundle.catalog.rulesVersion,
    valueStatus: 'prototype',
    status,
    score: 0,
    shotsFired: 10,
    collected: [],
    completedSets: sets as SetId[],
    maxChain: 0,
    ledger: [],
    playerName: null,
  };
}

function input(r: FinalResult, lastShot: LastShotInput | null = null): ResultInput {
  return {
    result: r,
    selfBestBefore: null,
    submit: null,
    top: { state: 'unavailable' },
    links: { canonicalUrl: null, labDetailUrl: null } as never,
    rankingAvailable: false,
    lastShot,
  };
}

function optionsFor(locale: Locale) {
  const d = textFor(locale);
  return {
    expandedText: (k: string) => d.t(k),
    describeEffects: (i: Parameters<typeof effectResultsModel>[0]) => effectResultsModel(i, d, { maxLines: Infinity }),
  };
}

describe('result set names (plan T1, F2)', () => {
  it('names a pair set and a three-kind set completed together exactly as the set book does, in all 15 locales', () => {
    for (const locale of LOCALES) {
      const opts = optionsFor(locale);
      const vm = resultViewModel(input(result(['PAIR001', 'S001', 'PAIR300'])), locale, opts);
      const book = setBookViewModel({ sets: entries, discovered: ['PAIR001', 'S001', 'PAIR300'], completedThisRun: [] }, locale, { expandedText: opts.expandedText });
      for (const item of vm.sets.items) {
        const entry = book.entries.find((e) => e.setId === item.setId)!;
        expect(item.name, `${locale} ${item.setId}`).toBe(entry.title);
        expect(item.name, `${locale} ${item.setId} is not a bare id`).not.toBe(item.setId);
        expect(item.name).not.toBe('');
      }
    }
  });

  it('keeps the rules-v1 names when no expanded text is given (public build)', () => {
    const vm = resultViewModel(input(result(['S001'])), 'ja');
    expect(vm.sets.items[0]!.name).not.toBe('S001');
    expect(vm.lastShot).toBeNull();
  });
});

describe('last shot on the result screen (plan T1, F2)', () => {
  const six: PlannedEffect[] = [1, 2, 3, 10, 30, 65].map((n, i) => planned({ requestId: `r${i}` as never, effectId: fx(n) }));

  it('lists all six effects of the last shot, not the 5-line card, with the shot number', () => {
    const vm = resultViewModel(input(result([]), { shotNumber: 10, effects: six, deferredTransforms: [], ammoAfter: 0 }), 'ja', optionsFor('ja'));
    expect(vm.lastShot).not.toBeNull();
    expect(vm.lastShot!.lines.length).toBe(6);
    expect(vm.lastShot!.title).toBe(translate('ja', 'result.lastShot.title', { n: 10 }));
    expect(vm.lastShot!.lines.every((l) => l.text !== '')).toBe(true);
  });

  it('says why the run ended: no ammo left, and when an ammo grant hit the cap', () => {
    const plain = resultViewModel(input(result([]), { shotNumber: 10, effects: [], deferredTransforms: [], ammoAfter: 0 }), 'ja', optionsFor('ja'));
    expect(plain.lastShot!.endReasons).toEqual([translate('ja', 'result.end.noAmmo')]);
    expect(plain.lastShot!.lines).toEqual([]);
    expect(plain.lastShot!.emptyText).toBe(translate('ja', 'result.lastShot.none'));

    const capped = resultViewModel(
      input(result([]), { shotNumber: 20, effects: [planned({ source: ammoPlate, outcome: 'notApplicable', reason: 'noAmmoRoom', ammoRequested: 2 })], deferredTransforms: [], ammoAfter: 0 }),
      'ja',
      optionsFor('ja'),
    );
    expect(capped.lastShot!.endReasons).toEqual([translate('ja', 'result.end.capped'), translate('ja', 'result.end.noAmmo')]);
  });

  it('every locale has the new result and reason texts', () => {
    const keys: UiKey[] = ['result.lastShot.title', 'result.lastShot.none', 'result.end.noAmmo', 'result.end.capped', 'fxres.ammo.added', 'fxres.ammo.partial', 'fxres.ammo.noRoom', 'fxres.device.penalty', 'fxres.device.bulletType', 'fxres.device.transform', 'fxres.device.used'];
    for (const locale of LOCALES) {
      for (const k of keys) {
        const s = translate(locale, k, { n: 3, req: 4 });
        expect(s, `${locale} ${k}`).toBeTruthy();
        expect(s, `${locale} ${k}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('shows nothing for an abandoned run', () => {
    const vm = resultViewModel(input(result([], 'abandoned'), { shotNumber: 3, effects: six, deferredTransforms: [], ammoAfter: 5 }), 'ja', optionsFor('ja'));
    expect(vm.lastShot).toBeNull();
  });
});

describe('legacy device lines (plan T1/T2: source, outcome and real amount read separately)', () => {
  const d = textFor('ja');

  it('a +2 plate that could give only +1 reads as applied, +1, with the cap noted', () => {
    const m = effectResultsModel({ effects: [planned({ source: ammoPlate, ammoDelta: 1, ammoRequested: 2 })] }, d);
    const l = m.lines[0]!;
    expect(l.applied).toBe(true);
    expect(l.name).toBe(translate('ja', 'fx.offscreen.device.ammo'));
    expect(l.text).toBe(translate('ja', 'fxres.ammo.added', { n: 1 }));
    expect(l.note).toBe(translate('ja', 'fxres.ammo.partial', { n: 1, req: 2 }));
  });

  it('a +2 plate at the cap reads as "no room", not "cannot be used"', () => {
    const m = effectResultsModel({ effects: [planned({ source: ammoPlate, outcome: 'notApplicable', reason: 'noAmmoRoom', ammoRequested: 2 })] }, d);
    const l = m.lines[0]!;
    expect(l.applied).toBe(false);
    expect(l.text).toBe(translate('ja', 'fxres.ammo.noRoom'));
    expect(l.text).not.toBe(expandedLine('ja', 'effectNotApplicable'));
  });

  it('a full +2 grant has no cap note; an ammo effect at the cap uses the same "no room" line', () => {
    const full = effectResultsModel({ effects: [planned({ source: ammoPlate, ammoDelta: 2, ammoRequested: 2 })] }, d).lines[0]!;
    expect(full.note).toBeNull();
    const fxCap = effectResultsModel({ effects: [planned({ effectId: fx(3), outcome: 'notApplicable', reason: 'noAmmoRoom', ammoRequested: 3 })] }, d).lines[0]!;
    expect(fxCap.text).toBe(translate('ja', 'fxres.ammo.noRoom'));
    const fxPartial = effectResultsModel({ effects: [planned({ effectId: fx(3), ammoDelta: 1, ammoRequested: 3 })] }, d).lines[0]!;
    expect(fxPartial.applied).toBe(true);
    expect(fxPartial.note).toBe(translate('ja', 'fxres.ammo.partial', { n: 1, req: 3 }));
  });

  it('other legacy plates say what they did; flight-only plates are not listed after the flight', () => {
    const m = effectResultsModel(
      {
        effects: [
          planned({ source: { kind: 'device', deviceId: 'p' as never, deviceKind: 'penalty' } }),
          planned({ source: { kind: 'device', deviceId: 'b' as never, deviceKind: 'bulletType' } }),
          planned({ source: { kind: 'device', deviceId: 't' as never, deviceKind: 'transform' }, targets: ['i1' as never] }),
          planned({ source: { kind: 'device', deviceId: 's' as never, deviceKind: 'split' }, outcome: 'notApplicable', reason: 'flightOnlyDevice' }),
          planned({ source: { kind: 'device', deviceId: 'b2' as never, deviceKind: 'bulletType' }, outcome: 'notApplicable', reason: 'bulletTypeAlreadyChanged' }),
        ],
      },
      d,
    );
    expect(m.lines.map((l) => l.text)).toEqual([
      translate('ja', 'fxres.device.penalty'),
      translate('ja', 'fxres.device.bulletType'),
      translate('ja', 'fxres.device.transform'),
      translate('ja', 'fxres.device.used'),
    ]);
    expect(m.lines.map((l) => l.name)).toEqual(['penalty', 'bulletType', 'transform', 'bulletType'].map((k) => translate('ja', `fx.offscreen.device.${k}` as UiKey)));
  });
});
