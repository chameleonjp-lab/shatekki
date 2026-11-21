/**
 * WebAudio implementation of the `AudioEngine` port (Task 13, owner: Visual).
 *
 * - Synthesized only (see sounds.ts); no files, no network.
 * - `unlock()` is meant for a user gesture: it creates/resumes the context and
 *   never throws; a failure just leaves the game silent.
 * - Sounds are played immediately or not at all. Nothing is queued, and while
 *   the context is not running events are dropped, so nothing piles up and
 *   plays in a burst after the page returns from hidden (AC36). `silence()`
 *   additionally stops every sound that is still sounding or scheduled.
 * - Settings are read on every call: disabled or volume 0 plays nothing (a
 *   saved "off" is respected), the first-run default (on, volume > 0) is the
 *   settings store's concern.
 * - Polyphony is capped, each sound has a minimum re-trigger gap, and a global
 *   start budget per short window limits how many low/mid priority sounds can
 *   start at once, so rapid contacts do not machine-gun (UI / result sounds
 *   are exempt from the window budget).
 */
import type { AudioEngine, AudioSettings, FestivalBgmScene, SimEvent, UiCue, Vec3 } from '../contracts';
import { SOUNDS, soundsForSimEvent, soundsForUiCue, type SoundId, type SoundRequest, type UiCueExt, type Voice, type ExpansionUiCue } from './sounds';
import { createFestivalBgm } from './festival-bgm';

interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
export interface NodeLike {
  connect(n: unknown): unknown;
  disconnect(): void;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}
export interface SourceLike extends NodeLike {
  onended: (() => void) | null;
  start(t?: number): void;
  stop(t?: number): void;
}
interface OscLike extends SourceLike {
  type: string;
  frequency: ParamLike;
}
interface FilterLike extends NodeLike {
  type: string;
  frequency: ParamLike;
  Q: ParamLike;
}
interface BufferSourceLike extends SourceLike {
  buffer: unknown;
  loop: boolean;
}

/** The slice of AudioContext this engine uses (a fake implements it in tests). */
export interface AudioContextLike {
  readonly currentTime: number;
  readonly state: string;
  readonly sampleRate: number;
  readonly destination: unknown;
  createGain(): GainLike;
  createOscillator(): OscLike;
  createBiquadFilter(): FilterLike;
  createBufferSource(): BufferSourceLike;
  createStereoPanner?(): NodeLike & { pan: ParamLike };
  createDynamicsCompressor?(): NodeLike & { threshold: ParamLike; ratio: ParamLike; release: ParamLike };
  createDelay?(maxDelayTime: number): NodeLike & { delayTime: ParamLike };
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  resume(): Promise<void>;
  close?(): Promise<void>;
  addEventListener?(type: 'statechange', listener: () => void): void;
  removeEventListener?(type: 'statechange', listener: () => void): void;
}

export interface AudioEngineOptions {
  readonly createContext?: () => AudioContextLike;
  readonly festival?: boolean;
  readonly listener?: () => Vec3;
}

export const MAX_VOICES = 12;
/** Start budget for priority 0 / 1 sounds per window. */
const WINDOW_SEC = 0.12;
const WINDOW_BUDGET_LOW = 4;
const WINDOW_BUDGET_MID = 6;
const LEAD_SEC = 0.005;
const FADE_SEC = 0.03;
const MAX_FESTIVAL_EFFECT_SOURCES = 52;
const REFLECTION_TAIL_SEC = .047;
const DUCK_SOUNDS = new Set<SoundId>([
  'festival.set.complete', 'festival.set.discovered', 'festival.newBest', 'take.taiko',
  'festival.relay', 'festival.daruma.done', 'festival.giant.drop', 'festival.fuse',
  'festival.encore', 'festival.lastShot', 'festival.challenge',
]);

interface Active {
  readonly id: SoundId;
  readonly priority: 0 | 1 | 2;
  readonly bus: GainLike;
  readonly disconnect: () => void;
  readonly sources: SourceLike[];
  readonly hold: boolean;
  readonly start: number;
  end: number;
}

function defaultCreateContext(): AudioContextLike {
  const g = globalThis as unknown as { AudioContext?: new () => AudioContextLike; webkitAudioContext?: new () => AudioContextLike };
  const C = g.AudioContext ?? g.webkitAudioContext;
  if (!C) throw new Error('WebAudio is not available');
  return new C();
}

