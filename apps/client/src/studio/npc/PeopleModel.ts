// Round 9 (9W, N4): the people half of the NPC editor's state: the working copies of the current scene's givers,
// `quests.json` and `talk.json`, one undo stack, and one save per changed file. Role secrecy: only quest NPCs and talk
// lines are held; no seat, card or role is read or written here.
import { content, scenes, type QuestsFile, type Scene, type TalkFile } from '@wdi/content';
import { SaveError, type SaveApi, type SaveResponse } from '../saveApi';
import type { NpcDraftApi } from './npcApi';
import { questErrors, sceneErrors, talkErrors, type Done } from './people';

interface Snap {
  scenes: Record<string, Scene>;
  quests: QuestsFile;
  talk: TalkFile;
}

const message = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export class PeopleModel {
  readonly bus = new EventTarget();
  edited: Record<string, Scene> = {};
  quests: QuestsFile = content.quests;
  talk: TalkFile = content.talk;
  selected: string | null = null;
  problems: string[] = [];
  private readonly past: Snap[] = [];

  constructor(private readonly sceneId: () => string | null) {}

  private emit(): void {
    this.bus.dispatchEvent(new Event('change'));
  }

  /** The scene the owner is in, with this editor's unsaved giver edits. */
  get scene(): Scene | null {
    const id = this.sceneId();
    if (id === null) return null;
    return this.edited[id] ?? (scenes as Record<string, Scene>)[id] ?? null;
  }

  private shown: string | null = null;

  /** Called on every snapshot; redraws only when the owner has moved to another scene. */
  sync(): void {
    const id = this.sceneId();
    if (id === this.shown) return;
    this.shown = id;
    this.selected = null;
    this.emit();
  }

  select(id: string | null): void {
    this.selected = id;
    this.emit();
  }

  private push(): void {
    this.past.push({ scenes: this.edited, quests: this.quests, talk: this.talk });
  }

  /** Applies a scene edit unless it adds a scene error. */
  editScene(done: Done<Scene>): boolean {
    const id = this.sceneId();
    const base = id === null ? undefined : (scenes as Record<string, Scene>)[id];
    if ('error' in done || id === null || base === undefined)
      return this.fail('error' in done ? [done.error] : []);
    const added = sceneErrors(done.value, base);
    if (added.length > 0) return this.fail(added);
    this.push();
    this.edited = { ...this.edited, [id]: done.value };
    return this.ok();
  }

  editQuests(done: Done<QuestsFile>): boolean {
    if ('error' in done) return this.fail([done.error]);
    const added = questErrors(done.value);
    if (added.length > 0) return this.fail(added);
    this.push();
    this.quests = done.value;
    return this.ok();
  }

  editTalk(done: Done<TalkFile>): boolean {
    if ('error' in done) return this.fail([done.error]);
    const added = talkErrors(done.value);
    if (added.length > 0) return this.fail(added);
    this.push();
    this.talk = done.value;
    return this.ok();
  }

  private fail(problems: string[]): boolean {
    this.problems = problems;
    this.emit();
    return false;
  }

  private ok(): boolean {
    this.problems = [];
    this.emit();
    return true;
  }

  undo(): void {
    const prev = this.past.pop();
    if (prev === undefined) return;
    this.edited = prev.scenes;
    this.quests = prev.quests;
    this.talk = prev.talk;
    this.problems = [];
    this.emit();
  }

  /** The files that differ from the committed ones, as save requests. */
  changes(): Array<{ file: string; json: unknown }> {
    const out: Array<{ file: string; json: unknown }> = Object.entries(this.edited).map(([id, json]) => ({
      file: `scenes/${id}.json`,
      json,
    }));
    if (this.quests !== content.quests) out.push({ file: 'quests.json', json: this.quests });
    if (this.talk !== content.talk) out.push({ file: 'talk.json', json: this.talk });
    return out;
  }

  /** Sends the quest NPCs to the open Studio room as its NPC draft (talk lines are not part of the draft wire). */
  async preview(api: NpcDraftApi, roomId: string): Promise<boolean> {
    try {
      await api.upload(roomId, { quests: this.quests });
      return this.ok();
    } catch (e) {
      return this.fail(e instanceof SaveError && e.problems.length > 0 ? e.problems : [message(e)]);
    }
  }

  /** One save, and so one draft PR, per changed file. */
  async save(api: SaveApi, note: string): Promise<SaveResponse[]> {
    const done: SaveResponse[] = [];
    for (const c of this.changes()) {
      try {
        done.push(await api.save({ file: c.file as never, json: c.json, ...(note ? { note } : {}) }));
      } catch (e) {
        this.fail(
          e instanceof SaveError && e.problems.length > 0 ? e.problems : [`${c.file}: ${message(e)}`],
        );
        break;
      }
    }
    if (done.length > 0 && this.problems.length === 0) this.emit();
    return done;
  }
}
