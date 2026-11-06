import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { mintId, type AnswerShopkeeperCommand, type QuestionId, type ShotId } from '../../src/contracts';
import { LOCALES, UI_STRINGS, translate } from '../../src/i18n';
import { createExpansionTranslator, expansionText } from '../../src/i18n/expansion-text';
import { createShopkeeperQuestionPanel, questionContentFor, type QuestionPanelContent } from '../../src/ui/shopkeeper-question';
import { fakeRoot, tap, type FakeElement } from './fake-dom';

const SHOT: ShotId = mintId.shot(3);
const Q1 = 'Q007' as QuestionId;
const Q2 = 'Q101' as QuestionId;

const content = (questionId: QuestionId = Q1, shotId: ShotId = SHOT, long = false): QuestionPanelContent => ({
  shotId,
  questionId,
  questionText: long ? '長い質問文。'.repeat(120) : '屋台の名前を付けるなら？',
  choices: {
    A: { text: long ? 'とても長い選択肢。'.repeat(40) : 'よりどり景品堂', groupLabel: '品揃えのシリーズを変える' },
    B: { text: '気まぐれ一番屋', groupLabel: '全種類からおまかせ' },
  },
});

function setup(onAnswer?: (c: AnswerShopkeeperCommand) => boolean | void) {
  const root = fakeRoot();
  const commands: AnswerShopkeeperCommand[] = [];
  const panel = createShopkeeperQuestionPanel(root as unknown as HTMLElement, {
    onAnswer: (c) => {
      commands.push(c);
      return onAnswer?.(c);
    },
    t: (k, p) => translate('ja', k as never, p),
  });
  const a = root.byTestId('shopq-choice-A');
  const b = root.byTestId('shopq-choice-B');
  const overlay = root.byTestId('shopkeeper-question');
  return { root, panel, commands, a, b, overlay };
}

