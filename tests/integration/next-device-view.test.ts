import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import { GameController } from '../../src/app/controller';
import { CORE_RULES } from '../../src/app/rules';
import {
  BASE_SHOT_MODIFIERS, REWARD_TARGET_HALF_THICKNESS, aimDirection, ballisticFor, mintId, muzzlePosition, asPrizeTypeId, IDENTITY_QUAT,
  type Box3, type RewardViewState, type SimulationFrame, type ExpansionViewState, type PrizeFrame,
} from '../../src/contracts';
import { createExpandedRun } from '../../src/core/expanded-run';
import { rewardDevicesFor, TARGET_AIM, targetGeometryAt } from '../../src/core/rewards';
import { clampAim } from '../../src/core/aim';
import { LOCALES, translate, type Locale, type UiKey } from '../../src/i18n';
import { createExpandedView, projectToScreen } from '../../src/view/expanded-view';
import { createSceneGraph, updateAim } from '../../src/view/scene';
import { BAG_OFFSET, createRewardProps } from '../../src/view/reward-props';
import { createShotWorld, REWARD_CHIME_SURFACE_ID, REWARD_PIGGY_SURFACE_ID, REWARD_TARGET_SURFACE_ID } from '../../src/sim/world';
import { aimAt } from '../helpers/aim-at';
import { makeRequest } from '../unit/helpers';
import { expandedCtx, runExpanded } from './expanded-helpers';

const bundle = getGameplayBundle('expanded-next');
const config = bundle.expansion!.profile.rewards!;
const devices = rewardDevicesFor(config);
const baseExpansion: ExpansionViewState = {
  cells: [], outlineSeries: null, assortmentSeries: null, collectedTypeIds: [], completedSets: [],
  hint: null, aimPreview: null, question: null,
};
const view = (changes: Partial<RewardViewState> = {}): RewardViewState => ({
  devices, enabled: config.enabled, bagInstanceId: null, bagOffer: 2,
  target: null, order: null, orderShotsLeft: null, lanternsLit: [], lanternZones: 3,
  prizesWon: 0, nextStamp: 2, piggyDeposits: 0, piggyDone: false, chimeUsed: false, seesawUsed: false,
  nextReserved: false, ...changes,
});
const standX = bundle.layout.camera.standMinX;
const target = targetGeometryAt(bundle.layout, bundle.tuning, standX);
const fixedTarget = { geometry: target, mode: 'fixed' as const, offered: { center: 3, outer: 1 } };
const ballistic = ballisticFor(bundle.tuning, 'standard');
const graphForTest = () => createSceneGraph({
  layout: bundle.layout, illustratedRewards: true, resolvePrize: id => bundle.catalog.prizes.get(id)!,
});
const original: PrizeFrame = {
  instanceId: mintId.instance(1), typeId: asPrizeTypeId('P004'), position: { x: 0, y: 1.2, z: -1.9 },
  rotation: IDENTITY_QUAT, hp: 2, maxHp: 3, mounted: true, collected: false,
};

function drawnBounds(root: THREE.Object3D) {
  const bounds = new THREE.Box3().makeEmpty();
  const point = new THREE.Vector3();
  root.traverseVisible(obj => {
    if (!(obj instanceof THREE.Mesh)) return;
    const positions = obj.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      bounds.expandByPoint(point.fromBufferAttribute(positions, i).applyMatrix4(obj.matrixWorld));
    }
  });
  return bounds;
}

