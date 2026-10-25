// Round 9 (9T): the Studio's state and its pure helpers. No Phaser, so it is tested.
import mitt from 'mitt';
import { SCENE_IDS, type SceneId, items, looks, mobs, routines, scenes } from '@wdi/content';
import { worldMove } from '../input/vectors';
import type { StudioSnapshot } from '../admin/StudioNet';

/** The server keeps the last 50 log lines and so does the client (docs/PROTOCOL.md, studio.log). */
export const LOG_LINES = 50;
export const CLOCK_SCALES = [1, 2, 5, 10] as const;

export class StudioStore {
  readonly bus = mitt<{ change: undefined }>();
  snapshot: StudioSnapshot | null = null;
  log: string[] = [];
  /** The last refused command's message, '' once a command is accepted by the next snapshot. */
  refused = '';

  applySnapshot(s: StudioSnapshot): void {
    this.snapshot = s;
    this.refused = '';
    this.bus.emit('change', undefined);
  }

  addLog(lines: readonly string[]): void {
    this.log = [...this.log, ...lines].slice(-LOG_LINES);
    this.bus.emit('change', undefined);
  }

  refuse(msg: string): void {
    this.refused = msg;
    this.bus.emit('change', undefined);
  }

  reset(): void {
    this.snapshot = null;
    this.log = [];
    this.refused = '';
    this.bus.emit('change', undefined);
  }
}

/** Case-insensitive substring match over ids; an empty query lists them all. */
export function filterIds(ids: readonly string[], query: string): string[] {
  const q = query.trim().toLowerCase();
  return q === '' ? [...ids] : ids.filter((id) => id.toLowerCase().includes(q));
}

/** The spawn ids of a scene (the teleport target the server wants), [] for an id that is not a scene. */
export function spawnsOf(sceneId: string): string[] {
  const scene = scenes[sceneId as SceneId] as { spawns: Array<{ id: string }> } | undefined;
  return scene === undefined ? [] : scene.spawns.map((s) => s.id);
}

/** What the spawn and give pickers offer, from the content the server reads too. */
export const STUDIO_LISTS = {
  scenes: [...SCENE_IDS] as string[],
  mob: Object.keys(mobs.mobs),
  townsfolk: Object.keys(routines.townsfolk),
  look: Object.keys(looks.looks),
  items: Object.keys(items.items),
} as const;

export interface MoveState {
  dx: number;
  dy: number;
  sprint: boolean;
}

/** Keyboard state to the world-frame `studio.move` vector (the server normalises it); Shift or Space sprints. */
export function moveOf(pressed: ReadonlySet<string>): MoveState {
  const has = (...c: string[]) => c.some((k) => pressed.has(k));
  const dx = (has('KeyD', 'ArrowRight') ? 1 : 0) - (has('KeyA', 'ArrowLeft') ? 1 : 0);
  const dy = (has('KeyS', 'ArrowDown') ? 1 : 0) - (has('KeyW', 'ArrowUp') ? 1 : 0);
  const w = worldMove({ dx, dy }, { dx: 0, dy: 0 });
  return { dx: w.dx, dy: w.dy, sprint: has('ShiftLeft', 'ShiftRight', 'Space') };
}

/** The status line of a snapshot, from the copy line with its {scene}, {tx}, {ty} and {tick} filled. */
export function statusOf(s: StudioSnapshot | null, line: string): string {
  if (s === null) return '';
  return line
    .replace('{scene}', s.sceneId)
    .replace('{tx}', String(s.tx))
    .replace('{ty}', String(s.ty))
    .replace('{tick}', String(s.tick));
}
