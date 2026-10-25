import Phaser from 'phaser';
import palette from '@wdi/content/data/palette.json';
import { mapOf, type Scene, type SceneId } from '@wdi/content';
import { tilemapFor } from '@wdi/content/tilemap';
import { TILE_PX } from '@wdi/shared/constants';
import { toScreen } from '@wdi/shared/iso';
import { setRoute } from '../flags';
import { captureToken, clearToken, loginUrl, type TokenStore } from '../admin/AdminNet';
import { connectStudio, type StudioLink, type StudioSnapshot } from '../admin/StudioNet';
import { BUILD_VERSION } from '../health';
import { mountControls } from '../studio/Controls';
import { createMockStudio, mockReportApi, mockSaveApi } from '../studio/mockStudio';
import { EditorView } from '../studio/editor/EditorView';
import { mountEditorPanel } from '../studio/editor/EditorPanel';
import { EditorSession } from '../studio/editor/session';
import { mountInbox } from '../studio/InboxPanel';
import { mountReportPanel } from '../studio/ReportPanel';
import { createReportApi, type ReportApi } from '../studio/reportApi';
import { createSaveApi, type SaveApi } from '../studio/saveApi';
import { clearDraft, createDraftApi, draftOn, mockDraftApi, type DraftApi } from '../studio/draftApi';
import { requestOf } from '../studio/reportContext';
import { figuresOf, FIGURE_ID } from '../studio/figures';
import { OverlayView } from '../studio/OverlayView';
import { moveOf, moveToSend, StudioStore } from '../studio/model';
import { clearStudioMarker, setStudioMarker } from '../studio/route';
import { STUDIO_COPY as C } from '../ui/copy';
import { h, overlayRoot, type Screen } from '../ui/dom';
import { currentStyleId, requestArtStyle } from '../view/artStyle';
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
  private overlay: OverlayView | null = null;
  private markers!: Phaser.GameObjects.Graphics;
  private markerLabels: Phaser.GameObjects.Text[] = [];
  private lastTick = -1;
  private pressed = new Set<string>();
  /** The mouse in game px, tracked on the window because the HUD's DOM layer sits over the canvas. */
  private mouse: { x: number; y: number } | null = null;
  private onMouse = (e: PointerEvent) => {
    this.mouse = { x: this.scale.transformX(e.pageX), y: this.scale.transformY(e.pageY) };
  };
  private api: ReportApi | null = null;
  private saveApi: SaveApi | null = null;
  private draftApi: DraftApi | null = null;
  /** Walk it: the scene the room serves as an unsaved draft, and the editing session to return to. */
  private draft: { scene: Scene; session: EditorSession; seen: boolean } | null = null;
  /** The draft scene the world views were built from, or null while they show the committed scene. */
  private drawnDraft: Scene | null = null;
  private mock = false;
  private dialog: Screen | null = null;
  private editor: { session: EditorSession; view: EditorView; panel: Screen } | null = null;
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
    this.mock = getFlags(this).mock;
    if (this.mock) {
      this.begin(createMockStudio());
      return;
    }
    const token = captureToken(location.hash, this.tokens, () => setRoute('studio'));
    this.api = token === null ? null : createReportApi(token);
    this.saveApi = token === null ? null : createSaveApi(token);
    this.draftApi = token === null ? null : createDraftApi(token);
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
      this.draft = null;
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
        onReport: () => void this.openReport(),
        onInbox: () => this.openInbox(),
        onEdit: () => this.toggleEdit(),
      }),
    );
    this.startInput();
  }

  /** F8 or the Report button: the canvas as it is now, in a dialog to mark up and send. */
  private async openReport(): Promise<void> {
    const snapshot = this.store.snapshot;
    if (this.dialog !== null || snapshot === null) return;
    const image = await new Promise<HTMLImageElement | null>((done) =>
      this.game.renderer.snapshot((img) => done(img instanceof HTMLImageElement ? img : null)),
    );
    const api = this.api ?? mockReportApi;
    if (image === null || this.dialog !== null) return;
    this.dialog = mountReportPanel(overlayRoot(), {
      image,
      build: (png, note) =>
        requestOf(
          png,
          note,
          {
            snapshot: this.store.snapshot ?? snapshot,
            build: BUILD_VERSION,
            style: currentStyleId(),
            overlays: this.store.overlays,
          },
          this.store.log,
        ),
      send: (req) => api.send(req),
      onClose: () => this.closeDialog(),
    });
  }

  /** Edit on: the sim pauses, the camera is the owner's to pan, the scene's objects are drawn and editable. */
  private toggleEdit(): void {
    if (this.editor !== null) return this.stopEdit();
    if (this.draft !== null) return this.backToEdit();
    const snap = this.store.snapshot;
    if (snap === null || this.link === null || this.map === null) return;
    this.openEditor(new EditorSession(snap.sceneId));
  }

  private openEditor(session: EditorSession): void {
    this.link?.send('studio.clock', { paused: true });
    this.editor = {
      session,
      view: new EditorView(this, session),
      panel: mountEditorPanel(overlayRoot(), session, this.saveApi ?? mockSaveApi, () => this.walkIt()),
    };
    this.cameras.main.stopFollow();
    this.store.setEditing(true);
  }

  private closeEditor(): void {
    this.editor?.view.destroy();
    this.editor?.panel.destroy();
    this.editor = null;
    this.link?.send('studio.clock', { paused: false });
    this.store.setEditing(false);
  }

  /** Edit off: the sim runs again and a draft in the room is dropped. */
  private stopEdit(): void {
    this.closeEditor();
    this.endWalk();
  }

  /** Walk it: the room serves the edited scene unsaved (S5); the editor steps aside, keeping its session. */
  private async walkIt(): Promise<void> {
    const ed = this.editor;
    if (ed === null || this.link === null) return;
    const scene = ed.session.scene;
    await (this.draftApi ?? mockDraftApi).upload(this.link.roomId, scene);
    this.draft = { scene, session: ed.session, seen: false };
    this.closeEditor();
    const bar = this.mount(
      h(
        'section',
        { class: 'wdi-admin__controls wdi-studio__walkbar', 'data-testid': 'studio-walkbar' },
        h('span', {}, C['studio.walk.title']),
        this.walkBtn('studio-walk-back', C['studio.walk.back'], () => this.backToEdit()),
        this.walkBtn('studio-walk-discard', C['studio.walk.discard'], () => this.endWalk()),
      ),
    );
    this.walkBar = bar;
  }

  private walkBar: Screen | null = null;

  private walkBtn(testid: string, label: string, onClick: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'wdi-admin__btn', 'data-testid': testid }, label);
    b.addEventListener('click', onClick);
    return b;
  }

  /** The walk bar's way back: the editor reopens on the same session; the room keeps the draft until the next Walk it. */
  private backToEdit(): void {
    const d = this.draft;
    if (d === null) return;
    this.walkBar?.destroy();
    this.walkBar = null;
    this.openEditor(d.session);
  }

  /** Leaves Walk it for good: the bar goes, the room serves the committed scene, the world redraws it. */
  private endWalk(): void {
    this.walkBar?.destroy();
    this.walkBar = null;
    if (this.draft === null) return;
    this.draft = null;
    if (this.link !== null) clearDraft(this.link);
  }

  private openInbox(): void {
    if (this.dialog !== null) return;
    this.dialog = mountInbox(overlayRoot(), this.api ?? mockReportApi, () => this.closeDialog());
  }

  private closeDialog(): void {
    this.dialog?.destroy();
    this.dialog = null;
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (down && e.code === 'F8') {
      e.preventDefault();
      if (this.dialog === null) void this.openReport();
      else this.closeDialog();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.target instanceof HTMLSelectElement) return;
    if (down) this.pressed.add(e.code);
    else this.pressed.delete(e.code);
  }

  private startInput(): void {
    window.addEventListener('pointermove', this.onMouse);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.moveTimer = window.setInterval(() => this.sendMove(), MOVE_MS);
  }

  private stopInput(): void {
    window.removeEventListener('pointermove', this.onMouse);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    if (this.moveTimer !== null) window.clearInterval(this.moveTimer);
    this.moveTimer = null;
    this.pressed.clear();
  }

  private sendMove(): void {
    if (this.link === null || this.editor !== null) return;
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

  /** The tilemap cache key of a scene's map, or of the draft's, which is built in the browser from the edited scene. */
  private mapKeyOf(sceneId: string, draft: Scene | null): string {
    const key = sceneMapKey(sceneId);
    if (draft === null) return key;
    const draftKey = `${key}:draft`;
    this.cache.tilemap.remove(draftKey);
    this.cache.tilemap.add(draftKey, { format: Phaser.Tilemaps.Formats.TILED_JSON, data: tilemapFor(draft) });
    return draftKey;
  }

  private buildWorld(sceneId: string, draft: Scene | null = null): void {
    this.dropWorld();
    let key: string;
    try {
      key = this.mapKeyOf(sceneId, draft);
      this.drawnDraft = draft;
    } catch (e) {
      this.store.refuse(e instanceof Error ? e.message : String(e));
      this.drawnDraft = null;
      key = sceneMapKey(sceneId);
    }
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
    this.overlay = new OverlayView(this);
    this.cameras.main.setBackgroundColor(colorOf(palette.colors[this.map.voidColour])).setRoundPixels(true);
    this.lastTick = -1;
  }

  private dropWorld(): void {
    if (this.editor !== null) this.stopEdit();
    this.overlay?.destroy();
    this.overlay = null;
    this.entities?.destroy();
    this.statics?.set([]);
    this.statics?.destroy();
    this.ground?.destroy();
    this.entities = this.statics = this.ground = null;
    this.map = null;
    this.drawnDraft = null;
  }

  override update(): void {
    const snap = this.store.snapshot;
    if (snap === null) return;
    if (snap.sceneId !== this.sceneId && !this.loading) this.enterScene(snap.sceneId);
    if (this.map === null || this.entities === null || this.statics === null) return;
    if (snap.sceneId !== this.sceneId) return;
    this.followDraft(snap);
    if (snap.tick !== this.lastTick) {
      this.lastTick = snap.tick;
      const f = figuresOf(snap, TILE_PX);
      this.entities.setDelayMs(remoteDelayMs(snap.scale));
      this.entities.update(f.players, performance.now(), f.avatars, '');
      this.drawMarkers(f.markers);
    }
    const cam = this.cameras.main;
    const obj = this.entities.objectOf(FIGURE_ID);
    if (this.editor !== null) this.panCamera(cam);
    else if (obj) cam.startFollow(obj, true, 0.15, 0.15);
    this.overlay?.update(this.store.overlays, snap, this.mouse);
    this.statics.update(null, this.game.loop.delta / 1000, cam.worldView);
  }

  /** The world shows the draft while the room serves it; the room dropping it (a door to another scene) ends Walk it. */
  private followDraft(snap: StudioSnapshot): void {
    const d = this.draft;
    if (d !== null && !this.mock) {
      if (draftOn(snap)) d.seen = true;
      else if (d.seen) this.endWalk();
    }
    const want = this.draft !== null && snap.sceneId === this.draft.scene.id ? this.draft.scene : null;
    if (want !== this.drawnDraft && !this.loading) this.buildWorld(this.sceneId, want);
  }

  /** The arrows and WASD scroll the camera while editing, since the figure stands still. */
  private panCamera(cam: Phaser.Cameras.Scene2D.Camera): void {
    const m = moveOf(this.pressed);
    cam.scrollX += m.dx * 8;
    cam.scrollY += m.dy * 8;
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
    this.closeDialog();
    this.api = null;
    clearToken(this.tokens);
    const link = this.link;
    this.link = null;
    link?.close();
    this.stopInput();
    this.clearScreens();
    this.walkBar = null;
    this.draft = null;
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
    this.closeDialog();
    this.dropWorld();
    this.link?.close();
    this.link = null;
    this.clearScreens();
  }
}
