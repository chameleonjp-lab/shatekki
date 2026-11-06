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
 *  - Expanded rules: the sim stops at the flight-end barrier; the controller
 *    plans the effects once, waits for exactly one shopkeeper answer when a
 *    question is due (nothing advances meanwhile), then resumes the sim once.
 */
import {
  ballisticFor,
  ballisticForModifiers,
  isExpandedRunState,
  parseCommand,
  type AimPreview,
  type AnswerShopkeeperCommand,
  type ExpansionViewState,
  type FlightBarrier,
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
  type ExpansionCatalog,
} from '../contracts';

export interface RulesApi {
  createRun(config: RunConfig, catalog: RuntimeCatalog): RunState;
  reduceGame(state: RunState, command: GameCommand, ctx: RulesContext): RunState;
  tickRun(state: RunState, dtSec: number, tuning: TuningConfig): RunState;
  effectiveAim(state: RunState, tuning: TuningConfig): AimAngles;
  loadingBarValue(state: RunState, tuning: TuningConfig): number;
  resolveShot(state: RunState, record: ShotRecord, catalog: RuntimeCatalog, tuning: TuningConfig): { state: RunState; summary: ShotSummary };
  transformChooser(state: RunState, catalog: RuntimeCatalog): TransformChooser;
  /** Expanded rules: plan the post-flight effects at the barrier (stage 'question' or 'postEffects'). */
  planFlightEnd?(state: RunState, barrier: FlightBarrier, ctx: RulesContext): RunState;
  /** Expanded rules: accept one answer for the pending question; returns the same object when rejected. */
  answerShopkeeper?(state: RunState, command: AnswerShopkeeperCommand, ctx: RulesContext): RunState;
}

export interface RulesContext {
  readonly tuning: TuningConfig;
  readonly catalog: RuntimeCatalog;
  readonly layout: BoothLayout;
  /** Same four items as GameplayBundle. Absent or null = rules-v1. */
  readonly expansion?: ExpansionCatalog | null;
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
  /** Expanded rules catalog of the same GameplayBundle; absent/null = rules-v1. */
  readonly expansion?: ExpansionCatalog | null;
  /** Called after any state change (command, frame, settlement). */
  readonly onChange?: (snapshot: ControllerSnapshot) => void;
  readonly onSimEvents?: (events: readonly SimEvent[]) => void;
  readonly onShotSettled?: (summary: ShotSummary, state: RunState) => void;
  /** Called right after a FIRE is accepted, before the sim starts (checkpoint hook, Task 10). */
  readonly onShotFired?: (state: RunState) => void;
  /** Called after any command the rules accepted (e.g. checkpoint after STOP_LOAD). */
  readonly onCommandApplied?: (command: GameCommand, state: RunState) => void;
}

/** Largest dt a single frame may advance. Longer gaps (tab hidden, debugger) are not caught up. */
export const MAX_FRAME_DT = 0.1;

export class GameController {
  private state: RunState;
  private lastSummary: ShotSummary | null = null;
  private lastFrame: SimulationFrame;
  private presentationSkipped = false;
  private readonly ctx: RulesContext;
  private previewKey = '';
  private preview: AimPreview | null = null;

  constructor(
    private readonly deps: ControllerDeps,
    initial: RunState,
  ) {
    this.state = initial;
    this.ctx = { tuning: deps.tuning, catalog: deps.catalog, layout: deps.layout, expansion: deps.expansion ?? null };
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
    const effectiveAim = this.deps.rules.effectiveAim(s, this.deps.tuning);
    const base: ViewState = {
      phase: s.phase,
      standX: s.standX,
      effectiveAim,
      loadingBar: s.phase === 'loading' ? this.deps.rules.loadingBarValue(s, this.deps.tuning) : null,
      paused: s.pauseReasons.length > 0,
      ballistic: ballisticFor(this.deps.tuning, s.bulletType),
    };
    if (!isExpandedRunState(s)) return base;
    const e = s.expansion;
    // Before FIRE the reservation applies to the shot being prepared; during the shot, its own settings.
    const reservation = s.phase === 'resolving' && e.active ? e.active : e.next;
    const question = s.inFlight?.stage === 'question' ? (s.inFlight.plan?.question ?? null) : null;
    const expansion: ExpansionViewState = {
      cells: e.cells.map((c) => ({ cellId: c.cellId, used: c.used, effectId: c.used ? c.effectId : null })),
      outlineSeries: e.outlineSeries,
      hint: reservation.hint,
      aimPreview: s.phase === 'aiming' && reservation.hint === 'aimPreview' ? this.aimPreview(s, effectiveAim) : null,
      question: question && s.inFlight ? { shotId: s.inFlight.shotId, questionId: question.questionId, answer: question.answer } : null,
    };
    return { ...base, ballistic: ballisticForModifiers(this.deps.tuning, s.bulletType, reservation.modifiers), expansion };
  }

