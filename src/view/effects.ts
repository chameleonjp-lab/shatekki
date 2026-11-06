/**
 * Presentation effects (Task 12, owner: Visual).
 *
 * Everything here is cosmetic: it READS frames/events/summaries and writes
 * only to its own pooled meshes, the shopkeeper part meshes and prize mesh
 * scale pulses. It never touches points, collisions, HP, ammo or collection,
 * and it never mutates the objects it is given (they may be frozen).
 *
 * Performance: all particle / ring / bar meshes are created once (pools);
 * simultaneous effects are capped and the oldest is dropped; the hot paths
 * (handleEvents / update) allocate nothing per call except the scheduled
 * settle work held in a fixed ring buffer.
 *
 * The effects clock advances from the frames' simTimeSec (clamped per call),
 * so a paused game (frozen frame) freezes effects, and a page that comes back
 * from hidden never replays a burst of them.
 */
import * as THREE from 'three';
import type { BoothLayout, DeviceKind, ImpactTarget, PresentOptions, ShopkeeperPart, ShotSummary, SimEvent, Vec3 } from '../contracts';
import { classifyShot, type ShotClass } from './classify';
import { offscreenIndicator } from './offscreen';

// ------------------------------------------------------------------ public

export interface OffscreenCue {
  /** i18n key only (UI/QA translates): fx.offscreen.prize | .collect | .shopkeeper | .hidden | .device.<kind> */
  readonly key: string;
  /** Edge position in CSS px (y down) and arrow angle in radians (CSS rotate). */
  readonly x: number;
  readonly y: number;
  readonly angle: number;
}

export interface EffectsHud {
  offscreen(cue: OffscreenCue): void;
  /** Chain count banner after settlement (count >= 2). */
  chain(count: number): void;
}

export interface EffectsDeps {
  readonly layer: THREE.Group;
  readonly layout: BoothLayout;
  readonly shopkeeperParts: ReadonlyMap<string, THREE.Mesh>;
  /** The current mesh of a prize instance (for the transform pop), if it exists. */
  readonly prizeObject: (instanceId: string) => THREE.Object3D | null;
  readonly projectilePosition: (projectileId: string) => Vec3 | null;
  readonly camera?: () => THREE.Camera | null;
  readonly size?: () => { readonly width: number; readonly height: number };
  readonly hud?: EffectsHud;
  /** Called once per present(), after settlement, with the pure classification. */
  readonly onClassified?: (cls: ShotClass, summary: ShotSummary) => void;
}

export interface EffectsStats {
  readonly particlesAlive: number;
  readonly particleCapacity: number;
  readonly ringsAlive: number;
  readonly barsAlive: number;
  readonly lastPreset: string;
}

export interface Effects {
  handleEvents(events: readonly SimEvent[], simTimeSec: number): void;
  update(simTimeSec: number): void;
  present(summary: ShotSummary, options: PresentOptions): Promise<void>;
  stats(): EffectsStats;
  dispose(): void;
}

// ----------------------------------------------------------------- presets

interface Preset {
  readonly n: number;
  readonly color: number;
  readonly speed: number;
  readonly life: number;
  readonly size: number;
  readonly gravity: number;
  readonly spread: number;
}

