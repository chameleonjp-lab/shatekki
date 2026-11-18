import type { PersistedRecord, SaveFailure } from '../contracts/persistence';

const stores = ['runs', 'profiles', 'receipts', 'meta', 'souvenirs'] as const;
export type Store = (typeof stores)[number];

export interface CheckpointTransaction {
  get<T>(store: Store, key: string): Promise<T | undefined>;
  put(store: Store, key: string, value: unknown): void;
  retireReceipts(runId: string): void;
  runById(id: string): Promise<PersistedRecord | undefined>;
}

export interface CheckpointDatabase {
  close(): void;
  transact<T>(
    mode: IDBTransactionMode,
    use: readonly Store[],
    body: (tx: CheckpointTransaction) => Promise<T>,
  ): Promise<T>;
}

export function databaseFailure(error: unknown): SaveFailure {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') return 'quota';
  if (error instanceof DatabaseError) return error.reason;
  return 'unavailable';
}

class DatabaseError extends Error {
  constructor(readonly reason: SaveFailure) {
    super(reason);
  }
}

function requested<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openCheckpointDatabase(factory: IDBFactory, onVersionChange?: () => void): Promise<CheckpointDatabase> {
  return new Promise((resolve, reject) => {
    const opening = factory.open('shatekki.checkpoints', 1);
    let blocked = false;
    opening.onblocked = () => {
      blocked = true;
      reject(new DatabaseError('blocked'));
    };
    opening.onerror = () => reject(new DatabaseError(databaseFailure(opening.error)));
    opening.onupgradeneeded = () => {
      if (blocked) {
        opening.transaction!.abort();
        return;
      }
      for (const name of stores) {
        const store = opening.result.createObjectStore(name);
        if (name === 'runs') store.createIndex('runId', 'token.runId', { unique: true });
      }
    };
    opening.onsuccess = () => {
      const db = opening.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        onVersionChange?.();
      };
      resolve({
        close: () => db.close(),
        async transact<T>(
          mode: IDBTransactionMode,
          use: readonly Store[],
          body: (tx: CheckpointTransaction) => Promise<T>,
        ) {
          const tx = db.transaction([...use], mode);
          // A successful put request can still roll back. Resolve only after oncomplete.
          const committed = new Promise<void>((done, fail) => {
            tx.oncomplete = () => done();
            tx.onabort = () => fail(tx.error ?? new DatabaseError('unavailable'));
          });
          const result = body({
            get: (name, key) => requested(tx.objectStore(name).get(key)),
            put: (name, key, value) => {
              tx.objectStore(name).put(value, key);
            },
            retireReceipts: (id) => {
              // Keys start with JSON-encoded runId plus '/' (the next ASCII character is '0').
              const prefix = JSON.stringify(id);
              tx.objectStore('receipts').delete(IDBKeyRange.bound(prefix + '/', prefix + '0', false, true));
            },
            runById: (id) => requested(tx.objectStore('runs').index('runId').get(id)),
          }).catch((error) => {
            try {
              tx.abort();
            } catch {
              /* Already aborted by a failed request. */
            }
            throw error;
          });
          return (await Promise.all([result, committed]))[0];
        },
      });
    };
  });
}

/** Ephemeral play gets a private database. Stage all writes before publishing them. */
export function memoryDatabase(): CheckpointDatabase {
  const data = new Map<Store, Map<string, unknown>>(stores.map((s) => [s, new Map()]));
  let queue: Promise<unknown> = Promise.resolve();
  let closed = false;
  return {
    close() {
      closed = true;
    },
    transact(mode, use, body) {
      if (closed) return Promise.reject(new DatabaseError('unavailable'));
      const run = queue.then(async () => {
        const tables = new Map(use.map((s) => [s, new Map(data.get(s)!)]));
        const result = await body({
          get: async <T>(name: Store, key: string) => structuredClone(tables.get(name)!.get(key)) as T | undefined,
          put: (name, key, value) => {
            tables.get(name)!.set(key, structuredClone(value));
          },
          retireReceipts: (id) => {
            const receipts = tables.get('receipts')!;
            for (const key of receipts.keys()) if (key.startsWith(JSON.stringify(id) + '/')) receipts.delete(key);
          },
          runById: async (id) => {
            const records = [...tables.get('runs')!.values()] as PersistedRecord[];
            return structuredClone(records.find((r) => r.token.runId === id));
          },
        });
        if (mode === 'readwrite') for (const [store, table] of tables) data.set(store, table);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
}
