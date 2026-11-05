/** Final result of a finished or abandoned run (Task 09). Pure projection of RunState. */
import type { FinalResult, RunState } from '../contracts';

export function finalResult(state: RunState): FinalResult {
  if (state.phase !== 'ended' && state.phase !== 'abandoned') {
    throw new RangeError(`finalResult: the run is still in progress (phase ${state.phase})`);
  }
  return {
    runId: state.runId,
    rulesVersion: state.rulesVersion,
    valueStatus: state.valueStatus,
    status: state.phase === 'ended' ? 'completed' : 'abandoned',
    score: state.score,
    shotsFired: state.shotsFired,
    collected: state.collected,
    completedSets: state.completedSets,
    maxChain: state.maxChain,
    ledger: state.ledger,
    playerName: state.playerName,
  };
}
