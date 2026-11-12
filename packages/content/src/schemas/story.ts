import { z } from 'zod';
import { GddRef, Id, LookId, WorldId } from './common.js';

// Story mode (docs/story/README.md 1; docs/round9/world-mode.md 9; owner answer WM1B). One human, every other seat an
// NPC, one fixed story in chapters. The copy a card shows lives here and nowhere else. Ids of stories and chapters are
// append-only once shipped. The engine (S2) runs the beats; the client (S3) draws the cards; neither types a line.

/**
 * Every stream of `apps/server/src/sim/seeds.ts` (`AUTO_STREAMS` of `sim/auto/Auto.ts`). The content package cannot
 * import the server, so the list is repeated here; `apps/server/test/story/*` checks it equals `AUTO_STREAMS`.
 */
export const STORY_STREAMS = [
  'deal',
  'traits',
  'npcNames',
  'piles',
  'npcTiming',
  'npcPlay',
  'mobs',
  'nodes',
  'minigame',
  'contract',
  'events',
  'vendetta',
  'tasks',
  'body',
  'purse',
  'talk',
  'townsfolk',
  'loot',
  'homes',
  'locks',
  'pairing',
  'hitman',
  'trialTick',
  'trialChance',
  'autopsy',
  'hardship', // round 10, C4c (DECISIONS A390): the morning delivery's hardships
] as const;

const Word = z.number().int().min(0).max(0xffffffff);
/** Four 32-bit words of one sfc32 stream. */
export const StorySeedWords = z.tuple([Word, Word, Word, Word]);

/** The sim event kinds a trigger may name: `kill`, `train.return`, `story.chapterStart`. */
const EventKind = z
  .string()
  .regex(/^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/, 'event kinds look like `train.return`');

/** A line of story copy: narration or dialogue, shown whole on a card (at most 280 characters, two or three sentences). */
const Line = z.string().trim().min(1).max(280);
const Short = z.string().trim().min(1).max(80);

const Counter = z.string().regex(/^[a-z][A-Za-z0-9]*$/, 'counters are camelCase');

export type Trigger =
  | { event: string; seat?: string | undefined; data?: Record<string, unknown> | undefined }
  | { tick: number }
  | { all: Trigger[] }
  | { any: Trigger[] };

export const Trigger: z.ZodType<Trigger> = z.lazy(() =>
  z.union([
    z.strictObject({
      event: EventKind,
      /** `player` is the human's seat in this chapter; any other value is a role id (the seat holding that card). */
      seat: z.string().min(1).optional(),
      /** A partial match: every key must equal the event's `data` key. */
      data: z.record(z.string(), z.unknown()).optional(),
    }),
    /** Chapter-relative sim ticks (`TICK_RATE` 20 per second). */
    z.strictObject({ tick: z.number().int().nonnegative() }),
    z.strictObject({ all: z.array(Trigger).min(1) }),
    z.strictObject({ any: z.array(Trigger).min(1) }),
  ]),
);

export type StoryAction =
  | {
      card: 'beat';
      line: string;
      speaker?: string | undefined;
      portrait?: string | undefined;
      goal?: string | undefined;
    }
  | { cutscene: string }
  | { questStep: { quest: string; step: string } }
  | { npcOrder: { npcId: string; order: string; args?: Record<string, unknown> | undefined } }
  | { spawn: { kind: string; at: string } }
  | { seq: StoryAction[] };

export const StoryAction: z.ZodType<StoryAction> = z.lazy(() =>
  z.union([
    z.strictObject({
      card: z.literal('beat'),
      line: Line,
      /** A display name for the card, for example "Mabel at the counter". Not a seat id. */
      speaker: Short.optional(),
      /** A look id of looks.json (or `villager`). */
      portrait: LookId.optional(),
      /** A goal id of this chapter; the beat completes it. */
      goal: Id.optional(),
    }),
    z.strictObject({ cutscene: Id }),
    z.strictObject({ questStep: z.strictObject({ quest: Id, step: Id }) }),
    z.strictObject({
      npcOrder: z.strictObject({
        /** A role id: the NPC seat that holds that card in this chapter. */
        npcId: Id,
        order: Id,
        args: z.record(z.string(), z.unknown()).optional(),
      }),
    }),
    z.strictObject({
      spawn: z.strictObject({
        /** A clue kind of clues.json or an item id of items.json. */
        kind: Id,
        /** A scene id, or `<sceneId>:<spawnId>` to put it at one of that scene's spawn points. */
        at: z.string().regex(/^[a-z][a-z0-9_]*(:[a-z][a-z0-9_]*)?$/),
      }),
    }),
    z.strictObject({ seq: z.array(StoryAction).min(1) }),
  ]),
);

export const ChapterGoal = z.strictObject({
  id: Id,
  text: Short,
  /** Completes the goal when it fires. Absent: only a `card.goal` beat completes it. */
  trigger: Trigger.optional(),
});
export type ChapterGoal = z.infer<typeof ChapterGoal>;

export const Beat = z.strictObject({
  id: Id,
  trigger: Trigger,
  action: StoryAction,
  oncePerChapter: z.literal(true),
});
export type Beat = z.infer<typeof Beat>;

export const HandOn = z.strictObject({
  kind: z.enum(['letter', 'lead', 'item']),
  /** An item id for `item`; a clue kind for `lead`; a lore volume id for `letter`. */
  ref: Id,
  /** The line the new chapter's first card shows about it. */
  text: Line,
});
export type HandOn = z.infer<typeof HandOn>;

export const Chapter = z.strictObject({
  id: WorldId,
  title: Short,
  setup: Line,
  roleId: Id,
  look: LookId.optional(),
  /** A vendetta id of vendettas.json for a Killer chapter: the player's seat holds it for the chapter (the Bandit's heist). */
  vendetta: Id.optional(),
  startPhase: z.strictObject({ cycle: z.number().int().positive(), part: z.enum(['day', 'night']) }),
  goals: z.array(ChapterGoal).min(1),
  beats: z.array(Beat).min(1),
  end: z.strictObject({
    trigger: Trigger,
    /** Counters the end card shows (`story.chapterEnd` carries them). */
    summaryKeys: z.array(Counter).min(1),
    /** The end card's lines: what the player did, what the town became. */
    lines: z.array(Line).min(1).max(4),
    /** The line shown when the player's seat dies in the chapter (the chapter ends failed, the next one still starts). */
    failedLine: Line,
  }),
  handOn: z.array(HandOn).optional(),
});
export type Chapter = z.infer<typeof Chapter>;

export const Story = z.strictObject({
  id: WorldId,
  title: Short,
  blurb: Line,
  mapId: WorldId,
  roster: z.strictObject({ humanSeat: z.literal(0), npcCount: z.number().int().min(3).max(9) }),
  seedWords: z.record(z.string(), StorySeedWords),
  chapters: z.array(Chapter).min(1),
});
export type Story = z.infer<typeof Story>;

export const StoryFile = z.strictObject({
  gddRef: GddRef,
  stories: z.record(WorldId, Story),
});
export type StoryFile = z.infer<typeof StoryFile>;
