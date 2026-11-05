import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../src/i18n';
import {
  buildHomeShareText,
  buildResultShareText,
  copyText,
  shareOnX,
  xIntentUrl,
  X_INTENT_BASE,
  type OpenWindow,
} from '../../src/ui/share';

const URL_SET = 'https://example.invalid/shateki-test/'; // test-only; the official URL is unknown (O13/O14)
const COUNTS = { score: 12345, prizes: 7, sets: 2, maxChain: 3 };

const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('share text', () => {
  it('omits the URL while canonicalUrl is null (never guesses one)', () => {
    for (const loc of LOCALES) {
      expect(buildHomeShareText(loc, null)).not.toMatch(/https?:\/\//);
      expect(buildResultShareText(loc, COUNTS, null)).not.toMatch(/https?:\/\//);
    }
  });

  it('includes the URL exactly once when configured', () => {
    for (const loc of LOCALES) {
      expect(occurrences(buildHomeShareText(loc, URL_SET), URL_SET), loc).toBe(1);
      expect(occurrences(buildResultShareText(loc, COUNTS, URL_SET), URL_SET), loc).toBe(1);
    }
  });

  it('result text carries the confirmed score, units and mode, in every language', () => {
    for (const loc of LOCALES) {
      const t = buildResultShareText(loc, COUNTS, null);
      const digits = t.replace(/[^\d]/g, '');
      expect(digits, loc).toContain('12345'.replace(/,/g, '')); // formatted with or without separators
      expect(t, loc).not.toMatch(/[{}]/);
    }
    expect(buildResultShareText('ja', COUNTS, null)).toBe('屋台の射的ゲーム（通常モード）\n12,345点／景品7個／セット2種／最大連鎖3個');
    expect(buildResultShareText('en', COUNTS, null)).toContain('12,345 pts');
  });

  it('never contains a player name, rank or internal ids', () => {
    const t = buildResultShareText('ja', COUNTS, URL_SET);
    expect(t).not.toMatch(/P\d{3}|S\d{3}|run-|位|rank/i);
  });

  it('stays within a post-friendly length in every language', () => {
    for (const loc of LOCALES) {
      expect([...buildResultShareText(loc, { score: 2147483647, prizes: 99, sets: 99, maxChain: 20 }, URL_SET)].length, loc).toBeLessThan(250);
      expect([...buildHomeShareText(loc, URL_SET)].length, loc).toBeLessThan(250);
    }
  });

  it('is built from the same confirmed numbers (no hidden rewriting)', () => {
    const a = buildResultShareText('en', { ...COUNTS, score: 0 }, null);
    expect(a).toContain('0 pts');
  });
});

describe('X intent url', () => {
  it('encodes text with URLSearchParams and round-trips newlines, symbols and emoji', () => {
    const text = 'A&B=C #tag 100%\n日本語 😀\n' + URL_SET;
    const u = new URL(xIntentUrl(text));
    expect(`${u.origin}${u.pathname}`).toBe(X_INTENT_BASE);
    expect(u.searchParams.get('text')).toBe(text);
    expect([...u.searchParams.keys()]).toEqual(['text']);
  });
});

describe('shareOnX / copy fallback', () => {
  const win = (): { opener: unknown } => ({ opener: 'x' });

  it('opens the compose screen only and detaches the opener; never posts by itself', async () => {
    const opened: string[] = [];
    const w = win();
    const open: OpenWindow = (url) => {
      opened.push(url);
      return w;
    };
    const r = await shareOnX({ text: 'hello', open, writeText: undefined });
    expect(r).toBe('opened');
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^https:\/\/x\.com\/intent\/post\?text=/);
    expect(w.opener).toBeNull();
  });

  it('falls back to copying when the window cannot be opened', async () => {
    const copied: string[] = [];
    const r = await shareOnX({ text: 'hello', open: () => null, writeText: async (t) => void copied.push(t) });
    expect(r).toBe('copied');
    expect(copied).toEqual(['hello']);
  });

  it('falls back to copying when open throws', async () => {
    const copied: string[] = [];
    const r = await shareOnX({
      text: 'hello',
      open: () => {
        throw new Error('blocked');
      },
      writeText: async (t) => void copied.push(t),
    });
    expect(r).toBe('copied');
  });

  it('falls back to manual selection when copy also fails', async () => {
    expect(await shareOnX({ text: 'hello', open: () => null, writeText: async () => Promise.reject(new Error('denied')) })).toBe('manual');
    expect(await shareOnX({ text: 'hello', open: () => null, writeText: undefined })).toBe('manual');
  });

  it('copyText reports failure honestly', async () => {
    expect(await copyText('x', async () => undefined)).toBe(true);
    expect(await copyText('x', async () => Promise.reject(new Error('no')))).toBe(false);
    expect(await copyText('x', undefined)).toBe(false);
  });
});
