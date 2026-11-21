import { expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import type { ImpactEvent, ShotSummary } from '../../src/contracts';
import { validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import { aimThrough } from '../helpers/aim-v3';
import { buildScenarios } from '../helpers/r007-scenarios';

const previous = getGameplayBundle('expanded-aim-first');
const festival = getGameplayBundle('expanded-festival');

it('enables the challenge rules only in the separately saved, internal r008 bundle', () => {
  expect(festival.catalog.rulesVersion).toBe('rules-v2-proposed-r008');
  expect(festival.tuning.valueStatus).toBe('prototype');
  expect(festival.expansion?.profile.festivalChallenges).toBe(true);
  expect(previous.expansion?.profile.festivalChallenges).toBeUndefined();
  expect(festival.layout).toBe(previous.layout);
});

it('awards the fan-to-tray challenge from an actual shot after the collection settles', async () => {
  const { layout, catalog, tuning, expansion } = festival;
  const { state } = buildScenarios().find(sc => sc.name === 'fan-take')!;
  const fan = layout.reflectors!.find(reflector => reflector.reflectorId === 'fan')!;
  const origin = 2.08;
  const aim = aimThrough(festival, origin, { ...fan.center, x: fan.center.x - .035, y: fan.center.y + .08 })!;
  const initial = { ...state, rulesVersion: catalog.rulesVersion, standX: origin };
  expect(validateRunState(initial, catalog, tuning, layout, expansion)).toBeNull();
  const world = await createShotWorld(layout, catalog, tuning);
  const impacts: ImpactEvent[] = [];
  const summaries: ShotSummary[] = [];
  const game = new GameController({
    world, renderer: null, catalog, tuning, layout, expansion, rules: CORE_RULES, clockPolicy: 'fixed',
    onShotSettled: summary => summaries.push(summary),
    onSimEvents: events => impacts.push(...events.filter((event): event is ImpactEvent => event.type === 'impact')),
  }, initial);
  try {
    expect(game.dispatch({ type: 'AIM', ...aim })).toBe(true);
    expect(game.dispatch({ type: 'OPEN_GAUGE' })).toBe(true);
    for (let tick = 0; tick < 36; tick++) game.frame(1 / 60);
    expect(game.dispatch({ type: 'FIRE' })).toBe(true);
    for (let tick = 0; tick < 1000 && summaries.length === 0; tick++) {
      if (game.awaitingAnswer) {
        const flight = game.current.inFlight!;
        game.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: flight.shotId, questionId: flight.plan!.question!.questionId, choice: 'A' });
      }
      game.frame(1 / 60);
    }
    const summary = summaries[0]!;
    expect(summary).toBeDefined();
    const fanIndex = impacts.findIndex(event => event.target.kind === 'shopkeeper' && event.target.part === 'fan' && event.target.face === 'front');
    expect(fanIndex).toBeGreaterThanOrEqual(0);
    const fanCork = impacts[fanIndex]!.projectileId;
    const trayIndex = impacts.findIndex(event => event.projectileId === fanCork && event.target.kind === 'surface' && event.target.surfaceId === 'reflector-tray');
    expect(trayIndex, JSON.stringify(impacts.map(event => event.target))).toBeGreaterThan(fanIndex);
    expect(summary.collected.length).toBeGreaterThan(0);
    expect(summary.festivalChallenges).toContain('fan-tray');
  } finally {
    world.dispose();
  }
});
