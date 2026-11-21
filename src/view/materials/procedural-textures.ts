import * as THREE from 'three';

function paint(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  colorSpace: THREE.ColorSpace = THREE.SRGBColorSpace,
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = colorSpace;
  return texture;
}

/** A fixed seed keeps the surface consistent and independent of gameplay randomness. */
function textureNoise(seed: number) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function woodGrain(ctx: CanvasRenderingContext2D) {
  const noise = textureNoise(0x574f4f44);
  ctx.fillStyle = '#e7cdb1';
  ctx.fillRect(0, 0, 256, 256);
  // Grain bands bend around knots. Span the canvas so boards can tile.
  for (let y = 0; y < 256; y += 2 + Math.floor(noise() * 4)) {
    const bend = (noise() - 0.5) * 22;
    const alpha = 0.06 + noise() * 0.25;
    ctx.strokeStyle = `rgba(91,49,29,${alpha})`;
    ctx.lineWidth = 0.45 + noise() * 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(65, y + bend, 183, y - bend, 256, y);
    ctx.stroke();
  }
  for (const [x, y] of [[55, 78], [186, 191]] as const) {
    for (let i = 1; i <= 5; i++) {
      ctx.strokeStyle = 'rgba(84,44,27,0.15)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.ellipse(x, y, i * 4.6, i * 1.4, -0.05, 0, 2 * Math.PI);
      ctx.stroke();
    }
  }
}

function felt(ctx: CanvasRenderingContext2D) {
  const noise = textureNoise(0x46454c54);
  ctx.fillStyle = '#e9d4d0';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 3800; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(94,41,48,0.17)' : 'rgba(255,247,233,0.29)';
    ctx.fillRect(noise() * 128, noise() * 128, 0.45 + noise() * 1.7, 0.75);
  }
}

function washi(ctx: CanvasRenderingContext2D) {
  const noise = textureNoise(0x57415348);
  const lamp = ctx.createLinearGradient(0, 0, 0, 128);
  lamp.addColorStop(0, '#b88c5c');
  lamp.addColorStop(0.27, '#fff1d4');
  lamp.addColorStop(0.62, '#fff9e8');
  lamp.addColorStop(1, '#a9774f');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 128; y += 8) {
    ctx.fillStyle = 'rgba(118,70,38,0.21)';
    ctx.fillRect(0, y, 128, 1.5);
  }
  for (let i = 0; i < 580; i++) {
    ctx.fillStyle = i % 2 ? 'rgba(115,84,53,0.14)' : 'rgba(255,255,250,0.3)';
    ctx.fillRect(noise() * 128, noise() * 128, 1 + noise() * 3, 0.6);
  }
}

export type StallTextures = ReturnType<typeof createStallTextures>;

/** Shared for the lifetime of one scene. Node can build the scene without canvases. */
export function createStallTextures() {
  const wood = paint(256, 256, woodGrain);
  const cloth = paint(128, 128, felt);
  const paper = paint(128, 128, washi);
  const shadow = paint(64, 64, (ctx) => {
    const ink = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    ink.addColorStop(0, 'rgba(255,255,255,0.95)');
    ink.addColorStop(0.44, 'rgba(255,255,255,0.68)');
    ink.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = ink;
    ctx.fillRect(0, 0, 64, 64);
  }, THREE.NoColorSpace);
  for (const map of [wood, cloth]) {
    if (map) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  }
  return {
    wood, cloth, paper, shadow,
    dispose() {
      for (const map of [wood, cloth, paper, shadow]) map?.dispose();
    },
  };
}

/** A small, soft sky and warm lamp panels for glossy prize reflections. */
export function createStallEnvironment(): THREE.CanvasTexture | null {
  const texture = paint(256, 128, (ctx) => {
    const sky = ctx.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#4b5576');
    sky.addColorStop(0.42, '#8d7880');
    sky.addColorStop(0.53, '#60434c');
    sky.addColorStop(1, '#3e211b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 128);
    for (const x of [32, 95, 163, 226]) {
      const glow = ctx.createRadialGradient(x, 50, 1, x, 50, 25);
      glow.addColorStop(0, '#fff6dc');
      glow.addColorStop(0.25, '#ffd49b');
      glow.addColorStop(1, 'rgba(255,153,82,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - 25, 25, 50, 50);
    }
  });
  if (texture) texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}
