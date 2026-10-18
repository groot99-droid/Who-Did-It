import type { DeathCause } from '@wdi/shared';
import type { PartyRoom } from '../rooms/PartyRoom';

// Room memory of the night powers, protections, aims and Hunger (GDD 3.2, 3.3). Session 5G owns this file. The
// pre-seed sketched these as `PlayerSim` fields (`deck/wire.md` 5), but `RoomSim.ts` is locked for the round, so they
// live here in a `WeakMap<PartyRoom, NightMemory>` and `resetNightForLobby` drops them. Never on the wire.

/** A dying Gamekeeper's Last Shot window (GDD 3.2). */
export interface Aim {
  cause: DeathCause;
  /** The scene the seat died in, for the deferred `killed` message and the shot's body. */
  sceneId: string;
  untilTick: number;
  /** A seat that cannot be told (no client) never blocks; an NPC shoots at `brain.lastShotAtTick`. */
  shot: boolean;
  /** Whether `killed` still has to be sent when the aim closes (false for an ejection: `startReveal` sent it). */
  deferred: boolean;
}

export class NightMemory {
  /** Nights so far: dusks and Final Nights entered. Zero before the first dusk. */
  night = 0;
  /** The phase last seen by `runNightPowers`, so a phase change is noticed once. */
  phase = -1;
  /** Seat -> night-power ids used this night; cleared when a dusk or the Final Night begins. */
  readonly used = new Map<string, Set<string>>();
  /** Watched seat -> its Watchman, until the night ends (the first Knife strike spends it). */
  readonly watch = new Map<string, string>();
  /** Remedied seat -> its Herbalist, until the next meeting opens (the first Knife strike spends it). */
  readonly remedy = new Map<string, string>();
  /** Watchman -> the seat it watched last and on which night (the same seat two nights running is refused). */
  readonly watched = new Map<string, { night: number; seat: string }>();
  /** Killer seat -> the round of its last accepted Knife strike (Hunger, GDD 3.3); absent when it never struck. */
  readonly lastStrikeRound = new Map<string, number>();
  /** Seat -> its open Last Shot window. */
  readonly aims = new Map<string, Aim>();
  /** Ejected seats whose Last Shot window was already offered, so a closed aim never reopens. */
  readonly ejectAimed = new Set<string>();
  /** Accomplice seats that already inherited the Knife. */
  readonly inherited = new Set<string>();
  /** Hungry Killer seat -> the round whose day start made it Hungry (Hunger, GDD 3.3); a later strike ends it. */
  readonly hungry = new Map<string, number>();
  /** Hungry seat -> where it stood last tick and how many ticks it has moved since its last footprint. */
  readonly trail = new Map<string, { x: number; y: number; moving: number }>();
  /** The phase `runHunger` saw last, so a day (or the Final Night) start is noticed once. */
  hungerPhase = -1;
  /** NPC seat -> the night its power was last used on (one use per night). */
  readonly npcUsed = new Map<string, number>();
}

const memories = new WeakMap<PartyRoom, NightMemory>();

export function nightOf(room: PartyRoom): NightMemory {
  let mem = memories.get(room);
  if (!mem) {
    mem = new NightMemory();
    memories.set(room, mem);
  }
  return mem;
}

export function dropNightMemory(room: PartyRoom): void {
  memories.delete(room);
}
