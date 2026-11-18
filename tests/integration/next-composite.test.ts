import { PerspectiveCamera } from 'three';
import { applyCameraPose, applyFrame, cameraPose, createExpandedView, createSceneGraph, projectToScreen } from '../../src/view';
import { expect, it } from 'vitest';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { BASE_SHOT_MODIFIERS, isAmmoBalanced, isLedgerEntryConsistent, type EffectId, type ImpactEvent, type QuestionId, type ShotStage, type ShotSummary } from '../../src/contracts';
import { rewardDevicesFor } from '../../src/core/rewards';
import { createShotWorld } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';
import { buildState, EDGE_KINDS } from '../helpers/composite-shot';

const bundle = getGameplayBundle('expanded-next');
const { catalog, tuning, layout, expansion, behavior } = bundle;
const stand = layout.camera.standMaxX;
const wall = (column: number) => layout.backgroundCells!.find(c => c.cellId === 'cell-r2-c' + column)!.box.center;
const body = layout.shopkeeper.find(p => p.part === 'body')!.box;
const left = aimAt(bundle, stand, wall(11), 'standard');
const right = aimAt(bundle, stand, {...body.center, y:1.0, z:body.center.z + body.halfExtents.z}, 'standard');
const yaw = (left.yaw + right.yaw) / 2;
const pitch = aimAt(bundle, stand, {...wall(12), x:wall(12).x + 0.1}, 'standard').pitch;
const aim = {standX:stand, yaw, pitch, count:3 as const, spreadRad:(right.yaw - left.yaw) / 2};

async function composite(skip: boolean, capped = false, viewX = stand) {
  // Pre-shot setup only. The two hits, question, series changes, falls and
  // score are computed by the candidate's rules and its actual Rapier world.
  const start = buildState(bundle, {
    // The original centre-fixed scenario leaves its prizes 5 mm inside the
    // shelf. The supported-bottom candidate needs the centres on its lip.
    seed: 1, aim, edgeInset: 0, bonus: capped ? tuning.maxBonusAmmoTotal : 0,
    question: 'Q001' as QuestionId, edgeKinds: EDGE_KINDS,
    cells:{'cell-r2-c12':'FX001' as EffectId,'cell-r2-c11':'FX007' as EffectId},
  });
  const world = await createShotWorld(layout, catalog, tuning, {
    rewardDevices:rewardDevicesFor(expansion!.profile.rewards ?? null), transformPolicy:behavior!.transformPolicy,
  });
  const camera = new PerspectiveCamera();
  const width = 402, height = 700;
  applyCameraPose(camera, cameraPose(layout, viewX, width / height), width / height);
  const graph = createSceneGraph({ layout, resolvePrize: id => catalog.prizes.get(id)! });
  const display = createExpandedView({graph, layout, catalog, expansion:expansion!, illustratedRewards:true,
    translate:key => key, prizeName:id => id});
  const impacts: ImpactEvent[] = [];
  const confirmed: ShotSummary[] = [];
  const stages: ShotStage[] = [];
  const c = new GameController({ ...bundle, rules:CORE_RULES, world,
    renderer: {
      render(frame, view) {
        applyFrame(graph, frame);
        display.update(frame, view, camera, { width, height });
      },
      present: async () => {}, resize: () => {}, dispose: () => graph.dispose(),
    },
    clockPolicy: behavior!.clock, transformPolicy: behavior!.transformPolicy,
    onShotSettled: summary => confirmed.push(summary),
    onSimEvents: events => {
      for (const event of events) {
        if (event.type === 'shotStage') stages.push(event.stage);
        if (event.type === 'impact') impacts.push(event);
      }
    },
  }, start);
  try {
    c.dispatch({type:'SET_POSITION',x:stand});
    expect(c.dispatch({type:'CONFIRM_POSITION'})).toBe(true);
    c.frame(0.1);
    expect(c.dispatch({type:'STOP_LOAD'})).toBe(true);
    c.dispatch({type:'AIM',yaw,pitch});
    expect(c.dispatch({type:'FIRE'})).toBe(true);
    expect(c.current.expansion!.active).toEqual(start.expansion.next);
    expect(c.current.expansion!.next.modifiers).toEqual(BASE_SHOT_MODIFIERS);
    for(let i=0;i<3000 && !c.awaitingAnswer;i++) c.frame(1/60);
    const flight=c.current.inFlight!;
    expect(flight.stage).toBe('question');
    expect(flight.barrier?.collectedDuringFlight).toEqual([]);
    const hits = flight.plan!.processed.flatMap(e => e.source.kind === 'cell' ? [e.source.cellId] : []);
    expect(hits).toEqual(expect.arrayContaining(['cell-r2-c11', 'cell-r2-c12']));
    expect(c.current.ledger).toHaveLength(0);
    expect(c.current.ammo).toBe(0);
    expect(c.current.score).toBe(0);
    expect(confirmed).toEqual([]);
    const question=flight.plan!.question!;
    expect(question.questionId).toBe('Q001');
    const tick=c.gameTick;
    const frame=world.frame().prizes;
    if(skip) c.dispatch({type:'SKIP_PRESENTATION'});
    for(let i=0;i<10;i++) c.frame(30);
    expect(c.gameTick).toBe(tick);
    expect(world.frame().prizes).toEqual(frame);
    const answer={type:'ANSWER_SHOPKEEPER',shotId:flight.shotId,questionId:question.questionId,choice:'B'};
    expect(c.dispatch(answer)).toBe(true);
    expect(c.dispatch(answer)).toBe(false);
    for(let i=0;i<4000 && c.current.phase==='resolving';i++) c.frame(1/60);
    expect(confirmed).toHaveLength(1);
    expect(c.current.ledger).toHaveLength(1);
    const ledger = confirmed[0]!.ledger;
    expect(isLedgerEntryConsistent(ledger)).toBe(true);
    expect(ledger.scoreAfter).toBe(c.current.score);
    expect(c.current.expansion!.active).toBeNull();
    expect(isAmmoBalanced(c.current,10)).toBe(true);
    expect(stages.filter(stage => stage === 'grace').length).toBeLessThanOrEqual(1);
    const edgeHit = impacts.find(event => event.target.kind === 'cell' && event.target.cellId === 'cell-r2-c12')!;
    const onscreen = projectToScreen(camera, edgeHit.point, width, height) !== null;
    expect(onscreen).toBe(viewX === stand);
    return {summary: confirmed[0]!, state: c.current, gameTick: c.gameTick, impacts};
  } finally { display.dispose(); graph.dispose(); world.dispose(); }
}

