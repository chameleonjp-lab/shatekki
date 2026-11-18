import { expect } from 'vitest';
import { BASE_SHOT_MODIFIERS, asPrizeTypeId, isAmmoBalanced, mintId, type EffectId, type ExpandedRunState, type GameplayBundle, type QuestionId } from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';
import { spawnPrize } from '../../src/core/replenish';

export interface Aim {
  readonly standX: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly count: 1 | 2 | 3;
  readonly spreadRad: number;
}

export interface Setup {
  readonly seed: number;
  readonly aim: Aim;
  readonly ammo?: number;
  readonly bonus?: number;
  /** effect on each cell id; the others keep their drawn effect */
  readonly cells?: Readonly<Record<string, EffectId>>;
  readonly question?: QuestionId;
  /** kinds standing at the front edge of tier 0 (they fall when an assortment change reshapes them) */
  readonly edgeKinds?: readonly string[];
  /** Horizontal distance inside the board edge, in metres. */
  readonly edgeInset?: number;
}

export const EDGE_KINDS = ['P001', 'P002', 'P003', 'P004', 'P005', 'P007', 'P008', 'P009', 'P010', 'P011', 'P012', 'P097'];

export function buildState(bundle: GameplayBundle, s: Setup): ExpandedRunState {
  const EXP = bundle.expansion!;
  const L = bundle.layout;
  const INITIAL = bundle.tuning.initialAmmo;
  const base = createExpandedRun({ runId: mintId.run(`run-acc-${s.seed}`), seed: s.seed, tuning: bundle.tuning, playerName: null }, { ...bundle, expansion: EXP });
  const ammo = s.ammo ?? 1;
  const bonus = s.bonus ?? 0;
  const edgeZ = L.tiers[0]!.centerZ + L.tiers[0]!.depth / 2 - (s.edgeInset ?? 0.005);
  const kinds = s.edgeKinds ?? [];
  const prizes = kinds.map((k, i) => {
    const slot = L.slots.find((x) => x.slotId === `slot-r3-c${String(i + 1).padStart(2, '0')}`)!;
    const p = spawnPrize(bundle.catalog, asPrizeTypeId(k), slot, i + 1, 0);
    return { ...p, hp: Math.min(p.hp, 2), pose: { ...p.pose, position: { ...p.pose.position, z: edgeZ } } };
  });
  const order = s.question ? [s.question, ...base.expansion.questionOrder.filter((q) => q !== s.question)] : base.expansion.questionOrder;
  const state: ExpandedRunState = {
    ...base,
    bonusAmmoTotal: bonus,
    shotsFired: INITIAL + bonus - ammo,
    ammo,
    shelf: { prizes, deferredSlots: [], nextInstanceNumber: prizes.length + 1 },
    expansion: {
      ...base.expansion,
      questionOrder: order,
      cells: base.expansion.cells.map((c) => (s.cells?.[c.cellId] ? { ...c, effectId: s.cells[c.cellId]! } : c)),
      next: { modifiers: { ...BASE_SHOT_MODIFIERS, launch: { count: s.aim.count, spreadRad: s.aim.spreadRad } }, hint: null },
    },
  };
  expect(isAmmoBalanced(state, INITIAL)).toBe(true);
  return state;
}

