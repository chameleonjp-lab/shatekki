import { readFileSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';
import { BOOTH_LAYOUT_V2, aimDirection, ballisticFor, corkFreeFlightPath, muzzlePosition, type TuningConfig, type Vec3 } from '../../src/contracts';

// The expanded bundle keeps the rules-v1 cork and aim numbers (only slots/tier targets differ).
const RELEASE_TUNING = (JSON.parse(readFileSync('data/release-approved-v1.json', 'utf8')) as { tuning: TuningConfig }).tuning;
/** Radians per CSS pixel of aim-pad drag; must match AIM_SENSITIVITY in src/ui/controls/panel.ts. */
const AIM_SENSITIVITY = 0.0022;

/** Requested aim (relative to zero aim) that puts the cork on `target`, gravity included. */
function aimAt(standX: number, target: Vec3): { yaw: number; pitch: number } {
  const L = BOOTH_LAYOUT_V2;
  const muzzle = muzzlePosition(L, standX);
  const zero = aimDirection(L, standX, { yaw: 0, pitch: 0 });
  const yaw = Math.atan2(target.x - muzzle.x, -(target.z - muzzle.z)) - Math.atan2(zero.x, -zero.z);
  const spec = ballisticFor(RELEASE_TUNING, 'standard');
  const yAt = (pitch: number): number => {
    const path = corkFreeFlightPath(muzzle, aimDirection(L, standX, { yaw, pitch }), spec, 3);
    for (let i = 1; i < path.length; i++) {
      if (path[i]!.z <= target.z) {
        const a = path[i - 1]!;
        const b = path[i]!;
        return a.y + ((b.y - a.y) * (a.z - target.z)) / (a.z - b.z);
      }
    }
    return -Infinity;
  };
  let lo = -0.6;
  let hi = 0.9;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < target.y) lo = mid;
    else hi = mid;
  }
  return { yaw, pitch: (lo + hi) / 2 };
}

/** Stand at the right end, load, drag the aim pad to the shopkeeper's body and fire. */
export async function shootShopkeeper(page: Page) {
  const standX = BOOTH_LAYOUT_V2.camera.standMaxX;
  await page.getByTestId('stand-slider').fill(String(standX));
  await page.getByTestId('btn-confirm-position').click();
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'loading');
  await page.getByTestId('btn-load').dispatchEvent('pointerdown');
  await expect(page.getByTestId('controls')).toHaveAttribute('data-mode', 'aiming');
  const body = BOOTH_LAYOUT_V2.shopkeeper.find((p) => p.part === 'body')!.box.center;
  const aim = aimAt(standX, { x: body.x, y: 1.2, z: body.z + 0.1 });
  const pad = page.getByTestId('aim-pad');
  const box = (await pad.boundingBox())!;
  const x0 = box.x + box.width / 2;
  const y0 = box.y + box.height / 2;
  await pad.dispatchEvent('pointerdown', { pointerId: 7, clientX: x0, clientY: y0, isPrimary: true });
  await pad.dispatchEvent('pointermove', { pointerId: 7, clientX: x0 + aim.yaw / AIM_SENSITIVITY, clientY: y0 - aim.pitch / AIM_SENSITIVITY, isPrimary: true });
  await pad.dispatchEvent('pointerup', { pointerId: 7, clientX: x0 + aim.yaw / AIM_SENSITIVITY, clientY: y0 - aim.pitch / AIM_SENSITIVITY, isPrimary: true });
  const fire = page.getByTestId('btn-fire');
  await fire.dispatchEvent('pointerdown');
  await fire.dispatchEvent('pointerup');
}
