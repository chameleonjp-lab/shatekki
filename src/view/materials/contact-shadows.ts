import * as THREE from 'three';
import type { BoothLayout } from '../../contracts';

const CONTACT_DISTANCE = 0.06;
const SHELF_DECAL_CLEARANCE = 0.0045;

/** Draw soft shelf contact shadows in a single call without adding any pick targets. */
export function createContactShadows(layout: BoothLayout, texture: THREE.Texture) {
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    map: texture, color: 0x2e151b, transparent: true, opacity: 0.58, depthWrite: false, toneMapped: false, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, layout.slots.length);
  mesh.name = 'shelf-contact-shadows';
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // instance positions and count change every frame
  mesh.count = 0;
  const bounds = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  return {
    mesh,
    beginFrame() {
      mesh.count = 0;
    },
    add(prize: THREE.Mesh) {
      if (mesh.count >= layout.slots.length || !prize.geometry.boundingBox) return;
      bounds.copy(prize.geometry.boundingBox).applyMatrix4(prize.matrixWorld);
      const x = (bounds.min.x + bounds.max.x) * 0.5;
      const z = (bounds.min.z + bounds.max.z) * 0.5;
      const shelf = layout.tiers.find((tier) =>
        Math.abs(bounds.min.y - tier.topY) < CONTACT_DISTANCE
        && Math.abs(x) < tier.halfWidth
        && Math.abs(z - tier.centerZ) < tier.depth / 2,
      );
      if (!shelf) return;
      const contact = 1 - Math.max(0, bounds.min.y - shelf.topY) / CONTACT_DISTANCE;
      const width = Math.min((bounds.max.x - bounds.min.x) * 1.45, 2 * (shelf.halfWidth - Math.abs(x)));
      const depth = Math.min((bounds.max.z - bounds.min.z) * 1.45, shelf.depth - 2 * Math.abs(z - shelf.centerZ));
      matrix.makeScale(width * contact, 1, depth * contact);
      matrix.setPosition(x, shelf.topY + SHELF_DECAL_CLEARANCE, z);
      mesh.setMatrixAt(mesh.count++, matrix);
    },
    endFrame() {
      if (mesh.count > 0) mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
