/**
 * Ammo rewards of the post-#19 plan (A1-A10), shared contract (owner: Opus).
 *
 * Only an expansion profile that carries `rewards` turns any of this on. The
 * values are the plan's PROTOTYPE numbers (試作値), never adopted values. Every
 * grant goes through the same capped "add" as the effects (realAmmoAdd /
 * withAmmoAdded), after the existing post-flight effects, in the order A1 → A10.
 *
 * Plan: docs/superpowers/plans/2026-11-07-post-pr19-gameplay.md
 */
import type { PrizeInstanceId, PrizeTypeId } from './ids';
import type { Vec3 } from './geometry';
import type { DeferredTransform, PlannedEffect } from './expansion';

export const REWARD_IDS = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10'] as const;
export type RewardId = (typeof REWARD_IDS)[number];

/** The prototype numbers of one internal rules version. */
export interface RewardConfig {
  /** Which rewards this rules version runs. A version never changes this mid-run. */
  readonly enabled: readonly RewardId[];
  /** A1: the bag tied to one prize instance pays this when that instance is won. */
  readonly bonusBag: number;
  /** A2: the wind chime rung by a cork that really reflected first. */
  readonly windChime: number;
  /** A3: a prize pushed off into the seesaw tray. */
  readonly seesaw: number;
  /** A4: deposits in separate shots before the piggy bank pays. */
  readonly piggyBank: { readonly deposits: number; readonly amount: number };
  /** A5: the last-shot bullseye. The center wins when a shot touches both. */
  readonly lastShotTarget: { readonly outer: number; readonly center: number };
  /** A6: prizes won this game; each milestone pays once. */
  readonly stamps: { readonly milestones: readonly number[]; readonly amount: number };
  /** A7: prizes won in one shot. */
  readonly multiTake: { readonly two: number; readonly threePlus: number };
  /** A8: sets first completed in this game, in one shot; only the largest one pays. */
  readonly setVoucher: { readonly pair: number; readonly triple: number };
  /** A9 (= E2): the shopkeeper's order. */
  readonly order: { readonly amount: number; readonly shots: number };
  /** A10: one prize won from each zone of 1-based columns pays once. */
  readonly lanterns: { readonly amount: number; readonly zones: readonly (readonly [number, number])[] };
}

/** Where the A5 target sits, fixed when the stand is confirmed. Faces the player (+z). */
export interface RewardTargetGeometry {
  readonly center: Vec3;
  readonly outerRadius: number;
  readonly centerRadius: number;
}

/** A5 for the shot being prepared. Shown and hit-tested with exactly these numbers. */
export interface RewardTargetState {
  /** 1-based number of the shot it was placed for. */
  readonly forShot: number;
  readonly geometry: RewardTargetGeometry;
  /** The most each ring can give, already capped by the room left when it was placed. */
  readonly offered: { readonly outer: number; readonly center: number };
}

export type RewardOrderStatus = 'offered' | 'accepted' | 'declined' | 'done' | 'expired';

/** A9: one order per game, offered before the first shot. */
export interface RewardOrderState {
  readonly typeId: PrizeTypeId;
  readonly status: RewardOrderStatus;
  /** shotsFired when it was accepted (0 = before the first shot). */
  readonly acceptedAfterShots: number | null;
  /** 1-based shot number that met it, when done. */
  readonly doneOnShot: number | null;
}

/** What one reward did in one shot. `granted` is the real amount after the caps. */
export interface RewardOutcome {
  readonly id: RewardId;
  /** Identity of what triggered it (instance, ring, milestone, set, order, zone), so it never pays twice. */
  readonly key: string;
  readonly shotNumber: number;
  /** The most it could give when it triggered (what its card showed). */
  readonly offered: number;
  readonly granted: number;
}

/** A shot's confirmed summary, kept so the result reads the same after a reload. */
export interface LastShotRecord {
  readonly shotNumber: number;
  readonly effects: readonly PlannedEffect[];
  readonly deferredTransforms: readonly DeferredTransform[];
  readonly rewards: readonly RewardOutcome[];
  readonly ammoAfter: number;
}

/** Saved with the expanded run state when the rules version has rewards. */
export interface RewardRunState {
  /** A1: the instance with the bag, fixed at the start. Never moves to a refill. */
  readonly bag: { readonly instanceId: PrizeInstanceId; readonly used: boolean } | null;
  /** A5: set while the last-shot target is out for the shot being prepared or flown. */
  readonly target: RewardTargetState | null;
  readonly targetUsed: boolean;
  readonly chimeUsed: boolean;
  readonly seesawUsed: boolean;
  /** A4: shot numbers that put a cork in. */
  readonly piggyDeposits: readonly number[];
  readonly piggyDone: boolean;
  /** A6: milestones already reached. */
  readonly stampsReached: readonly number[];
  readonly order: RewardOrderState | null;
  /** A10: zone indexes lit. */
  readonly lanternsLit: readonly number[];
  readonly lanternsDone: boolean;
  /** Every outcome so far, in shot and A1 → A10 order. */
  readonly outcomes: readonly RewardOutcome[];
  readonly lastShot: LastShotRecord | null;
}

/** What the sim saw for the device rewards (A2-A4) and the target (A5). Points never come from here. */
export interface RewardContacts {
  /** A5: the best ring any cork of this shot touched. */
  readonly targetHit: 'center' | 'outer' | null;
  /** A2: a cork touched the chime after it had itself reflected off a wall or board. */
  readonly chimeAfterReflection: boolean;
  /** A3: instances that entered the seesaw tray, in order. */
  readonly seesawInstances: readonly PrizeInstanceId[];
  /** A4: true when any cork of this shot went into the slot (counted once per shot). */
  readonly piggyDeposit: boolean;
}

export const NO_REWARD_CONTACTS: RewardContacts = Object.freeze({ targetHit: null, chimeAfterReflection: false, seesawInstances: [], piggyDeposit: false });
