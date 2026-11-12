import type { Trigger } from '@wdi/content';
import type { SimEvent } from '../events/bus';

/**
 * Trigger evaluation (docs/story/README.md 1a). `{ tick: n }` holds once the chapter tick is at least n; an `event`
 * leaf is a SimEvent pattern (`kind`, `seat`, a partial `data` match) latched when heard, so inside `all` it stays
 * true until the `all` holds; `all` and `any` combine. Leaves are keyed by their path, so a beat's latches are
 * independent of every other beat's.
 */
export interface Latches {
  readonly set: Set<string>;
}

/** Whether `ev` matches an event leaf; `seatOf` resolves the leaf's `seat` ('player' or a role id) to a seat id. */
export function eventMatches(
  leaf: Extract<Trigger, { event: string }>,
  ev: SimEvent,
  seatOf: (who: string) => string | null,
): boolean {
  if (ev.kind !== leaf.event) return false;
  if (leaf.seat !== undefined && (ev.seat === undefined || ev.seat !== seatOf(leaf.seat))) return false;
  if (leaf.data === undefined) return true;
  return Object.entries(leaf.data).every(([k, v]) => ev.data?.[k] === v);
}

/** Latches every event leaf of `trigger` (under `path`) that `ev` matches. */
export function hear(
  trigger: Trigger,
  path: string,
  ev: SimEvent,
  latches: Latches,
  seatOf: (who: string) => string | null,
): void {
  if ('event' in trigger) {
    if (eventMatches(trigger, ev, seatOf)) latches.set.add(path);
  } else if ('all' in trigger) trigger.all.forEach((t, i) => hear(t, `${path}.${i}`, ev, latches, seatOf));
  else if ('any' in trigger) trigger.any.forEach((t, i) => hear(t, `${path}.${i}`, ev, latches, seatOf));
}

export function holds(trigger: Trigger, path: string, chapterTick: number, latches: Latches): boolean {
  if ('tick' in trigger) return chapterTick >= trigger.tick;
  if ('event' in trigger) return latches.set.has(path);
  if ('all' in trigger) return trigger.all.every((t, i) => holds(t, `${path}.${i}`, chapterTick, latches));
  return trigger.any.some((t, i) => holds(t, `${path}.${i}`, chapterTick, latches));
}
