import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { GameController, type RulesApi } from '../../src/app/controller';
import {
  BOOTH_LAYOUT,
  asPrizeTypeId,
  mintId,
  type DeviceKind,
  type ImpactEvent,
  type ImpactTarget,
  type RunState,
  type RuntimeCatalog,
  type ShotRecord,
  type ShotSummary,
  type ShotWorld,
  type SimEvent,
  type SimulationFrame,
  type TuningConfig,
  type PrizeTransformedEvent,
} from '../../src/contracts';
import { createEffects, type EffectsHud, type OffscreenCue } from '../../src/view/effects';

const P = (x: number, y: number, z: number) => ({ x, y, z });
let n = 0;
const eid = () => mintId.event(mintId.shot(1), ++n);
function impact(target: ImpactTarget, point = P(0, 1.2, -1.9), over: Partial<ImpactEvent> = {}): ImpactEvent {
  return {
    type: 'impact',
    eventId: eid(),
    runId: mintId.run('r'),
    shotId: mintId.shot(1),
    projectileId: mintId.projectile(mintId.shot(1), 0),
    target,
    point,
    normal: P(0, 0, 1),
    speed: 8,
    reflectionIndex: 0,
    ...over,
  };
}
const prizeT = (material: 'wood' | 'glass' | 'rubber' = 'wood'): ImpactTarget => ({ kind: 'prize', instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), material });
const dev = (kind: DeviceKind): (typeof BOOTH_LAYOUT.devices)[number] => BOOTH_LAYOUT.devices.find((d) => d.kind === kind)!;
const devEvent = (kind: DeviceKind): SimEvent => ({
  type: 'deviceActivated',
  eventId: eid(),
  shotId: mintId.shot(1),
  deviceId: dev(kind).deviceId,
  deviceKind: kind,
  projectileId: mintId.projectile(mintId.shot(1), 0),
});

function setup(opts: { camera?: THREE.PerspectiveCamera; hud?: EffectsHud } = {}) {
  const layer = new THREE.Group();
  const parts = new Map<string, THREE.Mesh>();
  for (const p of BOOTH_LAYOUT.shopkeeper) parts.set(p.part, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
  const prize = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1));
  prize.position.set(0, 1.2, -1.9);
  const fx = createEffects({
    layer,
    layout: BOOTH_LAYOUT,
    shopkeeperParts: parts,
    prizeObject: () => prize,
    projectilePosition: () => P(0, 1.3, -1.5),
    ...(opts.camera ? { camera: () => opts.camera!, size: () => ({ width: 400, height: 800 }) } : {}),
    ...(opts.hud ? { hud: opts.hud } : {}),
  });
  return { fx, layer, parts, prize };
}

function tick(fx: ReturnType<typeof createEffects>, from: number, to: number, step = 1 / 60) {
  for (let t = from; t <= to + 1e-9; t += step) fx.update(t);
}

describe('contact reactions', () => {
  it('reacts at every contact point, once per eventId', () => {
    const { fx } = setup();
    const e = impact(prizeT());
    fx.handleEvents([e], 0);
    const a = fx.stats().particlesAlive;
    expect(a).toBeGreaterThan(0);
    fx.handleEvents([e], 0.01); // same eventId replayed: ignored
    expect(fx.stats().particlesAlive).toBe(a);
    fx.handleEvents([impact(prizeT())], 0.02);
    expect(fx.stats().particlesAlive).toBeGreaterThan(a);
  });

  it('varies by material (every prize and surface material has a reaction)', () => {
    const seen = new Set<string>();
    for (const m of ['wood', 'cloth', 'paper', 'metal', 'plastic', 'glass', 'ceramic', 'rubber'] as const) {
      const { fx } = setup();
      fx.handleEvents([impact({ kind: 'prize', instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), material: m })], 0);
      expect(fx.stats().particlesAlive).toBeGreaterThan(0);
      seen.add(fx.stats().lastPreset);
    }
    expect(seen.size).toBeGreaterThanOrEqual(6);
  });

  it('is capped: a flood of contacts never creates meshes or exceeds the pool', () => {
    const { fx, layer } = setup();
    const children = layer.children.length;
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) events.push(impact(prizeT()));
    fx.handleEvents(events, 0);
    expect(layer.children.length).toBe(children);
    expect(fx.stats().particlesAlive).toBeLessThanOrEqual(fx.stats().particleCapacity);
    tick(fx, 0, 3);
    expect(fx.stats().particlesAlive).toBe(0);
  });

  it('an inactive device (already fired this shot) shows only the ordinary small reaction', () => {
    const k = setup();
    k.fx.handleEvents([impact({ kind: 'device', deviceId: dev('power').deviceId, deviceKind: 'power', activated: false })], 0);
    expect(k.fx.stats().ringsAlive).toBe(0);
    expect(k.fx.stats().lastPreset).toBe('deviceInactive');
  });
});

