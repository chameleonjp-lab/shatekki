import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, type Page } from '@playwright/test';
import type { RunState } from '../../src/contracts';
import type { PersistedRecord } from '../../src/contracts/persistence';

type Outcome = 'ended' | 'rescued' | 'capped';

/** Restore a stable pre-FIRE state from a seeded game played by scripted-player.
 * The candidate computes the upcoming flight, scoring, discoveries and display.
 * Callers use a fresh browser context and may keep its clock paused for tick-precise input.
 */
export async function restoreBeforeShot(page: Page, outcome: Outcome) {
  const { beforeFire, gameTick } = JSON.parse(gunzipSync(readFileSync(
    new URL(`../fixtures/outcomes/${outcome}.json.gz`, import.meta.url),
  )).toString()) as { beforeFire: RunState; gameTick: number };
  await page.goto('/?e2e=1');
  await expect(page.locator('#app')).toHaveAttribute('data-rules-version', beforeFire.rulesVersion);
  await expect(page.getByTestId('home-start')).toBeVisible();
  await page.evaluate(({ state, gameTick }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open('shatekki.checkpoints');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(['runs', 'profiles'], 'readwrite');
      const runs = tx.objectStore('runs');
      const count = runs.count();
      count.onsuccess = () => {
        if (count.result !== 0) { tx.abort(); return; }
        const record: PersistedRecord = {
          scope: { mode: 'normal', rulesVersion: state.rulesVersion },
          token: { runId: state.runId, revision: 1, ownerEpoch: 1 }, ownerId: 'restore-fixture',
          state, gameTick, lastSummary: null, lastFreshSets: [], ammoBeforeShot: state.ammo,
          result: null, selfBestBefore: null, newBest: false, resultViewOpen: false,
        };
        runs.add(record, JSON.stringify(['normal', state.rulesVersion, '']));
        tx.objectStore('profiles').put({
          discoveredSets: state.completedSets, legacyBestScore: null,
        }, JSON.stringify(['book', 'normal', state.rulesVersion]));
      };
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error ?? Error('expected an empty test run store')); };
    };
  }), { state: beforeFire, gameTick });
  await page.reload();
  await page.getByTestId('btn-resume-run').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'paused');
  await page.getByTestId('btn-resume').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  return beforeFire;
}
