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
import { festivalOf } from '../core/festival';
import {
  ballisticFor,
  ballisticForModifiers,
  isExpandedRunState,
  parseCommand,
  type AimPreview,
  type BallisticSpec,
  type AnswerShopkeeperCommand,
  type ExpansionViewState,
  type FlightBarrier,
  type AimAngles,
  type BoothLayout,
  type GameCommand,
  type PauseReason,
  type Renderer,
  type RewardTargetGeometry,
  type RunConfig,
  type RunState,
  type RuntimeCatalog,
  type ShotRecord,
  type ShotSummary,
  type ShotWorld,
  type SimEvent,
  type SimulationFrame,
  type TransformChooser,
  type TransformPolicy,
  type TuningConfig,
  type ViewState,
  type ExpansionCatalog,
} from '../contracts';
import type { ConfirmedPresentation, PersistedRecord, SaveReply } from '../contracts/persistence';
import type { DispatchResult, PersistedSession } from './persisted-session';
import { FixedGameClock } from '../core/game-clock';
import { aimNearReward, rewardConfigOf, rewardViewState } from '../core/rewards';
import { PREVIEW_LOAD, aimFirstRequest, isAimFirstState, powerZoneWidthFor, powerZones, talkAvailability } from '../core/aim-first';

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
  /** Expanded rules: confirm the shot from the completed plan and the final record (the only settlement entry). */
  resolveExpandedShot?(state: RunState, record: ShotRecord, ctx: RulesContext): { state: RunState; summary: ShotSummary };
}

export interface RulesContext {
  readonly tuning: TuningConfig;
  readonly catalog: RuntimeCatalog;
  readonly layout: BoothLayout;
  /** Same four items as GameplayBundle. Absent or null = rules-v1. */
  readonly expansion?: ExpansionCatalog | null;
  readonly transformPolicy?: TransformPolicy;
}

export interface ControllerSnapshot {
  readonly state: RunState;
  readonly view: ViewState;
  readonly lastSummary: ShotSummary | null;
  /** The last physics frame (read-only; for overviews such as the booth map). */
  readonly frame: SimulationFrame;
}

export interface ControllerDeps {
  readonly preciseRewardAim?: boolean;
  readonly clockPolicy?: 'frame' | 'fixed';
  readonly initialGameTick?: number;
  readonly rules: RulesApi;
  readonly world: ShotWorld;
  readonly renderer: Renderer | null;
  readonly catalog: RuntimeCatalog;
  readonly tuning: TuningConfig;
  readonly layout: BoothLayout;
  /** Expanded rules catalog of the same GameplayBundle; absent/null = rules-v1. */
  readonly expansion?: ExpansionCatalog | null;
  readonly transformPolicy?: TransformPolicy;
  /** Called after any state change (command, frame, settlement). */
  readonly session?: PersistedSession;
  readonly onReplayed?: (record: PersistedRecord) => void;
  readonly onConfirmed?: (event: ConfirmedPresentation) => void;
  readonly reducedMotion?: () => boolean;
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
  private readonly clock: FixedGameClock | null;
  private state: RunState;
  private lastSummary: ShotSummary | null = null;
  private lastFrame: SimulationFrame;
  private presentationSkipped = false;
  private readonly ctx: RulesContext;
  private delayedFire: (() => void) | null = null;
  get persistencePending(): boolean { return !!this.deps.session && this.deps.session.status !== 'ready'; }

  private previewKey = '';
  private preview: AimPreview | null = null;

  constructor(
    private readonly deps: ControllerDeps,
    initial: RunState,
  ) {
    this.clock = deps.clockPolicy === 'fixed' ? new FixedGameClock(deps.tuning.limits.fixedStepSec, deps.initialGameTick) : null;
    this.state = initial;
    this.lastSummary = deps.session?.record.lastSummary ?? null;
    this.ctx = { tuning: deps.tuning, catalog: deps.catalog, layout: deps.layout, expansion: deps.expansion ?? null, transformPolicy: deps.transformPolicy };
    deps.world.syncShelf(initial.shelf, initial.clocks.motionSec);
    this.lastFrame = deps.world.frame();
  }

  get current(): RunState {
    return this.state;
  }

