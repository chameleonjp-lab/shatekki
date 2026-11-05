/**
 * Ranking / publication configuration.
 *
 * `gameSlug`, `canonicalUrl` and `labDetailUrl` are deliberately null: they do
 * not exist yet. The lab database has no row for this game (public.games was
 * checked read-only: 62 rows, none for 射的) and the official game URL and the
 * lab detail page are undecided. They stay null until the user approves the DB
 * registration and publication (open item O14, plan Task 18). Never guess them
 * and never reuse another game's values. While gameSlug is null the client
 * sends nothing, the Ranking button is disabled ("準備中") and the share text
 * omits the URL.
 *
 * The Supabase URL and publishable key are public by design (they are shipped
 * in every lab game). No privileged or private key may ever appear in src/.
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
  canonicalUrl: null,
  labDetailUrl: null,
  clientVersion: 'shatekki-web-0.1.0-prototype',
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
