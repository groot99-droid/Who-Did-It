import Phaser from 'phaser';
import abilitiesJson from '@wdi/content/data/abilities.json';
import balance from '@wdi/content/data/balance.json';
import palette from '@wdi/content/data/palette.json';
import { Phase } from '@wdi/shared';
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
import { overlayRoot } from '../ui/dom';
import { mountSeatPicker } from '../ui/SeatPicker';
import { AudioBus } from '../view/AudioBus';
import { BodyView } from '../view/BodyView';
import { ClueView } from '../view/ClueView';
import { CutscenePlayer } from '../view/cutscene/CutscenePlayer';
import { GiverView } from '../view/GiverView';
import { MobView } from '../view/MobView';
import { NodeView } from '../view/NodeView';
import { EntityView } from '../view/EntityView';
import { Hud, type HudChip } from '../view/Hud';
import { Lighting } from '../view/Lighting';
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
import { loadSceneName } from '../view/sceneNames';
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
  | { kind: 'door'; id: string; x: number; y: number; boarded: boolean };

/** Clue ids this client has already collected, per feed: the prompt does not offer them again. */
const collectedBy = new WeakMap<WorldFeed, Set<string>>();

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
  private giverView!: GiverView;
  private cutscenes!: CutscenePlayer;
  private ground: GroundView | null = null;
  private bell: { x: number; y: number } | null = null;
  private statics!: StaticView;
  private readonly bodyViews = new Map<string, BodyView>();
  private hud!: Hud;
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
  /** What the last verb was, so a bare 422 reads as the deck's line for that verb. */
  private lastVerb: 'kill' | 'report' | 'other' = 'other';
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
    this.lastVerb = 'other';
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    const key = sceneMapKey(this.sceneId);
    if (!this.cache.tilemap.exists(key)) this.load.tilemapTiledJSON(key, sceneMapUrl(base, this.sceneId));
    // The match's map art (SPRITES 10.13): entries listing its map or mode that the boot did not load.
    const manifest = peekManifest(getFlags(this).art, base);
    if (manifest) queueMatchEntries(this.load, this, manifest, this.matchMap(), this.matchMode());
  }

  private matchMap(): string {
    return getNet(this).snapshot?.settings.map ?? DEFAULT_MAP_ID;
  }

  private matchMode(): 'main' | 'onub' {
    return getNet(this).snapshot?.settings.mode ?? 'main';
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
    this.giverView = new GiverView(this);
    this.entities = new EntityView(this, feed.selfId);

    this.hud = new Hud(overlayRoot());
    this.hud.setChip((this.registry.get(REG_ROLE_CHIP) as HudChip | undefined) ?? null);
    void loadSceneName(this.sceneId).then((scene) => this.hud.say(fill(C['hud.scene'], { scene }), 1500));
    this.hud.onNotebook(() => this.sheet.toggle());
    this.lighting = new Lighting(this, overlayRoot());
    this.lighting.setScene(sceneLights(this.map.lights), this.map.dark);
    this.sheet = new NotebookSheet(overlayRoot(), feed);
    this.audio = this.registry.get(REG_AUDIO) ?? new AudioBus();
    if (!this.registry.has(REG_AUDIO)) {
      this.registry.set(REG_AUDIO, this.audio);
      void this.audio.load().then(() => this.audio.play('ambient'));
    }
    this.cutscenes = new CutscenePlayer(this, overlayRoot(), this.audio);
    this.lastPhase = feed.clock().phase;

    const input: InputController = this.registry.get(REG_INPUT) ?? new InputController(feed);
    this.registry.set(REG_INPUT, input);
    input.setSink(feed);
    input.start();
    this.input_ = input;
    this.bindKeys();
    if (flags.touch || isTouchDevice()) {
      this.touch = new TouchControls(overlayRoot(), {
        onUse: (on) => (on ? this.startUse() : this.endUse()),
        onAct: () => this.abilityKey('Q'),
      });
      input.attachTouch(this.touch);
    }

    const net = getNet(this);
    const onNoise = (n: NoisePulse) => this.ring(n);
    const onError = (e: { code?: number; msg: string }) => {
      this.hud.say(this.refusal(e));
      if (e.code === 423 || e.code === 428) this.audio.play('door_locked');
    };
    const onFound = () => this.clueFound();
    // Round 6, 6J (locked): the death cutscene plays, then the ghost handoff as before.
    const onKilled = (m: { cutsceneId?: string }) =>
      void this.cutscenes.playDeath(m.cutsceneId).then(() => this.refreshGhost());
    const onAim = (m: { endsTick: number }) => this.openAim(m.endsTick);
    feed.bus.on('noise', onNoise);
    feed.bus.on('error', onError);
    feed.bus.on('clueFound', onFound);
    feed.bus.on('killed', onKilled);
    feed.bus.on('aim', onAim);
    net.bus.on('error', onError as never);
    this.offs.push(
      () => feed.bus.off('noise', onNoise),
      () => feed.bus.off('error', onError),
      () => feed.bus.off('clueFound', onFound),
      () => feed.bus.off('killed', onKilled),
      () => feed.bus.off('aim', onAim),
      () => net.bus.off('error', onError as never),
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
      this.giverView.destroy();
      this.cutscenes.destroy();
      this.ground?.destroy();
      this.ground = null;
      this.statics.destroy();
      for (const b of this.bodyViews.values()) b.destroy();
      this.bodyViews.clear();
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
    const darkness = darknessOf(clock.phase, clock.phaseEndsTick - clock.tick);
    this.hud.setPhase(PHASE_LABEL[clock.phase] ?? '', darkness >= 1);
    this.watchPhase(clock.phase);
    this.refreshGhost();

    const clues = feed.clues();
    const bodies = feed.bodies();
    this.clueView.update(clues, this.time.now);
    this.nodeView.update(feed.nodes(), this.time.now); // round 6, 6I (locked)
    this.mobView.update(feed.mobs(), this.time.now); // round 6, 6I (locked)
    this.syncBodies(bodies);
    this.drawDoors(clock.tick);
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
    input.bind('KeyE', (down) => (down ? this.startUse() : this.endUse()));
    input.bind('KeyN', (down) => down && this.sheet.toggle());
    for (const [code, slot] of Object.entries(ABILITY_SLOTS))
      input.bind(code, (down) => down && this.abilityKey(slot));
  }

  private onSleep(): void {
    this.endUse();
    this.input_.unbindAll();
    this.sheet.close();
    this.hud.setHidden(true);
    this.touch?.setHidden(true);
    this.lighting.setHidden(true);
  }

  private onWake(): void {
    this.hud.setHidden(false);
    this.touch?.setHidden(false);
    this.bindKeys();
  }

  /** E / Use pressed: act on the nearest target. A clue starts a hold that ends with `endUse`. */
  private startUse(): void {
    const t = this.target;
    if (!t) return this.hud.toast(C['toast.nothing'], 'interact');
    switch (t.kind) {
      case 'body':
        this.lastVerb = 'report';
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
      this.lastVerb = 'kill';
      this.feed.kill(near);
    } else this.feed.ability(row.id, near);
  }

  /** The handle of the avatar nearest to the own in reach: the Kill and the Bandage name a handle (GDD 3.17). */
  private nearestPlayer(reachTiles: number): string | null {
    return nearestAvatar(this.feed.avatars(), this.feed.selfHandle(), reachTiles * TILE_PX);
  }

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

  /** The deck's line for a refusal code; a bare 422 reads by the last verb (UI.md 14.3). */
  private refusal(e: { code?: number; msg: string }): string {
    if (e.code === undefined) return e.msg;
    if (e.code === 422)
      return this.lastVerb === 'kill'
        ? C['refuse.nothing']
        : this.lastVerb === 'report'
          ? C['refuse.reported']
          : C['refuse.generic'];
    return REFUSAL[e.code] ?? C['refuse.generic'];
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
