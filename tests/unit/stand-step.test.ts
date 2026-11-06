import { describe, expect, it } from 'vitest';
import { BOOTH_LAYOUT_V2 } from '../../src/contracts';
import { nextStandX, standRangeOf } from '../../src/ui/controls/stand';

describe('wide stall stand steps', () => {
  const r = standRangeOf(BOOTH_LAYOUT_V2);
  it('reads the v2 range and column pitch from the layout', () => {
    expect(r.min).toBeCloseTo(-2.35, 9);
    expect(r.max).toBeCloseTo(2.35, 9);
    expect(r.step).toBeCloseTo(0.42, 9);
    expect(r.origin).toBeCloseTo(-2.31, 9);
  });
  it('steps one column at a time and snaps from between columns', () => {
    expect(nextStandX(-2.31, 1, r)).toBeCloseTo(-1.89, 9);
    expect(nextStandX(-2.31, -1, r)).toBeCloseTo(-2.35, 9);
    expect(nextStandX(0, 1, r)).toBeCloseTo(0.21, 9);
    expect(nextStandX(0, -1, r)).toBeCloseTo(-0.21, 9);
    expect(nextStandX(0.3, 1, r)).toBeCloseTo(0.63, 9);
  });
  it('reaches both ends of the stall in 13 steps (12 columns, then the margin) and never leaves the range', () => {
    let x = r.min;
    for (let i = 0; i < 13; i++) x = nextStandX(x, 1, r);
    expect(x).toBeCloseTo(r.max, 9);
    for (let i = 0; i < 13; i++) x = nextStandX(x, -1, r);
    expect(x).toBeCloseTo(r.min, 9);
  });
});
