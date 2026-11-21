import type { Camera } from 'three';
import {
  FESTIVAL_BELL_PRIZE, FESTIVAL_BELLS, FESTIVAL_ENCORE, FESTIVAL_EYES, FESTIVAL_FUSE, FESTIVAL_LANTERNS, FESTIVAL_PAIR,
  GIANT_SLIDE_LIMIT, festivalBellOrder, giantTarget,
} from '../contracts/festival';
import type { FestivalProgress, FestivalSignal, FestivalTarget, FestivalTargetId } from '../contracts/festival';
import type { SimulationFrame, ShotSummary, Vec3, ViewState } from '../contracts';
import { projectToScreen } from './expanded-view';
import '../ui/festival-gimmicks.css';

const LAMPS = [...FESTIVAL_LANTERNS, ...FESTIVAL_PAIR, ...FESTIVAL_BELLS, ...FESTIVAL_EYES, FESTIVAL_FUSE, FESTIVAL_BELL_PRIZE, FESTIVAL_ENCORE, giantTarget(0)];
const DARUMA = { ...FESTIVAL_EYES[0].center, x: -2.065, y: 1.435 };
const GIANT_RAIL = { ...giantTarget(GIANT_SLIDE_LIMIT / 2).center, y: .83 };
const CAP = 22;

