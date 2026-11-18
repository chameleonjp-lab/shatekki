import type { FinalResult, KeyValueStorage, LoadResult, PrizeTypeId, RunState, SetId, ShotSummary } from './index';
import type { PlaceResult, SouvenirShelf } from '../persistence/souvenirs';

export type RunScope =
  | { mode: 'normal'; rulesVersion: string }
  | { mode: 'daily'; rulesVersion: string; startedDateJst: string };

export interface SaveToken {
  runId: string;
  revision: number;
  ownerEpoch: number;
}

export interface PersistedRecord {
  scope: RunScope;
  token: SaveToken;
  ownerId: string;
  state: RunState;
  gameTick: number;
  lastSummary: ShotSummary | null;
  lastFreshSets: readonly SetId[];
  /** Original ammunition immediately before the current/most recently fired shot. */
  ammoBeforeShot: number;
  result: FinalResult | null;
  selfBestBefore: number | null;
  newBest: boolean;
  resultViewOpen: boolean;
}

export type SaveFailure = 'quota' | 'unavailable' | 'blocked' | 'conflict' | 'invalid';
export type SaveReply =
  | { ok: true; record: PersistedRecord; freshSets: readonly SetId[]; replayed: boolean }
  | { ok: false; reason: SaveFailure };

export type ConfirmedPresentation =
  | { kind: 'shot'; runId: string; shotId: string; summary: ShotSummary; freshSets: readonly SetId[];
      ammoBeforeShot: number; replayed: boolean; reducedMotion: boolean }
  | { kind: 'perfectLoad'; runId: string; shotNumber: number; operationId: string;
      load: LoadResult; replayed: boolean; reducedMotion: boolean };

export interface SavedProfile {
  bestScore: number | null;
  discoveredSets: readonly SetId[];
  legacyBestScore: number | null;
}
export interface RevisionedShelf extends SouvenirShelf {
  slotRevision: number;
}
export interface SharedSouvenirRepository {
  readShelf(): Promise<RevisionedShelf>;
  place(input: { runId: string; typeId: PrizeTypeId; slot?: number; expectedRevision: number }): Promise<
    | { ok: true; shelf: RevisionedShelf; changed: boolean }
    | Extract<PlaceResult, { ok: false }>
    | { ok: false; reason: 'conflict'; current: RevisionedShelf }
  >;
}

export interface CommandWrite {
  expected: SaveToken;
  operationId: string;
  state: RunState;
  gameTick: number;
}
export interface ShotWrite {
  expected: SaveToken;
  state: RunState;
  summary: ShotSummary;
  gameTick: number;
}
export interface RunRepository extends SharedSouvenirRepository {
  read(scope: RunScope): Promise<PersistedRecord | null>;
  readProfile(scope: RunScope): Promise<SavedProfile>;
  readActiveScope(rulesVersion: string): Promise<RunScope | null>;
  importLegacy(scope: RunScope, storage: Pick<KeyValueStorage,'getItem'>, knownSets: ReadonlySet<SetId>): Promise<{unreadable: readonly string[]}>;
  start(scope: RunScope, initial: RunState, expected: SaveToken | null): Promise<SaveReply>;
  claim(scope: RunScope, expected: SaveToken, resolution: 'resumeStable' | 'abandonInFlight'): Promise<SaveReply>;
  saveCommand(input: CommandWrite): Promise<SaveReply>;
  commitShot(input: ShotWrite): Promise<SaveReply>;
  closeResult(expected: SaveToken): Promise<SaveReply>;
}
