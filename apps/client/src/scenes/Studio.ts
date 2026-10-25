import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { mapOf, type SceneId } from '@wdi/content';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { setRoute } from '../flags';
import { captureToken, clearToken, loginUrl, type TokenStore } from '../admin/AdminNet';
import { connectStudio, type StudioLink } from '../admin/StudioNet';
import { mountControls } from '../studio/Controls';
import { createMockStudio } from '../studio/mockStudio';
import { figuresOf, FIGURE_ID } from '../studio/figures';
import { moveOf, moveToSend, StudioStore } from '../studio/model';
import { clearStudioMarker, setStudioMarker } from '../studio/route';
import { STUDIO_COPY as C } from '../ui/copy';
import { h, overlayRoot, type Screen } from '../ui/dom';
import { requestArtStyle } from '../view/artStyle';
import { applyFilters, peekManifest, queueMatchEntries, sceneMapKey, sceneMapUrl } from '../view/assets';
import { EntityView } from '../view/EntityView';
import { GroundView } from '../view/GroundView';
import { remoteDelayMs } from '../view/interpolation';
import { mapStatics } from '../view/mapDefs';
import { readSceneMap, type SceneMap, type TiledMap } from '../view/sceneMap';
import { StaticView } from '../view/StaticView';
import { getFlags } from './registry';
import '../ui/admin.css';
import '../ui/studio.css';

const colorOf = (hex: string) => Number.parseInt(hex.slice(1), 16);
/**
 * `studio.move` goes out every room tick (20 Hz), like `input.move`: the room drops a held move after 5 ticks of
 * silence, so a held vector is resent each tick and a zero vector is sent once (it stops the figure at once).
 */
const MOVE_MS = 50;

/** The tab's session storage, or a throwaway object where the browser blocks it. */
function sessionStore(): TokenStore {
  try {
    return window.sessionStorage;
  } catch {
    const mem = new Map<string, string>();
    return {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    };
  }
}

/**
 * The owner's Studio (round 9, docs/round9/admin-studio.md), started by `Preload` on `#/studio`: the same sign-in as
 * `#/admin`, then creative mode over the `studio` room: the isometric world of the current scene, the admin figure,
 * and the HUD of `../studio/Controls`. `?mock=1` runs it on the in-memory feed of `mockStudio.ts`.
 */
export class Studio extends Phaser.Scene {
  readonly store = new StudioStore();
  private link: StudioLink | null = null;
  private screens: Screen[] = [];
  private tokens: TokenStore = sessionStore();
  private map: SceneMap | null = null;
  private sceneId = '';
  private loading = false;
  private ground: GroundView | null = null;
  private statics: StaticView | null = null;
  private entities: EntityView | null = null;
  private markers!: Phaser.GameObjects.Graphics;
  private markerLabels: Phaser.GameObjects.Text[] = [];
  private lastTick = -1;
  private pressed = new Set<string>();
  private moveSeq = 0;
  private lastMove = '';
  private moveTimer: number | null = null;
  private onKeyDown = (e: KeyboardEvent) => this.key(e, true);
  private onKeyUp = (e: KeyboardEvent) => this.key(e, false);

  constructor() {
    super('Studio');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#14110f');
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
    this.markers = this.add.graphics().setDepth(1_000_000);
    if (getFlags(this).mock) {
      this.begin(createMockStudio());
      return;
    }
    const token = captureToken(location.hash, this.tokens, () => setRoute('studio'));
    clearStudioMarker(this.tokens);
    if (token === null) {
      this.showSignIn(false);
      return;
    }
    const wait = this.mount(h('p', { class: 'wdi-admin__notice', role: 'status' }, C['studio.connecting']));
    void connectStudio(token).then(
      (link) => {
        wait.destroy();
        this.begin(link);
      },
      () => {
        wait.destroy();
        clearToken(this.tokens);
        this.showSignIn(true);
      },
    );
  }

