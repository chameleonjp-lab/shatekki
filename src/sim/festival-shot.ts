import {
  FESTIVAL_BELL_PRIZE, FESTIVAL_BELLS, FESTIVAL_ENCORE, FESTIVAL_EYES, FESTIVAL_FUSE, FESTIVAL_LANTERNS, FESTIVAL_PAIR,
  GIANT_FRICTION, GIANT_MASS, GIANT_SLIDE_LIMIT, festivalBellOrder, giantTarget,
} from '../contracts/festival';
import type { FestivalMark, FestivalProgress, FestivalShot, FestivalSignal, FestivalTarget, FestivalTargetId } from '../contracts/festival';
import type { PrizeInstanceId, Vec3 } from '../contracts';
import { GRAVITY, add, dot, scale } from './collisions';

const REGULAR_TARGETS = [...FESTIVAL_LANTERNS, ...FESTIVAL_PAIR, ...FESTIVAL_BELLS, ...FESTIVAL_EYES, FESTIVAL_FUSE, FESTIVAL_BELL_PRIZE];
const ENCORE_TARGETS = [FESTIVAL_ENCORE];

/** Earliest entry on a swept segment. A stationary point and a segment starting inside are well-defined. */
function entry(from: Vec3, delta: Vec3, target: FestivalTarget, corkRadius: number): number | null {
  const d = { x: from.x - target.center.x, y: from.y - target.center.y, z: from.z - target.center.z };
  const radius = target.radius + corkRadius;
  if (Math.abs(d.x) > radius + Math.abs(delta.x) || Math.abs(d.y) > radius + Math.abs(delta.y) ||
      Math.abs(d.z) > radius + Math.abs(delta.z)) return null;
  const c = dot(d, d) - radius * radius;
  if (c <= 0) return 0;
  const a = dot(delta, delta);
  const b = dot(d, delta);
  const discriminant = b * b - a * c;
  if (a === 0 || b >= 0 || discriminant < 0) return null;
  const time = (-b - Math.sqrt(discriminant)) / a;
  return time >= 0 && time <= 1 ? time : null;
}

export class FestivalShotTracker {
  private progress: FestivalProgress;
  private readonly order: readonly FestivalTargetId[];
  private readonly seen = new Set<FestivalTargetId>();
  private lanterns = 0;
  private giant: FestivalTarget;
  private readonly signals: FestivalSignal[] = [];
  private readonly struck = new Set<PrizeInstanceId>();
  private readonly reached = new Set<PrizeInstanceId>();
  private readonly domino = new Map<PrizeInstanceId, { via: PrizeInstanceId; point: Vec3 }>();

  constructor(progress: FestivalProgress, seed: number, private readonly publish: (signal: FestivalSignal) => void) {
    this.progress = progress;
    this.order = festivalBellOrder(seed);
    this.giant = giantTarget(progress.giant);
  }

  direct(id: PrizeInstanceId): void {
    this.struck.add(id);
    this.reached.add(id);
  }

  contact(a: PrizeInstanceId, b: PrizeInstanceId, aHome: Vec3, bHome: Vec3): void {
    if (this.reached.has(a) === this.reached.has(b)) return;
    const [via, next, point] = this.reached.has(a) ? [a, b, bHome] : [b, a, aHome];
    this.reached.add(next);
    this.domino.set(next, { via, point });
  }

  finish(collected: readonly PrizeInstanceId[]): FestivalShot {
    const domino = collected.flatMap(instanceId => {
      const trace = this.domino.get(instanceId);
      return trace && !this.struck.has(instanceId) ? [{ instanceId, ...trace }] : [];
    });
    return { progress: this.progress, signals: this.signals, domino };
  }

  sweep(from: Vec3, to: Vec3, radius: number, reflections: number, impulse: number): void {
    if (from === to) return;
    const delta = { x: to.x - from.x, y: to.y - from.y, z: to.z - from.z };
    if (dot(delta, delta) <= 1e-14) return;
    const encore = this.progress.encore === 'ready';
    const targets = encore ? ENCORE_TARGETS : REGULAR_TARGETS;
    let hits: { id: FestivalTargetId; time: number }[] | undefined;
    const sample = (target: FestivalTarget) => {
      if (this.seen.has(target.id)) return;
      const time = entry(from, delta, target, radius);
      if (time !== null) (hits ??= []).push({ id: target.id, time });
    };
    for (const target of targets) {
      if (target.id === 'fuse' && (reflections === 0 || this.progress.fuse)) continue;
      if (target.id === 'bell-prize' && (this.progress.bells !== this.order.length || this.progress.bellPrize)) continue;
      sample(target);
    }
    if (!encore && delta.z < 0 && this.progress.giant < GIANT_SLIDE_LIMIT) sample(this.giant);
    if (hits) for (const { id, time } of hits.sort((a, b) => a.time - b.time)) {
      this.hit(id, add(from, scale(delta, time)), impulse, reflections);
    }
  }

  private emit(mark: FestivalMark, point: Vec3, amount?: number): void {
    const signal = { mark, point, ...(amount === undefined ? {} : { amount }) };
    this.signals.push(signal);
    this.publish(signal);
  }

  private hit(id: FestivalTargetId, point: Vec3, impulse: number, reflections: number): void {
    const progress = this.progress;
    this.seen.add(id);
    switch (id) {
      case 'lantern-1': case 'lantern-2': case 'lantern-3':
        this.emit('lantern', point, ++this.lanterns);
        if (this.lanterns === FESTIVAL_LANTERNS.length) this.emit('relay', point);
        break;
      case 'red': case 'white':
        this.emit(id, point);
        if (this.seen.has('red') && this.seen.has('white')) this.emit('red-white', point);
        break;
      case 'bell-1': case 'bell-2': case 'bell-3': {
        if (progress.bells === this.order.length) break;
        const matches = this.order[progress.bells] === id;
        const bells = matches ? progress.bells + 1 : Number(id === this.order[0]);
        this.progress = { ...progress, bells };
        this.emit(matches ? 'bell' : 'bell-wrong', point, bells);
        if (bells === this.order.length) this.emit('bell-open', point);
        break;
      }
      case 'bell-prize':
        this.progress = { ...progress, bellPrize: true };
        this.emit('bell-prize', point);
        break;
      case 'eye-left': case 'eye-right': {
        const eyes = progress.eyes | (id === 'eye-left' ? 1 : 2);
        if (eyes === progress.eyes) break;
        this.progress = { ...progress, eyes };
        this.emit(id, point);
        if (eyes === 3) this.emit('daruma', point);
        break;
      }
      case 'giant': {
        const change = (impulse / GIANT_MASS) ** 2 / (2 * GIANT_FRICTION * GRAVITY);
        const giant = Math.min(GIANT_SLIDE_LIMIT, progress.giant + change);
        if (giant === progress.giant) break;
        this.progress = { ...progress, giant };
        this.giant = giantTarget(giant);
        this.emit('giant-slide', point, giant - progress.giant);
        if (giant === GIANT_SLIDE_LIMIT) this.emit('giant-drop', point);
        break;
      }
      case 'fuse':
        if (progress.fuse) break;
        this.progress = { ...progress, fuse: true };
        this.emit('fuse', point, reflections);
        break;
      case 'encore':
        this.emit('encore', point);
        break;
    }
  }
}
