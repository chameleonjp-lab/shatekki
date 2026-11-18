import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { getGameplayBundle } from '../../src/catalog/gameplay-config';
import {
  REWARD_TARGET_HALF_THICKNESS, ballisticFor, mintId, asPrizeTypeId, IDENTITY_QUAT,
  type RewardViewState, type SimulationFrame, type ExpansionViewState, type PrizeFrame,
} from '../../src/contracts';
import { rewardDevicesFor, TARGET_AIM, targetGeometryAt } from '../../src/core/rewards';
import { LOCALES, translate, type Locale, type UiKey } from '../../src/i18n';
import { createExpandedView } from '../../src/view/expanded-view';
import { createSceneGraph, updateAim } from '../../src/view/scene';
import { BAG_OFFSET, createRewardProps } from '../../src/view/reward-props';
import { aimAt } from '../helpers/aim-at';

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

  it('keeps all drawn vertices within the actual device volumes, before and after a grant', () => {
    const props = createRewardProps(true);
    try {
      for (const used of [false, true]) {
        props.update(view({
          chimeUsed: used, seesawUsed: used, piggyDone: used, piggyDeposits: used ? 2 : 1, target: fixedTarget,
        }), []);
        props.group.updateMatrixWorld(true);
        const shapes = [
          ['chime', devices.chime!], ['piggy', devices.piggySlot!], ['seesaw', devices.seesawTray!],
          ['target', { center: target.center, halfExtents: { x: target.outerRadius, y: target.outerRadius, z: REWARD_TARGET_HALF_THICKNESS } }],
        ] as const;
        for (const [name, box] of shapes) {
          const drawn = drawnBounds(props.group.getObjectByName('reward-' + name)!);
          expect(drawn.isEmpty()).toBe(false);
          for (const axis of ['x', 'y', 'z'] as const) {
            expect(drawn.min[axis], name + ' ' + axis).toBeGreaterThanOrEqual(box.center[axis] - box.halfExtents[axis] - 0.00001);
            expect(drawn.max[axis], name + ' ' + axis).toBeLessThanOrEqual(box.center[axis] + box.halfExtents[axis] + 0.00001);
          }
        }
      }
    } finally {
      props.dispose();
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
