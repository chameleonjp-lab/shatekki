import { describe, expect, it } from 'vitest';
import { classifyLoad } from '../../src/core/loading';
import { shapeHalfHeight } from '../../src/core/shapes';
import { createShotWorld } from '../../src/sim/world';
import {
  BOOTH_LAYOUT,
  IDENTITY_QUAT,
  asPrizeTypeId,
  quatFromAxisAngle,
  type PrizeFrame,
  type PrizeInstanceState,
  type ShelfState,
  type ShotRecord,
  type ShotRequest,
  type ShotWorld,
} from '../../src/contracts';
import { CAT, T, ballisticDir, makeRequest, newRun, runShot, shelfOf, shotCtx, unit } from './helpers';

const muzzle = { x: 0, y: 1.25, z: -0.3 };
const half = (id: string) => shapeHalfHeight(CAT.prizes.get(asPrizeTypeId(id))!.shape);

/** Fire and step, also returning every prize frame that was flagged collected. */
function runWithFrames(world: ShotWorld, request: ShotRequest): { record: ShotRecord; collectedFrames: PrizeFrame[] } {
  world.fire(request, shotCtx);
  const collectedFrames: PrizeFrame[] = [];
  for (let i = 0; i < 5000; i++) {
    const s = world.step(1 / 60);
    collectedFrames.push(...s.frame.prizes.filter((p) => p.collected));
    if (s.record) return { record: s.record, collectedFrames };
  }
  throw new Error('shot did not finish');
}

const aimAtPrize = (p: PrizeInstanceState, up = 0.5) =>
  ballisticDir(muzzle, { x: p.pose.position.x, y: p.pose.position.y + half(p.typeId) * up, z: p.pose.position.z + 0.04 });

const withPose = (p: PrizeInstanceState, patch: Partial<PrizeInstanceState['pose']['position']>): PrizeInstanceState => ({
  ...p,
  pose: { ...p.pose, position: { ...p.pose.position, ...patch } },
});

describe('collection rules in the physics world', () => {
  it('HP 0 alone is not a collection (decision 06)', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const shelf = shelfOf([['t0c1', 'P082']]); // the piano: heavy, does not leave the shelf
    world.syncShelf(shelf, 0);
    let target = shelf.prizes[0]!;
    let zeroShot = -1;
    for (let i = 1; i <= 12; i++) {
      const { record } = runWithFrames(world, makeRequest({ direction: aimAtPrize(target) }, i));
      const rp = record.remainingPrizes[0];
      if (rp && rp.hp === 0) {
        zeroShot = i;
        expect(record.collected).toEqual([]); // reached 0 HP, still on the shelf
        expect(rp.collected).toBe(false);
        expect(rp.pose.position.y).toBeGreaterThan(BOOTH_LAYOUT.collectBelowY);
        break;
      }
      if (!rp) break;
      target = rp;
    }
    expect(zeroShot).toBeGreaterThan(1); // it took several hits to wear it down
    world.dispose();
  });

  it('a prize pushed off the shelf with HP left is collected, once, and leaves the world', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const base = shelfOf([['t0c1', 'P026']]); // light paper balloon
    const p = withPose(base.prizes[0]!, { z: BOOTH_LAYOUT.slots.find((s) => s.slotId === 't0c1')!.spawnBase.z - 0.1 }); // near the back edge
    world.syncShelf({ ...base, prizes: [p] }, 0);
    const { record, collectedFrames } = runWithFrames(world, makeRequest({ direction: aimAtPrize(p) }));
    expect(record.collected).toEqual([{ instanceId: p.instanceId, typeId: p.typeId }]);
    expect(record.remainingPrizes).toEqual([]);
    expect(collectedFrames).toHaveLength(1);
    expect(collectedFrames[0]!.hp).toBeGreaterThan(0); // collected with HP left
    expect(collectedFrames[0]!.position.y).toBeLessThan(BOOTH_LAYOUT.collectBelowY);
    const out = record.prizeOutcomes.find((o) => o.instanceId === p.instanceId)!;
    expect(out.collected).toBe(true);
    expect(out.hits.length).toBeGreaterThanOrEqual(1);
    // gone from the world: a later shot at the same spot cannot collect it again
    expect(world.frame().prizes).toEqual([]);
    const again = runShot(world, makeRequest({ direction: aimAtPrize(p) }, 2));
    expect(again.record.collected).toEqual([]);
    world.dispose();
  });

  it('a prize resting on a lower shelf board, or lying toppled on its shelf, is not collected', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const base = shelfOf([
      ['t1c1', 'P011'], // teapot, home slot on tier 1 ...
      ['t0c0', 'P083'], // guitar
    ]);
    const t0 = BOOTH_LAYOUT.tiers[0]!;
    const teapot = withPose(base.prizes[0]!, { x: 0.3, y: t0.topY + half('P011'), z: t0.centerZ }); // ... but now resting on the lowest board
    const guitar: PrizeInstanceState = {
      ...base.prizes[1]!,
      pose: {
        position: { x: -0.4, y: t0.topY + 0.02 + 0.001, z: t0.centerZ },
        rotation: quatFromAxisAngle(0, 0, 1, Math.PI / 2), // lying on its side
      },
    };
    world.syncShelf({ ...base, prizes: [teapot, guitar] }, 0);
    // a shot that hits neither
    const run = runShot(world, makeRequest({ direction: unit({ x: 0, y: 0.1, z: -1 }) }));
    expect(run.record.collected).toEqual([]);
    expect(run.record.remainingPrizes).toHaveLength(2);
    for (const r of run.record.remainingPrizes) {
      expect(r.pose.position.y).toBeGreaterThan(BOOTH_LAYOUT.collectBelowY);
      expect(r.collected).toBe(false);
    }
    world.dispose();
  });

  it('property: over many random shots, collected and remaining never overlap, each instance is collected once, remaining stay above the collection line', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    let seed = 99;
    const rnd = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 0x100000000;
    };
    let totalCollected = 0;
    for (let i = 0; i < 25; i++) {
      const run = newRun(100 + i);
      world.syncShelf(run.shelf, 0);
      const t = run.shelf.prizes[Math.floor(rnd() * 9)]!;
      const dir = ballisticDir(muzzle, { x: t.pose.position.x + (rnd() - 0.5) * 0.1, y: t.pose.position.y + rnd() * 0.1, z: t.pose.position.z });
      const bullet = (['standard', 'heavy', 'bouncy'] as const)[i % 3]!;
      const { record, collectedFrames } = runWithFrames(world, makeRequest({ direction: dir, bulletType: bullet }, i + 1));
      const ids = record.collected.map((c) => c.instanceId);
      expect(new Set(ids).size).toBe(ids.length);
      for (const r of record.remainingPrizes) {
        expect(ids).not.toContain(r.instanceId);
        expect(r.pose.position.y).toBeGreaterThanOrEqual(BOOTH_LAYOUT.collectBelowY);
      }
      for (const f of collectedFrames) expect(f.position.y).toBeLessThan(BOOTH_LAYOUT.collectBelowY);
      expect(record.collected.length + record.remainingPrizes.length).toBe(9);
      totalCollected += ids.length;
    }
    expect(totalCollected).toBeGreaterThan(0); // the scenario really exercises collections
    world.dispose();
  });
});