describe('device effects', () => {
  it('has a distinct visible effect for each of the 6 device kinds', () => {
    const kinds: DeviceKind[] = ['split', 'power', 'transform', 'penalty', 'ammo', 'bulletType'];
    const signatures = new Set<string>();
    for (const k of kinds) {
      const { fx } = setup();
      fx.handleEvents([devEvent(k)], 0);
      const s = fx.stats();
      expect(s.particlesAlive + s.ringsAlive + s.barsAlive).toBeGreaterThan(0);
      signatures.add(fx.stats().lastPreset);
    }
    expect(signatures.size).toBe(6);
  });

  it('penalty draws a cross mark', () => {
    const { fx } = setup();
    fx.handleEvents([devEvent('penalty')], 0);
    expect(fx.stats().barsAlive).toBe(2);
  });

  it('transform pops the target prize when prizeTransformed arrives and restores its scale', () => {
    const { fx, prize } = setup();
    const ev: PrizeTransformedEvent = {
      type: 'prizeTransformed',
      eventId: eid(),
      shotId: mintId.shot(1),
      instanceId: mintId.instance(1),
      fromTypeId: asPrizeTypeId('P001'),
      toTypeId: asPrizeTypeId('P002'),
      hpBefore: 1,
      maxHpBefore: 1,
      hpAfter: 1,
      maxHpAfter: 1,
    };
    fx.handleEvents([ev], 0);
    tick(fx, 0, 0.2);
    expect(prize.scale.x).not.toBeCloseTo(1, 2);
    tick(fx, 0.2, 2);
    expect(prize.scale.x).toBeCloseTo(1, 6);
  });
});

describe('shopkeeper reactions (decision 18: reactions repeat)', () => {
  it.each(['hat', 'fan', 'body', 'feet'] as const)('%s moves on every hit and returns to rest', (part) => {
    const { fx, parts } = setup();
    const m = parts.get(part)!;
    const hit = () => fx.handleEvents([impact({ kind: 'shopkeeper', part })], clock);
    let clock = 0;
    for (let round = 0; round < 3; round++) {
      hit();
      let moved = false;
      for (let t = 0; t < 0.4; t += 1 / 60) {
        clock += 1 / 60;
        fx.update(clock);
        if (m.position.lengthSq() > 1e-8 || Math.abs(m.quaternion.w - 1) > 1e-6) moved = true;
      }
      expect(moved).toBe(true);
      tick(fx, clock, clock + 2);
      clock += 2;
      expect(m.position.lengthSq()).toBeLessThan(1e-12);
      expect(Math.abs(m.quaternion.w - 1)).toBeLessThan(1e-9);
    }
  });
});