describe('shopkeeper question panel', () => {
  it('is hidden until shown, then shows the question and both choices with their lottery range', () => {
    const { panel, root, a, b, overlay } = setup();
    expect(overlay.hidden).toBe(true);
    panel.show(content());
    expect(overlay.hidden).toBe(false);
    expect(panel.isShown()).toBe(true);
    expect(root.byTestId('shopq-question').textContent).toBe('屋台の名前を付けるなら？');
    expect(a.textContent).toContain('よりどり景品堂');
    expect(a.textContent).toContain('品揃えのシリーズを変える');
    expect(b.textContent).toContain('気まぐれ一番屋');
    expect(b.textContent).toContain('全種類からおまかせ');
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
  });

  it('sends exactly {type, shotId, questionId, choice} once, and a double tap does not answer twice', () => {
    const { panel, commands, a, b } = setup();
    panel.show(content());
    a.dispatch('pointerdown', { pointerId: 1 });
    a.dispatch('pointerup', { pointerId: 1 });
    // both buttons are disabled the moment the first answer is accepted
    expect(a.disabled).toBe(true);
    expect(b.disabled).toBe(true);
    a.dispatch('click', { detail: 1 });
    tap(a, 2);
    tap(b, 3);
    expect(commands).toEqual([{ type: 'ANSWER_SHOPKEEPER', shotId: SHOT, questionId: Q1, choice: 'A' }]);
    expect(Object.keys(commands[0]!).sort()).toEqual(['choice', 'questionId', 'shotId', 'type']);
    expect(panel.isAnswered()).toBe(true);
  });

  it('answers B with the same shape', () => {
    const { panel, commands, b } = setup();
    panel.show(content());
    tap(b);
    expect(commands).toEqual([{ type: 'ANSWER_SHOPKEEPER', shotId: SHOT, questionId: Q1, choice: 'B' }]);
  });

  it('ignores a press that started before the panel appeared (a held fire button) and a bare pointerup', () => {
    const { panel, commands, a, b } = setup();
    // the finger was already down somewhere else; the panel appears; the finger lifts over a choice
    panel.show(content());
    a.dispatch('pointerup', { pointerId: 9 });
    b.dispatch('pointerup', { pointerId: 9 });
    a.dispatch('click', { detail: 1 });
    b.dispatch('click', { detail: 1 });
    expect(commands).toEqual([]);
    expect(a.disabled).toBe(false);
    // a different button released than the one pressed does not answer either
    a.dispatch('pointerdown', { pointerId: 4 });
    b.dispatch('pointerup', { pointerId: 4 });
    expect(commands).toEqual([]);
    // a press that slid off the button is cancelled
    a.dispatch('pointerdown', { pointerId: 5 });
    a.dispatch('pointerleave', { pointerId: 5 });
    a.dispatch('pointerup', { pointerId: 5 });
    expect(commands).toEqual([]);
    // a press that started on the previous question does not carry over to a new one
    a.dispatch('pointerdown', { pointerId: 6 });
    panel.show(content(Q2));
    a.dispatch('pointerup', { pointerId: 6 });
    expect(commands).toEqual([]);
  });

  it('accepts keyboard / screen-reader activation (click without a pointer)', () => {
    const { panel, commands, a } = setup();
    panel.show(content());
    a.dispatch('click', { detail: 0 });
    expect(commands).toHaveLength(1);
    expect(commands[0]!.choice).toBe('A');
  });

  it('keeps the answer final when the same question is shown again, and re-enables for a new question', () => {
    const { panel, commands, a, b } = setup();
    panel.show(content());
    tap(a);
    panel.show(content()); // the app re-renders on every state change
    expect(a.disabled).toBe(true);
    expect(b.disabled).toBe(true);
    panel.hide();
    expect(panel.isShown()).toBe(false);
    panel.show(content()); // still the answered question
    expect(a.disabled).toBe(true);
    // a different question (same shot is impossible; new shot) re-enables
    panel.hide();
    panel.show(content(Q2, mintId.shot(4)));
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
    tap(b);
    expect(commands.map((c) => `${c.shotId}/${c.questionId}/${c.choice}`)).toEqual([`${SHOT}/${Q1}/A`, `${mintId.shot(4)}/${Q2}/B`]);
  });

  it('re-enables when the rules reject the command (onAnswer returns false), e.g. while paused', () => {
    let accept = false;
    const { panel, commands, a, b } = setup(() => accept);
    panel.show(content());
    tap(a);
    expect(commands).toHaveLength(1);
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
    accept = true;
    tap(b);
    expect(commands).toHaveLength(2);
    expect(a.disabled && b.disabled).toBe(true);
  });

  it('shows the paused look without answering or lifting anything, then resumes', () => {
    const { panel, commands, a, overlay, root } = setup();
    panel.show(content());
    panel.setPaused(true);
    expect(overlay.dataset.paused).toBe('1');
    expect(a.disabled).toBe(true);
    expect(root.find((e) => e.className === 'shopq-paused')!.hidden).toBe(false);
    tap(a);
    expect(commands).toEqual([]);
    panel.setPaused(false);
    expect(a.disabled).toBe(false);
    tap(a);
    expect(commands).toHaveLength(1);
  });

  it('has no timer: nothing is sent however long it stays open, and it never schedules one', () => {
    const { panel, commands } = setup();
    const before = { setTimeout: globalThis.setTimeout, setInterval: globalThis.setInterval };
    let scheduled = 0;
    (globalThis as { setTimeout: unknown }).setTimeout = ((...args: unknown[]) => {
      scheduled++;
      return (before.setTimeout as (...a: unknown[]) => unknown)(...args);
    }) as typeof setTimeout;
    (globalThis as { setInterval: unknown }).setInterval = ((...args: unknown[]) => {
      scheduled++;
      return (before.setInterval as (...a: unknown[]) => unknown)(...args);
    }) as typeof setInterval;
    try {
      panel.show(content());
      panel.setPaused(true);
      panel.setPaused(false);
      panel.hide();
      panel.show(content(Q2, mintId.shot(8)));
    } finally {
      globalThis.setTimeout = before.setTimeout;
      globalThis.setInterval = before.setInterval;
    }
    expect(scheduled).toBe(0);
    expect(commands).toEqual([]);
  });

  it('does nothing when hidden or destroyed', () => {
    const { panel, commands, a, root } = setup();
    panel.show(content());
    panel.hide();
    expect(a.disabled).toBe(true);
    tap(a);
    panel.destroy();
    tap(a);
    expect(commands).toEqual([]);
    expect(root.children).toHaveLength(0);
  });

  it('treats a throwing handler as a rejection (never leaves the player stuck)', () => {
    const { panel, a, b } = setup(() => {
      throw new Error('boom');
    });
    panel.show(content());
    tap(a);
    expect(a.disabled).toBe(false);
    expect(b.disabled).toBe(false);
  });

  it('sets text only through textContent (markup in texts stays text) and keeps long texts in the panel', () => {
    const { panel, root, a } = setup();
    const evil = content();
    panel.show({ ...evil, questionText: '<img src=x onerror=alert(1)>', choices: { ...evil.choices, A: { text: '<b>A</b>', groupLabel: '<i>g</i>' } } });
    expect(root.byTestId('shopq-question').textContent).toBe('<img src=x onerror=alert(1)>');
    expect(a.textContent).toContain('<b>A</b>');
    expect(root.all((e) => e.tagName === 'img' || e.tagName === 'b')).toEqual([]);
    panel.show(content(Q2, mintId.shot(5), true));
    expect(root.byTestId('shopq-question').textContent.length).toBeGreaterThan(500);
    expect(a.disabled).toBe(false);
  });

  it('hides an empty range label instead of showing a bare caption', () => {
    const { panel, root } = setup();
    panel.show({ ...content(), choices: { A: { text: 'a', groupLabel: '' }, B: { text: 'b', groupLabel: 'x' } } });
    const ranges = root.all((e) => e.className === 'shopq-range');
    expect(ranges.map((r) => r.hidden)).toEqual([true, false]);
  });
});

