import { describe, expect, it } from 'vitest';
import { asPrizeTypeId, mintId, SIM_EVENT_TYPES, type ImpactTarget, type SimEvent, type UiCue } from '../../src/contracts';
import { createAudioEngine, type AudioContextLike } from '../../src/audio/engine';
import { SOUNDS, SIM_EVENT_POLICY, UI_CUE_SOUND, soundsForSimEvent, soundsForUiCue, type SoundId } from '../../src/audio/sounds';

// ------------------------------------------------------------- fake WebAudio
class FakeParam {
  value = 0;
  setValueAtTime() {
    return this;
  }
  linearRampToValueAtTime() {
    return this;
  }
  exponentialRampToValueAtTime() {
    return this;
  }
  cancelScheduledValues() {
    return this;
  }
}
class FakeNode {
  connected: unknown[] = [];
  gain = new FakeParam();
  frequency = new FakeParam();
  Q = new FakeParam();
  type = 'sine';
  buffer: unknown = null;
  started = false;
  stopped = false;
  onended: (() => void) | null = null;
  connect(n: unknown) {
    this.connected.push(n);
    return n;
  }
  disconnect() {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopped = true;
  }
}
class FakeCtx implements AudioContextLike {
  currentTime = 0;
  state: 'running' | 'suspended' | 'closed' = 'running';
  sampleRate = 8000;
  destination = new FakeNode();
  nodes: FakeNode[] = [];
  sources: FakeNode[] = [];
  resumeCalls = 0;
  resumeFails = false;
  mk(): FakeNode {
    const n = new FakeNode();
    this.nodes.push(n);
    return n;
  }
  createGain() {
    return this.mk() as never;
  }
  createOscillator() {
    const n = this.mk();
    this.sources.push(n);
    return n as never;
  }
  createBiquadFilter() {
    return this.mk() as never;
  }
  createBufferSource() {
    const n = this.mk();
    this.sources.push(n);
    return n as never;
  }
  createBuffer(_c: number, len: number) {
    return { getChannelData: () => new Float32Array(len) } as never;
  }
  resume() {
    this.resumeCalls++;
    if (this.resumeFails) return Promise.reject(new Error('blocked'));
    return Promise.resolve().then(() => {
      this.state = 'running';
    });
  }
}

const ON = { enabled: true, volume: 0.7 };
const impact = (target: ImpactTarget, over: Partial<Extract<SimEvent, { type: 'impact' }>> = {}): SimEvent => ({
  type: 'impact',
  eventId: mintId.event(mintId.shot(1), Math.floor(Math.random() * 1e9)),
  runId: mintId.run('r'),
  shotId: mintId.shot(1),
  projectileId: mintId.projectile(mintId.shot(1), 0),
  target,
  point: { x: 0, y: 1, z: -2 },
  normal: { x: 0, y: 0, z: 1 },
  speed: 8,
  reflectionIndex: 0,
  ...over,
});
const prize = (material: 'wood' | 'glass' = 'wood'): ImpactTarget => ({ kind: 'prize', instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), material });

async function ready(ctx = new FakeCtx()) {
  const engine = createAudioEngine({ createContext: () => ctx });
  await engine.unlock();
  return { engine, ctx };
}