describe('off-screen success cue (AC26)', () => {
  const cam = new THREE.PerspectiveCamera(60, 0.5, 0.05, 30);
  cam.position.set(0, 1.3, 0.6);
  cam.lookAt(0, 1.2, -2);
  cam.updateMatrixWorld(true);
  const mkHud = () => {
    const cues: OffscreenCue[] = [];
    const chains: number[] = [];
    return { cues, chains, hud: { offscreen: (c: OffscreenCue) => cues.push(c), chain: (c: number) => chains.push(c) } as EffectsHud };
  };

  it('points an arrow with an i18n key at an active device that is outside the view', () => {
    const { cues, hud } = mkHud();
    const { fx } = setup({ camera: cam, hud });
    fx.handleEvents([devEvent('ammo')], 0); // the ammo plate is far to the right of the frame
    expect(cues.length).toBe(1);
    expect(cues[0]!.key).toBe('fx.offscreen.device.ammo');
    expect(Number.isFinite(cues[0]!.angle)).toBe(true);
  });

  it('shows nothing for an in-view contact or for plain surface contacts', () => {
    const { cues, hud } = mkHud();
    const { fx } = setup({ camera: cam, hud });
    fx.handleEvents([impact(prizeT(), P(0, 1.2, -2))], 0);
    fx.handleEvents([impact({ kind: 'surface', surfaceId: 's', material: 'wood' }, P(9, 1, -2))], 0);
    expect(cues.length).toBe(0);
  });

  it('cues for off-screen prize contact and shopkeeper contact', () => {
    const { cues, hud } = mkHud();
    const { fx } = setup({ camera: cam, hud });
    fx.handleEvents([impact(prizeT(), P(7, 1.2, -2))], 0);
    fx.handleEvents([impact({ kind: 'shopkeeper', part: 'hat' }, P(-7, 1.2, -2))], 1);
    expect(cues.map((c) => c.key)).toEqual(['fx.offscreen.prize', 'fx.offscreen.shopkeeper']);
  });
});

describe('present()', () => {
  const summary = (collected: number, sets: number, chain: number) =>
    Object.freeze({
      collected: Object.freeze(Array.from({ length: collected }, (_, i) => ({ instanceId: mintId.instance(i + 1), typeId: asPrizeTypeId('P001'), shotId: mintId.shot(1) }))),
      chainCount: chain,
      newlyCompletedSets: Object.freeze(Array.from({ length: sets }, (_, i) => `S00${i}`)),
      bonusAmmoGranted: 0,
      devicesActivated: [],
      transforms: [],
      ledger: { prizePoints: 10, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0 },
      prizeOutcomes: [],
      touchedFirstHitTargets: [],
    }) as unknown as ShotSummary;

  it('skip resolves immediately and spawns no settle effects', async () => {
    const { fx } = setup();
    await fx.present(summary(3, 1, 3), { skip: true });
    expect(fx.stats().particlesAlive).toBe(0);
  });

  it('plays collect pops, set flourish and chain count, then resolves as time advances', async () => {
    const chains: number[] = [];
    const { fx } = setup({ hud: { offscreen: () => undefined, chain: (c) => chains.push(c) } });
    let done = false;
    const p = fx.present(summary(3, 1, 3), { skip: false }).then(() => (done = true));
    tick(fx, 0, 0.3);
    expect(fx.stats().particlesAlive + fx.stats().ringsAlive).toBeGreaterThan(0);
    expect(done).toBe(false);
    tick(fx, 0.3, 4);
    await p;
    expect(done).toBe(true);
    expect(chains).toEqual([3]);
  });

  it('reports the classification only from present (after settlement)', async () => {
    const seen: string[] = [];
    const layer = new THREE.Group();
    const fx = createEffects({ layer, layout: BOOTH_LAYOUT, shopkeeperParts: new Map(), prizeObject: () => null, projectilePosition: () => null, onClassified: (c) => seen.push(c) });
    fx.handleEvents([impact(prizeT())], 0);
    expect(seen).toEqual([]);
    void fx.present(summary(1, 0, 1), { skip: true });
    expect(seen).toEqual(['success']);
  });
});