const PRESETS: Record<string, Preset> = {
  wood: { n: 6, color: 0xc08a52, speed: 0.9, life: 0.4, size: 0.011, gravity: 3.5, spread: 1.0 },
  cloth: { n: 5, color: 0xf2e6d0, speed: 0.35, life: 0.6, size: 0.016, gravity: 0.4, spread: 1.4 },
  paper: { n: 5, color: 0xffffff, speed: 0.5, life: 0.65, size: 0.013, gravity: 0.7, spread: 1.6 },
  metal: { n: 7, color: 0xffe9a0, speed: 1.8, life: 0.25, size: 0.007, gravity: 2.0, spread: 1.2 },
  plastic: { n: 6, color: 0xff8fc8, speed: 1.0, life: 0.35, size: 0.01, gravity: 3.0, spread: 1.2 },
  glass: { n: 7, color: 0xa8f0ff, speed: 1.4, life: 0.4, size: 0.008, gravity: 2.5, spread: 1.3 },
  ceramic: { n: 6, color: 0xfffaf0, speed: 1.1, life: 0.4, size: 0.009, gravity: 4.0, spread: 1.1 },
  rubber: { n: 5, color: 0xff6f91, speed: 1.2, life: 0.45, size: 0.014, gravity: 2.0, spread: 0.9 },
  device: { n: 6, color: 0x7ae0ff, speed: 1.0, life: 0.35, size: 0.01, gravity: 1.0, spread: 1.3 },
  deviceInactive: { n: 3, color: 0x9a9a9a, speed: 0.5, life: 0.25, size: 0.008, gravity: 1.5, spread: 1.0 },
  shopkeeper: { n: 6, color: 0xff9ec0, speed: 0.8, life: 0.5, size: 0.012, gravity: 0.8, spread: 1.4 },
  hidden: { n: 8, color: 0xffd24a, speed: 1.1, life: 0.5, size: 0.011, gravity: 0.6, spread: 1.5 },
  // device activations
  split: { n: 10, color: 0xffffff, speed: 1.6, life: 0.45, size: 0.011, gravity: 0.5, spread: 1.8 },
  power: { n: 10, color: 0xff8a1e, speed: 1.4, life: 0.5, size: 0.012, gravity: 0.2, spread: 1.8 },
  transform: { n: 12, color: 0xd8a0ff, speed: 0.8, life: 0.7, size: 0.016, gravity: -0.4, spread: 1.8 },
  penalty: { n: 8, color: 0xff3b3b, speed: 0.7, life: 0.6, size: 0.011, gravity: 2.5, spread: 1.4 },
  ammo: { n: 8, color: 0xffd24a, speed: 0.9, life: 0.7, size: 0.013, gravity: -1.2, spread: 0.8 },
  bulletType: { n: 8, color: 0x7aff9e, speed: 1.0, life: 0.55, size: 0.011, gravity: 0, spread: 1.8 },
  // settle
  collect: { n: 7, color: 0xffe27a, speed: 1.2, life: 0.7, size: 0.014, gravity: -0.8, spread: 1.8 },
  setComplete: { n: 14, color: 0xfff0a0, speed: 1.8, life: 1.0, size: 0.016, gravity: -0.3, spread: 2 },
};

const RING_COLOR: Record<string, number> = {
  power: 0xff8a1e,
  transform: 0xd8a0ff,
  penalty: 0xff3b3b,
  ammo: 0xffd24a,
  bulletType: 0x7aff9e,
  split: 0xffffff,
  setComplete: 0xfff0a0,
  collect: 0xffe27a,
};

// -------------------------------------------------------------------- pools

const PARTICLE_CAP = 64;
const RING_CAP = 12;
const BAR_CAP = 4;
const SCHEDULE_CAP = 32;
const MAX_DT = 0.1;
const SETTLE_TAIL = 0.9;

interface Particle {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  alive: boolean;
  born: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  g: number;
  size: number;
}
interface Ring {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  alive: boolean;
  born: number;
  life: number;
  maxScale: number;
}
interface Bar {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.MeshBasicMaterial;
  alive: boolean;
  born: number;
  life: number;
}

interface Pulse {
  object: THREE.Object3D | null;
  born: number;
  active: boolean;
}

interface Reaction {
  active: boolean;
  born: number;
  readonly pivot: THREE.Vector3;
  readonly restPos: THREE.Vector3;
}

interface Scheduled {
  used: boolean;
  at: number;
  preset: string;
  x: number;
  y: number;
  z: number;
  ring: boolean;
}

const REACTION_LIFE: Record<ShopkeeperPart, number> = { hat: 0.9, fan: 0.9, body: 0.6, feet: 0.55 };
const OFFSCREEN_MIN_GAP = 0.6;

const tmpV = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);
const AXIS_X = new THREE.Vector3(1, 0, 0);

function presetKeyFor(t: ImpactTarget): string {
  switch (t.kind) {
    case 'prize':
    case 'surface':
      return t.material;
    case 'device':
      return t.activated ? 'device' : 'deviceInactive';
    case 'shopkeeper':
      return 'shopkeeper';
    case 'hidden':
      return 'hidden';
    case 'cell':
      return t.activated ? 'device' : 'deviceInactive';
  }
}

