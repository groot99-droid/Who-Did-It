import type { WorldFeed } from './world';

/**
 * Round 6 (6I): what the M5b panels need of a feed beyond the locked `WorldFeed` of `net/world.ts`. CONTRACT REQUEST:
 * `WorldFeed` gains these four members; until it does, `ColyseusWorldFeed` and `MockWorldFeed` implement them and
 * `asM5b` narrows a feed to them (a feed without them, such as a test double, gets no panels).
 */
export interface StackSnap {
  defId: string;
  qty: number;
}

export interface M5bFeed {
  /** This player's own inventory slots, in slot order. */
  inventory(): StackSnap[];
  /** `quest.accept { questId }`. */
  questAccept(questId: string): void;
  /** `quest.turnIn { questId }`. */
  questTurnIn(questId: string): void;
  /** `act.light { on }`: light or douse the carried lantern or torch. */
  light(on: boolean): void;
}

export function asM5b(feed: WorldFeed): (WorldFeed & M5bFeed) | null {
  const f = feed as Partial<M5bFeed>;
  return typeof f.inventory === 'function' &&
    typeof f.questAccept === 'function' &&
    typeof f.questTurnIn === 'function' &&
    typeof f.light === 'function'
    ? (feed as WorldFeed & M5bFeed)
    : null;
}
