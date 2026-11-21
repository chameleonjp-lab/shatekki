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
export type UiCueExt = (UiCue | ExpansionUiCue) & { readonly tier?: LoadTier; /** collect: chain count of the shot */ readonly count?: number };

/**
 * Cues of the expanded gameplay (D34-D37). Kept in a local union until the
 * lead adds the same names to `UiCue` in src/contracts/ports.ts (the audio
 * engine already understands them); see docs/design/audio-ledger.md.
 */
export const EXPANSION_CUE_NAMES = ['questionShown', 'answerAccepted', 'effectGood', 'effectRisky', 'effectNeutral', 'assortmentChanged', 'outlineShown'] as const;
export type ExpansionCueName = (typeof EXPANSION_CUE_NAMES)[number];
export interface ExpansionUiCue {
  readonly type: 'ui';
  readonly cue: ExpansionCueName;
}

export type UiCueName = UiCue['cue'] | ExpansionCueName;

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

export const FESTIVAL_GIMMICK_SOUNDS = {
  'festival.lantern.1': def(1, 0.08, [
    t('sine', 420, 0, 0.06, 0.24, 240),
    t('sine', 1175, 0.01, 0.14, 0.18),
    t('sine', 3240, 0.01, 0.09, 0.08),
  ]),
  'festival.lantern.2': def(1, 0.08, [
    t('sine', 480, 0, 0.06, 0.26, 280),
    t('sine', 1319, 0.01, 0.15, 0.20),
    t('sine', 3640, 0.01, 0.10, 0.09),
  ]),
  'festival.relay': def(2, 0.25, [
    n('bandpass', 3200, 0.00, 0.022, 0.34, 4.5), t('sine', 2950, 0.00, 0.04, 0.22),
    n('bandpass', 3400, 0.07, 0.022, 0.36, 4.5), t('sine', 3120, 0.07, 0.04, 0.24),
    t('sine', 142, 0.13, 0.28, 0.68, 56), n('lowpass', 320, 0.13, 0.12, 0.34),
    t('sine', 1568, 0.14, 0.24, 0.22), t('sine', 2349, 0.19, 0.32, 0.20),
  ]),

  'festival.kohaku.red': def(1, 0.10, [
    n('bandpass', 2700, 0, 0.024, 0.32, 4.0),
    t('sine', 2480, 0, 0.045, 0.20),
    t('sine', 880, 0.02, 0.18, 0.16),
  ]),
  'festival.kohaku.white': def(1, 0.10, [
    n('bandpass', 3450, 0, 0.024, 0.32, 4.2),
    t('sine', 3180, 0, 0.045, 0.20),
    t('sine', 1175, 0.02, 0.18, 0.16),
  ]),
  'festival.kohaku.both': def(2, 0.30, [
    n('bandpass', 3100, 0.00, 0.02, 0.32, 4.4),
    n('bandpass', 3100, 0.07, 0.02, 0.32, 4.4),
    n('bandpass', 3500, 0.14, 0.028, 0.38, 4.6),
    t('sine', 1175, 0.14, 0.12, 0.26),
    t('sine', 1760, 0.24, 0.30, 0.30),
    t('sine', 136, 0.24, 0.28, 0.62, 58),
  ]),

  'festival.bell.1': def(2, 0.12, [
    t('sine', 587, 0, .34, .34), t('sine', 1620, 0, .18, .15), t('sine', 2465, 0, .105, .075),
    n('highpass', 5800, 0, .03, .12),
  ]),
  'festival.bell.2': def(2, 0.12, [
    t('sine', 659, 0, .34, .36), t('sine', 1819, 0, .18, .16), t('sine', 2768, 0, .105, .078),
    n('highpass', 6000, 0, .03, .12),
  ]),
  'festival.bell.3': def(2, 0.12, [
    t('sine', 880, 0, .38, .38), t('sine', 2429, 0, .20, .18), t('sine', 3696, 0, .11, .081),
    n('highpass', 6400, 0, .035, .14),
  ]),
  'festival.bell.wrong': def(1, 0.15, [
    t('sine', 420, 0, 0.08, 0.30, 310),
    n('bandpass', 1200, 0, 0.022, 0.16, 3.0),
  ]),
  'festival.open': def(2, 0.25, [
    n('bandpass', 2400, 0.00, 0.18, 0.22, 0.9),
    n('bandpass', 3300, 0.08, 0.025, 0.34, 4.5),
    t('sine', 1175, 0.10, 0.12, 0.24),
    t('sine', 1568, 0.20, 0.28, 0.28),
  ]),
  'festival.bell.prize': def(2, 0.28, [
    t('sine', 1175, 0.00, 0.24, 0.28), t('sine', 3243, 0.00, 0.14, 0.12),
    t('sine', 1760, 0.08, 0.30, 0.30), t('sine', 2349, 0.16, 0.36, 0.26),
    t('sine', 138, 0.16, 0.30, 0.65, 55),
  ]),

  'festival.daruma.eye': def(1, 0.12, [
    n('bandpass', 3600, 0.00, 0.055, 0.18, 1.4),
    t('sine', 520, 0.04, 0.09, 0.32, 390),
    n('bandpass', 1450, 0.04, 0.025, 0.18, 2.8),
  ]),
  'festival.daruma.done': def(2, 0.35, [
    t('sine', 118, 0.00, 0.38, 0.76, 48), n('lowpass', 260, 0.00, 0.16, 0.40),
    n('bandpass', 3300, 0.12, 0.024, 0.34, 4.6),
    n('bandpass', 3500, 0.22, 0.028, 0.38, 4.6),
    n('highpass', 4800, 0.22, 0.34, 0.14),
    t('sine', 1760, 0.22, 0.38, 0.28),
  ]),

  'festival.giant.drop': def(2, 0.35, [
    t('sine', 96, 0.00, 0.45, 0.80, 42),
    n('lowpass', 220, 0.00, 0.22, 0.46),
    t('sine', 135, 0.18, 0.34, 0.68, 52),
    n('bandpass', 3200, 0.32, 0.028, 0.38, 4.5),
  ]),

  'festival.fuse': def(2, .4, [
    n('highpass', 3800, 0, .19, .20),
    t('sine', 520, .16, .14, .16, 1680),
    t('sine', 112, .30, .36, .65, 48),
    n('bandpass', 950, .30, .24, .37, .8),
    ...[.41, .47, .56, .69].map((at, i) => n('highpass', 5600 - i * 510, at, .105, .18 - i * .029)),
  ]),

  'festival.encore': def(2, 0.45, [
    n('bandpass', 3400, 0.00, 0.022, 0.36, 4.6),
    n('bandpass', 3600, 0.07, 0.024, 0.38, 4.6),
    t('sine', 142, 0.12, 0.22, 0.70, 58),
    t('sine', 134, 0.24, 0.24, 0.74, 54),
    t('sine', 124, 0.36, 0.40, 0.80, 46),
    t('sine', 1175, 0.14, 0.10, 0.26),
    t('sine', 1568, 0.24, 0.12, 0.28),
    t('sine', 2349, 0.36, 0.50, 0.34),
    n('highpass', 5800, 0.40, 0.45, 0.20),
  ]),
} as const satisfies Record<string, SoundDef>;

