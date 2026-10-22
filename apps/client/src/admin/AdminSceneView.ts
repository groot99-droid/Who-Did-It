// Round 6, Session 6D (docs/round6/auto-admin.md 8): one viewport of the god view, a Phaser scene per occupied
// world scene. It reuses `GroundView`, `StaticView` and `EntityView` (with the label) and owns no feed of its own:
// every frame it reads the admin store's latest snapshot and draws the seats of its scene.
import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { toScreen } from '@wdi/shared/iso';
import type { AdminMob } from '@wdi/shared/protocol';
import { getFlags } from '../scenes/registry';
import { applyFilters, peekManifest, queueMatchEntries, sceneMapKey, sceneMapUrl } from '../view/assets';
import { EntityView } from '../view/EntityView';
import { GroundView } from '../view/GroundView';
import { remoteDelayMs } from '../view/interpolation';
import { mapStatics } from '../view/mapDefs';
import { type SceneMap, type TiledMap, readSceneMap } from '../view/sceneMap';
import { StaticView } from '../view/StaticView';
import { type Cell, type AdminStore, labelOf } from './model';
import { diamondCentre, fitZoom, snapsOf } from './viewMath';

export interface AdminViewData {
  sceneId: string;
  cell: Cell;
  store: AdminStore;
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
/** Pick radius of a click on a seat, in world px. */
const PICK_PX = 48;

export class AdminSceneView extends Phaser.Scene {
  private data0!: AdminViewData;
  private map!: SceneMap;
  private ground: GroundView | null = null;
  private statics: StaticView | null = null;
  private entities: EntityView | null = null;
  private mobs!: Phaser.GameObjects.Graphics;
  private mobLabels: Phaser.GameObjects.Text[] = [];
  private caption: Phaser.GameObjects.Text | null = null;
  private zoom = 1;
  private lastPose = new Map<string, { x: number; y: number; yaw: number }>();
  private lastTick = -1;
  private followed: string | null = null;

  init(data: AdminViewData): void {
    this.data0 = data;
    this.lastPose = new Map();
    this.lastTick = -1;
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    const key = sceneMapKey(this.data0.sceneId);
    if (!this.cache.tilemap.exists(key))
      this.load.tilemapTiledJSON(key, sceneMapUrl(base, this.data0.sceneId));
    const manifest = peekManifest(getFlags(this).art, base);
    if (manifest)
      queueMatchEntries(this.load, this, manifest, this.data0.store.mapId || 'hollowmere', 'main');
  }

  create(): void {
    const { sceneId, cell, store } = this.data0;
    const key = sceneMapKey(sceneId);
    this.map = readSceneMap(this.cache.tilemap.get(key).data as TiledMap);
    this.ground = new GroundView(this, key, this.map);
    applyFilters(
      this.textures,
      peekManifest(getFlags(this).art, import.meta.env.BASE_URL) ?? { version: 1, art: '', entries: [] },
    );
    this.statics = new StaticView(this);
    this.statics.set(
      mapStatics(this.map, {
        mapId: this.map.mapId ?? (store.mapId || 'hollowmere'),
        theme: this.map.theme ?? '',
        hasFrame: (atlas, frame) => this.textures.exists(atlas) && this.textures.get(atlas).has(frame),
      }),
    );
    this.entities = new EntityView(
      this,
      '',
      () => undefined,
      (handle) => {
        const seat = this.store().snapshot?.seats.find((s) => s.id === handle);
        return seat ? labelOf(seat) : undefined;
      },
    );
    this.mobs = this.add.graphics().setDepth(1_000_000);
    this.caption = this.add
      .text(0, 0, sceneId, {
        fontFamily: 'Inter, sans-serif',
        fontSize: '14px',
        color: palette.colors.bone,
        stroke: palette.colors.ink,
        strokeThickness: 3,
      })
      .setDepth(1_000_001);
    this.cameras.main.setBackgroundColor(colorOf(palette.colors[this.map.voidColour]));
    this.relayout(cell);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.pick(p));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.entities?.destroy();
      this.statics?.set([]);
      this.ground?.destroy();
    });
  }

  /** Moves the viewport to `cell` and refits the zoom; the grid calls it when the count of viewports changes. */
  relayout(cell: Cell): void {
    this.data0 = { ...this.data0, cell };
    if (this.map === undefined || this.caption === null) return;
    this.zoom = fitZoom(this.map, cell);
    const cam = this.cameras.main;
    cam.setViewport(cell.x, cell.y, cell.w, cell.h).setZoom(this.zoom).setRoundPixels(true);
    const c = diamondCentre(this.map);
    cam.centerOn(c.x, c.y);
    this.caption
      .setPosition(c.x - cell.w / 2 / this.zoom + 6, c.y - cell.h / 2 / this.zoom + 4)
      .setScale(1 / this.zoom);
  }

  private store(): AdminStore {
    return this.data0.store;
  }

  /** A click selects the nearest seat of this scene. */
  private pick(p: Phaser.Input.Pointer): void {
    const w = this.cameras.main.getWorldPoint(p.x, p.y);
    const seats = this.store().snapshot?.seats.filter((s) => s.sceneId === this.data0.sceneId) ?? [];
    let best: { id: string; d: number } | null = null;
    for (const s of seats) {
      const sp = toScreen(s.x, s.y);
      const d = Math.hypot(sp.x - w.x, sp.y - w.y);
      if (d <= PICK_PX && (best === null || d < best.d)) best = { id: s.id, d };
    }
    if (best) this.store().select(best.id);
  }

  override update(): void {
    const store = this.store();
    const snap = store.snapshot;
    if (!snap || !this.entities || !this.statics) return;
    if (snap.tick !== this.lastTick) {
      this.lastTick = snap.tick;
      const seats = snap.seats.filter((s) => s.sceneId === this.data0.sceneId);
      const made = snapsOf(seats, this.lastPose);
      this.lastPose = made.poses;
      this.entities.setDelayMs(remoteDelayMs(snap.scale));
      this.entities.update(made.players, performance.now(), made.avatars, '');
      this.drawMobs((snap.mobs ?? []).filter((m) => m.sceneId === this.data0.sceneId));
    }
    const cam = this.cameras.main;
    const follow = store.followed;
    if (follow !== this.followed) {
      this.followed = follow;
      if (follow === null) {
        cam.stopFollow();
        const c = diamondCentre(this.map);
        cam.centerOn(c.x, c.y);
      }
    }
    if (follow !== null) {
      const obj = this.entities.objectOf(follow);
      if (obj) cam.startFollow(obj, true, 0.1, 0.1);
    }
    this.statics.update(null, this.game.loop.delta / 1000, cam.worldView);
  }

  private drawMobs(list: readonly AdminMob[]): void {
    this.mobs.clear();
    this.mobs.fillStyle(colorOf(palette.colors.mustard), 0.9);
    for (const t of this.mobLabels) t.destroy();
    this.mobLabels = [];
    for (const m of list) {
      const p = toScreen(m.x, m.y);
      this.mobs.fillCircle(p.x, p.y - 8, 7);
      this.mobLabels.push(
        this.add
          .text(p.x, p.y - 20, `${m.kind} ${m.state}`, {
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px',
            color: palette.colors.bone,
          })
          .setOrigin(0.5, 1)
          .setScale(1 / this.zoom)
          .setDepth(1_000_002),
      );
    }
  }
}