describe('question content from the expanded catalog', () => {
  const exp = getGameplayBundle('expanded-proposed').expansion!;
  const tr = createExpansionTranslator(() => 'ja', (k, p) => translate('ja', k as never, p));

  it('builds the 200 questions with both choice texts and a range label for the group, in Japanese until translated', () => {
    let n = 0;
    for (const qid of exp.questions.keys()) {
      const c = questionContentFor(exp, { shotId: SHOT, questionId: qid }, (k) => tr(k))!;
      expect(c.questionText.length, qid).toBeGreaterThan(0);
      for (const side of ['A', 'B'] as const) {
        expect(c.choices[side].text.length, `${qid}.${side}`).toBeGreaterThan(0);
        expect(c.choices[side].groupLabel.length, `${qid}.${side} range`).toBeGreaterThan(0);
        expect(c.choices[side].text).not.toMatch(/^exp\./);
      }
      n++;
    }
    expect(n).toBe(200);
    const q1 = questionContentFor(exp, { shotId: SHOT, questionId: 'Q001' as QuestionId }, (k) => tr(k))!;
    expect(q1.questionText).toBe('屋台の入口、どちらから見て回る？');
    expect(q1.choices.A.groupLabel).toBe('同じシリーズの景品を見つける');
    expect(q1.choices.B.groupLabel).toBe('品揃えのシリーズを変える');
    expect(questionContentFor(exp, { shotId: SHOT, questionId: 'Q999' as QuestionId }, (k) => tr(k))).toBeNull();
  });

  it('falls back to Japanese for every locale and never returns a raw key for known content', () => {
    for (const loc of LOCALES) {
      expect(expansionText(loc, 'exp.series.SER01.label')).toBe('お菓子屋さん');
      expect(expansionText(loc, 'exp.series.SER01.symbol')).toBe('[菓]');
    }
    expect(expansionText('en', 'exp.fx.FX093.name')).toBe('耐久の見取り図');
    expect(expansionText('en', 'exp.unknown')).toBe('');
    expect(tr('shopq.title')).toBe(UI_STRINGS.ja['shopq.title']);
  });
});

describe('panel strings', () => {
  const KEYS = ['shopq.title', 'shopq.hint', 'shopq.choiceA', 'shopq.choiceB', 'shopq.range', 'shopq.answered', 'shopq.paused', 'shopq.noEffect'] as const;
  it('exist in all 15 locales and keep the {range} placeholder where the original has it', () => {
    for (const loc of LOCALES) {
      for (const k of KEYS) expect(UI_STRINGS[loc][k].trim().length, `${loc}:${k}`).toBeGreaterThan(0);
      expect(UI_STRINGS[loc]['shopq.range'], loc).toContain('{range}');
    }
  });
  it('states the exact Japanese texts required by the plan', () => {
    expect(UI_STRINGS.ja['series.noTarget']).toBe('対象の景品は今はありません');
    expect(UI_STRINGS.ja['shopq.noEffect']).toBe('今は使える効果がありません');
    expect(UI_STRINGS.ja['xhint.oneMissing']).toBe('あと1種');
    expect(UI_STRINGS.ja['xhint.notCollected']).toBe('今回未獲得');
    expect(UI_STRINGS.ja['xhint.aim']).toBe('目安');
  });
});

export type { FakeElement };
