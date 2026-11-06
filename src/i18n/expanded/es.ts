/**
 * Spanish texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { ES_PAIR_CLUES, ES_PAIR_NAMES } from './es-pairs';
import { ES_QUESTIONS } from './es-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
ES_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
ES_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Hacen falta 2 tipos.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
ES_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Recibir 1 corcho', 'Recibir 2 corchos', 'Recibir 3 corchos', 'Disparo algo más astillador', 'Disparo muy astillador',
  'Disparo algo más empujador', 'Disparo muy empujador', 'Golpe de buena fuerza', 'Golpe de fuerza sólida', 'Disparo algo más rápido',
  'Disparo rápido', 'Puntería más firme', 'Puntería aún más firme', 'Algo menos de caída', 'Disparo de arco bajo',
  'Cambiar a disparo rebotador', 'Cambiar a disparo pesado', 'División más cerrada', 'Disparo en dos direcciones', 'Un rebote más de margen',
  // 021-040
  'Perder 1 corcho', 'Perder 2 corchos', 'Perder 3 corchos', 'Disparo que cuesta astillar', 'Disparo blando',
  'Disparo que cuesta empujar', 'Disparo que empuja poco', 'Disparo único y modesto', 'Disparo algo lento', 'Disparo lento',
  'Disparo algo arqueado', 'Disparo arqueado', 'Disparo menos rebotador', 'Pierde impulso enseguida', 'Puntería algo temblorosa',
  'Puntería temblorosa', 'Barra de carga rápida', 'Barra de carga lenta', 'División más abierta', 'Dos rebotes menos',
  // 041-060
  'Surtido de la Tienda de Dulces', 'Surtido de la Merienda de Té', 'Surtido de la Fiesta de Verano', 'Surtido de Juegos de Antaño', 'Surtido de Animales Cercanos',
  'Surtido del Zoo', 'Surtido de Paisajes del Bosque', 'Surtido de Criaturas Marinas', 'Surtido de Vehículos de Viaje', 'Surtido de Vehículos de Trabajo',
  'Surtido de Equipo de Salida', 'Surtido de Exploración Espacial', 'Surtido de Paisajes del Cielo', 'Surtido del Jardín de Flores', 'Surtido de Bichitos',
  'Surtido del Concierto', 'Surtido de Juegos para Todos', 'Surtido de Desayuno y Fiambrera', 'Surtido del Bar de Aperitivos', 'Surtido de la Cocinita',
  // 061-080
  'Señalar la Tienda de Dulces', 'Señalar la Merienda de Té', 'Señalar la Fiesta de Verano', 'Señalar los Juegos de Antaño', 'Señalar los Animales Cercanos',
  'Señalar el Zoo', 'Señalar los Paisajes del Bosque', 'Señalar las Criaturas Marinas', 'Señalar los Vehículos de Viaje', 'Señalar los Vehículos de Trabajo',
  'Señalar el Equipo de Salida', 'Señalar la Exploración Espacial', 'Señalar los Paisajes del Cielo', 'Señalar el Jardín de Flores', 'Señalar los Bichitos',
  'Señalar el Concierto', 'Señalar los Juegos para Todos', 'Señalar el Desayuno y la Fiambrera', 'Señalar el Bar de Aperitivos', 'Señalar la Cocinita',
  // 081-100
  'Volver al disparo normal', 'El próximo disparo, como siempre', 'Corcho grueso', 'Corcho fino', 'Disparo doble cercano',
  'Disparo en tres direcciones', 'Disparo centrado en astillar', 'Disparo centrado en empujar', 'Disparo rápido pero ligero', 'Igualar un premio a otro',
  'Un premio vuelve a su tipo original', 'Uno más del tipo que ganaste', 'Mapa de resistencia', 'Pista de un tipo más', 'Aún sin ganar en esta partida',
  'Ver juntos los mismos tipos', 'Ver el ciclo de movimiento', 'Pronóstico del primer impacto', 'Mostrar la trayectoria', 'Escala del ángulo de puntería',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  'Se añadieron {n} corcho(s)', 'Se añadieron {n} corcho(s)', 'Se añadieron {n} corcho(s)',
  'El próximo disparo astilla un poco más', 'El próximo disparo astilla más',
  'El próximo disparo empuja un poco más', 'El próximo disparo empuja con más fuerza',
  'El próximo disparo gana algo de fuerza para astillar y empujar', 'El próximo disparo gana mucha fuerza para astillar y empujar',
  'El próximo disparo vuela un poco más rápido', 'El próximo disparo vuela más rápido',
  'El próximo disparo se balancea menos al apuntar', 'El próximo disparo se balancea mucho menos al apuntar',
  'El próximo disparo cae un poco menos', 'El próximo disparo vuela en arco bajo',
  'El próximo disparo es rebotador', 'El próximo disparo es pesado',
  'Si se divide a continuación, quedará más cerrado', 'El próximo disparo se divide en dos direcciones',
  'El próximo disparo puede rebotar una vez más',
  // 021-040
  'Se perdieron {n} corcho(s)', 'Se perdieron {n} corcho(s)', 'Se perdieron {n} corcho(s)',
  'El próximo disparo astilla menos', 'El próximo disparo astilla mucho menos',
  'El próximo disparo empuja menos', 'El próximo disparo empuja mucho menos',
  'El próximo disparo astilla y empuja un poco menos',
  'El próximo disparo vuela un poco más despacio', 'El próximo disparo vuela despacio',
  'El próximo disparo se arquea un poco más', 'El próximo disparo se arquea alto',
  'El próximo disparo rebota un poco menos', 'El próximo disparo pierde impulso enseguida',
  'El próximo disparo se balancea un poco más al apuntar', 'El próximo disparo se balancea más al apuntar',
  'La próxima barra de carga va un poco más rápida', 'La próxima barra de carga va despacio',
  'Si se divide a continuación, quedará más abierto', 'El próximo disparo puede rebotar dos veces menos',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Los premios restantes pasaron a la selección «{series}». Los premios ya ganados se quedan como están'),
  // 061-080
  ...Array.from({ length: 20 }, () => 'Los premios de «{series}» ahora tienen un contorno de color y un símbolo a juego. La selección no cambia'),
  // 081-100
  'El próximo disparo vuelve al disparo normal', 'El próximo disparo vuelve a ser el de siempre',
  'El próximo disparo tiene el corcho algo más grueso', 'El próximo disparo tiene el corcho algo más fino',
  'El próximo disparo se divide en dos direcciones cercanas', 'El próximo disparo se divide en tres direcciones',
  'El próximo disparo astilla más pero empuja menos', 'El próximo disparo empuja más pero astilla menos',
  'El próximo disparo es rápido pero empuja menos',
  'Un premio pasó a ser del mismo tipo que otro premio',
  'Un premio volvió al tipo con el que se colocó',
  'Un premio pasó al último tipo que ganaste',
  'En el próximo disparo se muestra la resistencia de los premios',
  'En el próximo disparo aparece una pista de los sets a un tipo de distancia',
  'En el próximo disparo se marcan los premios aún no ganados en esta partida',
  'En el próximo disparo los premios del mismo tipo muestran su nombre y cantidad',
  'En el próximo disparo se muestra el ciclo de movimiento de los premios móviles',
  'En el próximo disparo aparece una guía del primer impacto. Es solo una guía y puede variar',
  'Después, la trayectoria del próximo disparo se verá con más claridad',
  'En el próximo disparo aparece una escala de ángulo en la puntería',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Tienda de Dulces', SER02: 'Merienda de Té', SER03: 'Fiesta de Verano', SER04: 'Juegos de Antaño', SER05: 'Animales Cercanos',
  SER06: 'Zoo', SER07: 'Paisajes del Bosque', SER08: 'Criaturas Marinas', SER09: 'Vehículos de Viaje', SER10: 'Vehículos de Trabajo',
  SER11: 'Equipo de Salida', SER12: 'Exploración Espacial', SER13: 'Paisajes del Cielo', SER14: 'Jardín de Flores', SER15: 'Bichitos',
  SER16: 'Concierto', SER17: 'Juegos para Todos', SER18: 'Desayuno y Fiambrera', SER19: 'Bar de Aperitivos', SER20: 'Cocinita',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Dulces]', SER02: '[Té]', SER03: '[Fiesta]', SER04: '[Retro]', SER05: '[Mascotas]',
  SER06: '[Zoo]', SER07: '[Bosque]', SER08: '[Mar]', SER09: '[Viaje]', SER10: '[Obras]',
  SER11: '[Salida]', SER12: '[Espacio]', SER13: '[Cielo]', SER14: '[Flores]', SER15: '[Bichos]',
  SER16: '[Música]', SER17: '[Juegos]', SER18: '[Comida]', SER19: '[Snacks]', SER20: '[Cocina]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const ES_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'Más corchos o un disparo distinto',
    RISK: 'Mejoras o contratiempos, salga lo que salga',
    STOCK: 'Cambiar la serie de premios',
    GUIDE: 'Señalar premios de una serie',
    MIX: 'Trucos y guías variados',
    CHAOS: 'Lo que sea, que lo decida el destino',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'Ahora mismo no se puede usar ningún efecto',
    effectNotApplicable: 'Esta vez no se pudo usar este efecto',
    noOutlineTarget: 'Ahora mismo no hay premios objetivo',
    sideEffectTemporaryOutsideSeries: 'Un premio puede quedar fuera de la serie por un momento',
  },
};