export const FESTIVAL_CORE_OVERRIDES = {
  'festival.ui.select':  def(2, 0.05, [n('bandpass', 2200, 0, 0.018, 0.22, 3.0), t('sine', 960, 0, 0.035, 0.18, 720)]),
  'festival.ui.confirm': def(2, 0.08, [n('bandpass', 3200, 0, 0.022, 0.30, 4.5), t('sine', 2950, 0, 0.04, 0.18)]),
  'festival.ui.cancel':  def(2, 0.08, [t('sine', 420, 0, 0.07, 0.24, 280), n('bandpass', 1100, 0, 0.02, 0.14, 2.5)]),
  'festival.ui.start':   def(2, 0.30, [
    n('bandpass', 3200, 0.00, 0.02, 0.32, 4.5), n('bandpass', 3500, 0.08, 0.025, 0.36, 4.5),
    t('sine', 142, 0.16, 0.30, 0.68, 56), t('sine', 1175, 0.16, 0.12, 0.22), t('sine', 1760, 0.26, 0.26, 0.26),
  ]),
  'festival.reflect.tray': def(1, 0.05, [
    n('highpass', 5400, 0, 0.018, 0.24),
    t('sine', 1520, 0, 0.26, 0.28),
    t('triangle', 4195, 0, 0.18, 0.15),
  ]),
  'festival.shop.feet': def(1, 0.12, [
    n('bandpass', 2400, 0.00, 0.02, 0.26, 3.2), t('sine', 680, 0.00, 0.05, 0.26, 480),
    n('bandpass', 2700, 0.08, 0.02, 0.26, 3.2), t('sine', 760, 0.08, 0.05, 0.26, 540),
  ]),
  'festival.newBest': def(2, 0.8, [
    n('bandpass', 2600, 0.00, 0.035, 0.42, 2.2),               // 木札割れ「パキッ！」
    n('bandpass', 1900, 0.04, 0.045, 0.38, 1.8),               // 「バキッ！」
    t('sine', 138, 0.12, 0.36, 0.76, 48),                      // 大太鼓「ドォン！」
    t('sine', 1175, 0.14, 0.12, 0.26), t('sine', 1568, 0.24, 0.12, 0.28), t('sine', 2349, 0.34, 0.50, 0.34),
    n('highpass', 5800, 0.36, 0.44, 0.20),
  ]),
  'festival.runEnd': def(2, 0.8, [
    t('sine', 112, 0.00, 0.48, 0.55, 52),
    t('sine', 1568, 0.22, 0.55, 0.22),
    t('sine', 2351, 0.22, 0.32, 0.10),
    t('sine', 1175, 0.48, 0.65, 0.20),
  ]),
  'festival.load.charge': def(1, .1, [
    t('triangle', 92, 0, 3, .055, 267), n('bandpass', 1160, 0, .22, .14, 2.2),
  ], true),
  'festival.load.perfect': def(2, .1, [t('sine', 1568, 0, .26, .25), t('sine', 4328, 0, .16, .10), t('sine', 2349, .07, .27, .2)]),
  'festival.load.good': def(2, .1, [n('bandpass', 2750, 0, .03, .2, 3), t('sine', 1175, .03, .18, .21)]),
  'festival.load.normal': def(2, .1, [n('bandpass', 2200, 0, .03, .2, 3), t('sine', 660, 0, .065, .14, 470)]),
  'festival.load.weak': def(2, .1, [n('bandpass', 1060, 0, .035, .17, 2), t('sine', 390, 0, .09, .19, 280)]),
  'festival.load.latch': def(1, .1, [n('highpass', 6100, 0, .027, .19), t('sine', 2140, 0, .046, .18, 1660)]),
  'festival.shop.hat': def(1, .12, [t('sine', 710, 0, .09, .3, 440), n('bandpass', 1620, .008, .055, .19, 1.8)]),
  'festival.shop.fan': def(1, .095, [n('bandpass', 1750, 0, .08, .29, 2.1), n('highpass', 3400, .035, .12, .16)]),
  'festival.shop.body': def(1, .12, [n('lowpass', 530, 0, .11, .32), t('sine', 192, 0, .11, .22, 109)]),
  'festival.speech': def(1, .4, [n('bandpass', 3630, 0, .10, .11, 1.2), n('bandpass', 2180, .058, .08, .075, 1.7)]),
  'festival.lastShot': def(2, .6, [
    n('bandpass', 3210, 0, .027, .33, 4),
    ...[.09, .19, .32].map((at, i) => t('sine', 128 - i * 4, at, .22, .48 + i * .05, 54)),
    t('sine', 1175, .11, .12, .23, 1319), t('sine', 1760, .28, .26, .22, 1976),
  ]),
  'festival.set.complete': def(2, .5, [
    t('sine', 128, 0, .24, .45, 60), n('bandpass', 3450, .065, .022, .22, 3.2),
    t('sine', 1175, .035, .14, .2), t('sine', 1568, .13, .16, .25), t('sine', 1760, .25, .28, .23), t('sine', 4858, .25, .16, .09),
  ]),
  'festival.set.discovered': def(2, .5, [
    t('sine', 135, 0, .25, .57, 52), n('lowpass', 510, 0, .1, .22),
    t('sine', 1976, .16, .26, .26), t('sine', 5454, .18, .16, .12),
    n('bandpass', 835, .28, .16, .24, 1.1), n('highpass', 5950, .35, .29, .16),
  ]),
  'festival.result': def(2, .7, [t('sine', 1175, 0, .45, .21), t('sine', 3243, 0, .20, .10), t('sine', 880, .2, .39, .18)]),
  'festival.challenge': def(2, .27, [
    n('bandpass', 3130, 0, .025, .31, 4), t('sine', 142, .08, .21, .43, 56),
    t('sine', 1175, .08, .13, .2), t('sine', 1568, .19, .23, .24),
  ]),
} as const satisfies Record<string, SoundDef>;

