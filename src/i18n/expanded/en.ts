/**
 * English texts of the expanded gameplay (complete). Machine-written by Claude,
 * not native-reviewed. Series symbols are short bracketed words and are the same
 * for the same series everywhere.
 */
import { EN_PAIR_CLUES, EN_PAIR_NAMES } from './en-pairs';
import { EN_QUESTIONS } from './en-questions';
import type { ExpandedLocaleContent, ExpandedQuestionText } from './types';

const pad = (n: number, w: number): string => String(n).padStart(w, '0');

const pairNames: Record<string, string> = {};
const pairHints: Record<string, string> = {};
EN_PAIR_NAMES.forEach((n, i) => {
  pairNames[`PAIR${pad(i + 1, 3)}`] = n;
});
EN_PAIR_CLUES.forEach((c, i) => {
  pairHints[`PAIR${pad(i + 1, 3)}`] = `${c}. Needs 2 kinds.`;
});

const questions: Record<string, ExpandedQuestionText> = {};
EN_QUESTIONS.forEach(([text, A, B], i) => {
  questions[`Q${pad(i + 1, 3)}`] = { text, A, B };
});

/** FX001-FX100 names, in order. */
const EFFECT_NAMES: readonly string[] = [
  // 001-020
  'Get 1 shot', 'Get 2 shots', 'Get 3 shots', 'Slightly chipping shot', 'Strongly chipping shot',
  'Slightly pushing shot', 'Strongly pushing shot', 'Decent power hit', 'Solid power hit', 'Slightly fast shot',
  'Fast shot', 'Steadier aim', 'Even steadier aim', 'Slightly less drop', 'Low arcing shot',
  'Switch to bouncy shot', 'Switch to heavy shot', 'Tighter split', 'Two-way shot', 'One more bounce to spare',
  // 021-040
  'Drop 1 shot', 'Drop 2 shots', 'Drop 3 shots', 'Hard-to-chip shot', 'Soft shot',
  'Hard-to-push shot', 'Lightly pushing shot', 'Modest single shot', 'Slightly slow shot', 'Slow shot',
  'Slightly arcing shot', 'Arcing shot', 'Less bouncy shot', 'Quickly losing momentum', 'Slightly shaky aim',
  'Shaky aim', 'Fast loading bar', 'Slow loading bar', 'Wider split', 'Two fewer bounces',
  // 041-060
  'Sweet Shop stock', 'Tea Party stock', 'Summer Festival stock', 'Old-Time Games stock', 'Familiar Animals stock',
  'Zoo stock', 'Forest Scenery stock', 'Sea Creatures stock', 'Travel Vehicles stock', 'Working Vehicles stock',
  'Outing Gear stock', 'Space Exploration stock', 'Sky Scenery stock', 'Flower Garden stock', 'Tiny Bugs stock',
  'Concert stock', 'Games for Everyone stock', 'Breakfast and Lunch Box stock', 'Snack Bar stock', 'Toy Kitchen stock',
  // 061-080
  'Spot the Sweet Shop', 'Spot the Tea Party', 'Spot the Summer Festival', 'Spot Old-Time Games', 'Spot Familiar Animals',
  'Spot the Zoo', 'Spot Forest Scenery', 'Spot Sea Creatures', 'Spot Travel Vehicles', 'Spot Working Vehicles',
  'Spot Outing Gear', 'Spot Space Exploration', 'Spot Sky Scenery', 'Spot the Flower Garden', 'Spot Tiny Bugs',
  'Spot the Concert', 'Spot Games for Everyone', 'Spot Breakfast and Lunch Box', 'Spot the Snack Bar', 'Spot the Toy Kitchen',
  // 081-100
  'Back to the plain shot', 'Next shot as usual', 'Thick cork', 'Thin cork', 'Close two-way shot',
  'Three-way shot', 'Chip-focused shot', 'Push-focused shot', 'Fast but light shot', 'Make one prize a match',
  'One prize back to its original kind', 'One more of the kind you won', 'Durability map', 'Hint for one more kind', 'Not yet won this game',
  'See same kinds together', 'See the motion cycle', 'Guess of the first hit', 'Show the flight path', 'Aim angle scale',
];

