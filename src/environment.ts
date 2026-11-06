/**
 * Pure helpers for page-environment pause reasons (decision 25, AC37).
 * Kept free of DOM access so they are unit-testable.
 */
import type { PauseReason } from './contracts';

export interface EnvironmentSnapshot {
  readonly hidden: boolean;
  readonly width: number;
  readonly height: number;
}

/** Landscape = wider than tall by a margin (avoids flicker on near-square windows). */
export function isLandscape(width: number, height: number): boolean {
  return width > height * 1.05;
}

export function environmentPauseReasons(s: EnvironmentSnapshot): PauseReason[] {
  const out: PauseReason[] = [];
  if (s.hidden) out.push('hidden');
  if (isLandscape(s.width, s.height)) out.push('landscape');
  return out;
}
