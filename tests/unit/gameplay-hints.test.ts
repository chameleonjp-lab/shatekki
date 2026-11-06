import { describe, expect, it } from 'vitest';
import { BOOTH_LAYOUT_V2, IDENTITY_QUAT, asPrizeTypeId, asSetId, mintId, type ImpactEvent, type PrizeFrame, type SetId, type SimulationFrame } from '../../src/contracts';
import {
  TRAJECTORY_MAX_CORKS,
  TRAJECTORY_MAX_POINTS,
  TrajectoryRecorder,
  angleReadout,
  computeHintLabels,
  dashPolyline,
  duplicateGroups,
  hpPercent,
  oneMissingKinds,
  signedDeg,
  type HintContext,
} from '../../src/view/gameplay-hints';
import { boothMapModel, slotIndexOfPrize, standXForFraction } from '../../src/ui/booth-map';
import { seriesOutlineTargets } from '../../src/view/series-outline';
import { visibleXRange } from '../../src/view/camera-math';

const T = (n: number) => asPrizeTypeId(`P${String(n).padStart(3, '0')}`);
const pf = (n: number, typeNo: number, over: Partial<PrizeFrame> = {}): PrizeFrame => ({
  instanceId: mintId.instance(n),
  typeId: T(typeNo),
  position: { x: 0, y: 1, z: -1.9 },
  rotation: IDENTITY_QUAT,
  hp: 3,
  maxHp: 3,
  mounted: true,
  collected: false,
  ...over,
});
const sets = (defs: Record<string, number[]>) => new Map<SetId, { requiredTypeIds: ReturnType<typeof T>[] }>(Object.entries(defs).map(([k, v]) => [asSetId(k), { requiredTypeIds: v.map(T) }]));
const ctx = (over: Partial<HintContext>): HintContext => ({
  prizes: [],
  sets: new Map(),
  collectedTypeIds: [],
  completedSets: [],
  nameOf: (t) => `name-${t}`,
  motionOf: () => null,
  ...over,
});

describe('hints are pure', () => {
  it('give the same answer twice and never mutate their input', () => {
    const prizes = [pf(1, 1), pf(2, 1), pf(3, 2, { hp: 0 })];
    const snap = JSON.stringify(prizes);
    const c = ctx({ prizes, sets: sets({ S001: [1, 2, 3] }), collectedTypeIds: [T(2), T(3)] });
    for (const k of ['hpRatio', 'oneMissing', 'notCollectedThisRun', 'duplicates', 'motionPeriod'] as const) {
      expect(JSON.stringify(computeHintLabels(k, c))).toBe(JSON.stringify(computeHintLabels(k, c)));
    }
    expect(JSON.stringify(prizes)).toBe(snap);
    expect(computeHintLabels('aimPreview', c)).toBeNull();
  });
  it('do not touch Math.random', () => {
    const orig = Math.random;
    Math.random = () => {
      throw new Error('RNG used');
    };
    try {
      computeHintLabels('hpRatio', ctx({ prizes: [pf(1, 1)] }));
      new TrajectoryRecorder().observe({ shotId: null, projectiles: [], events: [] });
      dashPolyline([{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }]);
    } finally {
      Math.random = orig;
    }
  });
});

describe('FX093 hp ratio', () => {
  it('rounds to 0-100 and only HP 0 shows 0', () => {
    expect(hpPercent(3, 3)).toBe(100);
    expect(hpPercent(1, 3)).toBe(33);
    expect(hpPercent(1, 1000)).toBe(1);
    expect(hpPercent(0, 3)).toBe(0);
    const r = computeHintLabels('hpRatio', ctx({ prizes: [pf(1, 1), pf(2, 2, { hp: 0 }), pf(3, 3, { collected: true })] }))!;
    expect(r.labels.map((l) => [l.key, l.tone])).toEqual([['xhint.hp', 'info'], ['xhint.hp.zero', 'zero']]);
  });
});