describe('damage, push and HP 0 in the physics world', () => {
  const shootOnce = async (prize: PrizeInstanceState, load: ShotRequest['load']) => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    world.syncShelf({ prizes: [prize], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    const run = runShot(world, makeRequest({ direction: aimAtPrize(prize), load }));
    world.dispose();
    return run.record;
  };
  const perfect = classifyLoad(T.loading.sweetSpot, T);
  const weak = classifyLoad(0, T);

  it('load quality changes both the damage dealt and the push (decision 07)', async () => {
    const tree = shelfOf([['t0c1', 'P042']]).prizes[0]!;
    const a = await shootOnce(tree, perfect);
    const b = await shootOnce(tree, weak);
    const da = a.prizeOutcomes[0]!.hits[0]!.damage;
    const db = b.prizeOutcomes[0]!.hits[0]!.damage;
    expect(da / db).toBeCloseTo(perfect.damageMultiplier / weak.damageMultiplier, 1);
    expect(a.prizeOutcomes[0]!.displacement).toBeGreaterThan(b.prizeOutcomes[0]!.displacement);
  });

  it('HP 0 makes the prize easier to push (more push, less friction)', async () => {
    const tree = shelfOf([['t0c1', 'P042']]).prizes[0]!;
    const healthy = await shootOnce(tree, perfect);
    const broken = await shootOnce({ ...tree, hp: 0 }, perfect);
    expect(broken.prizeOutcomes[0]!.displacement).toBeGreaterThan(healthy.prizeOutcomes[0]!.displacement * 1.5);
  });

  it('a weak hit alone does not tear a mounted prize off; it detaches only when its HP reaches 0', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const goldfish = shelfOf([['t0c1', 'P023']]).prizes[0]!; // slides, maxHp 3
    world.syncShelf({ prizes: [goldfish], deferredSlots: [], nextInstanceNumber: 2 }, 0);
    let finalShot = -1;
    for (let i = 1; i <= 12 && finalShot < 0; i++) {
      const pos = world.frame().prizes[0]!.position;
      const target = { ...goldfish, pose: { position: pos, rotation: IDENTITY_QUAT } };
      const { record, collectedFrames } = runWithFrames(world, makeRequest({ direction: aimAtPrize(target, 0.2), load: weak }, i));
      const rp = record.remainingPrizes[0];
      if (rp && rp.mounted) {
        expect(rp.hp).toBeGreaterThan(0); // still held by its mount, with HP left
        continue;
      }
      finalShot = i;
      // HP 0 detached it (it may then have been pushed off and collected in the same shot)
      if (rp) expect(rp.hp).toBe(0);
      else expect(collectedFrames[0]!.mounted).toBe(false);
    }
    expect(finalShot).toBeGreaterThan(2);
    world.dispose();
  });

  it('a perfect hit tears a mounted prize off and it is no longer mounted', async () => {
    const world = await createShotWorld(BOOTH_LAYOUT, CAT, T);
    const shelf: ShelfState = shelfOf([['t0c1', 'P023']]);
    world.syncShelf(shelf, 0);
    const pos = world.frame().prizes[0]!.position;
    const { record } = runWithFrames(world, makeRequest({ direction: aimAtPrize({ ...shelf.prizes[0]!, pose: { position: pos, rotation: IDENTITY_QUAT } }), load: perfect }));
    const rp = record.remainingPrizes[0];
    expect(rp === undefined || rp.mounted === false).toBe(true);
    world.dispose();
  });
});
