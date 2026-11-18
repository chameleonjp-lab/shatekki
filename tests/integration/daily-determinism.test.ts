import { describe, expect, it } from 'vitest';
import { FixedGameClock } from '../../src/core/game-clock';

import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { createExpandedRun } from '../../src/core/expanded-run';
import { dailyStart } from '../../src/core/daily';
import { rewardDevicesFor, rewardConfigOf } from '../../src/core/rewards';
import { mintId, type GameCommand } from '../../src/contracts';
import { expansionText } from '../../src/i18n/expansion-text';
import { questionContentFor } from '../../src/ui/shopkeeper-question';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';

describe('fixed game ticks', () => {
  it('retains substeps, discards waiting time and resumes at the saved tick', () => {
    const clock = new FixedGameClock(1 / 60, 24);
    expect(clock.advance(1 / 120, false)).toEqual([]);
    expect(clock.advance(3600, true)).toEqual([]);
    expect(clock.advance(1 / 120, false)).toEqual([]);
    expect(clock.advance(1 / 120, false)).toEqual([25]);
    expect(clock.advance(0.2, false)).toEqual(Array.from({ length: 12 }, (_, i) => 26 + i));
  });
});

async function play(dateMs: number, locale: 'ja' | 'en' | 'th', displayDt: number) {
  const b = getGameplayBundle('expanded-next');
  const { date, seed } = dailyStart(dateMs, b.catalog.rulesVersion);
  const initial = createExpandedRun({ seed, runId: mintId.run(`daily-${locale}-${displayDt}`), tuning: b.tuning, playerName: null }, { ...b, expansion: b.expansion! });
  const world = await createShotWorld(b.layout, b.catalog, b.tuning, { rewardDevices: rewardDevicesFor(rewardConfigOf(b.expansion)) });
  const shots: unknown[] = [];
  const questions: string[] = [];
  const renderedText: string[] = [];
  const c = new GameController({ ...b, rules: CORE_RULES, clockPolicy: b.behavior?.clock, world, renderer: null,
    onShotSettled(summary, state) {
      shots.push({ tick: c.gameTick, score: state.score, ammo: state.ammo, collected: summary.collected, sets: state.completedSets,
        rng: state.expansion?.rng, draw: state.draw, effects: summary.effects, ledger: summary.ledger, poses: state.shelf });
    },
  }, initial);
  const keeper = b.layout.shopkeeper.find(part => part.part === 'body')!.box.center;
  const x = b.layout.camera.standMaxX;
  const aim = aimAt(b, x, { x: keeper.x, y: 1.2, z: keeper.z + 0.1 }, 'standard');
  const inputs: { tick: number; sequence: number; command: GameCommand }[] = [];
  const record = (command: GameCommand) => {
    const tick = c.gameTick;
    const last = inputs.at(-1);
    inputs.push({ tick, sequence: last?.tick === tick ? last.sequence + 1 : 0, command });
    c.dispatch(command);
  };
  const until = (tick: number) => {
    while (c.gameTick < tick) {
      if (c.awaitingAnswer) {
        const question = c.viewState().expansion!.question!;
        const pending = questionContentFor(b.expansion!, question, key => expansionText(locale, key))!;
        renderedText.push(pending.questionText);
        questions.push(question.questionId);
        c.setEnvironmentPause(['landscape']);
        const answer = { type: 'ANSWER_SHOPKEEPER', shotId: question.shotId, questionId: question.questionId, choice: 'A' } as const;
        const frozen = c.gameTick;
        c.frame(120);
        expect(c.dispatch(answer)).toBe(false);
        expect(c.gameTick).toBe(frozen);
        c.setEnvironmentPause([]);
        c.dispatch({ type: 'RESUME', reason: 'manual' });
        record(answer);
        expect(c.dispatch(answer)).toBe(false);
      }
      c.frame(Math.min(displayDt, (tick - c.gameTick) * b.tuning.limits.fixedStepSec));
    }
  };
  try {
    for (let i = 0; i < 2; i++) {
      const start = i * 1800;
      until(start);
      record({ type: 'SET_POSITION', x });
      record({ type: 'CONFIRM_POSITION' });
      until(start + 72);
      record({ type: 'STOP_LOAD' });
      record({ type: 'AIM', ...aim });
      until(start + 132);
      record({ type: 'FIRE' });
    }
    until(3600);
    expect(shots).toHaveLength(2);
    expect(questions.length).toBeGreaterThan(0);
    return { semantics: { date, seed, shots, questions, inputs }, renderedText };
  } finally {
    world.dispose();
  }
}

it('plays two real shots at the same game ticks across nine render/locale combinations', async () => {
  const when = Date.parse('2026-11-18T23:59:00+09:00');
  const baseline = await play(when, 'ja', 1 / 60);
  for (const locale of ['ja', 'en', 'th'] as const) {
    for (const dt of [1 / 60, 1 / 30, 0.1]) {
      if (locale === 'ja' && dt === 1 / 60) continue;
      const other = await play(when, locale, dt);
      expect(other.semantics, `${locale} at ${dt}s/frame`).toEqual(baseline.semantics);
      if (locale !== 'ja') expect(other.renderedText[0]).not.toEqual(baseline.renderedText[0]);
    }
  }
}, 120_000);
