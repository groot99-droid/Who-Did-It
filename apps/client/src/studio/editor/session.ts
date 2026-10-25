// Round 9 (9T, docs/round9/admin-studio.md 3): one editing session of one scene: the committed scene it started from,
// the history of edits, the selection and the palette choice. The view and the panel read it and call it.
import mitt from 'mitt';
import { scenes, type Scene } from '@wdi/content';
import { diffScene } from './diffScene';
import { EditHistory } from './history';
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
  name = '';
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
  setName(name: string): void {
    this.name = name.trim();
  }

  /** A click on a tile: place the palette's choice there, or else select what is on it. */
  click(tx: number, ty: number): void {
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
