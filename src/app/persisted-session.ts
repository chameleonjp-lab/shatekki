import type { RunState, ShotSummary } from '../contracts';
import type { PersistedRecord, RunRepository, SaveReply } from '../contracts/persistence';

export type DispatchResult = 'applied' | 'rejected' | 'retryable' | 'conflict';
type Success = Extract<SaveReply, {ok:true}>;
type Status = 'ready' | 'pending' | 'retryable' | 'conflict';
interface Pending {
  write(): Promise<SaveReply>;
  apply(reply: Success): void;
}

/** A failed write retains its candidate, expected revision and operation id until an explicit retry. */
export class PersistedSession {
  private pending: Pending | null = null;
  status: Status = 'ready';
  reason: Extract<SaveReply, {ok:false}>['reason'] | null = null;

  constructor(
    readonly repo: RunRepository,
    public record: PersistedRecord,
    private readonly onStatus?: (session: PersistedSession) => void,
  ) {}

  command(state: RunState, operationId: string, gameTick: number, apply: Pending['apply']): Promise<DispatchResult> {
    const input = { expected: this.record.token, state, operationId, gameTick };
    return this.begin({ write: () => this.repo.saveCommand(input), apply });
  }

  settle(state: RunState, summary: ShotSummary, gameTick: number, apply: Pending['apply']): Promise<DispatchResult> {
    const input = { expected: this.record.token, state, summary, gameTick };
    return this.begin({ write: () => this.repo.commitShot(input), apply });
  }

  private begin(operation: Pending): Promise<DispatchResult> {
    if (this.status !== 'ready') return Promise.resolve('rejected');
    this.pending = operation;
    return this.write(operation);
  }

  retry(): Promise<DispatchResult> {
    if (this.status !== 'retryable' || !this.pending) return Promise.resolve('rejected');
    return this.write(this.pending);
  }

  private async write(operation: Pending): Promise<DispatchResult> {
    this.status = 'pending';
    this.onStatus?.(this);
    let reply: SaveReply;
    try {
      reply = await operation.write();
    } catch {
      reply = {ok:false, reason:'unavailable'};
    }
    if (!reply.ok) {
      this.reason = reply.reason;
      this.status = reply.reason === 'conflict' || reply.reason === 'invalid' ? 'conflict' : 'retryable';
      this.onStatus?.(this);
      return this.status;
    }
    this.record = reply.record;
    this.pending = null;
    this.reason = null;
    this.status = 'ready';
    operation.apply(reply);
    this.onStatus?.(this);
    return 'applied';
  }
}