  /** FX098 estimate, recomputed only when the aim or stand position changes (read-only for the world). */
  private aimPreview(s: RunState, aim: AimAngles): AimPreview | null {
    if (!isExpandedRunState(s) || !s.load) return null;
    const key = `${s.shotsFired}|${s.standX}|${aim.yaw}|${aim.pitch}`;
    if (key === this.previewKey) return this.preview;
    const probe = this.deps.rules.reduceGame(s, { type: 'FIRE' }, this.ctx);
    const request = probe !== s ? probe.inFlight?.request : undefined;
    this.preview = request ? this.deps.world.previewFirstContact(request, s.expansion.next.modifiers) : null;
    this.previewKey = key;
    return this.preview;
  }

  /**
   * Untrusted UI input. Returns true when the rules accepted it (state changed).
   */
  dispatch(input: unknown): boolean {
    const parsed = parseCommand(input);
    if (!parsed.ok) return false;
    const command = parsed.command;
    if (command.type === 'ANSWER_SHOPKEEPER') return this.answer(command);
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
      const active = isExpandedRunState(after) ? after.expansion.active : null;
      this.deps.world.fire(after.inFlight.request, {
        runId: after.runId,
        chooseTransform: this.deps.rules.transformChooser(after, this.deps.catalog),
        ...(active && isExpandedRunState(after)
          ? { expanded: { modifiers: active.modifiers, usableCells: after.expansion.cells.filter((c) => !c.used).map((c) => c.cellId) } }
          : {}),
      });
    }
    this.deps.onCommandApplied?.(command, after);
    this.emit();
    return true;
  }

  /**
   * One answer for the pending question. Rejected while paused, for another
   * shot/question, or once answered. An accepted answer completes the plan and
   * resumes the sim exactly once; it never lifts a pause.
   */
  private answer(command: AnswerShopkeeperCommand): boolean {
    const before = this.state;
    if (!this.deps.rules.answerShopkeeper || before.pauseReasons.length > 0) return false;
    if (before.phase !== 'resolving' || before.inFlight?.stage !== 'question') return false;
    const after = this.deps.rules.answerShopkeeper(before, command, this.ctx);
    if (after === before) return false;
    this.state = after;
    this.resumeIfPlanned();
    this.deps.onCommandApplied?.(command, after);
    this.emit();
    return true;
  }

  /** The world is frozen at a barrier; hand it the completed plan once. */
  private resumeIfPlanned(): void {
    const plan = this.state.inFlight?.plan;
    if (!plan || !plan.complete || this.state.inFlight?.stage !== 'postEffects') return;
    if (!this.deps.world.resumeAfterEffects(plan)) {
      throw new Error(`the world rejected the effect plan for ${plan.shotId}/${plan.barrierId}`);
    }
  }

  private onBarrier(barrier: FlightBarrier): void {
    const s = this.state;
    if (!this.deps.rules.planFlightEnd || s.phase !== 'resolving' || !s.inFlight || s.inFlight.shotId !== barrier.shotId || s.inFlight.barrier) {
      // A barrier for a shot we are not resolving (or a second one) must never be planned twice.
      return;
    }
    this.state = this.deps.rules.planFlightEnd(s, barrier, this.ctx);
    this.resumeIfPlanned();
  }

  /** True while the shot waits for the shopkeeper answer: physics, motion, clocks and grace stay still. */
  get awaitingAnswer(): boolean {
    return this.state.phase === 'resolving' && this.state.inFlight?.stage === 'question';
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
    if (this.awaitingAnswer) {
      // Waiting for the answer is not elapsed game time: nothing is stepped or carried over.
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
    if (step.barrier) this.onBarrier(step.barrier);
    if (step.record) this.settle(step.record);
    this.render();
    this.emit();
  }

  private settle(record: ShotRecord): void {
    if (this.state.phase !== 'resolving' || !this.state.inFlight || this.state.inFlight.shotId !== record.shotId) {
      // A record for a shot we are not resolving must never be settled twice or late.
      return;
    }
    if (isExpandedRunState(this.state) && this.state.inFlight.stage !== 'postEffects') {
      // Expanded rules: only a shot whose effect plan was completed and accepted can be confirmed.
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
