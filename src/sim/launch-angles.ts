import type { ShotModifiers } from '../contracts';

/** Horizontal offsets of the corks fired together, in projectile-id order. */
export function launchAngles({ count, spreadRad }: ShotModifiers['launch']): readonly number[] {
  if (count === 1) return [0];
  return count === 2 ? [spreadRad, -spreadRad] : [0, spreadRad, -spreadRad];
}
