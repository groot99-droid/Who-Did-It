import Phaser from 'phaser';
import abilitiesJson from '@wdi/content/data/abilities.json';
import balance from '@wdi/content/data/balance.json';
import onubBalance from '@wdi/content/data/balance.onub.json';
import palette from '@wdi/content/data/palette.json';
import { Phase } from '@wdi/shared';
import { ONUB_SET_PLATE, TICK_RATE, TILE_PX } from '@wdi/shared/constants';
import { dirFromVector } from '@wdi/shared/direction';
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
  type WorldFeedEvents,
} from '../net/world';
import { WORLD_COPY as C, fill } from '../ui/copy';
import { overlayRoot } from '../ui/dom';
import { AudioBus } from '../view/AudioBus';
import { BodyView } from '../view/BodyView';
import { ClueView } from '../view/ClueView';
import { EntityView } from '../view/EntityView';
import { Hud, type HudChip } from '../view/Hud';
import { Lighting } from '../view/Lighting';
import { NotebookSheet } from '../view/NotebookPanel';
import { PropView, overworldProps } from '../view/PropView';
import { sceneMapKey, sceneMapUrl } from '../view/assets';
import { isTouchDevice, readDevFlags } from '../view/devFlags';
import {
  ACT_RANGE_PX,
  PLATE_HOLD_MS,
  bakerySpots,
  pickAct,
  promptFor,
  revealLine,
  roleName,
  type ActChoice,
} from '../view/quickMode';
import { loadSceneName } from '../view/sceneNames';
import { REG_AUDIO, getNet } from './registry';

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
  /** Quick mode, dusk: the own plate, held to set it. */
  | { kind: 'plate'; id: string; x: number; y: number }
  /** Quick mode, a night window: the act the nearest prop in reach offers. */
  | { kind: 'act'; choice: ActChoice; x: number; y: number };

/** Clue ids this client has already collected, per feed: the prompt does not offer them again. */
const collectedBy = new WeakMap<WorldFeed, Set<string>>();
/** The World scene shows about this many tiles top to bottom whatever the window size. */
const VIEW_TILES_HIGH = 11;

