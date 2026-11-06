/**
 * Which GameplayBundle this build runs (owner: Opus).
 *
 * The public build always runs official-v1 (rules-v1). The expanded D34-D37
 * prototype is chosen only by the build-time variable VITE_SHATEKKI_BUNDLE,
 * never by a URL parameter, storage or a menu. The check below is folded at
 * build time, so the official build contains neither the expanded data nor
 * the code that loads it.
 */
import { BOOTH_LAYOUT, type GameplayBundle } from '../contracts';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../catalog/release-config';

export const OFFICIAL_BUNDLE: GameplayBundle = Object.freeze({
  key: 'official-v1' as const,
  catalog: RELEASE_CATALOG,
  tuning: RELEASE_TUNING,
  layout: BOOTH_LAYOUT,
  expansion: null,
});

/** The expanded-only UI pieces (question panel, overview, content texts). */
export type ExpandedUiKit = typeof import('./expanded-ui');

export interface BuildSetup {
  readonly bundle: GameplayBundle;
  /** Present only for the expanded bundle. */
  readonly expandedUi: ExpandedUiKit | null;
}

/** The bundle (and, for the internal prototype, its UI pieces) chosen when this build was made. */
export async function loadBuildSetup(): Promise<BuildSetup> {
  if (import.meta.env.VITE_SHATEKKI_BUNDLE === 'expanded-proposed') {
    const [{ getGameplayBundle }, expandedUi] = await Promise.all([import('../catalog/gameplay-config'), import('./expanded-ui')]);
    return { bundle: getGameplayBundle('expanded-proposed'), expandedUi };
  }
  return { bundle: OFFICIAL_BUNDLE, expandedUi: null };
}

/** The bundle chosen when this build was made. */
export async function loadBuildBundle(): Promise<GameplayBundle> {
  return (await loadBuildSetup()).bundle;
}
