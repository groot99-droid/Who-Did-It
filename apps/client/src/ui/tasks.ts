import tasks from '@wdi/content/data/tasks.json';
import { TILE_PX } from '@wdi/shared/constants';
import type { TaskSnap } from '../net/world';
import { fill } from './copy';
import { TASK_COPY as C } from './copy/tasks';
import { itemName } from './Inventory';

/** One row of `tasks.json` as the client reads it: the `fetch` kind, or the `coop` kind's hold (GDD 3.5). */
export interface TaskDef {
  id: string;
  name: string;
  kind: string;
  tool?: string;
  toolQty?: number;
  source?: { scene: string; prop: string };
  targets: Array<{ scene: string; prop: string }>;
  nightOnly?: boolean;
  coopPlayers?: number;
  coopRadiusTiles?: number;
  holdS?: number;
}
export const TASKS = tasks.tasks as Record<string, TaskDef>;

/**
 * A task's source or target prop in the scene this client is in, in world px, with what it asks for. A `coop` spot is
 * the shared hold's prop, offered to every seat in the scene whether or not the task is on its list (GDD 3.5), within
 * `reach` px rather than the station reach; `players` is how many hands it takes.
 */
export interface TaskSpot {
  kind: 'task';
  taskId: string;
  step: 'source' | 'target' | 'coop';
  x: number;
  y: number;
  name: string;
  tool: string | undefined;
  fake: boolean;
  nightOnly: boolean;
  reach?: number;
  players?: number;
}

/**
 * The spots of this seat's unfinished tasks in `sceneId`: a source while the tool is not in the pockets (a fake task
 * has no tool to fetch, so its source always offers the motion), every target; and the co-op holds of the scene, for
 * everyone, since a helping hand counts too (GDD 3.5). `propAt` is the scene's prop centre by content id, or null when
 * the prop is not in the file.
 */
export function taskSpots(
  mine: readonly TaskSnap[],
  sceneId: string,
  propAt: (propId: string) => { x: number; y: number } | null,
  has: (item: string) => boolean,
): TaskSpot[] {
  const out: TaskSpot[] = [];
  for (const d of Object.values(TASKS)) {
    if (d.kind !== 'coop') continue;
    const entry = mine.find((t) => t.id === d.id);
    for (const n of d.targets) {
      const at = n.scene === sceneId ? propAt(n.prop) : null;
      if (!at) continue;
      out.push({
        kind: 'task',
        taskId: d.id,
        step: 'coop',
        x: at.x,
        y: at.y,
        name: d.name,
        tool: undefined,
        fake: entry?.fake ?? false,
        nightOnly: d.nightOnly === true,
        reach: (d.coopRadiusTiles ?? 2) * TILE_PX,
        players: d.coopPlayers ?? 2,
      });
    }
  }
  for (const t of mine) {
    const d = TASKS[t.id];
    if (!d || t.done || d.kind !== 'fetch') continue;
    const base = {
      kind: 'task' as const,
      taskId: d.id,
      name: d.name,
      tool: d.tool,
      fake: t.fake,
      nightOnly: d.nightOnly === true,
    };
    const carrying = d.tool !== undefined && has(d.tool);
    if (d.source?.scene === sceneId && (t.fake || !carrying)) {
      const at = propAt(d.source.prop);
      if (at) out.push({ ...base, step: 'source', x: at.x, y: at.y });
    }
    for (const n of d.targets) {
      if (n.scene !== sceneId) continue;
      const at = propAt(n.prop);
      if (at) out.push({ ...base, step: 'target', x: at.x, y: at.y });
    }
  }
  return out;
}

