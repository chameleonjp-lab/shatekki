import { afterEach, expect, it, vi } from 'vitest';
import { loadBuildBundle } from '../../src/app/bundle';
import { resolveBundleKey } from '../../src/catalog/gameplay-config';

afterEach(() => vi.unstubAllEnvs());

it.each([
  ['official-v1', 'rules-v1', 9, 0],
  ['expanded-proposed', 'rules-v2-proposed-r001', 36, 0],
  ['expanded-trial', 'rules-v2-proposed-r002', 36, 2],
  ['expanded-full', 'rules-v2-proposed-r003', 36, 10],
  ['expanded-save-trial', 'rules-v2-proposed-r004', 36, 10],
  ['expanded-placement-trial', 'rules-v2-proposed-r005', 36, 10],
  ['expanded-next', 'rules-v2-proposed-r006', 36, 10],
] as const)('loads the fixed catalog for %s at the build entry', async (key, version, slots, rewards) => {
  vi.stubEnv('VITE_SHATEKKI_BUNDLE', key);
  expect(resolveBundleKey(key)).toBe(key);
  const bundle = await loadBuildBundle();
  expect(bundle.catalog.rulesVersion).toBe(version);
  expect(bundle.tuning.shelfSlotCount).toBe(slots);
  expect(bundle.catalog.prizes.size).toBe(100);
  const sets = [...bundle.catalog.sets.values()];
  expect(sets.filter(set => set.requiredTypeIds.length === 3)).toHaveLength(100);
  expect(sets.filter(set => set.requiredTypeIds.length === 2)).toHaveLength(slots === 36 ? 300 : 0);
  const expansion = bundle.expansion;
  if (slots === 36) {
    expect(expansion?.questions.size).toBe(200);
    expect([...expansion!.questions.values()].every(question => Object.keys(question.choices).length === 2)).toBe(true);
    expect(expansion?.series.size).toBe(20);
    expect(expansion?.effects.size).toBe(100);
    expect(expansion?.profile.cellCount).toBe(36);
  }
  expect(expansion?.profile.rewards?.enabled.length ?? 0).toBe(rewards);
});