/** Perceptual-ish volume curve; 0.7 (the default) is a moderate level. */
export function masterGainFor(volume: number): number {
  const v = Math.max(0, Math.min(1, volume));
  return 0.8 * Math.pow(v, 1.6);
}

export function createAudioEngine(options: AudioEngineOptions = {}): AudioEngine {
  const createContext = options.createContext ?? defaultCreateContext;
  let ctx: AudioContextLike | null = null;
  let master: GainLike | null = null;
  let effects: GainLike | null = null;
  let wet: GainLike | null = null;
  let wetBlockedUntil = 0;
  let festivalNodes: NodeLike[] = [];
  let music: ReturnType<typeof createFestivalBgm> | null = null;
  let scene: FestivalBgmScene = 'off';
  let musicSettings: AudioSettings = { enabled: false, volume: 0 };
  let disposed = false;
  let variation = 0x97e743a1;
  let noise: { getChannelData(c: number): Float32Array } | null = null;
  let active: Active[] = [];
  const lastStart = new Map<SoundId, number>();
  const recentStarts: number[] = [];
  const seenEvents = new Set<string>();
  const seenOrder: string[] = [];
  let resumePromise: Promise<void> | null = null;
  let dropShot: string | null = null;
  let dropCount = 0;

  function ensureContext(): boolean {
    if (disposed) return false;
    if (ctx) return true;
    try {
      const c = createContext();
      const m = c.createGain();
      m.gain.value = 0;
      const compressor = options.festival ? c.createDynamicsCompressor?.() : undefined;
      if (compressor) {
        compressor.threshold.value = -13;
        compressor.ratio.value = 4;
        compressor.release.value = .18;
        m.connect(compressor);
        compressor.connect(c.destination);
      } else m.connect(c.destination);
      const len = Math.max(1, Math.floor(c.sampleRate * 0.5));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      let s = 0x2545f491;
      for (let i = 0; i < len; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        data[i] = ((s >>> 0) / 4294967296) * 2 - 1;
      }
      ctx = c;
      master = m;
      noise = buf;
      if (options.festival) {
        const send = c.createGain();
        send.gain.value = 1;
        send.connect(m);
        effects = send;
        festivalNodes = compressor ? [send, compressor] : [send];
        if (c.createDelay) {
          const returnBus = c.createGain();
          const filter = c.createBiquadFilter();
          filter.type = 'lowpass';
          filter.frequency.value = 5200;
          for (const [time, amount] of [[.029, .085], [REFLECTION_TAIL_SEC, .055]] as const) {
            const echo = c.createDelay(.08);
            const level = c.createGain();
            echo.delayTime.value = time;
            level.gain.value = amount;
            send.connect(echo);
            echo.connect(level);
            level.connect(filter);
            festivalNodes.push(echo, level);
          }
          filter.connect(returnBus);
          returnBus.connect(m);
          wet = returnBus;
          festivalNodes.push(filter, returnBus);
        }
        music = createFestivalBgm(c, m, buf);
        c.addEventListener?.('statechange', onContextStateChange);
      }
      return true;
    } catch {
      ctx = null;
      master = null;
      return false;
    }
  }

  function syncMusic(): void {
    if (!music || !ctx || !master) return;
    const audible = musicSettings.enabled && musicSettings.volume > 0;
    master.gain.value = audible ? masterGainFor(musicSettings.volume) : 0;
    music.setScene(audible && ctx.state === 'running' ? scene : 'off');
  }

  function onContextStateChange(): void {
    if (ctx?.state !== 'running') stopEffects();
    syncMusic();
  }

  function resumeSafely(): Promise<void> {
    if (!ctx || ctx.state === 'running') return Promise.resolve();
    if (resumePromise) return resumePromise;
    const c = ctx;
    resumePromise = (async () => {
      try {
        await c.resume();
      } catch {
        /* blocked by the browser: the game goes on silently, the next gesture retries */
      } finally {
        resumePromise = null;
      }
    })();
    return resumePromise;
  }

  function killActive(a: Active, immediate: boolean): void {
    const now = ctx?.currentTime ?? 0;
    try {
      if (immediate) {
        for (const s of [...a.sources]) s.stop(0);
        a.disconnect();
      } else {
        a.bus.gain.cancelScheduledValues(now);
        a.bus.gain.setValueAtTime(1, now);
        a.bus.gain.linearRampToValueAtTime(0, now + FADE_SEC);
        for (const s of a.sources) s.stop(now + FADE_SEC + 0.01);
      }
    } catch {
      /* a source that already ended */
    }
    a.end = now;
  }

  function prune(now: number): void {
    if (active.length === 0) return;
    const keep: Active[] = [];
    for (const a of active) {
      if (a.end > now) keep.push(a);
      else
        try {
          a.disconnect();
        } catch {
          /* already gone */
        }
    }
    active = keep;
  }

  function stopHold(): void {
    for (const a of active) if (a.hold) killActive(a, false);
  }

  function stopEffects(): void {
    for (const a of active) killActive(a, true);
    active = [];
    recentStarts.length = 0;
    lastStart.clear();
    if (wet && ctx) {
      const now = ctx.currentTime;
      wetBlockedUntil = now + REFLECTION_TAIL_SEC + LEAD_SEC;
      wet.gain.cancelScheduledValues(now);
      wet.gain.setValueAtTime(0, now);
    }
    try {
      master?.gain.cancelScheduledValues(ctx?.currentTime ?? 0);
    } catch {
      /* ignore */
    }
  }

  function silence(): void {
    stopEffects();
    scene = 'off';
    music?.setScene('off');
  }

  function voice(c: AudioContextLike, v: Voice, aud: { bus: GainLike; at: number; gain: number; pitch: number; durationScale: number }, out: SourceLike[], disconnect: () => void): number {
    const { bus, at, gain, pitch, durationScale } = aud;
    const start = at + v.at;
    const end = start + v.dur * durationScale;
    const env = c.createGain();
    const peak = Math.max(0.0002, v.gain * gain);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + Math.min(0.006, v.dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    let source: SourceLike;
    let filter: FilterLike | undefined;
    if (v.kind === 'tone') {
      const o = c.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.f0 * pitch, start);
      if (v.f1 !== undefined) o.frequency.exponentialRampToValueAtTime(v.f1 * pitch, end);
      o.connect(env);
      source = o;
    } else {
      const src = c.createBufferSource();
      src.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = v.filter;
      f.frequency.setValueAtTime(v.freq * pitch, start);
      if (v.q !== undefined) f.Q.setValueAtTime(v.q, start);
      src.connect(f);
      f.connect(env);
      source = src;
      filter = f;
    }
    env.connect(bus);
    out.push(source);
    source.onended = () => {
      source.onended = null;
      source.disconnect();
      filter?.disconnect();
      env.disconnect();
      out.splice(out.indexOf(source), 1);
      if (out.length === 0) {
        disconnect();
        active = active.filter(a => a.bus !== bus);
      }
    };
    source.start(start);
    source.stop(end + 0.02);
    return end + 0.02;
  }

  function play(r: SoundRequest, point?: Vec3): void {
    if (!ctx || !master) return;
    const c = ctx;
    const def = SOUNDS[r.id];
    const now = c.currentTime;
    prune(now);
    const last = lastStart.get(r.id);
    if (last !== undefined && now - last < def.minGapSec && now >= last) return;
    if (def.priority < 2) {
      while (recentStarts.length > 0 && now - recentStarts[0]! > WINDOW_SEC) recentStarts.shift();
      const budget = def.priority === 0 ? WINDOW_BUDGET_LOW : WINDOW_BUDGET_MID;
      if (recentStarts.length >= budget) return;
    }
    while (active.length >= MAX_VOICES || (options.festival &&
      active.reduce((total, cue) => total + cue.sources.length, 0) + def.voices.length > MAX_FESTIVAL_EFFECT_SOURCES)) {
      // steal the oldest sound of lower priority; otherwise drop the new one
      let victim: Active | null = null;
      for (const a of active) if (a.priority < def.priority && (victim === null || a.start < victim.start)) victim = a;
      if (!victim) return;
      killActive(victim, options.festival === true);
      active = active.filter((a) => a !== victim);
    }
    if (def.hold) stopHold();
    const bus = c.createGain();
    bus.gain.value = 1;
    const positioned = point && options.listener?.();
    let gain = Math.min(1.3, Math.max(0.1, r.gain));
    const nodes: NodeLike[] = [bus];
    if (point && positioned) {
      const dx = point.x - positioned.x;
      const distance = Math.hypot(dx, point.y - positioned.y, point.z - positioned.z);
      gain /= 1 + distance * .23;
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 12000 / (1 + distance * .38);
      bus.connect(filter);
      nodes.push(filter);
      const panner = c.createStereoPanner?.();
      if (panner) {
        panner.pan.value = Math.max(-.84, Math.min(.84, dx / 2.5));
        filter.connect(panner);
        nodes.push(panner);
      }
    }
    nodes.at(-1)!.connect(effects ?? master);
    if (wet && wetBlockedUntil > 0) {
      wet.gain.setValueAtTime(1, Math.max(now, wetBlockedUntil));
      wetBlockedUntil = 0;
    }
    const disconnect = () => { for (const node of nodes) node.disconnect(); };
    const sources: SourceLike[] = [];
    let end = now;
    let pitch = 1;
    if (options.festival && def.priority === 0) {
      variation ^= variation << 13;
      variation ^= variation >>> 17;
      variation ^= variation << 5;
      pitch += ((variation >>> 0) / 4294967296 - .5) * .06;
    }
    const playback = { bus, at: now + LEAD_SEC, gain, pitch, durationScale: r.durationScale ?? 1 };
    for (const v of def.voices) end = Math.max(end, voice(c, v, playback, sources, disconnect));
    active.push({ id: r.id, priority: def.priority, bus, disconnect, sources, hold: def.hold === true, start: now, end });
    lastStart.set(r.id, now);
    if (def.priority < 2) recentStarts.push(now);
    if (DUCK_SOUNDS.has(r.id)) music?.duck(Math.max(.55, end - now + .17));
  }

  return {
    async unlock(): Promise<void> {
      try {
        if (!ensureContext()) return;
        await resumeSafely();
        if (ctx && ctx.state !== 'running') await resumeSafely(); // a handle()-started attempt may have just failed
        syncMusic();
      } catch {
        /* never break the game */
      }
    },

    handle(event: SimEvent | UiCue | ExpansionUiCue, settings: AudioSettings): void {
      try {
        if (!settings.enabled || !(settings.volume > 0)) {
          if (active.length > 0 || music) silence(); // muted mid-sound: stop at once
          return;
        }
        if (!ctx || !master) return;
        if (ctx.state !== 'running') {
          if (!options.festival) void resumeSafely(); // the festival score only resumes from a gesture/browser state change
          return;
        }
        if (event.type !== 'ui') {
          if (seenEvents.has(event.eventId)) return;
          seenEvents.add(event.eventId);
          seenOrder.push(event.eventId);
          if (seenOrder.length > 256) seenEvents.delete(seenOrder.shift() as string);
        }
        master.gain.value = masterGainFor(settings.volume);
        let reqs: readonly SoundRequest[];
        if (event.type === 'ui') {
          const cue = (event as UiCueExt).cue;
          if (cue === 'loadStop' || cue === 'critLatch' || cue === 'fire' || cue === 'runEnd' || cue === 'resultShow' ||
            (options.festival && cue === 'cancel')) stopHold();
          reqs = soundsForUiCue(event as UiCueExt, options.festival);
        } else if (options.festival && event.type === 'prizeReachedCollection') {
          if (dropShot !== event.shotId) {
            dropShot = event.shotId;
            dropCount = 0;
          }
          reqs = soundsForSimEvent(event, ++dropCount);
        } else {
          reqs = soundsForSimEvent(event, 0, options.festival);
        }
        const point = options.festival && (event.type === 'impact' || event.type === 'prizeContact' || event.type === 'festival') ? event.point : undefined;
        for (const r of reqs) play(r, point);
      } catch {
        /* audio must never break the game */
      }
    },

    silence(): void {
      try {
        silence();
      } catch {
        /* ignore */
      }
    },

    ...(options.festival ? {
      setBgmScene(next: FestivalBgmScene, settings: AudioSettings) {
        if (disposed) return;
        if (next === scene && settings.enabled === musicSettings.enabled && settings.volume === musicSettings.volume) return;
        if ((!settings.enabled || settings.volume <= 0) && musicSettings.enabled && musicSettings.volume > 0) silence();
        scene = next;
        musicSettings = settings;
        syncMusic();
      },
      dispose() {
        disposed = true;
        silence();
        ctx?.removeEventListener?.('statechange', onContextStateChange);
        music?.dispose();
        for (const node of festivalNodes) node.disconnect();
        master?.disconnect();
        void ctx?.close?.().catch(() => undefined);
        ctx = master = effects = wet = music = noise = null;
        festivalNodes = [];
      },
    } : {}),
  };
}
