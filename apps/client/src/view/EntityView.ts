import type Phaser from 'phaser';
import type { PlayerSnap } from '../net/world';
import { type PlayerLook, PlayerView, dirFromYaw } from './PlayerView';
import { REMOTE_DELAY_MS, SELF_DELAY_MS, SampleBuffer } from './interpolation';
import { StatusBit } from './animIds';
import cluesJson from '@wdi/content/data/clues.json';
import { TILE_PX } from '@wdi/shared/constants';

const BLOOD_SIGHT_PX = cluesJson.clues.blood.params.visibleTiles * TILE_PX;

interface Tracked {
  view: PlayerView;
  samples: SampleBuffer;
  look: PlayerLook;
}

/**
 * Maps the players in view to sprites. A sprite exists only while the server sends a presence for the
 * player: leaving the scene (or never being in it) means no sprite and nothing known about where they
 * are. A new sprite appears at its first sample with no slide.
 */
export class EntityView {
  private readonly tracked = new Map<string, Tracked>();
  private ghost = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly selfId: string,
  ) {}

  has(id: string): boolean {
    return this.tracked.has(id);
  }

  get count(): number {
    return this.tracked.size;
  }

  /** Draws the viewer's own sprite translucent once they are a ghost. */
  setGhost(on: boolean): void {
    this.ghost = on;
  }

  /** Feeds one snapshot taken at wall time `now` (ms) and redraws everybody. */
  update(snaps: PlayerSnap[], now: number): void {
    const present = new Set<string>();
    const selfPr = snaps.find((s) => s.id === this.selfId)?.presence ?? null;
    for (const snap of snaps) {
      const pr = snap.presence;
      if (pr === null) continue;
      present.add(snap.id);
      let t = this.tracked.get(snap.id);
      if (!t) {
        const look: PlayerLook = snap.traits;
        t = {
          view: new PlayerView(this.scene, snap.name, look, snap.id === this.selfId),
          samples: new SampleBuffer(),
          look,
        };
        this.tracked.set(snap.id, t);
      }
      const bloody = (pr.statusBits & StatusBit.bloody) !== 0;
      const near =
        snap.id === this.selfId ||
        (selfPr !== null && Math.hypot(pr.x - selfPr.x, pr.y - selfPr.y) <= BLOOD_SIGHT_PX);
      t.view.setBlood(bloody && near);
      if (snap.id === this.selfId) t.view.setGhost(this.ghost);
      t.samples.push({ t: now, x: pr.x, y: pr.y, yaw: pr.yaw, animId: pr.animId });
      const delay = snap.id === this.selfId ? SELF_DELAY_MS : REMOTE_DELAY_MS;
      const s = t.samples.at(now - delay);
      if (s) {
        t.view.setPosition(s.x, s.y);
        t.view.pose(dirFromYaw(s.yaw), s.animId, (pr.statusBits & StatusBit.transit) !== 0);
      }
    }
    for (const [id, t] of this.tracked) {
      if (present.has(id)) continue;
      t.view.destroy();
      this.tracked.delete(id);
    }
  }

  /** The drawn object of a player, for the camera to follow. */
  objectOf(id: string): Phaser.GameObjects.Container | null {
    return this.tracked.get(id)?.view.root ?? null;
  }

  destroy(): void {
    for (const t of this.tracked.values()) t.view.destroy();
    this.tracked.clear();
  }
}
