/**
 * German texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { DE_PAIR_CLUES, DE_PAIR_NAMES } from './de-pairs';
import { DE_QUESTIONS } from './de-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
DE_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
DE_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Braucht 2 Sorten.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
DE_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  '1 Korken erhalten', '2 Korken erhalten', '3 Korken erhalten', 'Leicht absplitternder Schuss', 'Stark absplitternder Schuss',
  'Leicht schiebender Schuss', 'Stark schiebender Schuss', 'Treffer mit ordentlicher Kraft', 'Treffer mit solider Kraft', 'Etwas schneller Schuss',
  'Schneller Schuss', 'Ruhigeres Zielen', 'Noch ruhigeres Zielen', 'Etwas weniger Absinken', 'Flacher Bogenschuss',
  'Wechsel zum Springschuss', 'Wechsel zum schweren Schuss', 'Engere Streuung', 'Schuss in zwei Richtungen', 'Ein Abprall Reserve',
  // 021-040
  '1 Korken verlieren', '2 Korken verlieren', '3 Korken verlieren', 'Schwer absplitternder Schuss', 'Weicher Schuss',
  'Schwer schiebender Schuss', 'Sacht schiebender Schuss', 'Schlichter, bescheidener Schuss', 'Etwas langsamer Schuss', 'Langsamer Schuss',
  'Leicht gebogener Schuss', 'Gebogener Schuss', 'Weniger springender Schuss', 'Verliert schnell Schwung', 'Leicht zittriges Zielen',
  'Zittriges Zielen', 'Schnell ladender Balken', 'Langsam ladender Balken', 'Weitere Streuung', 'Zwei Abpralle weniger',
  // 041-060
  'Sortiment Süßwarenladen', 'Sortiment Teeparty', 'Sortiment Sommerfest', 'Sortiment Spiele von früher', 'Sortiment vertraute Tiere',
  'Sortiment Zoo', 'Sortiment Waldlandschaft', 'Sortiment Meerestiere', 'Sortiment Reisefahrzeuge', 'Sortiment Arbeitsfahrzeuge',
  'Sortiment Ausflugsausrüstung', 'Sortiment Weltraumforschung', 'Sortiment Himmelslandschaft', 'Sortiment Blumengarten', 'Sortiment Kleingetier',
  'Sortiment Konzert', 'Sortiment Spiele für alle', 'Sortiment Frühstück und Bento', 'Sortiment Imbissbude', 'Sortiment Spielküche',
  // 061-080
  'Süßwarenladen erspähen', 'Teeparty erspähen', 'Sommerfest erspähen', 'Spiele von früher erspähen', 'Vertraute Tiere erspähen',
  'Zoo erspähen', 'Waldlandschaft erspähen', 'Meerestiere erspähen', 'Reisefahrzeuge erspähen', 'Arbeitsfahrzeuge erspähen',
  'Ausflugsausrüstung erspähen', 'Weltraumforschung erspähen', 'Himmelslandschaft erspähen', 'Blumengarten erspähen', 'Kleingetier erspähen',
  'Konzert erspähen', 'Spiele für alle erspähen', 'Frühstück und Bento erspähen', 'Imbissbude erspähen', 'Spielküche erspähen',
  // 081-100
  'Zurück zum einfachen Schuss', 'Nächster Schuss wie gewohnt', 'Dicker Korken', 'Dünner Korken', 'Enger Doppelschuss',
  'Schuss in drei Richtungen', 'Auf Absplittern ausgerichteter Schuss', 'Auf Schieben ausgerichteter Schuss', 'Schneller, aber leichter Schuss', 'Einen Preis an einen anderen angleichen',
  'Ein Preis kehrt zu seiner Ursprungssorte zurück', 'Noch einer der gewonnenen Sorte', 'Plan der Festigkeit', 'Hinweis auf eine weitere Sorte', 'Dieses Spiel noch nicht gewonnen',
  'Gleiche Sorten zusammen sehen', 'Bewegungszyklus sehen', 'Schätzung des ersten Treffers', 'Flugbahn anzeigen', 'Winkelskala zum Zielen',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} Korken mehr', '{n} Korken mehr', '{n} Korken mehr',
  'Der nächste Schuss splittert etwas mehr ab', 'Der nächste Schuss splittert mehr ab',
  'Der nächste Schuss schiebt etwas mehr', 'Der nächste Schuss schiebt kräftiger',
  'Der nächste Schuss hat etwas mehr Kraft zum Absplittern und Schieben', 'Der nächste Schuss hat deutlich mehr Kraft zum Absplittern und Schieben',
  'Der nächste Schuss fliegt etwas schneller', 'Der nächste Schuss fliegt schneller',
  'Beim nächsten Schuss wackelt das Ziel weniger', 'Beim nächsten Schuss wackelt das Ziel viel weniger',
  'Der nächste Schuss sinkt etwas weniger ab', 'Der nächste Schuss fliegt in einem flachen Bogen',
  'Der nächste Schuss ist ein Springschuss', 'Der nächste Schuss ist ein schwerer Schuss',
  'Teilt er sich danach, ist die Streuung enger', 'Der nächste Schuss teilt sich in zwei Richtungen',
  'Der nächste Schuss kann einmal mehr abprallen',
  // 021-040
  '{n} Korken verloren', '{n} Korken verloren', '{n} Korken verloren',
  'Der nächste Schuss splittert weniger ab', 'Der nächste Schuss splittert viel weniger ab',
  'Der nächste Schuss schiebt weniger', 'Der nächste Schuss schiebt viel weniger',
  'Der nächste Schuss splittert und schiebt etwas weniger',
  'Der nächste Schuss fliegt etwas langsamer', 'Der nächste Schuss fliegt langsam',
  'Der nächste Schuss biegt sich etwas mehr', 'Der nächste Schuss fliegt in hohem Bogen',
  'Der nächste Schuss springt etwas weniger', 'Der nächste Schuss verliert schnell Schwung',
  'Beim nächsten Schuss wackelt das Ziel etwas mehr', 'Beim nächsten Schuss wackelt das Ziel mehr',
  'Der nächste Ladebalken läuft etwas schneller', 'Der nächste Ladebalken läuft langsam',
  'Teilt er sich danach, ist die Streuung weiter', 'Der nächste Schuss kann zweimal weniger abprallen',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Die übrigen Preise wurden auf das Sortiment „{series}“ umgestellt. Schon gewonnene Preise bleiben, wie sie sind'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Preise der Serie „{series}“ haben jetzt einen farbigen Rand und ein passendes Symbol. Das Sortiment bleibt unverändert'),
  // 081-100
  'Der nächste Schuss wird wieder ein einfacher Schuss', 'Der nächste Schuss wird wieder wie gewohnt',
  'Der nächste Schuss hat einen etwas dickeren Korken', 'Der nächste Schuss hat einen etwas dünneren Korken',
  'Der nächste Schuss teilt sich in zwei nahe Richtungen', 'Der nächste Schuss teilt sich in drei Richtungen',
  'Der nächste Schuss splittert mehr, schiebt aber weniger', 'Der nächste Schuss schiebt mehr, splittert aber weniger',
  'Der nächste Schuss ist schnell, schiebt aber weniger',
  'Ein Preis hat die Sorte eines anderen Preises angenommen',
  'Ein Preis ist zu der Sorte zurückgekehrt, als die er aufgestellt wurde',
  'Ein Preis hat die zuletzt gewonnene Sorte angenommen',
  'Für den nächsten Schuss wird die Festigkeit der Preise angezeigt',
  'Für den nächsten Schuss erscheint ein Hinweis bei Sets, denen eine Sorte fehlt',
  'Für den nächsten Schuss sind in diesem Spiel noch nicht gewonnene Preise markiert',
  'Für den nächsten Schuss zeigen Preise gleicher Sorte Namen und Anzahl',
  'Für den nächsten Schuss wird der Bewegungszyklus beweglicher Preise angezeigt',
  'Für den nächsten Schuss erscheint eine Markierung des ersten Treffers. Sie ist nur ein Anhaltspunkt und kann abweichen',
  'Danach ist die Flugbahn des nächsten Schusses besser zu erkennen',
  'Für den nächsten Schuss erscheint eine Winkelskala am Visier',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Süßwarenladen', SER02: 'Teeparty', SER03: 'Sommerfest', SER04: 'Spiele von früher', SER05: 'Vertraute Tiere',
  SER06: 'Zoo', SER07: 'Waldlandschaft', SER08: 'Meerestiere', SER09: 'Reisefahrzeuge', SER10: 'Arbeitsfahrzeuge',
  SER11: 'Ausflugsausrüstung', SER12: 'Weltraumforschung', SER13: 'Himmelslandschaft', SER14: 'Blumengarten', SER15: 'Kleingetier',
  SER16: 'Konzert', SER17: 'Spiele für alle', SER18: 'Frühstück und Bento', SER19: 'Imbissbude', SER20: 'Spielküche',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Süßes]', SER02: '[Tee]', SER03: '[Fest]', SER04: '[Retro]', SER05: '[Haustier]',
  SER06: '[Zoo]', SER07: '[Wald]', SER08: '[Meer]', SER09: '[Reise]', SER10: '[Bau]',
  SER11: '[Ausflug]', SER12: '[All]', SER13: '[Himmel]', SER14: '[Blumen]', SER15: '[Käfer]',
  SER16: '[Musik]', SER17: '[Spiele]', SER18: '[Mahlzeit]', SER19: '[Snacks]', SER20: '[Küche]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const DE_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Mehr Korken oder ein anderer Schuss',
    RISK: 'Rückenwind oder Rückschlag, je nach Glück',
    STOCK: 'Die Preisserie wechseln',
    GUIDE: 'Preise einer Serie erspähen',
    MIX: 'Allerlei Tricks und Hilfen',
    CHAOS: 'Alles ist möglich, das Schicksal entscheidet',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Im Moment ist kein Effekt nutzbar',
    effectNotApplicable: 'Dieser Effekt konnte diesmal nicht genutzt werden',
    noOutlineTarget: 'Im Moment gibt es keine Zielpreise',
    sideEffectTemporaryOutsideSeries: 'Ein Preis kann vorübergehend außerhalb der Serie liegen',
  },
};