describe('r006 reward devices and price tags', () => {
  it('places the reticle on the front of each solid including the fixed last-cork target', () => {
    const graph = graphForTest();
    const expansion = { ...baseExpansion, rewards: view({ target: fixedTarget }) };
    try {
      for (const box of [devices.chime!, devices.piggySlot!]) {
        const effectiveAim = aimAt(bundle, standX, box.center, 'standard');
        const hit = updateAim(graph, { phase: 'aiming', standX, effectiveAim, ballistic, expansion });
        expect(hit.point.z).toBeCloseTo(box.center.z + box.halfExtents.z + bundle.tuning.cork.radius, 2);
      }
      const shot = { phase: 'aiming' as const, standX, effectiveAim: TARGET_AIM, ballistic, expansion };
      const hit = updateAim(graph, shot);
      expect(hit.point.z).toBeCloseTo(target.center.z + REWARD_TARGET_HALF_THICKNESS + bundle.tuning.cork.radius, 3);
      const after = updateAim(graph, { ...shot, expansion: { ...baseExpansion, rewards: view() } });
      expect(after.distance).toBeGreaterThan(hit.distance);
    } finally {
      graph.dispose();
    }
  });

  it('keeps the collecting mouth, resonating bell, tray and target aligned before and after a grant', () => {
    const props = createRewardProps(true);
    try {
      for (const used of [false, true]) {
        props.update(view({
          chimeUsed: used, seesawUsed: used, piggyDone: used, piggyDeposits: used ? 2 : 1, target: fixedTarget,
        }), []);
        props.group.updateMatrixWorld(true);
        const shapes = [
          ['chime-bell', devices.chime!], ['deposit-opening', devices.piggySlot!], ['reward-seesaw', devices.seesawTray!],
          ['reward-target', { center: target.center, halfExtents: { x: target.outerRadius, y: target.outerRadius, z: REWARD_TARGET_HALF_THICKNESS } }],
        ] as const;
        for (const [name, box] of shapes) {
          const drawn = drawnBounds(props.group.getObjectByName(name)!);
          expect(drawn.isEmpty()).toBe(false);
          for (const axis of ['x', 'y', 'z'] as const) {
            const lo = box.center[axis] - box.halfExtents[axis], hi = box.center[axis] + box.halfExtents[axis];
            if (name === 'deposit-opening' || name === 'chime-bell') {
              expect(drawn.min[axis], name + ' ' + axis).toBeCloseTo(lo, 5);
              expect(drawn.max[axis], name + ' ' + axis).toBeCloseTo(hi, 5);
            } else {
              expect(drawn.min[axis], name + ' ' + axis).toBeGreaterThanOrEqual(lo - 0.00001);
              expect(drawn.max[axis], name + ' ' + axis).toBeLessThanOrEqual(hi + 0.00001);
            }
          }
        }
      }
    } finally {
      props.dispose();
    }
  });

  it.each([
    [0.75, -1.25, false, 1], [0.75, -1.05, true, 1], [0.95, -1.25, true, 1], [0.75, -1.25, true, 1.2],
  ] as const)('matches the ordinary reticle to a real shot grazing the lip at (%s, %s), deposit %s, cork size %s', async (x, y, deposits, radiusMult) => {
    const graph = graphForTest();
    const world = await createShotWorld(bundle.layout, bundle.catalog, bundle.tuning, { rewardDevices: devices });
    const initial = createExpandedRun(
      { runId: mintId.run('aim-at-lip'), seed: 7919, tuning: bundle.tuning, playerName: null },
      { ...bundle, expansion: bundle.expansion! },
    );
    const query = vi.spyOn(world, 'previewFirstContact');
    const controller = new GameController({ ...bundle, clockPolicy: 'fixed', rules: CORE_RULES, preciseRewardAim: true, world, renderer: null }, {
      ...initial, expansion: { ...initial.expansion, next: { ...initial.expansion.next, modifiers: { ...BASE_SHOT_MODIFIERS, radiusMult } } },
    });
    const slot = devices.piggySlot!;
    try {
      expect(controller.dispatch({ type: 'SET_POSITION', x: standX })).toBe(true);
      controller.dispatch({ type: 'CONFIRM_POSITION' });
      controller.frame(0.1);
      controller.dispatch({ type: 'STOP_LOAD' });
      const initialView = controller.viewState();
      expect(initialView.rewardAim).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
      const point = { x: slot.center.x + x * slot.halfExtents.x, y: slot.center.y + y * slot.halfExtents.y, z: slot.center.z + slot.halfExtents.z };
      const aimed = aimAt(bundle, standX, point, 'standard');
      controller.dispatch({ type: 'AIM', yaw: aimed.yaw - initialView.effectiveAim.yaw, pitch: aimed.pitch - initialView.effectiveAim.pitch });
      const before = controller.viewState();
      const predicted = before.rewardAim;
      expect(predicted).toBeDefined();
      expect(before.expansion?.aimPreview).toBeNull();
      expect(predicted!.firstHitTargetId === REWARD_PIGGY_SURFACE_ID).toBe(deposits);
      expect(controller.viewState().rewardAim).toBe(predicted);
      expect(query).toHaveBeenCalledTimes(1);
      const reticle = updateAim(graph, before);
      expect(reticle.point.toArray()).toEqual(new THREE.Vector3().copy(predicted!.points.at(-1)!).toArray());
      expect(controller.dispatch({ type: 'FIRE' })).toBe(true);
      for (let i = 0; i < 300 && controller.current.phase === 'resolving'; i++) controller.frame(1 / 30);
      expect(controller.current.phase).toBe('position');
      expect(controller.current.expansion!.rewards!.piggyDeposits).toEqual(deposits ? [1] : []);
    } finally {
      query.mockRestore();
      graph.dispose();
      world.dispose();
    }
  });

  it('looks at the last-cork disc before firing without adding it to the world, and matches the actual center, outer ring and miss', async () => {
    const world = await createShotWorld(bundle.layout, bundle.catalog, bundle.tuning, { rewardDevices: devices });
    try {
      world.syncShelf({ prizes: [], nextInstanceNumber: 1, deferredSlots: [] }, 0);
      for (const [yaw, ring] of [[0, 'center'], [0.07, 'outer'], [0.15, null]] as const) {
        const request = makeRequest({
          origin: muzzlePosition(bundle.layout, standX), direction: aimDirection(bundle.layout, standX, { ...TARGET_AIM, yaw: TARGET_AIM.yaw + yaw }),
        });
        const preview = world.previewFirstContact(request, BASE_SHOT_MODIFIERS, target);
        expect(preview.firstHitTargetId === REWARD_TARGET_SURFACE_ID).toBe(ring !== null);
        expect(world.previewFirstContact(request, BASE_SHOT_MODIFIERS).firstHitTargetId).not.toBe(REWARD_TARGET_SURFACE_ID);
        const shot = runExpanded(world, request, expandedCtx({ rewards: true, rewardTarget: target }));
        expect(shot.record.rewardContacts?.targetHit).toBe(ring);
      }
    } finally { world.dispose(); }
  });

  it('shoots the visible mouth at the center and both edges, and misses on the solid pink bank and the hanging paper', async () => {
    const props = createRewardProps(true);
    const world = await createShotWorld(bundle.layout, bundle.catalog, bundle.tuning, { rewardDevices: devices });
    world.syncShelf({ prizes: [], nextInstanceNumber: 1, deferredSlots: [] }, 0);
    props.update(view(), []);
    props.group.updateMatrixWorld(true);
    const eye = new THREE.Vector3(standX, bundle.layout.camera.eye.y, bundle.layout.camera.eye.z);
    const muzzle = muzzlePosition(bundle.layout, standX);
    const drawn = (root: THREE.Object3D, point: THREE.Vector3) => {
      const meshes: THREE.Object3D[] = [];
      root.traverseVisible(o => { if (o instanceof THREE.Mesh) meshes.push(o); });
      return new THREE.Raycaster(eye, point.clone().sub(eye).normalize()).intersectObjects(meshes, false)[0]?.object;
    };
    const face = (b: Box3, x: number, y: number) => new THREE.Vector3(
      b.center.x + x * b.halfExtents.x, b.center.y + y * b.halfExtents.y, b.center.z + b.halfExtents.z,
    );
    let shots = 0;
    const fire = (point: THREE.Vector3) => {
      const aim = clampAim(aimAt(bundle, standX, point, 'standard'), bundle.layout);
      const direction = aimDirection(bundle.layout, standX, aim);
      return runExpanded(world, makeRequest({ origin: muzzle, direction }, ++shots), expandedCtx({ rewards: true }));
    };
    try {
      const bank = props.group.getObjectByName('reward-piggy')!;
      for (const [x, y] of [[0, -0.8], [-0.82, 0.3], [0.82, 0.7], [0, 0.18]] as const) {
        const point = face(devices.piggySlot!, x, y);
        expect(drawn(bank, point)?.name).toBe('deposit-opening');
        const shot = fire(point);
        expect(shot.record.rewardContacts?.piggyDeposit).toBe(true);
        const impact = shot.impacts.find(e => e.target.kind === 'surface' && e.target.surfaceId === REWARD_PIGGY_SURFACE_ID);
        expect(impact).toBeDefined();
        expect(drawn(bank, new THREE.Vector3().copy(impact!.point))?.name).toBe('deposit-opening');
      }
      const body = bank.getObjectByName('piggy-body')!;
      const slot = devices.piggySlot!;
      expect(drawnBounds(body).max.y + bundle.tuning.cork.radius).toBeLessThan(slot.center.y - slot.halfExtents.y);
      const bodyPoint = body.getWorldPosition(new THREE.Vector3());
      expect(body.getObjectById(drawn(bank, bodyPoint)!.id)).toBeDefined();
      for (let i = 0; i < 2; i++) expect(fire(bodyPoint).record.rewardContacts?.piggyDeposit).toBe(false);

      const chime = props.group.getObjectByName('reward-chime')!;
      const bell = face(devices.chime!, 0.65, -0.65);
      expect(drawn(chime, bell)?.name).toBe('chime-bell');
      const paper = chime.getObjectByName('chime-paper')!.getWorldPosition(new THREE.Vector3());
      expect(drawn(chime, paper)?.name).toBe('chime-paper');
      const touchesBell = (point: THREE.Vector3) => fire(point).impacts.some(
        e => e.target.kind === 'surface' && e.target.surfaceId === REWARD_CHIME_SURFACE_ID,
      );
      expect(touchesBell(bell)).toBe(true);
      expect(touchesBell(paper)).toBe(false);
    } finally {
      props.dispose();
      world.dispose();
    }
  });

  it('turns the bag with the original prize and removes it when that individual leaves', () => {
    const props = createRewardProps(true);
    const rewards = view({ bagInstanceId: original.instanceId });
    const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
    try {
      const placed = props.update(rewards, [{ ...original, rotation }]);
      const expected = new THREE.Vector3().copy(BAG_OFFSET).applyQuaternion(rotation).add(original.position);
      expect(placed.bag?.distanceTo(expected)).toBeLessThan(1e-8);
      expect(props.update(rewards, [{ ...original, collected: true }]).bag).toBeNull();
      expect(props.update(rewards, [{ ...original, instanceId: mintId.instance(2) }]).bag).toBeNull();
    } finally {
      props.dispose();
    }
  });

  it('labels all five in each supported language, and turns a price tag only for a confirmed visible change', () => {
    const graph = graphForTest();
    let locale: Locale = 'ja';
    const tx = (key: string, params?: Readonly<Record<string, string | number>>) => translate(locale, key as UiKey, params);
    const expanded = createExpandedView({
      graph, illustratedRewards: true, layout: bundle.layout, catalog: bundle.catalog, expansion: bundle.expansion!,
      translate: tx, prizeName: () => '輪投げ',
    });
    const camera = new THREE.OrthographicCamera(-4, 4, 3, -1, 0.01, 30);
    camera.position.set(0, 0, 1);
    camera.updateMatrixWorld();
    const state = {
      phase: 'aiming' as const, effectiveAim: TARGET_AIM, standX, ballistic, loadingBar: null, paused: false,
      expansion: { ...baseExpansion, rewards: view({ bagInstanceId: original.instanceId, target: fixedTarget, chimeUsed: true }) },
    };
    const frame: SimulationFrame = { simTimeSec: 0, stage: null, shotId: null, projectiles: [], prizes: [original], events: [] };
    const labels = (f = frame) => expanded.update(f, state, camera, { width: 402, height: 874 })!.rewardLabels;
    try {
      const topEdges = [
        ['reward:device:A2', devices.chime!.center, devices.chime!.halfExtents.y],
        ['reward:device:A3', devices.seesawTray!.center, devices.seesawTray!.halfExtents.y],
        ['reward:device:A4', devices.piggySlot!.center, devices.piggySlot!.halfExtents.y],
        ['reward:target:fixed', target.center, target.outerRadius],
      ] as const;
      for (const [id, center, halfHeight] of topEdges) {
        const top = projectToScreen(camera, { ...center, y: center.y + halfHeight }, 402, 874)!;
        expect(labels().find(l => l.id === id)!.y, id).toBeLessThanOrEqual(top.y);
      }
      for (locale of LOCALES) {
        const names = labels().map(l => l.accessibleName);
        for (const id of ['A1', 'A2', 'A3', 'A4', 'A5']) {
          const name = tx('reward.name.' + id);
          expect(name).not.toMatch(/^reward\.|^$/);
          expect(names.some(n => n?.startsWith(name)), id + ' ' + locale).toBe(true);
        }
        expect(names).toContain(tx('reward.name.A2') + ' · ' + tx('reward.device.spent'));
      }
      locale = 'ja';
      const shotId = mintId.shot(1);
      const transformation = {
        instanceId: original.instanceId, requestId: mintId.effectRequest(shotId, 1),
        fromTypeId: original.typeId, toTypeId: asPrizeTypeId('P007'),
      };
      const transformed = { ...original, typeId: transformation.toTypeId };
      const provisional: SimulationFrame = { ...frame, prizes: [transformed], events: [{
        type: 'prizeTransformed', eventId: mintId.event(shotId, 1), shotId, ...transformation,
        hpBefore: 2, maxHpBefore: 3, hpAfter: 2, maxHpAfter: 3,
      }] };
      const tags = (f: SimulationFrame) => labels(f).filter(l => l.id.startsWith('reward:tag:'));
      expect(tags(provisional)).toHaveLength(0);
      expanded.showConfirmedTransforms([]);
      expect(tags(provisional)).toHaveLength(0);
      expanded.showConfirmedTransforms([transformation]);
      expect(tags(frame)).toHaveLength(0);
      expect(tags(provisional)[0]?.turn).toBe(transformation.requestId + ':' + transformation.instanceId);
      expanded.showConfirmedTransforms([transformation], false);
      expect(tags(provisional)[0]?.turn).toBeUndefined();
      expect(tags(provisional).map(l => l.text)).toEqual([tx('reward.tag.changed', { name: '輪投げ' })]);
      expect(tags({ ...provisional, prizes: [{ ...transformed, collected: true }] })).toHaveLength(0);
      expect(tags({ ...provisional, simTimeSec: 4 })).toHaveLength(0);
    } finally {
      expanded.dispose();
      graph.dispose();
    }
  });
});
