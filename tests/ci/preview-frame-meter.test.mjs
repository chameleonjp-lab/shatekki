import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createMeter } from '../../scripts/release/preview-frame-meter.js';

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
