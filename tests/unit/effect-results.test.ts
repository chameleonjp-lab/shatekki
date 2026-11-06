import { describe, expect, it } from 'vitest';
import type { DeferredTransform, EffectId, PlannedEffect, PrizeInstanceId } from '../../src/contracts';
import { LOCALES, UI_STRINGS, translate, type UiKey } from '../../src/i18n';
import { expandedLine } from '../../src/i18n/expanded-content';
import { createExpansionTranslator } from '../../src/i18n/expansion-text';
import { EFFECT_RESULT_MAX_LINES, effectResultsModel, mountEffectResults } from '../../src/ui/effect-results';
import { fakeRoot } from './fake-dom';

const fx = (n: number) => `FX${String(n).padStart(3, '0')}` as EffectId;
const planned = (o: Partial<PlannedEffect> & { effectId: EffectId | null }): PlannedEffect => ({
  requestId: 'r' as never,
  source: { kind: 'cell', cellId: 'cell-r1-c01' as never },
  outcome: 'applied',
  reason: null,
  ammoDelta: 0,
  targets: [],
  ...o,
});
const deferred = (n: number): DeferredTransform[] =>
  Array.from({ length: n }, (_, i) => ({ instanceId: `i${i}` as PrizeInstanceId, requestId: `d${i}` as never, candidateTypeIds: [] }));

function depsFor(locale: (typeof LOCALES)[number]) {
  const ui = (k: string, p?: Readonly<Record<string, string | number>>) => translate(locale, k as UiKey, p);
  return { t: createExpansionTranslator(() => locale, ui), line: (k: Parameters<typeof expandedLine>[1]) => expandedLine(locale, k) };
}
const deps = depsFor('ja');

describe('effect result model', () => {
  it('keeps the order of the plan and labels each source', () => {
    const m = effectResultsModel(
      {
        effects: [
          planned({ effectId: fx(1), source: { kind: 'cell', cellId: 'c' as never } }),
          planned({ effectId: fx(2), source: { kind: 'device', deviceId: 'd' as never, deviceKind: 'ammo' } }),
          planned({ effectId: fx(3), source: { kind: 'answer', questionId: 'Q001' as never, choice: 'A' } }),
          planned({ effectId: fx(4), source: { kind: 'carryOver' } }),
        ],
      },
      deps,
    );
    expect(m.lines.map((l) => l.source)).toEqual(['cell', 'device', 'answer', 'carryOver']);
    expect(m.lines.map((l) => l.sourceLabel)).toEqual(['背景マス', '仕掛け', '店主の答え', '持ち越し']);
    expect(m.lines.every((l) => l.name !== '' && l.text !== '')).toBe(true);
  });

  it('resolves {n} with the real ammo change and never shows a placeholder', () => {
    const ammoFx = fx(5);
    for (const delta of [2, -1]) {
      const m = effectResultsModel({ effects: [planned({ effectId: ammoFx, ammoDelta: delta })] }, deps);
      const line = m.lines[0]!;
      expect(line.text).not.toMatch(/\{\w+\}/);
    }
    // some effect among the first 100 uses {n}; its line carries the absolute number
    let seen = false;
    for (let i = 1; i <= 100; i++) {
      const raw = deps.t(`exp.fx.${fx(i)}.result`, { n: 7 });
      if (raw.includes('7')) {
        const m = effectResultsModel({ effects: [planned({ effectId: fx(i), ammoDelta: -7 })] }, deps);
        expect(m.lines[0]!.text).toBe(raw);
        seen = true;
        break;
      }
    }
    expect(seen).toBe(true);
  });

  it('shows the reason for a notApplicable answer draw and a generic line for other sources', () => {
    const answer = planned({ effectId: null, outcome: 'notApplicable', reason: 'noApplicableEffect', source: { kind: 'answer', questionId: 'Q001' as never, choice: 'B' } });
    const cell = planned({ effectId: fx(10), outcome: 'notApplicable', reason: 'ammoAtMostOne' });
    const outline = planned({ effectId: fx(65), outcome: 'notApplicable', reason: 'noTarget' });
    const m = effectResultsModel({ effects: [answer, cell, outline] }, deps);
    expect(m.lines[0]!.text).toBe('今は使える効果がありません');
    expect(m.lines[0]!.name).toBe('');
    expect(m.lines[0]!.applied).toBe(false);
    expect(m.lines[1]!.text).toBe(expandedLine('ja', 'effectNotApplicable'));
    expect(m.lines[1]!.name).not.toBe('');
    expect(m.lines[2]!.text).toBe(expandedLine('ja', 'noOutlineTarget'));
  });

  it('adds the outside-the-series notice only for an applied FX090-092', () => {
    const m = effectResultsModel(
      { effects: [planned({ effectId: fx(90) }), planned({ effectId: fx(92), outcome: 'notApplicable', reason: 'noTarget' }), planned({ effectId: fx(89) })] },
      deps,
    );
    expect(m.lines[0]!.note).toBe(expandedLine('ja', 'sideEffectTemporaryOutsideSeries'));
    expect(m.lines[1]!.note).toBeNull();
    expect(m.lines[2]!.note).toBeNull();
  });

  it('announces deferred transforms', () => {
    const m = effectResultsModel({ effects: [], deferredTransforms: deferred(2) }, deps);
    expect(m.deferred).toBe('2個の景品は形が合わないため、あとで変わります');
    expect(m.any).toBe(true);
    expect(effectResultsModel({ effects: [], deferredTransforms: [] }, deps).any).toBe(false);
    expect(effectResultsModel({}, deps).any).toBe(false);
  });

  it('caps at five lines in total and summarises the rest', () => {
    const many = Array.from({ length: 9 }, (_, i) => planned({ effectId: fx(i + 1) }));
    const a = effectResultsModel({ effects: many }, deps);
    expect(a.lines.length).toBe(EFFECT_RESULT_MAX_LINES - 1);
    expect(a.more).toBe('ほか5件');
    expect(a.lines.length + 1).toBe(EFFECT_RESULT_MAX_LINES);
    const b = effectResultsModel({ effects: many, deferredTransforms: deferred(1) }, deps);
    expect(b.lines.length + (b.more ? 1 : 0) + (b.deferred ? 1 : 0)).toBe(EFFECT_RESULT_MAX_LINES);
    expect(b.more).toBe('ほか6件');
    const exactly = effectResultsModel({ effects: many.slice(0, 5) }, deps);
    expect(exactly.lines.length).toBe(5);
    expect(exactly.more).toBeNull();
  });

  it('never shows a raw key or id in any locale', () => {
    for (const locale of LOCALES) {
      const d = depsFor(locale);
      const effects = [fx(1), fx(30), fx(50), fx(70), fx(90), fx(100)].map((e) => planned({ effectId: e, ammoDelta: 2 }));
      const m = effectResultsModel(
        { effects: [...effects, planned({ effectId: null, outcome: 'notApplicable', reason: 'noApplicableEffect' })], deferredTransforms: deferred(3) },
        d,
      );
      const texts = [m.title, m.more ?? '', m.deferred ?? '', ...m.lines.flatMap((l) => [l.sourceLabel, l.name, l.text, l.note ?? ''])];
      for (const t of texts) {
        expect(t, locale).not.toMatch(/exp\.|fxres\.|\bFX\d{3}\b|\{\w+\}/);
      }
      expect(m.lines.every((l) => l.sourceLabel !== '' && l.name !== '' && l.text !== '' || l.source === 'answer'), locale).toBe(true);
    }
  });

  it('has all new keys in every locale', () => {
    const keys = ['fxres.title', 'fxres.src.cell', 'fxres.src.answer', 'fxres.src.device', 'fxres.src.carry', 'fxres.deferred', 'fxres.more'] as UiKey[];
    for (const locale of LOCALES) for (const k of keys) expect(UI_STRINGS[locale][k], `${locale} ${k}`).toBeTruthy();
  });
});

