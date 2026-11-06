/**
 * Seeded PRNG: xoshiro128** with a serializable 4-word state (Task 03).
 * Pure functions on an immutable state so that RunState/DrawState can be saved
 * and restored and continue identically.
 */
export type RngState = readonly [number, number, number, number];

function splitmix32(a: number): () => number {
  let s = a >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return (z ^ (z >>> 16)) >>> 0;
  };
}

/** Expand any integer seed to a non-zero 4-word state. */
export function seedRng(seed: number): RngState {
  const next = splitmix32(Math.trunc(seed));
  const s: [number, number, number, number] = [next(), next(), next(), next()];
  if (s.every((w) => w === 0)) s[0] = 1;
  return s;
}

export function isValidRngState(s: unknown): s is RngState {
  return (
    Array.isArray(s) &&
    s.length === 4 &&
    s.every((w) => typeof w === 'number' && Number.isInteger(w) && w >= 0 && w <= 0xffffffff) &&
    s.some((w) => w !== 0)
  );
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

/** Advance one step. `value` is uniform in [0, 1). */
export function rngNext(state: RngState): { readonly value: number; readonly state: RngState } {
  if (!isValidRngState(state)) throw new RangeError('invalid rng state');
  let [s0, s1, s2, s3] = state;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  s2 = (s2 ^ s0) >>> 0;
  s3 = (s3 ^ s1) >>> 0;
  s1 = (s1 ^ s2) >>> 0;
  s0 = (s0 ^ s3) >>> 0;
  s2 = (s2 ^ t) >>> 0;
  s3 = rotl(s3, 11);
  return { value: result / 0x100000000, state: [s0, s1, s2, s3] };
}
