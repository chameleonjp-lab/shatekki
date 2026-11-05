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
import type { AudioEngine, AudioSettings, SimEvent, UiCue } from '../contracts';
import { SOUNDS, soundsForSimEvent, soundsForUiCue, type SoundId, type SoundRequest, type UiCueExt, type Voice } from './sounds';

interface ParamLike {
  value: number;
  setValueAtTime(v: number, t: number): unknown;
  linearRampToValueAtTime(v: number, t: number): unknown;
  exponentialRampToValueAtTime(v: number, t: number): unknown;
  cancelScheduledValues(t: number): unknown;
}
interface NodeLike {
  connect(n: unknown): unknown;
  disconnect(): void;
}
interface GainLike extends NodeLike {
  gain: ParamLike;
}
interface SourceLike extends NodeLike {
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
  createBuffer(channels: number, length: number, sampleRate: number): { getChannelData(channel: number): Float32Array };
  resume(): Promise<void>;
}

export interface AudioEngineOptions {
  readonly createContext?: () => AudioContextLike;
}

export const MAX_VOICES = 12;
/** Start budget for priority 0 / 1 sounds per window. */
const WINDOW_SEC = 0.12;
const WINDOW_BUDGET_LOW = 4;
const WINDOW_BUDGET_MID = 6;
const LEAD_SEC = 0.005;
const FADE_SEC = 0.03;

interface Active {
  readonly id: SoundId;
  readonly priority: 0 | 1 | 2;
  readonly bus: GainLike;
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
  let noise: { getChannelData(c: number): Float32Array } | null = null;
  let active: Active[] = [];
  const lastStart = new Map<SoundId, number>();
  const recentStarts: number[] = [];
  const seenEvents = new Set<string>();
  const seenOrder: string[] = [];
  let resumePromise: Promise<void> | null = null;

  function ensureContext(): boolean {
    if (ctx) return true;
    try {
      const c = createContext();
      const m = c.createGain();
      m.gain.value = 0;
      m.connect(c.destination);
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
      return true;
    } catch {
      ctx = null;
      master = null;
      return false;
    }
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
        for (const s of a.sources) s.stop(0);
        a.bus.disconnect();
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
          a.bus.disconnect();
        } catch {
          /* already gone */
        }
    }
    active = keep;
  }

  function stopHold(): void {
    for (const a of active) if (a.hold) killActive(a, false);
  }

  function silence(): void {
    for (const a of active) killActive(a, true);
    active = [];
    recentStarts.length = 0;
    lastStart.clear();
    try {
      master?.gain.cancelScheduledValues(ctx?.currentTime ?? 0);
    } catch {
      /* ignore */
    }
  }

  function voice(c: AudioContextLike, v: Voice, bus: GainLike, t0: number, gain: number, out: SourceLike[]): number {
    const start = t0 + v.at;
    const end = start + v.dur;
    const env = c.createGain();
    const peak = Math.max(0.0002, v.gain * gain);
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(peak, start + Math.min(0.006, v.dur / 3));
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    if (v.kind === 'tone') {
      const o = c.createOscillator();
      o.type = v.wave;
      o.frequency.setValueAtTime(v.f0, start);
      if (v.f1 !== undefined) o.frequency.exponentialRampToValueAtTime(v.f1, end);
      o.connect(env);
      env.connect(bus);
      o.start(start);
      o.stop(end + 0.02);
      out.push(o);
    } else {
      const src = c.createBufferSource();
      src.buffer = noise;
      const f = c.createBiquadFilter();
      f.type = v.filter;
      f.frequency.setValueAtTime(v.freq, start);
      if (v.q !== undefined) f.Q.setValueAtTime(v.q, start);
      src.connect(f);
      f.connect(env);
      env.connect(bus);
      src.start(start);
      src.stop(end + 0.02);
      out.push(src);
    }
    return end + 0.02;
  }

  function play(r: SoundRequest): void {
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
    if (active.length >= MAX_VOICES) {
      // steal the oldest sound of lower priority; otherwise drop the new one
      let victim: Active | null = null;
      for (const a of active) if (a.priority < def.priority && (victim === null || a.start < victim.start)) victim = a;
      if (!victim) return;
      killActive(victim, false);
      active = active.filter((a) => a !== victim);
    }
    if (def.hold) stopHold();
    const bus = c.createGain();
    bus.gain.value = 1;
    bus.connect(master);
    const sources: SourceLike[] = [];
    let end = now;
    const t0 = now + LEAD_SEC;
    for (const v of def.voices) end = Math.max(end, voice(c, v, bus, t0, Math.min(1.3, Math.max(0.1, r.gain)), sources));
    active.push({ id: r.id, priority: def.priority, bus, sources, hold: def.hold === true, start: now, end });
    lastStart.set(r.id, now);
    if (def.priority < 2) recentStarts.push(now);
  }

  return {
    async unlock(): Promise<void> {
      try {
        if (!ensureContext()) return;
        await resumeSafely();
        if (ctx && ctx.state !== 'running') await resumeSafely(); // a handle()-started attempt may have just failed
      } catch {
        /* never break the game */
      }
    },

    handle(event: SimEvent | UiCue, settings: AudioSettings): void {
      try {
        if (!settings.enabled || !(settings.volume > 0)) {
          if (active.length > 0) silence(); // muted mid-sound: stop at once
          return;
        }
        if (!ctx || !master) return;
        if (ctx.state !== 'running') {
          void resumeSafely(); // drop this sound; never queue it for later
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
          if (cue === 'loadStop' || cue === 'fire' || cue === 'runEnd' || cue === 'resultShow') stopHold();
          reqs = soundsForUiCue(event as UiCueExt);
        } else {
          reqs = soundsForSimEvent(event);
        }
        for (const r of reqs) play(r);
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
  };
}
