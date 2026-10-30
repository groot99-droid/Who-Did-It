import { z } from 'zod';
import { GddRef } from './common.js';

// Round 9 (docs/round9/admin-studio.md 8, N2): the lines an NPC seat writes in the meeting notes (GDD 3.25 "Talk",
// "Misdirection"), moved out of the server's code unchanged so the Studio's NPC editor can edit them. A line names
// seats only by name and never a card, a role or a faction (`checkTalk`); no line is keyed by a role or a seat, so
// nothing in this file can tell one seat's lines from another's.

/**
 * When a line may be drawn, from the meeting's public facts alone: `body` a body called it, by name; `bell` the
 * bell; `report` a body report (the meeting's reason is `body`); `caller` the caller is another seat. Absent, always.
 */
export const TalkWhen = z.enum(['body', 'bell', 'report', 'caller']);
export type TalkWhen = z.infer<typeof TalkWhen>;

/** The placeholders each list fills from the public facts (`apps/server/src/services/talk/templates.ts`). */
export const TALK_FILLS = {
  notes: ['body', 'caller', 'missing', 'name'],
  herrings: ['seat', 'wrongRound'],
  smallTalk: [],
} as const satisfies Record<string, readonly string[]>;

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w*)\}/g)].map(([, k]) => k ?? '');

/** A line of a list: its placeholders are the list's, each at most once, and no stray brace. */
const lineText = (list: keyof typeof TALK_FILLS) =>
  z
    .string()
    .trim()
    .min(1)
    .max(140)
    .refine((t) => !/[{}]/.test(t.replace(/\{\w+\}/g, '')), 'a brace outside a placeholder')
    .refine((t) => placeholders(t).every((k) => (TALK_FILLS[list] as readonly string[]).includes(k)), {
      message: `a placeholder this list cannot fill (${TALK_FILLS[list].join(', ') || 'none'})`,
    })
    .refine((t) => new Set(placeholders(t)).size === placeholders(t).length, 'a placeholder used twice');

export const TalkNote = z.strictObject({ text: lineText('notes'), when: TalkWhen.optional() });
export type TalkNote = z.infer<typeof TalkNote>;
export const TalkHerring = z.strictObject({ text: lineText('herrings'), when: TalkWhen.optional() });
export type TalkHerring = z.infer<typeof TalkHerring>;

/** The answers of a figure to `talk.ask` (round 10, D9c; GDD 3.24 "Talk"). A line names no seat, role or card. */
const figureLine = (fills: readonly string[]) =>
  z
    .string()
    .trim()
    .min(1)
    .max(140)
    .refine((t) => !/[{}]/.test(t.replace(/\{\w+\}/g, '')), 'a brace outside a placeholder')
    .refine((t) => placeholders(t).every((k) => fills.includes(k)), {
      message: `a placeholder this list cannot fill (${fills.join(', ') || 'none'})`,
    });

export const TalkFigures = z.strictObject({
  /** A figure kind (`routines.json` `townsfolk`) -> the name its answer carries as the speaker. */
  names: z.record(z.string(), z.string().trim().min(1).max(30)),
  /** A world phase key (`grace`, `day`, `dusk`, `night`, `finalNight`) -> how a figure says it. */
  parts: z.record(z.string(), z.string().trim().min(1).max(30)),
  /** `time`: a remark, `{part}` the part of the day. */
  time: z.array(figureLine(['part'])).min(1),
  /** `town`: a tip off the rumour ledger, `{look}` a drawn look's name and `{scene}` a scene's name. */
  town: z.array(figureLine(['look', 'scene'])).min(1),
  /** `town` and `time` when the ledger holds nothing, and a Constable's reply when it has no briefing to read. */
  quiet: z.array(figureLine([])).min(1),
});
export type TalkFigures = z.infer<typeof TalkFigures>;

export const TalkFile = z.strictObject({
  gddRef: GddRef,
  /** The template lines of an NPC seat's notes; one whose placeholder has nothing to fill is not drawn. */
  notes: z.array(TalkNote).min(1),
  /** Red herrings: `{seat}` is a living seat at the table, so naming it as the body, the missing or the caller is the slip. */
  herrings: z.array(TalkHerring).min(1),
  /** Small talk: satire of a village meeting, about nothing at all. */
  smallTalk: z.array(lineText('smallTalk')).min(1),
  /** Round 10, D9c: what a figure answers when a seat asks it (`talk.ask`). */
  figures: TalkFigures,
});
export type TalkFile = z.infer<typeof TalkFile>;
