/**
 * The creature FSM (GDD 3.15, docs/round6/m5b-data.md 2.2): pure transitions over what the creature senses this
 * tick. `Mobs.ts` gathers the senses, applies the state and moves the body; nothing here touches the room.
 *
 * - any state, a lit flame within the flee radius -> `flee`;
 * - `flee` with no flame in reach -> `roam` (home first);
 * - `idle` or `roam`, a living seat sensed and the rest over -> `chase` for at most `mobs.chaseS`;
 * - `chase` past its time, or the seat lost -> `roam` home, and no new chase for another `mobs.chaseS`;
 * - `idle` when its pause runs out -> `roam`; `roam` at its goal -> `idle` for a fresh pause.
 *
 * `dead` is a creature that is not in the world (asleep outside its spawner's parts of the day).
 */
export const MobState = { idle: 0, roam: 1, chase: 2, flee: 3, dead: 4 } as const;
export type MobStateId = (typeof MobState)[keyof typeof MobState];

/** What a creature remembers between ticks. Room memory only. */
export interface MobMind {
  state: MobStateId;
  /** The seat chased, while `chase`. */
  prey: string | null;
  /** `chase` ends at this tick. */
  chaseUntilTick: number;
  /** No new chase before this tick (the walk home after a chase). */
  restUntilTick: number;
  /** `idle` ends at this tick. */
  idleUntilTick: number;
  /** `roam` heads home (after a chase or a flight) rather than along its loop. */
  homing: boolean;
}

/** This tick's senses, gathered by `Mobs.ts`. */
export interface Senses {
  /** A lit flame within the flee radius. */
  light: boolean;
  /** The nearest living seat sensed and in sight, or null. */
  prey: string | null;
  /** The roam goal is reached. */
  atGoal: boolean;
}

export const newMind = (): MobMind => ({
  state: MobState.idle,
  prey: null,
  chaseUntilTick: 0,
  restUntilTick: 0,
  idleUntilTick: 0,
  homing: false,
});

/**
 * One transition. `chaseTicks` is `mobs.chaseS` in ticks; `pauseTicks` draws an idle pause (from the spawner's
 * `mobs` stream) and is called only when the creature starts to idle.
 */
export function think(
  mind: MobMind,
  senses: Senses,
  tick: number,
  chaseTicks: number,
  pauseTicks: () => number,
): void {
  if (mind.state === MobState.dead) return;
  if (senses.light) {
    mind.state = MobState.flee;
    mind.prey = null;
    return;
  }
  if (mind.state === MobState.flee) {
    mind.state = MobState.roam;
    mind.homing = true;
    return;
  }
  if (mind.state === MobState.chase) {
    if (tick < mind.chaseUntilTick && senses.prey !== null) {
      mind.prey = senses.prey;
      return;
    }
    mind.state = MobState.roam;
    mind.prey = null;
    mind.homing = true;
    mind.restUntilTick = tick + chaseTicks;
    return;
  }
  if (senses.prey !== null && tick >= mind.restUntilTick) {
    mind.state = MobState.chase;
    mind.prey = senses.prey;
    mind.chaseUntilTick = tick + chaseTicks;
    return;
  }
  if (mind.state === MobState.idle) {
    if (tick >= mind.idleUntilTick) mind.state = MobState.roam;
    return;
  }
  if (senses.atGoal) {
    mind.state = MobState.idle;
    mind.homing = false;
    mind.idleUntilTick = tick + pauseTicks();
  }
}
