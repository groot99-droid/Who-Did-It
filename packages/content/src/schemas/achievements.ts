import { z } from 'zod';
import { GddRef, Id } from './common.js';

// Round 10, E1 (GDD 3.28; docs/round9/owner-brief.md: "step by step achievements that branch out in different
// directions", "skill trees plus trophies"). An achievement is a short chain of steps, each a pattern on one sim bus
// kind (`apps/server/src/sim/events/bus.ts`); `after` links achievements into trees that branch. The server evaluates
// the steps in `step()` and tells only the earner's own client; the earned set lives on the device. No reward changes
// power: an achievement has a title and a line, nothing else.

/**
 * The bus kinds a step may name: the ones with a literal emit site in `apps/server/src` that tell a seat apart, plus the
 * story runner's. `apps/server/test/achievements.test.ts` checks each is still emitted. The trial kinds
 * (`tribunal.*`) wait on B6b to B6d and are not listed.
 */
export const ACHIEVEMENT_KINDS = [
  'taskDone',
  'kill',
  'death',
  'eat',
  'sleep.rest',
  'rent.paid',
  'quota.met',
  'fare.paid',
  'fare.errand',
  'notice.made',
  'inspect',
  'body.ko',
  'rob',
  'pair.start',
  'story.chapterEnd',
  'story.goal',
  'story.end',
] as const;
export type AchievementKind = (typeof ACHIEVEMENT_KINDS)[number];

const Scalar = z.union([z.string(), z.number(), z.boolean()]);

/**
 * Whose step it is: `seat` the event's own seat, `humans` every human at the table (the story runner's events name
 * no seat, and a story room has one human), `data.<key>` the seat the event's data names under that key (`data.by`).
 */
export const Who = z
  .string()
  .regex(/^(seat|humans|data\.[a-z][A-Za-z0-9]*)$/, 'who is seat, humans or data.<key>');

export const AchievementStep = z
  .object({
    id: Id,
    /** The line the device shows for the step. */
    text: z.string().trim().min(1),
    on: z.enum(ACHIEVEMENT_KINDS),
    who: Who.default('seat'),
    /** Exact matches against the event's `data`. */
    where: z.record(z.string(), Scalar).default({}),
    /** How many matching events complete the step. */
    count: z.number().int().min(1).default(1),
  })
  .strict();
export type AchievementStep = z.infer<typeof AchievementStep>;

export const Achievement = z
  .object({
    id: Id,
    tree: Id,
    title: z.string().trim().min(1),
    text: z.string().trim().min(1),
    /** Achievements this one grows from: a node with two children is a branch, one with two parents a join. */
    after: z.array(Id).default([]),
    /** Done in order, each step counting only after the one before it. */
    steps: z.array(AchievementStep).min(1),
    gddRef: GddRef,
  })
  .strict();
export type Achievement = z.infer<typeof Achievement>;

export const AchievementTree = z
  .object({ title: z.string().trim().min(1), text: z.string().trim().min(1) })
  .strict();

export const AchievementsFile = z
  .object({
    version: z.literal(1),
    trees: z.record(Id, AchievementTree),
    achievements: z.record(Id, Achievement),
  })
  .strict();
export type AchievementsFile = z.infer<typeof AchievementsFile>;
