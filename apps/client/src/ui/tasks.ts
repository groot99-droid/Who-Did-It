import tasks from '@wdi/content/data/tasks.json';
import { TILE_PX } from '@wdi/shared/constants';
import type { TaskSnap } from '../net/world';
import { fill } from './copy';
import { TASK_COPY as C } from './copy/tasks';
import { itemName } from './Inventory';

/** One row of `tasks.json` as the client reads it (the `fetch` kind; the co-op task has no station hold yet). */
export interface TaskDef {
  id: string;
  name: string;
  kind: string;
  tool?: string;
  toolQty?: number;
  source?: { scene: string; prop: string };
  targets: Array<{ scene: string; prop: string }>;
  nightOnly?: boolean;
}
export const TASKS = tasks.tasks as Record<string, TaskDef>;

/** A task's source or target prop in the scene this client is in, in world px, with what it asks for. */
export interface TaskSpot {
  kind: 'task';
  taskId: string;
  step: 'source' | 'target';
  x: number;
  y: number;
  name: string;
  tool: string | undefined;
  fake: boolean;
  nightOnly: boolean;
}

/**
 * The spots of this seat's unfinished tasks in `sceneId`: a source while the tool is not in the pockets (a fake task
 * has no tool to fetch, so its source always offers the motion), every target. `propAt` is the scene's prop centre by
 * content id, or null when the prop is not in the file.
 */
export function taskSpots(
  mine: readonly TaskSnap[],
  sceneId: string,
  propAt: (propId: string) => { x: number; y: number } | null,
  has: (item: string) => boolean,
): TaskSpot[] {
  const out: TaskSpot[] = [];
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
  if (s.step === 'source')
    return s.fake || !s.tool
      ? fill(C['prompt.task.do'], { name: s.name })
      : fill(C['prompt.task.take'], { tool });
  if (s.nightOnly && !night) return fill(C['prompt.task.night'], { name: s.name });
  if (!s.fake && s.tool && !has(s.tool)) return fill(C['prompt.task.tool'], { tool, name: s.name });
  return fill(C['prompt.task.do'], { name: s.name });
}

export interface ChoreRow {
  id: string;
  name: string;
  done: boolean;
  fake: boolean;
  /** `fetch`: the tool is still to fetch at the source; `bring`: carried (or not needed), go to a target. */
  step: 'fetch' | 'bring' | 'done';
  tool: string | undefined;
  from: string | undefined;
  to: string[];
  nightOnly: boolean;
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
      step: t.done ? 'done' : fetching ? 'fetch' : 'bring',
      tool: d.tool,
      from: d.source?.scene,
      to: [...new Set(d.targets.map((n) => n.scene))],
      nightOnly: d.nightOnly === true,
    });
  }
  return rows;
}

/** The line under a chore's name. `sceneName` turns a scene id into its name (the content, loaded lazily). */
export function choreLine(r: ChoreRow, sceneName: (id: string) => string): string {
  if (r.step === 'done') return C['chores.done'];
  const scene = (r.step === 'fetch' ? [r.from ?? ''] : r.to).map(sceneName).join(', ');
  if (r.step === 'fetch') return fill(C['chores.fetch'], { tool: itemName(r.tool ?? ''), scene });
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