export const SOUNDS = {
  ...FESTIVAL_GIMMICK_SOUNDS,
  ...FESTIVAL_CORE_OVERRIDES,
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
  // ---- expanded gameplay (cells, question, effect results)
  'cell.activate': def(1, 0.15, [t('triangle', 1397, 0, 0.1, 0.28, 1760), t('sine', 2093, 0.06, 0.18, 0.18), n('bandpass', 3200, 0, 0.03, 0.12, 2)]),
  'question.show': def(2, 0.5, [t('triangle', 659, 0, 0.1, 0.22), t('triangle', 880, 0.1, 0.2, 0.22)]),
  'answer.accept': def(2, 0.1, [t('sine', 1100, 0, 0.05, 0.26), t('sine', 1480, 0.05, 0.1, 0.26)]),
  'effect.good': def(2, 0.3, [t('sine', 659, 0, 0.09, 0.26), t('sine', 831, 0.07, 0.09, 0.26), t('sine', 988, 0.14, 0.25, 0.28)]),
  'effect.risky': def(2, 0.3, [t('triangle', 392, 0, 0.12, 0.26, 330), t('triangle', 294, 0.11, 0.25, 0.26, 247)]),
  'effect.neutral': def(2, 0.3, [t('sine', 740, 0, 0.22, 0.24), t('sine', 740, 0.12, 0.2, 0.1)]),
  'assortment.change': def(2, 0.4, [t('triangle', 523, 0, 0.1, 0.2, 784), t('triangle', 784, 0.09, 0.1, 0.2, 1175), t('sine', 1568, 0.2, 0.25, 0.2), n('highpass', 6500, 0.18, 0.18, 0.08)]),
  'outline.show': def(2, 0.4, [t('sine', 1568, 0, 0.1, 0.2), t('sine', 1976, 0.1, 0.18, 0.2), n('highpass', 7500, 0, 0.04, 0.07)]),
  // ---- rewards (plan P1/P3): one prize "kotón", 2-3 rising xylophone notes, 4+ a short taiko; a festival flourish
  'take.1': def(2, 0.15, [t('sine', 392, 0, 0.1, 0.32, 262), n('lowpass', 900, 0, 0.04, 0.18)]),
  'take.2': def(2, 0.2, [t('triangle', 1047, 0, 0.09, 0.28), t('triangle', 1319, 0.08, 0.16, 0.28)]),
  'take.3': def(2, 0.25, [t('triangle', 1047, 0, 0.08, 0.28), t('triangle', 1319, 0.07, 0.08, 0.28), t('triangle', 1568, 0.14, 0.18, 0.3)]),
  'take.taiko': def(2, 0.3, [t('sine', 120, 0, 0.28, 0.65, 70), n('lowpass', 260, 0, 0.12, 0.3), t('sine', 98, 0.14, 0.2, 0.4, 60)]),
  'reward.chime': def(2, 0.3, [t('sine', 1568, 0, 0.42, 0.22), t('sine', 2351, 0, 0.21, 0.12)]),
  // r007: a short paper rustle when the shopkeeper's bubble appears (never a voice)
  'speech.paper': def(2, 0.4, [n('bandpass', 3800, 0, 0.07, 0.07, 1.4), n('bandpass', 2600, 0.05, 0.06, 0.05, 1.2)]),
  'load.latch': def(1, 0.1, [t('square', 2400, 0, 0.025, 0.14, 1800), n('highpass', 5500, 0, 0.03, 0.12)]),
  'lastShot.hayashi': def(2, 0.6, [t('sine', 1568, 0, 0.1, 0.24, 1760), t('sine', 1760, 0.1, 0.1, 0.24), t('sine', 2093, 0.2, 0.22, 0.24), t('sine', 140, 0, 0.12, 0.45, 90), t('sine', 140, 0.22, 0.12, 0.4, 90)]),
  // Internal candidate: trigger, falling cork pop and a short wooden tail.
  'festival.fire': def(2, 0.08, [
    n('bandpass', 4080, 0, .021, .30, 3.6),
    t('triangle', 1510, 0, .029, .12, 630),
    n('bandpass', 1520, .012, .053, .43, 1.6),
    t('sine', 430, .012, .086, .46, 91),
    n('bandpass', 780, .034, .064, .20, 2.4),
    t('triangle', 194, .034, .098, .21, 64),
  ]),
  'festival.creak': def(1, .12, [n('bandpass', 495, 0, .23, .31, 2.8), t('triangle', 106, 0, .18, .23, 64), n('lowpass', 330, .035, .16, .27)]),
  'festival.drop.1': def(1, .06, [n('bandpass', 2840, 0, .025, .24, 3.5), t('sine', 810, .003, .069, .22, 560)]),
  'festival.drop.2': def(1, .06, [t('sine', 1175, 0, .13, .23, 1319), t('sine', 1568, .063, .14, .19, 1760)]),
  'festival.drop.3': def(1, .08, [t('sine', 146, 0, .22, .48, 60), n('lowpass', 480, 0, .09, .15), t('sine', 1760, .062, .19, .21, 1976)]),
  'festival.drop.4': def(1, .1, [t('sine', 132, 0, .25, .52, 55), t('sine', 120, .11, .24, .34, 52), t('sine', 1976, .13, .25, .21), t('sine', 3370, .12, .13, .10)]),
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
  readonly durationScale?: number;
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
  festival: 'sound',
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
const FESTIVAL_PART_SOUND = { hat: 'festival.shop.hat', fan: 'festival.shop.fan', body: 'festival.shop.body', feet: 'festival.shop.feet' } as const satisfies Record<keyof typeof PART_SOUND, SoundId>;

const NONE: readonly SoundRequest[] = [];

const FESTIVAL_BELL_NOTES = ['festival.bell.1', 'festival.bell.2', 'festival.bell.3'] as const;
const FESTIVAL_DROPS = ['festival.drop.1', 'festival.drop.2', 'festival.drop.3', 'festival.drop.4'] as const;

export function soundsForSimEvent(ev: SimEvent, festivalDropCount = 0, festival = false): readonly SoundRequest[] {
  switch (ev.type) {
    case 'impact': {
      const gain = Math.min(1.3, 0.55 + ev.speed / 16);
      const out: SoundRequest[] = [];
      const t = ev.target;
      switch (t.kind) {
        case 'prize':
          out.push(req(MATERIAL_SOUND[t.material], gain));
          break;
        case 'surface':
          if (festival && t.surfaceId === 'reflector-tray') return [req('festival.reflect.tray', gain)];
          out.push(req(MATERIAL_SOUND[t.material], gain));
          if (ev.reflectionIndex > 0) out.push(req('reflect', gain));
          break;
        case 'device':
          // An activating contact is voiced by deviceActivated; a repeat contact is the ordinary small sound.
          if (!t.activated) out.push(req('hit.deviceDull', gain));
          break;
        case 'shopkeeper':
          out.push(req((festival ? FESTIVAL_PART_SOUND : PART_SOUND)[t.part], gain));
          break;
        case 'hidden':
          out.push(req('hidden', gain));
          break;
        case 'cell':
          // The contact that activates a cell has its own cue; a used cell is only the ordinary small reflection.
          out.push(req(t.activated ? 'cell.activate' : 'hit.deviceDull', gain));
          break;
      }
      return out;
    }
    case 'prizeContact':
      return [req('chainTap', Math.min(1, 0.4 + ev.impulse * 0.1))];
    case 'deviceActivated':
      return [req(DEVICE_SOUND[ev.deviceKind])];
    case 'prizeReachedCollection':
      return [req(festivalDropCount > 0 ? FESTIVAL_DROPS[Math.min(festivalDropCount, FESTIVAL_DROPS.length) - 1]! : 'collectDrop')];
    case 'prizeTransformed':
      return [req('transform')];
    case 'festival':
      switch (ev.mark) {
        case 'lantern': return [req((ev.amount ?? 1) >= 2 ? 'festival.lantern.2' : 'festival.lantern.1')];
        case 'relay': return [req('festival.relay')];
        case 'red': return [req('festival.kohaku.red')];
        case 'white': return [req('festival.kohaku.white')];
        case 'red-white': return [req('festival.kohaku.both')];
        case 'bell': return [req(FESTIVAL_BELL_NOTES[(ev.amount ?? 1) - 1] ?? FESTIVAL_BELL_NOTES[0])];
        case 'bell-wrong': return [req('festival.bell.wrong')];
        case 'bell-open': return [req('festival.open')];
        case 'bell-prize': return [req('festival.bell.prize')];
        case 'eye-left':
        case 'eye-right': return [req('festival.daruma.eye')];
        case 'daruma': return [req('festival.daruma.done')];
        case 'giant-slide': {
          const distance = Math.max(0, ev.amount ?? 0);
          return [{ id: 'festival.creak', gain: Math.min(1.15, .32 + distance * 5), durationScale: Math.min(1.4, .8 + distance * 4) }];
        }
        case 'giant-drop': return [req('festival.giant.drop')];
        case 'fuse': return [req('festival.fuse')];
        case 'encore': return [req('festival.encore')];
      }
      break;
    case 'projectileSpawned':
    case 'projectileEnded':
    case 'prizeDamaged':
    case 'shotStage':
      return NONE;
  }
  return NONE;
}

// -------------------------------------------------------------- UiCue map

/** The primary sound of each cue (extras such as tier / chain are in soundsForUiCue). */
export const UI_CUE_SOUND: Record<Exclude<UiCueName, 'festivalChallenge'>, SoundId> = {
  questionShown: 'question.show',
  answerAccepted: 'answer.accept',
  effectGood: 'effect.good',
  effectRisky: 'effect.risky',
  effectNeutral: 'effect.neutral',
  assortmentChanged: 'assortment.change',
  outlineShown: 'outline.show',
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
  takeTier: 'take.1',
  lastShotContinue: 'lastShot.hayashi',
  critLatch: 'load.latch',
  windChime: 'reward.chime',
  speech: 'speech.paper',
};

const TIER_SOUND: Record<LoadTier, SoundId> = {
  perfect: 'load.stop.perfect',
  good: 'load.stop.good',
  normal: 'load.stop.normal',
  weak: 'load.stop.weak',
};
const FESTIVAL_TIER_SOUND: Record<LoadTier, SoundId> = {
  perfect: 'festival.load.perfect',
  good: 'festival.load.good',
  normal: 'festival.load.normal',
  weak: 'festival.load.weak',
};
const FESTIVAL_UI_SOUND: Partial<Record<UiCueName, SoundId>> = {
  select: 'festival.ui.select',
  confirm: 'festival.ui.confirm',
  cancel: 'festival.ui.cancel',
  start: 'festival.ui.start',
  loadStart: 'festival.load.charge',
  critLatch: 'festival.load.latch',
  fire: 'festival.fire',
  speech: 'festival.speech',
  lastShotContinue: 'festival.lastShot',
  setComplete: 'festival.set.complete',
  setDiscovered: 'festival.set.discovered',
  newBest: 'festival.newBest',
  runEnd: 'festival.runEnd',
  resultShow: 'festival.result',
};

export function soundsForUiCue(cue: UiCueExt, festival = false): readonly SoundRequest[] {
  switch (cue.cue) {
    case 'festivalChallenge':
      return festival ? [req('festival.challenge')] : NONE;
    case 'loadStop':
      return [req((festival ? FESTIVAL_TIER_SOUND : TIER_SOUND)[cue.tier ?? 'normal'])];
    case 'collect':
      return (cue.count ?? 1) >= 2 ? [req('collect'), req('chain')] : [req('collect')];
    case 'takeTier': {
      const n = cue.count ?? 1;
      return [req(n >= 4 ? 'take.taiko' : n === 3 ? 'take.3' : n === 2 ? 'take.2' : 'take.1')];
    }
    default: {
      const previewSound = festival ? FESTIVAL_UI_SOUND[cue.cue] : undefined;
      return [req(previewSound ?? UI_CUE_SOUND[cue.cue])];
    }
  }
}

// ------------------------------------------------- effect results (expanded)

export type EffectFeel = 'good' | 'risky' | 'neutral' | 'assortment' | 'outline';

/**
 * How an effect sounds, from its number alone (src/audio never imports the
 * expanded data). Mapping (docs/changes/2026-11-06-effects-100.md section 1):
 *   FX041-FX060 = assortment, FX061-FX080 = outline;
 *   otherwise a real ammo change decides: gained = good, lost = risky;
 *   FX001-FX020 (ammo gain, buffs) = good, except FX016-FX019 (bullet type /
 *   split / launch changes) = neutral;
 *   FX021-FX040 (ammo loss, nerfs) = risky, except FX038-FX039 (slow bar,
 *   wide split: only a change of handling) = neutral;
 *   FX081-FX100 (combinations, single transforms, information) = neutral.
 * The sound never says more than the result line on screen.
 */
export function effectFeel(effectId: string, ammoDelta = 0): EffectFeel | null {
  const m = /^FX(\d{3})$/.exec(effectId);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 1 || n > 100) return null;
  if (n >= 41 && n <= 60) return 'assortment';
  if (n >= 61 && n <= 80) return 'outline';
  if (ammoDelta > 0) return 'good';
  if (ammoDelta < 0) return 'risky';
  if (n <= 20) return n >= 16 && n <= 19 ? 'neutral' : 'good';
  if (n <= 40) return n === 38 || n === 39 ? 'neutral' : 'risky';
  return 'neutral';
}

