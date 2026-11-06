import { afterEach, describe, expect, it, vi } from 'vitest';
import { OFFICIAL_BUNDLE, loadBuildBundle } from '../../src/app/bundle';
import { RELEASE_CATALOG, RELEASE_TUNING } from '../../src/catalog/release-config';
import { BOOTH_LAYOUT, BOOTH_LAYOUT_V2, catalogValueStatus } from '../../src/contracts';

// The build-time switch (EG08). The public build never selects the expanded prototype.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('build bundle selection', () => {
  it('runs official-v1 (rules-v1, same objects) when the switch is unset or anything else', async () => {
    for (const v of ['', 'official-v1', 'expanded', 'EXPANDED-PROPOSED', ' expanded-proposed']) {
      vi.stubEnv('VITE_SHATEKKI_BUNDLE', v);
      const b = await loadBuildBundle();
      expect(b, v).toBe(OFFICIAL_BUNDLE);
    }
    expect(OFFICIAL_BUNDLE.catalog).toBe(RELEASE_CATALOG);
    expect(OFFICIAL_BUNDLE.tuning).toBe(RELEASE_TUNING);
    expect(OFFICIAL_BUNDLE.layout).toBe(BOOTH_LAYOUT);
    expect(OFFICIAL_BUNDLE.expansion).toBeNull();
    expect(OFFICIAL_BUNDLE.catalog.rulesVersion).toBe('rules-v1');
  });

  it('runs the expanded prototype only for the exact internal value, as prototype values', async () => {
    vi.stubEnv('VITE_SHATEKKI_BUNDLE', 'expanded-proposed');
    const b = await loadBuildBundle();
    expect(b.key).toBe('expanded-proposed');
    expect(b.layout).toBe(BOOTH_LAYOUT_V2);
    expect(b.expansion).not.toBeNull();
    expect(b.catalog.rulesVersion).not.toBe('rules-v1');
    expect(catalogValueStatus(b.catalog)).toBe('prototype');
    expect(b.tuning.valueStatus).toBe('prototype');
  });
});