export function createFestivalGimmickView(canvas: HTMLCanvasElement) {
  const parent = canvas.parentElement;
  if (!parent) return null;
  const doc = canvas.ownerDocument;
  const layer = doc.createElement('div');
  layer.className = 'festival-gimmicks';
  layer.setAttribute('aria-hidden', 'true');
  const shade = doc.createElement('div');
  shade.className = 'fg-spotlight';
  const torso = prop('daruma');
  const rail = prop('rail');
  layer.prepend(shade);
  parent.append(layer);

  function prop(id: string) {
    const el = doc.createElement('i');
    el.className = 'fg-prop';
    el.dataset.target = id;
    el.hidden = true;
    layer.append(el);
    return el;
  }
  const targetNodes = new Map(LAMPS.map(target => [target.id, prop(target.id)]));
  const live = new Set<Animation>();
  const seen = new Set<string>();
  let from: FestivalProgress | undefined;
  let current: FestivalProgress | undefined;
  let shotId: string | null = null;
  let pair: FestivalTargetId | undefined;
  let lanterns = 0;
  let bellSeed: number | undefined;
  let bellOrder: readonly FestivalTargetId[] = [];
  let positionKey = '';
  let camera: Camera;
  let width = 1;
  let height = 1;

  function cancelMotion() {
    for (const animation of live) animation.cancel();
    live.clear();
  }
  function reset() {
    from = current = undefined;
    shotId = null;
    pair = undefined;
    lanterns = 0;
    seen.clear();
    cancelMotion();
    positionKey = '';
    layer.hidden = true;
  }
  function screen(point: Vec3) { return projectToScreen(camera, point, width, height); }
  function place(el: HTMLElement, point: Vec3, radius: number, show: boolean) {
    const xy = show ? screen(point) : null;
    el.hidden = !xy;
    if (!xy) return null;
    const rim = screen({ ...point, x: point.x + radius });
    const diameter = Math.max(6, rim ? Math.abs(rim.x - xy.x) * 2 : radius * 108);
    el.style.left = xy.x.toFixed(1) + 'px';
    el.style.top = xy.y.toFixed(1) + 'px';
    el.style.setProperty('--diameter', diameter.toFixed(1) + 'px');
    return xy;
  }
  function animate(el: HTMLElement, frames: Keyframe[], duration: number, delay = 0, remove = true) {
    if (live.size >= CAP) live.values().next().value?.cancel();
    const motion = el.animate(frames, { duration, delay, easing: 'ease-out', fill: 'both' });
    live.add(motion);
    const cleanup = () => { live.delete(motion); if (remove) el.remove(); };
    motion.oncancel = cleanup;
    motion.onfinish = () => { cleanup(); if (!remove) motion.cancel(); };
  }
  function effect(kind: string, x: number, y: number) {
    const el = doc.createElement('i');
    el.className = 'fg-effect fg-' + kind;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.append(el);
    return el;
  }
  function roundBurst(point: Vec3) {
    const here = screen(point);
    if (!here) return;
    const endX = here.x < width / 2 ? 28 : width - 28;
    const endY = Math.max(62, here.y - 90);
    const fuse = effect('fuse', here.x, here.y);
    const distance = Math.hypot(endX - here.x, endY - here.y);
    const angle = Math.atan2(endY - here.y, endX - here.x);
    fuse.style.width = distance + 'px';
    animate(fuse, [
      { transform: `rotate(${angle}rad) scaleX(0)`, opacity: 1 },
      { transform: `rotate(${angle}rad) scaleX(1)`, opacity: 1, offset: .8 },
      { transform: `rotate(${angle}rad) scaleX(1)`, opacity: 0 },
    ], 300);
    for (const [index, size] of [94, 154, 228].entries()) {
      const bloom = effect('bloom', (endX + index * width * .19) % (width - 22), endY + index * 20);
      bloom.style.width = bloom.style.height = size + 'px';
      animate(bloom, [
        { transform: 'translate(-50%,-50%) scale(.1)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 1, offset: .32 },
        { transform: 'translate(-50%,-50%) scale(1.35)', opacity: 0 },
      ], 680, 300 + index * 105);
    }
  }
  function present(signal: FestivalSignal, quiet: boolean) {
    if (!current) return;
    const { mark, amount, point } = signal;
    if (mark === 'lantern') lanterns = amount ?? 0;
    if (mark === 'red' || mark === 'white') pair = pair ? undefined : mark;
    if (mark === 'bell' || mark === 'bell-wrong') current = { ...current, bells: amount ?? 0 };
    if (mark === 'bell-prize') current = { ...current, bellPrize: true };
    if (mark === 'eye-left' || mark === 'eye-right') current = { ...current, eyes: current.eyes | (mark === 'eye-left' ? 1 : 2) };
    if (mark === 'giant-slide') current = { ...current, giant: Math.min(GIANT_SLIDE_LIMIT, current.giant + (amount ?? 0)) };
    if (mark === 'fuse') current = { ...current, fuse: true };
    if (quiet) return;
    const here = screen(point);
    if (mark === 'fuse') roundBurst(point);
    if (!here) return;
    if (mark === 'relay' || mark === 'red-white') {
      const band = effect(mark, here.x, here.y);
      const edge = here.x < width / 2 ? -width : width;
      animate(band, [
        { transform: 'translate(-50%,-50%) scaleX(.05)', opacity: .94 },
        { transform: 'translate(-50%,-50%) scaleX(1)', opacity: .94, offset: .34 },
        { transform: `translate(calc(-50% + ${edge}px),-50%)`, opacity: 0 },
      ], 650);
    }
    if (mark === 'bell-open') {
      const spot = screen(FESTIVAL_BELL_PRIZE.center);
      if (spot) {
        for (const side of [-1, 1]) {
          const curtain = effect('curtain', spot.x, spot.y);
          animate(curtain, [
            { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 1 },
            { transform: `translate(calc(-50% + ${side * 90}px),-50%) scaleX(.06)`, opacity: 0 },
          ], 720);
        }
      }
    }
    if (mark === 'daruma') {
      animate(torso, [{ transform: 'translate(-50%,-50%) rotateY(70deg)' }, { transform: 'translate(-50%,-50%) rotateY(0)' }], 620, 0, false);
    }
    if (mark === 'giant-slide') {
      const giant = targetNodes.get('giant')!;
      if (!giant.hidden) animate(giant, [
        { transform: 'translate(-50%,-50%) rotate(-3deg) scale(1.07)' },
        { transform: 'translate(-50%,-50%)' },
      ], 220, 0, false);
    }
    if (mark === 'giant-drop') {
      const giant = targetNodes.get('giant')!;
      if (!giant.hidden) {
        const falling = giant.cloneNode(true) as HTMLElement;
        falling.dataset.target = 'giant-falling';
        layer.append(falling);
        animate(falling, [
          { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 },
          { transform: 'translate(-40%,50px) rotate(20deg)', opacity: 1, offset: .65 },
          { transform: 'translate(-60%,110px) rotate(48deg)', opacity: 0 },
        ], 950);
      }
    }
    if (mark === 'giant-slide' || mark === 'daruma' || mark === 'encore') {
      const count = mark === 'daruma' ? 12 : mark === 'giant-slide' ? Math.min(8, Math.ceil((amount ?? 0) * 65)) : 9;
      for (let i = 0; i < count; i++) {
        const fleck = effect(mark === 'giant-slide' ? 'wood' : mark === 'daruma' ? 'paper' : 'gold', here.x, here.y);
        const angle = i * 2.39996;
        const r = 30 + i * 5;
        animate(fleck, [
          { transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * r}px,${Math.sin(angle) * r}px) rotate(${31 * i}deg)`, opacity: 0 },
        ], 520 + i * 14);
      }
    }
  }

  function paintTarget(target: FestivalTarget, encore: boolean, p: FestivalProgress) {
    const el = targetNodes.get(target.id)!;
    const id = target.id;
    const i = bellOrder.indexOf(id);
    const eye = id === 'eye-left' ? 1 : id === 'eye-right' ? 2 : 0;
    const lantern = FESTIVAL_LANTERNS.findIndex(lamp => lamp.id === id);
    const show = encore ? id === 'encore'
      : id !== 'encore' && (id !== 'bell-prize' || p.bells === bellOrder.length && !p.bellPrize) &&
        (id !== 'fuse' || !p.fuse) && (id !== 'giant' || p.giant < GIANT_SLIDE_LIMIT);
    const xy = place(el, target.center, target.radius, show);
    el.classList.toggle('is-lit', !!(p.eyes & eye) || lantern >= 0 && lantern < lanterns || i >= 0 && i < p.bells);
    el.classList.toggle('is-next', i >= 0 ? i === p.bells : (id === 'red' || id === 'white') && !!pair && pair !== id);
    const order = i >= 0 ? String(i + 1) : '';
    if (el.textContent !== order) el.textContent = order;
    if (id === 'giant') el.style.setProperty('--slide', (p.giant / GIANT_SLIDE_LIMIT * 100).toFixed(1) + '%');
    if (id === 'encore' && xy) {
      shade.style.setProperty('--spot-x', xy.x.toFixed(1) + 'px');
      shade.style.setProperty('--spot-y', xy.y.toFixed(1) + 'px');
    }
  }

  return {
    render(frame: SimulationFrame, view: ViewState, cam: Camera, w: number, h: number, quiet: boolean) {
      const festival = view.expansion?.festival;
      if (!festival) return;
      camera = cam;
      width = w;
      height = h;
      layer.hidden = false;
      const nextShot = frame.shotId && frame.shotId !== shotId;
      let repaint = from !== festival.progress || !!nextShot || !current;
      if (repaint || !current) {
        from = current = festival.progress;
        pair = undefined;
        lanterns = 0;
      }
      if (nextShot) {
        shotId = frame.shotId;
        seen.clear();
        cancelMotion();
      }
      if (quiet) cancelMotion();
      if (bellSeed !== festival.seed) {
        repaint = true;
        bellSeed = festival.seed;
        bellOrder = festivalBellOrder(festival.seed);
      }
      for (const event of frame.events) {
        if (event.type !== 'festival' || seen.has(event.eventId)) continue;
        seen.add(event.eventId);
        repaint = true;
        present(event, quiet);
      }
      const encore = current.encore === 'ready';
      layer.classList.toggle('is-encore', encore);
      layer.classList.toggle('is-quiet', quiet);
      const key = [w, h, view.standX, view.effectiveAim.yaw, view.effectiveAim.pitch].join('/');
      if (!repaint && key === positionKey) return;
      positionKey = key;
      place(torso, DARUMA, .223, !encore);
      place(rail, GIANT_RAIL, .30, !encore);
      for (const target of LAMPS) paintTarget(target.id === 'giant' ? giantTarget(current.giant) : target, encore, current);
    },
    settle(summary: ShotSummary, quiet: boolean) {
      if (!camera || quiet) return;
      for (const [i, step] of (summary.festival?.domino ?? []).slice(0, 12).entries()) {
        const position = screen(step.point);
        if (!position) continue;
        const number = effect('domino', position.x, position.y);
        number.textContent = String(i + 1);
        animate(number, [
          { transform: 'translate(-50%,-40%) scale(.45)', opacity: 0 },
          { transform: 'translate(-50%,-50%) scale(1.24)', opacity: 1, offset: .24 },
          { transform: 'translate(-50%,-100%)', opacity: 1, offset: .73 },
          { transform: 'translate(-50%,-130%)', opacity: 0 },
        ], 800, i * 120);
      }
    },
    reset,
    dispose() { reset(); layer.remove(); },
  };
}
