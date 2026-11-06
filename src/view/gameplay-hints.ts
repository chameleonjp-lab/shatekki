/**
 * Next-shot hints FX093-FX100 (plan EG07). PURE: no DOM, no WebGL, no RNG, no
 * clock. Everything here reads the read-only SimulationFrame / ViewState and
 * returns plain data the overlays draw. It never changes what happened, never
 * creates commands and never feeds a result back to the rules.
 *
 * One hint is shown at a time (the latest, chosen by the controller). These
 * helpers never hide the base HUD, ammo, reticle, map or set hints: they only
 * produce extra labels.
 */
import type { AimAngles, BoothLayout, HintKind, MotionSpec, PrizeFrame, PrizeTypeId, SetId, SimEvent, SimulationFrame, Vec3 } from '../contracts';
import { aimDirection } from '../contracts';

// --------------------------------------------------------- per-prize labels

export type HintTone = 'info' | 'warn' | 'zero';

export interface HintLabel {
  readonly instanceId: string;
  readonly typeId: string;
  /** i18n key (src/i18n) and its params; the overlay translates. */
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
  readonly tone: HintTone;
  readonly position: Vec3;
}

export interface HintContext {
  readonly prizes: readonly PrizeFrame[];
  /** Sets of the running bundle (3-prize S001.. and 2-prize PAIR001..). */
  readonly sets: ReadonlyMap<SetId, { readonly requiredTypeIds: readonly PrizeTypeId[] }>;
  /** Kinds confirmed this run (not the collection book). */
  readonly collectedTypeIds: readonly PrizeTypeId[];
  readonly completedSets: readonly SetId[];
  /** Short display name of a kind in the current language. */
  readonly nameOf: (typeId: PrizeTypeId) => string;
  /** The periodic motion the mount of this individual actually runs (null = none / unknown). */
  readonly motionOf: (instanceId: string, currentTypeId: PrizeTypeId) => MotionSpec | null;
}

export interface HintResult {
  readonly kind: HintKind;
  readonly labels: readonly HintLabel[];
  /** True when the hint applies but nothing on the shelf matches ("対象の景品は今はありません"). */
  readonly empty: boolean;
}

const alive = (prizes: readonly PrizeFrame[]): PrizeFrame[] => prizes.filter((p) => !p.collected);

/** FX093: current durability 0-100 %. Only HP 0 shows 0 %; any HP above 0 shows at least 1 %. */
export function hpPercent(hp: number, maxHp: number): number {
  if (!(maxHp > 0) || !(hp > 0)) return 0;
  return Math.min(100, Math.max(1, Math.round((hp / maxHp) * 100)));
}

export function hpRatioLabels(prizes: readonly PrizeFrame[]): HintLabel[] {
  return alive(prizes).map((p) => {
    const percent = hpPercent(p.hp, p.maxHp);
    return {
      instanceId: p.instanceId as string,
      typeId: p.typeId as string,
      key: percent === 0 ? 'xhint.hp.zero' : 'xhint.hp',
      params: { percent },
      tone: percent === 0 ? 'zero' : 'info',
      position: p.position,
    };
  });
}

/**
 * FX094: kinds that are the single missing kind of an incomplete set, at most
 * three. Order: number of such sets (more first), then P-number. Only kinds that
 * are on the shelf count. The set itself (name, other members) is never shown.
 */
export function oneMissingKinds(ctx: Pick<HintContext, 'prizes' | 'sets' | 'collectedTypeIds' | 'completedSets'>, limit = 3): { typeId: PrizeTypeId; sets: number }[] {
  const have = new Set<string>(ctx.collectedTypeIds as readonly string[]);
  const done = new Set<string>(ctx.completedSets as readonly string[]);
  const onShelf = new Set<string>(alive(ctx.prizes).map((p) => p.typeId as string));
  const count = new Map<string, number>();
  for (const [setId, def] of ctx.sets) {
    if (done.has(setId as string)) continue;
    const missing = def.requiredTypeIds.filter((t) => !have.has(t as string));
    if (missing.length !== 1) continue;
    const m = missing[0] as string;
    count.set(m, (count.get(m) ?? 0) + 1);
  }
  return [...count.entries()]
    .filter(([t]) => onShelf.has(t))
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, limit)
    .map(([typeId, sets]) => ({ typeId: typeId as PrizeTypeId, sets }));
}

