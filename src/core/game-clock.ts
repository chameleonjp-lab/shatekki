/** Frame time feeds only whole simulation steps. A question or a save can
 * stop the game inside a long frame. The unplayed suffix then belongs to
 * the wait and must never become simulation time. */
export class FixedGameClock {
  private remainderSec = 0;

  constructor(readonly stepSec: number, private tick = 0) {
    if (!Number.isFinite(stepSec) || stepSec <= 0) throw new RangeError('invalid simulation step');
    if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('invalid game tick');
  }

  get currentTick(): number {
    return this.tick;
  }

  advance(rawDtSec: number, paused: boolean, step?: (tick: number) => boolean): readonly number[] {
    if (paused) {
      this.remainderSec = 0;
      return [];
    }
    if (!Number.isFinite(rawDtSec) || rawDtSec <= 0) return [];
    this.remainderSec += rawDtSec;
    const count = Math.floor(this.remainderSec / this.stepSec + 1e-9);
    this.remainderSec = Math.max(0, this.remainderSec - count * this.stepSec);
    const ticks: number[] = [];
    for (let i = 0; i < count; i++) {
      ticks.push(++this.tick);
      if (step && !step(this.tick)) {
        this.remainderSec = 0;
        break;
      }
    }
    return ticks;
  }
}
