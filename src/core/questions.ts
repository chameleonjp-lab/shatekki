/**
 * Shopkeeper question bag (plan EG04, requirements §5). The 200 questions are
 * shuffled once at run start; one question per shot is taken from the front.
 * Reading functions here never touch the PRNG.
 */
import type { EffectGroupDef, ExpansionCatalog, ExpansionRunState, PendingQuestion, QuestionChoice, QuestionDef, QuestionId } from '../contracts';
import type { RngState } from '../catalog/rng';
import { shuffled } from './expansion-rng';

/** Shuffle all question ids with the questions PRNG stream (run start only). */
export function drawQuestionOrder(expansion: ExpansionCatalog, rng: RngState): { readonly order: QuestionId[]; readonly rng: RngState } {
  const ids = [...expansion.questions.keys()].sort();
  const r = shuffled(ids, rng);
  return { order: r.items, rng: r.state };
}

/** The question the next flight end would ask, or null when the bag is exhausted. Pure. */
export function nextPendingQuestion(exp: Pick<ExpansionRunState, 'questionOrder' | 'questionCursor'>): PendingQuestion | null {
  const questionId = exp.questionOrder[exp.questionCursor];
  return questionId === undefined ? null : { questionId, cursor: exp.questionCursor, answer: null };
}

export function questionDef(expansion: ExpansionCatalog, questionId: QuestionId): QuestionDef {
  const q = expansion.questions.get(questionId);
  if (!q) throw new RangeError(`unknown question: ${questionId}`);
  return q;
}

/** The lottery group a choice draws from. */
export function groupForChoice(expansion: ExpansionCatalog, questionId: QuestionId, choice: QuestionChoice): EffectGroupDef {
  const groupId = questionDef(expansion, questionId).choices[choice].groupId;
  const g = expansion.groups.get(groupId);
  if (!g) throw new RangeError(`unknown effect group: ${groupId}`);
  return g;
}