describe('settings semantics', () => {
  it('plays nothing when disabled or volume is 0', async () => {
    const { engine, ctx } = await ready();
    engine.handle(impact(prize()), { enabled: false, volume: 0.7 });
    engine.handle(impact(prize()), { enabled: true, volume: 0 });
    engine.handle({ type: 'ui', cue: 'confirm' }, { enabled: false, volume: 1 });
    expect(ctx.sources.length).toBe(0);
  });

  it('plays when enabled with volume > 0 and follows the volume on the master gain', async () => {
    const { engine, ctx } = await ready();
    engine.handle({ type: 'ui', cue: 'confirm' }, ON);
    expect(ctx.sources.length).toBeGreaterThan(0);
    expect(ctx.sources.every((s) => s.started)).toBe(true);
    const master = ctx.nodes[0]!;
    const loud = master.gain.value;
    ctx.currentTime = 5;
    engine.handle({ type: 'ui', cue: 'confirm' }, { enabled: true, volume: 0.2 });
    expect(master.gain.value).toBeLessThan(loud);
    expect(master.gain.value).toBeGreaterThan(0);
  });

  it('does nothing before unlock and never throws', () => {
    const ctx = new FakeCtx();
    const engine = createAudioEngine({ createContext: () => ctx });
    expect(() => engine.handle({ type: 'ui', cue: 'select' }, ON)).not.toThrow();
    expect(ctx.sources.length).toBe(0);
  });
});

