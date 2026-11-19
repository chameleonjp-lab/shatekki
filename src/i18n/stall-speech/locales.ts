/**
 * r007 translations by locale (ja is the source in ./ja.ts). A locale without an entry
 * falls back to English, then Japanese.
 */
import type { Locale } from '../locales';
import type { AfLocaleContent } from './index';

export const AF_LOCALES: Partial<Record<Locale, AfLocaleContent>> = {};