  private begin(link: StudioLink): void {
    this.link = link;
    link.bus.on('snapshot', (s) => this.store.applySnapshot(s));
    link.bus.on('log', (lines) => this.store.addLog(lines));
    link.bus.on('refused', (msg) => this.store.refuse(msg));
    link.bus.on('closed', () => {
      if (this.link !== link) return;
      this.link = null;
      this.stopInput();
      this.clearScreens();
      this.store.reset();
      this.showSignIn(true);
    });
    const root = this.mount(h('div', { class: 'wdi-admin' }));
    this.screens.push(
      mountControls(root.el, {
        send: (type, payload) => {
          this.store.clearRefusal();
          link.send(type, payload);
        },
        store: this.store,
        onSignOut: () => this.signOut(),
        onStyle: (id) => void requestArtStyle(id),
      }),
    );
    this.startInput();
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLSelectElement) return;
    if (down) this.pressed.add(e.code);
    else this.pressed.delete(e.code);
  }

  private startInput(): void {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.moveTimer = window.setInterval(() => this.sendMove(), MOVE_MS);
  }

  private stopInput(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.moveTimer !== null) window.clearInterval(this.moveTimer);
    this.moveTimer = null;
    this.pressed.clear();
  }

  private sendMove(): void {
    if (this.link === null) return;
    const m = moveOf(this.pressed);
    const { send, sig } = moveToSend(m, this.lastMove);
    if (!send) return;
    this.lastMove = sig;
    this.link.send('studio.move', { seq: ++this.moveSeq, dx: m.dx, dy: m.dy, sprint: m.sprint });
  }

  /** Loads a scene's tilemap and art, then swaps the world views over to it. */
  private enterScene(sceneId: string): void {
    this.loading = true;
    const base = import.meta.env.BASE_URL;
    const key = sceneMapKey(sceneId);
    if (!this.cache.tilemap.exists(key)) this.load.tilemapTiledJSON(key, sceneMapUrl(base, sceneId));
    const manifest = peekManifest(getFlags(this).art, base);
    if (manifest) queueMatchEntries(this.load, this, manifest, mapOf(sceneId as SceneId));
    const done = () => {
      this.loading = false;
      this.buildWorld(sceneId);
    };
    if (this.load.list.size === 0) done();
    else {
      this.load.once(Phaser.Loader.Events.COMPLETE, done);
      this.load.start();
    }
  }

  private buildWorld(sceneId: string): void {
    this.dropWorld();
    const key = sceneMapKey(sceneId);
    if (!this.cache.tilemap.exists(key)) return;
    this.sceneId = sceneId;
    this.map = readSceneMap(this.cache.tilemap.get(key).data as TiledMap);
    this.ground = new GroundView(this, key, this.map);
    applyFilters(
      this.textures,
      peekManifest(getFlags(this).art, import.meta.env.BASE_URL) ?? { version: 1, art: '', entries: [] },
    );
    this.statics = new StaticView(this);
    this.statics.set(
      mapStatics(this.map, {
        mapId: this.map.mapId ?? mapOf(sceneId as SceneId),
        theme: this.map.theme ?? '',
        hasFrame: (atlas, frame) => this.textures.exists(atlas) && this.textures.get(atlas).has(frame),
      }),
    );
    this.entities = new EntityView(this, '', () => undefined);
    this.cameras.main.setBackgroundColor(colorOf(palette.colors[this.map.voidColour])).setRoundPixels(true);
    this.lastTick = -1;
  }

  private dropWorld(): void {
    this.entities?.destroy();
    this.statics?.set([]);
    this.statics?.destroy();
    this.ground?.destroy();
    this.entities = this.statics = this.ground = null;
    this.map = null;
  }

  override update(): void {
    const snap = this.store.snapshot;
    if (snap === null) return;
    if (snap.sceneId !== this.sceneId && !this.loading) this.enterScene(snap.sceneId);
    if (this.map === null || this.entities === null || this.statics === null) return;
    if (snap.sceneId !== this.sceneId) return;
    if (snap.tick !== this.lastTick) {
      this.lastTick = snap.tick;
      const f = figuresOf(snap, TILE_PX);
      this.entities.setDelayMs(remoteDelayMs(snap.scale));
      this.entities.update(f.players, performance.now(), f.avatars, '');
      this.drawMarkers(f.markers);
    }
    const cam = this.cameras.main;
    const obj = this.entities.objectOf(FIGURE_ID);
    if (obj) cam.startFollow(obj, true, 0.15, 0.15);
    this.statics.update(null, this.game.loop.delta / 1000, cam.worldView);
  }

  private drawMarkers(list: ReadonlyArray<{ label: string; x: number; y: number }>): void {
    this.markers.clear().fillStyle(colorOf(palette.colors.mustard), 0.9);
    for (const t of this.markerLabels) t.destroy();
    this.markerLabels = list.map((m) => {
      const p = toScreen(m.x, m.y);
      this.markers.fillCircle(p.x, p.y - 8, 7);
      return this.add
        .text(p.x, p.y - 20, m.label, {
          fontFamily: 'Inter, sans-serif',
          fontSize: '12px',
          color: palette.colors.bone,
        })
        .setOrigin(0.5, 1)
        .setDepth(1_000_001);
    });
  }

  private showSignIn(failed: boolean): void {
    const button = h(
      'button',
      { type: 'button', class: 'wdi-admin__btn wdi-admin__btn--go', 'data-testid': 'studio-signin' },
      C['studio.signin.button'],
    );
    button.addEventListener('click', () => {
      setStudioMarker(this.tokens);
      location.href = loginUrl();
    });
    this.mount(
      h(
        'section',
        { class: 'wdi-admin__signin', 'aria-label': C['studio.title'], 'data-testid': 'studio-signin-panel' },
        h('h1', {}, C['studio.title']),
        h('p', {}, C['studio.signin.lead']),
        failed ? h('p', { class: 'wdi-admin__problem', role: 'alert' }, C['studio.signin.failed']) : null,
        button,
      ),
    );
  }

  private signOut(): void {
    clearToken(this.tokens);
    const link = this.link;
    this.link = null;
    link?.close();
    this.stopInput();
    this.clearScreens();
    this.dropWorld();
    this.sceneId = '';
    this.store.reset();
    this.showSignIn(false);
  }

  private mount<T extends HTMLElement>(el: T): Screen & { el: T } {
    overlayRoot().append(el);
    const screen = { el, destroy: () => el.remove() };
    this.screens.push(screen);
    return screen;
  }

  private clearScreens(): void {
    for (const s of this.screens) s.destroy();
    this.screens = [];
  }

  private teardown(): void {
    this.stopInput();
    this.dropWorld();
    this.link?.close();
    this.link = null;
    this.clearScreens();
  }
}