describe('unlock', () => {
  it('survives a context that cannot be created', async () => {
    const engine = createAudioEngine({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    await expect(engine.unlock()).resolves.toBeUndefined();
    expect(() => engine.handle({ type: 'ui', cue: 'select' }, ON)).not.toThrow();
  });

  it('survives a resume that rejects, and retries on the next gesture', async () => {
    const ctx = new FakeCtx();
    ctx.state = 'suspended';
    ctx.resumeFails = true;
    const engine = createAudioEngine({ createContext: () => ctx });
    await expect(engine.unlock()).resolves.toBeUndefined();
    engine.handle({ type: 'ui', cue: 'select' }, ON);
    expect(ctx.sources.length).toBe(0); // not running: dropped, not queued
    ctx.resumeFails = false;
    await engine.unlock();
    expect(ctx.resumeCalls).toBeGreaterThanOrEqual(2);
    engine.handle({ type: 'ui', cue: 'select' }, ON);
    expect(ctx.sources.length).toBeGreaterThan(0);
  });

  it('drops (does not queue) sounds while the context is suspended, so nothing piles up on resume', async () => {
    const { engine, ctx } = await ready();
    ctx.state = 'suspended';
    for (let i = 0; i < 20; i++) engine.handle(impact(prize()), ON);
    expect(ctx.sources.length).toBe(0);
  });
});

describe('silence (AC36)', () => {
  it('stops everything started, including the held load charge, and a later cue still works', async () => {
    const { engine, ctx } = await ready();
    engine.handle({ type: 'ui', cue: 'loadStart' }, ON);
    engine.handle({ type: 'ui', cue: 'confirm' }, ON);
    const started = ctx.sources.filter((s) => s.started);
    expect(started.length).toBeGreaterThan(1);
    engine.silence();
    expect(started.every((s) => s.stopped)).toBe(true);
    ctx.currentTime = 10;
    const before = ctx.sources.length;
    engine.handle({ type: 'ui', cue: 'select' }, ON);
    expect(ctx.sources.length).toBeGreaterThan(before);
  });

  it('is safe before unlock and when called twice', async () => {
    const engine = createAudioEngine({ createContext: () => new FakeCtx() });
    expect(() => engine.silence()).not.toThrow();
    await engine.unlock();
    expect(() => {
      engine.silence();
      engine.silence();
    }).not.toThrow();
  });

  it('loadStop / fire end the charge tone', async () => {
    const { engine, ctx } = await ready();
    engine.handle({ type: 'ui', cue: 'loadStart' }, ON);
    const charge = ctx.sources.filter((s) => s.started);
    ctx.currentTime = 1;
    engine.handle({ type: 'ui', cue: 'loadStop' } as UiCue, ON);
    expect(charge.every((s) => s.stopped)).toBe(true);
  });
});

describe('rate limiting and dedupe', () => {
  it('a flood of contacts at one instant is capped (no machine gun)', async () => {
    const { engine, ctx } = await ready();
    for (let i = 0; i < 100; i++) engine.handle(impact(prize()), ON);
    expect(ctx.sources.length).toBeLessThanOrEqual(8);
    expect(ctx.sources.length).toBeGreaterThan(0);
  });

  it('the same sound can play again after its minimum gap', async () => {
    const { engine, ctx } = await ready();
    engine.handle(impact(prize()), ON);
    const a = ctx.sources.length;
    ctx.currentTime += 0.5;
    engine.handle(impact(prize()), ON);
    expect(ctx.sources.length).toBeGreaterThan(a);
  });

  it('ignores a replayed eventId', async () => {
    const { engine, ctx } = await ready();
    const e = impact(prize());
    engine.handle(e, ON);
    const a = ctx.sources.length;
    ctx.currentTime += 1;
    engine.handle(e, ON);
    expect(ctx.sources.length).toBe(a);
  });

  it('important cues are not starved by a flood of low-priority hits', async () => {
    const { engine, ctx } = await ready();
    for (let i = 0; i < 100; i++) engine.handle(impact(prize()), ON);
    const before = ctx.sources.length;
    engine.handle({ type: 'ui', cue: 'setComplete' }, ON);
    expect(ctx.sources.length).toBeGreaterThan(before);
  });
});

describe('mapping covers every event and cue', () => {
  it('every SimEvent type has an explicit policy; "sound" types map to defined sounds', () => {
    for (const t of SIM_EVENT_TYPES) expect(SIM_EVENT_POLICY[t], t).toMatch(/^(sound|silent)$/);
    expect(Object.keys(SIM_EVENT_POLICY).sort()).toEqual([...SIM_EVENT_TYPES].sort());
  });

  it('every UiCue maps to a defined sound', () => {
    const cues: UiCue['cue'][] = ['select', 'confirm', 'cancel', 'start', 'loadStart', 'loadStop', 'fire', 'resultShow', 'newBest', 'setDiscovered', 'setComplete', 'runEnd', 'miss', 'nearMiss', 'collect', 'penalty', 'ammoBonus'];
    for (const c of cues) {
      expect(UI_CUE_SOUND[c], c).toBeDefined();
      for (const r of soundsForUiCue({ type: 'ui', cue: c })) expect(SOUNDS[r.id], r.id).toBeDefined();
    }
  });

  it('all 8 prize materials, 5 surface materials, 4 shopkeeper parts, 6 devices have distinct defined sounds', () => {
    const ids = new Set<SoundId>();
    for (const m of ['wood', 'cloth', 'paper', 'metal', 'plastic', 'glass', 'ceramic', 'rubber'] as const)
      for (const r of soundsForSimEvent(impact({ kind: 'prize', instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), material: m }))) ids.add(r.id);
    expect(ids.size).toBe(8);
    for (const m of ['wood', 'cloth', 'paper', 'metal', 'plastic'] as const) expect(soundsForSimEvent(impact({ kind: 'surface', surfaceId: 's', material: m })).length).toBe(1);
    const parts = new Set<SoundId>();
    for (const p of ['hat', 'fan', 'body', 'feet'] as const) for (const r of soundsForSimEvent(impact({ kind: 'shopkeeper', part: p }))) parts.add(r.id);
    expect(parts.size).toBe(4);
    const dev = new Set<SoundId>();
    for (const k of ['split', 'power', 'transform', 'penalty', 'ammo', 'bulletType'] as const)
      for (const r of soundsForSimEvent({ type: 'deviceActivated', eventId: mintId.event(mintId.shot(1), 1), shotId: mintId.shot(1), deviceId: mintId.device('d'), deviceKind: k, projectileId: mintId.projectile(mintId.shot(1), 0) })) dev.add(r.id);
    expect(dev.size).toBe(6);
  });

  it('an inactive device contact is only the ordinary small sound; an active one is left to deviceActivated', () => {
    const base = { kind: 'device', deviceId: mintId.device('d'), deviceKind: 'power' } as const;
    expect(soundsForSimEvent(impact({ ...base, activated: false }))[0]!.id).toBe('hit.deviceDull');
    expect(soundsForSimEvent(impact({ ...base, activated: true }))).toEqual([]);
  });

  it('every defined sound is reachable from some event or cue, and has voices', () => {
    const reachable = new Set<SoundId>();
    for (const id of Object.values(UI_CUE_SOUND)) reachable.add(id);
    for (const t of ['perfect', 'good', 'normal', 'weak'] as const) for (const r of soundsForUiCue({ type: 'ui', cue: 'loadStop', tier: t } as never)) reachable.add(r.id);
    for (const r of soundsForUiCue({ type: 'ui', cue: 'collect', count: 3 } as never)) reachable.add(r.id);
    const mats = ['wood', 'cloth', 'paper', 'metal', 'plastic', 'glass', 'ceramic', 'rubber'] as const;
    for (const m of mats) for (const r of soundsForSimEvent(impact({ kind: 'prize', instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001'), material: m }, { reflectionIndex: 1 }))) reachable.add(r.id);
    for (const r of soundsForSimEvent(impact({ kind: 'surface', surfaceId: 's', material: 'wood' }, { reflectionIndex: 2 }))) reachable.add(r.id);
    for (const p of ['hat', 'fan', 'body', 'feet'] as const) for (const r of soundsForSimEvent(impact({ kind: 'shopkeeper', part: p }))) reachable.add(r.id);
    for (const r of soundsForSimEvent(impact({ kind: 'hidden', targetId: 'h' }))) reachable.add(r.id);
    for (const r of soundsForSimEvent(impact({ kind: 'device', deviceId: mintId.device('d'), deviceKind: 'power', activated: false }))) reachable.add(r.id);
    for (const k of ['split', 'power', 'transform', 'penalty', 'ammo', 'bulletType'] as const)
      for (const r of soundsForSimEvent({ type: 'deviceActivated', eventId: mintId.event(mintId.shot(1), 1), shotId: mintId.shot(1), deviceId: mintId.device('d'), deviceKind: k, projectileId: mintId.projectile(mintId.shot(1), 0) })) reachable.add(r.id);
    const s1 = mintId.shot(1);
    for (const r of soundsForSimEvent({ type: 'prizeContact', eventId: mintId.event(s1, 2), shotId: s1, a: mintId.instance(1), b: null, point: { x: 0, y: 0, z: 0 }, impulse: 1 })) reachable.add(r.id);
    for (const r of soundsForSimEvent({ type: 'prizeReachedCollection', eventId: mintId.event(s1, 3), shotId: s1, instanceId: mintId.instance(1), typeId: asPrizeTypeId('P001') })) reachable.add(r.id);
    for (const r of soundsForSimEvent({ type: 'prizeTransformed', eventId: mintId.event(s1, 4), shotId: s1, instanceId: mintId.instance(1), fromTypeId: asPrizeTypeId('P001'), toTypeId: asPrizeTypeId('P002'), hpBefore: 1, maxHpBefore: 1, hpAfter: 1, maxHpAfter: 1 })) reachable.add(r.id);
    for (const id of Object.keys(SOUNDS) as SoundId[]) {
      expect(reachable.has(id), `unreachable sound ${id}`).toBe(true);
      expect(SOUNDS[id].voices.length, id).toBeGreaterThan(0);
    }
  });

  it('load tiers sound different', () => {
    const ids = (['perfect', 'good', 'normal', 'weak'] as const).map((t) => soundsForUiCue({ type: 'ui', cue: 'loadStop', tier: t } as never)[0]!.id);
    expect(new Set(ids).size).toBe(4);
  });

  it('a chain of 2+ adds the chain sound to the collect cue', () => {
    expect(soundsForUiCue({ type: 'ui', cue: 'collect' }).map((r) => r.id)).toEqual(['collect']);
    expect(soundsForUiCue({ type: 'ui', cue: 'collect', count: 3 } as never).map((r) => r.id)).toEqual(['collect', 'chain']);
  });
});
