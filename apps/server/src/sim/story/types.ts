import type { SeedWords } from '../seeds';

/**
 * Story mode's data shapes (docs/story/README.md 1). S1 owns `packages/content/data/story.json` and its zod schema;
 * until that schema is merged these structural types stand in for it, and the engine reads a story only through
 * `resolveStory` (`Story.ts`). When `@wdi/content` exports the real `Story`, this file re-exports it.
 */
export type Trigger =
  | { event: string; seat?: string; data?: Record<string, unknown> }
  | { tick: number }
  | { all: Trigger[] }
  | { any: Trigger[] };

export type Action =
  | { card: 'beat'; line: string; speaker?: string; portrait?: string; goal?: string }
  | { cutscene: string }
  | { questStep: { quest: string; step: string } }
  | { npcOrder: { npcId: string; order: string; args?: Record<string, unknown> } }
  | { spawn: { kind: string; at: string } }
  | { seq: Action[] };

export interface Beat {
  id: string;
  trigger: Trigger;
  action: Action;
  oncePerChapter: true;
}

export interface ChapterGoal {
  id: string;
  text: string;
  trigger: Trigger;
}

export interface HandOn {
  kind: string;
  [key: string]: unknown;
}

export interface Chapter {
  id: string;
  title: string;
  setup: string;
  roleId: string;
  look?: string;
  startPhase: { cycle: number; part: 'day' | 'night' };
  goals: ChapterGoal[];
  beats: Beat[];
  end: { trigger: Trigger; summaryKeys: string[] };
  handOn?: HandOn[];
}

export interface Story {
  id: string;
  title: string;
  blurb: string;
  mapId: string;
  roster: { humanSeat: 0; npcCount: number };
  seedWords: Record<string, SeedWords>;
  chapters: Chapter[];
}
