import type { FixedSeeds } from '../seeds';
import type { PartyRoom } from '../../rooms/PartyRoom';
import { simOf } from '../RoomSim';

/**
 * The all-NPC match (round 6, docs/round6/auto-admin.md 3): a room whose every seat is an NPC, started inside the
 * step with no leader, at the clock's speed. Pre-seeded by 6Z; Session 6A fills the bodies. `enableAuto` is the one
 * production path allowed to assign `room.fixedSeeds` (`seeds.test.ts` allowlist).
 */
export interface AutoOptions {
  map: string;
  mode: 'main' | 'onub';
  seats: number;
  difficulty: 'easy' | 'normal' | 'hard';
  deck?: string[];
  seeds?: FixedSeeds;
  /** Fixed NPC seat ids, for replay and the log; drawn when absent. */
  npcIds?: string[];
}

export type AutoCommand =
  | { kind: 'start' }
  | { kind: 'reset' }
  | { kind: 'clock'; scale?: 1 | 2 | 5 | 10; paused?: boolean; step?: number }
  | { kind: 'setup'; options: AutoOptions };

export interface AutoState {
  /** An NPC Killer may take an NPC as prey (`preyFor`, `sim/npc/world.ts`). */
  npcPrey: boolean;
  /** Queued by the admin handlers and the harness, applied by `runAuto` inside the step. */
  commands: AutoCommand[];
  started: boolean;
  options: AutoOptions;
}

export function autoOf(room: PartyRoom): AutoState | null {
  return simOf(room).auto;
}

/** Marks the room as an auto match, fixes its seeds, adds the NPC seats and applies the settings (6A). */
export function enableAuto(_room: PartyRoom, _opts: AutoOptions): void {
  throw new Error('sim/auto/Auto.ts enableAuto: round 6, Session 6A');
}

/** Queues `{ kind: 'start' }`; `runAuto` calls the exported `startMatch` inside the next step (6A). */
export function queueAutoStart(_room: PartyRoom): void {
  throw new Error('sim/auto/Auto.ts queueAutoStart: round 6, Session 6A');
}

/** Step stage before `runNpcs` (locked call site in `sim/Step.ts`): drains the auto commands. No-op until 6A. */
export function runAuto(room: PartyRoom): void {
  const auto = simOf(room).auto;
  if (auto === null || auto.commands.length === 0) return;
  // 6A: apply each command (start through `startMatch`, reset through `resetToLobby`, clock through `clockOf`).
}