export function oneMissingLabels(ctx: HintContext): HintLabel[] {
  const kinds = new Set<string>(oneMissingKinds(ctx).map((k) => k.typeId as string));
  return alive(ctx.prizes)
    .filter((p) => kinds.has(p.typeId as string))
    .map((p) => ({ instanceId: p.instanceId as string, typeId: p.typeId as string, key: 'xhint.oneMissing', tone: 'warn' as const, position: p.position }));
}

/** FX095: kinds not confirmed this run (the collection book is not mixed in). */
export function notCollectedLabels(ctx: Pick<HintContext, 'prizes' | 'collectedTypeIds'>): HintLabel[] {
  const have = new Set<string>(ctx.collectedTypeIds as readonly string[]);
  return alive(ctx.prizes)
    .filter((p) => !have.has(p.typeId as string))
    .map((p) => ({ instanceId: p.instanceId as string, typeId: p.typeId as string, key: 'xhint.notCollected', tone: 'info' as const, position: p.position }));
}

/** FX096: kinds with two or more individuals on the shelf, with the count. */
export function duplicateGroups(prizes: readonly PrizeFrame[]): { typeId: PrizeTypeId; count: number; instanceIds: string[] }[] {
  const by = new Map<string, PrizeFrame[]>();
  for (const p of alive(prizes)) {
    const list = by.get(p.typeId as string);
    if (list) list.push(p);
    else by.set(p.typeId as string, [p]);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([typeId, list]) => ({ typeId: typeId as PrizeTypeId, count: list.length, instanceIds: list.map((p) => p.instanceId as string) }));
}

export function duplicateLabels(ctx: Pick<HintContext, 'prizes' | 'nameOf'>): HintLabel[] {
  const out: HintLabel[] = [];
  const byId = new Map(ctx.prizes.map((p) => [p.instanceId as string, p]));
  for (const g of duplicateGroups(ctx.prizes)) {
    for (const id of g.instanceIds) {
      const p = byId.get(id)!;
      out.push({ instanceId: id, typeId: g.typeId as string, key: 'xhint.dup', params: { name: ctx.nameOf(g.typeId), count: g.count }, tone: 'info', position: p.position });
    }
  }
  return out;
}

export function formatSeconds(sec: number): string {
  return (Math.round(sec * 10) / 10).toFixed(1);
}

/** FX097: the motion the mount runs right now, for individuals still held by it. */
export function motionLabels(ctx: Pick<HintContext, 'prizes' | 'motionOf'>): HintLabel[] {
  const out: HintLabel[] = [];
  for (const p of alive(ctx.prizes)) {
    if (!p.mounted) continue; // once it came off the mount the motion has stopped
    const m = ctx.motionOf(p.instanceId as string, p.typeId);
    if (!m || m.type === 'none' || !(m.periodSec > 0)) continue;
    out.push({ instanceId: p.instanceId as string, typeId: p.typeId as string, key: `xhint.motion.${m.type}`, params: { sec: formatSeconds(m.periodSec) }, tone: 'info', position: p.position });
  }
  return out;
}

/** Labels for the hints that annotate prizes. Returns null for the hints that draw lines / readouts instead. */
export function computeHintLabels(kind: HintKind, ctx: HintContext): HintResult | null {
  let labels: HintLabel[];
  switch (kind) {
    case 'hpRatio':
      labels = hpRatioLabels(ctx.prizes);
      break;
    case 'oneMissing':
      labels = oneMissingLabels(ctx);
      break;
    case 'notCollectedThisRun':
      labels = notCollectedLabels(ctx);
      break;
    case 'duplicates':
      labels = duplicateLabels(ctx);
      break;
    case 'motionPeriod':
      labels = motionLabels(ctx);
      break;
    default:
      return null;
  }
  return { kind, labels, empty: labels.length === 0 };
}

// -------------------------------------------------------------- FX100 angles

export interface AngleReadout {
  /** + = right of the stall front (0 = straight at the back wall). */
  readonly yawDeg: number;
  /** + = up from the horizontal. */
  readonly pitchDeg: number;
}

const RAD = 180 / Math.PI;
const int = (v: number): number => Math.round(v) + 0; // never "-0"

/** The effective aim relative to the stall front, rounded to whole degrees for display only. */
export function angleReadout(layout: BoothLayout, standX: number, aim: AimAngles): AngleReadout {
  const d = aimDirection(layout, standX, aim);
  return { yawDeg: int(Math.atan2(d.x, -d.z) * RAD), pitchDeg: int(Math.asin(Math.max(-1, Math.min(1, d.y))) * RAD) };
}