describe('FX094 one missing', () => {
  const s = sets({ S001: [1, 2], S002: [1, 3], S003: [4, 5, 6], S004: [7, 8], S005: [9, 10] });
  const prizes = [1, 2, 3, 4, 5, 6, 7].map((n) => pf(n, n));
  it('picks the single missing kind of incomplete sets, ordered by set count then P-number, max 3', () => {
    // collected: 2, 3, 5, 6, 8, 10, 9 -> A missing 1, B missing 1, C missing 4, D missing 7, E complete-ish
    const c = ctx({ prizes, sets: s, collectedTypeIds: [2, 3, 5, 6, 8, 9, 10].map(T), completedSets: [asSetId('S005')] });
    expect(oneMissingKinds(c).map((k) => [k.typeId, k.sets])).toEqual([[T(1), 2], [T(4), 1], [T(7), 1]]);
    expect(computeHintLabels('oneMissing', c)!.labels.map((l) => l.typeId).sort()).toEqual([T(1), T(4), T(7)]);
  });
  it('limits to three kinds, only kinds on the shelf, and never names a set', () => {
    const many = sets({ S001: [1, 11], S002: [2, 11], S003: [3, 11], S004: [4, 11], S005: [12, 13] });
    const c = ctx({ prizes: [1, 2, 3, 4, 11].map((n) => pf(n, n)), sets: many, collectedTypeIds: [11, 12].map(T) });
    const kinds = oneMissingKinds(c);
    expect(kinds).toHaveLength(3);
    expect(kinds.map((k) => k.typeId)).toEqual([T(1), T(2), T(3)]);
    const r = computeHintLabels('oneMissing', c)!;
    expect(r.labels.every((l) => l.key === 'xhint.oneMissing' && l.params === undefined)).toBe(true);
    // E is missing P013 (not on the shelf): not shown; nothing about E leaks
    expect(r.labels.some((l) => l.typeId === T(13))).toBe(false);
  });
  it('is empty when no set is one kind away', () => {
    expect(computeHintLabels('oneMissing', ctx({ prizes, sets: s }))!.empty).toBe(true);
  });
});

describe('FX095 / FX096 / FX097', () => {
  it('FX095 marks uncollected-this-run kinds only', () => {
    const r = computeHintLabels('notCollectedThisRun', ctx({ prizes: [pf(1, 1), pf(2, 2)], collectedTypeIds: [T(1)] }))!;
    expect(r.labels.map((l) => l.typeId)).toEqual([T(2)]);
  });
  it('FX096 needs two or more of a kind and shows the name and count', () => {
    expect(duplicateGroups([pf(1, 1), pf(2, 2), pf(3, 1), pf(4, 1, { collected: true })]).map((g) => [g.typeId, g.count])).toEqual([[T(1), 2]]);
    const r = computeHintLabels('duplicates', ctx({ prizes: [pf(1, 1), pf(2, 1), pf(3, 2)] }))!;
    expect(r.labels.map((l) => l.params)).toEqual([{ name: 'name-P001', count: 2 }, { name: 'name-P001', count: 2 }]);
    expect(computeHintLabels('duplicates', ctx({ prizes: [pf(1, 1), pf(2, 2)] }))!.empty).toBe(true);
  });
  it('FX097 shows the running motion and period of mounted individuals only', () => {
    const motion = (id: string) => (id === mintId.instance(1) ? ({ type: 'swing', amplitudeRad: 0.2, periodSec: 3.25 } as const) : id === mintId.instance(2) ? ({ type: 'none' } as const) : ({ type: 'spin', periodSec: 4 } as const));
    const c = ctx({ prizes: [pf(1, 1), pf(2, 2), pf(3, 3, { mounted: false }), pf(4, 4)], motionOf: (id) => motion(id) });
    const r = computeHintLabels('motionPeriod', c)!;
    expect(r.labels.map((l) => [l.key, l.params])).toEqual([['xhint.motion.swing', { sec: '3.3' }], ['xhint.motion.spin', { sec: '4.0' }]]);
  });
});

