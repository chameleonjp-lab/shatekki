import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  BASE_SHOT_MODIFIERS, FESTIVAL_BELLS, FESTIVAL_BELL_PRIZE, FESTIVAL_ENCORE, FESTIVAL_EYES, FESTIVAL_FUSE, FESTIVAL_LANTERNS,
  FESTIVAL_PAIR, FESTIVAL_POINTS, GIANT_SLIDE_LIMIT, INITIAL_FESTIVAL, festivalBellOrder, giantTarget,
  isExpandedRunState, type ExpandedRunState, type FestivalMark, type GameCommand, type ShotSummary, type Vec3,
} from '../../src/contracts';
import { rewardConfigOf, rewardDevicesFor } from '../../src/core/rewards';
import { validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import { aimThrough } from '../helpers/aim-v3';
import { buildScenarios } from '../helpers/r007-scenarios';

const bundle = getGameplayBundle('expanded-festival');
const { catalog, layout, tuning, expansion } = bundle;
const fixture = buildScenarios().find(sc => sc.name === 'fan-take')!.state;
if (!isExpandedRunState(fixture)) throw new Error('expected the full fixture shelf');

const initial: ExpandedRunState = {
  ...fixture, rulesVersion: catalog.rulesVersion,
  expansion: { ...fixture.expansion, festival: INITIAL_FESTIVAL },
};

async function session(state: ExpandedRunState = initial) {
  const world = await createShotWorld(layout, catalog, tuning, {
    festival: true, rewardDevices: rewardDevicesFor(rewardConfigOf(expansion)),
  });
  const summaries: ShotSummary[] = [];
  const game = new GameController({ world, catalog, layout, tuning, expansion, renderer: null, rules: CORE_RULES, clockPolicy: 'fixed',
    onShotSettled: summary => summaries.push(summary) }, state);
  const command = (input: GameCommand) => expect(game.dispatch(input), JSON.stringify(input)).toBe(true);
  const shot = (stand: number, yaw: number, pitch: number) => {
    const i = summaries.length;
    if (game.current.standX !== stand) command({ type: 'SET_POSITION', x: stand });
    if (game.current.aim.yaw !== yaw || game.current.aim.pitch !== pitch) command({ type: 'AIM', yaw, pitch });
    command({ type: 'OPEN_GAUGE' });
    for (let frame = 0; frame < 36; frame++) game.frame(1 / 60);
    command({ type: 'FIRE' });
    for (let frame = 0; frame < 1000 && summaries.length === i; frame++) {
      if (game.awaitingAnswer) {
        const flight = game.current.inFlight!;
        command({ type: 'ANSWER_SHOPKEEPER', shotId: flight.shotId, questionId: flight.plan!.question!.questionId, choice: 'A' });
      }
      game.frame(1 / 60);
    }
    const summary = summaries[i];
    expect(summary).toBeDefined();
    expect(validateRunState(game.current, catalog, tuning, layout, expansion)).toBeNull();
    return summary!;
  };
  return {
    game, world, command, shot,
    aimed(stand: number, center: Vec3) {
      const aim = aimThrough(bundle, stand, center)!;
      expect(aim).toBeTruthy();
      return shot(stand, aim.yaw, aim.pitch);
    },
  };
}
const mark = (shot: ShotSummary, name: FestivalMark) => shot.festival?.signals.find(event => event.mark === name);
const points = (shot: ShotSummary, name: string) => shot.ledger.items.find(item => item.refId === `festival:${name}:${shot.shotId}`)?.points;
const triple = (state: ExpandedRunState, bulletType: 'standard' | 'bouncy' = 'standard'): ExpandedRunState => ({
  ...state, bulletType, expansion: {
    ...state.expansion, next: { ...state.expansion.next, modifiers: { ...BASE_SHOT_MODIFIERS, launch: { count: 3, spreadRad: .175 } } },
  },
});

describe('r008 festival gimmicks through real flight and settlement', () => {
  it('#31 scores three distinct lanterns on one shot and the cork keeps flying', async () => {
    const s = await session();
    try {
      const shot = s.aimed(0, FESTIVAL_LANTERNS[1].center);
      expect(shot.festival?.signals.filter(event => event.mark === 'lantern').map(event => event.amount)).toEqual([1, 2, 3]);
      expect(points(shot, 'relay')).toBe(FESTIVAL_POINTS.relay);
      expect(shot.facts?.representative).toBeTruthy();
    } finally { s.world.dispose(); }
  });

  it('#34 identifies only indirectly hit prizes in their real collection order', async () => {
    const s = await session(triple(initial, 'bouncy'));
    try {
      const shot = s.shot(-1.1330687064956873, -.23825402430957188, .22293714322266164);
      expect(shot.festival?.domino.map(step => [step.instanceId, step.via])).toEqual([
        ['i0025', 'i0002'], ['i0014', 'i0002'],
      ]);
      expect(shot.prizeOutcomes.find(prize => prize.instanceId === 'i0002')?.hits.length).toBeGreaterThan(0);
    } finally { s.world.dispose(); }
  });

  it('#35 requires both targets in the same shot', async () => {
    const single = await session();
    const group = await session(triple(initial));
    try {
      expect(mark(single.aimed(-.42, FESTIVAL_PAIR[0].center), 'red-white')).toBeUndefined();
      expect(mark(single.aimed(.42, FESTIVAL_PAIR[1].center), 'red-white')).toBeUndefined();
      const shot = group.aimed(0, { ...FESTIVAL_PAIR[0].center, x: 0 });
      expect(mark(shot, 'red-white')).toBeDefined();
    } finally { single.world.dispose(); group.world.dispose(); }
  });

  it('#36 follows seeded bell order, resets on a wrong note, unlocks and pays the target once', async () => {
    const s = await session();
    try {
      const sequence = festivalBellOrder(initial.seed).map(id => FESTIVAL_BELLS.find(bell => bell.id === id)!);
      expect(mark(s.aimed(sequence[1]!.center.x, sequence[1]!.center), 'bell-wrong')).toBeDefined();
      for (const [i, bell] of sequence.entries()) {
        const cut = s.aimed(bell.center.x, bell.center);
        expect(mark(cut, 'bell')?.amount).toBe(i + 1);
        expect(mark(cut, 'bell-open') !== undefined).toBe(i === 2);
      }
      expect(points(s.aimed(FESTIVAL_BELL_PRIZE.center.x, FESTIVAL_BELL_PRIZE.center), 'bell-prize')).toBe(FESTIVAL_POINTS.bellPrize);
      expect(points(s.aimed(FESTIVAL_BELL_PRIZE.center.x, FESTIVAL_BELL_PRIZE.center), 'bell-prize')).toBeUndefined();
    } finally { s.world.dispose(); }
  });

  it('#37 fills separate eyes and completes only once', async () => {
    const s = await session();
    try {
      const one = s.aimed(FESTIVAL_EYES[0].center.x, FESTIVAL_EYES[0].center);
      expect(one.festival?.progress.eyes).toBe(1);
      expect(mark(one, 'daruma')).toBeUndefined();
      const two = s.aimed(FESTIVAL_EYES[1].center.x, FESTIVAL_EYES[1].center);
      expect(two.festival?.progress.eyes).toBe(3);
      expect(mark(two, 'daruma')).toBeDefined();
      expect(mark(s.aimed(FESTIVAL_EYES[1].center.x, FESTIVAL_EYES[1].center), 'daruma')).toBeUndefined();
    } finally { s.world.dispose(); }
  });

  it('#38 accumulates motion from separate hits until the giant crosses its rail', async () => {
    const s = await session();
    try {
      let slide = 0;
      let drop = 0;
      for (let i = 0; i < 9 && !drop; i++) {
        const target = giantTarget(slide);
        const shot = s.aimed(target.center.x, target.center);
        const distance = mark(shot, 'giant-slide')?.amount ?? 0;
        expect(distance).toBeGreaterThan(0);
        slide += distance;
        drop += points(shot, 'giant') ?? 0;
        if (i === 0) expect(drop).toBe(0);
      }
      expect(slide).toBeCloseTo(GIANT_SLIDE_LIMIT);
      expect(drop).toBe(FESTIVAL_POINTS.giant);
      const target = giantTarget(slide);
      expect(points(s.aimed(target.center.x, target.center), 'giant')).toBeUndefined();
    } finally { s.world.dispose(); }
  });

  it('#39 lights the fuse from a reflected cork once per run', async () => {
    const s = await session();
    try {
      const shot = s.aimed(FESTIVAL_FUSE.center.x, FESTIVAL_FUSE.center);
      expect(mark(shot, 'fuse')?.amount).toBeGreaterThanOrEqual(1);
      expect(mark(s.aimed(FESTIVAL_FUSE.center.x, FESTIVAL_FUSE.center), 'fuse')).toBeUndefined();
    } finally { s.world.dispose(); }
  });

  it('#40 offers after a real order take, then scores only the accepted next cork', async () => {
    const ordered = { ...initial, expansion: {
      ...initial.expansion, rewards: { ...initial.expansion.rewards!, order: {
        typeId: initial.shelf.prizes[0]!.typeId, status: 'offered' as const, acceptedAfterShots: null, doneOnShot: null,
      } },
    } };
    const s = await session(ordered);
    try {
      s.command({ type: 'ORDER', accept: true });
      const fan = layout.reflectors!.find(reflector => reflector.reflectorId === 'fan')!;
      const take = s.aimed(2.4, { ...fan.center, x: fan.center.x - .025, y: fan.center.y + .06 });
      expect(take.collected.length).toBeGreaterThan(0);
      expect(s.game.current.expansion?.festival?.encore).toBe('offered');
      expect(s.game.dispatch({ type: 'OPEN_GAUGE' })).toBe(false);
      const offered = s.game.current;
      const ammo = offered.ammo;
      const ctx = { layout, tuning, catalog, expansion };
      const declined = CORE_RULES.reduceGame(offered, { type: 'FESTIVAL_ENCORE', accept: false }, ctx);
      expect(declined.expansion?.festival?.encore).toBe('declined');
      expect(declined).toMatchObject({ ammo, standX: offered.standX, aim: offered.aim });
      expect(CORE_RULES.reduceGame(declined, { type: 'FESTIVAL_ENCORE', accept: true }, ctx)).toBe(declined);
      s.command({ type: 'FESTIVAL_ENCORE', accept: true });
      expect(s.game.current).toMatchObject({ ammo, standX: 0, aim: { yaw: 0, pitch: 0 } });
      expect(s.game.current.expansion?.festival?.encore).toBe('ready');
      expect(s.game.dispatch({ type: 'FESTIVAL_ENCORE', accept: true })).toBe(false);
      expect(points(s.aimed(0, FESTIVAL_ENCORE.center), 'encore')).toBe(FESTIVAL_POINTS.encore);
      expect(s.game.current.expansion?.festival?.encore).toBe('spent');
      expect(points(s.aimed(0, FESTIVAL_ENCORE.center), 'encore')).toBeUndefined();
    } finally { s.world.dispose(); }
  });
});