export function signedDeg(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

// ------------------------------------------------------------- FX098 dashes

export interface Dash {
  readonly a: Vec3;
  readonly b: Vec3;
}

/** Cuts a polyline into dashes of `dash` metres separated by `gap` metres (at most `maxDashes`). */
export function dashPolyline(points: readonly Vec3[], dash = 0.07, gap = 0.05, maxDashes = 160): Dash[] {
  const out: Dash[] = [];
  if (points.length < 2) return out;
  let drawing = true;
  let left = dash;
  let start: Vec3 | null = points[0]!;
  for (let i = 0; i < points.length - 1 && out.length < maxDashes; i++) {
    let a = points[i]!;
    const b = points[i + 1]!;
    let segLen = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    while (segLen > 1e-9 && out.length < maxDashes) {
      const step = Math.min(left, segLen);
      const t = step / segLen;
      const p: Vec3 = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
      if (drawing && start && step > 1e-9) {
        out.push({ a: start, b: p });
        start = p;
      }
      segLen -= step;
      left -= step;
      a = p;
      if (left <= 1e-12) {
        drawing = !drawing;
        left = drawing ? dash : gap;
        start = drawing ? p : null;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------- FX099 trajectory

export const TRAJECTORY_MAX_CORKS = 8;
export const TRAJECTORY_MAX_POINTS = 64;
export const TRAJECTORY_MAX_BOUNCES = 12;
const MIN_STEP_M = 0.02;

export interface CorkTrack {
  readonly projectileId: string;
  /** 1 = the original cork; split corks follow in order of appearance. */
  readonly number: number;
  readonly points: Vec3[];
  /** Real contact points reported by impact events of this cork. */
  readonly reflections: Vec3[];
  live: boolean;
}

/**
 * Remembers where each cork really went, for drawing only. At most 8 corks and
 * 64 points per cork (thinned, never cut at the start). Observing the same frame
 * twice records nothing new. Not a replay: nothing here can be re-run.
 */
export class TrajectoryRecorder {
  private shotId: string | null = null;
  private readonly byId = new Map<string, CorkTrack>();
  private readonly seenEvents = new Set<string>();
  private nextNumber = 1;
  /** Corks beyond the 8th that were not recorded (drawing record only; physics is unaffected). */
  dropped = 0;

  reset(): void {
    this.shotId = null;
    this.byId.clear();
    this.seenEvents.clear();
    this.nextNumber = 1;
    this.dropped = 0;
  }

  tracks(): readonly CorkTrack[] {
    return [...this.byId.values()];
  }

  observe(frame: Pick<SimulationFrame, 'shotId' | 'projectiles' | 'events'>): void {
    const shot = frame.shotId as string | null;
    if (shot !== null && this.shotId !== null && shot !== this.shotId) this.reset();
    if (shot !== null) this.shotId = shot;
    const liveNow = new Set<string>();
    for (const pr of frame.projectiles) {
      const id = pr.projectileId as string;
      liveNow.add(id);
      let t = this.byId.get(id);
      if (!t) {
        if (this.byId.size >= TRAJECTORY_MAX_CORKS) {
          this.dropped++;
          continue;
        }
        t = { projectileId: id, number: this.nextNumber++, points: [], reflections: [], live: true };
        this.byId.set(id, t);
      }
      t.live = true;
      const last = t.points[t.points.length - 1];
      if (!last || Math.hypot(pr.position.x - last.x, pr.position.y - last.y, pr.position.z - last.z) >= MIN_STEP_M) {
        t.points.push({ x: pr.position.x, y: pr.position.y, z: pr.position.z });
        if (t.points.length > TRAJECTORY_MAX_POINTS) thin(t.points);
      }
    }
    for (const t of this.byId.values()) if (!liveNow.has(t.projectileId)) t.live = false;
    for (const ev of frame.events) this.noteEvent(ev);
  }

  private noteEvent(ev: SimEvent): void {
    if (ev.type !== 'impact') return;
    if (this.seenEvents.has(ev.eventId as string)) return;
    this.seenEvents.add(ev.eventId as string);
    const t = this.byId.get(ev.projectileId as string);
    if (!t || t.reflections.length >= TRAJECTORY_MAX_BOUNCES) return;
    t.reflections.push({ x: ev.point.x, y: ev.point.y, z: ev.point.z });
  }
}

/** Keeps both ends and every other point in between, so the whole route stays in at most 64 points. */
function thin(points: Vec3[]): void {
  const last = points[points.length - 1]!;
  const kept = points.filter((_, i) => i % 2 === 0);
  if (kept[kept.length - 1] !== last) kept.push(last);
  points.length = 0;
  points.push(...kept);
}
