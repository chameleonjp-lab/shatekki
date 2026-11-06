/**
 * Player name rules shared by the UI and the ranking client. The v1 contract
 * accepts 1-20 Unicode code points after trimming (PostgreSQL char_length).
 * Names are data: they are only ever displayed through textContent.
 */
export const NAME_MAX_CODE_POINTS = 20;

export type NameCheck =
  | { readonly status: 'empty' }
  | { readonly status: 'ok'; readonly name: string }
  | { readonly status: 'too_long'; readonly length: number };

// Control characters (incl. newlines/tabs) and bidi overrides never belong in a display name.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g;

export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== 'string') return { status: 'empty' };
  const name = raw.replace(UNSAFE, ' ').trim();
  if (name === '') return { status: 'empty' };
  const length = [...name].length;
  if (length > NAME_MAX_CODE_POINTS) return { status: 'too_long', length };
  return { status: 'ok', name };
}

/** Valid trimmed name, or null (empty/too long/not a string). */
export function normalizePlayerName(raw: unknown): string | null {
  const c = checkName(raw);
  return c.status === 'ok' ? c.name : null;
}
