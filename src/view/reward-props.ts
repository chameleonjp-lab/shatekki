/**
 * Reward props (plan T3, Visual): the A5 last-shot target and the A1 bag tied to one prize.
 *
 * Drawn only from RewardViewState (read-only). The target is drawn with exactly the geometry the
 * physics world uses for that shot (plan: "予告と物理の的が合う"); a preview while the stand is
 * being chosen is translucent, the fixed target after confirming is solid. Nothing here creates
 * commands, draws random numbers or writes into the simulation.
 */
import * as THREE from 'three';
import type { PrizeFrame, RewardViewState } from '../contracts';

export interface RewardProps {
  readonly group: THREE.Group;
  /** Returns where the bag and the target are, for floating labels. */
  update(rewards: RewardViewState | undefined, prizes: readonly PrizeFrame[]): { readonly bag: THREE.Vector3 | null; readonly target: THREE.Vector3 | null; readonly targetMode: 'preview' | 'fixed' | null };
  dispose(): void;
}

const TARGET_OUTER = 0xf3e7c9;
const TARGET_RING = 0xc8372d;
const BAG_CLOTH = 0xd9a441;
const BAG_TIE = 0x7a2e1f;
/** The bag hangs at the front-right of its prize (m). */
export const BAG_OFFSET = { x: 0.085, y: -0.02, z: 0.11 } as const;

export function createRewardProps(): RewardProps {
  const group = new THREE.Group();
  group.name = 'reward-props';

  // ---- A5 target: cream disc, red ring, red center (radii set per geometry)
  const target = new THREE.Group();
  target.name = 'reward-target';
  const mat = (color: number) => new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const outerMat = mat(TARGET_OUTER);
  const ringMat = mat(TARGET_RING);
  const centerMat = mat(TARGET_RING);
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1, 40), outerMat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.86, 40), ringMat);
  const center = new THREE.Mesh(new THREE.CircleGeometry(1, 32), centerMat);
  ring.position.z = 0.0005;
  center.position.z = 0.001;
  target.add(outer, ring, center);
  target.visible = false;
  group.add(target);

  // ---- A1 bag: a small cloth pouch with a tie
  const bag = new THREE.Group();
  bag.name = 'reward-bag';
  const clothMat = new THREE.MeshStandardMaterial({ color: BAG_CLOTH, roughness: 0.9 });
  const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), clothMat);
  pouch.scale.set(1, 0.85, 0.8);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.02, 0.025, 12), clothMat);
  neck.position.y = 0.035;
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 16), new THREE.MeshStandardMaterial({ color: BAG_TIE, roughness: 0.7 }));
  tie.position.y = 0.04;
  tie.rotation.x = Math.PI / 2;
  bag.add(pouch, neck, tie);
  bag.visible = false;
  group.add(bag);

  const bagAt = new THREE.Vector3();
  const targetAt = new THREE.Vector3();

  return {
    group,
    update(rewards, prizes) {
      // target
      const t = rewards?.target ?? null;
      target.visible = t !== null;
      if (t) {
        const g = t.geometry;
        target.position.set(g.center.x, g.center.y, g.center.z + 0.008);
        outer.scale.setScalar(g.outerRadius);
        ring.scale.setScalar(g.outerRadius);
        center.scale.setScalar(g.centerRadius);
        const opacity = t.mode === 'preview' ? 0.45 : 1;
        outerMat.opacity = opacity;
        ringMat.opacity = opacity;
        centerMat.opacity = opacity;
        targetAt.set(g.center.x, g.center.y, g.center.z);
      }
      // bag follows its prize until won
      const owner = rewards?.bagInstanceId ? prizes.find((p) => p.instanceId === rewards.bagInstanceId && !p.collected) : undefined;
      bag.visible = owner !== undefined;
      if (owner) {
        bag.position.set(owner.position.x + BAG_OFFSET.x, owner.position.y + BAG_OFFSET.y, owner.position.z + BAG_OFFSET.z);
        bagAt.copy(bag.position);
      }
      return { bag: owner ? bagAt : null, target: t ? targetAt : null, targetMode: t?.mode ?? null };
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const material = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach((x) => x.dispose());
        else material?.dispose();
      });
    },
  };
}
