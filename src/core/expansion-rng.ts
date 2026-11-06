/**
 * Small pure helpers on top of the serializable PRNG for the expanded rules.
 * Every function takes a state and returns the next one; nothing is hidden,
 * so listing, rendering or re-checking code simply never calls them.
 */
import { rngNext, type RngState } from '../catalog/rng';

/** Uniform integer in [0, n). Consumes exactly one PRNG step. */
export function nextIndex(state: RngState, n: number): { readonly index: number; readonly state: RngState } {
  if (!Number.isInteger(n) || n <= 0) throw new RangeError('nextIndex: n must be a positive integer');
  const r = rngNext(state);
  return { index: Math.min(n - 1, Math.floor(r.value * n)), state: r.state };
}

/** Fisher-Yates shuffle. Consumes exactly max(0, n - 1) PRNG steps. */
export function shuffled<T>(items: readonly T[], state: RngState): { readonly items: T[]; readonly state: RngState } {
  const out = [...items];
  let s = state;
  for (let i = out.length - 1; i > 0; i--) {
    const r = nextIndex(s, i + 1);
    s = r.state;
    const tmp = out[i]!;
    out[i] = out[r.index]!;
    out[r.index] = tmp;
  }
  return { items: out, state: s };
}
