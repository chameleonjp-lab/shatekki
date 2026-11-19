import { isAmmoBalanced, type GameplayBundle, type KeyValueStorage, type RunState, type SetId } from '../contracts';
import { RELEASE_CATALOG } from '../catalog/release-config';
import type {
  CommandWrite,
  PersistedRecord,
  RunRepository,
  RunScope,
  SavedProfile,
  SaveReply,
  SaveToken,
  ShotWrite,
} from '../contracts/persistence';
import { finalResult } from '../core/result';
import { planRestore, validateRunState } from '../core/session';
import {
  databaseFailure,
  memoryDatabase,
  openCheckpointDatabase,
  type CheckpointDatabase,
  type CheckpointTransaction,
  type Store,
} from './checkpoint-database';
import { checkSouvenirSlots, collectLegacyProfile, readLegacyShelf } from './legacy-import';
import { SOUVENIR_KEY, SOUVENIR_SLOTS } from './souvenirs';

const invalid = { ok: false, reason: 'invalid' } as const;
const conflict = { ok: false, reason: 'conflict' } as const;
const success = (record: PersistedRecord, replayed = false, freshSets: readonly SetId[] = []): SaveReply => ({
  ok: true,
  record,
  freshSets,
  replayed,
});
const key = (...parts: (string | number)[]) => JSON.stringify(parts);
const scopeKey = (s: RunScope) => key(s.mode, s.rulesVersion, s.mode === 'daily' ? s.startedDateJst : '');
const activeKey = (version: string) => key('activeDaily', version);
const bookKey = (s: RunScope) => key('book', s.mode, s.rulesVersion);
const bestKey = (s: RunScope) => key('best', scopeKey(s));
const terminal = (state: RunState) => state.phase === 'ended' || state.phase === 'abandoned';
const sameToken = (a: SaveToken, b: SaveToken) =>
  a.runId === b.runId && a.revision === b.revision && a.ownerEpoch === b.ownerEpoch;
const validScope = (scope: RunScope) =>
  /^[a-zA-Z0-9.-]+$/.test(scope.rulesVersion) &&
  (scope.mode === 'normal' || (scope.mode === 'daily' && /^\d{4}-\d{2}-\d{2}$/.test(scope.startedDateJst)));

async function profile(tx: CheckpointTransaction, scope: RunScope): Promise<SavedProfile> {
  const book = await tx.get<Omit<SavedProfile, 'bestScore'>>('profiles', bookKey(scope));
  return {
    discoveredSets: book?.discoveredSets ?? [],
    legacyBestScore: book?.legacyBestScore ?? null,
    bestScore: (await tx.get<number>('profiles', bestKey(scope))) ?? null,
  };
}

/** Canonical plain JSON. Compute before opening the transaction. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.keys(item)
          .sort()
          .map((k) => [k, item[k]]),
      );
    }
    return item;
  });
}

/** r007 "店主と話す": the only command that may add a cork, once per run, together with its reservation. */
function talkAllowed(from: RunState, to: RunState, operationId: string): boolean {
  const before = from.expansion?.aimFirst;
  const after = to.expansion?.aimFirst;
  if (!before || !after || before.talk !== null || after.talk === null) return false;
  const granted = after.talk.ammoGranted;
  return (
    operationId === to.runId + '/shopkeeper-talk' &&
    from.phase === 'aiming' && to.phase === 'aiming' &&
    to.inFlight === null &&
    from.shotsFired === to.shotsFired &&
    after.talk.afterShot === to.shotsFired &&
    to.ammo === from.ammo + granted &&
    to.bonusAmmoTotal === from.bonusAmmoTotal + granted &&
    canonical(from.ledger) === canonical(to.ledger) &&
    canonical(from.collected) === canonical(to.collected) &&
    canonical(from.completedSets) === canonical(to.completedSets) &&
    from.score === to.score
  );
}