describe('FX100 angles and FX098 dashes', () => {
  it('reads the effective aim relative to the stall front, rounded to degrees', () => {
    const L = BOOTH_LAYOUT_V2;
    const base = angleReadout(L, 0, { yaw: 0, pitch: 0 });
    expect(base.yawDeg).toBe(0);
    const r = angleReadout(L, 1, { yaw: (10 * Math.PI) / 180, pitch: (5 * Math.PI) / 180 });
    expect(r.yawDeg).toBe(10);
    expect(Number.isInteger(r.pitchDeg)).toBe(true);
    expect(angleReadout(L, 0, { yaw: -0.2, pitch: 0 }).yawDeg).toBe(-11);
    expect(signedDeg(3)).toBe('+3');
    expect(signedDeg(-2)).toBe('-2');
    expect(signedDeg(0)).toBe('0');
    expect(Object.is(angleReadout(L, 0, { yaw: 0.001, pitch: 0 }).yawDeg, -0)).toBe(false);
  });
  it('cuts a polyline into dashes with gaps and respects the cap', () => {
    const d = dashPolyline([{ x: 0, y: 0, z: 0 }, { x: 1.2, y: 0, z: 0 }], 0.1, 0.1, 100);
    expect(d.length).toBe(6);
    expect(d[0]!.a.x).toBe(0);
    expect(d[0]!.b.x).toBeCloseTo(0.1, 9);
    expect(d[1]!.a.x).toBeCloseTo(0.2, 9);
    expect(dashPolyline([{ x: 0, y: 0, z: 0 }, { x: 100, y: 0, z: 0 }], 0.1, 0.1, 10)).toHaveLength(10);
    expect(dashPolyline([], 0.1, 0.1)).toEqual([]);
  });
});

describe('FX099 trajectory recorder', () => {
  const shot = mintId.shot(1);
  const cork = (n: number, x: number, z = -1) => ({ projectileId: mintId.projectile(shot, n), position: { x, y: 1.2, z }, velocity: { x: 0, y: 0, z: -8 }, bulletType: 'standard' as const, powerMultiplier: 1 });
  const impact = (n: number, p: number): ImpactEvent => ({
    type: 'impact',
    eventId: mintId.event(shot, n),
    runId: mintId.run('r'),
    shotId: shot,
    projectileId: mintId.projectile(shot, p),
    target: { kind: 'surface', surfaceId: 'back-wall', material: 'wood' },
    point: { x: 0.5, y: 1, z: -2.4 },
    normal: { x: 0, y: 0, z: 1 },
    speed: 8,
    reflectionIndex: 0,
  });
  const fr = (projectiles: ReturnType<typeof cork>[], events: ImpactEvent[] = [], shotId = shot): Pick<SimulationFrame, 'shotId' | 'projectiles' | 'events'> => ({ shotId, projectiles, events });

  it('numbers corks by appearance, keeps solid trails and records real contact points once', () => {
    const r = new TrajectoryRecorder();
    r.observe(fr([cork(0, 0)]));
    r.observe(fr([cork(0, 0.1), cork(1, 0.2)], [impact(0, 0)]));
    r.observe(fr([cork(0, 0.2), cork(1, 0.3)], [impact(0, 0), impact(1, 1)]));
    const t = r.tracks();
    expect(t.map((x) => x.number)).toEqual([1, 2]);
    expect(t[0]!.points.length).toBeGreaterThanOrEqual(3);
    expect(t[0]!.reflections).toHaveLength(1); // the same event twice records once
    expect(t[1]!.reflections).toHaveLength(1);
    // the trail stays after the cork ended
    r.observe(fr([]));
    expect(r.tracks().every((x) => !x.live && x.points.length > 0)).toBe(true);
  });
  it('caps at 8 corks and 64 points per cork, keeping the whole route', () => {
    const r = new TrajectoryRecorder();
    for (let i = 0; i < 300; i++) r.observe(fr([cork(0, i * 0.05)]));
    const t = r.tracks()[0]!;
    expect(t.points.length).toBeLessThanOrEqual(TRAJECTORY_MAX_POINTS);
    expect(t.points[0]!.x).toBe(0);
    expect(t.points[t.points.length - 1]!.x).toBeCloseTo(299 * 0.05, 9);
    const r2 = new TrajectoryRecorder();
    r2.observe(fr(Array.from({ length: 12 }, (_, i) => cork(i, i))));
    expect(r2.tracks()).toHaveLength(TRAJECTORY_MAX_CORKS);
    expect(r2.dropped).toBe(4);
  });
  it('starts over for a new shot', () => {
    const r = new TrajectoryRecorder();
    r.observe(fr([cork(0, 0)]));
    r.observe(fr([cork(0, 0)], [], mintId.shot(2)));
    expect(r.tracks()).toHaveLength(1);
    expect(r.tracks()[0]!.number).toBe(1);
  });
});

