import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createMeter, watchPageBreaks } from '../../scripts/release/preview-intervals.js';
import { createGameHistory, createSettlementWindow } from '../../scripts/release/preview-frame-meter.js';

test('intervals belong to one continuous scene in one shot; slow visible frames count', () => {
  const meter = createMeter();
  for (const [at, scene, shot] of [[0,'flight',1],[20,'flight',1],[150,'flight',1],
    [180,'reward',1],[200,'reward',1],[300,null,1],[1000,'flight',2]]) meter.sample(at, scene, shot);
  meter.resetInterval();
  meter.sample(3000, 'flight', 2);
  meter.sample(4000, 'flight', 3);
  const {flight, reward} = meter.report();
  assert.equal(flight.frames, 2);
  assert.equal(flight.worstMs, 130);
  assert.equal(flight.seconds, .15);
  assert.equal(flight.intervalsOver33ms, 1);
  assert.equal(reward.frames, 1);
  assert.equal(reward.fps, 50);
});

test('the heavy interval starts at the live confirmation; a late observation or old card cannot restart it', () => {
  const window = createSettlementWindow();
  const frame = { run: 'a', shot: 18 };
  assert.equal(window.includes(10, frame), false);
  window.start(100, 'a', 18, 2);
  assert.equal(window.includes(99, frame), false);
  assert.equal(window.includes(100, frame), true);
  assert.equal(window.includes(1000, frame), true);
  assert.equal(window.includes(1001, frame), false);
  assert.equal(window.includes(300, { run: 'b', shot: 18 }), false);
  assert.equal(window.includes(300, { run: 'a', shot: 19 }), false);
  window.start(1200, 'a', 19, 1);
  assert.equal(window.includes(1250, { run: 'a', shot: 19 }), false);
});

test('hiding, page cache, freezing and viewport changes break elapsed time even without a rendered frame', () => {
  const doc = new EventTarget();
  const win = Object.assign(new EventTarget(), { visualViewport: new EventTarget() });
  const meter = createMeter();
  watchPageBreaks(meter.resetInterval, doc, win);
  let at = 0;
  for (const [target, event] of [[doc, 'visibilitychange'], [doc, 'freeze'], [doc, 'resume'],
    [win, 'pagehide'], [win, 'pageshow'], [win, 'resize'], [win.visualViewport, 'resize']]) {
    meter.sample(at, 'eight', 'same shot');
    meter.sample(at + 20, 'eight', 'same shot');
    target.dispatchEvent(new Event(event));
    at += 5000;
  }
  meter.sample(at, 'eight', 'same shot');
  assert.equal(meter.seconds('eight'), 0.14);
  assert.equal(meter.report().eight.worstMs, 20);
});

test('three consecutive whole games exclude a restored partial run or an abandoned game', () => {
  const games = createGameHistory();
  games.observe('partial', 7);
  games.finish('partial', 10);
  games.observe('one', 0);
  games.finish('one', 14);
  games.observe('abandoned', 0);
  for (const run of ['two', 'three', 'four']) {
    games.observe(run, 0);
    games.finish(run, 12);
  }
  assert.equal(games.report().completedGames, 5);
  assert.equal(games.report().longestConsecutiveFullGames, 3);
});