  snapshot(): ControllerSnapshot {
    return { state: this.state, view: this.viewState(), lastSummary: this.lastSummary, frame: this.lastFrame };
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
    const ballistic = ballisticForModifiers(this.deps.tuning, s.bulletType, reservation.modifiers);
    const rewards = rewardViewState(s, rewardConfigOf(this.deps.expansion), this.deps.layout, this.deps.tuning);
    const aimFirst = isAimFirstState(s);
    // r007 shows the guides from the first moment of aiming and keeps them fixed while the gauge runs.
    const aimingNow = s.phase === 'aiming' || (aimFirst && s.phase === 'loading');
    const nearDevice = this.deps.preciseRewardAim && aimingNow && rewards &&
      aimNearReward(rewards, this.deps.layout, s.standX, effectiveAim, ballistic);
    const guide = aimingNow && reservation.hint === 'aimPreview';
    const preview = (nearDevice || guide) ? this.aimPreview(s, effectiveAim, ballistic, this.deps.preciseRewardAim ? rewards?.target?.geometry : undefined) : null;
    const question = s.inFlight?.stage === 'question' ? (s.inFlight.plan?.question ?? null) : null;
    // The archived shot keeps both series. Their live outlines and refill labels end with play.
    const seriesExpired = s.phase === 'ended' || s.phase === 'abandoned';
    const festival = festivalOf(s, this.deps.expansion);
    const expansion: ExpansionViewState = {
      ...(festival ? { festival } : {}),
      cells: e.cells.map((c) => ({ cellId: c.cellId, used: c.used, effectId: c.used ? c.effectId : null })),
      outlineSeries: seriesExpired ? null : e.outlineSeries,
      assortmentSeries: seriesExpired ? null : e.assortmentSeries,
      collectedTypeIds: s.collectedTypeIds,
      completedSets: s.completedSets,
      hint: reservation.hint,
      aimPreview: guide ? preview : null,
      ...(rewards ? { rewards } : {}),
      question: question && s.inFlight ? { shotId: s.inFlight.shotId, questionId: question.questionId, answer: question.answer } : null,
    };
    const out: ViewState = { ...base, ballistic, expansion, ...(nearDevice && preview ? { rewardAim: preview } : {}) };
    if (!aimFirst || !this.deps.expansion) return out;
    const width = powerZoneWidthFor(s);
    const talk = talkAvailability(s, { tuning: this.deps.tuning, expansion: this.deps.expansion });
    return { ...out, aimFirst: { powerZoneWidthMult: width, zones: powerZones(this.deps.tuning, width), aim: s.aim, talk: { ...talk, used: s.expansion.aimFirst.talk } } };
  }

  /** Share the same read-only query between the reticle and the optional trajectory guide. */
  private aimPreview(s: RunState, aim: AimAngles, flight: BallisticSpec, target?: RewardTargetGeometry): AimPreview | null {
    const aimFirst = isAimFirstState(s);
    if (!isExpandedRunState(s) || (!s.load && !aimFirst)) return null;
    const pose = this.deps.preciseRewardAim ? s.clocks.motionSec : 0;
    const key = [s.shotsFired, s.standX, aim.yaw, aim.pitch, pose, flight.speed, flight.gravity, flight.corkRadius, target?.outerRadius].join('|');
    if (key === this.previewKey) return this.preview;
    // r007: the flight path does not depend on the power, so the preview needs no FIRE probe.
    const probe = aimFirst ? s : this.deps.rules.reduceGame(s, { type: 'FIRE' }, this.ctx);
    const request = aimFirst ? aimFirstRequest(s, PREVIEW_LOAD, this.deps.layout) : probe !== s ? probe.inFlight?.request : undefined;
    if (!request) return null;
    this.preview = this.deps.world.previewFirstContact(request, s.expansion.next.modifiers, target);
    this.previewKey = key;
    return this.preview;
  }

