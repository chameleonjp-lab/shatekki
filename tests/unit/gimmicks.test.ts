import { describe, expect, it } from 'vitest';
import {
  MAX_POWER_MULTIPLIER,
  createTransformChooser,
  deviceEffects,
  grantBonusAmmo,
  nextBulletType,
  nextPowerMultiplier,
  splitVelocities,
  transformedHp,
} from '../../src/core/gimmicks';
import { mintId, type DeviceActivation } from '../../src/contracts';
import { CAT, T, fired, newRun } from './helpers';

describe('power', () => {
  it('multiplies by powerMultiplier and caps at 4', () => {
    expect(nextPowerMultiplier(1, T)).toBe(2);
    expect(nextPowerMultiplier(2, T)).toBe(4);
    expect(nextPowerMultiplier(4, T)).toBe(MAX_POWER_MULTIPLIER);
    expect(nextPowerMultiplier(3, { ...T, devices: { ...T.devices, powerMultiplier: 10 } })).toBe(4);
  });
});

describe('split directions', () => {
  it('produces two distinct corks fanned by the spread, same speed, never into the surface (head-on too)', () => {
    const n = { x: 0, y: 0, z: 1 };
    const v = { x: 0, y: 0, z: 5 }; // straight back from the plate
    const [a, b] = splitVelocities(v, n, 0.35);
    expect(a).not.toEqual(b);
    expect(Math.hypot(a.x, a.y, a.z)).toBeCloseTo(5);
    expect(Math.hypot(b.x, b.y, b.z)).toBeCloseTo(5);
    expect(Math.abs(Math.atan2(a.x, a.z))).toBeCloseTo(0.35);
    expect(Math.abs(Math.atan2(b.x, b.z))).toBeCloseTo(0.35);
    expect(Math.sign(a.x)).toBe(-Math.sign(b.x));
    const grazing = splitVelocities({ x: 5, y: 0, z: 0.1 }, n, 0.35);
    for (const c of grazing) expect(c.z).toBeGreaterThanOrEqual(0);
  });
  it('fans about x when the cork goes straight up', () => {
    const [a, b] = splitVelocities({ x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, 0.3);
    expect(a.z).not.toBeCloseTo(b.z);
  });
});

describe('transform HP (decision 32)', () => {
  it('keeps the ratio and rounds: 2/8 -> max 20 -> 5', () => {
    expect(transformedHp(2, 8, 20)).toBe(5);
    expect(transformedHp(8, 8, 3)).toBe(3);
    expect(transformedHp(0, 8, 20)).toBe(0);
    expect(transformedHp(3, 8, 2)).toBe(1); // 0.75 -> round(0.75)
  });
  it('never exceeds the new max or goes negative', () => {
    expect(transformedHp(99, 8, 5)).toBe(5);
    expect(transformedHp(-1, 8, 5)).toBe(0);
    expect(transformedHp(1, 0, 5)).toBe(0);
  });
});

describe('bullet type and ammo bonus', () => {
  it('cycles per tuning', () => {
    expect(nextBulletType('standard', T)).toBe('heavy');
    expect(nextBulletType('heavy', T)).toBe('bouncy');
    expect(nextBulletType('bouncy', T)).toBe('standard');
  });
  it('AC17: cumulative 8 -> +2 -> 10 -> further +2 grants 0', () => {
    expect(grantBonusAmmo(2, 8, T)).toBe(2);
    expect(grantBonusAmmo(2, 10, T)).toBe(0);
    expect(grantBonusAmmo(2, 9, T)).toBe(1);
    expect(grantBonusAmmo(2, 0, T)).toBe(2);
  });
});

describe('deviceEffects', () => {
  const act = (id: string, kind: DeviceActivation['kind']): DeviceActivation => ({
    deviceId: mintId.device(id),
    kind,
    projectileId: mintId.projectile(mintId.shot(1), 0),
  });
  it('turns activations into ammo request, penalties and bullet change; split/power/transform ask nothing', () => {
    const e = deviceEffects([act('a', 'ammo'), act('p', 'penalty'), act('b', 'bulletType'), act('s', 'split'), act('w', 'power'), act('t', 'transform')], T);
    expect(e.bonusAmmoRequested).toBe(T.devices.ammoBonus);
    expect(e.penalties).toEqual([{ deviceId: 'p', points: T.devices.penaltyPoints }]);
    expect(e.bulletTypeChanged).toBe(true);
  });
  it('counts a device once even if listed twice (decision 31 defense)', () => {
    const e = deviceEffects([act('a', 'ammo'), act('a', 'ammo'), act('p', 'penalty'), act('p', 'penalty')], T);
    expect(e.bonusAmmoRequested).toBe(T.devices.ammoBonus);
    expect(e.penalties).toHaveLength(1);
  });
});

describe('createTransformChooser (prototype rule O08)', () => {
  const s = fired(newRun(7));
  const cands = s.shelf.prizes;
  it('is deterministic from (seed, shotId) and independent of candidate order', () => {
    const a = createTransformChooser(s, CAT)(cands);
    const b = createTransformChooser(s, CAT)([...cands].reverse());
    expect(a).not.toBeNull();
    expect(a).toEqual(b);
  });
  it('varies across seeds; the target is a different type from the catalog', () => {
    const targets = new Set<string>();
    const picked = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const st = fired(newRun(seed));
      const r = createTransformChooser(st, CAT)(st.shelf.prizes)!;
      const cur = st.shelf.prizes.find((p) => p.instanceId === r.instanceId)!;
      expect(r.toTypeId).not.toBe(cur.typeId);
      expect(CAT.prizes.has(r.toTypeId)).toBe(true);
      targets.add(r.toTypeId);
      picked.add(r.instanceId);
    }
    expect(targets.size).toBeGreaterThan(20);
    expect(picked.size).toBeGreaterThan(4);
  });
  it('never picks collected or mounted prizes, and returns null with no eligible prize', () => {
    const ch = createTransformChooser(s, CAT);
    const [first, second, third] = cands;
    expect(ch([{ ...first!, mounted: true }, { ...second!, collected: true }])).toBeNull();
    expect(ch([{ ...first!, mounted: true }, { ...third!, mounted: false, collected: false }])?.instanceId).toBe(third!.instanceId);
  });
});
