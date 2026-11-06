/**
 * E4 "today's stall" (plan T4c): a separate way to play where the Japan date and the rules
 * version fix the whole start: the 36 prizes, the cell effects, the question order, the effect
 * stream and the order (each from its own salted stream of this one seed). The run id, elapsed
 * real time and drawing never feed a draw, so the same inputs give the same results.
 */

/** 'YYYY-MM-DD' of the given instant in Japan time (UTC+9, no daylight saving). */
export function jstDateOf(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 32-bit FNV-1a of "daily|<date>|<rulesVersion>", as a non-negative seed. */
export function dailySeed(date: string, rulesVersion: string): number {
  const text = `daily|${date}|${rulesVersion}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Storage names of the daily mode: progress and self best never mix with the normal mode. */
export function dailyKeys(rulesVersion: string): { readonly run: string; readonly meta: string; readonly profileVersion: string } {
  return { run: `shatekki.run.${rulesVersion}.daily`, meta: `shatekki.daily.${rulesVersion}`, profileVersion: `${rulesVersion}@daily` };
}
