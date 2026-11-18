import type { GameplayBundle, KeyValueStorage, RunState } from '../contracts';
import type { PersistedRecord, RevisionedShelf, RunRepository, RunScope, SaveReply, SavedProfile } from '../contracts/persistence';
import { createIndexedRunRepository, createMemoryRunRepository } from '../persistence/indexed-run-repository';
import { jstDateOf } from '../core/daily';

function requireRecord(reply: SaveReply): PersistedRecord {
  if (!reply.ok) throw Object.assign(new Error(reply.reason), {reason:reply.reason});
  return reply.record;
}

/** Browser entry points for the atomic builds. Reads never acquire a run or import old keys. */
export class AtomicGame {
  repo!: RunRepository;
  record: PersistedRecord | null = null;
  memory = false;
  unreadable = false;
  shelf: RevisionedShelf = {slotRevision:0, slots:[null,null,null]};
  private records = new Map<string, PersistedRecord | null>();
  private profiles = new Map<string, SavedProfile>();
  private readonly source = (scope: RunScope) => scope.mode === 'daily' ? scope.startedDateJst : 'normal';

  constructor(private readonly factory: () => IDBFactory, private readonly writer: string,
    private readonly bundle: GameplayBundle, private readonly storage: KeyValueStorage,
    private readonly onVersionChange: () => void) {}

  private get rulesVersion(): string { return this.bundle.catalog.rulesVersion; }

  scope(mode: 'normal'|'daily', date = jstDateOf(Date.now())): RunScope {
    return mode === 'normal' ? {mode, rulesVersion:this.rulesVersion} : {mode, rulesVersion:this.rulesVersion, startedDateJst:date};
  }

  profile(scope: RunScope): SavedProfile {
    return this.profiles.get(this.source(scope)) ?? {bestScore:null, discoveredSets:[], legacyBestScore:null};
  }

  keep(record: PersistedRecord): void {
    this.record = record;
    this.records.set(this.source(record.scope), record);
  }

  async open(): Promise<PersistedRecord[]> {
    this.memory = false;
    this.unreadable = false;
    this.records.clear();
    this.profiles.clear();
    this.repo?.close();
    this.repo = await createIndexedRunRepository(this.factory(), this.writer, this.bundle, this.onVersionChange);
    const today = this.scope('daily');
    const active = await this.repo.readActiveScope(this.rulesVersion);
    const scopes = [this.scope('normal'), today];
    if (active?.mode === 'daily' && this.source(active) !== this.source(today)) scopes.push(active);
    const rows = await Promise.all(scopes.map(async scope => {
      const [record, profile] = await Promise.all([this.repo.read(scope), this.repo.readProfile(scope)]);
      this.profiles.set(this.source(scope), profile);
      this.records.set(this.source(scope), record);
      return record;
    }));
    this.shelf = await this.repo.readShelf();
    this.record = null;
    return rows.filter((record): record is PersistedRecord => record !== null && (!record.result || record.resultViewOpen));
  }

  useMemory(): void {
    this.memory = true;
    this.unreadable = false;
    this.record = null;
    this.records.clear();
    this.profiles.clear();
    this.shelf = {slotRevision:0, slots:[null,null,null]};
    this.repo?.close();
    this.repo = createMemoryRunRepository(this.writer, this.bundle);
  }

  async start(scope: RunScope, initial: RunState): Promise<void> {
    const expected = this.records.get(this.source(scope))?.token ?? null;
    if (!this.memory) {
      const result = await this.repo.importLegacy(scope, this.storage, new Set(this.bundle.catalog.sets.keys()));
      this.unreadable = result.unreadable.length > 0;
      this.profiles.set(this.source(scope), await this.repo.readProfile(scope));
      this.shelf = await this.repo.readShelf();
    }
    this.keep(requireRecord(await this.repo.start(scope, initial, expected)));
  }

  async claim(): Promise<PersistedRecord> {
    const current = this.record!;
    const reply = await this.repo.claim(current.scope, current.token, current.state.inFlight ? 'abandonInFlight' : 'resumeStable');
    const record = requireRecord(reply);
    this.keep(record);
    return record;
  }

  async close(): Promise<void> {
    this.keep(requireRecord(await this.repo.closeResult(this.record!.token)));
  }

  async refreshProfile(): Promise<void> {
    if (!this.record) return;
    const scope = this.record.scope;
    this.profiles.set(this.source(scope), await this.repo.readProfile(scope));
  }
}
