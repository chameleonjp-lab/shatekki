import { expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  aimDirection, asPrizeTypeId, mintId, quatFromAxisAngle,
  type PrizeFrame, type PrizeInstanceState, type ShotSummary, type SlotId,
} from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';
import { spawnPrize } from '../../src/core/replenish';
import { rewardDevicesFor } from '../../src/core/rewards';
import { shapeHalfHeight } from '../../src/core/shapes';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';

const bundle = getGameplayBundle('expanded-next');
const { layout, tuning, catalog, expansion, behavior } = bundle;
const step = tuning.limits.fixedStepSec;
const lower = layout.tiers[0]!;

function prizeAt(slotId: string, typeId: string, number: number) {
  return spawnPrize(catalog, asPrizeTypeId(typeId), layout.slots.find(s => s.slotId === slotId)!, number, 0);
}

async function setup(prizes: PrizeInstanceState[], deferredSlots: SlotId[] = []) {
  const fresh = createExpandedRun(
    { seed: 7919, runId: mintId.run('shelf-acceptance'), tuning, playerName: null },
    { ...bundle, expansion: expansion! },
  );
  const world = await createShotWorld(layout, catalog, tuning, {
    rewardDevices: rewardDevicesFor(expansion!.profile.rewards ?? null), transformPolicy: behavior!.transformPolicy,
  });
  const summaries: ShotSummary[] = [];
  const collected: PrizeFrame[] = [];
  const game = new GameController({
    ...bundle, rules: CORE_RULES, world, renderer: null,
    clockPolicy: behavior!.clock, transformPolicy: behavior!.transformPolicy,
    onShotSettled: summary => summaries.push(summary),
    onChange: snapshot => collected.push(...snapshot.frame.prizes.filter(p => p.collected)),
  }, { ...fresh, shelf: { prizes, deferredSlots, nextInstanceNumber: prizes.length + 1 } });
  return { game, summaries, collected, world };
}

function aimAndFire(game: GameController, prize: PrizeInstanceState, aimingSec = 0) {
  const load = game.current.load!;
  expect(game.dispatch({ type: 'SET_POSITION', x: layout.camera.standMaxX })).toBe(false);
  expect(game.current.load).toBe(load);
  const center = prize.pose.position;
  const target = { ...center, y: center.y + shapeHalfHeight(catalog.prizes.get(prize.typeId)!.shape) * 0.5 };
  const requested = aimAt(bundle, game.current.standX, target, 'standard');
  expect(game.dispatch({ type: 'AIM', ...requested })).toBe(true);
  const initialAim = game.viewState().effectiveAim;
  if (aimingSec > 0) {
    game.frame(aimingSec);
    expect(game.viewState().effectiveAim).not.toEqual(initialAim);
  }
  const visibleAim = game.viewState().effectiveAim;
  expect(game.dispatch({ type: 'FIRE' })).toBe(true);
  const request = game.current.inFlight!.request;
  expect(request.direction).toEqual(aimDirection(layout, game.current.standX, visibleAim));
  expect(request.load).toEqual(load);
}

it('r006 keeps zero-HP, toppled and lower-board prizes; only the fallen one scores and refills', async () => {
  const piano = { ...prizeAt('slot-r3-c01', 'P082', 1), hp: 0 };
  const standing = prizeAt('slot-r3-c02', 'P083', 2);
  const blocked = layout.slots.find(s => s.slotId === 'slot-r3-c05')!;
  const guitar = { ...standing, mounted: false, pose: {
    position: { ...standing.pose.position, x: blocked.spawnBase.x, y: lower.topY + 0.025 },
    rotation: quatFromAxisAngle(0, 0, 1, Math.PI / 2),
  } };
  const upper = prizeAt('slot-r2-c03', 'P011', 3);
  const teapot = { ...upper, mounted: false, pose: { ...upper.pose, position: {
    ...upper.pose.position, y: lower.topY + shapeHalfHeight(catalog.prizes.get(upper.typeId)!.shape), z: lower.centerZ,
  } } };
  const onShelf = prizeAt('slot-r3-c04', 'P026', 4);
  // A hit near the rear lip pushes this prize off, with HP left.
  const paper = { ...onShelf, mounted: false, pose: { ...onShelf.pose, position: {
    ...onShelf.pose.position, z: lower.centerZ - lower.depth / 2 + 0.003,
  } } };
  const { game, world, summaries, collected } = await setup([piano, guitar, teapot, paper], [blocked.slotId]);
  try {
    game.dispatch({ type: 'SET_POSITION', x: paper.pose.position.x });
    expect(game.dispatch({ type: 'CONFIRM_POSITION' })).toBe(true);
    expect(game.dispatch({ type: 'STOP_LOAD' })).toBe(true);
    aimAndFire(game, paper);
    for (let frame = 0; game.current.phase === 'resolving' && frame < 2000; frame++) {
      expect(game.current.shelf.nextInstanceNumber).toBe(5);
      expect(game.current.score).toBe(0);
      game.frame(step);
      if (game.awaitingAnswer) {
        const flight = game.current.inFlight!;
        game.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: flight.shotId, questionId: flight.plan!.question!.questionId, choice: 'A' });
      }
    }
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.collected).toEqual([{ instanceId: paper.instanceId, typeId: paper.typeId, shotId: mintId.shot(1) }]);
    const below = collected.find(p => p.instanceId === paper.instanceId)!;
    expect(below.hp).toBeGreaterThan(0);
    expect(below.position.y).toBeLessThan(layout.collectBelowY);
    const remaining = game.current.shelf.prizes;
    expect(remaining.find(p => p.instanceId === piano.instanceId)).toMatchObject({ hp: 0, collected: false });
    for (const id of [guitar.instanceId, teapot.instanceId]) {
      const p = remaining.find(p => p.instanceId === id)!;
      expect(p.collected).toBe(false);
      expect(p.pose.position.y).toBeGreaterThan(lower.topY);
      expect(p.pose.position.y).toBeLessThan(layout.tiers[1]!.topY);
    }
    expect(game.current.shelf.deferredSlots).toEqual([blocked.slotId]);
    expect(remaining.find(p => p.instanceId === guitar.instanceId)!.pose.position.x).toBeCloseTo(blocked.spawnBase.x, 2);
    const replacement = remaining.find(p => p.homeSlot === paper.homeSlot)!;
    expect(replacement.instanceId).not.toBe(paper.instanceId);
    expect(replacement.hp).toBe(catalog.prizes.get(replacement.typeId)!.maxHp);
    expect(remaining.some(p => p.instanceId === paper.instanceId)).toBe(false);
    expect(summary.ledger.items.filter(i => i.kind === 'prize' && i.refId === paper.instanceId)).toHaveLength(1);
  } finally {
    world.dispose();
  }
});

