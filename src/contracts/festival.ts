import type { Vec3 } from './geometry';
import type { PrizeInstanceId } from './ids';

export const FESTIVAL_POINTS = { relay: 120, bellPrize: 180, giant: 200, encore: 300 } as const;
export const GIANT_SLIDE_LIMIT = 0.42;
export const GIANT_MASS = 0.17;
export const GIANT_FRICTION = 0.048;

export type Encore = 'idle' | 'offered' | 'ready' | 'declined' | 'spent';
export interface FestivalProgress {
  readonly bells: number;
  readonly bellPrize: boolean;
  /** Bit 1 = viewer's left eye, bit 2 = right eye. */
  readonly eyes: number;
  /** Meters the giant prize has slid back along its rail. */
  readonly giant: number;
  readonly fuse: boolean;
  readonly encore: Encore;
}

export const INITIAL_FESTIVAL: FestivalProgress = Object.freeze({
  bells: 0, bellPrize: false, eyes: 0, giant: 0, fuse: false, encore: 'idle',
});

export type FestivalMark =
  | 'lantern' | 'relay' | 'red' | 'white' | 'red-white' | 'bell' | 'bell-wrong' | 'bell-open' | 'bell-prize'
  | 'eye-left' | 'eye-right' | 'daruma' | 'giant-slide' | 'giant-drop' | 'fuse' | 'encore';

export interface FestivalSignal {
  readonly mark: FestivalMark;
  readonly point: Vec3;
  /** Lantern/bell count, travel distance for the giant, or reflection count for the fuse. */
  readonly amount?: number;
}

export interface FestivalShot {
  readonly progress: FestivalProgress;
  readonly signals: readonly FestivalSignal[];
  readonly domino: readonly { readonly instanceId: PrizeInstanceId; readonly via: PrizeInstanceId; readonly point: Vec3 }[];
}

export type FestivalTargetId = 'lantern-1' | 'lantern-2' | 'lantern-3' | 'red' | 'white' |
  'bell-1' | 'bell-2' | 'bell-3' | 'bell-prize' | 'eye-left' | 'eye-right' | 'giant' | 'fuse' | 'encore';
export interface FestivalTarget {
  readonly id: FestivalTargetId;
  readonly center: Vec3;
  readonly radius: number;
}

const at = (id: FestivalTargetId, x: number, y: number, z: number, radius: number): FestivalTarget =>
  ({ id, center: { x, y, z }, radius });

// In front of the shelf, with separate lanes so the new targets don't block the original prizes.
export const FESTIVAL_LANTERNS = [
  at('lantern-1', 0, 1.53, -.49, .10), at('lantern-2', 0, 1.61, -.89, .10), at('lantern-3', 0, 1.68, -1.29, .10),
] as const;
export const FESTIVAL_PAIR = [at('red', -.42, 1.28, -1.46, .16), at('white', .42, 1.28, -1.46, .16)] as const;
export const FESTIVAL_BELLS = [
  at('bell-1', -.62, 1.84, -1.47, .116),
  at('bell-2', .48, 1.84, -1.44, .116),
  at('bell-3', 1.40, 1.86, -1.46, .116),
] as const;
export const FESTIVAL_BELL_PRIZE = at('bell-prize', .55, 1.54, -1.63, .15);
export const FESTIVAL_EYES = [at('eye-left', -2.16, 1.48, -1.32, .058), at('eye-right', -1.97, 1.48, -1.32, .058)] as const;
export const FESTIVAL_GIANT = at('giant', -2.54, 1.11, -1.38, .24);
// Above the shelves, just in front of the back wall; an incoming shot passes through it harmlessly.
export const FESTIVAL_FUSE = at('fuse', -1.37, 1.99, -2.35, .13);
export const FESTIVAL_ENCORE = at('encore', 0, 1.42, -1.58, .19);

/** One fixed permutation per run, shared by the simulator and the illustrated bells. */
export function festivalBellOrder(seed: number): readonly FestivalTargetId[] {
  const orders = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const mixed = Math.imul(seed ^ 0x2afa7cdf, 0x9e3779b1) >>> 0;
  return orders[mixed % orders.length]!.map(index => FESTIVAL_BELLS[index]!.id);
}

export function giantTarget(distance: number): FestivalTarget {
  return { ...FESTIVAL_GIANT, center: { ...FESTIVAL_GIANT.center, z: FESTIVAL_GIANT.center.z - distance } };
}
