/**
 * Synthesized sound definitions and the event -> sound mapping (Task 13).
 *
 * No external audio files: every sound is a short list of oscillator "tones"
 * and filtered-noise "bursts" rendered by engine.ts. Everything here is data
 * plus pure mapping functions so it can be tested without any AudioContext.
 * Sounds never carry game information that is not also on screen (a sound is
 * never the only way to learn a result).
 *
 * priority: 0 = ambient contact detail (may be dropped), 1 = game event,
 *           2 = UI / result (never starved by a flood of contacts).
 */
import type { SimEvent, SimEventType, UiCue } from '../contracts';

export type LoadTier = 'perfect' | 'good' | 'normal' | 'weak';

/** UiCue with the optional extra fields the audio engine understands (see audio-ledger.md "contract proposals"). */
export type UiCueExt = UiCue & { readonly tier?: LoadTier; /** collect: chain count of the shot */ readonly count?: number };

export type UiCueName = UiCue['cue'];

export interface Tone {
  readonly kind: 'tone';
  readonly wave: 'sine' | 'triangle' | 'square' | 'sawtooth';
  readonly f0: number;
  readonly f1?: number;
  readonly at: number;
  readonly dur: number;
  readonly gain: number;
}
export interface NoiseBurst {
  readonly kind: 'noise';
  readonly filter: 'lowpass' | 'highpass' | 'bandpass';
  readonly freq: number;
  readonly q?: number;
  readonly at: number;
  readonly dur: number;
  readonly gain: number;
}
export type Voice = Tone | NoiseBurst;

export interface SoundDef {
  readonly priority: 0 | 1 | 2;
  /** Minimum seconds between two starts of this same sound. */
  readonly minGapSec: number;
  /** Held until loadStop / fire / silence (the load charge). */
  readonly hold?: boolean;
  readonly voices: readonly Voice[];
}

const t = (wave: Tone['wave'], f0: number, at: number, dur: number, gain: number, f1?: number): Tone => ({ kind: 'tone', wave, f0, at, dur, gain, ...(f1 !== undefined ? { f1 } : {}) });
const n = (filter: NoiseBurst['filter'], freq: number, at: number, dur: number, gain: number, q?: number): NoiseBurst => ({ kind: 'noise', filter, freq, at, dur, gain, ...(q !== undefined ? { q } : {}) });
const def = (priority: 0 | 1 | 2, minGapSec: number, voices: Voice[], hold?: boolean): SoundDef => ({ priority, minGapSec, voices, ...(hold ? { hold } : {}) });

