import Phaser from 'phaser';
import abilitiesJson from '@wdi/content/data/abilities.json';
import balance from '@wdi/content/data/balance.json';
import palette from '@wdi/content/data/palette.json';
import { Phase } from '@wdi/shared';
import type { DeathCause, ErrorPayload } from '@wdi/shared/protocol';
import { TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { dirFromVector } from '@wdi/shared/direction';
import { toScreen, toWorld } from '@wdi/shared/iso';
import { InputController } from '../input/InputController';
import { TouchControls } from '../input/TouchControls';
import {
  REG_INPUT,
  REG_ROLE_CHIP,
  REG_WORLD,
  type BodySnap,
  type ClueSnap,
  type NoisePulse,
  type SceneEnter,
  type WorldFeed,
} from '../net/world';
import { LOOKS_COPY, WORLD_COPY as C, fill } from '../ui/copy';
import { RefusalHints } from '../ui/copy/refusalHint';
import { NOTHING_HAPPENS, interactionFails, isNfy, refusalText } from '../ui/copy/refusals';
import { overlayRoot } from '../ui/dom';
import { bodyMotion, refusedIn } from '../ui/theme/motion';
import { mountSeatPicker } from '../ui/SeatPicker';
import { INSPECT_PROMPT, INSPECT_REACH_TILES, type InspectBinding, bindInspect } from '../ui/inspect/bind';
import { bindShout } from '../ui/hive/shout';
import { AUDIO_KEYS, type AudioKey, AudioBus } from '../view/AudioBus';
import { BodyView } from '../view/BodyView';
import { type BodyHud, mountBodyHud } from '../view/body/BodyHud'; // round 8, 8A
import { STRIKE_RANGE_TILES, reachPx, strikeTarget } from '../view/body/verbs'; // round 8, 8A
import { ClueView } from '../view/ClueView';
import { CutscenePlayer } from '../view/cutscene/CutscenePlayer';
import { GiverView } from '../view/GiverView';
import { MobView } from '../view/MobView';
import { VfxView } from '../view/vfx/VfxView';
import { HqView } from '../view/hq/HqView';
import { NodeView } from '../view/NodeView';
import { TransportView } from '../view/transport/TransportView';
import { mountM5bLayer, type M5bLayer } from '../ui/M5bLayer';
import { mountShopLayer, type ShopLayer } from '../ui/shop/ShopLayer'; // round 8, 8C (locked)
import { type CivicLayer, mountCivicLayer } from '../ui/econ/CivicLayer'; // round 8, 8D
import { type SleepLayer, mountSleepLayer } from '../ui/sleep/SleepLayer'; // round 10, A8
import { mountPurseHud, type PurseHud } from '../view/purse/PurseHud'; // round 8, 8C (locked)
import { type MugPrompt, mountMugPrompt } from '../ui/mug/MugPrompt';
import { type LineScreen, lineSecondsLeft, mountOnTheLine } from '../ui/OnTheLine'; // round 10, C1b
import { EntityView } from '../view/EntityView';
import { Hud, type HudChip } from '../view/Hud';
import { Lighting } from '../view/Lighting';
import { mountMatchLoadingScreen } from '../view/LoadingScreen';
import { darknessOf, sceneLights } from '../view/lightMath';
import { NotebookSheet } from '../view/NotebookPanel';
import { GroundView } from '../view/GroundView';
import { bellSpot } from '../view/PropView';
import { StaticView } from '../view/StaticView';
import { ART_STYLE_CHANGED } from '../view/artStyle';
import { applyFilters, peekManifest, queueMatchEntries, sceneMapKey, sceneMapUrl } from '../view/assets';
import { dayPartOf, isLit } from '../view/dayPart';
import { mapStatics } from '../view/mapDefs';
import { isTouchDevice, readDevFlags } from '../view/devFlags';
import { DEPTH, cameraBounds, decalHolder, isoZoom, sceneDiamond, tileDiamond } from '../view/iso';
import { type SceneMap, type TiledMap, readSceneMap } from '../view/sceneMap';
import { loadMapName, loadSceneName } from '../view/sceneNames';
import { nearestAvatar } from '../view/targets';
import { DEFAULT_MAP_ID } from '../net/protocol';
import { REG_AUDIO, REG_CUTSCENE, getFlags, getNet } from './registry';

/** How close a player must stand to a door to use it, in tiles (balance.json `doors.reachTiles`, GDD 3.7). */
const PORTAL_REACH_TILES = balance.doors.reachTiles;
const A = abilitiesJson.abilities;
/** Reach of each verb in pixels: the same radii the server validates (GDD 3.2, 3.4). */
const REPORT_REACH_PX = A.report.rangeTiles * TILE_PX;
const BELL_REACH_PX = A.bell.rangeTiles * TILE_PX;
const COLLECT_REACH_PX = PORTAL_REACH_TILES * TILE_PX;
const COLLECT_MS = A.collect.castS * 1000;
/** A target player may have moved since the last patch; the server adds the same slack from its ring. */
const TARGET_SLACK_TILES = 1;
const ABILITY_DEFS = A as unknown as Record<string, { kind: string; target: string; rangeTiles?: number }>;
const ABILITY_SLOTS: Record<string, string> = { KeyQ: 'Q', KeyR: 'R', KeyF: 'F' };
const PHASE_LABEL: Record<number, string> = {
  [Phase.grace]: C['phase.grace'],
  [Phase.day]: C['phase.day'],
  [Phase.dusk]: C['phase.dusk'],
  [Phase.night]: C['phase.night'],
  [Phase.dawn]: C['phase.dawn'],
  [Phase.immunity]: C['phase.immunity'],
  [Phase.finalNight]: C['phase.finalNight'],
};
/** Refusal codes of ARCHITECTURE 5.5 to their deck lines (UI.md 14.3). */
const REFUSAL: Record<number, string> = {
  424: C['refuse.cooldown'],
  425: C['refuse.notNow'],
  426: C['refuse.busy'],
  427: C['refuse.reach'],
  423: C['refuse.locked'],
  428: C['refuse.closed'],
};
const WORLD_PHASES = new Set<number>([
  Phase.grace,
  Phase.day,
  Phase.dusk,
  Phase.night,
  Phase.dawn,
  Phase.immunity,
  Phase.finalNight,
]);

/** What `E` would do right now. */
type Target =
  | { kind: 'body'; id: string; x: number; y: number }
  | { kind: 'clue'; id: string; x: number; y: number }
  | { kind: 'bell'; x: number; y: number }
  | { kind: 'door'; id: string; x: number; y: number; boarded: boolean }
  // Round 8 (8B): a figure to inspect, by avatar handle; offered only when nothing else is.
  | { kind: 'seat'; id: string; x: number; y: number };

/** Clue ids this client has already collected, per feed: the prompt does not offer them again. */
const collectedBy = new WeakMap<WorldFeed, Set<string>>();
/** Round 10, C1b: per feed, whether its seat was on the line and how it died; a World restart keeps it. */
const lines = new WeakMap<WorldFeed, { on: boolean; cause: DeathCause | undefined }>();
const lineOf = (feed: WorldFeed): { on: boolean; cause: DeathCause | undefined } => {
  let memory = lines.get(feed);
  if (!memory) lines.set(feed, (memory = { on: false, cause: undefined }));
  return memory;
};

interface PortalSpot {
  id: string;
  x: number;
  y: number;
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

/** Phaser polygon points from plain ones. */
const poly = (pts: Array<{ x: number; y: number }>) => pts.map((p) => new Phaser.Math.Vector2(p.x, p.y));

/** Where a drawn object stands in the world: the inverse of the projection its view applied. */
const worldOf = (o: { x: number; y: number }) => toWorld(o.x, o.y);

/**
 * The village and its interiors. Restarted by the router for every `sceneEnter`, so each run knows one
 * scene: it loads that scene's tilemap, draws the players, bodies and clues the server says are in view
 * and nobody else, and turns the nearest target in reach into one prompt (E, or the Use disc).
 */
export class World extends Phaser.Scene {
  private feed!: WorldFeed;
  private sceneId = 'overworld';
  private entities!: EntityView;
  private clueView!: ClueView;
  // Round 6 (locked lines): the M5b views (6I) and the cutscene player (6J).
  private nodeView!: NodeView;
  private mobView!: MobView;
  private vfxView!: VfxView; // round 8, 8G (locked)
  private transportView!: TransportView; // round 8, 8G (locked)
  private hqView!: HqView; // round 8, 8G (locked)
  private giverView!: GiverView;
  private m5b: M5bLayer | null = null;
  private shop: ShopLayer | null = null; // round 8, 8C (locked)
  private civic: CivicLayer | null = null; // round 8, 8D
  private sleepLayer: SleepLayer | null = null; // round 10, A8
  private purse: PurseHud | null = null; // round 8, 8C (locked)
  private mug: MugPrompt | null = null;
  private cutscenes!: CutscenePlayer;
  private ground: GroundView | null = null;
  private bell: { x: number; y: number } | null = null;
  private statics!: StaticView;
  private readonly bodyViews = new Map<string, BodyView>();
  private hud!: Hud;
  /** Round 10, 10Y (UI.md 14.51): when each NEED_* refusal last showed, for the second one's hint. */
  private readonly hints = new RefusalHints();
  private bodyHud!: BodyHud; // round 8, 8A
  private lighting!: Lighting;
  private sheet!: NotebookSheet;
  private audio!: AudioBus;
  private input_!: InputController;
  private touch: TouchControls | null = null;
  private portals: PortalSpot[] = [];
  private swing!: Phaser.GameObjects.Graphics;
  private map!: SceneMap;
  private followed = false;
  private fpsAt = 0;
  private showFps = false;
  private prevScaleMode: number = Phaser.Scale.FIT;
  private offs: Array<() => void> = [];
  private target: Target | null = null;
  private hold: { clueId: string; since: number; x: number; y: number } | null = null;
  private focusEntry: { had: number; until: number } | null = null;
  private wasDead = false;
  /** Round 10, C1b: the On-the-line screen while this seat waits for the morning train. */
  private line: LineScreen | null = null;
  /** What the last verb was, so a bare 422 reads as the deck's line for that verb. */
  private lastPhase = -1;
  private stepAt = 0;

  constructor() {
    super('World');
  }

  init(data: SceneEnter): void {
    this.sceneId = data.sceneId;
    this.followed = false;
    this.offs = [];
    this.bodyViews.clear();
    this.target = null;
    this.hold = null;
    this.focusEntry = null;
    this.wasDead = false;
    this.line = null;
  }

  preload(): void {
    mountMatchLoadingScreen(this, overlayRoot(), this.matchMap());
    const base = import.meta.env.BASE_URL;
    const key = sceneMapKey(this.sceneId);
    if (!this.cache.tilemap.exists(key)) this.load.tilemapTiledJSON(key, sceneMapUrl(base, this.sceneId));
    // The match's map art (SPRITES 10.13): entries listing its map or mode that the boot did not load.
    const manifest = peekManifest(getFlags(this).art, base);
    if (manifest) queueMatchEntries(this.load, this, manifest, this.matchMap());
  }

  private matchMap(): string {
    return getNet(this).snapshot?.settings.map ?? DEFAULT_MAP_ID;
  }

  create(): void {
    const feed = this.registry.get(REG_WORLD) as WorldFeed | undefined;
    if (!feed) throw new Error('World started without a feed');
    this.feed = feed;
    const flags = readDevFlags(location.search);

    this.buildMap();
    this.swing = this.add.graphics().setDepth(DEPTH.decal);
    this.statics = new StaticView(this);
    this.statics.set(
      mapStatics(this.map, {
        mapId: this.map.mapId ?? this.matchMap(),
        theme: this.map.theme ?? '',
        hasFrame: (atlas, frame) => this.textures.exists(atlas) && this.textures.get(atlas).has(frame),
      }),
    );
    this.statics.setLit(isLit(dayPartOf(feed.clock().phase)));
    this.clueView = new ClueView(this);
    this.nodeView = new NodeView(this);
    this.mobView = new MobView(this);
    this.vfxView = new VfxView(this); // round 8, 8G (locked)
    this.transportView = new TransportView(this); // round 8, 8G (locked)
    this.hqView = new HqView(this.statics, this.vfxView); // round 8, 8G (locked)
    this.giverView = new GiverView(this);
    this.m5b = mountM5bLayer(this);
    this.shop = mountShopLayer(this); // round 8, 8C (locked)
    this.civic = mountCivicLayer(this); // round 8, 8D
    this.sleepLayer = mountSleepLayer(this); // round 10, A8
    this.entities = new EntityView(this, feed.selfId);

    this.hud = new Hud(overlayRoot());
    this.bodyHud = mountBodyHud(this.hud.root); // round 8, 8A: the body panel, bottom-left (UI.md 14.32)
    bodyMotion(this.bodyHud.root); // round 8, 8H (locked): hit flash, fresh and cured effect chips (UI.md 9)
    this.hud.setChip((this.registry.get(REG_ROLE_CHIP) as HudChip | undefined) ?? null);
    this.purse = mountPurseHud(this, feed, this.hud.root.querySelector('.wdi-hud__tl') ?? this.hud.root); // round 8, 8C (locked)
    void Promise.all([loadMapName(this.matchMap()), loadSceneName(this.sceneId)]).then(([map, scene]) =>
      this.hud.say(fill(C['hud.scene'], { map, scene }), 1500),
    );
    this.hud.onNotebook(() => this.sheet.toggle());
    this.lighting = new Lighting(this, overlayRoot());
    this.lighting.setScene(sceneLights(this.map.lights), this.map.dark);
    this.sheet = new NotebookSheet(overlayRoot(), feed);
    // Round 8 (8E, GDD 3.24): the mugging prompt, opened by the private `mugPrompt`.
    this.mug = mountMugPrompt(overlayRoot(), feed, (choice) => feed.mug(choice));
    this.audio = this.registry.get(REG_AUDIO) ?? new AudioBus();
    if (!this.registry.has(REG_AUDIO)) {
      this.registry.set(REG_AUDIO, this.audio);
      void this.audio.load().then(() => this.audio.play('ambient'));
    }
    this.cutscenes = new CutscenePlayer(this, overlayRoot(), this.audio, () =>
      this.entities.objectOf(feed.selfId),
    );
    this.lastPhase = feed.clock().phase;

    const input: InputController = this.registry.get(REG_INPUT) ?? new InputController(feed);
    this.registry.set(REG_INPUT, input);
    input.setSink(feed);
    input.start();
    this.input_ = input;
    this.bindKeys();
    if (flags.touch || isTouchDevice()) {
      this.touch = new TouchControls(overlayRoot(), {
        onUse: (on) => this.useKey(on),
        onAct: () => this.abilityKey('Q'),
        onStrike: () => this.strikeKey(), // round 8, 8A
      });
      input.attachTouch(this.touch);
    }

    const net = getNet(this);
    const onNoise = (n: NoisePulse) => this.ring(n);
    const onError = (e: ErrorPayload) => {
      const line = this.refusal(e);
      // Round 10, 10Y (UI.md 14.51): the second identical NEED_* in 30 s adds where the thing is found.
      const hint = line === null ? null : this.hints.take(e, performance.now());
      if (line !== null)
        this.hud.say(
          hint ? `${line} ${hint}` : line,
          hint ? 4000 : undefined,
          isNfy(e.reason) ? 'nfy' : undefined,
        );
      refusedIn(overlayRoot()); // round 8, 8H (locked): the refused prompt shakes (UI.md 9)
      if (e.code === 423 || e.code === 428) this.audio.play('door_locked');
    };
    const onFound = () => this.clueFound();
    // Round 6, 6J (locked): the death cutscene plays, then the ghost handoff as before.
    const onKilled = (m: { cutsceneId?: string; cause?: string }) => {
      lineOf(this.feed).cause = m.cause as DeathCause | undefined; // round 10, C1b: the screen's centre line
      void this.cutscenes.playDeath(m.cutsceneId).then(() => this.refreshGhost());
    };
    const onAim = (m: { endsTick: number }) => this.openAim(m.endsTick);
    feed.bus.on('noise', onNoise);
    feed.bus.on('error', onError);
    feed.bus.on('clueFound', onFound);
    feed.bus.on('killed', onKilled);
    feed.bus.on('aim', onAim);
    net.bus.on('error', onError as never);
    this.inspect = bindInspect(feed, this.hud, overlayRoot()); // round 8, 8B
    this.offs.push(bindShout(feed, this.hud)); // round 8, 8R: the shout cue
    this.offs.push(
      () => feed.bus.off('noise', onNoise),
      () => feed.bus.off('error', onError),
      () => feed.bus.off('clueFound', onFound),
      () => feed.bus.off('killed', onKilled),
      () => feed.bus.off('aim', onAim),
      () => net.bus.off('error', onError as never),
      () => this.inspect?.off(),
    );

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
    void this.cutscenes.playPending(this.registry, REG_CUTSCENE); // round 6, 6J (locked): the opening
    if (flags.navDebug) this.drawNavDebug();
    this.showFps = flags.fps;

    // A meeting sleeps this scene (Meeting never touches view/**): hide every DOM layer, let go of the keys.
    // A style switch (A79) replaced the textures under the sprites: a restart rebuilds every view, as a door does. A
    // sleeping World (a meeting is up) is rebuilt by the router when the meeting ends.
    const onArtStyle = () => {
      if (this.scene.isActive()) this.scene.restart();
    };
    this.game.events.on(ART_STYLE_CHANGED, onArtStyle);
    this.offs.push(() => this.game.events.off(ART_STYLE_CHANGED, onArtStyle));
    this.events.on(Phaser.Scenes.Events.SLEEP, this.onSleep, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.onSleep, this);
      this.events.off(Phaser.Scenes.Events.WAKE, this.onWake, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.scale.scaleMode = this.prevScaleMode;
      this.scale.displaySize.setAspectMode(this.prevScaleMode);
      host?.classList.remove('wdi-fill');
      this.scale.getParentBounds();
      this.scale.refresh();
      this.offs.forEach((off) => off());
      this.endUse();
      this.closePicker();
      input.unbindAll();
      this.entities.destroy();
      this.clueView.destroy();
      this.nodeView.destroy();
      this.mobView.destroy();
      this.vfxView.destroy(); // round 8, 8G (locked)
      this.transportView.destroy(); // round 8, 8G (locked)
      this.hqView.destroy(); // round 8, 8G (locked)
      this.giverView.destroy();
      this.m5b?.destroy();
      this.shop?.destroy(); // round 8, 8C (locked)
      this.civic?.destroy(); // round 8, 8D
      this.sleepLayer?.destroy(); // round 10, A8
      this.purse?.destroy(); // round 8, 8C (locked)
      this.mug?.destroy();
      this.line?.destroy(); // round 10, C1b
      this.cutscenes.destroy();
      this.ground?.destroy();
      this.ground = null;
      this.statics.destroy();
      for (const b of this.bodyViews.values()) b.destroy();
      this.bodyViews.clear();
      this.bodyHud.destroy(); // round 8, 8A
      this.hud.destroy();
      this.lighting.destroy();
      this.sheet.destroy();
      this.touch?.destroy();
      this.touch = null;
    });
    this.graceToasts();
    this.entryToasts();
  }

  override update(_time: number, delta: number): void {
    const now = performance.now();
    const feed = this.feed;
    this.entities.update(feed.snapshot(), now);
    const self = this.entities.objectOf(feed.selfId);
    if (self && !this.followed) {
      this.followed = true;
      this.cameras.main.startFollow(self, true, 0.1, 0.1);
      this.lighting.setFollowing(true);
      this.cameras.main.centerOn(self.x, self.y);
    }
    const clock = feed.clock();
    const endsTick = clock.phaseEndsTick;
    this.hud.setTimer(endsTick > 0 ? endsTick - clock.tick : null);
    this.bodyHud.update(feed.body(), clock.tick); // round 8, 8A
    const darkness = darknessOf(clock.phase, clock.phaseEndsTick - clock.tick);
    this.hud.setPhase(PHASE_LABEL[clock.phase] ?? '', darkness >= 1);
    this.watchPhase(clock.phase);
    if (!this.cutscenes.playing) this.refreshGhost();
    if (!this.cutscenes.playing) this.refreshLine(clock); // round 10, C1b

    const clues = feed.clues();
    const bodies = feed.bodies();
    this.clueView.update(clues, this.time.now);
    this.nodeView.update(feed.nodes(), this.time.now); // round 6, 6I (locked)
    this.mobView.update(feed.mobs(), this.time.now); // round 6, 6I (locked)
    this.vfxView.update(feed.avatars(), feed.mobs(), this.time.now); // round 8, 8G (locked)
    this.syncBodies(bodies);
    this.drawDoors(clock.tick);
    this.transportView.update(this.sceneId, this.portals, feed, clock.tick, this.time.now); // round 8, 8G (locked)
    this.hqView.update(feed.hqTiers()); // round 8, 8G (locked)
    this.updateTarget(self, clues, bodies);
    this.updateHold(self, clues);
    this.footsteps(now);
    this.sheet.update();
    this.focusNewEntry();
    this.statics.update(self ? worldOf(self) : null, delta / 1000, this.cameras.main.worldView);

    this.lighting.set({
      visible: WORLD_PHASES.has(clock.phase) && self !== null,
      viewer: self ? worldOf(self) : null,
      darkness,
      part: dayPartOf(clock.phase),
    });
    if (this.showFps && now - this.fpsAt > 500) {
      this.fpsAt = now;
      const loop = this.game.loop;
      this.hud.setFps(
        `${Math.round(loop.actualFps)} fps\n${this.entities.count} in view\n${this.sceneId}\nat ${self ? `${(worldOf(self).x / TILE_PX).toFixed(1)},${(worldOf(self).y / TILE_PX).toFixed(1)}` : '-'}\nbodies ${bodies.length}\nclues ${clues.length}`,
      );
    }
  }

  // ---- keys, touch and the verbs ----------------------------------------------------------------

  private bindKeys(): void {
    const input = this.input_;
    input.bind('KeyE', (down) => this.useKey(down));
    input.bind('KeyN', (down) => down && this.sheet.toggle());
    for (const [code, slot] of Object.entries(ABILITY_SLOTS))
      input.bind(code, (down) => down && this.abilityKey(slot));
    input.bind('KeyX', (down) => down && this.strikeKey()); // round 8, 8A
  }

  /**
   * Round 8, 8A: X / Strike, the fists of every card (GDD 3.22): a swing at the nearest other avatar in reach, else
   * the nearest living creature; the server resolves the handle or the creature id and refuses the rest.
   */
  private strikeKey(): void {
    if (this.feed.dead()) return;
    const target = strikeTarget(
      this.feed.avatars(),
      this.feed.selfHandle(),
      this.feed.mobs(),
      reachPx(STRIKE_RANGE_TILES),
    );
    if (target === null) return this.hud.say(C['refuse.nobody']);
    this.feed.ability('strike', target);
  }

  private onSleep(): void {
    this.endUse();
    this.input_.unbindAll();
    this.sheet.close();
    this.inspect?.card.close();
    this.hud.setHidden(true);
    this.touch?.setHidden(true);
    this.lighting.setHidden(true);
  }

  private onWake(): void {
    this.hud.setHidden(false);
    this.touch?.setHidden(false);
    this.bindKeys();
  }

  /** E / Use: the M5b layer takes it for a node or a giver in reach; otherwise the clue, body, bell and door verbs. */
  private useKey(down: boolean): void {
    if (this.shop?.use(down)) return; // round 8, 8C (locked): a shop counter in reach
    if (this.civic?.use(down)) return; // round 8, 8D: an altar, the mailbag, a rack, the back room, a station, a bank
    if (this.sleepLayer?.use(down)) return; // round 10, A8: a bed in reach at dusk or night
    if (this.m5b?.use(down)) return;
    if (down) this.startUse();
    else this.endUse();
  }

  /** E / Use pressed: act on the nearest target. A clue starts a hold that ends with `endUse`. */
  private startUse(): void {
    const t = this.target;
    if (!t) return this.hud.toast(C['toast.nothing'], 'interact');
    switch (t.kind) {
      case 'body':
        this.feed.reportBody(t.id);
        break;
      case 'bell':
        this.feed.bell();
        this.audio.play('bell');
        break;
      case 'door':
        this.feed.enterPortal(t.id);
        if (!t.boarded) this.audio.play('door_open');
        break;
      case 'seat':
        this.feed.inspect(t.id);
        break;
      case 'clue':
        if (this.hold) break;
        this.hold = { clueId: t.id, since: this.time.now, x: t.x, y: t.y };
        this.feed.hold('collect', t.id, true);
        break;
    }
  }

  /** E / Use released: a hold that has not reached `castS` is a cancelled hold. */
  private endUse(): void {
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    this.clueView?.setHold(null);
    this.feed.hold('collect', h.clueId, false);
    this.hud.toast(C['toast.collect.cancel'], 'interact');
  }

  /** Q, R or F: the card's ability on that key, aimed at the nearest living player in reach. */
  private abilityKey(slot: string): void {
    if (this.feed.dead()) return;
    const row = getNet(this).roleCard?.abilities.find((a) => a.key === slot);
    const def = row ? ABILITY_DEFS[row.id] : undefined;
    if (!row || !def || def.kind !== 'active') return;
    if (def.target === 'seat') return this.pickSeat(row.id, row.name);
    if (def.target !== 'player') {
      this.feed.ability(row.id);
      return;
    }
    const near = this.nearestPlayer((def.rangeTiles ?? PORTAL_REACH_TILES) + TARGET_SLACK_TILES);
    if (!near) return this.hud.say(C['refuse.nobody']);
    if (row.id === 'kill') {
      this.feed.kill(near);
    } else this.feed.ability(row.id, near);
  }

  /** The handle of the avatar nearest to the own in reach: the Kill and the Bandage name a handle (GDD 3.17). */
  private nearestPlayer(reachTiles: number): string | null {
    return nearestAvatar(this.feed.avatars(), this.feed.selfHandle(), reachTiles * TILE_PX);
  }

  /** Round 8 (8B): the inspect card and its three messages. */
  private inspect: InspectBinding | null = null;

  private seatPicker: { destroy(): void } | null = null;

  /** A `target: 'seat'` ability names a seat id: pick one from the publicly living seats (GDD 3.17). */
  private pickSeat(abilityId: string, name: string): void {
    this.mountPicker(abilityId === 'impersonate' ? LOOKS_COPY['seats.title.impersonate'] : name, (id) => {
      this.feed.ability(abilityId, id);
      if (abilityId === 'impersonate') this.hud.toast(LOOKS_COPY['toast.disguise.wait'], 'interact');
    });
  }

  /** The dying Gamekeeper's Last Shot (`aim {endsTick}`): the picker opens for the window and closes when it ends. */
  private openAim(endsTick: number): void {
    this.closePicker();
    this.mountPicker(LOOKS_COPY['seats.title.aim'], (id) => this.feed.ability('lastShot', id));
    const clock = this.feed.clock();
    const ms = Math.max(0, ((endsTick - clock.tick) / TICK_RATE) * 1000);
    this.aimTimer = window.setTimeout(() => this.closePicker(), ms);
  }

  private aimTimer = 0;

  private closePicker(): void {
    window.clearTimeout(this.aimTimer);
    this.seatPicker?.destroy();
    this.seatPicker = null;
  }

  private mountPicker(title: string, onPickSeat: (id: string) => void): void {
    if (this.seatPicker) return;
    const seats = this.feed
      .snapshot()
      .filter((s) => s.alive && s.id !== this.feed.selfId)
      .map((s) => ({ id: s.id, name: s.name, look: s.look, traits: s.traits }));
    const done = () => (this.seatPicker = null);
    this.seatPicker = mountSeatPicker(overlayRoot(), {
      title,
      seats,
      textures: this.textures,
      onPick: (id) => {
        done();
        onPickSeat(id);
      },
      onCancel: done,
    });
  }

  // ---- targets and the prompt ---------------------------------------------------------------------

  /** The nearest thing in reach: a body (Report), a clue (Hold E), the bell or a door. Ghosts get doors only. */
  private updateTarget(
    self: Phaser.GameObjects.Container | null,
    clues: ClueSnap[],
    bodies: BodySnap[],
  ): void {
    this.target = null;
    if (!self) return this.hud.setPrompt(null);
    const me = worldOf(self);
    const ghost = this.feed.dead();
    let best = Infinity;
    const consider = (t: Target, reach: number) => {
      const d = Math.hypot(me.x - t.x, me.y - t.y);
      // Strictly nearer wins, so a tie keeps the earlier kind: body, clue, bell, door.
      if (d <= reach && d < best - 1) {
        best = d;
        this.target = t;
      }
    };
    if (!ghost) {
      for (const b of bodies)
        if (!b.hidden) consider({ kind: 'body', id: b.id, x: b.x, y: b.y }, REPORT_REACH_PX);
      const collected = collectedBy.get(this.feed);
      for (const c of clues) {
        if (!collected?.has(c.id)) consider({ kind: 'clue', id: c.id, x: c.x, y: c.y }, COLLECT_REACH_PX);
      }
      if (this.bell) consider({ kind: 'bell', x: this.bell.x, y: this.bell.y }, BELL_REACH_PX);
    }
    const doors = this.feed.doors();
    for (const p of this.portals) {
      const boarded = doors.find((d) => d.id === p.id)?.state === 1;
      consider({ kind: 'door', id: p.id, x: p.x, y: p.y, boarded }, PORTAL_REACH_TILES * TILE_PX);
    }
    if (!ghost && this.target === null) {
      const handle = this.nearestPlayer(INSPECT_REACH_TILES);
      if (handle !== null) this.target = { kind: 'seat', id: handle, x: me.x, y: me.y };
    }
    const t = this.target as Target | null;
    this.hud.setPrompt(
      t === null
        ? null
        : t.kind === 'body'
          ? C['prompt.report']
          : t.kind === 'clue'
            ? C['prompt.collect']
            : t.kind === 'bell'
              ? C['prompt.bell']
              : t.kind === 'door'
                ? t.boarded
                  ? C['prompt.door.boarded']
                  : C['prompt.door']
                : t.kind === 'seat'
                  ? INSPECT_PROMPT
                  : null,
    );
  }

  /** Draws the collect ring and drops the hold when the server has surely cancelled it. */
  private updateHold(self: Phaser.GameObjects.Container | null, clues: ClueSnap[]): void {
    const h = this.hold;
    if (!h) return;
    const moving = this.input_.current();
    const clue = clues.find((c) => c.id === h.clueId);
    const me = self ? worldOf(self) : null;
    const away = !me || !clue || Math.hypot(me.x - clue.x, me.y - clue.y) > COLLECT_REACH_PX + 8;
    if (away || moving.dx !== 0 || moving.dy !== 0) {
      // Moving or leaving cancels the hold on the server too (GDD 3.4); nothing more to send.
      this.hold = null;
      this.clueView.setHold(null);
      this.hud.toast(C['toast.collect.cancel'], 'interact');
      return;
    }
    this.clueView.setHold({ x: h.x, y: h.y }, (this.time.now - h.since) / COLLECT_MS);
  }

  private clueFound(): void {
    const h = this.hold;
    if (h) {
      const set = collectedBy.get(this.feed) ?? new Set<string>();
      set.add(h.clueId);
      collectedBy.set(this.feed, set);
    }
    this.hold = null;
    this.clueView.setHold(null);
    this.audio.play('pickup');
    this.hud.toast(C['toast.clue.found'], 'interact');
    // The Notebook opens on the new entry (GDD 2 step 5); the entry may trail the message by a patch.
    this.focusEntry = { had: this.feed.notebook().length, until: this.time.now + 3000 };
    this.sheet.open();
  }

  private focusNewEntry(): void {
    const f = this.focusEntry;
    if (!f) return;
    if (this.feed.notebook().length > f.had) {
      this.sheet.panel.update();
      this.sheet.panel.focusLast();
      this.focusEntry = null;
    } else if (this.time.now > f.until) this.focusEntry = null;
  }

  // ---- bodies, ghost, phases, noise -----------------------------------------------------------------

  private syncBodies(bodies: BodySnap[]): void {
    const present = new Set<string>();
    const roster = this.feed.snapshot();
    for (const b of bodies) {
      if (b.hidden) continue;
      present.add(b.id);
      if (this.bodyViews.has(b.id)) continue;
      const look = roster.find((p) => p.id === b.of)?.traits ?? { height: 1, scarf: 0, hat: 2 };
      this.bodyViews.set(b.id, new BodyView(this, b.x, b.y, look));
    }
    for (const [id, v] of this.bodyViews) {
      if (present.has(id)) continue;
      v.destroy();
      this.bodyViews.delete(id);
    }
  }

  /**
   * Round 10, C1b (GDD 3.22, UI.md 14.47): on the line the seat sees the dark carriage and the time to the train, never
   * the world (the server sends it none); when the train brings it back, the screen lifts and says so.
   */
  private refreshLine(clock: { tick: number; phase: number; phaseEndsTick: number }): void {
    const memory = lineOf(this.feed);
    const on = this.feed.onLine();
    if (on) {
      memory.on = true;
      this.line ??= mountOnTheLine(overlayRoot(), memory.cause);
      return this.line.update(lineSecondsLeft(clock.phase, (clock.phaseEndsTick - clock.tick) / TICK_RATE));
    }
    this.line?.destroy();
    this.line = null;
    if (!memory.on) return;
    memory.on = false; // the scene restarts on the platform, so the memory outlives this run
    this.hud.toast(C['line.back'], 'warm', undefined, 3000);
  }

  /** Ghost mode: your sprite translucent, "You are a ghost", the verbs off. The flag lives in the feed. */
  private refreshGhost(): void {
    const dead = this.feed.dead();
    if (dead === this.wasDead) return;
    this.wasDead = dead;
    this.entities.setGhost(dead);
    this.hud.setGhost(dead);
    this.touch?.setActEnabled(!dead);
    if (dead) {
      this.endUse();
      this.hud.toast(C['toast.ghost'], 'hazard', undefined, 5000);
      this.audio.play('scream');
    }
  }

  private watchPhase(phase: number): void {
    if (phase === this.lastPhase) return;
    const was = this.lastPhase;
    this.lastPhase = phase;
    this.statics.setLit(isLit(dayPartOf(phase)));
    if (phase === Phase.dusk) {
      this.hud.toast(fill(C['toast.dusk'], { duskS: balance.phases.duskS }), 'warm', undefined, 5000);
    } else if (phase === Phase.night) this.hud.toast(C['toast.night'], 'warm', undefined, 5000);
    else if (phase === Phase.day && was === Phase.night)
      this.hud.toast(C['toast.day'], 'warm', undefined, 5000);
  }

  /** The three hints of GDD 2 step 5, once per match (the key includes the match start). */
  private graceToasts(): void {
    const clock = this.feed.clock();
    if (clock.phase !== Phase.grace) return;
    const tag = `grace:${clock.startTick}`;
    this.hud.toast(C['toast.grace.sneak'], 'interact', 'Shift', 7000, `${tag}:sneak`);
    this.hud.toast(C['toast.grace.collect'], 'interact', 'E', 7000, `${tag}:clue`);
    this.hud.toast(C['toast.grace.bell'], 'warm', 'E', 7000, `${tag}:bell`);
  }

  /** What a fresh World run should say about where it starts: back from a meeting, or a ghost. */
  private entryToasts(): void {
    const clock = this.feed.clock();
    if (clock.phase === Phase.immunity)
      this.hud.toast(C['toast.immunity'], 'warm', undefined, 4000, `immunity:${clock.phaseEndsTick}`);
    if (this.feed.dead()) this.hud.say(C['ghost.walk'], 5000);
  }

  /** The line for a refusal: the server's reason (UI.md 14.43), else the code of a server that sends none (14.3). */
  private refusal(e: ErrorPayload): string | null {
    if (e.reason === undefined) return REFUSAL[e.code ?? 0] ?? NOTHING_HAPPENS;
    return refusalText(e, { dev: import.meta.env.DEV, fails: interactionFails });
  }

  private footsteps(now: number): void {
    const me = this.feed.snapshot().find((s) => s.id === this.feed.selfId)?.presence;
    if (!me || me.animId !== 1 || now - this.stepAt < 380) return;
    this.stepAt = now;
    this.audio.play('footstep');
  }

  /** Reads the scene's tilemap, draws its ground and sets the void colour; the statics follow in `create`. */
  private buildMap(): void {
    const key = sceneMapKey(this.sceneId);
    this.map = readSceneMap(this.cache.tilemap.get(key).data as TiledMap);
    this.portals = this.map.portals;
    this.bell = bellSpot(this.map.props);
    this.ground = new GroundView(this, key, this.map);
    applyFilters(
      this.textures,
      peekManifest(getFlags(this).art, import.meta.env.BASE_URL) ?? { version: 1, art: '', entries: [] },
    );
    this.cameras.main.setBackgroundColor(colorOf(palette.colors[this.map.voidColour]));
  }

  /** Camera zoom snaps to a multiple of 0.5 (SPRITES 10.9); bounds hold the scene's diamond, centred if smaller. */
  private fitCamera(): void {
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    cam.setSize(width, height);
    const zoom = isoZoom(height);
    cam.setZoom(zoom);
    cam.setRoundPixels(true);
    this.lighting?.resize();
    const b = cameraBounds(this.map.w, this.map.h, width / zoom, height / zoom);
    cam.setBounds(b.x, b.y, b.width, b.height);
  }

  /** A door swings for 3 s (GDD 3.7): pulse its tile while the server says it is swinging. */
  private drawDoors(tick: number): void {
    this.swing.clear();
    const doors = this.feed.doors();
    for (const p of this.portals)
      this.statics.setShown(`${p.id}~boarded`, doors.find((d) => d.id === p.id)?.state === 1);
    for (const d of doors) {
      if (tick >= d.swingUntilTick) continue;
      const p = this.portals.find((q) => q.id === d.id);
      if (!p) continue;
      const pulse = 0.35 + 0.25 * Math.sin(this.time.now / 120);
      this.swing.fillStyle(colorOf(palette.colors.lantern), pulse);
      this.swing.fillPoints(poly(tileDiamond(Math.floor(p.x / TILE_PX), Math.floor(p.y / TILE_PX))), true);
    }
  }

  /** A noise pulse: an expanding ring at its source, a log line and, off screen, an edge cue pointing to it. */
  private ring(n: NoisePulse): void {
    if (n.sceneId !== this.sceneId) return;
    // Round 7, 7I: the Daily Train's pulses are sounds, not rings (GDD 3.3).
    if (n.kind.startsWith('train_') && (AUDIO_KEYS as readonly string[]).includes(n.kind)) {
      this.audio.play(n.kind as AudioKey);
      this.transportView.pulse(n.kind, this.time.now); // round 8, 8G (locked)
      if (n.kind === 'train_arrive') this.hud.say(C['log.train']);
      return;
    }
    const scream = /scream/i.test(n.kind);
    const col = colorOf(scream ? palette.colors.magenta : palette.colors.lantern);
    // A ring on the ground: an ellipse on the screen, above the darkness (SPRITES 10.6).
    const { root, inner } = decalHolder(this, n.x, n.y);
    const g = this.add.circle(0, 0, 8).setStrokeStyle(4, col);
    inner.add(g);
    root.setDepth(DEPTH.marks);
    this.tweens.add({ targets: g, scale: 8, alpha: 0, duration: 700, onComplete: () => root.destroy() });
    const meObj = this.entities.objectOf(this.feed.selfId);
    const at = toScreen(n.x, n.y);
    // HUD words are screen frame: "from the north" is up on the screen (SPRITES 10.4).
    const dir = meObj ? dirFromVector(at.x - meObj.x, at.y - meObj.y) : null;
    const line = /bell/i.test(n.kind)
      ? C['log.bell']
      : scream
        ? C['log.scream']
        : /run|step/i.test(n.kind)
          ? C['log.steps']
          : C['log.door'];
    const label = fill(line, { dir: dir === null ? '' : C[`dir.${dir}` as keyof typeof C] });
    this.hud.say(label);
    if (scream) this.audio.play('scream');
    const cam = this.cameras.main;
    const { width, height } = this.scale;
    const sx = (at.x - cam.worldView.x) * cam.zoom;
    const sy = (at.y - cam.worldView.y) * cam.zoom;
    if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) return;
    const dx = sx - width / 2;
    const dy = sy - height / 2;
    const k = Math.min((width / 2 - 48) / Math.abs(dx || 1e-6), (height / 2 - 48) / Math.abs(dy || 1e-6));
    this.hud.edgeCue(width / 2 + dx * k, height / 2 + dy * k, Math.atan2(dx, -dy), label);
  }

  /** ?navdebug=1: outline every solid tile from the tilemap's ground layer for collision debugging. */
  private drawNavDebug(): void {
    const g = this.add.graphics().setDepth(DEPTH.marks);
    g.lineStyle(1, colorOf(palette.colors.magenta), 0.6);
    const { w, h } = this.map;
    g.strokePoints(poly(sceneDiamond(w, h)), true);
  }
}