function offscreenKeyFor(t: ImpactTarget): string | null {
  switch (t.kind) {
    case 'prize':
      return 'fx.offscreen.prize';
    case 'device':
      return t.activated ? `fx.offscreen.device.${t.deviceKind}` : null;
    case 'shopkeeper':
      return 'fx.offscreen.shopkeeper';
    case 'hidden':
      return 'fx.offscreen.hidden';
    case 'surface':
      return null;
    // Layout v2: a cell used by an off-screen contact gets the same kind of arrow cue as a device.
    case 'cell':
      return t.activated ? 'fx.offscreen.cell' : null;
  }
}

export function createEffects(deps: EffectsDeps): Effects {
  const { layer, layout } = deps;
  const root = new THREE.Group();
  root.name = 'fx-pool';
  layer.add(root);

  const pGeo = new THREE.OctahedronGeometry(1, 0);
  const rGeo = new THREE.RingGeometry(0.82, 1, 24);
  const bGeo = new THREE.BoxGeometry(1, 0.16, 0.16);
  const mkMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, side: THREE.DoubleSide });

  const particles: Particle[] = [];
  for (let i = 0; i < PARTICLE_CAP; i++) {
    const material = mkMat();
    const mesh = new THREE.Mesh(pGeo, material);
    mesh.visible = false;
    mesh.name = 'fx-particle';
    root.add(mesh);
    particles.push({ mesh, material, alive: false, born: 0, life: 1, vx: 0, vy: 0, vz: 0, g: 0, size: 0.01 });
  }
  const rings: Ring[] = [];
  for (let i = 0; i < RING_CAP; i++) {
    const material = mkMat();
    const mesh = new THREE.Mesh(rGeo, material);
    mesh.visible = false;
    mesh.name = 'fx-ring';
    root.add(mesh);
    rings.push({ mesh, material, alive: false, born: 0, life: 1, maxScale: 0.1 });
  }
  const bars: Bar[] = [];
  for (let i = 0; i < BAR_CAP; i++) {
    const material = mkMat();
    const mesh = new THREE.Mesh(bGeo, material);
    mesh.visible = false;
    mesh.name = 'fx-bar';
    root.add(mesh);
    bars.push({ mesh, material, alive: false, born: 0, life: 1 });
  }

  const handled = new Set<string>();
  const handledOrder: string[] = [];
  const schedule: Scheduled[] = Array.from({ length: SCHEDULE_CAP }, () => ({ used: false, at: 0, preset: 'collect', x: 0, y: 0, z: 0, ring: false }));
  const pulses: Pulse[] = Array.from({ length: 6 }, () => ({ object: null, born: 0, active: false }));
  const waiters: { at: number; resolve: () => void }[] = [];
  const collectPos = new Map<string, Vec3>();

  const reactions = new Map<ShopkeeperPart, Reaction>();
  for (const g of layout.shopkeeper) {
    const mesh = deps.shopkeeperParts.get(g.part);
    const c = g.box.center;
    const h = g.box.halfExtents;
    reactions.set(g.part, {
      active: false,
      born: 0,
      pivot: new THREE.Vector3(c.x, g.part === 'fan' ? c.y : c.y - h.y, c.z),
      restPos: mesh ? mesh.position.clone() : new THREE.Vector3(),
    });
  }
  const offscreenLast = new Map<string, number>();

  let clock = 0;
  let lastSim: number | null = null;
  let seed = 0x9e3779b9;
  let lastPreset = '';
  let disposed = false;

  function rnd(): number {
    // xorshift32; view-only randomness, never feeds the simulation
    seed ^= seed << 13;
    seed >>>= 0;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    seed >>>= 0;
    return seed / 4294967296;
  }

  function takeParticle(): Particle {
    let oldest = particles[0]!;
    for (const p of particles) {
      if (!p.alive) return p;
      if (p.born < oldest.born) oldest = p;
    }
    return oldest; // drop oldest
  }
  function takeRing(): Ring {
    let oldest = rings[0]!;
    for (const r of rings) {
      if (!r.alive) return r;
      if (r.born < oldest.born) oldest = r;
    }
    return oldest;
  }

  function burst(key: string, x: number, y: number, z: number, nx: number, ny: number, nz: number, scale = 1): void {
    const pr = PRESETS[key] ?? PRESETS.wood!;
    lastPreset = key;
    for (let i = 0; i < pr.n; i++) {
      const p = takeParticle();
      p.alive = true;
      p.born = clock;
      p.life = pr.life * (0.7 + rnd() * 0.6);
      const rx = (rnd() - 0.5) * 2 * pr.spread;
      const ry = (rnd() - 0.2) * 1.6 * pr.spread;
      const rz = (rnd() - 0.5) * 2 * pr.spread;
      const sp = pr.speed * (0.5 + rnd() * 0.8) * scale;
      p.vx = (nx * 1.2 + rx) * sp;
      p.vy = (ny * 1.2 + ry) * sp;
      p.vz = (nz * 1.2 + rz) * sp;
      p.g = pr.gravity;
      p.size = pr.size * (0.8 + rnd() * 0.5);
      p.material.color.setHex(pr.color);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(p.size);
      p.mesh.visible = true;
    }
  }

  function ring(key: string, x: number, y: number, z: number, maxScale: number, life = 0.45): void {
    const r = takeRing();
    r.alive = true;
    r.born = clock;
    r.life = life;
    r.maxScale = maxScale;
    r.material.color.setHex(RING_COLOR[key] ?? 0xffffff);
    r.mesh.position.set(x, y, z);
    r.mesh.scale.setScalar(0.01);
    r.mesh.visible = true;
  }

  function cross(x: number, y: number, z: number): void {
    let i = 0;
    for (const b of bars) {
      if (i >= 2) break;
      b.alive = true;
      b.born = clock;
      b.life = 0.9;
      b.material.color.setHex(0xff3b3b);
      b.mesh.position.set(x, y, z + 0.03);
      b.mesh.rotation.set(0, 0, i === 0 ? Math.PI / 4 : -Math.PI / 4);
      b.mesh.scale.setScalar(0.01);
      b.mesh.visible = true;
      i++;
    }
  }

  function addSchedule(at: number, preset: string, x: number, y: number, z: number, ringToo: boolean): void {
    let slot = schedule.find((s) => !s.used);
    if (!slot) slot = schedule.reduce((a, b) => (a.at <= b.at ? a : b));
    slot.used = true;
    slot.at = at;
    slot.preset = preset;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.ring = ringToo;
  }

  function pulse(obj: THREE.Object3D): void {
    const slot = pulses.find((p) => !p.active || p.object === obj) ?? pulses[0]!;
    slot.object = obj;
    slot.born = clock;
    slot.active = true;
  }

  function offscreen(key: string, p: Vec3): void {
    const hud = deps.hud;
    const camera = deps.camera?.();
    const size = deps.size?.();
    if (!hud || !camera || !size) return;
    const last = offscreenLast.get(key);
    if (last !== undefined && clock - last < OFFSCREEN_MIN_GAP && clock >= last) return;
    const ind = offscreenIndicator(camera, p, size.width, size.height);
    if (!ind) return;
    offscreenLast.set(key, clock);
    hud.offscreen({ key, x: ind.x, y: ind.y, angle: ind.angle });
  }

  function react(part: ShopkeeperPart): void {
    const r = reactions.get(part);
    if (!r) return;
    r.active = true;
    r.born = clock;
  }

  function deviceCenter(deviceId: string): Vec3 | null {
    for (const d of layout.devices) if (d.deviceId === deviceId) return d.box.center;
    return null;
  }

  function handleEvent(ev: SimEvent): void {
    if (handled.has(ev.eventId)) return;
    handled.add(ev.eventId);
    handledOrder.push(ev.eventId);
    if (handledOrder.length > 512) handled.delete(handledOrder.shift() as string);

    switch (ev.type) {
      case 'impact': {
        const t = ev.target;
        const speedScale = Math.min(1.4, 0.6 + ev.speed / 14);
        burst(presetKeyFor(t), ev.point.x, ev.point.y, ev.point.z, ev.normal.x, ev.normal.y, ev.normal.z, speedScale);
        if (t.kind === 'shopkeeper') react(t.part);
        const key = offscreenKeyFor(t);
        if (key) offscreen(key, ev.point);
        break;
      }
      case 'prizeContact':
        burst('plastic', ev.point.x, ev.point.y, ev.point.z, 0, 1, 0, Math.min(1, 0.4 + ev.impulse * 0.1));
        break;
      case 'deviceActivated': {
        const c = deviceCenter(ev.deviceId) ?? { x: 0, y: 1.2, z: -2 };
        const k: DeviceKind = ev.deviceKind;
        const faceN = layout.devices.find((d) => d.deviceId === ev.deviceId)?.faceNormal ?? { x: 0, y: 0, z: 1 };
        switch (k) {
          case 'split':
            burst('split', c.x, c.y, c.z, faceN.x, faceN.y, faceN.z);
            ring('split', c.x, c.y, c.z, 0.16);
            break;
          case 'power': {
            const cork = deps.projectilePosition(ev.projectileId) ?? c;
            burst('power', cork.x, cork.y, cork.z, 0, 0, 0);
            ring('power', cork.x, cork.y, cork.z, 0.14, 0.5);
            ring('power', c.x, c.y, c.z, 0.2, 0.5);
            break;
          }
          case 'transform':
            burst('transform', c.x, c.y, c.z, faceN.x, faceN.y, faceN.z);
            ring('transform', c.x, c.y, c.z, 0.22, 0.6);
            break;
          case 'penalty':
            burst('penalty', c.x, c.y, c.z, faceN.x, faceN.y, faceN.z);
            cross(c.x, c.y, c.z);
            break;
          case 'ammo':
            burst('ammo', c.x, c.y, c.z, faceN.x, 1, faceN.z);
            ring('ammo', c.x, c.y, c.z, 0.16);
            break;
          case 'bulletType':
            burst('bulletType', c.x, c.y, c.z, faceN.x, faceN.y, faceN.z);
            ring('bulletType', c.x, c.y, c.z, 0.12, 0.4);
            ring('bulletType', c.x, c.y, c.z, 0.2, 0.55);
            break;
        }
        lastPreset = k;
        offscreen(`fx.offscreen.device.${k}`, c);
        break;
      }
      case 'prizeTransformed': {
        const o = deps.prizeObject(ev.instanceId);
        if (o) {
          pulse(o);
          burst('transform', o.position.x, o.position.y, o.position.z, 0, 1, 0);
          lastPreset = 'transform';
        }
        break;
      }
      case 'prizeReachedCollection': {
        const o = deps.prizeObject(ev.instanceId);
        if (o) {
          collectPos.set(ev.instanceId, { x: o.position.x, y: o.position.y, z: o.position.z });
          if (collectPos.size > 64) collectPos.delete(collectPos.keys().next().value as string);
          offscreen('fx.offscreen.collect', o.position);
        }
        break;
      }
      case 'projectileSpawned':
      case 'projectileEnded':
      case 'prizeDamaged':
      case 'shotStage':
        break;
    }
  }

  function updateReactions(): void {
    for (const [part, r] of reactions) {
      const mesh = deps.shopkeeperParts.get(part);
      if (!mesh || !r.active) continue;
      const age = clock - r.born;
      const life = REACTION_LIFE[part];
      if (age >= life) {
        r.active = false;
        mesh.position.copy(r.restPos);
        mesh.quaternion.identity();
        continue;
      }
      const u = age / life;
      const decay = (1 - u) * (1 - u);
      let angle = 0;
      let axis = AXIS_Y;
      let dx = 0;
      let dy = 0;
      switch (part) {
        case 'hat':
          dy = 0.16 * Math.sin(Math.PI * Math.min(1, u * 1.2)) * (1 - u * 0.3);
          angle = Math.sin(u * 18) * 0.35 * decay;
          axis = AXIS_Y;
          break;
        case 'fan':
          angle = Math.sin(u * 30) * 0.8 * decay;
          axis = AXIS_Y;
          dy = 0.01 * Math.sin(u * 20) * decay;
          break;
        case 'body':
          angle = Math.sin(u * 14) * 0.12 * decay;
          axis = AXIS_Z;
          dx = Math.sin(u * 14) * 0.012 * decay;
          break;
        case 'feet':
          dy = Math.abs(Math.sin(u * 3 * Math.PI)) * 0.05 * (1 - u);
          angle = Math.sin(u * 16) * 0.05 * decay;
          axis = AXIS_X;
          break;
      }
      tmpQ.setFromAxisAngle(axis, angle);
      mesh.quaternion.copy(tmpQ);
      // rotate about the part's pivot: position = pivot - R * pivot (+ offsets)
      tmpV.copy(r.pivot).applyQuaternion(tmpQ);
      mesh.position.set(r.restPos.x + r.pivot.x - tmpV.x + dx, r.restPos.y + r.pivot.y - tmpV.y + dy, r.restPos.z + r.pivot.z - tmpV.z);
    }
  }

  function updatePulses(): void {
    for (const p of pulses) {
      if (!p.active || !p.object) continue;
      const age = clock - p.born;
      if (age >= 0.45) {
        p.object.scale.setScalar(1);
        p.active = false;
        p.object = null;
        continue;
      }
      const u = age / 0.45;
      p.object.scale.setScalar(1 + 0.35 * Math.sin(Math.PI * u) * (1 - 0.3 * u));
    }
  }

  function update(simTimeSec: number): void {
    if (disposed) return;
    if (lastSim === null) lastSim = simTimeSec;
    const dt = Math.max(0, Math.min(MAX_DT, simTimeSec - lastSim));
    lastSim = simTimeSec;
    clock += dt;

    for (const s of schedule) {
      if (!s.used || s.at > clock) continue;
      s.used = false;
      burst(s.preset, s.x, s.y, s.z, 0, 1, 0);
      if (s.ring) ring(s.preset, s.x, s.y, s.z, 0.24, 0.6);
    }
    for (const p of particles) {
      if (!p.alive) continue;
      const age = clock - p.born;
      if (age >= p.life) {
        p.alive = false;
        p.mesh.visible = false;
        continue;
      }
      const u = age / p.life;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= p.g * dt;
      p.mesh.scale.setScalar(p.size * (1 - u * 0.6));
      p.material.opacity = 1 - u * u;
    }
    for (const r of rings) {
      if (!r.alive) continue;
      const age = clock - r.born;
      if (age >= r.life) {
        r.alive = false;
        r.mesh.visible = false;
        continue;
      }
      const u = age / r.life;
      r.mesh.scale.setScalar(Math.max(0.01, r.maxScale * Math.sqrt(u)));
      r.material.opacity = 1 - u;
    }
    for (const b of bars) {
      if (!b.alive) continue;
      const age = clock - b.born;
      if (age >= b.life) {
        b.alive = false;
        b.mesh.visible = false;
        continue;
      }
      const u = age / b.life;
      b.mesh.scale.setScalar(0.14 * Math.min(1, u * 6));
      b.material.opacity = u > 0.6 ? 1 - (u - 0.6) / 0.4 : 1;
    }
    updateReactions();
    updatePulses();
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i]!;
      if (w.at <= clock) {
        waiters.splice(i, 1);
        w.resolve();
      }
    }
  }

  function present(summary: ShotSummary, options: PresentOptions): Promise<void> {
    if (disposed) return Promise.resolve();
    // Classified here, after settlement, from the confirmed summary only (AC27).
    deps.onClassified?.(classifyShot(summary), summary);
    if (options.skip) return Promise.resolve();
    let end = clock;
    const n = Math.min(summary.collected.length, 8);
    for (let i = 0; i < n; i++) {
      const c = summary.collected[i]!;
      const p = collectPos.get(c.instanceId) ?? { x: (i - (n - 1) / 2) * 0.2, y: layout.collectBelowY + 0.1, z: -1.5 };
      const at = clock + i * 0.12;
      addSchedule(at, 'collect', p.x, Math.max(p.y, layout.collectBelowY), p.z, false);
      end = Math.max(end, at);
    }
    if (summary.newlyCompletedSets.length > 0) {
      const at = clock + n * 0.12 + 0.1;
      addSchedule(at, 'setComplete', 0, 1.3, -1.6, true);
      end = Math.max(end, at);
    }
    if (summary.chainCount >= 2) deps.hud?.chain(summary.chainCount);
    const resolveAt = end + SETTLE_TAIL;
    return new Promise<void>((resolve) => {
      waiters.push({ at: resolveAt, resolve });
    });
  }

  return {
    handleEvents(events, simTimeSec) {
      if (disposed) return;
      if (lastSim === null) lastSim = simTimeSec;
      for (const ev of events) handleEvent(ev);
    },
    update,
    present,
    stats() {
      let pa = 0;
      let ra = 0;
      let ba = 0;
      for (const p of particles) if (p.alive) pa++;
      for (const r of rings) if (r.alive) ra++;
      for (const b of bars) if (b.alive) ba++;
      return { particlesAlive: pa, particleCapacity: PARTICLE_CAP, ringsAlive: ra, barsAlive: ba, lastPreset };
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const w of waiters) w.resolve();
      waiters.length = 0;
      layer.remove(root);
      pGeo.dispose();
      rGeo.dispose();
      bGeo.dispose();
      for (const p of particles) p.material.dispose();
      for (const r of rings) r.material.dispose();
      for (const b of bars) b.material.dispose();
    },
  };
}
