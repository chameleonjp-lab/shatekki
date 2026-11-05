/**
 * X (Twitter) sharing. Opens the compose screen only; the person confirms the
 * post. It never posts by itself and never claims it posted. If the window
 * cannot be opened the text is copied, and if that fails too the UI shows the
 * text for manual selection. Share text uses the confirmed final numbers only:
 * no name, rank or internal ids. The official URL is appended only when
 * configured (it is null until publication is approved, O13/O14).
 */
import { translate, type Locale } from '../i18n';

export const X_INTENT_BASE = 'https://x.com/intent/post';

export interface ResultShareCounts {
  readonly score: number;
  readonly prizes: number;
  readonly sets: number;
  readonly maxChain: number;
}

function withUrl(body: string, canonicalUrl: string | null): string {
  return canonicalUrl ? `${body}\n\n${canonicalUrl}` : body;
}

export function buildHomeShareText(locale: Locale, canonicalUrl: string | null): string {
  return withUrl(translate(locale, 'share.home'), canonicalUrl);
}

export function buildResultShareText(locale: Locale, c: ResultShareCounts, canonicalUrl: string | null): string {
  const body = translate(locale, 'share.result', { score: c.score, prizes: c.prizes, sets: c.sets, chain: c.maxChain });
  return withUrl(body, canonicalUrl);
}

export function xIntentUrl(text: string): string {
  const u = new URL(X_INTENT_BASE);
  u.searchParams.set('text', text);
  return u.href;
}

export type OpenWindow = (url: string) => { opener: unknown } | null;
export type WriteText = (text: string) => Promise<void>;
export type ShareOutcome = 'opened' | 'copied' | 'manual';

export function browserOpen(): OpenWindow {
  return (url) => (typeof window === 'undefined' ? null : window.open(url, '_blank'));
}

export function browserWriteText(): WriteText | undefined {
  if (typeof navigator === 'undefined' || typeof navigator.clipboard?.writeText !== 'function') return undefined;
  return (t) => navigator.clipboard.writeText(t);
}

export async function copyText(text: string, writeText: WriteText | undefined): Promise<boolean> {
  if (!writeText) return false;
  try {
    await writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function shareOnX(input: { text: string; open?: OpenWindow; writeText?: WriteText | undefined }): Promise<ShareOutcome> {
  const open = input.open ?? browserOpen();
  try {
    const w = open(xIntentUrl(input.text));
    if (w) {
      w.opener = null;
      return 'opened';
    }
  } catch {
    /* fall through to copying; the result stays on screen */
  }
  const writeText = 'writeText' in input ? input.writeText : browserWriteText();
  return (await copyText(input.text, writeText)) ? 'copied' : 'manual';
}

/** Message key to show after a share attempt. 'opened' says only that the compose screen opened. */
export function shareOutcomeKey(o: ShareOutcome): 'share.opened' | 'share.copied' | 'share.manual' {
  return o === 'opened' ? 'share.opened' : o === 'copied' ? 'share.copied' : 'share.manual';
}
