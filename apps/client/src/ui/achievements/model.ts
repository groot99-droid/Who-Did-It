import type { AchievementsFile } from '@wdi/content';

// The tree the device draws (GDD 3.28): each achievement is earned, open (every one it grows from is earned, or it
// grows from none) or locked. The server awards on steps alone; `after` only lays out and locks the view.

export interface AchievementRow {
  id: string;
  title: string;
  text: string;
  state: 'earned' | 'open' | 'locked';
  /** The step lines, in order. */
  steps: string[];
  /** The titles of the achievements it grows from. */
  from: string[];
  /** The day it was earned on this device. */
  day?: string;
}

export interface TreeRows {
  id: string;
  title: string;
  text: string;
  rows: AchievementRow[];
  earned: number;
}

export function treeRows(file: AchievementsFile, earned: Record<string, string>): TreeRows[] {
  return Object.entries(file.trees).map(([id, tree]) => {
    const rows = Object.values(file.achievements)
      .filter((a) => a.tree === id)
      .map<AchievementRow>((a) => {
        const done = a.id in earned;
        const open = a.after.every((p) => p in earned);
        return {
          id: a.id,
          title: a.title,
          text: a.text,
          state: done ? 'earned' : open ? 'open' : 'locked',
          steps: a.steps.map((s) => s.text),
          from: a.after.map((p) => file.achievements[p]?.title ?? p),
          ...(done && earned[a.id] !== undefined ? { day: earned[a.id]! } : {}),
        };
      });
    return {
      id,
      title: tree.title,
      text: tree.text,
      rows,
      earned: rows.filter((r) => r.state === 'earned').length,
    };
  });
}
