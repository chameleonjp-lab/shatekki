import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PROTOTYPE_TUNING } from '../../src/catalog/config';
import { aimToDirection, clampAim, effectiveAim, heartBpm, heartPulse, swayAmplitude, swayOffset } from '../../src/core/aim';
import { classifyLoad, loadingBarValue } from '../../src/core/loading';
import { BOOTH_LAYOUT, type RunState } from '../../src/contracts';

const T = PROTOTYPE_TUNING;
type S = Pick<RunState, 'seed' | 'shotsFired' | 'clocks' | 'aim'>;
const st = (aimingSec: number, over: Partial<S> = {}): S => ({
  seed: 11,
  shotsFired: 0,
  aim: { yaw: 0, pitch: 0 },
  clocks: { loadingSec: 0, aimingSec, heartPhase: (aimingSec * heartBpm(aimingSec, T)) / 60, motionSec: 0 },
  ...over,
});

describe('loading bar and classification', () => {
  it('is a triangle wave 0 -> 1 -> 0 with the configured period', () => {
    const P = T.loading.barPeriodSec;
    expect(loadingBarValue(0, T)).toBe(0);
    expect(loadingBarValue(P / 4, T)).toBeCloseTo(0.5);
    expect(loadingBarValue(P / 2, T)).toBeCloseTo(1);
    expect(loadingBarValue((3 * P) / 4, T)).toBeCloseTo(0.5);
    expect(loadingBarValue(P, T)).toBeCloseTo(0);
    expect(loadingBarValue(P * 7.25, T)).toBeCloseTo(0.5);
    for (let t = 0; t < 10; t += 0.013) {
      const v = loadingBarValue(t, T);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('classifies by distance to the sweet spot using the tier table', () => {
    const s = T.loading.sweetSpot;
    expect(classifyLoad(s, T).tier).toBe('perfect');
    expect(classifyLoad(s - 0.05, T).tier).toBe('perfect');
    expect(classifyLoad(s - 0.1, T).tier).toBe('good');
    expect(classifyLoad(s - 0.3, T).tier).toBe('normal');
    expect(classifyLoad(0, T).tier).toBe('weak');
    expect(classifyLoad(1, T).tier).toBe('good');
    expect(classifyLoad(Number.NaN, T).tier).toBe('weak');
  });

  it('load quality changes BOTH the damage and the push multiplier (decision 07)', () => {
    const perfect = classifyLoad(T.loading.sweetSpot, T);
    const normal = classifyLoad(T.loading.sweetSpot - 0.3, T);
    const weak = classifyLoad(0, T);
    expect(perfect.damageMultiplier).toBeGreaterThan(normal.damageMultiplier);
    expect(perfect.pushMultiplier).toBeGreaterThan(normal.pushMultiplier);
    expect(weak.damageMultiplier).toBeLessThan(normal.damageMultiplier);
    expect(weak.pushMultiplier).toBeLessThan(normal.pushMultiplier);
    expect(normal.damageMultiplier).toBe(1);
    expect(normal.pushMultiplier).toBe(1);
  });
});

describe('sway', () => {
  it('has a calm period at the base amplitude, then grows up to a cap', () => {
    expect(swayAmplitude(0, T)).toBe(T.aim.baseAmplitudeRad);
    expect(swayAmplitude(T.aim.calmSec, T)).toBe(T.aim.baseAmplitudeRad);
    expect(swayAmplitude(T.aim.calmSec + 1, T)).toBeCloseTo(T.aim.baseAmplitudeRad + T.aim.growthRadPerSec);
    let prev = 0;
    for (let t = 0; t < 30; t += 0.25) {
      const a = swayAmplitude(t, T);
      expect(a).toBeGreaterThanOrEqual(prev);
      expect(a).toBeLessThanOrEqual(T.aim.maxAmplitudeRad);
      prev = a;
    }
    expect(swayAmplitude(1000, T)).toBe(T.aim.maxAmplitudeRad);
  });

  it('the actual wobble grows with aiming time', () => {
    const peak = (from: number) => {
      let m = 0;
      for (let t = from; t < from + 1; t += 0.01) {
        const o = swayOffset(st(t), T);
        m = Math.max(m, Math.abs(o.yaw), Math.abs(o.pitch));
      }
      return m;
    };
    expect(peak(10)).toBeGreaterThan(peak(0) * 3);
    expect(peak(0)).toBeLessThanOrEqual(T.aim.baseAmplitudeRad * 1.6 + 1e-12);
  });

  it('is deterministic from the seed and shot number, and varies between shots/seeds', () => {
    expect(swayOffset(st(5), T)).toEqual(swayOffset(st(5), T));
    expect(swayOffset(st(5), T)).not.toEqual(swayOffset(st(5, { seed: 12 }), T));
    expect(swayOffset(st(5), T)).not.toEqual(swayOffset(st(5, { shotsFired: 1 }), T));
  });

  it('heartbeat: starts at bpmStart, rises, is capped; the pulse is once per beat', () => {
    expect(heartBpm(0, T)).toBe(T.aim.bpmStart);
    expect(heartBpm(10, T)).toBe(T.aim.bpmStart + 10 * T.aim.bpmRisePerSec);
    expect(heartBpm(1000, T)).toBe(T.aim.bpmMax);
    expect(heartPulse(0.25)).toBeCloseTo(1);
    expect(heartPulse(0.75)).toBe(0);
    expect(heartPulse(3.25)).toBeCloseTo(1);
  });

  it('uses no real heart-rate sensor or device API', () => {
    const src = readFileSync('src/core/aim.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const word of ['navigator', 'Bluetooth', 'HealthKit', 'DeviceMotion', 'Sensor', 'getUserMedia', 'window', 'document']) {
      expect(src.includes(word), word).toBe(false);
    }
  });
});

describe('aim direction', () => {
  it('zero aim points from the muzzle to the aim target', () => {
    for (const x of [-0.45, 0, 0.3]) {
      const d = aimToDirection(x, { yaw: 0, pitch: 0 });
      const m = { x, y: BOOTH_LAYOUT.camera.muzzle.y, z: BOOTH_LAYOUT.camera.muzzle.z };
      const t = BOOTH_LAYOUT.camera.aimTarget;
      const v = { x: 0, y: t.y - m.y, z: t.z - m.z };
      const len = Math.hypot(v.x, v.y, v.z);
      expect(d.x).toBeCloseTo(0, 12);
      expect(d.y).toBeCloseTo(v.y / len, 12);
      expect(d.z).toBeCloseTo(v.z / len, 12);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
    }
  });

  it('positive yaw turns right (+x), positive pitch turns up (+y); the result is a unit vector', () => {
    const z = aimToDirection(0, { yaw: 0, pitch: 0 });
    const r = aimToDirection(0, { yaw: 0.2, pitch: 0 });
    const u = aimToDirection(0, { yaw: 0, pitch: 0.2 });
    expect(r.x).toBeGreaterThan(0);
    expect(r.z).toBeLessThan(0);
    expect(u.y).toBeGreaterThan(z.y);
    for (const d of [r, u]) expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 12);
  });

  it('the fire direction equals the direction of the visible effective aim', () => {
    const s = st(4.2, { aim: { yaw: 0.05, pitch: -0.02 } });
    const e = effectiveAim(s, T);
    const o = swayOffset(s, T);
    expect(e.yaw).toBeCloseTo(0.05 + o.yaw, 15);
    expect(e.pitch).toBeCloseTo(-0.02 + o.pitch, 15);
    // inverse check: recover yaw/pitch from the direction (no hidden extra offset)
    const d = aimToDirection(0.1, e);
    const yawBack = Math.atan2(d.x, -d.z);
    expect(yawBack).toBeCloseTo(e.yaw, 12);
  });

  it('clampAim limits to the camera rig', () => {
    const c = BOOTH_LAYOUT.camera;
    expect(clampAim({ yaw: 9, pitch: 9 })).toEqual({ yaw: c.yawLimit, pitch: c.pitchMax });
    expect(clampAim({ yaw: -9, pitch: -9 })).toEqual({ yaw: -c.yawLimit, pitch: c.pitchMin });
  });
});