export const SOUNDS = {
  // ---- UI
  'ui.select': def(2, 0.05, [t('sine', 880, 0, 0.06, 0.3)]),
  'ui.confirm': def(2, 0.08, [t('sine', 660, 0, 0.08, 0.3), t('sine', 990, 0.07, 0.12, 0.3)]),
  'ui.cancel': def(2, 0.08, [t('sine', 520, 0, 0.07, 0.28, 400), t('sine', 330, 0.06, 0.1, 0.25)]),
  'ui.start': def(2, 0.3, [t('triangle', 523, 0, 0.12, 0.3), t('triangle', 659, 0.1, 0.12, 0.3), t('triangle', 784, 0.2, 0.25, 0.32), n('highpass', 6000, 0.2, 0.08, 0.06)]),
  // ---- loading (held charge + tiered stop)
  'load.charge': def(1, 0.1, [t('sine', 220, 0, 3, 0.1, 880), t('triangle', 110, 0, 3, 0.06, 440)], true),
  'load.stop.perfect': def(2, 0.1, [t('sine', 1568, 0, 0.3, 0.3), t('sine', 2093, 0.04, 0.35, 0.22), t('triangle', 784, 0, 0.2, 0.15)]),
  'load.stop.good': def(2, 0.1, [t('sine', 1175, 0, 0.22, 0.28), t('triangle', 587, 0, 0.15, 0.12)]),
  'load.stop.normal': def(2, 0.1, [t('sine', 880, 0, 0.12, 0.22)]),
  'load.stop.weak': def(2, 0.1, [t('triangle', 330, 0, 0.14, 0.25, 250)]),
  fire: def(2, 0.08, [n('lowpass', 1400, 0, 0.06, 0.55), t('sine', 320, 0, 0.12, 0.45, 80)]),
  // ---- material hits (prize or surface)
  'hit.wood': def(0, 0.04, [t('sine', 520, 0, 0.07, 0.4, 240), n('bandpass', 1800, 0, 0.03, 0.25, 2)]),
  'hit.cloth': def(0, 0.05, [n('lowpass', 500, 0, 0.1, 0.35)]),
  'hit.paper': def(0, 0.05, [n('highpass', 3000, 0, 0.07, 0.2), n('bandpass', 2500, 0.01, 0.06, 0.15, 1)]),
  'hit.metal': def(0, 0.05, [t('triangle', 1760, 0, 0.22, 0.25), t('sine', 2640, 0, 0.15, 0.12)]),
  'hit.plastic': def(0, 0.04, [t('square', 880, 0, 0.06, 0.12, 660), n('bandpass', 3500, 0, 0.03, 0.15, 2)]),
  'hit.glass': def(0, 0.05, [t('sine', 2400, 0, 0.25, 0.2), t('sine', 3200, 0, 0.2, 0.1)]),
  'hit.ceramic': def(0, 0.05, [t('triangle', 1200, 0, 0.12, 0.3, 900), n('bandpass', 4000, 0, 0.02, 0.15, 3)]),
  'hit.rubber': def(0, 0.05, [t('sine', 300, 0, 0.1, 0.35, 520)]),
  'hit.deviceDull': def(0, 0.06, [t('sine', 200, 0, 0.05, 0.2)]),
  reflect: def(0, 0.06, [t('sine', 1400, 0, 0.04, 0.12, 1000)]),
  chainTap: def(0, 0.08, [t('sine', 640, 0, 0.04, 0.1, 480)]),
  // ---- shopkeeper
  'shop.hat': def(1, 0.12, [t('sine', 700, 0, 0.09, 0.3, 1000), t('sine', 500, 0.08, 0.1, 0.2, 800)]),
  'shop.fan': def(1, 0.12, [n('bandpass', 2000, 0, 0.18, 0.22, 1), t('triangle', 1200, 0, 0.1, 0.12, 1500)]),
  'shop.body': def(1, 0.12, [t('sine', 140, 0, 0.16, 0.55, 90), n('lowpass', 400, 0, 0.06, 0.2)]),
  'shop.feet': def(1, 0.12, [t('sine', 330, 0, 0.05, 0.3, 250), t('sine', 330, 0.07, 0.05, 0.3, 250)]),
  hidden: def(1, 0.2, [t('sine', 1318, 0, 0.3, 0.25), t('sine', 1760, 0.06, 0.35, 0.2)]),
  // ---- devices
  split: def(1, 0.15, [t('sine', 1000, 0, 0.1, 0.3, 1400), t('sine', 1500, 0.05, 0.12, 0.25, 2000), n('highpass', 5000, 0, 0.06, 0.15)]),
  power: def(1, 0.15, [t('sawtooth', 200, 0, 0.25, 0.2, 800), t('sine', 90, 0, 0.2, 0.4)]),
  transformArm: def(1, 0.15, [t('triangle', 700, 0, 0.08, 0.25, 900)]),
  penalty: def(1, 0.2, [t('square', 220, 0, 0.3, 0.2, 110), t('square', 207, 0, 0.3, 0.15, 104)]),
  ammo: def(1, 0.15, [t('sine', 988, 0, 0.09, 0.3), t('sine', 1319, 0.08, 0.25, 0.3)]),
  bulletChange: def(1, 0.15, [t('triangle', 600, 0, 0.08, 0.25, 900), t('triangle', 900, 0.08, 0.1, 0.25, 1200), t('triangle', 1200, 0.16, 0.12, 0.25)]),
  transform: def(1, 0.3, [t('sine', 523, 0, 0.1, 0.25), t('sine', 659, 0.08, 0.1, 0.25), t('sine', 784, 0.16, 0.1, 0.25), t('sine', 1047, 0.24, 0.3, 0.28), n('highpass', 7000, 0.2, 0.15, 0.08)]),
  // ---- settlement
  collectDrop: def(0, 0.1, [t('sine', 700, 0, 0.08, 0.2, 300)]),
  collect: def(2, 0.15, [t('sine', 1047, 0, 0.3, 0.3), t('sine', 1319, 0.05, 0.3, 0.22)]),
  chain: def(2, 0.3, [t('triangle', 784, 0, 0.1, 0.25), t('triangle', 988, 0.09, 0.1, 0.25), t('triangle', 1319, 0.18, 0.3, 0.28)]),
  setComplete: def(2, 0.5, [t('triangle', 523, 0, 0.14, 0.3), t('triangle', 659, 0.12, 0.14, 0.3), t('triangle', 784, 0.24, 0.14, 0.3), t('triangle', 1047, 0.36, 0.5, 0.34), n('highpass', 6000, 0.36, 0.2, 0.08)]),
  setDiscovered: def(2, 0.5, [t('sine', 2093, 0, 0.12, 0.2), t('sine', 2637, 0.09, 0.12, 0.2), t('sine', 3136, 0.18, 0.35, 0.2)]),
  nearMiss: def(2, 0.3, [t('sine', 700, 0, 0.12, 0.22, 520), t('sine', 520, 0.12, 0.18, 0.2, 440)]),
  miss: def(2, 0.3, [t('triangle', 300, 0, 0.25, 0.22, 200)]),
  runEnd: def(2, 0.8, [t('triangle', 523, 0, 0.18, 0.28), t('triangle', 440, 0.2, 0.18, 0.28), t('triangle', 349, 0.4, 0.18, 0.28), t('triangle', 262, 0.6, 0.5, 0.3), n('lowpass', 300, 0.6, 0.2, 0.15)]),
  resultShow: def(2, 0.8, [t('sine', 784, 0, 0.2, 0.22), t('sine', 1047, 0.12, 0.35, 0.22)]),
  newBest: def(2, 1, [t('triangle', 784, 0, 0.12, 0.3), t('triangle', 988, 0.1, 0.12, 0.3), t('triangle', 1175, 0.2, 0.12, 0.3), t('triangle', 1568, 0.3, 0.5, 0.34), t('sine', 2093, 0.3, 0.5, 0.15), n('highpass', 6000, 0.3, 0.25, 0.08)]),
} as const satisfies Record<string, SoundDef>;

