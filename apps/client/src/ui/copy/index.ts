// The copy deck of docs/UI.md 14, as code. One file per owning session (round 4): `world.ts` (T),
// `meeting.ts` (U), `lobby.ts` (V), `deck.ts` (5G, round 5); a screen reads its lines from here and never from a literal, and a
// change edits docs/UI.md 14 first. Values in braces are filled by the caller with `fill()`.
export { WORLD_COPY } from './world';
export { MEETING_COPY } from './meeting';
export { LOBBY_COPY } from './lobby';
export { DECK_COPY } from './deck';

/** Replaces `{key}` placeholders; a missing key is left as is so the gap shows in a test. */
export function fill(line: string, values: Record<string, string | number>): string {
  return line.replace(/\{(\w+)\}/g, (m, key: string) => (key in values ? String(values[key]) : m));
}
