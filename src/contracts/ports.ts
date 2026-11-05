/**
 * Side-effect ports (Task 02, owner: Opus). src/core and src/sim never touch
 * the DOM, WebGL, WebAudio, storage, or network directly; app.ts wires these.
 */
import type { ShotSummary, SimEvent, SimulationFrame } from './events';
import type { AimAngles, FinalResult, Phase } from './game';
import type { BallisticSpec } from './aim';

/** What the camera/HUD needs besides the physics frame. */
export interface ViewState {
  readonly phase: Phase;
  readonly standX: number;
  /** The aim actually used if FIRE happens now (requested aim + sway). */
  readonly effectiveAim: AimAngles;
  /** 0..1 loading bar position while loading. */
  readonly loadingBar: number | null;
  readonly paused: boolean;
  /** Cork speed/gravity for the next shot, so the reticle shows where the cork really goes. */
  readonly ballistic: BallisticSpec;
}

export interface PresentOptions {
  /** decision 26: skipping changes presentation only, never results. */
  readonly skip: boolean;
}

export interface Renderer {
  render(frame: SimulationFrame, view: ViewState): void;
  present(summary: ShotSummary, options: PresentOptions): Promise<void>;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface AudioSettings {
  readonly enabled: boolean;
  /** 0..1 */
  readonly volume: number;
}

/** UI-only cues that are not simulation events. */
export type UiCue =
  | { readonly type: 'ui'; readonly cue: 'select' | 'confirm' | 'cancel' | 'start' | 'loadStart' | 'loadStop' | 'fire' | 'resultShow' | 'newBest' | 'setDiscovered' | 'setComplete' | 'runEnd' | 'miss' | 'nearMiss' | 'collect' | 'penalty' | 'ammoBonus' };

export interface AudioEngine {
  /** Must be callable from a user gesture to unlock/resume the audio context. */
  unlock(): Promise<void>;
  handle(event: SimEvent | UiCue, settings: AudioSettings): void;
  /** Stop everything now and drop queued sounds (used on pause/hide, AC36). */
  silence(): void;
}

export type SubmitState = 'idle' | 'submitting' | 'submitted' | 'retryable_failed' | 'permanent_failed' | 'not_eligible';

export interface SubmitStatus {
  readonly state: SubmitState;
  readonly reason?: string;
}

export interface RankingClient {
  submit(result: FinalResult): Promise<SubmitStatus>;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
