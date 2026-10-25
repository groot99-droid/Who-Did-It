// Round 9 (9W, N3): the NPC editor's state: the routines file being edited, the figure and phase on show, undo, and
// the two ways out (live preview, save). No Phaser, no DOM: the view and panel read it and listen on `bus`.
import { content, type RoutinesFile } from '@wdi/content';
import type { SaveApi, SaveResponse } from '../saveApi';
import { SaveError } from '../saveApi';
import type { NpcDraftApi } from './npcApi';
import { PHASES, type ScrubPhase } from './routes';
import { newErrors, type Edit } from './routinesEdit';

export class NpcModel {
  readonly bus = new EventTarget();
  routines: RoutinesFile = content.routines;
  figure: string = Object.keys(content.routines.townsfolk)[0] ?? '';
  phase: ScrubPhase = 'day';
  /** The last refused edit or failed call, for the panel; empty when all is well. */
  problems: string[] = [];
  private readonly past: RoutinesFile[] = [];

  private emit(): void {
    this.bus.dispatchEvent(new Event('change'));
  }

  get changed(): boolean {
    return this.routines !== content.routines;
  }

  select(figure: string): void {
    if (figure in this.routines.townsfolk) this.figure = figure;
    this.emit();
  }

  scrub(phase: ScrubPhase): void {
    if ((PHASES as readonly string[]).includes(phase)) this.phase = phase;
    this.emit();
  }

  /** Applies an edit unless it adds an error the committed file does not already have. */
  apply(edit: Edit): boolean {
    if ('error' in edit) {
      this.problems = [edit.error];
      this.emit();
      return false;
    }
    const added = newErrors(edit.routines);
    if (added.length > 0) {
      this.problems = added;
      this.emit();
      return false;
    }
    this.past.push(this.routines);
    this.routines = edit.routines;
    this.problems = [];
    this.emit();
    return true;
  }

  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.routines = prev;
    this.problems = [];
    this.emit();
  }

  /** Sends the edited routines to the open Studio room as its NPC draft. */
  async preview(api: NpcDraftApi, roomId: string): Promise<boolean> {
    try {
      await api.upload(roomId, { routines: this.routines });
      this.problems = [];
      return true;
    } catch (e) {
      this.problems = e instanceof SaveError && e.problems.length > 0 ? e.problems : [message(e)];
      return false;
    } finally {
      this.emit();
    }
  }

  /** Saves the whole file in its key order; the server opens one draft PR. */
  async save(api: SaveApi, note: string): Promise<SaveResponse | null> {
    try {
      const out = await api.save({ file: 'routines.json', json: this.routines, ...(note ? { note } : {}) });
      this.problems = [];
      return out;
    } catch (e) {
      this.problems = e instanceof SaveError && e.problems.length > 0 ? e.problems : [message(e)];
      return null;
    } finally {
      this.emit();
    }
  }
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));
