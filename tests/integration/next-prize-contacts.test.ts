import { Group } from 'three';
import { expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { soundsForSimEvent } from '../../src/audio/sounds';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { mintId, type ShotSummary, type SimEvent } from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';
import { rewardDevicesFor } from '../../src/core/rewards';
import { createShotWorld } from '../../src/sim/world';
import { createEffects } from '../../src/view/effects';
import inputs from '../fixtures/next-seed-380112.json';

const bundle = getGameplayBundle('expanded-next');
const { layout, catalog, tuning, expansion, behavior } = bundle;
const dt = tuning.limits.fixedStepSec;

async function replay(reportPrizeContacts: boolean) {
  const initial = createExpandedRun({ runId: mintId.run('prize-contacts'), seed: 380112, tuning, playerName: null },
    { ...bundle, expansion: expansion! });
  const world = await createShotWorld(layout, catalog, tuning, {
    reportPrizeContacts, transformPolicy: behavior!.transformPolicy,
    rewardDevices: rewardDevicesFor(expansion!.profile.rewards!),
  });
  const events: { tick: number; event: SimEvent }[] = [];
  const summaries: ShotSummary[] = [];
  const game = new GameController({ ...bundle, rules: CORE_RULES, world, renderer: null,
    transformPolicy: behavior!.transformPolicy, clockPolicy: behavior!.clock,
    onSimEvents: batch => batch.forEach(event => events.push({ tick: game.gameTick, event })),
    onShotSettled: summary => summaries.push(summary),
  }, initial);
  try {
    // Three normal shots on the unmodified 36-prize shelf. The inputs include the first shot's answer.
    for (const { tick, cmd } of inputs) {
      while (game.gameTick < tick) game.frame(dt);
      expect(game.dispatch(cmd)).toBe(true);
    }
    for (let i = 0; i < 1800 && game.current.phase === 'resolving'; i++) game.frame(dt);
    expect(game.current.phase).toBe('position');
    expect(summaries).toHaveLength(3);
    const after = events.length;
    game.frame(0.5);
    expect(events).toHaveLength(after);
    return { events, summaries, state: game.current, tick: game.gameTick };
  } finally { world.dispose(); }
}

it('r006 shows and sounds each new prize or shelf impact once and keeps every physical and scoring result', async () => {
  const quiet = await replay(false), live = await replay(true);
  const contacts = live.events.flatMap(({ tick, event }) => event.type === 'prizeContact' ? [{ tick, event }] : []);
  expect(quiet.events.some(({ event }) => event.type === 'prizeContact')).toBe(false);
  expect(live.events.filter(({ event }) => event.type !== 'prizeContact')).toEqual(quiet.events);
  expect(live.summaries).toEqual(quiet.summaries);
  expect(live.state).toEqual(quiet.state);
  expect(live.tick).toBe(quiet.tick);
  expect(new Set(live.events.map(({ event }) => event.eventId)).size).toBe(live.events.length);

  // The upper prize hits the middle shelf, strikes a lower prize, then lands on the bottom shelf.
  expect(contacts.map(({ tick, event: { shotId, a, b } }) => [tick, shotId, a, b])).toEqual([
    [1258, 's03', 'i0005', null], [1303, 's03', 'i0005', 'i0029'], [1309, 's03', 'i0005', null],
  ]);
  expect(contacts[0]!.event.point.y).toBeCloseTo(layout.tiers[1]!.topY, 3);
  expect(contacts[2]!.event.point.y).toBeCloseTo(layout.tiers[0]!.topY, 3);
  const effects = createEffects({ layer: new Group(), layout, shopkeeperParts: new Map(),
    prizeObject: () => null, projectilePosition: () => null });
  try {
    for (const { tick, event } of contacts) {
      expect(event.impulse).toBeGreaterThan(0);
      expect(soundsForSimEvent(event).map(sound => sound.id)).toEqual(['chainTap']);
      effects.update(tick * dt);
      const before = effects.stats().particlesAlive;
      effects.handleEvents([event], tick * dt);
      const after = effects.stats().particlesAlive;
      expect(after).toBeGreaterThan(before);
      effects.handleEvents([event], tick * dt);
      expect(effects.stats().particlesAlive).toBe(after);
    }
  } finally { effects.dispose(); }
});