it('r006 confirms two- and three-prize sets after the last cork, several cells, a question, retyping and falls', async () => {
  const run = await composite(false);
  const {summary, state} = run;
  expect(await composite(true)).toEqual(run);
  const changed = new Set(summary.appliedTransforms?.map(p => p.instanceId));
  expect(state.expansion!.assortmentSeries).not.toBeNull();
  expect(summary.collected.length).toBeGreaterThan(2);
  expect(summary.collected.every(p => changed.has(p.instanceId))).toBe(true);
  expect(new Set(summary.collected.map(p => p.instanceId)).size).toBe(summary.collected.length);
  const sets = summary.newlyCompletedSets;
  expect(sets.some(id => id.startsWith('PAIR'))).toBe(true);
  expect(sets.some(id => id.startsWith('S'))).toBe(true);
  for (const id of sets) {
    const items = summary.ledger.items.filter(i => i.kind === 'set' && i.refId === id);
    expect(items).toHaveLength(1);
    expect(items[0]!.points).toBe(catalog.sets.get(id)!.bonusScore);
  }
  const effects = summary.effects!;
  const cells = effects.flatMap(e => e.source.kind === 'cell' ? [e.source.cellId] : []);
  expect(new Set(cells).size).toBe(cells.length);
  expect(effects.at(-1)!.source.kind).toBe('answer');
  expect(effects.filter(e => e.source.kind === 'answer')).toHaveLength(1);
  expect(state.expansion!.questionCursor).toBe(1);
  const ammoCell = effects.find(e => e.effectId === 'FX001');
  expect(ammoCell).toMatchObject({ source: { kind: 'cell' }, ammoDelta: 1 });
  expect(effects.at(-1)!.ammoDelta).toBe(0);
  expect(state.expansion!.next.modifiers).toEqual({ ...BASE_SHOT_MODIFIERS, pushMult: 1.5 });
  expect(state.shotsFired).toBe(10);
  expect(summary.ammoAfter).toBeGreaterThan(0);
  expect(state.phase).toBe('position');
});

it('AC14/CH-AC04: changing only the view leaves off-screen impacts, collections, effects and settlement identical', async () => {
  const visible = await composite(false);
  const offscreen = await composite(false, false, layout.camera.standMinX);
  expect(offscreen).toEqual(visible);
  console.info('r006 camera replay', { impacts: visible.impacts.length, won: visible.summary.collected.length,
    effects: visible.summary.effects!.length, score: visible.state.score });
});

it('r006 ends once after the same final shot when all ten bonus corks have already been granted', async () => {
  const {summary,state} = await composite(false,true);
  expect(state.shotsFired).toBe(20);
  expect(summary.effects).toContainEqual(expect.objectContaining({
    effectId: 'FX001', outcome: 'notApplicable', reason: 'noAmmoRoom', ammoDelta: 0,
  }));
  expect(summary.effects?.at(-1)?.source.kind).toBe('answer');
  expect(summary.collected.length).toBeGreaterThan(0);
  expect(state.expansion!.next.modifiers).toEqual(BASE_SHOT_MODIFIERS);
  expect(state.phase).toBe('ended');
  expect(state.ammo).toBe(0);
  expect(summary.runEnded).toBe(true);
  expect(state.bonusAmmoTotal).toBe(10);
});
