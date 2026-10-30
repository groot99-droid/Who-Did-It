import balance from '@wdi/content/data/balance.json';
import type { C2SPayloads } from '@wdi/shared/protocol';

// UI.md 14.48 (Session 10D, round 10, D9c; GDD 3.24 "Talk to a figure"): the World asks the nearest avatar in reach.
// G asks about the town and H asks the time; the answer arrives as an ordinary system chat line, so this file only
// holds the keys and the words. The server decides whether the avatar is a figure and refuses the rest.

/** The server's reach (`balance.json` `figureTalk.reachTiles`); the server re-checks it. */
export const TALK_REACH_TILES: number = balance.figureTalk.reachTiles;

export type TalkAsk = C2SPayloads['talk.ask']['ask'];

/** Key code -> the ask it sends. */
export const TALK_KEYS: Readonly<Record<string, TalkAsk>> = { KeyG: 'town', KeyH: 'time' };

export const TALK_COPY = {
  'toast.asked.town': 'You ask what the town is saying.',
  'toast.asked.time': 'You ask the time.',
} as const;

/** The toast line for an ask just sent. */
export const askedLine = (ask: TalkAsk): string => TALK_COPY[`toast.asked.${ask}`];
