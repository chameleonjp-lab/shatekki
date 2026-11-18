import assert from 'node:assert/strict';
import { createServer } from 'vite';

/** Replay this seed with the ordinary candidate rules before packaging its display fixture. */
export async function recordStressSettlement() {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, ws: false } });
  try {
    const [{ playRun }, { getGameplayBundle }] = await Promise.all([
      server.ssrLoadModule('/tests/helpers/scripted-player.ts'), server.ssrLoadModule('/src/catalog/gameplay-config.ts'),
    ]);
    const seed = 197975;
    let confirmed;
    await playRun(getGameplayBundle('expanded-next'), seed, ({ beforeFire, afterShot, summary }) => {
      if (summary.shotNumber !== 18) return;
      assert.equal(summary.chainCount, 2);
      assert.deepEqual(summary.newlyCompletedSets, ['PAIR081', 'PAIR134']);
      assert.ok(summary.newlyCompletedSets.every(id => !beforeFire.completedSets.includes(id)));
      confirmed = { seed, state: afterShot, summary, ammoBeforeShot: beforeFire.ammo };
    });
    assert.ok(confirmed);
    return confirmed;
  } finally {
    await server.close();
  }
}
