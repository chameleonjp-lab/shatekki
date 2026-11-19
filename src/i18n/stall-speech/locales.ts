/**
 * r007 translations by locale (ja is the source in ./ja.ts). All 14 are complete and
 * machine-written by Claude; none has been reviewed by a native speaker yet.
 */
import type { Locale } from '../locales';
import type { AfLocaleContent } from './index';
import { AF_EN } from './en';
import { AF_ES } from './es';
import { AF_PT_BR } from './pt-BR';
import { AF_ZH_HANS } from './zh-Hans';
import { AF_FR } from './fr';
import { AF_DE } from './de';
import { AF_KO } from './ko';
import { AF_RU } from './ru';
import { AF_IT } from './it';
import { AF_ZH_HANT } from './zh-Hant';
import { AF_ID } from './id';
import { AF_TR } from './tr';
import { AF_VI } from './vi';
import { AF_TH } from './th';

export const AF_LOCALES: Partial<Record<Locale, AfLocaleContent>> = {
  en: AF_EN,
  es: AF_ES,
  'pt-BR': AF_PT_BR,
  'zh-Hans': AF_ZH_HANS,
  fr: AF_FR,
  de: AF_DE,
  ko: AF_KO,
  ru: AF_RU,
  it: AF_IT,
  'zh-Hant': AF_ZH_HANT,
  id: AF_ID,
  tr: AF_TR,
  vi: AF_VI,
  th: AF_TH,
};
