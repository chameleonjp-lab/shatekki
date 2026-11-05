/**
 * Quarantine (persistence-design.md §3): data that cannot be read, has the
 * wrong shape or the wrong rules version is moved here, never silently
 * deleted. The caller removes the original only after this returned true.
 */
import type { KeyValueStorage } from '../contracts';
import { STORAGE_KEYS } from './keys';

export interface QuarantineEntry {
  readonly atIso: string;
  readonly key: string;
  readonly reason: string;
  readonly raw: string;
}

export function readQuarantine(storage: KeyValueStorage): QuarantineEntry[] {
  try {
    const raw = storage.getItem(STORAGE_KEYS.quarantine);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QuarantineEntry[]) : [];
  } catch {
    return [];
  }
}

/** Appends the entry. Returns false when it could not be stored (then the original must stay where it is). */
export function quarantine(storage: KeyValueStorage, entry: QuarantineEntry): boolean {
  try {
    const existing = storage.getItem(STORAGE_KEYS.quarantine);
    let list: unknown[] = [];
    if (existing !== null) {
      try {
        const parsed: unknown = JSON.parse(existing);
        if (Array.isArray(parsed)) list = parsed;
        else return false; // do not overwrite something we cannot understand
      } catch {
        return false;
      }
    }
    storage.setItem(STORAGE_KEYS.quarantine, JSON.stringify([...list, entry]));
    return true;
  } catch {
    return false;
  }
}