  /**
   * Untrusted UI input. Returns true when the rules accepted it (state changed).
   */
  async dispatchPersisted(input: unknown): Promise<DispatchResult> {
    const parsed = parseCommand(input);
    if (!parsed.ok || this.persistencePending) return 'rejected';
    const cmd = parsed.command;
    const session = this.deps.session;
    if (!session) return this.dispatch(input) ? 'applied' : 'rejected';
    // r007: opening and cancelling the gauge stay local; a reload returns to the last saved aiming state.
    if (['SET_POSITION', 'AIM', 'PAUSE', 'RESUME', 'SKIP_PRESENTATION', 'OPEN_GAUGE', 'CANCEL_GAUGE'].includes(cmd.type)) {
      return this.applyLocal(cmd) ? 'applied' : 'rejected';
    }
    const before = this.state;
    if (cmd.type === 'ANSWER_SHOPKEEPER' && before.pauseReasons.length) return 'rejected';
    const after = cmd.type === 'ANSWER_SHOPKEEPER'
      ? this.deps.rules.answerShopkeeper?.(before, cmd, this.ctx) ?? before
      : this.deps.rules.reduceGame(before, cmd, this.ctx);
    if (after === before) return 'rejected';
    const operationId = cmd.type === 'FIRE' ? `${after.runId}/${after.shotsFired}/fire`
      : cmd.type === 'FESTIVAL_ENCORE' ? `${after.runId}/festival-encore`
      : cmd.type === 'CHOOSE_SHOPKEEPER_TALK' ? `${after.runId}/shopkeeper-talk`
      : `${after.runId}/${session.record.token.revision + 1}/${cmd.type}`;
    this.clock?.advance(0, true);
    return session.command(after, operationId, this.gameTick, (reply) => {
      if (reply.replayed) return this.replay(reply.record);
      this.state = {...reply.record.state, pauseReasons: this.state.pauseReasons};
      if (cmd.type === 'ANSWER_SHOPKEEPER') this.resumeIfPlanned();
      if (cmd.type === 'STOP_LOAD' && after.load?.tier === 'perfect') {
        this.deps.onConfirmed?.({kind:'perfectLoad', runId:after.runId, shotNumber:after.shotsFired + 1,
          operationId, load:after.load, replayed:false, reducedMotion:this.deps.reducedMotion?.() ?? false});
      }
      if (cmd.type === 'FIRE' && this.state.pauseReasons.length > 0) {
        this.delayedFire = () => this.finishCommand(cmd, before, this.state);
        this.emit();
      } else this.finishCommand(cmd, before, this.state);
    });
  }

  /**
   * r007: save the finished move or aim (button released, drag ended) as one numbered operation.
   * Nothing is written while the position and aim equal the saved ones. A failed write keeps the
   * same operation for the explicit retry.
   */
  async commitAim(): Promise<DispatchResult> {
    const s = this.state;
    const session = this.deps.session;
    if (!isAimFirstState(s) || s.phase !== 'aiming' || s.pauseReasons.length > 0) return 'rejected';
    if (!session) return 'applied';
    if (this.persistencePending) return 'rejected';
    const saved = session.record.state;
    if (saved.phase === 'aiming' && saved.standX === s.standX && saved.aim.yaw === s.aim.yaw && saved.aim.pitch === s.aim.pitch) return 'applied';
    const seq = (isAimFirstState(saved) ? saved.expansion.aimFirst.aimSeq : s.expansion.aimFirst.aimSeq) + 1;
    const after: RunState = { ...s, pauseReasons: [], expansion: { ...s.expansion, aimFirst: { ...s.expansion.aimFirst, aimSeq: seq } } };
    this.clock?.advance(0, true);
    return session.command(after, `${s.runId}/aim/${seq}`, this.gameTick, (reply) => {
      if (reply.replayed) return this.replay(reply.record);
      // Only the counter comes back from the save; the position and aim on screen stay as they are.
      const cur = this.state;
      if (isAimFirstState(cur) && isAimFirstState(reply.record.state)) {
        this.state = { ...cur, expansion: { ...cur.expansion, aimFirst: { ...cur.expansion.aimFirst, aimSeq: reply.record.state.expansion.aimFirst.aimSeq } } };
      }
      this.emit();
    });
  }

  /**
   * r007: an interrupted move or drag is dropped: the position and aim go back to the last
   * ones whose save succeeded (nothing is written). Without a session, the state is kept.
   */
  revertAim(): void {
    const s = this.state;
    const saved = this.deps.session?.record.state;
    if (!isAimFirstState(s) || s.phase !== 'aiming' || !saved || saved.phase !== 'aiming') return;
    if (saved.standX === s.standX && saved.aim.yaw === s.aim.yaw && saved.aim.pitch === s.aim.pitch) return;
    this.state = { ...s, standX: saved.standX, aim: saved.aim };
    this.emit();
  }

  private replay(record: PersistedRecord): void {
    this.state = record.state;
    this.lastSummary = record.lastSummary;
    this.deps.onReplayed?.(record);
  }

  dispatch(input: unknown): boolean {
    if (this.deps.session) return false;
    return this.applyLocal(input);
  }

  private applyLocal(input: unknown): boolean {
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
    if (command.type === 'PAUSE') this.clock?.advance(0, true);
    this.state = after;
    return this.finishCommand(command, before, after);
  }