function commandAllowed(from: RunState, to: RunState, operationId: string): boolean {
  if (!terminal(from) && operationId.endsWith('/shopkeeper-talk')) return talkAllowed(from, to, operationId);
  // r007 saves each finished move/aim as its own numbered operation; nothing else may change with it.
  const aimSeq = to.expansion?.aimFirst?.aimSeq;
  if (operationId.includes('/aim/') && (aimSeq === undefined || operationId !== to.runId + '/aim/' + aimSeq || aimSeq !== (from.expansion?.aimFirst?.aimSeq ?? -1) + 1 || from.phase !== 'aiming' || to.phase !== 'aiming')) return false;
  // Points, discoveries, and earlier shot records only change at settlement.
  if (
    terminal(from) ||
    from.score !== to.score ||
    from.bonusAmmoTotal !== to.bonusAmmoTotal ||
    canonical(from.ledger) !== canonical(to.ledger) ||
    canonical(from.collected) !== canonical(to.collected) ||
    canonical(from.completedSets) !== canonical(to.completedSets)
  )
    return false;
  // r007 opens the gauge locally, so its FIRE is saved from the last saved aiming (or loading) state.
  if ((from.phase === 'aiming' || (from.phase === 'loading' && from.expansion?.aimFirst)) && to.phase === 'resolving') {
    return (
      operationId === to.runId + '/' + to.shotsFired + '/fire' &&
      to.shotsFired === from.shotsFired + 1 &&
      to.ammo === from.ammo - 1 &&
      to.inFlight?.shotNumber === to.shotsFired
    );
  }
  if (from.shotsFired !== to.shotsFired || from.ammo !== to.ammo || from.score !== to.score) return false;
  if (to.phase === 'abandoned') return to.inFlight === null;
  if (from.phase === 'resolving')
    return to.phase === 'resolving' && !!to.inFlight && from.inFlight?.shotId === to.inFlight.shotId;
  if (to.inFlight !== null) return false;
  return (
    from.phase === to.phase ||
    (from.phase === 'position' && to.phase === 'loading') ||
    (from.phase === 'loading' && to.phase === 'aiming')
  );
}

