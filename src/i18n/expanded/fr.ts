/**
 * French texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { FR_PAIR_CLUES, FR_PAIR_NAMES } from './fr-pairs';
import { FR_QUESTIONS } from './fr-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
FR_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
FR_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Il faut 2 types.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
FR_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Gagner 1 bouchon', 'Gagner 2 bouchons', 'Gagner 3 bouchons', 'Tir qui entame un peu plus', 'Tir qui entame beaucoup',
  'Tir qui pousse un peu plus', 'Tir qui pousse fort', 'Frappe de bonne force', 'Frappe de force solide', 'Tir un peu plus rapide',
  'Tir rapide', 'Visée plus stable', 'Visée encore plus stable', 'Chute un peu moindre', 'Tir en arc bas',
  'Passer au tir rebondissant', 'Passer au tir lourd', 'Séparation plus serrée', 'Tir en deux directions', 'Un rebond de marge en plus',
  // 021-040
  'Perdre 1 bouchon', 'Perdre 2 bouchons', 'Perdre 3 bouchons', 'Tir qui entame mal', 'Tir mou',
  'Tir qui pousse mal', 'Tir qui pousse doucement', 'Tir simple et modeste', 'Tir un peu lent', 'Tir lent',
  'Tir un peu courbe', 'Tir courbe', 'Tir moins rebondissant', 'Perd vite son élan', 'Visée un peu tremblante',
  'Visée tremblante', 'Barre de charge rapide', 'Barre de charge lente', 'Séparation plus large', 'Deux rebonds en moins',
  // 041-060
  'Assortiment de la confiserie', 'Assortiment du thé', 'Assortiment de la fête d\'été', 'Assortiment des jeux d\'autrefois', 'Assortiment des animaux familiers',
  'Assortiment du zoo', 'Assortiment des paysages de forêt', 'Assortiment des créatures marines', 'Assortiment des véhicules de voyage', 'Assortiment des véhicules de travail',
  'Assortiment de l\'équipement de sortie', 'Assortiment de l\'exploration spatiale', 'Assortiment des paysages du ciel', 'Assortiment du jardin fleuri', 'Assortiment des petites bêtes',
  'Assortiment du concert', 'Assortiment des jeux pour tous', 'Assortiment petit-déjeuner et bento', 'Assortiment du snack', 'Assortiment de la dînette',
  // 061-080
  'Repérer la confiserie', 'Repérer le thé', 'Repérer la fête d\'été', 'Repérer les jeux d\'autrefois', 'Repérer les animaux familiers',
  'Repérer le zoo', 'Repérer les paysages de forêt', 'Repérer les créatures marines', 'Repérer les véhicules de voyage', 'Repérer les véhicules de travail',
  'Repérer l\'équipement de sortie', 'Repérer l\'exploration spatiale', 'Repérer les paysages du ciel', 'Repérer le jardin fleuri', 'Repérer les petites bêtes',
  'Repérer le concert', 'Repérer les jeux pour tous', 'Repérer le petit-déjeuner et le bento', 'Repérer le snack', 'Repérer la dînette',
  // 081-100
  'Retour au tir ordinaire', 'Prochain tir comme d\'habitude', 'Bouchon épais', 'Bouchon fin', 'Double tir rapproché',
  'Tir en trois directions', 'Tir axé sur l\'entame', 'Tir axé sur la poussée', 'Tir rapide mais léger', 'Aligner un lot sur un autre',
  'Un lot revient à son type d\'origine', 'Encore un du type gagné', 'Plan de solidité', 'Indice d\'un type de plus', 'Pas encore gagné cette partie',
  'Voir les mêmes types ensemble', 'Voir le cycle de mouvement', 'Estimation du premier impact', 'Montrer la trajectoire', 'Échelle d\'angle de visée',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} bouchon(s) en plus', '{n} bouchon(s) en plus', '{n} bouchon(s) en plus',
  'Le prochain tir entame un peu plus', 'Le prochain tir entame plus',
  'Le prochain tir pousse un peu plus', 'Le prochain tir pousse plus fort',
  'Le prochain tir gagne un peu en force pour entamer et pousser', 'Le prochain tir gagne beaucoup en force pour entamer et pousser',
  'Le prochain tir vole un peu plus vite', 'Le prochain tir vole plus vite',
  'Le prochain tir vacille moins à la visée', 'Le prochain tir vacille bien moins à la visée',
  'Le prochain tir chute un peu moins', 'Le prochain tir vole en arc bas',
  'Le prochain tir est rebondissant', 'Le prochain tir est lourd',
  'S\'il se sépare ensuite, l\'écart sera plus serré', 'Le prochain tir se sépare en deux directions',
  'Le prochain tir peut rebondir une fois de plus',
  // 021-040
  '{n} bouchon(s) perdu(s)', '{n} bouchon(s) perdu(s)', '{n} bouchon(s) perdu(s)',
  'Le prochain tir entame moins', 'Le prochain tir entame bien moins',
  'Le prochain tir pousse moins', 'Le prochain tir pousse bien moins',
  'Le prochain tir entame et pousse un peu moins',
  'Le prochain tir vole un peu moins vite', 'Le prochain tir vole lentement',
  'Le prochain tir fait un peu plus d\'arc', 'Le prochain tir fait un arc haut',
  'Le prochain tir rebondit un peu moins', 'Le prochain tir perd vite son élan',
  'Le prochain tir vacille un peu plus à la visée', 'Le prochain tir vacille plus à la visée',
  'La prochaine barre de charge avance un peu plus vite', 'La prochaine barre de charge avance lentement',
  'S\'il se sépare ensuite, l\'écart sera plus large', 'Le prochain tir peut rebondir deux fois de moins',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Les lots restants sont passés à l\'assortiment « {series} ». Les lots déjà gagnés restent tels quels'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Les lots de « {series} » ont maintenant un contour coloré et un symbole assortis. L\'assortiment ne change pas'),
  // 081-100
  'Le prochain tir revient au tir ordinaire', 'Le prochain tir revient à la normale',
  'Le prochain tir a un bouchon un peu plus épais', 'Le prochain tir a un bouchon un peu plus fin',
  'Le prochain tir se sépare en deux directions proches', 'Le prochain tir se sépare en trois directions',
  'Le prochain tir entame plus mais pousse moins', 'Le prochain tir pousse plus mais entame moins',
  'Le prochain tir est rapide mais pousse moins',
  'Un lot a pris le même type qu\'un autre lot',
  'Un lot est revenu au type avec lequel il avait été placé',
  'Un lot a pris le dernier type que vous avez gagné',
  'Pour le prochain tir, la solidité des lots est affichée',
  'Pour le prochain tir, un indice apparaît pour les lots à un type près',
  'Pour le prochain tir, les lots pas encore gagnés cette partie sont marqués',
  'Pour le prochain tir, les lots du même type affichent leur nom et leur nombre',
  'Pour le prochain tir, le cycle de mouvement des lots mobiles est affiché',
  'Pour le prochain tir, un repère du premier impact apparaît. Ce n\'est qu\'un repère, il peut différer',
  'Ensuite, la trajectoire du prochain tir sera plus lisible',
  'Pour le prochain tir, une échelle d\'angle apparaît sur la visée',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Confiserie', SER02: 'Thé', SER03: 'Fête d\'été', SER04: 'Jeux d\'autrefois', SER05: 'Animaux familiers',
  SER06: 'Zoo', SER07: 'Paysages de forêt', SER08: 'Créatures marines', SER09: 'Véhicules de voyage', SER10: 'Véhicules de travail',
  SER11: 'Équipement de sortie', SER12: 'Exploration spatiale', SER13: 'Paysages du ciel', SER14: 'Jardin fleuri', SER15: 'Petites bêtes',
  SER16: 'Concert', SER17: 'Jeux pour tous', SER18: 'Petit-déjeuner et bento', SER19: 'Snack', SER20: 'Dînette',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Bonbons]', SER02: '[Thé]', SER03: '[Fête]', SER04: '[Rétro]', SER05: '[Pets]',
  SER06: '[Zoo]', SER07: '[Forêt]', SER08: '[Mer]', SER09: '[Voyage]', SER10: '[Chantier]',
  SER11: '[Sortie]', SER12: '[Espace]', SER13: '[Ciel]', SER14: '[Fleurs]', SER15: '[Bestioles]',
  SER16: '[Musique]', SER17: '[Jeux]', SER18: '[Repas]', SER19: '[Snacks]', SER20: '[Cuisine]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const FR_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Plus de bouchons, ou un autre tir',
    RISK: 'Coup de pouce ou revers, au hasard',
    STOCK: 'Changer la série de lots',
    GUIDE: 'Repérer les lots d\'une série',
    MIX: 'Astuces et repères variés',
    CHAOS: 'N\'importe quoi, à la grâce du destin',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Aucun effet n\'est utilisable pour l\'instant',
    effectNotApplicable: 'Cet effet n\'a pas pu être utilisé cette fois',
    noOutlineTarget: 'Il n\'y a aucun lot visé pour l\'instant',
    sideEffectTemporaryOutsideSeries: 'Un lot peut se retrouver temporairement hors de la série',
  },
};
