/**
 * Game loop controller (owner: Opus). Connects the pure run rules (src/core),
 * the physics world (src/sim), the renderer (src/view) and the UI.
 *
 * Rules enforced here:
 *  - UI input goes through parseCommand (no score/settlement commands exist).
 *  - FIRE that the rules accepted starts exactly one sim shot.
 *  - The shot result is settled exactly once per ShotRecord.
 *  - While paused, nothing advances (no catch-up of elapsed time on resume).
 *  - Presentation skipping never changes the sim or settlement.
 */
import {
  ballisticFor,
  parseCommand,
  type AimAngles,
  type BoothLayout,
  type GameCommand,
  type PauseReason,
  type Renderer,
  type RunConfig,
  type RunState,
  type RuntimeCatalog,
  type ShotRecord,
  type ShotSummary,
  type ShotWorld,
  type SimEvent,
  type SimulationFrame,
  type TransformChooser,
  type TuningConfig,
  type ViewState,
} from '../contracts';

export interface RulesApi {
  createRun(config: RunConfig, catalog: RuntimeCatalog): RunState;
  reduceGame(state: RunState, command: GameCommand, ctx: RulesContext): RunState;
  tickRun(state: RunState, dtSec: number, tuning: TuningConfig): RunState;
  effectiveAim(state: RunState, tuning: TuningConfig): AimAngles;
  loadingBarValue(state: RunState, tuning: TuningConfig): number;
  resolveShot(state: RunState, record: ShotRecord, catalog: RuntimeCatalog, tuning: TuningConfig): { state: RunState; summary: ShotSummary };
  transformChooser(state: RunState, catalog: RuntimeCatalog): TransformChooser;
}

export interface RulesContext {
  readonly tuning: TuningConfig;
  readonly catalog: RuntimeCatalog;
  readonly layout: BoothLayout;
}

export interface ControllerSnapshot {
  readonly state: RunState;
  readonly view: ViewState;
  readonly lastSummary: ShotSummary | null;
}

export interface ControllerDeps {
  readonly rules: RulesApi;
  readonly world: ShotWorld;
  readonly renderer: Renderer | null;
  readonly catalog: RuntimeCatalog;
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  /** Called after any state change (command, frame, settlement). */
  readonly onChange?: (snapshot: ControllerSnapshot) => void;
  readonly onSimEvents?: (events: readonly SimEvent[]) => void;
  readonly onShotSettled?: (summary: ShotSummary, state: RunState) => void;
  /** Called right after a FIRE is accepted, before the sim starts (checkpoint hook, Task 10). */
  readonly onShotFired?: (state: RunState) => void;
}

/** Largest dt a single frame may advance. Longer gaps (tab hidden, debugger) are not caught up. */
export const MAX_FRAME_DT = 0.1;

export class GameController {
  private state: RunState;
  private lastSummary: ShotSummary | null = null;
  private lastFrame: SimulationFrame;
  private presentationSkipped = false;
  private readonly ctx: RulesContext;

  constructor(
    private readonly deps: ControllerDeps,
    initial: RunState,
  ) {
    this.state = initial;
    this.ctx = { tuning: deps.tuning, catalog: deps.catalog, layout: deps.layout };
    deps.world.syncShelf(initial.shelf, initial.clocks.motionSec);
    this.lastFrame = deps.world.frame();
  }

  get current(): RunState {
    return this.state;
  }

  get skipRequested(): boolean {
    return this.presentationSkipped;
  }

  snapshot(): ControllerSnapshot {
    return { state: this.state, view: this.viewState(), lastSummary: this.lastSummary };
  }

  viewState(): ViewState {
    const s = this.state;
    return {
      phase: s.phase,
      standX: s.standX,
      effectiveAim: this.deps.rules.effectiveAim(s, this.deps.tuning),
      loadingBar: s.phase === 'loading' ? this.deps.rules.loadingBarValue(s, this.deps.tuning) : null,
      paused: s.pauseReasons.length > 0,
      ballistic: ballisticFor(this.deps.tuning, s.bulletType),
    };
  }

  /**
   * Untrusted UI input. Returns true when the rules accepted it (state changed).
   */
  dispatch(input: unknown): boolean {
    const parsed = parseCommand(input);
    if (!parsed.ok) return false;
    const command = parsed.command;
    if (command.type === 'SKIP_PRESENTATION') {
      // Presentation only (decision 26). The rules may record it, but sim/settlement continue unchanged.
      this.presentationSkipped = true;
    }
    const before = this.state;
    const after = this.deps.rules.reduceGame(before, command, this.ctx);
    if (after === before) return command.type === 'SKIP_PRESENTATION';
    this.state = after;
    if (command.type === 'FIRE' && before.phase === 'aiming' && after.phase === 'resolving' && after.inFlight) {
      this.presentationSkipped = false;
      this.deps.onShotFired?.(after);
      this.deps.world.fire(after.inFlight.request, {
        runId: after.runId,
        chooseTransform: this.deps.rules.transformChooser(after, this.deps.catalog),
      });
    }
    this.emit();
    return true;
  }

  /** Page environment reasons (hidden / landscape). Adding pauses; removal never auto-resumes 'manual'. */
  setEnvironmentPause(reasons: readonly PauseReason[]): void {
    const current = new Set(this.state.pauseReasons);
    for (const r of ['hidden', 'landscape'] as const) {
      const want = reasons.includes(r);
      if (want && !current.has(r)) this.dispatch({ type: 'PAUSE', reason: r });
      if (!want && current.has(r)) this.dispatch({ type: 'RESUME', reason: r });
    }
  }

  /** Advance one animation frame. */
  frame(rawDtSec: number): void {
    const dt = Math.max(0, Math.min(MAX_FRAME_DT, Number.isFinite(rawDtSec) ? rawDtSec : 0));
    if (this.state.pauseReasons.length > 0) {
      this.render();
      return;
    }
    if (this.state.phase === 'ended' || this.state.phase === 'abandoned') {
      this.render();
      return;
    }
    if (this.state.phase !== 'resolving') {
      this.state = this.deps.rules.tickRun(this.state, dt, this.deps.tuning);
    }
    // Between shots the world still moves mounted (periodic) prizes; during a shot it runs the shot.
    const step = this.deps.world.step(dt);
    this.lastFrame = step.frame;
    if (step.frame.events.length > 0) this.deps.onSimEvents?.(step.frame.events);
    if (step.record) this.settle(step.record);
    this.render();
    this.emit();
  }

  private settle(record: ShotRecord): void {
    if (this.state.phase !== 'resolving' || !this.state.inFlight || this.state.inFlight.shotId !== record.shotId) {
      // A record for a shot we are not resolving must never be settled twice or late.
      return;
    }
    const { state, summary } = this.deps.rules.resolveShot(this.state, record, this.deps.catalog, this.deps.tuning);
    this.state = state;
    this.lastSummary = summary;
    if (state.phase !== 'ended') this.deps.world.syncShelf(state.shelf, state.clocks.motionSec);
    this.deps.onShotSettled?.(summary, state);
    void this.deps.renderer?.present(summary, { skip: this.presentationSkipped });
  }

  private render(): void {
    this.deps.renderer?.render(this.lastFrame, this.viewState());
  }

  private emit(): void {
    this.deps.onChange?.(this.snapshot());
  }
}