/** FX001-FX100 result lines. `{n}` = real amount, `{series}` = series label. */
const EFFECT_RESULTS: readonly string[] = [
  // 001-020
  '{n} more shot(s) added', '{n} more shot(s) added', '{n} more shot(s) added',
  'The next shot chips a little more', 'The next shot chips more',
  'The next shot pushes a little more', 'The next shot pushes harder',
  'The next shot gets a bit more chipping and pushing power', 'The next shot gets much more chipping and pushing power',
  'The next shot flies a little faster', 'The next shot flies faster',
  'The next shot has less aim sway', 'The next shot has much less aim sway',
  'The next shot drops a little less', 'The next shot flies in a low arc',
  'The next shot is a bouncy shot', 'The next shot is a heavy shot',
  'If it splits next, the spread will be narrower', 'The next shot splits into two directions',
  'The next shot can bounce one more time',
  // 021-040
  '{n} shot(s) lost', '{n} shot(s) lost', '{n} shot(s) lost',
  'The next shot chips less', 'The next shot chips much less',
  'The next shot pushes less', 'The next shot pushes much less',
  'The next shot chips and pushes a little less',
  'The next shot flies a little slower', 'The next shot flies slowly',
  'The next shot arcs a little more', 'The next shot arcs high',
  'The next shot bounces a little less', 'The next shot loses momentum quickly',
  'The next shot has a little more aim sway', 'The next shot has more aim sway',
  'The next loading bar moves a little faster', 'The next loading bar moves slowly',
  'If it splits next, the spread will be wider', 'The next shot can bounce two fewer times',
  // 041-060
  ...Array.from({ length: 20 }, () => 'Remaining prizes were changed to the "{series}" lineup. Prizes already won stay as they are'),
  // 061-080
  ...Array.from({ length: 20 }, () => '"{series}" prizes now have a matching colored outline and symbol. The lineup is unchanged'),
  // 081-100
  'The next shot goes back to the plain shot', 'The next shot goes back to the usual',
  'The next shot has a slightly thicker cork', 'The next shot has a slightly thinner cork',
  'The next shot splits into two close directions', 'The next shot splits into three directions',
  'The next shot chips more but pushes less', 'The next shot pushes more but chips less',
  'The next shot is fast but pushes less',
  'One prize was changed to match another prize\'s kind',
  'One prize was returned to the kind it was placed as',
  'One prize was changed to the kind you won last',
  'For the next shot, prize durability is shown',
  'For the next shot, a hint appears for sets one kind away',
  'For the next shot, prizes not yet won this game are marked',
  'For the next shot, same-kind prizes show their name and count',
  'For the next shot, the motion cycle of moving prizes is shown',
  'For the next shot, a guide to the first hit appears. It is only a guide and may differ',
  'The path of the next shot will be shown more clearly afterward',
  'For the next shot, an angle scale appears on the aim',
];

const seriesLabels: Record<string, string> = {
  SER01: 'Sweet Shop', SER02: 'Tea Party', SER03: 'Summer Festival', SER04: 'Old-Time Games', SER05: 'Familiar Animals',
  SER06: 'Zoo', SER07: 'Forest Scenery', SER08: 'Sea Creatures', SER09: 'Travel Vehicles', SER10: 'Working Vehicles',
  SER11: 'Outing Gear', SER12: 'Space Exploration', SER13: 'Sky Scenery', SER14: 'Flower Garden', SER15: 'Tiny Bugs',
  SER16: 'Concert', SER17: 'Games for Everyone', SER18: 'Breakfast and Lunch Box', SER19: 'Snack Bar', SER20: 'Toy Kitchen',
};

const seriesSymbols: Record<string, string> = {
  SER01: '[Sweets]', SER02: '[Tea]', SER03: '[Festival]', SER04: '[Retro]', SER05: '[Pets]',
  SER06: '[Zoo]', SER07: '[Forest]', SER08: '[Sea]', SER09: '[Travel]', SER10: '[Trucks]',
  SER11: '[Outing]', SER12: '[Space]', SER13: '[Sky]', SER14: '[Flowers]', SER15: '[Bugs]',
  SER16: '[Music]', SER17: '[Games]', SER18: '[Meals]', SER19: '[Snacks]', SER20: '[Kitchen]',
};

const effectNames: Record<string, string> = {};
EFFECT_NAMES.forEach((n, i) => {
  effectNames[`FX${pad(i + 1, 3)}`] = n;
});
const effectResults: Record<string, string> = {};
EFFECT_RESULTS.forEach((r, i) => {
  effectResults[`FX${pad(i + 1, 3)}`] = r;
});

export const EN_CONTENT: ExpandedLocaleContent = {
  pairNames,
  pairHints,
  questions,
  groups: {
    GAIN: 'More shots, or a different shot',
    RISK: 'Shot boosts or setbacks, either way',
    STOCK: 'Change the prize series',
    GUIDE: 'Spot prizes of one series',
    MIX: 'Assorted tricks and guides',
    CHAOS: 'Anything at all, leave it to fate',
  },
  effectNames,
  effectResults,
  seriesLabels,
  seriesSymbols,
  lines: {
    noApplicableEffect: 'No effect can be used right now',
    effectNotApplicable: 'This effect could not be used this time',
    noOutlineTarget: 'There are no target prizes right now',
    sideEffectTemporaryOutsideSeries: 'A prize may be temporarily outside the series',
  },
};