const FEEL_RANK: readonly EffectFeel[] = ['assortment', 'outline', 'risky', 'good', 'neutral'];
const FEEL_CUE = {
  assortment: 'assortmentChanged',
  outline: 'outlineShown',
  risky: 'effectRisky',
  good: 'effectGood',
  neutral: 'effectNeutral',
} as const satisfies Record<EffectFeel, ExpansionCueName>;

export interface EffectCueInput {
  readonly effectId: string | null;
  readonly outcome: 'applied' | 'notApplicable';
  readonly ammoDelta: number;
}

/**
 * The one cue for everything a shot's plan did (coalesced: never a stack of
 * cues). Only applied effects count; the most notable kind wins (assortment >
 * outline > risky > good > neutral). null when nothing applied.
 */
export function effectCueFor(effects: readonly EffectCueInput[] | undefined): ExpansionCueName | null {
  let best = -1;
  for (const e of effects ?? []) {
    if (e.outcome !== 'applied' || e.effectId === null) continue;
    const feel = effectFeel(e.effectId, e.ammoDelta);
    if (!feel) continue;
    const rank = FEEL_RANK.indexOf(feel);
    if (best === -1 || rank < best) best = rank;
  }
  return best === -1 ? null : FEEL_CUE[FEEL_RANK[best]!];
}