function createRepository(
  db: CheckpointDatabase,
  writerId: string,
  ephemeral: boolean,
  bundle?: GameplayBundle,
): RunRepository {
  const knownPrizes = (bundle?.catalog ?? RELEASE_CATALOG).prizes;
  /** r007: runs start and continue in the aiming phase (there is no position step). */
  const aimFirst = !!bundle?.expansion?.profile.aimFirst;
  const validState = (state: RunState) =>
    bundle
      ? validateRunState(state, bundle.catalog, bundle.tuning, bundle.layout, bundle.expansion) === null
      : isAmmoBalanced(state, 10);
  function validRecord(record: PersistedRecord) {
    return (
      record?.scope?.rulesVersion === record?.state?.rulesVersion &&
      typeof record?.state?.runId === 'string' &&
      record.token?.runId === record.state.runId &&
      Number.isSafeInteger(record.token.revision) &&
      record.token.revision > 0 &&
      Number.isSafeInteger(record.token.ownerEpoch) &&
      record.token.ownerEpoch > 0 &&
      validState(record.state) &&
      (terminal(record.state)
        ? canonical(record.result) === canonical(finalResult(record.state))
        : record.result === null && !record.resultViewOpen)
    );
  }
  async function write(stores: Store[], body: (tx: CheckpointTransaction) => Promise<SaveReply>): Promise<SaveReply> {
    try {
      return await db.transact('readwrite', stores, body);
    } catch (error) {
      return { ok: false, reason: databaseFailure(error) };
    }
  }

  async function readSharedShelf(tx: CheckpointTransaction) {
    const stored = await tx.get<unknown>('souvenirs', 'shared');
    const checked = stored === undefined
      ? { slots: Array.from({ length: SOUVENIR_SLOTS }, () => null), damaged: false }
      : checkSouvenirSlots(stored, knownPrizes);
    const slotRevision = (await tx.get<number>('meta', 'slotRevision')) ?? 0;
    return { exists: stored !== undefined, damaged: checked.damaged, shelf: { slots: checked.slots, slotRevision } };
  }

  /** Report any skipped slots even when retrying a previously committed import. */
  async function importShelf(tx: CheckpointTransaction, storage: Pick<KeyValueStorage, 'getItem'>): Promise<boolean> {
    const current = await readSharedShelf(tx);
    if (current.damaged) {
      // An earlier build may already have imported duplicates or unknown kinds. A newer win keeps its slot.
      tx.put('souvenirs', 'shared', current.shelf.slots);
      tx.put('meta', 'slotRevision', current.shelf.slotRevision + 1);
      tx.put('meta', 'shelfImported', 'partial');
      return true;
    }
    const imported = await tx.get<true | 'partial'>('meta', 'shelfImported');
    if (imported) return imported === 'partial';
    let legacy;
    try {
      legacy = readLegacyShelf(storage, knownPrizes);
    } catch {
      // A denied read or unparseable value can be tried again at the next explicit start.
      return true;
    }
    if (legacy && !current.exists && (!legacy.damaged || legacy.slots.some(slot => slot !== null))) {
      tx.put('souvenirs', 'shared', legacy.slots);
      tx.put('meta', 'slotRevision', current.shelf.slotRevision + 1);
    }
    tx.put('meta', 'shelfImported', legacy?.damaged ? 'partial' : true);
    return legacy?.damaged ?? false;
  }

  async function save(input: CommandWrite | ShotWrite): Promise<SaveReply> {
    const { expected, state, gameTick } = input;
    const summary = 'summary' in input ? input.summary : null;
    const operationId =
      'operationId' in input ? input.operationId : state.runId + '/' + input.summary.shotNumber + '/settle';
    if (
      !operationId ||
      state.runId !== expected.runId ||
      !Number.isSafeInteger(gameTick) ||
      gameTick < 0 ||
      !validState(state)
    ) {
      return Promise.resolve(invalid);
    }
    const receiptKey = JSON.stringify(state.runId) + '/' + operationId;
    // Keep a fixed-size digest, never a second shelf and ledger for every tap.
    let signature: string;
    try {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(input)));
      signature = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, '0')).join('');
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    return write(['runs', 'profiles', 'receipts'], async (tx) => {
      const current = await tx.runById(expected.runId);
      if (!current) return conflict;
      if (!validRecord(current)) return invalid;
      if (current.scope.rulesVersion !== state.rulesVersion) return invalid;
      const receipt = await tx.get<string>('receipts', receiptKey);
      if (receipt !== undefined) return receipt === signature ? success(current, true) : invalid;
      if (current.ownerId !== writerId || !sameToken(current.token, expected)) return conflict;
      if (
        gameTick < current.gameTick ||
        state.seed !== current.state.seed ||
        state.playerName !== current.state.playerName
      )
        return invalid;
      let newBest = false;
      let selfBestBefore = current.selfBestBefore;
      let freshSets: SetId[] = [];
      if (summary) {
        if (
          current.state.phase !== 'resolving' ||
          current.state.inFlight?.shotId !== summary.shotId ||
          summary.runId !== state.runId ||
          summary.shotNumber !== state.shotsFired ||
          state.shotsFired !== current.state.shotsFired ||
          state.inFlight !== null ||
          (state.phase !== 'ended' && state.phase !== (aimFirst ? 'aiming' : 'position')) ||
          summary.runEnded !== (state.phase === 'ended') ||
          summary.ammoAfter !== state.ammo ||
          summary.ledger.scoreBefore !== current.state.score ||
          summary.ledger.scoreAfter !== state.score ||
          summary.chainCount !== summary.collected.length ||
          canonical(state.ledger) !== canonical([...current.state.ledger, summary.ledger]) ||
          canonical(state.completedSets) !==
            canonical([...current.state.completedSets, ...summary.newlyCompletedSets]) ||
          canonical(state.collected) !== canonical([...current.state.collected, ...summary.collected])
        )
          return invalid;
        const before = await profile(tx, current.scope);
        const known = new Set(before.discoveredSets);
        freshSets = [...new Set(summary.newlyCompletedSets)].filter((id) => !known.has(id));
        if (freshSets.length)
          tx.put('profiles', bookKey(current.scope), {
            discoveredSets: [...known, ...freshSets],
            legacyBestScore: before.legacyBestScore,
          });
        if (state.phase === 'ended') {
          selfBestBefore = before.bestScore;
          newBest = selfBestBefore === null || state.score > selfBestBefore;
          if (newBest) tx.put('profiles', bestKey(current.scope), state.score);
        }
      } else if (!commandAllowed(current.state, state, operationId)) return invalid;
      const record: PersistedRecord = {
        ...current,
        state,
        gameTick,
        token: { ...current.token, revision: expected.revision + 1 },
        ammoBeforeShot: state.shotsFired > current.state.shotsFired ? current.state.ammo : current.ammoBeforeShot,
        lastSummary: summary ?? current.lastSummary,
        lastFreshSets: summary ? freshSets : current.lastFreshSets,
        result: terminal(state) ? finalResult(state) : null,
        resultViewOpen: terminal(state),
        newBest,
        selfBestBefore,
      };
      tx.put('runs', scopeKey(current.scope), record);
      tx.put('receipts', receiptKey, signature);
      return success(record, false, freshSets);
    });
  }

  return {
    close: () => db.close(),
    read: (scope) =>
      db.transact('readonly', ['runs'], async (tx) => {
        const record = await tx.get<PersistedRecord>('runs', scopeKey(scope));
        if (record && (!validRecord(record) || scopeKey(record.scope) !== scopeKey(scope)))
          throw Error('invalid checkpoint');
        return record ?? null;
      }),
    readActiveScope: (version) =>
      db.transact('readonly', ['meta'], async (tx) => (await tx.get<RunScope>('meta', activeKey(version))) ?? null),
    readProfile: (scope) => db.transact('readonly', ['profiles'], (tx) => profile(tx, scope)),
    readShelf: () => db.transact('readonly', ['souvenirs', 'meta'], async tx => (await readSharedShelf(tx)).shelf),

    async importLegacy(scope, storage, knownSets) {
      if (ephemeral) return { unreadable: [] };
      const { discoveredSets, legacyBestScore, unreadable } = collectLegacyProfile(scope, storage, knownSets);
      return db.transact('readwrite', ['meta', 'profiles', 'souvenirs'], async (tx) => {
        const before = await profile(tx, scope);
        const sets = [...new Set([...before.discoveredSets, ...discoveredSets])];
        const best =
          legacyBestScore === null ? before.legacyBestScore : Math.max(before.legacyBestScore ?? 0, legacyBestScore);
        if (sets.length !== before.discoveredSets.length || best !== before.legacyBestScore) {
          tx.put('profiles', bookKey(scope), { discoveredSets: sets, legacyBestScore: best });
        }
        const shelfWasUnreadable = await importShelf(tx, storage);
        if (shelfWasUnreadable) unreadable.push(SOUVENIR_KEY);
        const importKey = key('import', bookKey(scope));
        const stamp = canonical({ discoveredSets, legacyBestScore, unreadable });
        if ((await tx.get<string>('meta', importKey)) !== stamp) tx.put('meta', importKey, stamp);
        return { unreadable };
      });
    },

    start(scope, state, expected) {
      return write(['runs', 'profiles', 'receipts', 'meta'], async (tx) => {
        if (
          !validScope(scope) ||
          scope.rulesVersion !== state.rulesVersion ||
          !state.runId ||
          state.phase !== (aimFirst ? 'aiming' : 'position') ||
          state.inFlight ||
          state.shotsFired !== 0 ||
          !validState(state)
        )
          return invalid;
        const current = await tx.get<PersistedRecord>('runs', scopeKey(scope));
        if (current && !validRecord(current)) return invalid;
        if (
          current
            ? !expected || !sameToken(current.token, expected) || !terminal(current.state) || current.resultViewOpen
            : expected !== null
        )
          return conflict;
        if (await tx.get<boolean>('meta', key('usedRun', state.runId))) return conflict;
        if (scope.mode === 'daily') {
          const active = await tx.get<RunScope>('meta', activeKey(scope.rulesVersion));
          if (active && scopeKey(active) !== scopeKey(scope)) return conflict;
          tx.put('meta', activeKey(scope.rulesVersion), scope);
        }
        const record: PersistedRecord = {
          scope,
          state,
          ownerId: writerId,
          token: { runId: state.runId, ownerEpoch: 1, revision: 1 },
          gameTick: 0,
          lastSummary: null,
          lastFreshSets: [],
          ammoBeforeShot: state.ammo,
          result: null,
          resultViewOpen: false,
          selfBestBefore: (await profile(tx, scope)).bestScore,
          newBest: false,
        };
        tx.put('runs', scopeKey(scope), record);
        if (current) tx.retireReceipts(current.token.runId);
        tx.put('meta', key('usedRun', state.runId), true);
        return success(record);
      });
    },
    claim(scope, expected, resolution) {
      return write(['runs'], async (tx) => {
        const record = await tx.get<PersistedRecord>('runs', scopeKey(scope));
        if (!record || !sameToken(record.token, expected)) return conflict;
        if (!validRecord(record) || terminal(record.state)) return invalid;
        const restore = planRestore(record.state);
        if (resolution === 'resumeStable' ? restore.kind !== 'resume' : restore.kind !== 'abandoned') return invalid;
        const state = restore.state;
        const next: PersistedRecord = {
          ...record,
          state,
          ownerId: writerId,
          token: { ...expected, ownerEpoch: expected.ownerEpoch + 1, revision: expected.revision + 1 },
          resultViewOpen: terminal(state),
          result: terminal(state) ? finalResult(state) : null,
        };
        tx.put('runs', scopeKey(scope), next);
        return success(next);
      });
    },
    saveCommand: save,
    commitShot: save,
    closeResult(expected) {
      return write(['runs', 'meta'], async (tx) => {
        const current = await tx.runById(expected.runId);
        if (!current || !sameToken(current.token, expected)) return conflict;
        if (!validRecord(current) || !terminal(current.state)) return invalid;
        if (!current.resultViewOpen) return success(current, true);
        const next = { ...current, resultViewOpen: false, token: { ...expected, revision: expected.revision + 1 } };
        tx.put('runs', scopeKey(current.scope), next);
        if (current.scope.mode === 'daily') tx.put('meta', activeKey(current.scope.rulesVersion), null);
        return success(next);
      });
    },
    async place({ runId, typeId, slot, expectedRevision }) {
      if (ephemeral) return { ok: false, reason: 'notWonInThisGame' };
      try {
        return await db.transact('readwrite', ['runs', 'meta', 'souvenirs'], async (tx) => {
          const { shelf: current } = await readSharedShelf(tx);
          const record = await tx.runById(runId);
          if (
            !record ||
            !validRecord(record) ||
            record.result?.status !== 'completed' ||
            !record.result.collected.some((p) => p.typeId === typeId)
          )
            return { ok: false, reason: 'notWonInThisGame' };
          if (expectedRevision !== current.slotRevision) return { ok: false, reason: 'conflict', current };
          if (current.slots.some((s) => s?.typeId === typeId)) return { ok: true, shelf: current, changed: false };
          let index = current.slots.indexOf(null);
          if (index < 0) {
            if (slot === undefined) return { ok: false, reason: 'chooseSlot' };
            if (!Number.isInteger(slot) || slot < 0 || slot >= SOUVENIR_SLOTS) return { ok: false, reason: 'badSlot' };
            index = slot;
          }
          const next = {
            slots: current.slots.map((s, i) => (i === index ? { typeId, runId } : s)),
            slotRevision: current.slotRevision + 1,
          };
          tx.put('souvenirs', 'shared', next.slots);
          tx.put('meta', 'slotRevision', next.slotRevision);
          return { ok: true, shelf: next, changed: true };
        });
      } catch {
        return { ok: false, reason: 'saveFailed' };
      }
    },
  };
}

export async function createIndexedRunRepository(
  factory: IDBFactory,
  writerId: string,
  bundle?: GameplayBundle,
  onVersionChange?: () => void,
): Promise<RunRepository> {
  return createRepository(await openCheckpointDatabase(factory, onVersionChange), writerId, false, bundle);
}

export function createMemoryRunRepository(writerId: string, bundle?: GameplayBundle): RunRepository {
  return createRepository(memoryDatabase(), writerId, true, bundle);
}