describe('skipping changes presentation only (AC27, decision 26)', () => {
  const emptyFrame: SimulationFrame = { simTimeSec: 0, shotId: null, stage: null, prizes: [], projectiles: [], events: [] };
  const tuning = { valueStatus: 'prototype', cork: { speed: 11, gravityScale: 0.6 }, bulletTypes: { standard: { speed: 1 }, heavy: { speed: 1 }, bouncy: { speed: 1 } }, limits: { fixedStepSec: 1 / 120 } } as unknown as TuningConfig;
  const catalog = { rulesVersion: 'test', prizes: new Map(), sets: new Map() } as RuntimeCatalog;
  const deepFreeze = <T,>(o: T): T => {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const v of Object.values(o as object)) deepFreeze(v);
    }
    return o;
  };

  function run(skip: boolean) {
    n = 1000;
    const layer = new THREE.Group();
    const parts = new Map<string, THREE.Mesh>();
    for (const p of BOOTH_LAYOUT.shopkeeper) parts.set(p.part, new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1)));
    const fx = createEffects({ layer, layout: BOOTH_LAYOUT, shopkeeperParts: parts, prizeObject: () => null, projectilePosition: () => null });
    const shot = mintId.shot(1);
    const events: SimEvent[] = [impact(prizeT()), impact({ kind: 'shopkeeper', part: 'hat' }), devEvent('ammo')];
    const frames: SimulationFrame[] = [0, 1, 2, 3].map((i) => deepFreeze({ ...emptyFrame, simTimeSec: i / 60, shotId: shot, events: i === 1 ? events : [] }));
    let step = 0;
    const world = {
      syncShelf: vi.fn(),
      fire: vi.fn(),
      step: () => {
        const f = frames[Math.min(step++, frames.length - 1)]!;
        const record: ShotRecord | null =
          step === frames.length
            ? { runId: mintId.run('r'), shotId: shot, collected: [], prizeOutcomes: [], deviceActivations: [], firstHitCandidates: [], transforms: [], endedByLimit: false, remainingPrizes: [], simTimeSec: 1 }
            : null;
        return { frame: f, record };
      },
      frame: () => emptyFrame,
      shotInProgress: false,
      dispose: vi.fn(),
    } as unknown as ShotWorld;
    const state = { phase: 'aiming', pauseReasons: [], ammo: 5, score: 0, shotsFired: 0, aim: { yaw: 0, pitch: 0 }, load: { tier: 'perfect' }, bulletType: 'standard', standX: 0, clocks: {}, inFlight: null, shelf: { prizes: [] } } as unknown as RunState;
    const summaryOut = deepFreeze({ shotId: shot, collected: [{ instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), shotId: shot }], chainCount: 1, newlyCompletedSets: [], bonusAmmoGranted: 0, devicesActivated: [], transforms: [], ledger: { prizePoints: 10, trickPoints: 0, setPoints: 0, firstHitPoints: 0, nominalPenalty: 0, scoreAfter: 10 }, prizeOutcomes: [], touchedFirstHitTargets: [] }) as unknown as ShotSummary;
    const rules = {
      createRun: () => state,
      reduceGame: (s: RunState, c: { type: string }) => (c.type === 'FIRE' ? ({ ...s, phase: 'resolving', ammo: s.ammo - 1, shotsFired: 1, inFlight: { shotId: shot, shotNumber: 1, request: {} } } as unknown as RunState) : s),
      tickRun: (s: RunState) => s,
      effectiveAim: (s: RunState) => s.aim,
      loadingBarValue: () => 0.5,
      resolveShot: (s: RunState) => ({ state: { ...s, phase: 'aiming', inFlight: null, score: 10 } as RunState, summary: summaryOut }),
      transformChooser: () => () => null,
    } as unknown as RulesApi;
    const renderer = {
      render: (frame: SimulationFrame) => {
        fx.handleEvents(frame.events, frame.simTimeSec);
        fx.update(frame.simTimeSec);
      },
      present: (s: ShotSummary, o: { skip: boolean }) => fx.present(s, o),
      resize: () => undefined,
      dispose: () => undefined,
    };
    const c = new GameController({ rules, world, renderer, catalog, tuning, layout: BOOTH_LAYOUT }, state);
    c.dispatch({ type: 'FIRE' });
    if (skip) c.dispatch({ type: 'SKIP_PRESENTATION' });
    for (let i = 0; i < 6; i++) c.frame(1 / 60);
    return { state: c.current, summary: c.snapshot().lastSummary, frames: JSON.stringify(frames), summaryJson: JSON.stringify(summaryOut) };
  }

  it('same events + summary with and without skip give identical controller-visible state, and inputs are untouched', () => {
    const a = run(false);
    const b = run(true);
    expect(b.state).toEqual(a.state);
    expect(b.summary).toEqual(a.summary);
    expect(a.state.score).toBe(10);
    expect(a.frames).toBe(b.frames);
    expect(a.summaryJson).toBe(b.summaryJson);
  });
});
