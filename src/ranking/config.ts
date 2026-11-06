/**
 * First official publication: gameplay is public, ranking and lab integration
 * remain disabled by the user's release instruction. No start/end/score/top
 * requests are allowed while gameSlug is null. The intended Pages URL is set
 * for canonical/share metadata; publication is verified separately.
 */
export interface RankingConfig {
  readonly supabaseUrl: string;
  /** Publishable (anon) key. Safe for the browser. */
  readonly publishableKey: string;
  /** Registered game identifier in the lab DB, or null until approved (O14). */
  readonly gameSlug: string | null;
  /** Official public game URL, or null until published (O14). */
  readonly canonicalUrl: string | null;
  /** The lab's detail ranking page for this game, or null until it exists (O14). */
  readonly labDetailUrl: string | null;
  readonly clientVersion: string;
  readonly timeoutMs: number;
  /** How many participants to show (participants, not plays). */
  readonly topLimit: number;
}

export const RANKING_CONFIG: RankingConfig = {
  supabaseUrl: 'https://mlpnjgezrnhdxsxolyzj.supabase.co',
  publishableKey: 'sb_publishable_drzcy0v97knU6FgjqSgBHw_0A9XPdFM',
  gameSlug: null,
  canonicalUrl: 'https://chameleonjp-lab.github.io/shatekki/',
  labDetailUrl: null,
  clientVersion: 'shatekki-web-1.0.0',
  timeoutMs: 8000,
  topLimit: 30,
};

/** The subset the UI needs (home / result / share). */
export interface PublicLinks {
  readonly canonicalUrl: string | null;
  readonly labDetailUrl: string | null;
}

export function publicLinks(config: RankingConfig = RANKING_CONFIG): PublicLinks {
  return { canonicalUrl: config.canonicalUrl, labDetailUrl: config.labDetailUrl };
}

export const PENDING_STORAGE_KEY = 'shatekki.ranking-pending.v1';
export const QUARANTINE_STORAGE_KEY = 'shatekki.ranking-pending-quarantine.v1';
export const DONE_STORAGE_KEY = 'shatekki.ranking-done.v1';
export const MAX_SCORE = 2_147_483_647;
