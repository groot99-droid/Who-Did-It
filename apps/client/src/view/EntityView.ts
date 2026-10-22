import type Phaser from 'phaser';
import { REG_WORLD, type AvatarSnap, type PlayerSnap, type WorldFeed } from '../net/world';
import { type PlayerLook, PlayerView, dirFromYaw } from './PlayerView';
import { REMOTE_DELAY_MS, SELF_DELAY_MS, SampleBuffer } from './interpolation';
import { StatusBit } from './animIds';
import cluesJson from '@wdi/content/data/clues.json';
import { TILE_PX } from '@wdi/shared/constants';

const BLOOD_SIGHT_PX = cluesJson.clues.blood.params.visibleTiles * TILE_PX;
/** The mask glyph on a ghost's nameplate over a borrowed face (GDD 3.17). */
export const MASK_GLYPH = '\u{1F3AD}';

/** What the view reads of the feed besides the roster; the World's registry feed provides it. */
export type AvatarSource = Pick<WorldFeed, 'avatars' | 'selfHandle'> & Partial<Pick<WorldFeed, 'bus'>>;

interface Tracked {
  view: PlayerView;
  samples: SampleBuffer;
  /** What the sprite was built from: a change rebuilds it (a new handle always does). */
  key: string;
}

/**
 * Maps the figures of the scene to sprites (GDD 3.17). Every other seat is an avatar under an opaque handle: its
 * sprite is keyed by that handle and drawn as the roster row of `lookOf` (name, scarf, hat glyph) at the avatar's
 * own height, never from the walker's own row. A new handle is a new sprite at its first sample with no slide. The
 * own sprite comes from the own presence, with the face and height of the own avatar (so a disguised Killer sees
 * the borrowed face). A ghost viewer's nameplate shows the true seat, with a mask when it differs from `lookOf`.
 */
export class EntityView {
  private readonly tracked = new Map<string, Tracked>();
  private ghost = false;
  /** How far in the past other figures are drawn; the admin views shrink it with the sim speed (`remoteDelayMs`). */
  private delayMs = REMOTE_DELAY_MS;
  private readonly off: Array<() => void> = [];

