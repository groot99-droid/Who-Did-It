import Phaser from 'phaser';
import balance from '@wdi/content/data/balance.json';
import palette from '@wdi/content/data/palette.json';
import { TILE_PX } from '@wdi/shared/constants';
import { InputController } from '../input/InputController';
import { TouchControls } from '../input/TouchControls';
import { REG_ROLE_CHIP, REG_WORLD, type NoisePulse, type SceneEnter, type WorldFeed } from '../net/world';
import { overlayRoot } from '../ui/dom';
import { EntityView } from '../view/EntityView';
import { Hud, type HudChip } from '../view/Hud';
import { sceneMapKey, sceneMapUrl } from '../view/assets';
import { isTouchDevice, readDevFlags } from '../view/devFlags';
import { getNet } from './registry';

/** How close a player must stand to a door to use it, in tiles (balance.json `doors.reachTiles`, GDD 3.7). */
const PORTAL_REACH_TILES = balance.doors.reachTiles;
/** The World scene shows about this many tiles top to bottom whatever the window size. */
const VIEW_TILES_HIGH = 11;
const REG_INPUT = 'worldInput';

interface PortalSpot {
  id: string;
  x: number;
  y: number;
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/**
 * The village and its interiors. Restarted by the router for every `sceneEnter`, so each run knows one
 * scene: it loads that scene's tilemap, draws the players the server says are in view and nobody else.
 */
export class World extends Phaser.Scene {
  private feed!: WorldFeed;
  private sceneId = 'overworld';
  private entities!: EntityView;
  private hud!: Hud;
  private touch: TouchControls | null = null;
  private portals: PortalSpot[] = [];
  private swing!: Phaser.GameObjects.Graphics;
  private prompt!: Phaser.GameObjects.Text;
  private mapW = 0;
  private mapH = 0;
  private followed = false;
  private fpsAt = 0;
  private offs: Array<() => void> = [];
  private nearest: PortalSpot | null = null;

  constructor() {
    super('World');
  }

  init(data: SceneEnter): void {
    this.sceneId = data.sceneId;
    this.followed = false;
    this.offs = [];
  }

  preload(): void {
    const key = sceneMapKey(this.sceneId);
    if (!this.cache.tilemap.exists(key)) {
      this.load.tilemapTiledJSON(key, sceneMapUrl(import.meta.env.BASE_URL, this.sceneId));
    }
  }

  create(): void {
    const feed = this.registry.get(REG_WORLD) as WorldFeed | undefined;
    if (!feed) throw new Error('World started without a feed');
    this.feed = feed;
    const flags = readDevFlags(location.search);

    this.buildMap();
    this.swing = this.add.graphics().setDepth(1);
    this.prompt = this.add
      .text(0, 0, '', {
        fontFamily: 'Oswald, sans-serif',
        fontSize: '18px',
        color: palette.colors.bone,
        stroke: palette.colors.ink,
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(1_000_000);
    this.entities = new EntityView(this, feed.selfId);

    this.hud = new Hud(overlayRoot());
    this.hud.setChip((this.registry.get(REG_ROLE_CHIP) as HudChip | undefined) ?? null);
    this.hud.say(`Hollowmere: ${this.sceneId}`, 1500);

    const input: InputController = this.registry.get(REG_INPUT) ?? new InputController(feed);
    if (!this.registry.has(REG_INPUT)) {
      this.registry.set(REG_INPUT, input);
      input.start();
    }
    input.onUse(() => this.use());
    if (flags.touch || isTouchDevice()) {
      this.touch = new TouchControls(overlayRoot(), () => this.use());
      input.attachTouch(this.touch);
    }

    const onNoise = (n: NoisePulse) => this.ring(n);
    const onError = (e: { msg: string }) => this.hud.say(e.msg);
    feed.bus.on('noise', onNoise);
    feed.bus.on('error', onError);
    getNet(this).bus.on('error', onError as never);
    this.offs.push(
      () => feed.bus.off('noise', onNoise),
      () => feed.bus.off('error', onError),
    );
    this.offs.push(() => getNet(this).bus.off('error', onError as never));

    // Fill the window while in the world (phones rotate), and fit the camera on every resize.
    this.prevScaleMode = this.scale.scaleMode;
    const host = document.getElementById('game');
    host?.classList.add('wdi-fill');
    this.scale.displaySize.setAspectMode(Phaser.Scale.NONE);
    this.scale.scaleMode = Phaser.Scale.RESIZE;
    this.scale.getParentBounds();
    this.scale.refresh();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
    this.fitCamera();
    this.cameras.main.fadeIn(balance.doors.sceneFadeS * 1000);

    if (flags.navDebug) this.drawNavDebug();
    this.showFps = flags.fps;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.scale.scaleMode = this.prevScaleMode;
      this.scale.displaySize.setAspectMode(this.prevScaleMode);
      host?.classList.remove('wdi-fill');
      this.scale.getParentBounds();
      this.scale.refresh();
      this.offs.forEach((off) => off());
      this.entities.destroy();
      this.hud.destroy();
      this.touch?.destroy();
      this.touch = null;
    });
  }

