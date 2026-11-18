import type { Page } from '@playwright/test';
import type { PersistedRecord } from '../../src/contracts/persistence';

export async function readRecordedRun(page: Page): Promise<PersistedRecord> {
  return page.evaluate(() => new Promise<PersistedRecord>((resolve, reject) => {
    const open = indexedDB.open('shatekki.checkpoints');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction('runs', 'readonly');
      const request = tx.objectStore('runs').getAll();
      tx.oncomplete = () => { db.close(); resolve(request.result[0]); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  }));
}