describe('series outline targets', () => {
  it('follow the CURRENT kind of each uncollected individual', () => {
    const series = { typeIds: [T(1), T(2)] };
    const before = [pf(1, 1), pf(2, 5), pf(3, 2, { collected: true })];
    expect(seriesOutlineTargets(before, series)).toEqual([mintId.instance(1)]);
    // individual 2 transformed into a member; individual 1 into a non-member
    const after = [pf(1, 9), pf(2, 2), pf(4, 1)];
    expect(seriesOutlineTargets(after, series)).toEqual([mintId.instance(2), mintId.instance(4)]);
    expect(seriesOutlineTargets(after, null)).toEqual([]);
  });
});

describe('booth map model', () => {
  const L = BOOTH_LAYOUT_V2;
  const onSlot = (i: number, n: number) => pf(n, 1, { position: { x: L.slots[i]!.spawnBase.x, y: L.slots[i]!.spawnBase.y + 0.08, z: L.slots[i]!.spawnBase.z } });

  it('maps prizes to slots, marks cells used/unused and the visible range', () => {
    const cells = L.backgroundCells!.map((c, i) => ({ cellId: c.cellId, used: i === 0 || i === 35, effectId: null }));
    const m = boothMapModel({ layout: L, standX: 0, aspect: 402 / 874, prizes: [onSlot(0, 1), onSlot(13, 2), onSlot(35, 3), pf(9, 1, { position: { x: 0, y: 0.3, z: -1 } })], cells });
    expect(m.cells).toHaveLength(36);
    expect(m.cells[0]!).toMatchObject({ row: 1, column: 1, hasPrize: true, cellState: 'used' });
    expect(m.cells[13]!).toMatchObject({ row: 2, column: 2, hasPrize: true, cellState: 'unused' });
    expect(m.cells[35]!).toMatchObject({ row: 3, column: 12, hasPrize: true, cellState: 'used' });
    expect(m.prizeCount).toBe(3); // the fallen one is not on a board
    expect(m.usedCount).toBe(2);
    expect(m.view.toColumn - m.view.fromColumn + 1).toBeGreaterThanOrEqual(3);
    expect(m.view.toColumn - m.view.fromColumn + 1).toBeLessThanOrEqual(5);
    expect(m.view.fromColumn).toBeGreaterThanOrEqual(4);
  });
  it('follows the stand to both ends and ignores collected prizes', () => {
    const left = boothMapModel({ layout: L, standX: L.camera.standMinX, aspect: 0.46, prizes: [] }).view;
    const right = boothMapModel({ layout: L, standX: L.camera.standMaxX, aspect: 0.46, prizes: [] }).view;
    expect(left.fromColumn).toBe(1);
    expect(right.toColumn).toBe(12);
    expect(boothMapModel({ layout: L, standX: 0, aspect: 0.46, prizes: [{ ...onSlot(0, 1), collected: true }] }).prizeCount).toBe(0);
  });
  it('marks outlined slots and works without cells', () => {
    const m = boothMapModel({ layout: L, standX: 0, aspect: 0.46, prizes: [onSlot(5, 1)], outlined: new Set([mintId.instance(1) as string]) });
    expect(m.cells[5]!.outlined).toBe(true);
    expect(m.cells.every((c) => c.cellState === 'unused')).toBe(true);
  });
  it('slot lookup rejects positions off the boards, and a tap fraction maps to a clamped stand x', () => {
    expect(slotIndexOfPrize(L, { x: 0, y: 5, z: -1.9 })).toBeNull();
    expect(slotIndexOfPrize(L, onSlot(7, 1).position)).toBe(7);
    expect(standXForFraction(L, 0)).toBe(L.camera.standMinX);
    expect(standXForFraction(L, 1)).toBe(L.camera.standMaxX);
    expect(standXForFraction(L, 0.5)).toBeCloseTo(0, 6);
  });
  it('visible range is about three and a half columns', () => {
    const { minX, maxX } = visibleXRange(L, 0, 402 / 874);
    expect((maxX - minX) / 0.42).toBeGreaterThan(3);
    expect((maxX - minX) / 0.42).toBeLessThan(4.2);
  });
});
