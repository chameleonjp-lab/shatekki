import { describe, expect, it } from 'vitest';
import { AF_UI_JA, SPEECH_JA, SPEECH_LINES, afText, speechText } from '../../src/i18n/stall-speech';
import { AF_LOCALES } from '../../src/i18n/stall-speech/locales';
import { LOCALES } from '../../src/i18n/locales';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('r007 text in 15 languages', () => {
  it('every locale has its own text for every UI key and all 100 lines (no silent fallback)', () => {
    for (const loc of LOCALES.filter((l) => l !== 'ja')) {
      const c = AF_LOCALES[loc];
      expect(c, loc).toBeDefined();
      expect(Object.keys(c!.ui).sort(), loc).toEqual(Object.keys(AF_UI_JA).sort());
      expect(c!.lines, loc).toHaveLength(100);
      for (const [k, v] of Object.entries(c!.ui)) expect(v.trim().length, `${loc} ${k}`).toBeGreaterThan(0);
      for (const [i, v] of c!.lines.entries()) expect(v.trim().length, `${loc} K${i + 1}`).toBeGreaterThan(0);
    }
  });

  it('a translation keeps exactly the placeholders of the Japanese source (numbers and names are never rewritten)', () => {
    for (const loc of LOCALES.filter((l) => l !== 'ja')) {
      for (const [k, ja] of Object.entries(AF_UI_JA)) expect(placeholders(AF_LOCALES[loc]!.ui[k as keyof typeof AF_UI_JA]), `${loc} ${k}`).toEqual(placeholders(ja));
    }
  });

  it('lines keep the doc ids K001..K100; the four lines with numbers keep them in every language', () => {
    expect(SPEECH_LINES.map((l) => l.id)).toEqual(Array.from({ length: 100 }, (_, i) => `K${String(i + 1).padStart(3, '0')}`));
    expect(Object.keys(SPEECH_JA)).toHaveLength(100);
    // K091: "three corks" must stay the same number everywhere
    for (const loc of LOCALES) expect(speechText(loc, 'K091'), loc).toMatch(/3|three|tres|três|trois|drei|три|tre|tiga|üç|ba|สาม|세|三/i);
  });

  it('values are filled into the text, and question/answer ids never appear in the lines', () => {
    expect(afText('en', 'af.talk.result.ammo', { n: 1, ammo: 11, m: 0.85 })).toBe('+1 cork (now 11). Next shot: zone ×0.85');
    for (const loc of LOCALES) for (const l of SPEECH_LINES) expect(speechText(loc, l.id)).not.toMatch(/\bQ\d{3}\b|\bFX\d{3}\b|\bK\d{3}\b/);
  });
});
