import type { Encore, FestivalBgmScene, Phase } from '../contracts';
import type { AudioContextLike, NodeLike, SourceLike } from './engine';

const BPM = { home: 104, aiming: 112, loading: 112, resolving: 118, lastShot: 124, encore: 128, result: 96 } as const;
const FUE = [587.33, 659.25, 783.99, 880, 987.77, 1174.66];
const MELODY = [3, -1, 4, 3, 2, -1, 1, 2, 3, -1, 5, -1, 4, 3, 2, -1,
  2, -1, 3, 4, 5, -1, 4, 3, 1, -1, 2, 1, 0, -1, -1, -1];
const CLOSING = [2, -1, -1, 3, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1, -1, -1,
  1, -1, 2, -1, 3, -1, 2, -1, 0, -1, -1, -1, -1, -1, -1, -1];
const ODAIKO = [2, 0, 0, 1, 2, 0, 1, 0, 2, 0, 2, 0, 1, 0, 1, 0];
const SHIME = [1, 0, 1, 2, 1, 0, 1, 2, 1, 1, 1, 2, 1, 0, 2, 0];
const KANE = [1, 0, 2, 0, 1, 0, 2, 1, 1, 0, 2, 0, 1, 1, 2, 0];
const LOOK_AHEAD = .12;
const MAX_MUSIC_SOURCES = 24;

export function resolveFestivalBgmScene(screen: string, paused: boolean, phase: Phase | undefined, ammo: number, encore: Encore | undefined): FestivalBgmScene {
  if (paused) return 'off';
  if (screen === 'home' || screen === 'result') return screen;
  if (screen !== 'game' || !phase || phase === 'abandoned') return 'off';
  if (phase === 'resolving' || phase === 'ended') return 'resolving';
  if (encore === 'offered' || encore === 'ready') return 'encore';
  if (phase === 'loading') return 'loading';
  if (ammo === 1) return 'lastShot';
  return 'aiming';
}

interface Note {
  readonly at: number;
  readonly sources: readonly SourceLike[];
  readonly dispose: () => void;
}

