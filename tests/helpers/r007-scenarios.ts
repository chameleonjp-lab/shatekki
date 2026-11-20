/**
 * r007 scenarios for "normal play" checks (T02/T03/T19). Each one is a stable aiming state
 * (a prepared shelf and, where needed, a consistent earlier history) plus the aim that the
 * player then sets by dragging, and the gauge time before "発射". Nothing after the start is
 * scripted: the flight, the scoring, the sets and the save all run as in a real game.
 * Not a test file. Node only (reads the catalog).
 */
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { completedSetsFor } from '../../src/catalog/sets';
import { createExpandedRun } from '../../src/core/expanded-run';
import { spawnPrize } from '../../src/core/replenish';
import { buildLedgerEntry, prizeItems } from '../../src/core/scoring';
import { asPrizeTypeId, mintId, type CollectedPrize, type ExpandedRunState, type PrizeTypeId, type SetId } from '../../src/contracts';
import { aimThrough } from './aim-v3';

export const R7 = getGameplayBundle('expanded-aim-first');
const { layout: L, catalog, tuning } = R7;

export interface Scenario {
  readonly name: string;
  readonly state: ExpandedRunState;
  readonly aim: { readonly yaw: number; readonly pitch: number };
  /** Sets already in the set book before the shot (re-completion shows the card without the seal). */
  readonly discovered: readonly SetId[];
  /** What the shot must do. */
  readonly expect: { readonly sets?: readonly SetId[]; readonly reflector?: 'fan' | 'tray'; readonly continues?: boolean };
}

function base(seed: number): ExpandedRunState {
  const s = createExpandedRun({ runId: mintId.run(`r007-scene-${seed}`), seed, tuning, playerName: null }, { catalog, tuning, layout: L, expansion: R7.expansion! });
  const r = s.expansion.rewards!;
  return { ...s, expansion: { ...s.expansion, rewards: { ...r, order: r.order ? { ...r.order, status: 'declined' } : null, bag: null } } };
}

/** An earlier history: one prize won per shot (valid ledger, collection and ammo balance). */
function withHistory(s: ExpandedRunState, won: readonly PrizeTypeId[], ammoLeft?: number): ExpandedRunState {
  let score = 0;
  const ledger: ReturnType<typeof buildLedgerEntry>[] = [];
  const collected: CollectedPrize[] = [];
  won.forEach((typeId, i) => {
    const shotId = mintId.shot(i + 1);
    const c: CollectedPrize = { instanceId: mintId.instance(900 + i), typeId, shotId };
    const entry = buildLedgerEntry(shotId, score, prizeItems([c], catalog));
    score = entry.scoreAfter;
    ledger.push(entry);
    collected.push(c);
  });
  const shots = won.length;
  const ammo = ammoLeft ?? tuning.initialAmmo - shots;
  // ammo spent beyond the history (to reach "the last cork") is counted as lost to effects
  const lost = tuning.initialAmmo - shots - ammo;
  return {
    ...s,
    shotsFired: shots,
    ammo,
    ammoLostTotal: lost,
    score,
    ledger,
    collected,
    collectedTypeIds: [...new Set(won)],
    shelf: { ...s.shelf, nextInstanceNumber: Math.max(s.shelf.nextInstanceNumber, 900 + shots) },
    expansion: { ...s.expansion, questionCursor: 0 },
  };
}

/** Put `typeId` at the back edge of a bottom-row slot, low on HP: a straight shot pushes it off behind the board. */
export const TARGET = { dy: 0.05, dz: 0.05, inset: 0.07 };
function withTarget(s: ExpandedRunState, typeId: PrizeTypeId, column = 6) {
  const slot = L.slots.find((x) => x.slotId === `slot-r3-c${String(column).padStart(2, '0')}`)!;
  const edgeZ = L.tiers[0]!.centerZ - L.tiers[0]!.depth / 2 + TARGET.inset;
  const old = s.shelf.prizes.find((p) => p.homeSlot === slot.slotId)!;
  const p = spawnPrize(catalog, typeId, slot, Number(old.instanceId.slice(1)), 0);
  const placed = { ...p, hp: Math.min(p.hp, 2), pose: { ...p.pose, position: { ...p.pose.position, z: edgeZ } } };
  const state = { ...s, shelf: { ...s.shelf, prizes: s.shelf.prizes.map((q) => (q.instanceId === old.instanceId ? placed : q)) } };
  const standX = Math.round(slot.spawnBase.x / 0.14) * 0.14;
  const aim = aimThrough(R7, standX, { x: placed.pose.position.x, y: placed.pose.position.y + TARGET.dy, z: edgeZ + TARGET.dz })!;
  return { state: { ...state, standX }, aim };
}

