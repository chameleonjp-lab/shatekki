import { FESTIVAL_BELLS, FESTIVAL_POINTS, GIANT_SLIDE_LIMIT, INITIAL_FESTIVAL, isExpandedRunState } from '../contracts';
import type { ExpansionCatalog, FestivalProgress, FestivalShot, GameCommand, LedgerItem, RunState, ShotRecord } from '../contracts';

export function festivalOf(state: RunState, expansion: ExpansionCatalog | null | undefined) {
  if (!expansion?.profile.festivalChallenges || !isExpandedRunState(state)) return undefined;
  return { progress: state.expansion.festival ?? INITIAL_FESTIVAL, seed: state.seed };
}

/** null means the normal rules still own the command. */
export function reduceFestivalCommand(state: RunState, command: GameCommand, expansion: ExpansionCatalog | null | undefined): RunState | null {
  const festival = festivalOf(state, expansion);
  if (command.type === 'FESTIVAL_ENCORE') {
    if (!festival || festival.progress.encore !== 'offered' || state.phase !== 'aiming' ||
        state.ammo <= 0 || state.pauseReasons.length || !isExpandedRunState(state)) return state;
    const encore = command.accept ? 'ready' : 'declined';
    // Open the spotlight from the center even if the order was won at the far end of the stall.
    return { ...state, ...(command.accept ? { standX: 0, aim: { yaw: 0, pitch: 0 } } : {}),
      expansion: { ...state.expansion, festival: { ...festival.progress, encore } } };
  }
  if (festival?.progress.encore === 'offered' && (command.type === 'OPEN_GAUGE' || command.type === 'FIRE')) return state;
  return null;
}

export function festivalLedger(progress: FestivalProgress, observed: FestivalShot | undefined, shot: ShotRecord['shotId']): LedgerItem[] {
  const marks = new Set(observed?.signals.map(signal => signal.mark));
  const items: LedgerItem[] = [];
  const award = (name: string, points: number) => items.push({ kind: 'trick', refId: `festival:${name}:${shot}`, points });
  if (progress.encore === 'ready') {
    if (marks.has('encore')) award('encore', FESTIVAL_POINTS.encore);
    return items;
  }
  if (marks.has('relay')) award('relay', FESTIVAL_POINTS.relay);
  if (marks.has('bell-prize') && !progress.bellPrize) award('bell-prize', FESTIVAL_POINTS.bellPrize);
  if (marks.has('giant-drop') && progress.giant < GIANT_SLIDE_LIMIT) award('giant', FESTIVAL_POINTS.giant);
  return items;
}

/** Read older r008 checkpoints without the new field. All new values are bounded. */
export function validFestivalProgress(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Partial<FestivalProgress>;
  return typeof p.bells === 'number' && Number.isInteger(p.bells) && p.bells >= 0 && p.bells <= FESTIVAL_BELLS.length &&
    typeof p.bellPrize === 'boolean' && (!p.bellPrize || p.bells === FESTIVAL_BELLS.length) &&
    typeof p.eyes === 'number' && Number.isInteger(p.eyes) && p.eyes >= 0 && p.eyes <= 3 &&
    typeof p.giant === 'number' && Number.isFinite(p.giant) && p.giant >= 0 && p.giant <= GIANT_SLIDE_LIMIT &&
    typeof p.fuse === 'boolean' && ['idle', 'offered', 'ready', 'declined', 'spent'].includes(p.encore ?? '');
}
