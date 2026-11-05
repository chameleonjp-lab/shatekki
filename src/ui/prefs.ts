/**
 * Device-local UI preferences: audio and the name draft. Language is stored by
 * src/i18n (LANGUAGE_STORAGE_KEY). Saved off / volume 0 are respected; only a
 * missing or unreadable value falls back to "on, volume > 0" (first run).
 * Every storage access is guarded: storage may be unavailable.
 */
import type { AudioSettings, KeyValueStorage } from '../contracts';

export const AUDIO_STORAGE_KEY = 'shatekki.audio.v1';
export const NAME_STORAGE_KEY = 'shatekki.player-name.v1';

export const DEFAULT_AUDIO: AudioSettings = { enabled: true, volume: 0.6 };

export function clampVolume(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_AUDIO.volume;
  return Math.min(1, Math.max(0, v));
}

export function parseAudioPrefs(raw: string | null): AudioSettings {
  if (!raw) return DEFAULT_AUDIO;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return DEFAULT_AUDIO;
    const o = v as Record<string, unknown>;
    return {
      enabled: typeof o.enabled === 'boolean' ? o.enabled : DEFAULT_AUDIO.enabled,
      volume: typeof o.volume === 'number' && Number.isFinite(o.volume) ? clampVolume(o.volume) : DEFAULT_AUDIO.volume,
    };
  } catch {
    return DEFAULT_AUDIO;
  }
}

export function loadAudio(storage: KeyValueStorage | null): AudioSettings {
  try {
    return parseAudioPrefs(storage?.getItem(AUDIO_STORAGE_KEY) ?? null);
  } catch {
    return DEFAULT_AUDIO;
  }
}

export function saveAudio(storage: KeyValueStorage | null, audio: AudioSettings): void {
  try {
    storage?.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ enabled: audio.enabled, volume: clampVolume(audio.volume) }));
  } catch {
    /* the setting still applies for this session */
  }
}

/** The name field draft (what the player typed). It becomes a run's name only at start. */
export function loadNameDraft(storage: KeyValueStorage | null): string {
  try {
    const v = storage?.getItem(NAME_STORAGE_KEY);
    return typeof v === 'string' ? v.slice(0, 200) : '';
  } catch {
    return '';
  }
}

export function saveNameDraft(storage: KeyValueStorage | null, draft: string): void {
  try {
    if (draft === '') storage?.removeItem(NAME_STORAGE_KEY);
    else storage?.setItem(NAME_STORAGE_KEY, draft.slice(0, 200));
  } catch {
    /* ignore */
  }
}
