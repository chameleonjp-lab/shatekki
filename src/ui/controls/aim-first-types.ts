/** Types the r007 panel reads (kept apart so the panel never imports the controller). */
import type { AimAngles, LoadTier, RunState, ViewState } from '../../contracts';

export type { AimAngles, LoadTier };

export interface ControllerSnapshotLike {
  readonly state: RunState;
  readonly view: ViewState;
  readonly maxBonusAmmo: number;
}
