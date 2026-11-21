import * as THREE from 'three';
import type { BoothLayout, ShotId, ShotSummary, SimulationFrame, Vec3 } from '../contracts';
import { projectToScreen } from './expanded-view';
import '../ui/shot-festival.css';

const LIMIT = 64;
const MARK_COLOR = { prize: '#ffeab1', fan: '#8af4ff', tray: '#ffd05a', drop: '#ffc361' };

type Mark = keyof typeof MARK_COLOR;

/** Retain only the current shot and draw transient effects over the existing scene. */
export function createShotFestival(
  canvas: HTMLCanvasElement,
  group: THREE.Group,
  layout: BoothLayout,
) {
  const parent = canvas.parentElement;
  if (!parent) return null;
  const doc = canvas.ownerDocument;
  const overlay = doc.createElement('div');
  overlay.className = 'shot-festival';
  overlay.setAttribute('aria-hidden', 'true');
  const border = doc.createElement('div');
  border.className = 'shot-festival-border';
  overlay.append(border);
  parent.append(overlay);

  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color: 0xff9e38, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const wave = new THREE.InstancedMesh(geometry, material, layout.tiers.length);
  wave.name = 'festival-shelf-wave';
  wave.frustumCulled = false;
  wave.visible = false;
  group.add(wave);
  const matrix = new THREE.Matrix4();

  const drops = new Map<string, { x: number; y: number }>();
  const tiers = new Map<string, number>();
  const seen = new Set<string>();
  const animations: Animation[] = [];
  let active: ShotId | null = null;
  let waveBorn = -Infinity;
  let waveTier = 0;
  let dropCount = 0;
  let confirmed = false;
  let borderAnimation: Animation | null = null;

  function clear() {
    for (const animation of animations) animation.cancel();
    animations.length = 0;
    borderAnimation?.cancel();
    borderAnimation = null;
    delete border.dataset.tier;
    for (const node of Array.from(overlay.children)) if (node !== border) node.remove();
    drops.clear();
    tiers.clear();
    seen.clear();
    waveBorn = -Infinity;
    wave.visible = false;
    dropCount = 0;
    confirmed = false;
  }

  function token(text: string, kind: Mark, start: { x: number; y: number }, end?: { x: number; y: number }, delay = 0) {
    if (animations.length >= 12) animations.shift()?.cancel();
    const el = doc.createElement('span');
    el.className = end ? 'shot-festival-token shot-festival-score' : 'shot-festival-token';
    el.style.color = MARK_COLOR[kind];
    el.textContent = text;
    overlay.append(el);
    const motion = [
      { transform: `translate(${start.x}px,${start.y}px) translate(-50%,-50%) scale(.65)`, opacity: 0 },
      { transform: `translate(${start.x}px,${start.y - 9}px) translate(-50%,-50%) scale(1.18)`, opacity: 1, offset: .23 },
      ...(end ? [{ transform: `translate(${start.x}px,${end.y}px) translate(-50%,-50%) scale(.85)`, opacity: 1, offset: .73 }] : []),
      { transform: `translate(${end?.x ?? start.x}px,${end?.y ?? start.y - 36}px) translate(-50%,-50%) scale(${end ? '.5' : '1'})`, opacity: 0 },
    ];
    const anim = el.animate(motion, { duration: end ? 560 : 330, delay, easing: 'ease-out', fill: 'both' });
    animations.push(anim);
    const remove = () => {
      el.remove();
      const i = animations.indexOf(anim);
      if (i >= 0) animations.splice(i, 1);
    };
    anim.onfinish = remove;
    anim.oncancel = remove;
  }

  function fireworks() {
    const bursts = [
      { x: 12, y: 28, size: 116, delay: 0, color: '#ff894c' },
      { x: 87, y: 20, size: 126, delay: 90, color: '#ffde72' },
      { x: 89, y: 55, size: 218, delay: 310, color: '#fff5bd' },
    ];
    for (const burst of bursts) {
      const bloom = doc.createElement('i');
      bloom.className = 'shot-festival-firework';
      bloom.style.left = `${burst.x}%`;
      bloom.style.top = `${burst.y}%`;
      bloom.style.width = `${burst.size}px`;
      bloom.style.color = burst.color;
      overlay.append(bloom);
      const animation = bloom.animate([
        { transform: 'translate(-50%,-50%) scale(.12)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(.46)', opacity: 1, offset: .28 },
        { transform: 'translate(-50%,-50%) scale(1.18)', opacity: 0 },
      ], { duration: 580, delay: burst.delay, easing: 'ease-out', fill: 'both' });
      animations.push(animation);
      const remove = () => {
        bloom.remove();
        const i = animations.indexOf(animation);
        if (i >= 0) animations.splice(i, 1);
      };
      animation.onfinish = remove;
      animation.oncancel = remove;
    }
  }

  function celebration(tier: number, quiet: boolean) {
    border.dataset.tier = String(tier);
    borderAnimation?.cancel();
    const frames = quiet ? [{ opacity: .85 }, { opacity: .85 }] :
      [{ opacity: 0 }, { opacity: .95, offset: .16 }, { opacity: .6, offset: .58 }, { opacity: 0 }];
    borderAnimation = border.animate(frames, { duration: quiet ? 450 : 760, easing: 'ease-out' });
  }

  function shelfWave(at: number) {
    const age = at - waveBorn;
    wave.visible = age >= 0 && age < .45;
    if (!wave.visible) return;
    const progress = age / .45;
    material.opacity = .42 * (1 - progress);
    wave.count = 0;
    for (const [index, tier] of layout.tiers.entries()) {
      if (dropCount < 3 && index !== waveTier) continue;
      const span = tier.halfWidth * (dropCount > 1 ? 1 : .45);
      const width = Math.max(.08, Math.sin(progress * Math.PI) * span);
      const x = -span + width / 2 + progress * (2 * span - width);
      matrix.makeScale(width, 1, Math.min(tier.depth, .08));
      matrix.setPosition(x, tier.topY + .006, tier.centerZ);
      wave.setMatrixAt(wave.count++, matrix);
    }
    if (wave.count > 0) wave.instanceMatrix.needsUpdate = true;
  }

  return {
    begin(shot: ShotId) {
      clear();
      active = shot;
    },
    render(frame: SimulationFrame, camera: THREE.Camera, width: number, height: number, now: number, quiet: boolean) {
      wave.visible = false;
      if (!active || (!frame.events.length && !frame.shotId && !Number.isFinite(waveBorn))) return;
      const position = (p: Vec3) => {
        const xy = projectToScreen(camera, p, width, height);
        if (!xy || xy.x < 24 || xy.x > width - 24 || xy.y < height * .20 || xy.y > height * .60) return null;
        return xy;
      };
      if (!confirmed) for (const ev of frame.events) {
        if (ev.shotId !== active || seen.has(ev.eventId)) continue;
        if (seen.size === 512) seen.delete(seen.values().next().value!);
        seen.add(ev.eventId);
        if (ev.type === 'impact' && ev.target.kind === 'prize' && tiers.size < LIMIT) {
          let tier = 0;
          for (const [index, shelf] of layout.tiers.entries()) if (ev.point.y >= shelf.topY - .03) tier = index;
          if (!tiers.has(ev.target.instanceId)) tiers.set(ev.target.instanceId, tier);
        }
        if (ev.type === 'prizeReachedCollection') {
          dropCount++;
          waveBorn = now;
          waveTier = tiers.get(ev.instanceId) ?? 0;
          const prize = frame.prizes.find(p => p.instanceId === ev.instanceId);
          const xy = prize && projectToScreen(camera, prize.position, width, height);
          if (xy && drops.size < LIMIT) drops.set(ev.instanceId, xy);
        }
        if (quiet || ev.type !== 'impact' || ev.speed < 3) continue;
        const xy = position(ev.point);
        if (!xy) continue;
        if (ev.target.kind === 'shopkeeper' && ev.target.part === 'fan' && ev.target.face === 'front') token('↪', 'fan', xy);
        else if (ev.target.kind === 'surface' && ev.target.surfaceId === 'reflector-tray') token('✧', 'tray', xy);
        else if (ev.target.kind === 'prize') token('✦', 'prize', xy);
      }
      if (!quiet) shelfWave(now);
    },
    settle(summary: ShotSummary, freshSets: number, ammoBefore: number, quiet: boolean) {
      if (summary.shotId !== active || confirmed) return;
      confirmed = true;
      const chain = summary.chainCount;
      const sets = summary.newlyCompletedSets.length;
      const continued = ammoBefore === 1 && !summary.runEnded && summary.ammoAfter > 0;
      const tier = sets >= 2 || chain >= 4 ? 4 : freshSets > 0 || continued || chain === 3 ? 3 : sets || chain === 2 ? 2 : 0;
      if (tier) celebration(tier, quiet);
      if (quiet) return; // The confirmed score and the card remain immediately visible.
      if (sets >= 2) fireworks();
      if (continued) {
        const ammo = parent.querySelector<HTMLElement>('[data-testid="hud-ammo"]');
        if (ammo) animations.push(ammo.animate([
          { filter: 'brightness(.72)' },
          { filter: 'brightness(1.4) drop-shadow(0 0 7px #ffc14f)', offset: .34 },
          { filter: 'none' },
        ], { duration: 620, easing: 'ease-out' }));
      }
      const score = parent.querySelector<HTMLElement>('[data-testid="hud-score"]');
      if (!score) return;
      const rect = score.getBoundingClientRect();
      const board = overlay.getBoundingClientRect();
      const end = { x: rect.left + rect.width / 2 - board.left, y: rect.top + rect.height / 2 - board.top };
      const prizes = summary.ledger.items.filter(item => item.kind === 'prize' && item.points > 0).slice(0, 8);
      for (const [i, prize] of prizes.entries()) {
        const from = drops.get(prize.refId);
        const left = from ? from.x < board.width * .5 : i % 2 === 0;
        // The next shot can already be aimed. Keep the score tokens in the side gutters until the HUD.
        const start = { x: board.width * (left ? .13 : .87), y: from?.y ?? board.height * .48 };
        token(`+${prize.points.toLocaleString(doc.documentElement.lang || undefined)}`, 'drop', start, end, i * 45);
      }
      if (prizes.length) {
        const anim = score.animate([{ scale: '1' }, { scale: '1.22' }, { scale: '1' }], {
          delay: 460 + (prizes.length - 1) * 45, duration: 260, easing: 'ease-out',
        });
        animations.push(anim);
      }
    },
    clear() {
      clear();
      active = null;
    },
    dispose() {
      clear();
      overlay.remove();
      group.remove(wave);
      wave.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
