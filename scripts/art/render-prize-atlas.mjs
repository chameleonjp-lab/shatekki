// Bake the 100 game meshes into one transparent atlas. Run from the repository root.
import { writeFile } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const server = await createServer({ server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  await page.goto(server.resolvedUrls.local[0]);
  const image = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { createPrizeVisualFactory } = await import('/src/view/prizes.ts');
    const { RELEASE_CATALOG } = await import('/src/catalog/release-config.ts');
    const cell = 96;
    const sheet = document.createElement('canvas');
    sheet.width = sheet.height = cell * 10;
    const context = sheet.getContext('2d');
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(cell, cell);
    renderer.setClearColor(0, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xfff3de, 0xe3bca0, 1.8));
    const sun = new THREE.DirectionalLight(0xffe9bb, 2.1);
    sun.position.set(-2, 4, 3);
    scene.add(sun);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 5);
    const factory = createPrizeVisualFactory();
    for (let i = 0; i < 100; i++) {
      const key = 'P' + String(i + 1).padStart(3, '0');
      const mesh = factory.createMesh(RELEASE_CATALOG.prizes.get(key));
      scene.add(mesh);
      const bounds = mesh.geometry.boundingBox;
      const center = bounds.getCenter(new THREE.Vector3());
      camera.position.copy(center).add(new THREE.Vector3(0.52, 0.32, 1));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      const extent = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
      extent.applyMatrix4(camera.matrixWorldInverse);
      const range = Math.max(extent.max.x, -extent.min.x, extent.max.y, -extent.min.y) * 1.04;
      camera.left = camera.bottom = -range;
      camera.right = camera.top = range;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      context.drawImage(renderer.domElement, (i % 10) * cell, Math.floor(i / 10) * cell);
      scene.remove(mesh);
    }
    factory.dispose();
    renderer.dispose();
    return sheet.toDataURL('image/webp', 0.95).split(',')[1];
  });
  await writeFile('src/view/assets/prize-atlas.webp', Buffer.from(image, 'base64'));
} finally {
  await browser?.close();
  await server.close();
}
