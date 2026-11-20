import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { validateRunState } from '../../src/core/session';
import { createShotWorld } from '../../src/sim/world';
import { rewardConfigOf, rewardDevicesFor } from '../../src/core/rewards';
import type { ImpactEvent, ShotSummary } from '../../src/contracts';
import { R7, buildScenarios, type Scenario } from '../helpers/r007-scenarios';

// T02/T03/T19: the prepared starts for the browser checks, played here first through the same
// controller, physics and settlement. The browser test then aims by dragging and fires with the
// button from exactly these starts (tests/e2e/aim-first-scenes.spec.ts).

const FIXTURE = 'tests/fixtures/r007/scenarios.json.gz';
const { layout: L, catalog, tuning } = R7;

async function play(sc: Scenario) {
  const world = await createShotWorld(L, catalog, tuning, { transformPolicy: R7.behavior!.transformPolicy, rewardDevices: rewardDevicesFor(rewardConfigOf(R7.expansion)), reportPrizeContacts: true });
  const settled: ShotSummary[] = [];
  const impacts: ImpactEvent[] = [];
  const c = new GameController(
    { rules: CORE_RULES, world, renderer: null, catalog, tuning, layout: L, expansion: R7.expansion, transformPolicy: R7.behavior!.transformPolicy, clockPolicy: 'fixed',
      onShotSettled: (s) => settled.push(s), onSimEvents: (es) => impacts.push(...es.filter((e): e is ImpactEvent => e.type === 'impact')) },
    sc.state,
  );
  try {
    expect(c.dispatch({ type: 'AIM', ...sc.aim })).toBe(true);
    expect(c.dispatch({ type: 'OPEN_GAUGE' })).toBe(true);
    for (let i = 0; i < 36; i++) c.frame(1 / 60);
    expect(c.dispatch({ type: 'FIRE' })).toBe(true);
    for (let i = 0; i < 4000 && settled.length === 0; i++) {
      if (c.awaitingAnswer) {
        const f = c.current.inFlight!;
        c.dispatch({ type: 'ANSWER_SHOPKEEPER', shotId: f.shotId, questionId: f.plan!.question!.questionId, choice: 'A' });
      }
      c.frame(1 / 60);
    }
    return { summary: settled[0]!, state: c.current, impacts };
  } finally {
    world.dispose();
  }
}

const scenarios = buildScenarios();

describe('r007 prepared starts (sets and reflection takes)', () => {
  for (const sc of scenarios) {
    it(`${sc.name}: a valid saved start, and the real shot does what the browser check expects`, async () => {
      expect(validateRunState(sc.state, catalog, tuning, L, R7.expansion)).toBeNull();
      const { summary, state, impacts } = await play(sc);
      expect(summary, 'the shot settled').toBeDefined();
      if (sc.expect.sets) expect([...summary.newlyCompletedSets].sort()).toEqual([...sc.expect.sets].sort());
      if (sc.expect.continues) {
        expect(summary.runEnded).toBe(false);
        expect(state.phase).toBe('aiming');
        expect(summary.bonusAmmoGranted).toBeGreaterThan(0);
      }
      if (sc.expect.reflector) {
        const first = impacts[0]!;
        const hitReflector = sc.expect.reflector === 'fan' ? first.target.kind === 'shopkeeper' && first.target.part === 'fan' : first.target.kind === 'surface' && first.target.surfaceId === 'reflector-tray';
        expect(hitReflector, JSON.stringify(first.target)).toBe(true);
        expect(summary.collected.length, JSON.stringify([summary.ledger, impacts.slice(0, 4).map((i) => [i.target, i.point, i.speed])])).toBeGreaterThanOrEqual(1);
        expect(summary.ledger.items.some((i) => i.kind === 'trick')).toBe(true);
      }
    });
  }

  it('the fixture file the browser test reads is exactly these starts', () => {
    const data = scenarios.map((s) => ({ name: s.name, state: s.state, aim: s.aim, discovered: s.discovered, expect: s.expect }));
    if (process.env.WRITE_R007_FIXTURES === '1' || !existsSync(FIXTURE)) {
      mkdirSync('tests/fixtures/r007', { recursive: true });
      writeFileSync(FIXTURE, gzipSync(JSON.stringify(data)));
    }
    expect(JSON.parse(gunzipSync(readFileSync(FIXTURE)).toString())).toEqual(JSON.parse(JSON.stringify(data)));
  });
});
