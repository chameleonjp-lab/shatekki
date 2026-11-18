import { getGameplayBundle } from '../../../src/catalog/gameplay-config';
import { mintId, type RunState, type GameCommand } from '../../../src/contracts';
import { reduceGame } from '../../../src/core/transitions';
import { createExpandedRun } from '../../../src/core/expanded-run';
export { createIndexedRunRepository } from '../../../src/persistence/indexed-run-repository';

export const bundle = getGameplayBundle('expanded-save-trial');
export function fresh(id: string) {
  return createExpandedRun(
    { runId: mintId.run(id), seed: 521, tuning: bundle.tuning, playerName: null },
    { ...bundle, expansion: bundle.expansion! },
  );
}
export function reduce(state: RunState, command: GameCommand) {
  return reduceGame(state, command, bundle);
}
