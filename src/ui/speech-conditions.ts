/**
 * Which spoken-line conditions hold now (design doc 条件 column). Read-only facts of the
 * confirmed state and the view; nothing here is written back.
 */
import type { RewardConfig, RunState, ShotSummary, ViewState } from '../contracts';
import { isExpandedRunState } from '../contracts';
import type { SpeechCondition } from '../i18n/stall-speech';

export interface SpeechFacts {
  readonly state: RunState;
  readonly view: ViewState;
  readonly last: ShotSummary | null;
  readonly maxBonusAmmo: number;
  readonly rewards: RewardConfig | null;
  readonly mode: 'normal' | 'daily';
  /** The run is saved (not the memory-only fallback). */
  readonly recorded: boolean;
  readonly shopkeeperVisible: boolean;
}

export function speechConditions(f: SpeechFacts): Set<SpeechCondition> {
  const s = f.state;
  const out = new Set<SpeechCondition>();
  const room = f.maxBonusAmmo - s.bonusAmmoTotal;
  if (s.shotsFired === 0) out.add('noShotYet');
  if (s.ledger.length > 0 && s.collected.length === 0) out.add('noPrizeAfterShots');
  if (f.last && f.last.chainCount === 0 && f.last.prizeOutcomes.some((p) => p.hits.length > 0)) out.add('lastHitNoPrize');
  if (f.last?.facts && f.last.facts.representative === null) out.add('lastNoContact');
  out.add(room > 0 ? 'bonusRoom' : 'bonusFull');
  if (s.ammo === 1) out.add('lastCork');
  if (s.collected.length > 0) out.add('wonAny');
  if (s.completedSets.length > 0) out.add('setThisRun');
  if (s.bonusAmmoTotal > 0) out.add('refilledThisRun');
  if (f.mode === 'daily') out.add('daily');
  else if (f.recorded) out.add('normalRecorded');
  if (f.shopkeeperVisible) out.add('shopkeeperVisible');
  const r = isExpandedRunState(s) ? s.expansion.rewards : undefined;
  const cfg = f.rewards;
  if (r && cfg) {
    const on = (id: string) => cfg.enabled.includes(id as never);
    if (on('A1') && r.bag && !r.bag.used && s.shelf.prizes.some((p) => p.instanceId === r.bag!.instanceId)) out.add('bagOnShelf');
    if (on('A2') && !r.chimeUsed) out.add('chimeUnused');
    if (on('A4') && !r.piggyDone) {
      out.add('piggyUnused');
      if (r.piggyDeposits.length > 0) out.add('piggyOneLeft');
    }
    if (on('A3') && !r.seesawUsed) out.add('seesawUnused');
    const target = f.view.expansion?.rewards?.target;
    if (target) {
      if (room >= 3) out.add('targetRoom3');
      if (room >= 1) out.add('targetRoom1');
    }
    if (r.order?.status === 'accepted') out.add('orderActive');
    if (r.order?.status === 'done') out.add('orderDone');
  }
  return out;
}
