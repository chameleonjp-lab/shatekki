/**
 * Minimal control view-model (Task 07, temporary owner: Opus; UI/QA takes it
 * over in Task 14). Pure: decides what the bottom panel shows for a state.
 */
import type { LoadTier, Phase, RunState, ShotSummary, ViewState } from '../../contracts';

export type PanelMode = 'position' | 'loading' | 'aiming' | 'resolving' | 'paused' | 'ended' | 'abandoned';

export interface ControlsModel {
  readonly mode: PanelMode;
  readonly hintKey: string;
  readonly ammo: number;
  readonly bonusAmmoTotal: number;
  readonly maxBonusAmmo: number;
  readonly shotsFired: number;
  readonly score: number;
  readonly loadingBar: number | null;
  readonly loadTier: LoadTier | null;
  readonly canFire: boolean;
  readonly lastShotPoints: number | null;
  readonly lastChain: number | null;
}

export const HINT_KEYS: Readonly<Record<PanelMode, string>> = {
  position: 'hint.position',
  loading: 'hint.loading',
  aiming: 'hint.aiming',
  resolving: 'hint.resolving',
  paused: 'hint.paused',
  ended: 'hint.ended',
  abandoned: 'hint.abandoned',
};

function modeOf(phase: Phase, paused: boolean): PanelMode {
  if (paused && phase !== 'ended' && phase !== 'abandoned') return 'paused';
  return phase;
}

export function controlsModel(state: RunState, view: ViewState, maxBonusAmmo: number, last: ShotSummary | null): ControlsModel {
  const mode = modeOf(state.phase, view.paused);
  const lastShotPoints = last ? last.ledger.scoreAfter - last.ledger.scoreBefore : null;
  return {
    mode,
    hintKey: HINT_KEYS[mode],
    ammo: state.ammo,
    bonusAmmoTotal: state.bonusAmmoTotal,
    maxBonusAmmo,
    shotsFired: state.shotsFired,
    score: state.score,
    loadingBar: view.loadingBar,
    loadTier: state.load?.tier ?? null,
    canFire: mode === 'aiming' && state.ammo > 0 && state.load !== null,
    lastShotPoints,
    lastChain: last ? last.chainCount : null,
  };
}
