import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpansionTranslator } from '../../src/i18n/expansion-text';
import { aimFirstTranslator } from '../../src/app/aim-first-text';
import { effectResultLine, effectResultsModel } from '../../src/ui/effect-results';
import { expandedLine } from '../../src/i18n/expanded-content';
import { homeViewModel } from '../../src/ui/home';
import { afText } from '../../src/i18n/stall-speech';
import { LOCALES, type Locale } from '../../src/i18n/locales';
import { translate, type UiKey } from '../../src/i18n';
import { JA as UI_KEYS } from '../../src/i18n/locales/ja';
import type { PlannedEffect } from '../../src/contracts';

const R7 = getGameplayBundle('expanded-aim-first');
const R6 = getGameplayBundle('expanded-next');

function textFor(locale: Locale, expansion = R7.expansion) {
  const ui = (k: string, p?: Readonly<Record<string, string | number>>) => (k in UI_KEYS ? translate(locale, k as UiKey, p) : k);
  return aimFirstTranslator(() => locale, createExpansionTranslator(() => locale, ui), expansion);
}
const cell = (fx: string): PlannedEffect => ({ requestId: 'r' as never, source: { kind: 'cell', cellId: 'cell-r1-c01' as never }, effectId: fx as never, outcome: 'applied', reason: null, ammoDelta: 0, targets: [] });

describe('01 how to play', () => {
  const links = { canonicalUrl: 'https://example.invalid/', labDetailUrl: null, privacyUrl: null, contactUrl: null } as never;
  const base = { nameDraft: '', selfBest: null, audio: { enabled: true, volume: 1 }, prototype: true };
  it('r007 explains move → drag → 撃つ (gauge) → 発射, no sway, sets of 2 or 3', () => {
    const vm = homeViewModel({ ...base, howtoSteps: (l) => [1, 2, 3, 4, 5].map((n) => afText(l, `af.howto.${n}` as never)) }, links, 'ja');
    const all = vm.howto.steps.join('');
    expect(all).toContain('◀▶');
    expect(all).toContain('なぞって');
    expect(all).toContain('「撃つ」');
    expect(all).toContain('「発射」');
    expect(all).toContain('揺れません');
    expect(all).toContain('2種類または3種類');
    expect(all).not.toContain('鼓動');
  });
  it('9-slot and r006 keep their own steps (bar, then aim with sway)', () => {
    const vm = homeViewModel(base, links, 'ja');
    expect(vm.howto.steps.join('')).toContain('鼓動');
  });
});

describe('02 power-zone effects are named as such in r007 only', () => {
  const cases: [string, string][] = [['FX012', '1.25'], ['FX013', '1.5'], ['FX035', '0.85'], ['FX036', '0.7']];
  it('the game card and the result (all lines) show the r007 name and multiplier in every locale', () => {
    for (const loc of LOCALES) {
      const t = textFor(loc);
      for (const [fx, m] of cases) {
        const line = effectResultLine(cell(fx), { t, line: (k) => expandedLine(loc, k) });
        expect(line.name, `${loc} ${fx}`).toBe(afText(loc, `exp.fx.${fx}.r007.name` as never));
        expect(line.text.replace(',', '.'), `${loc} ${fx}`).toContain(m); // decimal comma in some languages
      }
      const model = effectResultsModel({ effects: cases.map(([fx]) => cell(fx)) }, { t, line: (k) => expandedLine(loc, k) }, { maxLines: Infinity });
      expect(model.lines).toHaveLength(4);
    }
  });
  it('FX012 never says the calm-sight wording in r007; r006 keeps it', () => {
    const t7 = textFor('ja');
    const l7 = effectResultLine(cell('FX012'), { t: t7, line: (k) => expandedLine('ja', k) });
    expect(`${l7.name}${l7.text}`).not.toMatch(/落ち着く照準|揺れが小さく/);
    expect(l7.name).toBe('威力を合わせやすい');
    const t6 = textFor('ja', R6.expansion);
    const l6 = effectResultLine(cell('FX012'), { t: t6, line: (k) => expandedLine('ja', k) });
    expect(l6.name).toBe('落ち着く照準');
    expect(R6.expansion!.effects.get('FX012' as never)!.operation).toEqual({ kind: 'shotModifiers', set: { swayMult: 0.75 } });
  });
});
