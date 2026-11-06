/**
 * Brazilian Portuguese texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { PT_BR_PAIR_CLUES, PT_BR_PAIR_NAMES } from './pt-BR-pairs';
import { PT_BR_QUESTIONS } from './pt-BR-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
PT_BR_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
PT_BR_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Precisa de 2 tipos.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
PT_BR_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Ganhar 1 rolha', 'Ganhar 2 rolhas', 'Ganhar 3 rolhas', 'Tiro que lasca um pouco mais', 'Tiro que lasca muito',
  'Tiro que empurra um pouco mais', 'Tiro que empurra muito', 'Pancada de boa força', 'Pancada de força firme', 'Tiro um pouco mais rápido',
  'Tiro rápido', 'Mira mais firme', 'Mira ainda mais firme', 'Cai um pouco menos', 'Tiro em arco baixo',
  'Trocar para tiro saltitante', 'Trocar para tiro pesado', 'Divisão mais fechada', 'Tiro em duas direções', 'Mais uma batida de folga',
  // 021-040
  'Perder 1 rolha', 'Perder 2 rolhas', 'Perder 3 rolhas', 'Tiro difícil de lascar', 'Tiro mole',
  'Tiro difícil de empurrar', 'Tiro que empurra pouco', 'Tiro único e modesto', 'Tiro um pouco lento', 'Tiro lento',
  'Tiro um pouco arqueado', 'Tiro arqueado', 'Tiro menos saltitante', 'Perde o embalo rápido', 'Mira um pouco trêmula',
  'Mira trêmula', 'Barra de carga rápida', 'Barra de carga lenta', 'Divisão mais aberta', 'Duas batidas a menos',
  // 041-060
  'Sortimento da Doceria', 'Sortimento da Hora do Chá', 'Sortimento do Festival de Verão', 'Sortimento de Jogos de Antigamente', 'Sortimento de Bichos de Casa',
  'Sortimento do Zoológico', 'Sortimento de Paisagens da Floresta', 'Sortimento de Criaturas Marinhas', 'Sortimento de Veículos de Viagem', 'Sortimento de Veículos de Trabalho',
  'Sortimento de Equipamentos de Passeio', 'Sortimento de Exploração Espacial', 'Sortimento de Paisagens do Céu', 'Sortimento do Jardim de Flores', 'Sortimento de Bichinhos',
  'Sortimento do Concerto', 'Sortimento de Jogos para Todos', 'Sortimento de Café da Manhã e Marmita', 'Sortimento da Lanchonete', 'Sortimento da Cozinhinha',
  // 061-080
  'Destacar a Doceria', 'Destacar a Hora do Chá', 'Destacar o Festival de Verão', 'Destacar os Jogos de Antigamente', 'Destacar os Bichos de Casa',
  'Destacar o Zoológico', 'Destacar as Paisagens da Floresta', 'Destacar as Criaturas Marinhas', 'Destacar os Veículos de Viagem', 'Destacar os Veículos de Trabalho',
  'Destacar os Equipamentos de Passeio', 'Destacar a Exploração Espacial', 'Destacar as Paisagens do Céu', 'Destacar o Jardim de Flores', 'Destacar os Bichinhos',
  'Destacar o Concerto', 'Destacar os Jogos para Todos', 'Destacar o Café da Manhã e a Marmita', 'Destacar a Lanchonete', 'Destacar a Cozinhinha',
  // 081-100
  'Voltar ao tiro comum', 'Próximo tiro como de costume', 'Rolha grossa', 'Rolha fina', 'Tiro duplo bem próximo',
  'Tiro em três direções', 'Tiro focado em lascar', 'Tiro focado em empurrar', 'Tiro rápido mas leve', 'Igualar um prêmio a outro',
  'Um prêmio volta ao tipo original', 'Mais um do tipo que você ganhou', 'Mapa de resistência', 'Pista de mais um tipo', 'Ainda não ganho nesta partida',
  'Ver os mesmos tipos juntos', 'Ver o ciclo de movimento', 'Palpite do primeiro acerto', 'Mostrar a trajetória', 'Escala do ângulo de mira',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} rolha(s) a mais', '{n} rolha(s) a mais', '{n} rolha(s) a mais',
  'O próximo tiro lasca um pouco mais', 'O próximo tiro lasca mais',
  'O próximo tiro empurra um pouco mais', 'O próximo tiro empurra com mais força',
  'O próximo tiro ganha um pouco mais de força para lascar e empurrar', 'O próximo tiro ganha muito mais força para lascar e empurrar',
  'O próximo tiro voa um pouco mais rápido', 'O próximo tiro voa mais rápido',
  'O próximo tiro balança menos na mira', 'O próximo tiro balança bem menos na mira',
  'O próximo tiro cai um pouco menos', 'O próximo tiro voa em arco baixo',
  'O próximo tiro é saltitante', 'O próximo tiro é pesado',
  'Se dividir em seguida, ficará mais fechado', 'O próximo tiro se divide em duas direções',
  'O próximo tiro pode bater mais uma vez',
  // 021-040
  '{n} rolha(s) perdida(s)', '{n} rolha(s) perdida(s)', '{n} rolha(s) perdida(s)',
  'O próximo tiro lasca menos', 'O próximo tiro lasca bem menos',
  'O próximo tiro empurra menos', 'O próximo tiro empurra bem menos',
  'O próximo tiro lasca e empurra um pouco menos',
  'O próximo tiro voa um pouco mais devagar', 'O próximo tiro voa devagar',
  'O próximo tiro faz um arco um pouco maior', 'O próximo tiro faz um arco alto',
  'O próximo tiro salta um pouco menos', 'O próximo tiro perde o embalo rápido',
  'O próximo tiro balança um pouco mais na mira', 'O próximo tiro balança mais na mira',
  'A próxima barra de carga anda um pouco mais rápido', 'A próxima barra de carga anda devagar',
  'Se dividir em seguida, ficará mais aberto', 'O próximo tiro pode bater duas vezes a menos',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Os prêmios restantes passaram para a seleção «{series}». Os prêmios já ganhos continuam como estão'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Os prêmios de «{series}» agora têm contorno colorido e símbolo combinando. A seleção não muda'),
  // 081-100
  'O próximo tiro volta ao tiro comum', 'O próximo tiro volta ao de costume',
  'O próximo tiro tem a rolha um pouco mais grossa', 'O próximo tiro tem a rolha um pouco mais fina',
  'O próximo tiro se divide em duas direções próximas', 'O próximo tiro se divide em três direções',
  'O próximo tiro lasca mais, mas empurra menos', 'O próximo tiro empurra mais, mas lasca menos',
  'O próximo tiro é rápido, mas empurra menos',
  'Um prêmio passou a ser do mesmo tipo de outro prêmio',
  'Um prêmio voltou ao tipo com que foi colocado',
  'Um prêmio passou para o último tipo que você ganhou',
  'No próximo tiro, a resistência dos prêmios é mostrada',
  'No próximo tiro, aparece uma pista dos kits a um tipo de distância',
  'No próximo tiro, os prêmios ainda não ganhos nesta partida são marcados',
  'No próximo tiro, prêmios do mesmo tipo mostram nome e quantidade',
  'No próximo tiro, o ciclo de movimento dos prêmios móveis é mostrado',
  'No próximo tiro, aparece um guia do primeiro acerto. É só um guia e pode variar',
  'Depois, a trajetória do próximo tiro ficará mais fácil de ver',
  'No próximo tiro, aparece uma escala de ângulo na mira',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Doceria', SER02: 'Hora do Chá', SER03: 'Festival de Verão', SER04: 'Jogos de Antigamente', SER05: 'Bichos de Casa',
  SER06: 'Zoológico', SER07: 'Paisagens da Floresta', SER08: 'Criaturas Marinhas', SER09: 'Veículos de Viagem', SER10: 'Veículos de Trabalho',
  SER11: 'Equipamentos de Passeio', SER12: 'Exploração Espacial', SER13: 'Paisagens do Céu', SER14: 'Jardim de Flores', SER15: 'Bichinhos',
  SER16: 'Concerto', SER17: 'Jogos para Todos', SER18: 'Café da Manhã e Marmita', SER19: 'Lanchonete', SER20: 'Cozinhinha',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Doces]', SER02: '[Chá]', SER03: '[Festival]', SER04: '[Retrô]', SER05: '[Pets]',
  SER06: '[Zoo]', SER07: '[Floresta]', SER08: '[Mar]', SER09: '[Viagem]', SER10: '[Obras]',
  SER11: '[Passeio]', SER12: '[Espaço]', SER13: '[Céu]', SER14: '[Flores]', SER15: '[Bichos]',
  SER16: '[Música]', SER17: '[Jogos]', SER18: '[Comida]', SER19: '[Lanche]', SER20: '[Cozinha]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const PT_BR_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Mais rolhas ou um tiro diferente',
    RISK: 'Reforços ou contratempos, seja o que for',
    STOCK: 'Mudar a série de prêmios',
    GUIDE: 'Destacar prêmios de uma série',
    MIX: 'Truques e guias variados',
    CHAOS: 'Qualquer coisa, deixe com o destino',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Nenhum efeito pode ser usado agora',
    effectNotApplicable: 'Este efeito não pôde ser usado desta vez',
    noOutlineTarget: 'Não há prêmios-alvo no momento',
    sideEffectTemporaryOutsideSeries: 'Um prêmio pode ficar temporariamente fora da série',
  },
};
