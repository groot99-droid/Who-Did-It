// Round 9 (9T, docs/round9/admin-studio.md 3): one editing session of one scene: the committed scene it started from,
// the history of edits, the selection and the palette choice. The view and the panel read it and call it.
import mitt from 'mitt';
import { scenes, type Scene } from '@wdi/content';
import { checkScene, type Checks } from './checks';
import { diffScene } from './diffScene';
import type { Gate, Path } from '@wdi/content';
import { paint, rectTiles, regionTiles, resize, type Cell, type Tool } from './gridEdit';
import { EditHistory } from './history';
import { addGate, addPath, removeRoute, setGateProfile } from './routeEdit';
import { pickAt } from './pick';
import { needlesOf, portalsTo, referencesTo } from './references';
import { duplicate, find, move, patch, place, remove, type Edit, type Kind, type Pick } from './sceneEdit';
import { templatesFor } from './templates';

const content = scenes as unknown as Record<string, Scene>;

export class EditorSession {
  readonly bus = mitt<{ change: undefined }>();
  /** The committed scene; the diff and the frozen ids are measured against it. */
  readonly base: Scene;
  private readonly history: EditHistory<Scene>;
  selection: Pick | null = null;
  /** The palette's choice; null means clicking selects and drags instead of placing. */
  palette: { kind: Kind; label: string } | null = null;
  /** What a click or drag does: pick and place objects, or paint the grid with `cell`. */
  tool: Tool = 'objects';
  cell: Cell = '#';
  name = '';
  /** The corners clicked so far for a path being drawn. */
  draft: Array<{ x: number; y: number }> = [];
  pathKind: Path['kind'] = 'patrol';
  gateProfile: Gate['minProfile'] = 'small';
  /** The last refused edit, until the next one succeeds. */
  error = '';

  constructor(sceneId: string) {
    this.base = structuredClone(content[sceneId]!);
    this.history = new EditHistory(structuredClone(this.base));
  }

  get scene(): Scene {
    return this.history.current;
  }
  get canUndo(): boolean {
    return this.history.canUndo;
  }
  get canRedo(): boolean {
    return this.history.canRedo;
  }
  private checked: { scene: Scene; result: Checks } | null = null;
  /** The live checks of the current scene, run once per edit. */
  get checks(): Checks {
    if (this.checked?.scene !== this.scene)
      this.checked = { scene: this.scene, result: checkScene(this.scene) };
    return this.checked.result;
  }
  get diff(): string[] {
    return diffScene(this.base, this.scene);
  }

  private apply(e: Edit, then?: Pick | null): boolean {
    if ('error' in e) {
      this.error = e.error;
    } else {
      this.error = '';
      this.history.push(e.scene);
      if (then !== undefined) this.selection = then;
    }
    this.bus.emit('change', undefined);
    return !('error' in e);
  }

  select(pick: Pick | null): void {
    this.selection = pick;
    this.bus.emit('change', undefined);
  }
  choose(choice: { kind: Kind; label: string } | null): void {
    this.palette = choice;
    this.bus.emit('change', undefined);
  }
  setTool(tool: Tool): void {
    this.tool = tool;
    this.bus.emit('change', undefined);
  }
  setCell(cell: Cell): void {
    this.cell = cell;
    this.bus.emit('change', undefined);
  }
  /** One undo step that sets the tiles to the chosen grid character. */
  paintTiles(tiles: Array<{ x: number; y: number }>): void {
    this.apply(paint(this.scene, tiles, this.cell));
  }
  /** The end of a rectangle drag. */
  paintRect(a: { x: number; y: number }, b: { x: number; y: number }): void {
    this.paintTiles(rectTiles(a, b));
  }
  resizeTo(w: number, h: number): void {
    this.apply(resize(this.scene, w, h));
  }
  /** The end of a gate drag. */
  addGateBetween(a: { x: number; y: number }, b: { x: number; y: number }): void {
    if (this.apply(addGate(this.scene, this.name, a, b, this.gateProfile))) this.name = '';
  }
  finishPath(): void {
    if (this.apply(addPath(this.scene, this.name, this.pathKind, this.draft))) {
      this.name = '';
      this.draft = [];
    }
  }
  clearDraft(): void {
    this.draft = [];
    this.bus.emit('change', undefined);
  }
  setPathKind(kind: Path['kind']): void {
    this.pathKind = kind;
  }
  setGateProfile(profile: Gate['minProfile'], id?: string): void {
    this.gateProfile = profile;
    if (id !== undefined) this.apply(setGateProfile(this.scene, id, profile));
  }
  removeRoute(id: string): void {
    this.apply(removeRoute(this.scene, id, this.base));
  }
  setName(name: string): void {
    this.name = name.trim();
  }

  /** A click on a tile: place the palette's choice there, or else select what is on it. */
  click(tx: number, ty: number): void {
    if (this.tool === 'fill') {
      this.paintTiles(regionTiles(this.scene, tx, ty));
      return;
    }
    if (this.tool === 'path') {
      this.draft = [...this.draft, { x: tx, y: ty }];
      this.bus.emit('change', undefined);
      return;
    }
    if (this.tool !== 'objects') return;
    const p = this.palette;
    if (p === null) return this.select(pickAt(this.scene, tx, ty));
    const t = templatesFor(p.kind, this.scene.id).find((e) => e.label === p.label);
    if (t === undefined) return;
    const made = place(this.scene, p.kind, this.name, tx, ty, t.fields);
    if (this.apply(made, undefined)) {
      this.selection = {
        kind: p.kind,
        id: p.kind === 'spawns' ? this.name : `${this.scene.prefix}.${this.name}`,
      };
      this.name = '';
      this.bus.emit('change', undefined);
    }
  }

  moveSelected(tx: number, ty: number): void {
    if (this.selection !== null) this.apply(move(this.scene, this.selection, tx, ty));
  }
  patchSelected(fields: Record<string, unknown>): void {
    if (this.selection !== null) this.apply(patch(this.scene, this.selection, fields));
  }
  duplicateSelected(): void {
    const sel = this.selection;
    if (sel === null) return;
    const copy = duplicate(this.scene, sel, this.name);
    if (this.apply(copy)) {
      this.selection = {
        kind: sel.kind,
        id: sel.kind === 'spawns' ? this.name : `${this.scene.prefix}.${this.name}`,
      };
      this.name = '';
      this.bus.emit('change', undefined);
    }
  }

  /** Every place that still names the selected frozen id: other scenes' portals, and any other data. */
  refsOf(pick: Pick): string[] {
    const others = Object.fromEntries(Object.entries(content).filter(([id]) => id !== this.scene.id));
    const direct = referencesTo(needlesOf(this.scene.id, pick.kind, pick.id), { scenes: others });
    return pick.kind === 'spawns' ? [...direct, ...portalsTo(this.scene.id, pick.id, content)] : direct;
  }
  removeSelected(): void {
    const sel = this.selection;
    if (sel === null) return;
    if (this.apply(remove(this.scene, sel, this.base, this.refsOf(sel)))) this.selection = null;
    this.bus.emit('change', undefined);
  }

  undo(): void {
    this.history.undo();
    if (this.selection !== null && find(this.scene, this.selection) === undefined) this.selection = null;
    this.error = '';
    this.bus.emit('change', undefined);
  }
  redo(): void {
    this.history.redo();
    this.error = '';
    this.bus.emit('change', undefined);
  }
}