/** Score and ambience share the master volume but stay separate from one-shot effects. */
export function createFestivalBgm(ctx: AudioContextLike, destination: NodeLike, noise: unknown) {
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(destination);
  let scene: FestivalBgmScene = 'off';
  let timer: ReturnType<typeof setInterval> | null = null;
  let nextAt = 0;
  let step = 0;
  let duckUntil = 0;
  let ambience: { source: SourceLike; nodes: readonly NodeLike[] } | null = null;
  const notes = new Set<Note>();
  let sourceCount = 0;

  function setAmbience(wanted: boolean): void {
    if (wanted && !ambience) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const low = ctx.createBiquadFilter();
      low.type = 'bandpass';
      low.frequency.value = 620;
      low.Q.value = .65;
      const air = ctx.createGain();
      air.gain.value = .026;
      source.connect(low);
      low.connect(air);
      air.connect(bus);
      source.start();
      ambience = { source, nodes: [source, low, air] };
    } else if (!wanted && ambience) {
      ambience.source.stop();
      for (const node of ambience.nodes) node.disconnect();
      ambience = null;
    }
  }

  function register(at: number, duration: number, sources: readonly SourceLike[], nodes: readonly NodeLike[]): void {
    const lead = sources[0]!;
    const note: Note = {
      at, sources, dispose() {
        if (!notes.delete(note)) return;
        sourceCount -= sources.length;
        lead.onended = null;
        for (const node of nodes) node.disconnect();
      },
    };
    notes.add(note);
    sourceCount += sources.length;
    lead.onended = note.dispose;
    for (const source of sources) {
      source.start(at);
      source.stop(at + duration + .02);
    }
  }

  function cancelNotes(after = -Infinity): void {
    for (const note of notes) {
      if (note.at < after) continue;
      note.dispose();
      for (const source of note.sources) source.stop();
    }
  }

  function envelope(at: number, duration: number, peak: number, attack = .005) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(.0001, at);
    gain.gain.linearRampToValueAtTime(peak, at + attack);
    gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
    gain.connect(bus);
    return gain;
  }

  function drum(at: number, frequency: number, endHz: number, duration: number, level: number, rim = false): void {
    if (sourceCount >= MAX_MUSIC_SOURCES) return;
    const gain = envelope(at, duration, level);
    if (rim) {
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      source.buffer = noise;
      filter.type = 'bandpass';
      filter.frequency.value = frequency;
      filter.Q.value = 3.1;
      source.connect(filter);
      filter.connect(gain);
      register(at, duration, [source], [source, filter, gain]);
      return;
    }
    const source = ctx.createOscillator();
    source.type = frequency > 250 ? 'triangle' : 'sine';
    source.frequency.setValueAtTime(frequency, at);
    source.frequency.exponentialRampToValueAtTime(endHz, at + duration);
    source.connect(gain);
    register(at, duration, [source], [source, gain]);
  }

  function bell(at: number, frequency: number, duration: number, level: number): void {
    if (sourceCount + 2 > MAX_MUSIC_SOURCES) return;
    const fundamental = ctx.createOscillator();
    const overtone = ctx.createOscillator();
    const levelOfOvertone = ctx.createGain();
    const gain = envelope(at, duration, level, .003);
    fundamental.frequency.value = frequency;
    overtone.frequency.value = frequency * 2.76;
    levelOfOvertone.gain.value = .37;
    fundamental.connect(gain);
    overtone.connect(levelOfOvertone);
    levelOfOvertone.connect(gain);
    register(at, duration, [fundamental, overtone], [fundamental, overtone, levelOfOvertone, gain]);
  }

  function flute(at: number, frequency: number, duration: number, level: number): void {
    if (sourceCount + 2 > MAX_MUSIC_SOURCES) return;
    const source = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const bend = ctx.createGain();
    const gain = envelope(at, duration, level, .024);
    source.frequency.setValueAtTime(frequency * .984, at);
    source.frequency.linearRampToValueAtTime(frequency, at + .035);
    lfo.frequency.value = 5.8;
    bend.gain.value = frequency * .011;
    lfo.connect(bend);
    bend.connect(source.frequency);
    source.connect(gain);
    register(at, duration, [source, lfo], [source, lfo, bend, gain]);
  }

  function playStep(active: Exclude<FestivalBgmScene, 'off'>, at: number): void {
    const beat = step % 16;
    const melodyStep = step % 32;
    if (active === 'encore') {
      if (beat % 2 === 0) drum(at, 143, 56, .24, .098);
      else drum(at, 1920, 1, .06, .047, true);
      if (beat % 4 === 0) bell(at, 1380, .14, .035);
      return;
    }
    if (active !== 'result' && ODAIKO[beat] === 2) {
      drum(at, active === 'lastShot' ? 142 : 127, 56, .23, active === 'home' ? .052 : .079);
    } else if (active !== 'result' && ODAIKO[beat] === 1) {
      drum(at, 2090, 1, .052, active === 'home' ? .026 : .038, true);
    }
    const shime = SHIME[beat];
    if (active === 'loading' || (active !== 'home' && active !== 'result' && shime)) {
      drum(at, shime === 2 ? 362 : 312, 177, .075, active === 'lastShot' ? .045 : .031);
    }
    if (KANE[beat] && (active === 'aiming' || active === 'resolving' || active === 'lastShot')) {
      bell(at, KANE[beat] === 2 ? 1380 : 1180, KANE[beat] === 2 ? .15 : .06, .023);
    }
    if (active === 'result' && melodyStep === 0) bell(at, 1568, .48, .028);
    if (active === 'loading' || (active === 'home' && Math.floor(step / 32) % 2 === 1)) return;
    const note = (active === 'result' ? CLOSING : MELODY)[melodyStep]!;
    if (note >= 0) flute(at, FUE[note]!, active === 'result' ? .4 : .235, active === 'lastShot' ? .048 : .036);
  }

  function tick(): void {
    if (scene === 'off' || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (nextAt < now) nextAt = now + .025;
    while (nextAt < now + LOOK_AHEAD) {
      playStep(scene, nextAt);
      step++;
      nextAt += 15 / BPM[scene];
    }
  }

  function stop(): void {
    scene = 'off';
    if (timer) clearInterval(timer);
    timer = null;
    setAmbience(false);
    cancelNotes();
    const now = ctx.currentTime;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(1, now);
    duckUntil = 0;
    step = 0;
  }

  return {
    setScene(next: FestivalBgmScene) {
      if (next === 'off' || ctx.state !== 'running') {
        if (scene !== 'off') stop();
        return;
      }
      if (scene === next) return;
      const now = ctx.currentTime;
      cancelNotes(now);
      if (next === 'home' || next === 'result' || next === 'encore') step = 0;
      nextAt = now + .035;
      scene = next;
      setAmbience(scene === 'home' || scene === 'aiming' || scene === 'result');
      if (!timer) timer = setInterval(tick, 25);
      tick();
    },
    duck(duration: number) {
      if (scene === 'off') return;
      const now = ctx.currentTime;
      const end = Math.max(duckUntil, now + duration);
      bus.gain.cancelScheduledValues(now);
      bus.gain.setValueAtTime(now < duckUntil ? .5 : bus.gain.value, now);
      bus.gain.linearRampToValueAtTime(.5, now + .025);
      bus.gain.setValueAtTime(.5, end - .13);
      bus.gain.linearRampToValueAtTime(1, end);
      duckUntil = end;
    },
    dispose() {
      stop();
      bus.disconnect();
    },
  };
}
