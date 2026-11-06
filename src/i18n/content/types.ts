/** One locale's catalog text. Keys are the stable ids P001-P100 / S001-S100. */
export interface LocaleContent {
  readonly prizes: Readonly<Record<string, string>>;
  readonly sets: Readonly<Record<string, string>>;
  readonly hints: Readonly<Record<string, string>>;
}
