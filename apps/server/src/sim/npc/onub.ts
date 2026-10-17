import type { PlayerState } from '@wdi/shared';
import type { PartyRoom } from '../../rooms/PartyRoom';
import type { PlayerSim } from '../RoomSim';
import type { Brain, NpcMemory } from './memory';
import { stand } from './walk';

/**
 * Quick mode NPC seats (GDD 3.11 "NPC seats", 3.12): called by `runNpcs` for every phase but the role card.
 * Session 5E owns this file and keeps its brain state in its own `WeakMap` here (prep, acts, claims, votes; no
 * walking). Stub until 5E lands: the seat stands still and does nothing.
 */
export function runOnubNpc(
  room: PartyRoom,
  mem: NpcMemory,
  brain: Brain,
  player: PlayerState,
  p: PlayerSim,
): void {
  void room;
  void mem;
  void brain;
  void player;
  stand(p);
}