  private showFps = false;
  private prevScaleMode: number = Phaser.Scale.FIT;

  override update(): void {
    const now = performance.now();
    this.entities.update(this.feed.snapshot(), now);
    const self = this.entities.objectOf(this.feed.selfId);
    if (self && !this.followed) {
      this.followed = true;
      this.cameras.main.startFollow(self, true, 0.1, 0.1);
      this.cameras.main.centerOn(self.x, self.y);
    }
    const clock = this.feed.clock();
    this.hud.setTimer(clock.phaseEndsTick > 0 ? clock.phaseEndsTick - clock.tick : null);
    this.drawDoors(clock.tick);
    this.updatePrompt(self);
    if (this.showFps && now - this.fpsAt > 500) {
      this.fpsAt = now;
      const loop = this.game.loop;
      this.hud.setFps(`${Math.round(loop.actualFps)} fps\n${this.entities.count} in view\n${this.sceneId}`);
    }
  }

  private buildMap(): void {
    const key = sceneMapKey(this.sceneId);
    const map = this.make.tilemap({ key });
    this.mapW = map.widthInPixels;
    this.mapH = map.heightInPixels;
    const data = this.cache.tilemap.get(key).data as { tilesets: Array<{ name: string }> };
    const sets = data.tilesets
      .map((t) => map.addTilesetImage(t.name, t.name, TILE_PX, TILE_PX))
      .filter((t): t is Phaser.Tilemaps.Tileset => t !== null);
    map.createLayer('ground', sets, 0, 0)?.setDepth(0);
    this.portals = (map.getObjectLayer('portals')?.objects ?? []).map((o) => ({
      id: o.name,
      x: (o.x ?? 0) + TILE_PX / 2,
      y: (o.y ?? 0) + TILE_PX / 2,
    }));
  }

  /** Camera zoom keeps ~11 tiles on screen high; bounds centre a scene smaller than the view. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    cam.setSize(width, height);
    const zoom = Phaser.Math.Clamp(height / (VIEW_TILES_HIGH * TILE_PX), 0.3, 2);
    cam.setZoom(zoom);
    const viewW = width / zoom;
    const viewH = height / zoom;
    const padX = Math.max(0, (viewW - this.mapW) / 2);
    const padY = Math.max(0, (viewH - this.mapH) / 2);
    cam.setBounds(-padX, -padY, this.mapW + padX * 2, this.mapH + padY * 2);
  }

  private use(): void {
    if (this.nearest) this.feed.enterPortal(this.nearest.id);
    else this.hud.say('Nothing to use here');
  }

  private updatePrompt(self: Phaser.GameObjects.Container | null): void {
    this.nearest = null;
    if (!self) {
      this.prompt.setVisible(false);
      return;
    }
    let best = Infinity;
    for (const p of this.portals) {
      const d = Math.hypot(self.x - p.x, self.y - p.y);
      if (d <= PORTAL_REACH_TILES * TILE_PX && d < best) {
        best = d;
        this.nearest = p;
      }
    }
    const near = this.nearest;
    if (!near) {
      this.prompt.setVisible(false);
      return;
    }
    const boarded = this.feed.doors().find((d) => d.id === near.id)?.state === 1;
    this.prompt
      .setText(boarded ? 'Boarded up' : 'E  Enter')
      .setPosition(near.x, near.y - TILE_PX * 0.6)
      .setVisible(true);
  }

  /** A door swings for 3 s (GDD 3.7): pulse its tile while the server says it is swinging. */
  private drawDoors(tick: number): void {
    this.swing.clear();
    for (const d of this.feed.doors()) {
      if (tick >= d.swingUntilTick) continue;
      const p = this.portals.find((q) => q.id === d.id);
      if (!p) continue;
      const pulse = 0.35 + 0.25 * Math.sin(this.time.now / 120);
      this.swing.fillStyle(colorOf(palette.colors.lantern), pulse);
      this.swing.fillRect(p.x - TILE_PX / 2, p.y - TILE_PX / 2, TILE_PX, TILE_PX);
    }
  }

  /** A noise pulse as an expanding ring at its source, until the screen-edge arrows of M5. */
  private ring(n: NoisePulse): void {
    if (n.sceneId !== this.sceneId) return;
    const g = this.add.circle(n.x, n.y, 8).setStrokeStyle(4, colorOf(palette.colors.lantern)).setDepth(1);
    this.tweens.add({ targets: g, scale: 8, alpha: 0, duration: 700, onComplete: () => g.destroy() });
    this.hud.say(n.kind === 'doorMuffled' ? 'A door, muffled' : 'A door creaks');
  }

  /** ?navdebug=1: outline every solid tile from the tilemap's ground layer for collision debugging. */
  private drawNavDebug(): void {
    const g = this.add.graphics().setDepth(999_999);
    g.lineStyle(1, colorOf(palette.colors.magenta), 0.6);
    g.strokeRect(0, 0, this.mapW, this.mapH);
  }
}
