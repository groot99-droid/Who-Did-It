// Round 9 (9W, docs/round9/admin-studio.md 8): the Overview's edits. A re-target is a scene edit, so it runs on that
// scene's `EditorSession`: the same live checks refuse it, and the same save route sends it.
import mitt from 'mitt';
import { scenes, type Scene } from '@wdi/content';
import { EditorSession } from '../editor/session';
import type { SaveApi, SaveResponse } from '../saveApi';
import { spawnsOf } from '../model';
import { linksOf, type Link } from './graph';

const content = scenes as unknown as Record<string, Scene>;

export class OverviewModel {
  readonly bus = mitt<{ change: undefined }>();
  private readonly sessions = new Map<string, EditorSession>();
  /** The scene value each scene was saved at, so a saved scene is not saved twice. */
  private readonly saved = new Map<string, Scene>();
  /** The last refused re-target, until the next one succeeds. */
  error = '';

  /** The editing session of a scene: made on first use, and handed to the editor when the owner enters the scene. */
  sessionFor(sceneId: string): EditorSession {
    let s = this.sessions.get(sceneId);
    if (s === undefined) {
      s = new EditorSession(sceneId);
      this.sessions.set(sceneId, s);
    }
    return s;
  }

  has(sceneId: string): boolean {
    return this.sessions.has(sceneId);
  }

  sceneOf(id: string): Scene | undefined {
    return this.sessions.get(id)?.scene ?? content[id];
  }

  links(ids: readonly string[]): Link[] {
    return linksOf(
      ids,
      Object.fromEntries(ids.flatMap((id) => (this.sceneOf(id) ? [[id, this.sceneOf(id)!]] : []))),
    );
  }

  /** Points a portal at another scene's spawn. Refused (nothing changes) when a live check turns up a new error. */
  retarget(sceneId: string, portalId: string, to: string, toSpawn: string): boolean {
    const refuse = (msg: string) => {
      this.error = msg;
      this.bus.emit('change', undefined);
      return false;
    };
    if (!spawnsOf(to).includes(toSpawn)) return refuse(`${to} has no spawn ${toSpawn}`);
    const s = this.sessionFor(sceneId);
    const portal = s.scene.portals.find((p) => p.id === portalId);
    if (portal === undefined) return refuse(`${portalId} is not in ${sceneId}`);
    if (portal.to === to && portal.toSpawn === toSpawn) return true;
    const before = new Set(s.checks.errors);
    s.select({ kind: 'portals', id: portalId });
    s.patchSelected({ to, toSpawn });
    const fresh = s.checks.errors.filter((e) => !before.has(e));
    if (fresh.length > 0) {
      s.undo();
      return refuse(fresh[0]!);
    }
    this.error = '';
    this.bus.emit('change', undefined);
    return true;
  }

  /** The scenes with edits not yet saved. */
  get changed(): string[] {
    return [...this.sessions]
      .filter(([id, s]) => s.diff.length > 0 && this.saved.get(id) !== s.scene)
      .map(([id]) => id);
  }

  /** Saves each changed scene through the scene save route (one draft PR each); a failure stops the rest. */
  async save(api: SaveApi, note: string): Promise<SaveResponse[]> {
    const out: SaveResponse[] = [];
    for (const id of this.changed) {
      const s = this.sessions.get(id)!;
      out.push(await api.save({ scene: s.scene, note }));
      this.saved.set(id, s.scene);
    }
    this.bus.emit('change', undefined);
    return out;
  }
}
