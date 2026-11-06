/**
 * Side-effect ports (Task 02, owner: Opus). src/core and src/sim never touch
 * the DOM, WebGL, WebAudio, storage, or network directly; app.ts wires these.
 */
import type { ShotSummary, SimEvent, SimulationFrame } from './events';
import type { AimAngles, FinalResult, LoadTier, Phase } from './game';
import type { AimPreview, BallisticSpec } from './aim';
import type { BackgroundCellId, EffectId, PrizeInstanceId, PrizeTypeId, QuestionId, SeriesId, SetId, ShotId } from './ids';
import type { RewardId, RewardOrderState, RewardTargetGeometry } from './rewards';
import type { HintKind, QuestionChoice } from './expansion';

/**
 * Expanded rules: checked state the view may draw. The view never draws
 * effects, consumes RNG or creates commands from this.
 */
export interface ExpansionViewState {
  /** 36 cells in row/column order. effectId is null until the cell was used (hidden until hit). */
  readonly cells: readonly { readonly cellId: BackgroundCellId; readonly used: boolean; readonly effectId: EffectId | null }[];
  readonly outlineSeries: SeriesId | null;
  /** Refill series after FX041-FX060 (shown in the legend); null = normal assortment. */
  readonly assortmentSeries: SeriesId | null;
  /** Confirmed this run (for FX094/FX095 hints only; never used for scoring by the view). */
  readonly collectedTypeIds: readonly PrizeTypeId[];
  readonly completedSets: readonly SetId[];
  /** The next-shot hint while positioning/loading/aiming; the active one during the flight. */
  readonly hint: HintKind | null;
  /** FX098 only, computed by the controller from ShotWorld.previewFirstContact. */
  readonly aimPreview: AimPreview | null;
  /** Shown while the shot waits for the shopkeeper answer. */
  readonly question: { readonly shotId: ShotId; readonly questionId: QuestionId; readonly answer: QuestionChoice | null } | null;
  /** Rules versions with rewards (r002+): what to draw and show. Never read back into the run. */
  readonly rewards?: RewardViewState;
}

/** Display-only facts about A1-A10 for the view and the panel. */
export interface RewardViewState {
  readonly bagInstanceId: PrizeInstanceId | null;
  /** A1: the most the bag can give now (its value, capped by the room left). */
  readonly bagOffer: number;
  /** A5: a fixed target ('fixed') after the stand is confirmed; a preview that follows the stand before that. */
  readonly target: { readonly geometry: RewardTargetGeometry; readonly offered: { readonly outer: number; readonly center: number }; readonly mode: 'preview' | 'fixed' } | null;
  readonly order: RewardOrderState | null;
  /** Shots left for an accepted order, counting the one being prepared. */
  readonly orderShotsLeft: number | null;
  readonly lanternsLit: readonly number[];
  readonly lanternZones: number;
  readonly prizesWon: number;
  readonly nextStamp: number | null;
  readonly piggyDeposits: number;
  readonly enabled: readonly RewardId[];
}

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
  /** Expanded rules only. */
  readonly expansion?: ExpansionViewState;
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
  | {
      readonly type: 'ui';
      readonly cue:
        | 'select' | 'confirm' | 'cancel' | 'start' | 'loadStart' | 'loadStop' | 'fire' | 'resultShow' | 'newBest' | 'setDiscovered' | 'setComplete' | 'runEnd' | 'miss' | 'nearMiss' | 'collect' | 'penalty' | 'ammoBonus'
        // Expanded rules (D35-D37): question, answer and one coalesced effect cue per shot.
        | 'questionShown' | 'answerAccepted' | 'effectGood' | 'effectRisky' | 'effectNeutral' | 'assortmentChanged' | 'outlineShown'
        // Rewards (plan P1/P3): prizes won in one shot (count), and continuing from the last cork.
        | 'takeTier' | 'lastShotContinue';
      /** loadStop: the load quality, so the stop sound can differ. */
      readonly tier?: LoadTier;
      /** collect: prizes collected in the shot (chain count). */
      readonly count?: number;
    };

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