  private finishCommand(command: GameCommand, before: RunState, after: RunState): boolean {
    if (command.type === 'RESUME' && after.pauseReasons.length === 0 && this.delayedFire) {
      const fire = this.delayedFire;
      this.delayedFire = null;
      fire();
    }
    if (command.type === 'FIRE' && (before.phase === 'aiming' || before.phase === 'loading') && after.phase === 'resolving' && after.inFlight) {
      this.presentationSkipped = false;
      this.deps.onShotFired?.(after);
      const active = isExpandedRunState(after) ? after.expansion.active : null;
      const festival = festivalOf(after, this.deps.expansion);
      this.deps.world.fire(after.inFlight.request, {
        runId: after.runId,
        chooseTransform: this.deps.rules.transformChooser(after, this.deps.catalog),
        ...(active && isExpandedRunState(after)
          ? {
              expanded: {
                modifiers: active.modifiers,
                ...(festival ? { festival } : {}),
                ...(this.deps.expansion?.profile.festivalChallenges ? { festivalChallenges: true as const } : {}),
                usableCells: after.expansion.cells.filter((c) => !c.used).map((c) => c.cellId),
                ...(after.expansion.rewards
                  ? {
                      rewards: true,
                      rewardTarget: after.expansion.rewards.target?.forShot === after.shotsFired ? after.expansion.rewards.target.geometry : null,
                    }
                  : {}),
              },
            }
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
      if (want && !current.has(r)) this.applyLocal({ type: 'PAUSE', reason: r });
      if (!want && current.has(r)) this.applyLocal({ type: 'RESUME', reason: r });
    }
  }

  get gameTick(): number {
    return this.clock?.currentTick ?? 0;
  }

  private get timeStopped(): boolean {
    return this.persistencePending || this.state.pauseReasons.length > 0 || this.awaitingAnswer ||
      this.state.phase === 'ended' || this.state.phase === 'abandoned';
  }

  /** One render, regardless of how many fixed physics steps this frame contains. */
  frame(rawDtSec: number): void {
    if (this.timeStopped) {
      this.clock?.advance(0, true);
      this.render([]);
      return;
    }
    const events: SimEvent[] = [];
    if (this.clock) {
      const stepSec = this.clock.stepSec;
      this.clock.advance(rawDtSec, false, () => {
        this.stepGame(stepSec, events);
        return !this.timeStopped;
      });
    } else {
      this.stepGame(Math.max(0, Math.min(MAX_FRAME_DT, Number.isFinite(rawDtSec) ? rawDtSec : 0)), events);
    }
    this.render(events);
    this.emit();
  }

  private stepGame(dt: number, events: SimEvent[]): void {
    if (this.state.phase !== 'resolving') {
      this.state = this.deps.rules.tickRun(this.state, dt, this.deps.tuning);
    }
    // Between shots the world still moves mounted (periodic) prizes; during a shot it runs the shot.
    const step = this.deps.world.step(dt);
    this.lastFrame = step.frame;
    if (step.frame.events.length > 0) {
      events.push(...step.frame.events);
      this.deps.onSimEvents?.(step.frame.events);
    }
    if (step.barrier) this.onBarrier(step.barrier);
    if (step.record) this.settle(step.record);
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
    const expanded = isExpandedRunState(this.state);
    if (expanded && !this.deps.rules.resolveExpandedShot) throw new Error('expanded run without an expanded settlement');
    const { state, summary } =
      expanded && this.deps.rules.resolveExpandedShot
        ? this.deps.rules.resolveExpandedShot(this.state, record, this.ctx)
        : this.deps.rules.resolveShot(this.state, record, this.deps.catalog, this.deps.tuning);
    const session = this.deps.session;
    if (session) {
      void session.settle(state, summary, this.gameTick, (reply) => {
        if (reply.replayed) return this.replay(reply.record);
        this.applySettlement({...reply.record.state, pauseReasons: this.state.pauseReasons}, summary, reply);
        this.emit();
      });
    } else this.applySettlement(state, summary);
  }

  private applySettlement(state: RunState, summary: ShotSummary, reply?: Extract<SaveReply, {ok:true}>): void {
    this.state = state;
    this.lastSummary = summary;
    if (state.phase !== 'ended') this.deps.world.syncShelf(state.shelf, state.clocks.motionSec);
    const reducedMotion = this.deps.reducedMotion?.() ?? false;
    if (reply) this.deps.onConfirmed?.({kind:'shot', runId:state.runId, shotId:summary.shotId, summary,
      freshSets:reply.freshSets, ammoBeforeShot:reply.record.ammoBeforeShot ?? 0, replayed:false,
      reducedMotion:reducedMotion || this.presentationSkipped});
    this.deps.onShotSettled?.(summary, state);
    void this.deps.renderer?.present(summary, { skip: this.presentationSkipped, reducedMotion });
  }

  private render(events: readonly SimEvent[]): void {
    // Draw the latest positions, with every event since the previous draw.
    if (events.length || this.lastFrame.events.length) this.lastFrame = { ...this.lastFrame, events };
    this.deps.renderer?.render(this.lastFrame, this.viewState());
  }

  private emit(): void {
    this.deps.onChange?.(this.snapshot());
  }
}