describe('effect result card', () => {
  function mount(showMs = 5000) {
    const root = fakeRoot();
    const timers: Array<{ fn: () => void; ms: number; id: number; live: boolean }> = [];
    const h = mountEffectResults(root as unknown as HTMLElement, {
      ...deps,
      showMs,
      setTimeout: (fn, ms) => {
        const t = { fn, ms, id: timers.length, live: true };
        timers.push(t);
        return t.id;
      },
      clearTimeout: (id) => {
        const t = timers[id as number];
        if (t) t.live = false;
      },
    });
    return { root, h, timers, card: root.byTestId('effect-results') };
  }

  it('is hidden at first, shows lines, auto-hides and dismisses on tap', () => {
    const { h, card, timers } = mount();
    expect(card.hidden).toBe(true);
    h.show({ effects: [planned({ effectId: fx(1) })] });
    expect(card.hidden).toBe(false);
    expect(h.isShown()).toBe(true);
    expect(card.textContent).not.toMatch(/exp\.|FX\d/);
    expect(timers.at(-1)!.ms).toBe(5000);
    timers.at(-1)!.fn();
    expect(card.hidden).toBe(true);
    h.show({ effects: [planned({ effectId: fx(2) })] });
    const ev = card.dispatch('click');
    expect(card.hidden).toBe(true);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('a second show restarts the timer; nothing to say hides the card', () => {
    const { h, card, timers } = mount();
    h.show({ effects: [planned({ effectId: fx(1) })] });
    h.show({ effects: [planned({ effectId: fx(2) })] });
    expect(timers.filter((t) => t.live).length).toBe(1);
    h.show({});
    expect(card.hidden).toBe(true);
    expect(timers.filter((t) => t.live).length).toBe(0);
  });

  it('keeps pointer events on the card from reaching the controls', () => {
    const { root, h, card } = mount();
    const seen: string[] = [];
    root.addEventListener('pointerdown', () => seen.push('root-down'));
    root.addEventListener('click', () => seen.push('root-click'));
    h.show({ effects: [planned({ effectId: fx(1) })] });
    card.dispatch('pointerdown');
    card.dispatch('click');
    expect(seen).toEqual([]);
  });
});
