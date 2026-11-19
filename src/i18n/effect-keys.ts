/**
 * Text keys an expansion renames (r007 gives FX012/013/035/036 their power-zone names).
 * Every screen asks for `exp.fx.<id>.name|result`; this maps those to the definition's own
 * key, so the game card, the result and the 3D labels all say what the effect really does.
 * Versions that rename nothing get an empty map (their texts are unchanged).
 */
import type { ExpansionCatalog } from '../contracts';

export function effectKeyOverrides(expansion: Pick<ExpansionCatalog, 'effects'> | null): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const d of expansion?.effects.values() ?? []) {
    if (d.nameKey !== `exp.fx.${d.effectId}.name`) out.set(`exp.fx.${d.effectId}.name`, d.nameKey);
    if (d.resultKey !== `exp.fx.${d.effectId}.result`) out.set(`exp.fx.${d.effectId}.result`, d.resultKey);
  }
  return out;
}
