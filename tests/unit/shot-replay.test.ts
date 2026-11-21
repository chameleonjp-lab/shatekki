import { expect, it } from 'vitest';
import { mintId, type ProjectileSpawnedEvent, type ShotSummary, type SimEvent } from '../../src/contracts';
import { ShotReplayRecorder } from '../../src/view/shot-replay';

const runId = mintId.run('replay-run');
const spawn = (shot: number, branch: number): ProjectileSpawnedEvent => ({
  type: 'projectileSpawned',
  eventId: mintId.event(mintId.shot(shot), branch),
  shotId: mintId.shot(shot),
  projectileId: mintId.projectile(mintId.shot(shot), branch),
  parentId: branch === 0 ? null : mintId.projectile(mintId.shot(shot), 0),
  generation: branch === 0 ? 0 : 1,
  position: { x: branch, y: 0, z: 0 },
  velocity: { x: 0, y: 0, z: 1 },
  bulletType: 'standard',
});

it('uses observed branches and confirmed score to pick the highest-spectacle shot', () => {
  const replay = new ShotReplayRecorder();
  const sampleShot = (shot: number, score: number, split: boolean) => {
    const main = spawn(shot, 0);
    const child = spawn(shot, 1);
    const { shotId } = main;
    const events: SimEvent[] = [main];
    if (split) events.push(child);
    for (const cork of split ? [main, child] : [main]) {
      events.push({
        type: 'impact', runId, shotId, eventId: mintId.event(shotId, 2 + cork.generation),
        projectileId: cork.projectileId, target: { kind: 'hidden', targetId: 'test' },
        point: { ...cork.position, z: 1 }, normal: { x: 0, y: 0, z: -1 }, speed: 10, reflectionIndex: 0,
      });
    }
    replay.begin(shotId);
    replay.capture({ shotId, events, stage: null, simTimeSec: 0, prizes: [], projectiles: [] });
    const summary = {
      shotId, runId, shotNumber: 1, collected: [], chainCount: 0, newlyCompletedSets: [],
      ledger: { scoreBefore: 100, scoreAfter: 100 + score },
    } as unknown as ShotSummary;
    replay.confirm(summary);
    return shotId;
  };
  const first = sampleShot(1, 100, false);
  const best = sampleShot(2, 80, true);
  expect(replay.latest(runId, first)).toBeNull();
  expect(replay.latest(runId, best)?.tracks.map(track => track.contacts.length)).toEqual([1, 1]);
  expect(replay.highlight(runId)).toMatchObject({ shotId: best, points: 80 });
  sampleShot(3, 110, false);
  expect(replay.highlight(runId)?.shotId).toBe(best);
  expect(replay.highlight(mintId.run('other-run'))).toBeNull();
  replay.clear();
  expect(replay.highlight(runId)).toBeNull();
});