export type SoundId = keyof typeof SOUNDS;

export interface SoundRequest {
  readonly id: SoundId;
  /** 0..1.3 relative loudness (e.g. from cork speed). */
  readonly gain: number;
}
const req = (id: SoundId, gain = 1): SoundRequest => ({ id, gain });

// ------------------------------------------------------------- SimEvent map

/** Every SimEvent type is either given a sound or explicitly silent (docs/design/audio-ledger.md). */
export const SIM_EVENT_POLICY: Record<SimEventType, 'sound' | 'silent'> = {
  impact: 'sound',
  prizeContact: 'sound',
  projectileSpawned: 'silent', // the "fire" UiCue already sounded the shot
  projectileEnded: 'silent', // a stopping cork needs no sound; 'split' is voiced by deviceActivated
  deviceActivated: 'sound',
  prizeDamaged: 'silent', // the impact that caused it already sounded
  prizeReachedCollection: 'sound',
  prizeTransformed: 'sound',
  shotStage: 'silent',
};

const DEVICE_SOUND = {
  split: 'split',
  power: 'power',
  transform: 'transformArm',
  penalty: 'penalty',
  ammo: 'ammo',
  bulletType: 'bulletChange',
} as const satisfies Record<string, SoundId>;

const MATERIAL_SOUND = {
  wood: 'hit.wood',
  cloth: 'hit.cloth',
  paper: 'hit.paper',
  metal: 'hit.metal',
  plastic: 'hit.plastic',
  glass: 'hit.glass',
  ceramic: 'hit.ceramic',
  rubber: 'hit.rubber',
} as const satisfies Record<string, SoundId>;

