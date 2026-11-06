/**
 * Italian texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { IT_PAIR_CLUES, IT_PAIR_NAMES } from './it-pairs';
import { IT_QUESTIONS } from './it-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
IT_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
IT_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Servono 2 tipi.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
IT_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Ricevi 1 tappo', 'Ricevi 2 tappi', 'Ricevi 3 tappi', 'Colpo che scheggia un po\' di più', 'Colpo che scheggia molto',
  'Colpo che spinge un po\' di più', 'Colpo che spinge forte', 'Colpo di buona forza', 'Colpo di forza solida', 'Colpo un po\' più veloce',
  'Colpo veloce', 'Mira più stabile', 'Mira ancora più stabile', 'Caduta un po\' ridotta', 'Colpo ad arco basso',
  'Passa al colpo rimbalzante', 'Passa al colpo pesante', 'Divisione più stretta', 'Colpo in due direzioni', 'Un rimbalzo di margine in più',
  // 021-040
  'Perdi 1 tappo', 'Perdi 2 tappi', 'Perdi 3 tappi', 'Colpo che scheggia male', 'Colpo molle',
  'Colpo che spinge male', 'Colpo che spinge piano', 'Colpo semplice e modesto', 'Colpo un po\' lento', 'Colpo lento',
  'Colpo un po\' curvo', 'Colpo curvo', 'Colpo meno rimbalzante', 'Perde subito slancio', 'Mira un po\' tremante',
  'Mira tremante', 'Barra di carica veloce', 'Barra di carica lenta', 'Divisione più larga', 'Due rimbalzi in meno',
  // 041-060
  'Assortimento Pasticceria', 'Assortimento Tè con dolci', 'Assortimento Festa d\'estate', 'Assortimento Giochi di una volta', 'Assortimento Animali di casa',
  'Assortimento Zoo', 'Assortimento Paesaggi del bosco', 'Assortimento Creature del mare', 'Assortimento Mezzi da viaggio', 'Assortimento Mezzi da lavoro',
  'Assortimento Attrezzatura per gite', 'Assortimento Esplorazione spaziale', 'Assortimento Paesaggi del cielo', 'Assortimento Giardino fiorito', 'Assortimento Animaletti',
  'Assortimento Concerto', 'Assortimento Giochi per tutti', 'Assortimento Colazione e bento', 'Assortimento Spuntino', 'Assortimento Cucina giocattolo',
  // 061-080
  'Individua Pasticceria', 'Individua Tè con dolci', 'Individua Festa d\'estate', 'Individua Giochi di una volta', 'Individua Animali di casa',
  'Individua Zoo', 'Individua Paesaggi del bosco', 'Individua Creature del mare', 'Individua Mezzi da viaggio', 'Individua Mezzi da lavoro',
  'Individua Attrezzatura per gite', 'Individua Esplorazione spaziale', 'Individua Paesaggi del cielo', 'Individua Giardino fiorito', 'Individua Animaletti',
  'Individua Concerto', 'Individua Giochi per tutti', 'Individua Colazione e bento', 'Individua Spuntino', 'Individua Cucina giocattolo',
  // 081-100
  'Ritorno al colpo normale', 'Prossimo colpo come al solito', 'Tappo spesso', 'Tappo sottile', 'Doppio colpo ravvicinato',
  'Colpo in tre direzioni', 'Colpo orientato a scheggiare', 'Colpo orientato a spingere', 'Colpo veloce ma leggero', 'Allinea un premio a un altro',
  'Un premio torna al tipo originale', 'Ancora uno del tipo vinto', 'Mappa della resistenza', 'Indizio su un altro tipo', 'Non ancora vinto in questa partita',
  'Vedi insieme i tipi uguali', 'Vedi il ciclo di movimento', 'Stima del primo impatto', 'Mostra la traiettoria', 'Scala dell\'angolo di mira',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Tappi in più: {n}', 'Tappi in più: {n}', 'Tappi in più: {n}',
  'Il prossimo colpo scheggia un po\' di più', 'Il prossimo colpo scheggia di più',
  'Il prossimo colpo spinge un po\' di più', 'Il prossimo colpo spinge più forte',
  'Il prossimo colpo ha un po\' più di forza per scheggiare e spingere', 'Il prossimo colpo ha molta più forza per scheggiare e spingere',
  'Il prossimo colpo vola un po\' più veloce', 'Il prossimo colpo vola più veloce',
  'Il prossimo colpo ondeggia meno nella mira', 'Il prossimo colpo ondeggia molto meno nella mira',
  'Il prossimo colpo cade un po\' meno', 'Il prossimo colpo vola ad arco basso',
  'Il prossimo colpo è rimbalzante', 'Il prossimo colpo è pesante',
  'Se poi si divide, l\'apertura sarà più stretta', 'Il prossimo colpo si divide in due direzioni',
  'Il prossimo colpo può rimbalzare una volta in più',
  // 021-040
  'Tappi persi: {n}', 'Tappi persi: {n}', 'Tappi persi: {n}',
  'Il prossimo colpo scheggia meno', 'Il prossimo colpo scheggia molto meno',
  'Il prossimo colpo spinge meno', 'Il prossimo colpo spinge molto meno',
  'Il prossimo colpo scheggia e spinge un po\' meno',
  'Il prossimo colpo vola un po\' più lento', 'Il prossimo colpo vola lentamente',
  'Il prossimo colpo curva un po\' di più', 'Il prossimo colpo vola ad arco alto',
  'Il prossimo colpo rimbalza un po\' meno', 'Il prossimo colpo perde subito slancio',
  'Il prossimo colpo ondeggia un po\' di più nella mira', 'Il prossimo colpo ondeggia di più nella mira',
  'La prossima barra di carica avanza un po\' più veloce', 'La prossima barra di carica avanza lentamente',
  'Se poi si divide, l\'apertura sarà più larga', 'Il prossimo colpo può rimbalzare due volte in meno',
  // 041-060
  ...Array.from({ length: 20 }, () => 'I premi rimasti sono passati all\'assortimento «{series}». I premi già vinti restano come sono'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'I premi di «{series}» ora hanno un contorno colorato e un simbolo abbinati. L\'assortimento non cambia'),
  // 081-100
  'Il prossimo colpo torna al colpo normale', 'Il prossimo colpo torna al solito',
  'Il prossimo colpo ha un tappo un po\' più spesso', 'Il prossimo colpo ha un tappo un po\' più sottile',
  'Il prossimo colpo si divide in due direzioni vicine', 'Il prossimo colpo si divide in tre direzioni',
  'Il prossimo colpo scheggia di più ma spinge meno', 'Il prossimo colpo spinge di più ma scheggia meno',
  'Il prossimo colpo è veloce ma spinge meno',
  'Un premio ha preso lo stesso tipo di un altro premio',
  'Un premio è tornato al tipo con cui era stato messo',
  'Un premio ha preso l\'ultimo tipo che hai vinto',
  'Per il prossimo colpo viene mostrata la resistenza dei premi',
  'Per il prossimo colpo compare un indizio sui set a cui manca un tipo',
  'Per il prossimo colpo sono segnati i premi non ancora vinti in questa partita',
  'Per il prossimo colpo i premi dello stesso tipo mostrano nome e numero',
  'Per il prossimo colpo viene mostrato il ciclo di movimento dei premi mobili',
  'Per il prossimo colpo compare un segno del primo impatto. È solo un riferimento e può differire',
  'Dopo, la traiettoria del prossimo colpo sarà più leggibile',
  'Per il prossimo colpo compare una scala dell\'angolo sulla mira',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Pasticceria', SER02: 'Tè con dolci', SER03: 'Festa d\'estate', SER04: 'Giochi di una volta', SER05: 'Animali di casa',
  SER06: 'Zoo', SER07: 'Paesaggi del bosco', SER08: 'Creature del mare', SER09: 'Mezzi da viaggio', SER10: 'Mezzi da lavoro',
  SER11: 'Attrezzatura per gite', SER12: 'Esplorazione spaziale', SER13: 'Paesaggi del cielo', SER14: 'Giardino fiorito', SER15: 'Animaletti',
  SER16: 'Concerto', SER17: 'Giochi per tutti', SER18: 'Colazione e bento', SER19: 'Spuntino', SER20: 'Cucina giocattolo',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Dolci]', SER02: '[Tè]', SER03: '[Festa]', SER04: '[Retrò]', SER05: '[Pets]',
  SER06: '[Zoo]', SER07: '[Bosco]', SER08: '[Mare]', SER09: '[Viaggio]', SER10: '[Lavoro]',
  SER11: '[Gita]', SER12: '[Spazio]', SER13: '[Cielo]', SER14: '[Fiori]', SER15: '[Insetti]',
  SER16: '[Musica]', SER17: '[Giochi]', SER18: '[Pasti]', SER19: '[Snack]', SER20: '[Cucina]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const IT_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Più tappi o un altro colpo',
    RISK: 'Vento a favore o contrattempo, a caso',
    STOCK: 'Cambia la serie dei premi',
    GUIDE: 'Individua i premi di una serie',
    MIX: 'Trucchi e indicazioni assortiti',
    CHAOS: 'Qualsiasi cosa, decide il destino',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Al momento nessun effetto è utilizzabile',
    effectNotApplicable: 'Questa volta l\'effetto non ha potuto essere usato',
    noOutlineTarget: 'Al momento non ci sono premi bersaglio',
    sideEffectTemporaryOutsideSeries: 'Un premio può trovarsi temporaneamente fuori dalla serie',
  },
};
