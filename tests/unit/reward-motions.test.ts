import { describe, it, expect, vi } from 'vitest';
import type { LoadResult, ShotSummary } from '../../src/contracts';
import type { ConfirmedPresentation } from '../../src/contracts/persistence';
import { mountRewardMotions } from '../../src/view/reward-motions';
import { fakeRoot } from './fake-dom';

const shot = (change: Partial<ShotSummary> = {}, fresh: string[] = []): ConfirmedPresentation => ({
  kind: 'shot', runId: 'run', shotId: 's1', ammoBeforeShot: 1,
  summary: {
    collected: [{ instanceId: 'i1', typeId: 'P001' }, { instanceId: 'i2', typeId: 'P002' }],
    chainCount: 2, newlyCompletedSets: [], ammoAfter: 2, bonusAmmoGranted: 2, rewards: [], runEnded: false, ...change,
  } as ShotSummary, freshSets: fresh as never[], replayed: false, reducedMotion: false,
});
const perfect: ConfirmedPresentation = {
  kind: 'perfectLoad', runId: 'run', shotNumber: 1, operationId: 'first-load',
  load: { tier: 'perfect' } as LoadResult, replayed: false, reducedMotion: false,
};
function setup() {
  const root = fakeRoot(), cue = vi.fn(), card = vi.fn();
  return { root, cue, card, ...mountRewardMotions(root as never, { cue, card }) };
}

describe('confirmed reward presentation', () => {
  it('presents the first perfect load exactly once without a previous shot', () => {
    const v = setup();
    v.presentRewardMotion(perfect);
    v.presentRewardMotion(perfect);
    expect(v.root.all(e => e.dataset.motion === 'latch')).toHaveLength(1);
    expect(v.cue.mock.calls).toEqual([['critLatch']]);
    expect(v.card).not.toHaveBeenCalled();
  });
  it('uses discovery before continuing, and the real cork count before a multi-take', () => {
    const v = setup();
    v.presentRewardMotion(shot({ newlyCompletedSets: ['PAIR001'] as never[] }, ['PAIR001']));
    expect(v.cue.mock.calls).toEqual([['setDiscovered']]);
    expect(v.root.find(e => e.dataset.motion === 'discovery')).toBeTruthy();
    v.presentRewardMotion({ ...shot(), shotId: 's2' } as ConfirmedPresentation);
    expect(v.root.all(e => e.dataset.token === 'cork')).toHaveLength(2);
    expect(v.cue.mock.lastCall).toEqual(['lastShotContinue']);
  });
  it('moves each won instance and uses the same one cue as the card', () => {
    const v = setup();
    v.presentRewardMotion({ ...shot(), ammoBeforeShot: 3 } as ConfirmedPresentation);
    expect(v.root.all(e => e.dataset.token === 'ticket').map(e => e.dataset.prize)).toEqual(['P001','P002']);
    expect(v.cue.mock.calls).toEqual([['takeTier', { count: 2 }]]);
  });
  it('keeps a capped result and replay readable with no replayed cue or extra cork', () => {
    const v = setup();
    const event = shot({ ammoAfter: 0, bonusAmmoGranted: 0, chainCount: 0, collected: [], runEnded: true });
    v.presentRewardMotion({ ...event, replayed: true });
    v.presentRewardMotion(event);
    expect(v.card).toHaveBeenCalledTimes(1);
    expect(v.root.all(e => Boolean(e.dataset.token))).toHaveLength(0);
    expect(v.cue).not.toHaveBeenCalled();
  });
  it('motion reduction leaves the card and notification, and repeated disposal removes all decoration', () => {
    for (let i = 0; i < 60; i++) {
      const v = setup();
      v.presentRewardMotion({ ...shot(), reducedMotion: true });
      expect(v.card).toHaveBeenCalledTimes(1);
      expect(v.root.all(e => Boolean(e.dataset.motion))).toHaveLength(0);
      v.presentRewardMotion(perfect);
      v.destroy();
      expect(v.root.children).toHaveLength(0);
    }
  });
});

describe('09 r007: any set is the one big moment and its sound plays once', () => {
  const r7 = () => {
    const root = fakeRoot(), cue = vi.fn(), card = vi.fn();
    return { root, cue, card, ...mountRewardMotions(root as never, { cue, card, setsFirst: true }) };
  };
  it('a re-completed set on the last cork with several prizes: one setComplete cue, the discovery motion, no continue or take sound', () => {
    const v = r7();
    v.presentRewardMotion(shot({ newlyCompletedSets: ['PAIR001'] as never[] }));
    expect(v.cue.mock.calls).toEqual([['setComplete']]);
    expect(v.root.find(e => e.dataset.motion === 'discovery')).toBeTruthy();
    expect(v.root.all(e => e.dataset.token === 'cork')).toHaveLength(0);
  });
  it('a first discovery keeps its own sound; a replay plays nothing again', () => {
    const v = r7();
    const ev = shot({ newlyCompletedSets: ['PAIR001', 'S010'] as never[] }, ['S010']);
    v.presentRewardMotion(ev);
    v.presentRewardMotion(ev);
    v.presentRewardMotion({ ...ev, shotId: 's9', replayed: true } as ConfirmedPresentation);
    expect(v.cue.mock.calls).toEqual([['setDiscovered']]);
    expect(v.card).toHaveBeenCalledTimes(2);
  });
});