const PART_SOUND = { hat: 'shop.hat', fan: 'shop.fan', body: 'shop.body', feet: 'shop.feet' } as const satisfies Record<string, SoundId>;

const NONE: readonly SoundRequest[] = [];

export function soundsForSimEvent(ev: SimEvent): readonly SoundRequest[] {
  switch (ev.type) {
    case 'impact': {
      const gain = Math.min(1.3, 0.55 + ev.speed / 16);
      const out: SoundRequest[] = [];
      const t = ev.target;
      switch (t.kind) {
        case 'prize':
        case 'surface':
          out.push(req(MATERIAL_SOUND[t.material], gain));
          break;
        case 'device':
          // An activating contact is voiced by deviceActivated; a repeat contact is the ordinary small sound.
          if (!t.activated) out.push(req('hit.deviceDull', gain));
          break;
        case 'shopkeeper':
          out.push(req(PART_SOUND[t.part], gain));
          break;
        case 'hidden':
          out.push(req('hidden', gain));
          break;
        case 'cell':
          // EG09 gives a used/unused cell its own short cue; until then the dull device sound.
          out.push(req('hit.deviceDull', gain));
          break;
      }
      if (ev.reflectionIndex > 0 && t.kind === 'surface') out.push(req('reflect', gain));
      return out;
    }
    case 'prizeContact':
      return [req('chainTap', Math.min(1, 0.4 + ev.impulse * 0.1))];
    case 'deviceActivated':
      return [req(DEVICE_SOUND[ev.deviceKind])];
    case 'prizeReachedCollection':
      return [req('collectDrop')];
    case 'prizeTransformed':
      return [req('transform')];
    case 'projectileSpawned':
    case 'projectileEnded':
    case 'prizeDamaged':
    case 'shotStage':
      return NONE;
  }
}

// -------------------------------------------------------------- UiCue map

/** The primary sound of each cue (extras such as tier / chain are in soundsForUiCue). */
export const UI_CUE_SOUND: Record<UiCueName, SoundId> = {
  select: 'ui.select',
  confirm: 'ui.confirm',
  cancel: 'ui.cancel',
  start: 'ui.start',
  loadStart: 'load.charge',
  loadStop: 'load.stop.normal',
  fire: 'fire',
  resultShow: 'resultShow',
  newBest: 'newBest',
  setDiscovered: 'setDiscovered',
  setComplete: 'setComplete',
  runEnd: 'runEnd',
  miss: 'miss',
  nearMiss: 'nearMiss',
  collect: 'collect',
  penalty: 'penalty',
  ammoBonus: 'ammo',
};

const TIER_SOUND: Record<LoadTier, SoundId> = {
  perfect: 'load.stop.perfect',
  good: 'load.stop.good',
  normal: 'load.stop.normal',
  weak: 'load.stop.weak',
};

export function soundsForUiCue(cue: UiCueExt): readonly SoundRequest[] {
  switch (cue.cue) {
    case 'loadStop':
      return [req(TIER_SOUND[cue.tier ?? 'normal'])];
    case 'collect':
      return (cue.count ?? 1) >= 2 ? [req('collect'), req('chain')] : [req('collect')];
    default:
      return [req(UI_CUE_SOUND[cue.cue])];
  }
}