const still = (t: string) => catalog.prizes.get(t as PrizeTypeId)!.motion.type === 'none';

/** Kinds for a pair (a, b) and a trio (b, c, d) sharing b, all still prizes, none of a/c/d completing a set alone. */
export function pickKinds(): { a: PrizeTypeId; b: PrizeTypeId; c: PrizeTypeId; d: PrizeTypeId; pair: SetId; trio: SetId } {
  const trios = [...catalog.sets.values()].filter((x) => x.requiredTypeIds.length === 3);
  const pairs = R7.expansion!.pairSetIds.map((id) => catalog.sets.get(id)!);
  for (const t of trios) {
    for (const b of t.requiredTypeIds) {
      if (!still(b)) continue;
      const [c, d] = t.requiredTypeIds.filter((x) => x !== b) as [PrizeTypeId, PrizeTypeId];
      for (const p of pairs) {
        if (!p.requiredTypeIds.includes(b)) continue;
        const a = p.requiredTypeIds.find((x) => x !== b)!;
        if (a === c || a === d) continue;
        if (completedSetsFor(catalog, new Set([a, c, d]), []).length > 0) continue;
        const after = completedSetsFor(catalog, new Set([a, b, c, d]), []);
        if (after.length !== 2) continue;
        return { a, b, c, d, pair: p.setId, trio: t.setId };
      }
    }
  }
  throw new Error('no pair and trio share a still prize');
}

export function buildScenarios(tray = { du: -0.07, dv: 0 }): Scenario[] {
  const k = pickKinds();
  const out: Scenario[] = [];
  {
    const t = withTarget(withHistory(base(101), [k.a]), k.b);
    out.push({ name: 'pair-first', state: t.state, aim: t.aim, discovered: [], expect: { sets: [k.pair] } });
    out.push({ name: 'pair-again', state: t.state, aim: t.aim, discovered: [k.pair], expect: { sets: [k.pair] } });
  }
  {
    const t = withTarget(withHistory(base(102), [k.c, k.d]), k.b);
    out.push({ name: 'trio-first', state: t.state, aim: t.aim, discovered: [], expect: { sets: [k.trio] } });
  }
  {
    const t = withTarget(withHistory(base(103), [k.a, k.c, k.d]), k.b);
    out.push({ name: 'pair-and-trio', state: t.state, aim: t.aim, discovered: [k.trio], expect: { sets: [k.pair, k.trio].sort() } });
  }
  {
    // the last cork: the set forms, the A6 stamp (2 prizes) refills and the game goes on
    const t = withTarget(withHistory(base(104), [k.a], 1), k.b);
    out.push({ name: 'last-cork-set', state: t.state, aim: t.aim, discovered: [], expect: { sets: [k.pair], continues: true } });
  }
  for (const [name, reflector, standX, target] of [
    ['fan-take', 'fan', 2.38, (r: { center: { x: number; y: number; z: number } }) => ({ x: r.center.x, y: r.center.y + 0.04, z: r.center.z })],
    // the middle of the region that drops a bottom-row prize from this stand (searched with the real world)
    ['tray-take', 'tray', 1.96, (r: { center: { x: number; y: number; z: number } }) => ({ x: r.center.x + tray.du * Math.cos(0.66), y: r.center.y + tray.dv, z: r.center.z + tray.du * Math.sin(0.66) })],
  ] as const) {
    const s = base(name === 'fan-take' ? 105 : 106);
    // the same fixed display as the physics test: a narrow prize in all 36 slots
    const prizes = L.slots.map((slot, i) => spawnPrize(catalog, asPrizeTypeId('P009'), slot, i + 1, 0));
    const r = L.reflectors!.find((x) => x.reflectorId === reflector)!;
    const aim = aimThrough(R7, standX, target(r))!;
    out.push({ name, state: { ...s, standX, shelf: { prizes, deferredSlots: [], nextInstanceNumber: 37 } }, aim, discovered: [], expect: { reflector } });
  }
  return out;
}
