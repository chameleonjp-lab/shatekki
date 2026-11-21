import type { ProjectileId, RunId, ShotId, ShotSummary, SimulationFrame, Vec3 } from '../contracts';

interface ReplayTrack {
  readonly points: readonly Vec3[];
  readonly contacts: readonly Vec3[];
}

export interface ShotReplay {
  readonly runId: RunId;
  readonly shotId: ShotId;
  readonly shotNumber: number;
  readonly points: number;
  readonly prizeTypes: readonly string[];
  readonly tracks: readonly ReplayTrack[];
}

const MAX_TRACKS = 8;
const MAX_SAMPLES = 48;
const MAX_CONTACTS = 12;

interface Track {
  points: { position: Vec3; anchor: boolean }[];
  contacts: Vec3[];
}

function sample(track: Track, position: Vec3, anchor: boolean): void {
  const { points } = track;
  const prev = points.at(-1)?.position;
  if (prev && !anchor && Math.hypot(prev.x - position.x, prev.y - position.y, prev.z - position.z) < .08) return;
  if (points.length === MAX_SAMPLES) {
    // Thin only the travel samples. Keep the spawn, impacts and end positions.
    const i = points.findIndex((point, index) => index % 2 === 1 && !point.anchor);
    const replace = i < 0 ? points.findIndex(point => !point.anchor) : i;
    if (replace < 0) return;
    points.splice(replace, 1);
  }
  points.push({ position: { ...position }, anchor });
}

export class ShotReplayRecorder {
  private shotId: ShotId | null = null;
  private tracks = new Map<ProjectileId, Track>();
  private reflections = 0;
  private recent: ShotReplay | null = null;
  private best: ShotReplay | null = null;
  private bestSpectacle = -Infinity;

  begin(shotId: ShotId): void {
    this.shotId = shotId;
    this.tracks.clear();
    this.reflections = 0;
    this.recent = null;
  }

  clear(): void {
    this.shotId = null;
    this.tracks.clear();
    this.recent = this.best = null;
    this.bestSpectacle = -Infinity;
  }

  capture(frame: SimulationFrame): void {
    if (this.shotId === null) return;
    // The controller delivers each event once, including events from the last physics step.
    for (const event of frame.events) {
      if (event.shotId !== this.shotId) continue;
      if (event.type === 'projectileSpawned' && this.tracks.size < MAX_TRACKS && !this.tracks.has(event.projectileId)) {
        const track: Track = { points: [], contacts: [] };
        sample(track, event.position, true);
        this.tracks.set(event.projectileId, track);
      } else if (event.type === 'impact') {
        // These events are emitted for fresh contacts, the same contacts that increment reflections.
        this.reflections++;
        const track = this.tracks.get(event.projectileId);
        if (track && track.contacts.length < MAX_CONTACTS) {
          track.contacts.push({ ...event.point });
          sample(track, event.point, true);
        }
      } else if (event.type === 'projectileEnded') {
        const track = this.tracks.get(event.projectileId);
        if (track) sample(track, event.position, true);
      }
    }
    if (frame.shotId === this.shotId) {
      for (const projectile of frame.projectiles) {
        const track = this.tracks.get(projectile.projectileId);
        if (track) sample(track, projectile.position, false);
      }
    }
  }

  confirm(summary: ShotSummary): void {
    if (summary.shotId !== this.shotId) return;
    this.shotId = null;
    const tracks = Array.from(this.tracks.values()).flatMap(({ points, contacts }) =>
      points.length < 2 ? [] : [{ points: points.map(point => point.position), contacts }]);
    this.tracks.clear();
    if (tracks.length === 0) return;
    const points = summary.ledger.scoreAfter - summary.ledger.scoreBefore;
    this.recent = {
      runId: summary.runId, shotId: summary.shotId, shotNumber: summary.shotNumber, points,
      prizeTypes: summary.collected.map(prize => prize.typeId), tracks,
    };
    const spectacle = points + this.reflections * 30 + summary.chainCount * 40 + summary.newlyCompletedSets.length * 100;
    if (spectacle > this.bestSpectacle) {
      this.best = this.recent;
      this.bestSpectacle = spectacle;
    }
  }

  latest(runId: RunId, shotId: ShotId): ShotReplay | null {
    return this.recent?.runId === runId && this.recent.shotId === shotId ? this.recent : null;
  }

  highlight(runId: RunId): ShotReplay | null {
    return this.best?.runId === runId ? this.best : null;
  }
}
