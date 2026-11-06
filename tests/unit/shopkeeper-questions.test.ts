import { describe, expect, it } from 'vitest';
import { seedRng } from '../../src/catalog/rng';
import { drawQuestionOrder, groupForChoice, nextPendingQuestion, questionDef } from '../../src/core/questions';
import { EXP, expandedRun } from './expanded-helpers';

describe('question bag', () => {
  it('shuffles all 200 questions exactly once, without repeats', () => {
    const r = drawQuestionOrder(EXP, seedRng(11));
    expect(r.order).toHaveLength(200);
    expect(new Set(r.order).size).toBe(200);
    expect([...r.order].sort()).toEqual([...EXP.questions.keys()].sort());
  });

  it('is reproducible from the same stream state and differs between seeds', () => {
    const a = drawQuestionOrder(EXP, seedRng(11));
    const b = drawQuestionOrder(EXP, seedRng(11));
    expect(b.order).toEqual(a.order);
    expect(b.rng).toEqual(a.rng);
    expect(drawQuestionOrder(EXP, seedRng(12)).order).not.toEqual(a.order);
    const firsts = new Set(Array.from({ length: 50 }, (_, i) => drawQuestionOrder(EXP, seedRng(100 + i)).order[0]));
    expect(firsts.size).toBeGreaterThan(20);
  });

  it('is not the id order (a real shuffle)', () => {
    const r = drawQuestionOrder(EXP, seedRng(5)).order;
    expect(r).not.toEqual([...r].sort());
  });

  it('reading the next question is pure and returns null when the bag is empty', () => {
    const run = expandedRun(3);
    const before = JSON.stringify(run.expansion);
    for (let i = 0; i < 5; i++) expect(nextPendingQuestion(run.expansion)).toEqual({ questionId: run.expansion.questionOrder[0], cursor: 0, answer: null });
    expect(JSON.stringify(run.expansion)).toBe(before);
    expect(nextPendingQuestion({ questionOrder: run.expansion.questionOrder, questionCursor: 200 })).toBeNull();
  });

  it('even the maximum of 20 shots uses only 20 of the 200 questions, all different', () => {
    const run = expandedRun(8);
    const asked = Array.from({ length: 20 }, (_, i) => nextPendingQuestion({ ...run.expansion, questionCursor: i })!.questionId);
    expect(new Set(asked).size).toBe(20);
    expect(nextPendingQuestion({ ...run.expansion, questionCursor: 20 })).not.toBeNull();
  });

  it('every question offers two choices with different lottery groups', () => {
    for (const id of EXP.questions.keys()) {
      const a = groupForChoice(EXP, id, 'A');
      const b = groupForChoice(EXP, id, 'B');
      expect(a.groupId, id).not.toBe(b.groupId);
      expect(questionDef(EXP, id).choices.A.textKey).toBe(`exp.q.${id}.A`);
    }
  });

  it('unknown ids are rejected', () => {
    expect(() => questionDef(EXP, 'Q999' as never)).toThrow(RangeError);
  });
});