/** The prompt at a spot; `night` is whether the clock stands at night (a `nightOnly` task waits for it). */
export function taskPrompt(s: TaskSpot, has: (item: string) => boolean, night: boolean): string {
  const tool = s.tool ? itemName(s.tool) : '';
  if (s.step === 'coop') return fill(C['prompt.task.coop'], { name: s.name, n: s.players ?? 2 });
  if (s.step === 'source')
    return s.fake || !s.tool
      ? fill(C['prompt.task.do'], { name: s.name })
      : fill(C['prompt.task.take'], { tool });
  if (s.nightOnly && !night) return fill(C['prompt.task.night'], { name: s.name });
  if (!s.fake && s.tool && !has(s.tool)) return fill(C['prompt.task.tool'], { tool, name: s.name });
  return fill(C['prompt.task.do'], { name: s.name });
}

/** The prompt while this seat holds a co-op spot: the hands on it against the hands it takes (GDD 3.5). */
export function coopPrompt(holders: number, players: number): string {
  return fill(C[holders < players ? 'prompt.task.coop.wait' : 'prompt.task.coop.hold'], {
    holders,
    n: players,
  });
}

export interface ChoreRow {
  id: string;
  name: string;
  done: boolean;
  fake: boolean;
  /** `fetch`: the tool is still to fetch at the source; `bring`: carried (or not needed), go to a target; `coop`: the shared hold. */
  step: 'fetch' | 'bring' | 'coop' | 'done';
  tool: string | undefined;
  from: string | undefined;
  to: string[];
  nightOnly: boolean;
  /** The hands a `coop` row takes. */
  players?: number;
}

/** The rows of the chores panel, in deal order: what to fetch, where to bring it, which are done. */
export function choreRows(mine: readonly TaskSnap[], has: (item: string) => boolean): ChoreRow[] {
  const rows: ChoreRow[] = [];
  for (const t of mine) {
    const d = TASKS[t.id];
    if (!d) continue;
    const fetching = !t.fake && d.tool !== undefined && d.source !== undefined && !has(d.tool);
    rows.push({
      id: d.id,
      name: d.name,
      done: t.done,
      fake: t.fake,
      step: t.done ? 'done' : d.kind === 'coop' ? 'coop' : fetching ? 'fetch' : 'bring',
      tool: d.tool,
      from: d.source?.scene,
      to: [...new Set(d.targets.map((n) => n.scene))],
      nightOnly: d.nightOnly === true,
      ...(d.kind === 'coop' ? { players: d.coopPlayers ?? 2 } : {}),
    });
  }
  return rows;
}

/** The line under a chore's name. `sceneName` turns a scene id into its name (the content, loaded lazily). */
export function choreLine(r: ChoreRow, sceneName: (id: string) => string): string {
  if (r.step === 'done') return C['chores.done'];
  const scene = (r.step === 'fetch' ? [r.from ?? ''] : r.to).map(sceneName).join(', ');
  if (r.step === 'fetch') return fill(C['chores.fetch'], { tool: itemName(r.tool ?? ''), scene });
  if (r.step === 'coop') return fill(C['chores.coop'], { n: r.players ?? 2, scene });
  return fill(C[r.fake || !r.tool ? 'chores.go' : 'chores.bring'], { scene });
}

/**
 * The prop centres of `sceneId` in world px by content id, loaded with the rest of `@wdi/content` (zod and every scene
 * file stay out of the main bundle, as `view/GiverView.ts loadGivers` does); null for a prop the file lacks.
 */
export function loadPropAt(sceneId: string): Promise<(propId: string) => { x: number; y: number } | null> {
  return import('@wdi/content').then(({ scenes }) => {
    const props = (
      scenes as unknown as Record<string, { props?: Array<{ id: string; x: number; y: number }> }>
    )[sceneId]?.props;
    return (propId) => {
      const p = props?.find((q) => q.id === propId);
      return p ? { x: (p.x + 0.5) * TILE_PX, y: (p.y + 0.5) * TILE_PX } : null;
    };
  });
}

/** Every scene's display name by id, loaded the same way; the id with underscores spelled out for one the files lack. */
export function loadSceneNameOf(): Promise<(id: string) => string> {
  return import('@wdi/content').then(
    ({ scenes }) =>
      (id) =>
        (scenes as Record<string, { name?: string }>)[id]?.name ?? id.replaceAll('_', ' '),
  );
}
