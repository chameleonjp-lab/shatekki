/**
 * Prototype tuning (Task 03). Every number here is a PROTOTYPE starting point
 * from docs/architecture/shot-pipeline.md §7; none is approved. Changes and
 * reasons go to docs/design/tuning-log.md.
 *
 * bulletTypes: damage/push/speed/restitution are MULTIPLIERS on the cork base
 * values; extraReflections is added to limits.maxReflectionsPerCork.
 */
import type { TuningConfig } from '../contracts';

const TUNING: TuningConfig = {
  valueStatus: 'prototype',
  initialAmmo: 10,
  maxBonusAmmoTotal: 10,
  shelfSlotCount: 9,
  loading: {
    barPeriodSec: 1.4,
    sweetSpot: 0.85,
    tiers: [
      { tier: 'perfect', maxDistance: 0.05, damageMultiplier: 1.5, pushMultiplier: 1.35 },
      { tier: 'good', maxDistance: 0.15, damageMultiplier: 1.2, pushMultiplier: 1.15 },
      { tier: 'normal', maxDistance: 0.35, damageMultiplier: 1.0, pushMultiplier: 1.0 },
      { tier: 'weak', maxDistance: 1, damageMultiplier: 0.7, pushMultiplier: 0.75 },
    ],
  },
  aim: {
    calmSec: 1.2,
    baseAmplitudeRad: 0.004,
    growthRadPerSec: 0.006,
    maxAmplitudeRad: 0.05,
    bpmStart: 72,
    bpmMax: 130,
    bpmRisePerSec: 3,
  },
  cork: {
    radius: 0.011,
    massKg: 0.002,
    speed: 11,
    baseDamage: 1,
    baseImpulse: 0.035,
    restitution: 0.55,
    gravityScale: 0.6,
  },
  bulletTypes: {
    standard: { damage: 1, push: 1, speed: 1, restitution: 1, extraReflections: 0 },
    heavy: { damage: 1.3, push: 1.4, speed: 0.85, restitution: 0.8, extraReflections: 0 },
    bouncy: { damage: 0.8, push: 0.8, speed: 1, restitution: 1.3, extraReflections: 2 },
  },
  limits: {
    maxReflectionsPerCork: 8,
    maxSplitGeneration: 2,
    maxSimultaneousCorks: 8,
    maxFlightSec: 4,
    fallGraceSec: 1.2,
    settleLinearSpeed: 0.03,
    settleAngularSpeed: 0.2,
    settleHoldSec: 0.35,
    maxSettleSec: 5,
    fixedStepSec: 1 / 120,
  },
  devices: {
    splitSpreadRad: 0.35,
    powerMultiplier: 2,
    penaltyPoints: 30,
    ammoBonus: 2,
    bulletTypeCycle: ['standard', 'heavy', 'bouncy'],
  },
  hpZero: { pushMultiplier: 1.8, frictionMultiplier: 0.6 },
  scoring: {
    shopkeeperPoints: { hat: 30, fan: 20, body: 10, feet: 15 },
    hiddenTargetPoints: 40,
    chainBonusPerExtraPrize: 10,
    reflectionCollectBonus: 15,
    splitCollectBonus: 10,
  },
  draw: {
    historyWindow: 12,
    recentPenalty: 0.25,
    tierTargets: { easy: 3, normal: 4, hard: 2 },
  },
};

export const PROTOTYPE_TUNING: TuningConfig = Object.freeze(TUNING);
