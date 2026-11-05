import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ShotSummary } from '../../src/contracts';
import { classifyShot, NEAR_MISS_DISPLACEMENT_M } from '../../src/view/classify';
import { offscreenIndicator } from '../../src/view/offscreen';

const base = {
  collected: [],
  chainCount: 0,
  newlyCompletedSets: [],
  bonusAmmoGranted: 0,
  devicesActivated: [],
  transforms: [],
  ledger: { prizePoints: 0, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0 },
  prizeOutcomes: [],
  touchedFirstHitTargets: [],
};
const S = (o: Record<string, unknown>) => ({ ...base, ...o }) as unknown as ShotSummary;
const outcome = (o: Record<string, unknown>) => ({ instanceId: 'i1', typeId: 'P001', hits: [{}], collected: false, displacement: 0, endedNearEdge: false, ...o });

describe('classifyShot (only the confirmed summary)', () => {
  it('collected prizes are a success', () => {
    expect(classifyShot(S({ collected: [{}] }))).toBe('success');
  });
  it('a device that fired (no penalty) or a trick/first-hit gain is a success', () => {
    expect(classifyShot(S({ devicesActivated: ['d1'] }))).toBe('success');
    expect(classifyShot(S({ ledger: { ...base.ledger, trickPoints: 5 } }))).toBe('success');
  });
  it('a penalty-only device is not a success', () => {
    expect(classifyShot(S({ devicesActivated: ['d1'], ledger: { ...base.ledger, nominalPenalty: 10 } }))).toBe('neutral');
  });
  it('a prize that moved a lot or ended near the edge without being collected is a near miss', () => {
    expect(classifyShot(S({ prizeOutcomes: [outcome({ endedNearEdge: true })] }))).toBe('nearMiss');
    expect(classifyShot(S({ prizeOutcomes: [outcome({ displacement: NEAR_MISS_DISPLACEMENT_M })] }))).toBe('nearMiss');
  });
  it('touching only the shopkeeper is neutral (reaction, not a miss)', () => {
    expect(classifyShot(S({ touchedFirstHitTargets: ['shopkeeper:hat'] }))).toBe('neutral');
  });
  it('nothing happened, or a barely nudged prize, is a miss', () => {
    expect(classifyShot(S({}))).toBe('miss');
    expect(classifyShot(S({ prizeOutcomes: [outcome({ displacement: 0.001 })] }))).toBe('miss');
  });
  it('a shot that succeeded later by reflection is never a miss: it is judged on the settled summary', () => {
    const settled = S({ prizeOutcomes: [outcome({ displacement: 0.001 }), outcome({ instanceId: 'i2', collected: true })], collected: [{}] });
    expect(classifyShot(settled)).toBe('success');
  });
  it('does not mutate a frozen summary', () => {
    const s = Object.freeze(S({ collected: [{}] }));
    expect(() => classifyShot(s)).not.toThrow();
  });
});

describe('offscreenIndicator', () => {
  const cam = new THREE.PerspectiveCamera(60, 0.5, 0.05, 30);
  cam.position.set(0, 1.3, 0.6);
  cam.lookAt(0, 1.2, -2);
  cam.updateMatrixWorld(true);
  const W = 400;
  const H = 800;
  it('returns null for a point inside the frame', () => {
    expect(offscreenIndicator(cam, new THREE.Vector3(0, 1.2, -2), W, H)).toBeNull();
  });
  it('points right/left/up/down toward an off-screen point, clamped to the margin', () => {
    const right = offscreenIndicator(cam, new THREE.Vector3(5, 1.2, -2), W, H)!;
    expect(right.x).toBeGreaterThan(W * 0.8);
    expect(right.x).toBeLessThanOrEqual(W);
    expect(Math.abs(right.angle)).toBeLessThan(0.3);
    const left = offscreenIndicator(cam, new THREE.Vector3(-5, 1.2, -2), W, H)!;
    expect(left.x).toBeLessThan(W * 0.2);
    expect(Math.abs(Math.abs(left.angle) - Math.PI)).toBeLessThan(0.3);
    const up = offscreenIndicator(cam, new THREE.Vector3(0, 6, -2), W, H)!;
    expect(up.y).toBeLessThan(H * 0.2);
    expect(up.angle).toBeLessThan(0);
    const down = offscreenIndicator(cam, new THREE.Vector3(0, -4, -2), W, H)!;
    expect(down.y).toBeGreaterThan(H * 0.8);
  });
  it('handles points behind the camera without NaN', () => {
    const r = offscreenIndicator(cam, new THREE.Vector3(0.3, 1.2, 3), W, H)!;
    expect(r).not.toBeNull();
    expect(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.angle)).toBe(true);
    expect(r.x).toBeGreaterThanOrEqual(0);
    expect(r.x).toBeLessThanOrEqual(W);
    expect(r.y).toBeGreaterThanOrEqual(0);
    expect(r.y).toBeLessThanOrEqual(H);
  });
});
