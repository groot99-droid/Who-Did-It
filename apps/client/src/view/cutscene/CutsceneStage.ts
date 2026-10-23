import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { getFlags } from '../../scenes/registry';
import { GroundView } from '../GroundView';
import { StaticView } from '../StaticView';
import { applyFilters, peekManifest, sceneMapKey, sceneMapUrl } from '../assets';
import { isoZoom } from '../iso';
import { mapStatics } from '../mapDefs';
import { type TiledMap, readSceneMap } from '../sceneMap';
import type { Stage } from './staging';

/**
 * The stage for shots in other scenes (round 7, 7A; `staging.ts`): a Phaser scene launched over the World for the
 * length of a cutscene, which builds one scene's ground and statics the way the World does (`readSceneMap`,
 * `GroundView`, `mapStatics`) on an opaque camera and disposes them when the shot moves on. It owns no game state and
 * reads no feed: a staged room is the room as the map draws it, with nobody in it. The textures are the match's,
 * already loaded by the World's preload; a missing frame draws its greybox as in the World.
 */
export const STAGE_KEY = 'CutsceneStage';

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
const STAGES = new WeakMap<Phaser.Game, CutsceneStage>();

export class CutsceneStage extends Phaser.Scene implements Stage {
  private ground: GroundView | null = null;
  private statics: StaticView | null = null;
  private shown: string | null = null;
  /** Maps asked for before the stage started; its own `preload` loads them. */
  private pending: string[] = [];
  private hostKey = '';
  private owner: Phaser.Game | null = null;

  constructor() {
    super(STAGE_KEY);
  }

  /**
   * Launches the stage over `host` and returns it. One instance per game, added the first time: the scene manager may
   * defer an add made while it processes its queue (a World's `create`), so the instance is ours, not looked up.
   */
  static open(host: Phaser.Scene): CutsceneStage {
    let stage = STAGES.get(host.game);
    if (stage === undefined) {
      stage = new CutsceneStage();
      STAGES.set(host.game, stage);
      host.scene.add(STAGE_KEY, stage, false);
    }
    stage.owner = host.game;
    host.scene.launch(STAGE_KEY, { host: host.scene.key });
    host.scene.bringToTop(STAGE_KEY);
    return stage;
  }

  init(data: { host?: string }): void {
    this.hostKey = data.host ?? '';
  }

  preload(): void {
    this.queue(this.pending);
    this.pending = [];
  }

  create(): void {
    this.cameras.main.setVisible(false);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.drop());
  }

  /** A meeting sleeps the World under a playing opening: the stage hides with it. */
  override update(): void {
    const awake = this.hostKey === '' || this.scene.isActive(this.hostKey);
    this.cameras.main.setVisible(this.shown !== null && awake);
  }

  /** The stage's camera: the player poses it as it poses the World's. */
  get camera(): Phaser.Cameras.Scene2D.Camera {
    return this.cameras.main;
  }

  prepare(sceneIds: readonly string[]): void {
    if (!this.sys.isActive()) {
      this.pending.push(...sceneIds);
      return;
    }
    if (this.queue(sceneIds) && !this.load.isLoading()) this.load.start();
  }

  /** Queues the maps not yet in the cache; true when any was queued. */
  private queue(sceneIds: readonly string[]): boolean {
    const base = import.meta.env.BASE_URL;
    let queued = false;
    for (const id of sceneIds) {
      const key = sceneMapKey(id);
      if (this.cache.tilemap.exists(key)) continue;
      this.load.tilemapTiledJSON(key, sceneMapUrl(base, id));
      queued = true;
    }
    return queued;
  }

  show(sceneId: string): boolean {
    if (this.shown === sceneId) return true;
    const key = sceneMapKey(sceneId);
    if (!this.sys.isActive() || !this.cache.tilemap.exists(key)) return false;
    this.drop();
    const map = readSceneMap(this.cache.tilemap.get(key).data as TiledMap);
    this.ground = new GroundView(this, key, map);
    this.statics = new StaticView(this);
    this.statics.set(
      mapStatics(map, {
        mapId: map.mapId ?? '',
        theme: map.theme ?? '',
        hasFrame: (atlas, frame) => this.textures.exists(atlas) && this.textures.get(atlas).has(frame),
      }),
    );
    applyFilters(
      this.textures,
      peekManifest(getFlags(this).art, import.meta.env.BASE_URL) ?? { version: 1, art: '', entries: [] },
    );
    const cam = this.cameras.main;
    cam.setSize(this.scale.width, this.scale.height);
    cam.setZoom(isoZoom(this.scale.height));
    cam.setBackgroundColor(colorOf(palette.colors[map.voidColour]));
    cam.setVisible(true);
    this.shown = sceneId;
    return true;
  }

  hide(): void {
    this.drop();
    if (this.sys.isActive()) this.cameras.main.setVisible(false);
  }

  dispose(): void {
    this.hide();
    // Stopped through the manager, so a stage still starting is stopped too.
    this.owner?.scene.stop(STAGE_KEY);
  }

  private drop(): void {
    this.statics?.destroy();
    this.ground?.destroy();
    this.statics = null;
    this.ground = null;
    this.shown = null;
    (this.cameras as Phaser.Cameras.Scene2D.CameraManager | undefined)?.main?.resetFX();
  }
}