it('r006 load timing changes the actual damage and initial recoil at the same aimed contact', async () => {
  const target = { ...prizeAt('slot-r3-c06', 'P082', 1), mounted: false };
  async function shoot(loadSec: number) {
    const { game, world } = await setup([target]);
    try {
      game.dispatch({ type: 'SET_POSITION', x: target.pose.position.x });
      game.dispatch({ type: 'CONFIRM_POSITION' });
      game.frame(loadSec);
      game.dispatch({ type: 'STOP_LOAD' });
      const load = game.current.load!;
      aimAndFire(game, target, 0.5);
      for (let tick = 0; tick < 120; tick++) {
        game.frame(step);
        const frame = game.snapshot().frame;
        const damage = frame.events.find(event => event.type === 'prizeDamaged' && event.instanceId === target.instanceId);
        if (damage?.type !== 'prizeDamaged') continue;
        const atContact = frame.prizes[0]!.position;
        game.frame(step);
        const next = game.snapshot().frame.prizes[0]!.position;
        return { tier: load.tier, damage: damage.hpBefore - damage.hpAfter, recoil: atContact.z - next.z };
      }
      throw new Error('aimed cork missed the piano');
    } finally {
      world.dispose();
    }
  }
  const weak = await shoot(0);
  const perfect = await shoot(tuning.loading.barPeriodSec * tuning.loading.sweetSpot / 2);
  expect(weak.tier).toBe('weak');
  expect(perfect.tier).toBe('perfect');
  expect(weak.damage).toBeGreaterThan(0);
  expect(weak.recoil).toBeGreaterThan(0);
  expect(perfect.damage).toBeGreaterThan(weak.damage);
  expect(perfect.recoil).toBeGreaterThan(weak.recoil);
});

it('r006 awards one prize when two reflected split corks strike the same instance on the same tick', async () => {
  const upper = layout.tiers[2]!;
  const base = prizeAt('slot-r1-c01', 'P062', 1);
  const top = prizeAt('slot-r1-c02', 'P082', 2);
  // Two prizes overlap at their touching faces near the upper board's back-left corner.
  const foundation = { ...base, mounted: false, pose: { ...base.pose,
    position: { x: -2.54, y: upper.topY + 0.045, z: -2.22 },
  } };
  const piano = { ...top, mounted: false, pose: { ...top.pose,
    position: { x: -2.63, y: upper.topY + 0.09 + 0.09, z: -2.27 },
  } };
  const { game, world, summaries } = await setup([foundation, piano]);
  try {
    const stand = layout.camera.standMinX;
    game.dispatch({ type: 'SET_POSITION', x: stand });
    game.dispatch({ type: 'CONFIRM_POSITION' });
    game.dispatch({ type: 'STOP_LOAD' });
    const plate = layout.devices.find(device => device.kind === 'split')!;
    const center = plate.box.center;
    const target = { x: center.x + 0.07, y: center.y - 0.055, z: center.z + 0.02 };
    game.dispatch({ type: 'AIM', ...aimAt(bundle, stand, target, 'standard') });
    expect(game.dispatch({ type: 'FIRE' })).toBe(true);
    const hitTicks: number[] = [];
    for (let frame = 0; frame < 2000 && game.current.phase === 'resolving'; frame++) {
      game.frame(step);
      for (const event of game.snapshot().frame.events) {
        if (event.type === 'impact' && event.target.kind === 'prize' && event.target.instanceId === piano.instanceId) {
          hitTicks.push(game.gameTick);
        }
      }
    }
    expect(summaries).toHaveLength(1);
    const summary = summaries[0]!;
    expect(summary.devicesActivated).toEqual([plate.deviceId]);
    const hits = summary.prizeOutcomes.find(p => p.instanceId === piano.instanceId)!.hits;
    expect(hits).toHaveLength(2);
    expect(new Set(hits.map(hit => hit.projectileId)).size).toBe(2);
    expect(hits.every(hit => hit.generation === 1 && hit.reflectionIndex > 0)).toBe(true);
    expect(hitTicks).toHaveLength(2);
    expect(hitTicks[0]).toBe(hitTicks[1]);
    expect(summary.collected.filter(p => p.instanceId === piano.instanceId)).toHaveLength(1);
    const entries = summary.ledger.items.filter(item => item.kind === 'prize' && item.refId === piano.instanceId);
    expect(entries).toEqual([{ kind: 'prize', refId: piano.instanceId, points: catalog.prizes.get(piano.typeId)!.baseScore }]);
  } finally {
    world.dispose();
  }
});