  /**
   * `source` serves `avatars()` and `selfHandle()`; by default the World's feed from the Phaser registry, so the
   * scene's `update(snapshot, now)` call stays as it is.
   */
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly selfId: string,
    private readonly source: () => AvatarSource | undefined = () =>
      scene.registry?.get(REG_WORLD) as WorldFeed | undefined,
    /** Round 6 (6D): the admin views replace a figure's nameplate text; undefined keeps the roster name. */
    private readonly label?: (handle: string) => string | undefined,
  ) {
    const bus = source()?.bus;
    if (bus) {
      const onVfx = (m: { sceneId: string; x: number; y: number }) => this.playVfx(m.x, m.y);
      bus.on('vfx', onVfx);
      this.off.push(() => bus.off('vfx', onVfx));
    }
  }

  /** True while a sprite exists for a handle (or the own seat id). */
  has(id: string): boolean {
    return this.tracked.has(id);
  }

  get count(): number {
    return this.tracked.size;
  }

  /** Draws the viewer's own sprite translucent once they are a ghost, and shows true names over borrowed faces. */
  setGhost(on: boolean): void {
    this.ghost = on;
  }

  /** Sets the interpolation delay of other figures in ms. */
  setDelayMs(ms: number): void {
    this.delayMs = ms;
  }

  /** The puff of a disguise a strike dropped (`vfx_disguise`, or a plain ring until the art exists). */
  playVfx(x: number, y: number): void {
    const scene = this.scene;
    if (scene.textures?.exists('vfx_disguise')) {
      const puff = scene.add.sprite(x, y, 'vfx_disguise').setDepth(y + 1);
      scene.time.delayedCall(700, () => puff.destroy());
      return;
    }
    const ring = scene.add.ellipse(x, y - 30, 20, 20, 0xf2efe6, 0.6).setDepth(y + 1);
    scene.tweens.add({ targets: ring, scale: 4, alpha: 0, duration: 500, onComplete: () => ring.destroy() });
  }

  /**
   * Feeds one snapshot taken at wall time `now` (ms) and redraws everybody. `avatars` and `selfHandle` default to
   * the feed's own.
   */
  update(snaps: PlayerSnap[], now: number, avatars?: AvatarSnap[], selfHandle?: string): void {
    const src = this.source();
    const list = avatars ?? src?.avatars() ?? [];
    const own = selfHandle ?? src?.selfHandle() ?? '';
    const roster = new Map(snaps.map((s) => [s.id, s]));
    const selfSnap = roster.get(this.selfId);
    const selfPr = selfSnap?.presence ?? null;
    const present = new Set<string>();

    // The own sprite: the own presence, in the face and at the height of the own avatar.
    if (selfSnap && selfPr) {
      const mine = list.find((a) => a.handle === own);
      const face = (mine && roster.get(mine.lookOf)) ?? selfSnap;
      const look = {
        height: mine?.height ?? selfSnap.traits.height,
        scarf: face.traits.scarf,
        hat: face.traits.hat,
        ...(face.look ? { lookId: face.look } : {}),
      };
      present.add(this.selfId);
      const t = this.ensure(this.selfId, `${face.id}:${face.look}:${look.height}`, face.name, look, true);
      t.view.setBlood((selfPr.statusBits & StatusBit.bloody) !== 0);
      t.view.setGhost(this.ghost);
      this.pose(t, selfPr, now, SELF_DELAY_MS);
    }

    for (const a of list) {
      if (a.handle === own) continue;
      const shown = roster.get(a.lookOf);
      if (!shown) continue;
      present.add(a.handle);
      const true_ = this.ghost && a.seat !== undefined ? roster.get(a.seat) : undefined;
      const masked = true_ !== undefined && a.seat !== a.lookOf;
      const name =
        this.label?.(a.handle) ?? (true_ ? `${masked ? `${MASK_GLYPH} ` : ''}${true_.name}` : shown.name);
      const look = {
        height: a.height,
        scarf: shown.traits.scarf,
        hat: shown.traits.hat,
        ...(shown.look ? { lookId: shown.look } : {}),
      };
      const t = this.ensure(a.handle, `${a.lookOf}:${shown.look}:${a.height}:${name}`, name, look, false);
      const bloody = (a.statusBits & StatusBit.bloody) !== 0;
      const near = selfPr !== null && Math.hypot(a.x - selfPr.x, a.y - selfPr.y) <= BLOOD_SIGHT_PX;
      t.view.setBlood(bloody && near);
      t.view.setGhost((a.statusBits & StatusBit.ghost) !== 0);
      this.pose(t, a, now, this.delayMs);
    }

    for (const [id, t] of this.tracked) {
      if (present.has(id)) continue;
      t.view.destroy();
      this.tracked.delete(id);
    }
  }

  /** The drawn object of the own seat (by seat id) or of an avatar (by handle), for the camera to follow. */
  objectOf(id: string): Phaser.GameObjects.Container | null {
    return this.tracked.get(id)?.view.root ?? null;
  }

  destroy(): void {
    for (const off of this.off) off();
    this.off.length = 0;
    for (const t of this.tracked.values()) t.view.destroy();
    this.tracked.clear();
  }

  /** The sprite under `id`, rebuilt when what it shows changed. */
  private ensure(id: string, key: string, name: string, look: PlayerLook, isSelf: boolean): Tracked {
    let t = this.tracked.get(id);
    if (t && t.key !== key) {
      t.view.destroy();
      t = undefined;
    }
    if (!t) {
      t = { view: new PlayerView(this.scene, name, look, isSelf), samples: new SampleBuffer(), key };
      this.tracked.set(id, t);
    }
    return t;
  }

  private pose(
    t: Tracked,
    p: { x: number; y: number; yaw: number; animId: number; statusBits: number },
    now: number,
    delay: number,
  ): void {
    t.samples.push({ t: now, x: p.x, y: p.y, yaw: p.yaw, animId: p.animId });
    const s = t.samples.at(now - delay);
    if (s) {
      t.view.setPosition(s.x, s.y);
      t.view.pose(dirFromYaw(s.yaw), s.animId, (p.statusBits & StatusBit.transit) !== 0);
    }
  }
}