interface PortalSpot {
  id: string;
  x: number;
  y: number;
}

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);

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
  private propView!: PropView;
  private readonly bodyViews = new Map<string, BodyView>();
  private hud!: Hud;
  private lighting!: Lighting;
  private sheet!: NotebookSheet;
  private audio!: AudioBus;
  private input_!: InputController;
  private touch: TouchControls | null = null;
  private portals: PortalSpot[] = [];
  private swing!: Phaser.GameObjects.Graphics;
  private mapW = 0;
  private mapH = 0;
  private followed = false;
  private fpsAt = 0;
  private showFps = false;
  private prevScaleMode: number = Phaser.Scale.FIT;
  private offs: Array<() => void> = [];
  private target: Target | null = null;
  private hold: { clueId: string; since: number; x: number; y: number } | null = null;
  private focusEntry: { had: number; until: number } | null = null;
  private wasDead = false;
  /** Quick mode (GDD 3.11): this run is the bakery of a quick-mode match. */
  private quick = false;
  /** Quick mode: a hold that finishes on the client (the plate, a night act) and sends one `act.ability`. */
  private local: { since: number; x: number; y: number; ms: number; done: () => void } | null = null;
  /** Quick mode: the first pick of a `picks: 2` act, held until the second. */
  private firstPick: { act: string; targetId: string } | null = null;
  private plateSet = false;
  private revealLines: string[] = [];
  /** What the last verb was, so a bare 422 reads as the deck's line for that verb. */
  private lastVerb: 'kill' | 'report' | 'other' = 'other';
  private lastPhase = -1;
  private stepAt = 0;
  private lit = { visible: false, x: 0, y: 0, darkness: 0 };

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
    this.local = null;
    this.firstPick = null;
    this.plateSet = false;
    this.revealLines = [];
    this.lastVerb = 'other';
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
    this.quick = this.sceneId === 'bakery' && feed.mode() === 'onub';
    this.propView = new PropView(this, this.sceneId, this.quick);
    this.clueView = new ClueView(this);
    this.entities = new EntityView(this, feed.selfId);

    this.hud = new Hud(overlayRoot());
    this.hud.setChip((this.registry.get(REG_ROLE_CHIP) as HudChip | undefined) ?? null);
    void loadSceneName(this.sceneId).then((scene) => this.hud.say(fill(C['hud.scene'], { scene }), 1500));
    this.hud.onNotebook(() => this.sheet.toggle());
    this.lighting = new Lighting(overlayRoot());
    this.sheet = new NotebookSheet(overlayRoot(), feed);
    this.audio = this.registry.get(REG_AUDIO) ?? new AudioBus();
    if (!this.registry.has(REG_AUDIO)) {
      this.registry.set(REG_AUDIO, this.audio);
      void this.audio.load().then(() => this.audio.play('ambient'));
    }
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
    const onKilled = () => this.refreshGhost();
    const onReveal = ({ entries }: WorldFeedEvents['nightReveal']) => this.showReveals(entries, true);
    feed.bus.on('noise', onNoise);
    feed.bus.on('nightReveal', onReveal);
    feed.bus.on('error', onError);
    feed.bus.on('clueFound', onFound);
    feed.bus.on('killed', onKilled);
    net.bus.on('error', onError as never);
    this.offs.push(
      () => feed.bus.off('noise', onNoise),
      () => feed.bus.off('error', onError),
      () => feed.bus.off('clueFound', onFound),
      () => feed.bus.off('killed', onKilled),
      () => feed.bus.off('nightReveal', onReveal),
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
    // The mask is placed after the camera has followed you, or it would trail a frame behind.
    const cam = this.cameras.main;
    cam.on(Phaser.Cameras.Scene2D.Events.POST_RENDER, this.placeMask, this);

    if (flags.navDebug) this.drawNavDebug();
    this.showFps = flags.fps;

    // A meeting sleeps this scene (Meeting never touches view/**): hide every DOM layer, let go of the keys.
    this.events.on(Phaser.Scenes.Events.SLEEP, this.onSleep, this);
    this.events.on(Phaser.Scenes.Events.WAKE, this.onWake, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.SLEEP, this.onSleep, this);
      this.events.off(Phaser.Scenes.Events.WAKE, this.onWake, this);
      cam.off(Phaser.Cameras.Scene2D.Events.POST_RENDER, this.placeMask, this);
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fitCamera, this);
      this.scale.scaleMode = this.prevScaleMode;
      this.scale.displaySize.setAspectMode(this.prevScaleMode);
      host?.classList.remove('wdi-fill');
      this.scale.getParentBounds();
      this.scale.refresh();
      this.offs.forEach((off) => off());
      this.endUse();
      input.unbindAll();
      this.entities.destroy();
      this.clueView.destroy();
      this.propView.destroy();
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
    if (this.quick && feed.wake() !== null) this.showReveals(feed.nightReveal(), false);
  }

  override update(): void {
    const now = performance.now();
    const feed = this.feed;
    this.entities.update(feed.snapshot(), now);
    const self = this.entities.objectOf(feed.selfId);
    if (self && !this.followed) {
      this.followed = true;
      this.cameras.main.startFollow(self, true, 0.1, 0.1);
      this.cameras.main.centerOn(self.x, self.y);
    }
    const clock = feed.clock();
    // A quick-mode window has its own end; the night's end covers every window.
    const win = this.quick ? feed.wake() : null;
    const endsTick = win ? win.endsTick : clock.phaseEndsTick;
    this.hud.setTimer(endsTick > 0 ? endsTick - clock.tick : null);
    this.hud.setBanner(win ? fill(C['quick.window'], { role: roleName(win.windowRole) }) : null);
    if (this.quick) {
      this.entities.setMates(new Set(feed.mates()));
      this.propView.update(feed.props(), (id) => this.nameOf(id), feed.selfId);
    }
    const darkness = Lighting.darkness(
      clock.phase,
      clock.phaseEndsTick - clock.tick,
      this.quick ? onubBalance.timers.duskS * TICK_RATE : undefined,
    );
    this.hud.setPhase(PHASE_LABEL[clock.phase] ?? '', darkness >= 1);
    this.watchPhase(clock.phase);
    this.refreshGhost();

    const clues = feed.clues();
    const bodies = feed.bodies();
    this.clueView.update(clues, this.time.now);
    this.syncBodies(bodies);
    this.drawDoors(clock.tick);
    this.updateTarget(self, clues, bodies);
    this.updateHold(self, clues);
    this.footsteps(now);
    this.sheet.update();
    this.focusNewEntry();

    this.lit = {
      visible: WORLD_PHASES.has(clock.phase) && self !== null,
      x: self?.x ?? 0,
      y: self?.y ?? 0,
      darkness,
    };
    if (this.showFps && now - this.fpsAt > 500) {
      this.fpsAt = now;
      const loop = this.game.loop;
      this.hud.setFps(
        `${Math.round(loop.actualFps)} fps\n${this.entities.count} in view\n${this.sceneId}\nat ${self ? `${(self.x / TILE_PX).toFixed(1)},${(self.y / TILE_PX).toFixed(1)}` : '-'}\nbodies ${bodies.length}\nclues ${clues.length}`,
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
      case 'plate':
        this.beginLocal(t, PLATE_HOLD_MS, () => {
          this.plateSet = true;
          this.feed.ability(ONUB_SET_PLATE, t.id);
          this.hud.toast(C['quick.plate.set'], 'interact');
        });
        break;
      case 'act':
        this.beginLocal(t, t.choice.act.holdS * 1000, () => this.sendAct(t.choice));
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
    this.cancelLocal();
    const h = this.hold;
    if (!h) return;
    this.hold = null;
    this.clueView?.setHold(null);
    this.feed.hold('collect', h.clueId, false);
    this.hud.toast(C['toast.collect.cancel'], 'interact');
  }

  /** Quick mode: starts a client-side hold at a prop; `done` runs when the ring is full. */
  private beginLocal(at: { x: number; y: number }, ms: number, done: () => void): void {
    if (this.local) return;
    this.local = { since: this.time.now, x: at.x, y: at.y, ms, done };
  }

  private cancelLocal(): void {
    if (!this.local) return;
    this.local = null;
    this.clueView?.setHold(null);
    this.hud?.toast(C['toast.collect.cancel'], 'interact');
  }

  /** A finished act hold: one pick sends at once, the first of two is kept until the second. */
  private sendAct({ act, prop, second }: ActChoice): void {
    if (act.picks === 2 && !second) {
      this.firstPick = { act: act.act, targetId: prop.id };
      this.hud.toast(C['quick.pick.first'], 'interact');
    } else if (act.picks === 2 && this.firstPick) {
      this.feed.ability(act.act, this.firstPick.targetId, prop.id);
      this.firstPick = null;
    } else this.feed.ability(act.act, prop.id);
  }

  /** Q, R or F: the card's ability on that key, aimed at the nearest living player in reach. */
  private abilityKey(slot: string): void {
    if (this.feed.dead()) return;
    const row = getNet(this).roleCard?.abilities.find((a) => a.key === slot);
    const def = row ? ABILITY_DEFS[row.id] : undefined;
    if (!row || !def || def.kind !== 'active') return;
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

  private nearestPlayer(reachTiles: number): string | null {
    const snaps = this.feed.snapshot();
    const me = snaps.find((s) => s.id === this.feed.selfId)?.presence;
    if (!me) return null;
    let best: string | null = null;
    let bestD = reachTiles * TILE_PX;
    for (const s of snaps) {
      if (s.id === this.feed.selfId || s.presence === null) continue;
      const d = Math.hypot(s.presence.x - me.x, s.presence.y - me.y);
      if (d <= bestD) {
        bestD = d;
        best = s.id;
      }
    }
    return best;
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
    if (this.quick) return this.updateQuickTarget(self);
    const ghost = this.feed.dead();
    let best = Infinity;
    const consider = (t: Target, reach: number) => {
      const d = Math.hypot(self.x - t.x, self.y - t.y);
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
      const bell =
        this.sceneId === 'overworld' ? overworldProps().find((p) => p.id === 'ov.bell') : undefined;
      if (bell) consider({ kind: 'bell', x: bell.x, y: bell.y }, BELL_REACH_PX);
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

  /**
   * Quick mode (GDD 3.11): no doors, bodies or clues here. In dusk the own plate offers "Set your plate";
   * in a night window the nearest prop in reach offers the window's act for it (`pickAct`).
   */
  private updateQuickTarget(self: Phaser.GameObjects.Container): void {
    const feed = this.feed;
    const spots = bakerySpots(feed.props());
    const win = feed.wake();
    if (win) {
      const seen = new Set(feed.snapshot().flatMap((p) => (p.presence ? [p.id] : [])));
      const choice = pickAct({
        role: win.windowRole,
        spots,
        selfId: feed.selfId,
        self,
        first: this.firstPick,
        alone: !feed.mates().some((id) => seen.has(id)),
      });
      if (choice) {
        this.target = { kind: 'act', choice, x: choice.prop.x, y: choice.prop.y };
        return this.hud.setPrompt(promptFor(choice));
      }
    } else if (feed.clock().phase === Phase.dusk && !this.plateSet) {
      const own = spots.find((p) => p.kind === 'plate' && p.of === feed.selfId);
      if (own && Math.hypot(self.x - own.x, self.y - own.y) <= ACT_RANGE_PX) {
        this.target = { kind: 'plate', id: own.id, x: own.x, y: own.y };
        return this.hud.setPrompt(C['prompt.plate.set']);
      }
    }
    this.hud.setPrompt(null);
  }

  /** Draws the collect ring and drops the hold when the server has surely cancelled it. */
  private updateHold(self: Phaser.GameObjects.Container | null, clues: ClueSnap[]): void {
    const l = this.local;
    if (l) {
      const moving = this.input_.current();
      if (
        !self ||
        Math.hypot(self.x - l.x, self.y - l.y) > ACT_RANGE_PX + 8 ||
        moving.dx !== 0 ||
        moving.dy !== 0
      )
        return this.cancelLocal();
      const progress = (this.time.now - l.since) / l.ms;
      if (progress < 1) return this.clueView.setHold({ x: l.x, y: l.y }, progress);
      this.local = null;
      this.clueView.setHold(null);
      return l.done();
    }
    const h = this.hold;
    if (!h) return;
    const moving = this.input_.current();
    const clue = clues.find((c) => c.id === h.clueId);
    const away = !self || !clue || Math.hypot(self.x - clue.x, self.y - clue.y) > COLLECT_REACH_PX + 8;
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
    if (phase === Phase.dusk) {
      const duskS = this.quick ? onubBalance.timers.duskS : balance.phases.duskS;
      this.hud.toast(fill(C['toast.dusk'], { duskS }), 'warm', undefined, 5000);
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

  /** What a fresh World run should say about where it starts: back from a meeting, a ghost, the quick-mode dusk. */
  private entryToasts(): void {
    const clock = this.feed.clock();
    if (clock.phase === Phase.immunity)
      this.hud.toast(C['toast.immunity'], 'warm', undefined, 4000, `immunity:${clock.phaseEndsTick}`);
    if (this.feed.dead()) this.hud.say(C['ghost.walk'], 5000);
    if (this.quick && clock.phase === Phase.dusk)
      this.hud.toast(C['quick.dusk'], 'interact', undefined, 6000, `dusk:${clock.startTick}`);
  }

  /** A seat's public name for the plate labels and the reveal lines. */
  private nameOf(seatId: string): string {
    return this.feed.snapshot().find((p) => p.id === seatId)?.name ?? '?';
  }

  /** Quick mode: shows what a night act revealed, as a toast each (`toasts`) and a HUD line until the window ends. */
  private showReveals(entries: Array<{ slot: string; of: string; roleId: string }>, toasts: boolean): void {
    this.revealLines = entries.map((e) => revealLine(e, (id) => this.nameOf(id)));
    this.hud.setReveals(this.revealLines);
    if (toasts) for (const line of this.revealLines) this.hud.toast(line, 'warm', undefined, 6000);
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

  /** Positions the night mask over you once the camera has moved (camera POST_RENDER). */
  private placeMask(cam: Phaser.Cameras.Scene2D.Camera): void {
    const l = this.lit;
    const sx = (l.x - cam.worldView.x) * cam.zoom;
    const sy = (l.y - cam.worldView.y) * cam.zoom;
    this.lighting.update(l.visible, sx, sy, cam.zoom, l.darkness);
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

  /** A noise pulse: an expanding ring at its source, a log line and, off screen, an edge cue pointing to it. */
  private ring(n: NoisePulse): void {
    if (n.sceneId !== this.sceneId) return;
    const scream = /scream/i.test(n.kind);
    const col = colorOf(scream ? palette.colors.magenta : palette.colors.lantern);
    const g = this.add.circle(n.x, n.y, 8).setStrokeStyle(4, col).setDepth(1);
    this.tweens.add({ targets: g, scale: 8, alpha: 0, duration: 700, onComplete: () => g.destroy() });
    const me = this.entities.objectOf(this.feed.selfId);
    const dir = me ? dirFromVector(n.x - me.x, n.y - me.y) : null;
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
    const sx = (n.x - cam.worldView.x) * cam.zoom;
    const sy = (n.y - cam.worldView.y) * cam.zoom;
    if (sx >= 0 && sx <= width && sy >= 0 && sy <= height) return;
    const dx = sx - width / 2;
    const dy = sy - height / 2;
    const k = Math.min((width / 2 - 48) / Math.abs(dx || 1e-6), (height / 2 - 48) / Math.abs(dy || 1e-6));
    this.hud.edgeCue(width / 2 + dx * k, height / 2 + dy * k, Math.atan2(dx, -dy), label);
  }

  /** ?navdebug=1: outline every solid tile from the tilemap's ground layer for collision debugging. */
  private drawNavDebug(): void {
    const g = this.add.graphics().setDepth(999_999);
    g.lineStyle(1, colorOf(palette.colors.magenta), 0.6);
    g.strokeRect(0, 0, this.mapW, this.mapH);
  }
}
