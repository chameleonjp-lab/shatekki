/** In-memory KeyValueStorage with fault injection (not a test file). */
import type { KeyValueStorage } from '../../src/contracts';

export class FakeStorage implements KeyValueStorage {
  readonly data = new Map<string, string>();
  /** Keys (or '*') whose setItem throws. */
  failSet = new Set<string>();
  failGet = false;
  failRemove = false;
  quota = true;
  setCalls = 0;

  getItem(key: string): string | null {
    if (this.failGet) throw new Error('storage unavailable');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.setCalls += 1;
    if (this.failSet.has('*') || this.failSet.has(key)) {
      const e = new Error('The quota has been exceeded.');
      if (this.quota) e.name = 'QuotaExceededError';
      throw e;
    }
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    if (this.failRemove) throw new Error('remove failed');
    this.data.delete(key);
  }
  /** Simulates another tab or a corruption writing behind the store's back. */
  poke(key: string, value: string): void {
    this.data.set(key, value);
  }
}
